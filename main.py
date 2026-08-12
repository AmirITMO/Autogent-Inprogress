"""
Точка входа: поднимает пул юзербот-аккаунтов, вешает НА КАЖДЫЙ клиент
сразу два обработчика — скаута (группы -> профили) и менеджера (личка),
запускает воркер очереди для нерабочего времени.

Один и тот же пул аккаунтов совмещает обе роли: сидит в группах и
собирает профили, и он же потом пишет продавцам в личку.

profiles_sheet — открытый лист "Profiles" (см. profile_store.py). В проде —
gspread-лист (Google Sheets + service account). Для локального теста, если
service_account.json не найден, автоматически используется LocalSheet
(local_sheet.py) — тот же интерфейс, данные хранятся в JSON-файле на диске.

Запуск отдельным процессом:  python main.py

Панель управления Streamlit (опционально) вынесена в app_streamlit.py —
запускается отдельно: streamlit run app_streamlit.py
"""

import asyncio
import logging
import os
import signal
import sys

from config import CONFIG, ConfigError, validate as validate_config
from manager_pool import ManagerPool
import scout_agent
import reactive_handler
import profile_store
from queue_worker import run_queue_worker
from metrics_reporter import run_metrics_reporter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
# Включаем логи самого Telethon на уровне INFO — иначе обрывы связи и
# попытки автопереподключения видны только на DEBUG и по факту незаметны
# в проде (наблюдали живьём: клиент тихо висел в цикле неудачных
# реконнектов без единого сигнала наружу).
logging.getLogger("telethon").setLevel(logging.INFO)

logger = logging.getLogger(__name__)

# Сколько раз подряд пытаемся восстановить упавшее соединение одного
# клиента, прежде чем сдаться и явно об этом сообщить (а не висеть тихо).
CLIENT_RECONNECT_MAX_RETRIES = 10
CLIENT_RECONNECT_BASE_DELAY = 5.0
CLIENT_RECONNECT_MAX_DELAY = 120.0


async def _run_client_forever(account_name: str, client) -> None:
    """
    run_until_disconnected() штатно возвращается только после явного
    client.disconnect() (наш graceful shutdown). Если соединение обрывается
    по вине сети, Telethon сам ретраит на уровне транспорта, но при полном
    исчерпании его внутренних попыток (или прочих ошибках) корутина может
    завершиться исключением — раньше это ничем не логировалось на уровне
    приложения, и было не отличить "тихо висим" от "упали и не поднялись".
    Явно перезапускаем клиента с backoff и логируем каждую попытку.
    """
    retry = 0
    delay = CLIENT_RECONNECT_BASE_DELAY
    while True:
        try:
            await client.run_until_disconnected()
            return  # штатное отключение (pool.stop_all() / graceful shutdown)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            retry += 1
            if retry > CLIENT_RECONNECT_MAX_RETRIES:
                logger.exception(
                    "[%s] Соединение потеряно и не восстановлено после %d попыток — сдаюсь.",
                    account_name, CLIENT_RECONNECT_MAX_RETRIES,
                )
                return
            logger.warning(
                "[%s] Разрыв соединения (%s). Попытка переподключения %d/%d через %.0f сек.",
                account_name, e, retry, CLIENT_RECONNECT_MAX_RETRIES, delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, CLIENT_RECONNECT_MAX_DELAY)
            try:
                if not client.is_connected():
                    await client.connect()
            except Exception:
                logger.exception("[%s] Ошибка при попытке переподключения.", account_name)


async def main(profiles_sheet):
    pool = ManagerPool(CONFIG)
    await pool.start_all()

    scout_agent.register_all(pool, CONFIG, profiles_sheet)
    reactive_handler.register_all(pool, CONFIG, profiles_sheet)

    queue_task = asyncio.create_task(run_queue_worker(pool, CONFIG, profiles_sheet))
    metrics_task = asyncio.create_task(run_metrics_reporter(pool, CONFIG))
    client_tasks = [
        asyncio.create_task(_run_client_forever(name, client))
        for name, client in pool.clients.items()
    ]

    # Graceful shutdown: по SIGINT/SIGTERM аккуратно останавливаем клиентов
    # пула вместо резкого убийства процесса на живом соединении/транзакции.
    stop_event = asyncio.Event()

    def _request_shutdown(sig_name: str) -> None:
        logger.info("Получен сигнал %s — начинаю остановку...", sig_name)
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_shutdown, sig.name)
        except NotImplementedError:
            # Windows: add_signal_handler недоступен для ProactorEventLoop —
            # используем обычный signal.signal (годится и для Ctrl+C).
            signal.signal(sig, lambda s, f: _request_shutdown(signal.Signals(s).name))

    logger.info("[Готово] %d аккаунт(ов) слушают группы %s и личные сообщения.",
                len(pool.account_names()), CONFIG.target_groups)
    logger.info("Рабочие часы: %d:00-%d:00 (%s), дни недели (0=Пн): %s",
                CONFIG.working_hours.start_hour, CONFIG.working_hours.end_hour,
                CONFIG.working_hours.timezone, CONFIG.working_hours.workdays)

    stop_task = asyncio.create_task(stop_event.wait())
    try:
        await asyncio.wait(
            [queue_task, metrics_task, stop_task, *client_tasks],
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        stop_task.cancel()
        queue_task.cancel()
        metrics_task.cancel()
        for t in client_tasks:
            t.cancel()
        await asyncio.gather(stop_task, queue_task, metrics_task, *client_tasks, return_exceptions=True)
        await pool.stop_all()
        logger.info("Остановка завершена.")


def _open_profiles_sheet():
    """Google Sheets в проде; локальный JSON-файл, если нет service_account.json (тест)."""
    if os.path.exists("service_account.json"):
        import gspread

        gc = gspread.service_account(filename="service_account.json")
        return gc.open(CONFIG.profiles_sheet_name).sheet1

    from local_sheet import LocalSheet

    logger.info("[Локальный режим] service_account.json не найден — использую local_sheet.py "
                "(profiles_local.json) вместо Google Sheets.")
    return LocalSheet("profiles_local.json", header=profile_store.HEADER)


if __name__ == "__main__":
    try:
        validate_config(CONFIG)
    except ConfigError as e:
        # Падаем сразу и понятно — не через сотню строк трейсбека из недр
        # Telethon/openai SDK при первом реальном сообщении.
        logger.error("%s", e)
        sys.exit(1)

    profiles_sheet = _open_profiles_sheet()
    try:
        asyncio.run(main(profiles_sheet))
    except KeyboardInterrupt:
        logger.info("Остановлено пользователем (Ctrl+C).")
