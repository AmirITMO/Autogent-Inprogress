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
критериям сохранённого профиля поиска через Apify (`scraper.py`), в два
этапа (архитектура сверена по образцу стороннего instagram-lead-parser-v2 —
исходно оба этапа ошибочно смешивались в один):

1. **Дискавери — только юзернеймы.** `apify/instagram-hashtag-scraper` по
   keywords (отдаёт посты, не профили — оттуда берём только
   `ownerUsername`, отсекая лайки < 500 как дешёвый прокси на размер акка
   ДО похода в профиль) и `apify/instagram-search-scraper` по niche+city
   (свободный текстовый поиск пользователей) — параллельно.
2. **Обогащение — полные профили.** Найденные юзернеймы (за вычетом уже
   обработанных для этого канала ранее — см. `seen_store.py`) уходят в
   `apify/instagram-profile-scraper` батчами по 30, до 5 батчей
   параллельно — только тут появляются реальные bio/followers/category.

Дальше — фильтр по подписчикам, контакты достаются и структурными полями
Apify, и регексом из bio (телеграм/email/телефон — структурные поля
Instagram отдаёт редко), одним LLM-вызовом ранжируются все прошедшие
кандидаты по полным критериям (niche/city/excludeIf). Явно детектится
исчерпанная квота/баланс Apify по тексту ошибки (`ApifyQuotaExhausted`) —
вместо тихого "нашли 0" сервис сразу останавливается с понятным сообщением.
Свой Instagram-аккаунт для поиска не нужен — Apify исполняет запросы на
своей инфраструктуре. Дальше — как раньше: генерирует черновик оффера
через OpenAI на каждый найденный аккаунт, пушит результат
(`POST .../contacts`) и закрывает задание (`POST .../jobs/:id/complete`).

## Переменные окружения (`.env`, рядом с этим файлом, не коммитить)

| Переменная | Назначение |
|---|---|
| `CRM_API_URL` | базовый адрес CRM, например `https://crm.autogentgroup.ru` |
| `INSTAGRAM_AGENT_API_KEY` | тот же секрет, что в `.env.production` CRM |
| `OPENAI_API_KEY` | свой ключ, для ранжирования кандидатов и черновиков офферов (не путать с ключом CRM) |
| `APIFY_TOKEN` | токен Apify — обязателен, поиск полностью на нём. Акторы (`apify/instagram-hashtag-scraper`, `apify/instagram-search-scraper`, `apify/instagram-profile-scraper`) захардкожены в `scraper.py` — сверяй их input schema в Apify Store перед первым реальным запуском |
| `POLL_INTERVAL_SECONDS` | интервал опроса CRM, по умолчанию 30 |
| `SEEN_STORE_PATH` | куда сохранять уже обработанные юзернеймы по каналам (дедуп между запусками поиска), по умолчанию `data/seen_usernames.json` |

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

`scraper.py` покрыт тестами с замоканным Apify/OpenAI (без сети),
`seen_store.py` — реальным файловым I/O во временной директории —
`offer_writer.py` по-прежнему не покрыт (требует реального вызова OpenAI),
задокументировано в `docs/pipeline/decisions.md` основного репозитория.
`crm_client.py` протестирован полностью.
