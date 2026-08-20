"""Точка входа: раз в poll_interval_seconds спрашивает CRM про PENDING
задания (`GET /api/integrations/b2b-email-agent/jobs?status=pending`). Для
каждого — читает критерии из базы знаний канала, ищет компании через Apify,
парсит их сайты, составляет черновик письма на каждую подходящую и пушит
результат (`POST .../contacts`). Отправку делает сотрудник вручную из CRM
после одобрения — сервис никогда не отправляет письма сам."""

import asyncio
import logging

import crm_client
from config import Config, require_complete
from offer_writer import draft_email
from scraper import build_search_queries, crawl_site, discover_candidate_domains, extract_company

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def process_job(cfg: Config, job: crm_client.SearchJob) -> None:
    logger.info("Обрабатываю задание %s (канал %s, до %d компаний)", job.id, job.channel_id, job.requested_count)

    try:
        kb_text = await crm_client.get_knowledge_base(cfg, job.channel_id)
        queries = await build_search_queries(cfg, kb_text)
        if not queries:
            await crm_client.complete_job(
                cfg, job.id, found_count=0,
                error="В базе знаний канала нет описания целевого клиента — сначала пройдите интервью в разделе «Управление»",
            )
            return
        domains = await discover_candidate_domains(cfg, queries, limit_per_query=max(job.requested_count, 10))
    except Exception as e:
        logger.exception("Задание %s упало на этапе поиска", job.id)
        await crm_client.complete_job(cfg, job.id, found_count=0, error=str(e))
        return

    found = 0
    errors = 0
    last_error: str | None = None
    for domain in domains[: cfg.max_domains_per_job]:
        if found >= job.requested_count:
            break
        try:
            markdown = await crawl_site(cfg, domain)
            if not markdown:
                continue
            company = await extract_company(cfg, kb_text, domain, markdown)
            if not company or not company.matches:
                continue
            draft = await draft_email(cfg, kb_text, company)
            await crm_client.push_contact(
                cfg,
                job.channel_id,
                external_id=domain,
                company_name=company.company_name,
                website=f"https://{domain}",
                contact_email=company.contact_email,
                trigger_reason=company.reasoning,
                draft_message=draft,
            )
            found += 1
        except Exception as e:
            errors += 1
            last_error = str(e)
            logger.exception("Не удалось обработать сайт %s в задании %s", domain, job.id)

    if found == 0 and errors > 0:
        # Иначе "все проверенные сайты упали" неотличимо от "честно не нашли
        # подходящих компаний" — оба варианта дают found_count=0.
        await crm_client.complete_job(
            cfg, job.id, found_count=0,
            error=f"Все {errors} проверенных сайтов не удалось обработать (последняя ошибка: {last_error})",
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
    logger.info("B2B email-агент стартует, опрос CRM каждые %d сек", cfg.poll_interval_seconds)
    asyncio.run(poll_loop(cfg))


if __name__ == "__main__":
    main()
