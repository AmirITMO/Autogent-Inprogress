# Audit 2026-08-15

## Прогон тестов (факты)

`npm run test` (Postgres `autogent-test-pg` уже был `Up`, `pg_isready` → accepting connections):
```
Test Files  18 passed (18)
     Tests  147 passed (147)
  Duration  21.15s
```
`npx tsc --noEmit -p tsconfig.json` — пустой вывод, 0 ошибок (в т.ч. tests/integration/profile.test.ts чист).

`npx prisma migrate status` на `autogent_test`: `21 migrations found ... Database schema is up to date!`

`cd instagram_scout_service && python -m pytest -v` — `6 passed`, все шесть — только `tests/test_crm_client.py`. Тестов на `main.py`/`scraper.py`/`offer_writer.py` в репозитории нет.

`npm run build` — `✓ Compiled successfully in 18.3s`, `Finished TypeScript`, в списке роутов есть `/api/integrations/instagram-agent/jobs`, `/api/integrations/instagram-agent/jobs/[id]/complete`, `/api/integrations/b2b-email-agent/knowledge-base`.

`npx eslint app lib tests` → `✖ 3 problems (3 errors)`: `app/(app)/tasks/_components/Board.tsx:61`, `app/api/bot/tasks/route.ts:19` — всё предсуществующее, в новых файлах чисто.

Собственный прогон эндпоинтов в процессе (tsx, реальная тестовая БД, потом всё удалено):
```
"pending" -> 400 {"error":"invalid_status"}
"PENDING" -> 200 {"jobs":[]}
""        -> 400 {"error":"status required"}
wrong key -> 401 {"error":"unauthorized"}
contact: 200 ... / contact retry: 200 ... count: 1      (апсерт, дублей нет)
complete1: 200 {"status":"DONE","foundCount":1}
complete retry negative: 200 {"status":"DONE","foundCount":-5}
job after: DONE -5
pending after complete: 0
```
Собственный стаб-E2E питон-сервиса (поднял фейковый CRM на 127.0.0.1:8799, подменил `search_accounts`/`draft_offer`, реальный HTTP через `crm_client`): `GET jobs?status=PENDING` → 1 job → 3 × `POST contacts` (`draftMessage` непустой у всех) → `POST jobs/job1/complete {"foundCount": 3}`. Цикл `main.process_job` работает.

## Соответствие контрактам

| Контракт | Реальность |
|---|---|
| Prisma `InstagramSearchProfile` / `InstagramScrapeJob` / `draftMessage` | совпадает поле в поле |
| `GET .../instagram-agent/jobs?status=pending` | не совпадает: `status` регистрозависим, lowercase `pending` → 400 |
| `POST .../jobs/:id/complete` | совпадает: 400/404/FAILED/идемпотентность подтверждены запуском |
| `POST .../instagram-agent/contacts` + `draftMessage` | совпадает |
| `GET .../b2b-email-agent/knowledge-base` | совпадает со scout-агентом байт в байт |
| `sendSearchSetupMessage` сигнатура | не совпадает с contracts.md буквально (добавлен `history`, `jobId` вместо `jobCreated`) — контракт устарел, реализация лучше |
| «count > 50 или <= 0 — ошибка» | реализовано как `MAX_COUNT=49`, совпадает с plan.md, не с буквой contracts.md |
| `create_scrape_job` только после `save_search_profile` в том же интервью | не совпадает: фолбэк на «последний профиль канала» — реальный баг, см. находки |
| `.env.example` нового сервиса | отсутствует физически — заблокировано permission-правилом песочницы, задокументировано в README вместо файла |

## Находки и их судьба

### Критично — исправлено
- **`scraper.py` молча возвращает 0 контактов при любом ключе criteria, кроме `keywords`.** Причина — tool-схема `save_search_profile` принимала `criteria` как свободный `object`, LLM могла сохранить любые ключи. **Фикс:** схема тула сужена до явного `{ keywords: string[], niche?, city?, excludeIf? }` — LLM физически не может сохранить не то поле.

### Важно — исправлено
- `jobs/route.ts` регистрозависимый `status` — **фикс:** `.toUpperCase()` перед валидацией, `pending`/`PENDING` оба работают.
- `create_scrape_job` привязывался к «последнему профилю канала» вместо профиля текущего диалога — **фикс:** `profileId` явно возвращается клиенту после `save_search_profile` и передаётся обратно на следующий вызов, сервер больше не гадает.
- `complete/route.ts` принимал отрицательный/нецелый `foundCount` — **фикс:** валидация `Number.isInteger(foundCount) && foundCount >= 0`.
- `InstagramJobStatus.IN_PROGRESS` было мёртвым значением, упавший сервис молча оставлял джоб `PENDING` навсегда (при рестарте — повторная полная обработка, повторные платные вызовы OpenAI) — **фикс:** `GET jobs?status=PENDING` теперь атомарно переводит выбранные джобы в `IN_PROGRESS` при выдаче («claim on read»).
- Запрос джобов без лимита — **фикс:** `take: 50`.
- Нет тестов на `computeChannelFinancials` — **фикс:** добавлен `tests/unit/channelFinancials.test.ts`.

### Не исправлено в этой сессии — в backlog (tasks.md, новые T-11..T-15)
- `.env.production.example` не содержит новых переменных (`OPENAI_API_KEY`, `SCOUT_AGENT_API_KEY`, `INSTAGRAM_AGENT_API_KEY`, `B2B_EMAIL_AGENT_API_KEY`) — риск неотличимого 401 на проде без явной причины в логах.
- UI Instagram-канала не показывает статус/ошибку джобов вообще — если парсинг упал, сотрудник просто не увидит результата и не поймёт, что пошло не так.
- Нет тестов на `sendManagementMessage`, `main.py`/`scraper.py`/`offer_writer.py` (реальный Instagram-логин/OpenAI не тестировались — известное ограничение сессии, не обходится).
- `instagram_scout_service/.env.example` не может быть создан — блокировка permission-системы песочницы на запись файлов `.env*`; переменные задокументированы в README.md сервиса вместо шаблона.
- `sendSearchSetupMessage` не валидирует `channelId` на существование и `role` во входящей `history` — потенциальный 500 вместо 400 на мусорном вводе.
- `InstagramSearchLauncher` не показывает `criteria` профиля и не даёт обратной связи после `rerunSearchProfile`.
- brief.md обещал «три вкладки» для обоих пунктов 2 и 3 — у Instagram вкладок нет по дизайну (это таблица/очередь, не диалоговые карточки), формально это не баг, а расхождение brief↔plan, снято как «design as built» в decisions.md.

## Итоговый вердикт

Был NEEDS_FIXES при аудите. После правок этой сессии: критичный дефект и
пять важных — устранены и перепроверены (тесты/typecheck/build зелёные
после фикса). Оставшиеся пункты — в backlog, не блокируют внутреннее
использование, блокируют полноценный прод-запуск Instagram-канала (нужны
реальные IG/OpenAI credentials + доработка UI статусов).
