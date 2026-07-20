// RU-сервер, где крутится Next.js, не имеет прямого доступа к api.telegram.org —
// сам бот (long polling) и вся исходящая связь с Telegram живут на отдельном
// France-сервере. Проактивные пуши (напоминания/сводки) идут туда через
// маленький защищённый эндпоинт /send бота (тот же BOT_INTERNAL_SECRET,
// что и у app/api/bot/*, только в обратном направлении).
export async function sendTelegramMessage(chatId: bigint | string, text: string) {
  const url = process.env.BOT_PUSH_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!url || !secret) return;

  try {
    console.log("[send] posting to", `${url.replace(/\/$/, "")}/send`, "chatId=", chatId.toString());
    const res = await fetch(`${url.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bot-Secret": secret },
      body: JSON.stringify({ chatId: chatId.toString(), text }),
    });
    console.log("[send] response status", res.status);
    if (!res.ok) {
      console.error("bot push send failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("bot push send error", err);
  }
}
