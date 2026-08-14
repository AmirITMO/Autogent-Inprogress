"""
Проактивная рассылка первым сообщением — теперь работает не по отдельным
колонкам "Leads", а по единой базе профилей (profile_store.py), которую
наполняет агент-скаут из групп. Берёт профили со статусом "new" и
открывает диалог с учётом всего, что уже известно о человеке.

Использует пул из N юзербот-аккаунтов, уважает рабочие часы и дневной
лимит на аккаунт, закрепляет лида за одним и тем же "менеджером" на
будущее (через storage.ensure_assignment), чтобы дальнейшую переписку
подхватил reactive_handler.py.
"""

import asyncio
import logging
from datetime import datetime

import profile_store
import storage
from config import AppConfig
from crm_integration import push_contact, STATUS_WRITTEN
from working_hours import is_working_hours
from agent import generate_opening_message
from manager_pool import ManagerPool

logger = logging.getLogger(__name__)


async def broadcast_to_leads(pool: ManagerPool, cfg: AppConfig, profiles_sheet, limit: int = 100):
    if not is_working_hours(cfg.working_hours):
        logger.info("[Рассылка] Вне рабочих часов — рассылка не запускается.")
        return {"sent": 0, "skipped": 0, "failed": 0, "reason": "off_hours"}

    loop = asyncio.get_event_loop()
    candidates = await loop.run_in_executor(None, profile_store.new_leads, profiles_sheet, limit)

    results = {"sent": 0, "skipped": 0, "failed": 0}

    for profile in candidates:
        user_id = profile["user_id"]

        account_name = pool.account_with_capacity()
        if account_name is None:
            logger.warning("[Рассылка] У всех аккаунтов исчерпан дневной лимит исходящих — стоп.")
            break

        client = pool.client_for_account(account_name)

        try:
            entity = await client.get_entity(int(user_id))

            # Закрепляем лида именно за этим аккаунтом — вся дальнейшая
            # переписка (reactive_handler) продолжится тем же "менеджером".
            storage.ensure_assignment(cfg.sqlite_path, user_id, account_name)

            persona = pool.persona_for_account(account_name)
            message_text = await loop.run_in_executor(
                None, generate_opening_message, persona, profile, cfg
            )

            await client.send_message(entity, message_text)
            storage.save_message(cfg.sqlite_path, user_id, account_name, role="manager", content=message_text)
            storage.increment_outbound(cfg.sqlite_path, account_name)
            storage.increment_counter(cfg.sqlite_path, "outbound_sent")

            await loop.run_in_executor(
                None, profile_store.set_status, profiles_sheet, user_id,
                profile_store.STATUS_CONTACTED, account_name,
            )

            await push_contact(
                cfg,
                external_id=user_id,
                status=STATUS_WRITTEN,
                dialogue=[{"from": "scout", "text": message_text, "at": datetime.now().isoformat()}],
                name=profile.get("display_name") or None,
                telegram_username=profile.get("username") or None,
                source_chat_name=profile.get("source_group") or None,
                trigger_message=profile.get("raw_last_message") or None,
                trigger_reason=profile.get("problem") or profile.get("niche_info") or None,
                outreach_account=account_name,
            )

            results["sent"] += 1
            logger.info("[%s] Открывающее сообщение %s (%s): %s...",
                        account_name, user_id, profile.get("username") or profile.get("display_name"),
                        message_text[:80])

        except Exception:
            results["failed"] += 1
            logger.exception("[Рассылка] Ошибка отправки лиду %s", user_id)

        await asyncio.sleep(cfg.delay_between_outbound_seconds)

    return results
