# Contracts

Формы, без реализации. Ошибки везде — `{ "error": string }`, JSON,
статусы `400`/`401`, тот же паттерн, что у scout-agent эндпоинтов.

## Prisma-модели (CRM)

```prisma
model InstagramSearchProfile {
  id          String   @id @default(cuid())
  channelId   String
  channel     TrafficChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  name        String              // человекочитаемое имя профиля, для кнопки "искать снова"
  criteria    Json                // структурированные критерии из диалога (5 вопросов)
  createdAt   DateTime @default(now())

  jobs InstagramScrapeJob[]

  @@index([channelId])
}

enum InstagramJobStatus {
  PENDING
  IN_PROGRESS
  DONE
  FAILED
}

model InstagramScrapeJob {
  id              String                @id @default(cuid())
  channelId       String
  channel         TrafficChannel        @relation(fields: [channelId], references: [id], onDelete: Cascade)
  searchProfileId String
  searchProfile   InstagramSearchProfile @relation(fields: [searchProfileId], references: [id], onDelete: Cascade)
  requestedCount  Int                   // N, валидируется < 50 на сервере
  status          InstagramJobStatus    @default(PENDING)
  foundCount      Int                   @default(0)
  errorMessage    String?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@index([channelId, status])
}
```

`InstagramContact` — добавить поле:
```prisma
draftMessage String?   // черновик оффера, генерит агент, не CRM
```

## CRM API — со стороны Instagram-сервиса (X-Api-Key: INSTAGRAM_AGENT_API_KEY)

### GET /api/integrations/instagram-agent/jobs?status=pending
Ответ 200:
```json
{
  "jobs": [
    {
      "id": "job_...",
      "channelId": "channel_...",
      "requestedCount": 30,
      "searchProfile": { "id": "profile_...", "name": "...", "criteria": { /* произвольная структура из диалога */ } }
    }
  ]
}
```
Без параметра `status` — 400. Пустой список — валидный ответ `{ "jobs": [] }`, не 404.

### POST /api/integrations/instagram-agent/jobs/:id/complete
Тело: `{ "foundCount": number, "errorMessage"?: string }`.
Если `errorMessage` присутствует — статус джоба `FAILED`, иначе `DONE`.
404 — если джоба с таким id нет. Идемпотентно: повторный вызов на уже
завершённый джоб просто перезаписывает `foundCount`/`status` (ретраи от
сервиса не должны падать ошибкой).

### POST /api/integrations/instagram-agent/contacts (расширение существующего)
Добавлено необязательное поле `draftMessage: string` в тело — остальной
контракт не меняется (см. текущую реализацию).

## CRM API — со стороны b2b-email-agent

### GET /api/integrations/b2b-email-agent/knowledge-base?channelId=...
Идентично `GET .../scout-agent/knowledge-base`, тот же `AgentKnowledgeBase`
по `channelId`, только другой `X-Api-Key` (`B2B_EMAIL_AGENT_API_KEY`).

## CRM server actions (внутренние, "use server")

```ts
// lib/actions/instagramSearch.ts
sendSearchSetupMessage(channelId: string, userMessage: string):
  Promise<{ reply: string; profileSaved: boolean; jobCreated: boolean }>
// Отдельный чат-режим от sendManagementMessage — свой tool save_search_profile
// вместо update_knowledge_base. По завершении интервью (LLM решает, что
// достаточно данных) вызывает второй tool create_scrape_job { count } —
// создаёт InstagramSearchProfile + InstagramScrapeJob(status=PENDING).
// count > 50 или <= 0 — CRM возвращает ошибку до вызова tool, не полагается
// на LLM.

rerunSearchProfile(profileId: string, count: number): Promise<{ jobId: string }>
// Кнопка "искать по этому профилю снова" — создаёт новый job без диалога.
```

## Python-сервис instagram_scout_service/ (новый, отдельный)

```python
# config.py
@dataclass
class Config:
    crm_api_url: str        # CRM_API_URL
    crm_api_key: str        # INSTAGRAM_AGENT_API_KEY
    openai_api_key: str     # OPENAI_API_KEY (свой, не путать с CRM-стороной)
    ig_username: str        # IG_USERNAME
    ig_password: str        # IG_PASSWORD (только для первого логина, дальше сессия на диске)
    poll_interval_seconds: int = 30

# crm_client.py
async def get_pending_jobs(cfg: Config) -> list[ScrapeJob]: ...
async def push_contact(cfg: Config, channel_id: str, external_id: str, *, username: str,
                        draft_message: str, **fields) -> None: ...
async def complete_job(cfg: Config, job_id: str, *, found_count: int, error: str | None = None) -> None: ...

# scraper.py (aiograpi)
async def search_accounts(criteria: dict, limit: int) -> list[AccountData]: ...
# AccountData: username, full_name, bio, category, followers, contact_info

# offer_writer.py
async def draft_offer(criteria: dict, account: AccountData, cfg: Config) -> str: ...
# один вызов OpenAI на аккаунт, возвращает готовый текст черновика

# main.py — цикл: раз в poll_interval_seconds -> get_pending_jobs -> для
# каждого: search_accounts -> для каждого найденного: draft_offer ->
# push_contact -> complete_job
```

## Переменные окружения (имена, не значения)

| Где | Переменная | Назначение |
|---|---|---|
| CRM | `OPENAI_API_KEY` | уже есть (Управление-чат скаута), переиспользуется |
| CRM | `INSTAGRAM_AGENT_API_KEY` | уже есть |
| CRM | `B2B_EMAIL_AGENT_API_KEY` | уже есть |
| instagram_scout_service | `CRM_API_URL` | базовый адрес CRM |
| instagram_scout_service | `INSTAGRAM_AGENT_API_KEY` | тот же секрет, что и в CRM |
| instagram_scout_service | `OPENAI_API_KEY` | свой, для черновиков офферов |
| instagram_scout_service | `IG_USERNAME` / `IG_PASSWORD` | логин Instagram-аккаунта (разово, дальше сессия) |

`.env.example` для нового сервиса — без значений, только имена (см. таблицу).
`.gitignore` нового сервиса — сразу с `.env`, `*.session`/сессионные файлы
aiograpi (по аналогии с `telegram_sales_agent/.gitignore`).
