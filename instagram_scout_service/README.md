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
jobs?status=pending`). Для каждого — парсит до `requestedCount` аккаунтов
по критериям сохранённого профиля поиска (aiograpi, один настоящий
Instagram-аккаунт, без прокси-ферм — см. `docs/pipeline/spikes/
FINDINGS.md` в основном репозитории), генерирует черновик оффера через
OpenAI на каждый найденный аккаунт, пушит результат (`POST .../contacts`)
и закрывает задание (`POST .../jobs/:id/complete`).

## Переменные окружения (`.env`, рядом с этим файлом, не коммитить)

| Переменная | Назначение |
|---|---|
| `CRM_API_URL` | базовый адрес CRM, например `https://crm.autogentgroup.ru` |
| `INSTAGRAM_AGENT_API_KEY` | тот же секрет, что в `.env.production` CRM |
| `OPENAI_API_KEY` | свой ключ, для черновиков офферов (не путать с ключом CRM) |
| `IG_USERNAME` / `IG_PASSWORD` | логин Instagram-аккаунта, с которого парсим |
| `IG_SESSION_PATH` | куда сохранять сессию aiograpi (по умолчанию `sessions/ig_session.json`) |
| `POLL_INTERVAL_SECONDS` | интервал опроса CRM, по умолчанию 30 |
| `REQUEST_PAUSE_SECONDS` | пауза между запросами к Instagram внутри одного задания, по умолчанию 3 |

## Локальный запуск

```bash
pip install -r requirements.txt
# создать .env с переменными из таблицы выше
python main.py
```

Первый запуск сам логинится в Instagram и сохраняет сессию в
`IG_SESSION_PATH` — дальше использует её, повторный логин не требуется,
пока сессия валидна.

## Docker

```bash
docker compose up -d --build
```

`sessions/` монтируется как volume — тот же принцип, что у
`telegram_sales_agent/sessions/`: сессия это стейт, не часть образа.

## Тесты

```bash
pip install -r requirements.txt
pytest
```

`scraper.py`/`offer_writer.py` не покрыты тестами, требующими реального
логина в Instagram/вызова OpenAI — это заведомо неполное тестовое покрытие,
задокументировано в `docs/pipeline/decisions.md` основного репозитория.
`crm_client.py` протестирован полностью (httpx замокан, без сети).
