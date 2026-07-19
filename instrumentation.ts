export async function register() {
  console.log("[instrumentation] register() called, NEXT_RUNTIME=", process.env.NEXT_RUNTIME);
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBotCron } = await import("./lib/cron/telegramCron");
    startBotCron();
  }
}
