import hmac
import logging

from aiogram import Bot
from aiohttp import web

from . import config

logger = logging.getLogger(__name__)


def _check_secret(request: web.Request) -> bool:
    given = request.headers.get("X-Bot-Secret", "")
    return hmac.compare_digest(given, config.BOT_INTERNAL_SECRET)


def create_push_app(bot: Bot) -> web.Application:
    app = web.Application()

    async def handle_send(request: web.Request) -> web.Response:
        if not _check_secret(request):
            return web.json_response({"error": "unauthorized"}, status=401)

        try:
            payload = await request.json()
            chat_id = int(payload["chatId"])
            text = str(payload["text"])
        except (KeyError, ValueError, TypeError):
            return web.json_response({"error": "chatId and text required"}, status=400)

        try:
            await bot.send_message(chat_id, text)
        except Exception as err:  # noqa: BLE001 - proactive push must never crash the caller
            logger.warning("push send failed: %s", err)
            return web.json_response({"error": "send_failed"}, status=502)

        return web.json_response({"status": "sent"})

    app.router.add_post("/send", handle_send)
    return app


async def start_push_server(bot: Bot) -> web.AppRunner:
    app = create_push_app(bot)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.PUSH_SERVER_PORT)
    await site.start()
    logger.info("push server listening on :%s", config.PUSH_SERVER_PORT)
    return runner
