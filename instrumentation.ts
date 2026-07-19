export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBotCron } = await import("./lib/cron/telegramCron");
    startBotCron();
  }
}
