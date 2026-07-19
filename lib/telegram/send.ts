export async function sendTelegramMessage(chatId: bigint | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId.toString(), text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      console.error("telegram sendMessage failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("telegram sendMessage error", err);
  }
}
