# Приём заявок с сайта в «Каналы трафика» → «Сайт»

Лендинги `autogentgroup.ru` и `autogent.ru` (оба — один и тот же процесс `agent-backend/gateway`
из репозитория `autogent-react`, `main.py`) пушат сюда заявки с контактом. Реализовано и задеплоено
(2026-09-08). Этот файл — теперь просто документация того, как это устроено, на случай следующих
правок.

## Два канала на один gateway

Один и тот же процесс gateway обслуживает оба лендинга (у каждого свой nginx-сайт с `proxy_pass`
на один и тот же `127.0.0.1:8000`). Чтобы заявки двух разных бизнесов не сливались в одну таблицу,
у каждого лендинга свой канал:

- `channel-website` («Сайт») — autogentgroup.ru, `WEBSITE_CHANNEL_ID` в `.env` gateway;
- `channel-website-furniture` («Сайт (мебель)») — autogent.ru, `WEBSITE_CHANNEL_ID_FURNITURE`.

Gateway выбирает канал в `_channel_for()` (`agent-backend/gateway/main.py`) по полю `source` в
данных лида: `"furniture"`/`"furniture-landing"` → мебельный канал, всё остальное → `channel-website`.
Если появится третий лендинг на этом же gateway — по аналогии: свой `TrafficChannel` в
`prisma/seed.ts`, своя переменная окружения, новая ветка в `_channel_for()`.

## Как это работает

1. Канал «Сайт» — `TrafficChannel` с фиксированным `id: "channel-website"`, тип **`WEBSITE`**
   (не `MANUAL`!). Виден в `/channels` наравне с MANUAL-каналами — список на этой странице
   специально включает оба типа (`app/(app)/channels/page.tsx`).
2. Gateway шлёт `POST /api/integrations/website/contacts` с `X-Api-Key: WEBSITE_API_KEY` —
   создаёт **`WebsiteContact`**, НЕ `Lead`. Идемпотентно: upsert по `(channelId, externalId)`,
   `externalId` = session_id с сайта.
3. Админам уходит Telegram-уведомление (`notifyNewWebsiteContact`) — заголовок «Новый лид с сайта»,
   название канала (`Канал: Сайт` / `Канал: Сайт (мебель)`) и ссылка на нужный `/channels/<id>`.
   Тело уведомления НЕ берёт `contact.title` напрямую: gateway кладёт туда имя человека, когда нет
   названия компании (короткая форма — только имя и телефон), так что `title` тоже потенциальное
   ПДн, а не безопасный ярлык. Шлётся один раз на новый `externalId` (не при апдейте существующего).
4. **В CRM-воронку (`Lead`) заявка попадает только вручную.** Сотрудник открывает
   `/channels/channel-website`, видит таблицу заявок (`WebsiteDashboard.tsx`) и жмёт «Создать
   сделку» (`convertWebsiteContactToLead`) или «Отказ» (`declineWebsiteContact`). Тот же принцип,
   что у `InstagramContact` → `convertInstagramContactToLead` — контакт и сделка разделены
   нарочно, автоматика не решает, что достойно попадания в воронку.

## Почему не как в первой версии этого файла

Первая версия (годная как история решения, не как инструкция) делала ровно наоборот — каждая
заявка с сайта сразу становилась `Lead` от лица сервисного `WEBSITE_AGENT_USER_ID`, то есть сразу
попадала в рабочую CRM-воронку `/crm`. Оказалось, что это неверно: у сайта нет своего сотрудника,
который квалифицирует контакт до того, как он станет сделкой (в отличие от B2B email/скаута, где
рассылка/переписка полностью автоматическая и лид оправданно заводится сразу). Заявки с формы
и чата на лендинге ближе по духу к Instagram-базе — их нужно разобрать глазами человека. Поэтому:

- сервисный `WEBSITE_AGENT_USER_ID` — убран из `lib/constants.ts` и сида, не нужен;
- канал — тип `WEBSITE`, а не `MANUAL` (у `MANUAL`-канала своей таблицы контактов нет, только
  `Lead` напрямую — не подошло бы для стадии «ещё не решили, сделка это или нет»);
- эндпоинт переименован `.../leads` → `.../contacts`, создаёт `WebsiteContact`;
- уведомление ведёт на `/channels/channel-website`, а не на `/crm?lead=`.

## Файлы

| Что | Где |
|---|---|
| Модель, enum `WebsiteContactStatus`, тип канала `WEBSITE` | `prisma/schema.prisma` |
| Миграция | `prisma/migrations/20260908000000_website_contacts/migration.sql` |
| Сид канала (фиксированный id) | `prisma/seed.ts` |
| Приём пуша от gateway | `app/api/integrations/website/contacts/route.ts` |
| Уведомление админам | `lib/notifications/websiteLead.ts` |
| Ручной перевод в сделку / отказ | `lib/actions/websiteContacts.ts` |
| Таблица заявок на странице канала | `app/(app)/channels/[id]/_components/WebsiteDashboard.tsx` |
| Список `/channels` (включает WEBSITE) | `app/(app)/channels/page.tsx`, `_components/ChannelsView.tsx` |
| Тесты | `tests/integration/websiteContactsApi.test.ts` |

`WEBSITE_API_KEY` — в `.env.production` рядом с `SCOUT_AGENT_API_KEY`/`INSTAGRAM_AGENT_API_KEY`.
Тот же ключ — в `.env` gateway на стороне `autogent-react` (`WEBSITE_API_KEY`,
`WEBSITE_CHANNEL_ID=channel-website`).
