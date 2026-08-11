# telegram_sales_agent

Прототип "ИИ-менеджеров по продажам" в Telegram: юзербот-пул слушает
рабочие группы (`scout_agent.py`), ведёт профили продавцов в Google
Sheets/локальном JSON (`profile_store.py` / `local_sheet.py`), отвечает
лидам в личку с учётом истории и RAG-поиска по базе знаний
(`reactive_handler.py`, `agent.py`, `knowledge_base.py`), досылает ответы
вне рабочих часов (`queue_worker.py`) и умеет проактивную рассылку
(`outreach_broadcast.py`).

## Локальный запуск (без Docker)

1. `pip install -r requirements.txt`
2. Скопируйте `.env.example` → `.env`, заполните реальными значениями
   (`OPENAI_API_KEY`, `TG_API_ID_1`/`TG_API_HASH_1` и т.д.). `.env` не
   должен попасть в git — уже в `.gitignore`.
3. Авторизуйте аккаунт(ы)-менеджеры: `python create_session.py` (интерактивно
   спросит номер телефона / код / пароль 2FA, сохранит `.session` в `sessions/`).
   **Это разовый шаг, требующий интерактивного терминала — не запускается в
   контейнере** (см. раздел про Docker ниже).
4. `python main.py`. Если рядом нет `service_account.json` (Google Sheets),
   автоматически используется `local_sheet.py` — профили лежат в
   `profiles_local.json` на диске.
5. Опционально — панель управления: `pip install streamlit`,
   `streamlit run app_streamlit.py`.

При старте `main.py` проверяет обязательные переменные окружения
(`OPENAI_API_KEY`, `TG_API_ID_*`/`TG_API_HASH_*` хотя бы одного аккаунта) и
падает сразу с понятным сообщением, если чего-то не хватает — вместо
невнятного traceback на первом сообщении от лида.

## Docker

**Важно:** `create_session.py` — интерактивный скрипт (номер телефона, код
из SMS, пароль 2FA вводятся в консоли). Он **не предназначен для запуска в
контейнере**. Порядок действий:

1. Локально (не в Docker) один раз на каждый новый аккаунт-менеджер:
   `python create_session.py` → получаете файл `sessions/<имя>.session`.
2. Заполните `.env` (см. `.env.example`) рядом с `Dockerfile`.
3. Соберите и поднимите контейнер:

   ```bash
   docker compose up -d --build
   ```

`.session`-файлы и `.env` — это стейт, а не часть образа: они монтируются
как volume (`docker-compose.yml`), а не копируются в образ на этапе сборки
(`.dockerignore` явно их исключает). Если вы добавляете новый аккаунт в
`config.py -> managers` уже после первого деплоя — заново прогоните
`create_session.py` локально и перезапустите контейнер (`docker compose up -d`).

### Volume-ы (см. `docker-compose.yml`)

| Путь на хосте            | Путь в контейнере         | Что это                                   |
|---------------------------|----------------------------|--------------------------------------------|
| `./sessions/`              | `/app/sessions`            | Telethon `.session` файлы (стейт)          |
| `./sales_agent.db`         | `/app/sales_agent.db`      | SQLite: история/очередь/лимиты (стейт)     |
| `./kb_index.json`          | `/app/kb_index.json`       | Кэш эмбеддингов базы знаний (можно пересоздать) |
| `.env` (через `env_file`)  | —                           | Секреты: ключи OpenAI/OpenRouter, api_id/hash |
| `./service_account.json`   | `/app/service_account.json`| Google Sheets в проде (опционально)        |

Перед первым `docker compose up` создайте пустые файлы, если их ещё нет
(иначе Docker может смонтировать путь как директорию):

```bash
touch sales_agent.db kb_index.json
```

### Graceful shutdown

`docker compose stop` / `docker stop` шлёт `SIGTERM` — `main.py` перехватывает
его (и `SIGINT`), останавливает всех клиентов пула (`pool.stop_all()`) и
только потом завершает процесс. `stop_grace_period: 30s` в
`docker-compose.yml` даёт этому время произойти вместо `SIGKILL`.

## Секреты

`.env`, `sessions/*.session`, `service_account.json` — реальные секреты и
живые Telegram-сессии. Не коммитьте их (уже в `.gitignore`), не публикуйте
и не выводите в логи — приложение логирует только технические сообщения
(id, имена аккаунтов, обрезанные тексты ответов), но не значения `api_hash`,
`OPENAI_API_KEY` или содержимое `.env`.

## Тесты

`pip install -r requirements.txt` (включает `pytest`/`pytest-asyncio`),
затем `pytest`. Тесты живут в `tests/`.
