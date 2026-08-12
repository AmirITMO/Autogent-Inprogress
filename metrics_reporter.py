"""
Раз в cfg.crm_metrics_interval_seconds собирает снимок метрик агента
(событийные счётчики + дневные лимиты по аккаунтам пула) и отправляет в
CRM push-ом (crm_integration.push_metrics). См. crm_integration.py — почему
push, а не pull.
"""

import asyncio
import logging
from datetime import datetime

import storage
from config import AppConfig
from crm_integration import push_metrics
from manager_pool import ManagerPool

logger = logging.getLogger(__name__)

COUNTER_NAMES = ["messages_scanned", "triggers_found", "outbound_sent"]


async def run_metrics_reporter(pool: ManagerPool, cfg: AppConfig) -> None:
    if not cfg.crm_api_url:
        return  # интеграция выключена — не тратим цикл впустую

    while True:
        await asyncio.sleep(cfg.crm_metrics_interval_seconds)
        try:
            loop = asyncio.get_event_loop()
            counters = await loop.run_in_executor(
                None, storage.snapshot_and_reset_counters, cfg.sqlite_path, COUNTER_NAMES
            )
            accounts = [
                {
                    "name": name,
                    "sentToday": await loop.run_in_executor(
                        None, storage.outbound_count_today, cfg.sqlite_path, name
                    ),
                    "dailyLimit": cfg.max_outbound_per_account_per_day,
                }
                for name in pool.account_names()
            ]
            snapshot = {
                "timestamp": datetime.now().isoformat(),
                "messagesScanned": counters["messages_scanned"],
                "triggersFound": counters["triggers_found"],
                "outboundSent": counters["outbound_sent"],
                "accounts": accounts,
            }
            await push_metrics(cfg, snapshot)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Ошибка при формировании/отправке снимка метрик в CRM")
