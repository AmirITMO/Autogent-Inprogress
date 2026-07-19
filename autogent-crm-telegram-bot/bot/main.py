import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from . import config
from .api_client import api
from .handlers import router
from .push_server import start_push_server


async def main() -> None:
    logging.basicConfig(level=logging.INFO)

    bot = Bot(
        token=config.TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)

    push_runner = await start_push_server(bot)
    try:
        await dp.start_polling(bot)
    finally:
        await push_runner.cleanup()
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
