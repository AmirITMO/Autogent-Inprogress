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
"""

import asyncio
import os

from config import CONFIG
from manager_pool import ManagerPool
import scout_agent
import reactive_handler
import profile_store
from queue_worker import run_queue_worker


async def main(profiles_sheet):
    pool = ManagerPool(CONFIG)
    await pool.start_all()

    scout_agent.register_all(pool, CONFIG, profiles_sheet)
    reactive_handler.register_all(pool, CONFIG, profiles_sheet)

    queue_task = asyncio.create_task(run_queue_worker(pool, CONFIG, profiles_sheet))

    print(f"[Готово] {len(pool.account_names())} аккаунт(ов) слушают группы {CONFIG.target_groups} "
          f"и личные сообщения.")
    print(f"Рабочие часы: {CONFIG.working_hours.start_hour}:00–{CONFIG.working_hours.end_hour}:00 "
          f"({CONFIG.working_hours.timezone}), дни недели (0=Пн): {CONFIG.working_hours.workdays}")

    try:
        await asyncio.gather(
            queue_task,
            *[client.run_until_disconnected() for client in pool.clients.values()],
        )
    finally:
        await pool.stop_all()


def _open_profiles_sheet():
    """Google Sheets в проде; локальный JSON-файл, если нет service_account.json (тест)."""
    if os.path.exists("service_account.json"):
        import gspread

        gc = gspread.service_account(filename="service_account.json")
        return gc.open(CONFIG.profiles_sheet_name).sheet1

    from local_sheet import LocalSheet

    print("[Локальный режим] service_account.json не найден — использую local_sheet.py "
          "(profiles_local.json) вместо Google Sheets.")
    return LocalSheet("profiles_local.json", header=profile_store.HEADER)


if __name__ == "__main__":
    profiles_sheet = _open_profiles_sheet()
    asyncio.run(main(profiles_sheet))


# ---------------------------------------------------------------------------
# Streamlit-панель управления и ручной рассылки (опционально, отдельный файл
# app.py). Тот же паттерн "клиенты живут в отдельном потоке со своим event
# loop", только теперь клиентов несколько (пул), они слушают и группы, и
# личку, плюс есть воркер очереди.
# ---------------------------------------------------------------------------
STREAMLIT_UI_SNIPPET = '''
import threading
import asyncio
import streamlit as st

from config import CONFIG
from manager_pool import ManagerPool
import scout_agent
import reactive_handler
from queue_worker import run_queue_worker
from outreach_broadcast import broadcast_to_leads
from working_hours import is_working_hours

# profiles_sheet — открытый gspread-лист "Profiles", подключаете как раньше
# (gspread.service_account(...).open(CONFIG.profiles_sheet_name).sheet1)
profiles_sheet = ...

if "pool" not in st.session_state:
    st.session_state.pool = None
    st.session_state.loop = None
    st.session_state.agent_running = False


async def _run_agent_core():
    pool = ManagerPool(CONFIG)
    await pool.start_all()
    scout_agent.register_all(pool, CONFIG, profiles_sheet)
    reactive_handler.register_all(pool, CONFIG, profiles_sheet)
    st.session_state.pool = pool
    asyncio.create_task(run_queue_worker(pool, CONFIG, profiles_sheet))

    while st.session_state.agent_running:
        await asyncio.sleep(1)

    await pool.stop_all()


def _run_async_loop(loop):
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_run_agent_core())


st.subheader("🕹️ ИИ-агенты (скаут + менеджеры, общий пул аккаунтов)")

wh = CONFIG.working_hours
st.caption(f"Рабочие часы: {wh.start_hour}:00–{wh.end_hour}:00 ({wh.timezone}) · "
           f"Аккаунтов в пуле: {len(CONFIG.managers)} · Группы: {', '.join(CONFIG.target_groups)}")

col1, col2 = st.columns(2)
with col1:
    if not st.session_state.agent_running:
        if st.button("🚀 Запустить агентов", use_container_width=True, type="primary"):
            st.session_state.agent_running = True
            st.session_state.loop = asyncio.new_event_loop()
            t = threading.Thread(target=_run_async_loop, args=(st.session_state.loop,), daemon=True)
            t.start()
            st.rerun()
    else:
        if st.button("🛑 Остановить агентов", use_container_width=True):
            st.session_state.agent_running = False
            st.rerun()
with col2:
    now_working = is_working_hours(wh)
    st.metric("Статус", "🟢 Работает" if st.session_state.agent_running else "🔴 Выключен")
    st.metric("Рабочее окно сейчас", "Да" if now_working else "Нет (сообщения — в очередь)")

st.markdown("---")
st.subheader("📤 Ручная рассылка первого сообщения по базе профилей (status = new)")

if st.button("📨 Разослать (только в рабочие часы)"):
    if not st.session_state.agent_running or st.session_state.pool is None:
        st.error("Сначала запустите агентов.")
    else:
        # ВАЖНО: планируем корутину на loop пула, а не asyncio.run() —
        # клиенты уже крутятся в этом loop в фоновом потоке.
        future = asyncio.run_coroutine_threadsafe(
            broadcast_to_leads(st.session_state.pool, CONFIG, profiles_sheet),
            st.session_state.loop,
        )
        result = future.result()
        st.write(result)
'''
