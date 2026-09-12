// Фоновый пинг фиксированного списка собственных сайтов компании — список
// жёстко задан (никакого пользовательского ввода => исключён SSRF), запросы
// только HEAD с таймаутом, тело ответа никогда не читается и не разбирается,
// редиректы не проходятся (redirect: "manual") — сам факт ответа (в т.ч. 3xx)
// уже означает "сайт жив". Результат кэшируется в памяти процесса и отдаётся
// синхронно — рендер страниц не ждёт сетевых запросов к внешним хостам.

export type SiteStatusLevel = "ok" | "warn" | "down";

export type SiteStatus = {
  domain: string;
  status: SiteStatusLevel;
  pingMs: number;
};

const SITES: { domain: string }[] = [
  { domain: "autogentgroup.ru" },
  { domain: "autogent.ru" },
  { domain: "platform.autogent.ru" },
];

const CHECK_TIMEOUT_MS = 5000;
const CHECK_INTERVAL_MS = 60_000;
const WARN_THRESHOLD_MS = 800;

let latest: SiteStatus[] = SITES.map((s) => ({ domain: s.domain, status: "down", pingMs: 0 }));

async function checkOne(domain: string): Promise<SiteStatus> {
  const start = Date.now();
  try {
    await fetch(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const pingMs = Date.now() - start;
    return { domain, status: pingMs > WARN_THRESHOLD_MS ? "warn" : "ok", pingMs };
  } catch {
    return { domain, status: "down", pingMs: 0 };
  }
}

async function checkAll() {
  latest = await Promise.all(SITES.map((s) => checkOne(s.domain)));
}

export function getSiteStatuses(): SiteStatus[] {
  return latest;
}

export function startSiteStatusCron() {
  checkAll().catch((err) => console.error("siteStatus initial check failed", err));
  setInterval(() => {
    checkAll().catch((err) => console.error("siteStatus check failed", err));
  }, CHECK_INTERVAL_MS);
}
