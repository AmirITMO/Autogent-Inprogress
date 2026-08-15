# State

**Проект:** Autogent Platform — раздел «Каналы трафика», пункты 2 и 3
(Instagram-база + B2B email-аутрич), по аналогии с уже построенным
пунктом 1 (ИИ-скаут).

**Текущая стадия:** 9 — feedback, завершена. Готово к 10 (release) по
желанию пользователя, либо к новому кругу с T-11..T-15 из backlog.
**Тип проекта:** brownfield.

## Ворота

| Стадия | Статус |
|---|---|
| 0 context load | done |
| 1 idea | done — `brief.md` |
| 2 plan + criteria | done — `plan.md` |
| 3 risk spikes | done — `spikes/FINDINGS.md` |
| 4 contracts | done — `contracts.md` (часть сигнатур обновилась в реализации, см. decisions.md) |
| 5 vertical slice | done для CRM-части (T-09, реальный E2E); Instagram-логин/OpenAI вживую — не выполнялся, нет credentials |
| 6 tasks | done — `tasks.md` |
| 7 implementation | done — T-01..T-09 |
| 8 audit | done — `audit.md`, вердикт NEEDS_FIXES → критичный + 5 важных дефектов исправлены |
| 9 feedback | done — `decisions.md`, backlog T-11..T-15 |
| 10 release | не начата — не запрошена пользователем |

## Финальные цифры
- 156/156 тестов (JS/TS), 6/6 pytest (Python-сервис)
- typecheck/ESLint/build — чистые
- Ничего не закоммичено — коммитим только по явной команде

## Что сделать перед реальным прод-запуском Instagram-канала
1. Реальные IG_USERNAME/IG_PASSWORD + OPENAI_API_KEY для instagram_scout_service
2. T-11 (секреты в `.env.production.example`)
3. T-12 (видимость статуса джобов в UI) — иначе тихие сбои
