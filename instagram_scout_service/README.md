# instagram_scout_service

Отдельный сервис, собирающий базу Instagram-аккаунтов по заданиям из CRM
(Autogent Platform, раздел «Каналы трафика» → Instagram). Не пишет
сообщения сам — только парсит публичные данные и генерирует черновик
оффера на каждый аккаунт, отправку делает сотрудник вручную из CRM.

Архитектура и контракты — `docs/pipeline/` в корне основного репозитория
(brief.md, contracts.md, spikes/FINDINGS.md).

## Как работает

Раз в `POLL_INTERVAL_SECONDS` (по умолчанию 30с) сервис спрашивает CRM
про задания в статусе `PENDING` (`GET /api/integrations/instagram-agent/
jobs?status=pending`). Для каждого — ищет до `requestedCount` аккаунтов по
критериям сохранённого профиля поиска через Apify (`scraper.py`):
одновременно по хэштегам и по свободному текстовому поиску (ниша+гео), затем
одним LLM-вызовом ранжирует всех кандидатов по полным критериям
(niche/city/excludeIf/followers). Свой Instagram-аккаунт для поиска не
нужен — раньше (aiograpi) поиск шёл только по хэштегам через реальный
залогиненный аккаунт, что и уже, и рискованно для аккаунта (приватный API
не по ToS Instagram — см. `docs/pipeline/spikes/FINDINGS.md` в основном
репозитории); Apify исполняет запросы на своей инфраструктуре. Дальше — как
раньше: генерирует черновик оффера через OpenAI на каждый найденный
аккаунт, пушит результат (`POST .../contacts`) и закрывает задание
(`POST .../jobs/:id/complete`).

## Переменные окружения (`.env`, рядом с этим файлом, не коммитить)

| Переменная | Назначение |
|---|---|
| `CRM_API_URL` | базовый адрес CRM, например `https://crm.autogentgroup.ru` |
| `INSTAGRAM_AGENT_API_KEY` | тот же секрет, что в `.env.production` CRM |
| `OPENAI_API_KEY` | свой ключ, для ранжирования кандидатов и черновиков офферов (не путать с ключом CRM) |
| `APIFY_TOKEN` | токен Apify — обязателен, поиск полностью на нём |
| `APIFY_INSTAGRAM_ACTOR` | id актора Apify для поиска, по умолчанию `apify/instagram-scraper` — сверяй input schema с Input tab в Apify Store при смене |
| `POLL_INTERVAL_SECONDS` | интервал опроса CRM, по умолчанию 30 |

## Локальный запуск

```bash
pip install -r requirements.txt
# создать .env с переменными из таблицы выше
python main.py
```

## Docker

```bash
docker compose up -d --build
```

## Тесты

```bash
pip install -r requirements.txt
pytest
```

`scraper.py` покрыт тестами с замоканным Apify/OpenAI (без сети) —
`offer_writer.py` по-прежнему не покрыт (требует реального вызова OpenAI),
задокументировано в `docs/pipeline/decisions.md` основного репозитория.
`crm_client.py` протестирован полностью.
