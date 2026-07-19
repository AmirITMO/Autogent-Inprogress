import os

from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://app:3000").rstrip("/")
BOT_INTERNAL_SECRET = os.getenv("BOT_INTERNAL_SECRET", "")

if not TELEGRAM_BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")
if not BOT_INTERNAL_SECRET:
    raise RuntimeError("BOT_INTERNAL_SECRET is not set")
