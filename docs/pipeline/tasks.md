# Tasks

Порядок — порядок выполнения.

## [x] T-01 — Схема: InstagramSearchProfile/InstagramScrapeJob + draftMessage
DoD подтверждён: `prisma validate` прошёл, миграция `20260815090000_instagram_search_jobs`
накатилась на тестовую БД без ошибок.

## [x] T-02 — b2b-email-agent/knowledge-base (зеркало scout-agent)
DoD подтверждён: `b2bEmailKnowledgeBaseApi.test.ts` — 4/4 зелёных, эндпоинт
в списке роутов `next build`.

## [x] T-03 — B2bEmailDashboard: вкладки Управление/Аналитика/Подробности
DoD подтверждён: структура идентична `ScoutAgentDashboard.tsx`, typecheck+build чистые.

## [x] T-04 — API очереди заданий Instagram
DoD подтверждён: `instagramJobsApi.test.ts` — 12/12 зелёных (валидация,
401/400/404, идемпотентность complete).

## [x] T-05 — Server actions: диалог настройки поиска + запуск джоба
DoD подтверждён: `instagramSearch.test.ts` — 4/4 зелёных, включая тест на
защиту от count вне диапазона независимо от того, что вернула модель.

## [x] T-06 — UI: кнопка «Спарсить N», диалог, профили поиска, черновик в таблице
DoD подтверждён: typecheck+build чистые, ESLint чистый; ручной прогон —
см. T-09 (реальный HTTP через дев-сервер).

## [x] T-07 — Python-сервис instagram_scout_service/ (skeleton + config + crm_client)
DoD **превышен**: не просто `py_compile` — реально `pip install`, реальный
`import`, и `pytest` прогнан по-настоящему: 6/6 зелёных на `crm_client.py`
(httpx замокан, без сети).

## [x] T-08 — scraper.py (aiograpi) + offer_writer.py (OpenAI)
DoD частично: код готов, реально импортируется (`aiograpi`/`openai`
установлены и импорт проверен), но **не прогонялся против живого
Instagram-аккаунта/реального OpenAI** — нет учётных данных в этой сессии.
Зафиксировано как дефект в `decisions.md`, не скрыто.

## [x] T-09 — Vertical slice: CRM-часть end-to-end живьём
DoD подтверждён по-настоящему: поднят `npm run dev` на тестовой БД, реальными
`curl`-запросами пройден весь путь — `GET jobs?status=PENDING` (нашёл
задание) → `POST contacts` с `draftMessage` → `POST jobs/:id/complete` →
повторный `GET jobs?status=PENDING` пуст → прямой запрос к БД подтвердил
`contact.draftMessage` и `job.status=DONE`. Сервер остановлен, временные
скрипты удалены.

## [x] T-10 — Аудит свежим контекстом
Готово — см. `docs/pipeline/audit.md`. Вердикт NEEDS_FIXES → критичный и
5 важных пунктов исправлены и перепроверены (156/156 тестов, typecheck,
build). Остальное — backlog ниже.

---

## Backlog (найдено аудитом, не блокирует, не сделано в этой сессии)

## [ ] T-11 — Добавить новые переменные в `.env.production.example`
`OPENAI_API_KEY`, `SCOUT_AGENT_API_KEY`, `INSTAGRAM_AGENT_API_KEY`,
`B2B_EMAIL_AGENT_API_KEY` — сейчас их там нет, на проде отсутствующий
секрет неотличим от неверного (везде 401).

## [ ] T-12 — Показать статус/ошибку Instagram-джобов в UI
Сейчас `InstagramDashboard.tsx` не показывает вообще ничего про очередь
заданий — упавший (FAILED) джоб выглядит как «ничего не произошло».

## [ ] T-13 — Тесты на `sendManagementMessage` и `computeChannelFinancials`-потребителей
`computeChannelFinancials` уже покрыт (`tests/unit/channelFinancials.test.ts`).
Не покрыт: `lib/actions/agentKnowledgeBase.ts` (`sendManagementMessage`) —
общий чат-редактор базы знаний для скаута и email-канала, замокать fetch
к OpenAI по образцу `instagramSearch.test.ts`.

## [ ] T-14 — Тесты на `instagram_scout_service/main.py` (process_job) и валидация scraper.py
`crm_client.py` покрыт (6/6), `main.py`/`scraper.py`/`offer_writer.py` — нет.
Плюс: реальный прогон против живого Instagram-аккаунта и реального OpenAI
не выполнялся — нет учётных данных.

## [ ] T-15 — `sendSearchSetupMessage`: обратная связь после `rerunSearchProfile`, показ `criteria` в UI
`InstagramSearchLauncher.tsx` не показывает содержимое сохранённого
профиля и не даёт обратной связи после повторного запуска поиска по
кнопке ↻ (кроме alert на ошибку).
