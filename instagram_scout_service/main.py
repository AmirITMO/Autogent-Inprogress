"""Точка входа: раз в poll_interval_seconds спрашивает CRM про PENDING-
задания, для каждого парсит аккаунты, генерит черновик оффера на каждый и
пушит результат обратно, закрывает задание."""

import asyncio
import logging

import crm_client
from config import Config, require_complete
from offer_writer import draft_offer
from scraper import search_accounts

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def process_job(cfg: Config, job: crm_client.ScrapeJob) -> None:
    logger.info("Обрабатываю задание %s (%s, до %d аккаунтов)", job.id, job.search_profile.name, job.requested_count)
    try:
        accounts = await search_accounts(cfg, job.search_profile.criteria, job.requested_count)
    except Exception as e:
        logger.exception("Парсинг задания %s упал", job.id)
        await crm_client.complete_job(cfg, job.id, found_count=0, error=str(e))
        return

    found = 0
    errors = 0
    last_error: str | None = None
    for account in accounts:
        try:
            draft = await draft_offer(cfg, job.search_profile.criteria, account)
            await crm_client.push_contact(
                cfg,
                job.channel_id,
                external_id=account.external_id,
                username=account.username,
                draft_message=draft,
                full_name=account.full_name,
                bio=account.bio,
                category=account.category,
                followers=account.followers,
                contact_info=account.contact_info,
                source_tag=job.search_profile.name,
            )
            found += 1
        except Exception as e:
            errors += 1
            last_error = str(e)
            logger.exception("Не удалось обработать аккаунт @%s в задании %s", account.username, job.id)

    if found == 0 and errors > 0:
        # Иначе "все N попыток упали" выглядит для CRM неотличимо от "честно
        # нашли 0 подходящих аккаунтов" — оба варианта дают found_count=0.
        await crm_client.complete_job(
            cfg, job.id, found_count=0,
            error=f"Все {errors} найденных аккаунтов не удалось обработать (последняя ошибка: {last_error})",
        )
    else:
        await crm_client.complete_job(cfg, job.id, found_count=found)
    logger.info("Задание %s завершено: найдено %d из %d запрошенных", job.id, found, job.requested_count)


async def poll_loop(cfg: Config) -> None:
    while True:
        try:
            jobs = await crm_client.get_pending_jobs(cfg)
            for job in jobs:
                await process_job(cfg, job)
        except Exception:
            logger.exception("Ошибка в цикле опроса CRM")
        await asyncio.sleep(cfg.poll_interval_seconds)


def main() -> None:
    cfg = Config()
    require_complete(cfg)
    logger.info("Instagram scout service стартует, опрос CRM каждые %d сек", cfg.poll_interval_seconds)
    asyncio.run(poll_loop(cfg))


if __name__ == "__main__":
    main()
