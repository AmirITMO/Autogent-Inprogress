// Фоновый пинг фиксированного списка собственных сайтов компании — список
// жёстко задан (никакого пользовательского ввода => исключён SSRF), запросы
// только HEAD с таймаутом, тело ответа никогда не читается и не разбирается,
// редиректы не проходятся (redirect: "manual") — сам факт ответа (в т.ч. 3xx)
// уже означает "сайт жив".
//
// Результат кладётся в файл (не в module-level переменную): instrumentation.ts
// импортирует этот модуль динамически, а layout.tsx — статически, и в этой
// сборке Next.js это оказались два разных экземпляра модуля с независимым
// in-memory состоянием — фоновая проверка писала в свою копию, рендер читал
// свою (всегда дефолт). Файл на диске одинаково виден из любого контекста.

import { readFile, writeFile } from "fs/promises";
import path from "path";
import os from "os";

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

const STATUS_FILE = path.join(os.tmpdir(), "autogent-site-status.json");

const FALLBACK: SiteStatus[] = SITES.map((s) => ({ domain: s.domain, status: "down", pingMs: 0 }));

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
  const results = await Promise.all(SITES.map((s) => checkOne(s.domain)));
  await writeFile(STATUS_FILE, JSON.stringify(results));
}

export async function getSiteStatuses(): Promise<SiteStatus[]> {
  try {
    const raw = await readFile(STATUS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return FALLBACK;
  }
}

export function startSiteStatusCron() {
  checkAll().catch((err) => console.error("siteStatus initial check failed", err));
  setInterval(() => {
    checkAll().catch((err) => console.error("siteStatus check failed", err));
  }, CHECK_INTERVAL_MS);
}
