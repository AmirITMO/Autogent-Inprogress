import { v4 as uuid } from 'uuid';
import { ApifyClient } from 'apify-client';
import * as path from 'path';
import * as fs from 'fs';
import { ParseConfig, ParseJob, Lead } from './types';
import { scrapeSearch, enrichProfiles } from './apify';
import { qualifyProfile, extractContacts } from './qualify';
import { analyzeWithAI } from './ai';
import { exportToXLSX } from './export';
import { loadSeenUsernames, saveSeenUsernames } from './store';
import { appendLeadsToSheet } from './sheets';
import { db } from './db';
import { decrypt } from './crypto';

const jobs = new Map<string, ParseJob>();

export function getJob(id: string): ParseJob | undefined {
  return jobs.get(id);
}

export function getAllJobs(): ParseJob[] {
  return Array.from(jobs.values()).reverse();
}

export function createJob(config: ParseConfig, userId: number): string {
  const id = uuid();
  const job: ParseJob = {
    id,
    userId,
    status: 'pending',
    config,
    progress: { stage: 'init', current: 0, total: 0, message: 'Инициализация...' },
    leads: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return id;
}

function update(job: ParseJob, stage: string, current: number, total: number, message: string) {
  job.progress = { stage, current, total, message };
}

export async function runJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'running';

  try {
    const { config, userId } = job;

    // Fetch tokens from DB
    const settings = db.getSettings(userId);

    if (!settings?.apify_token_enc) {
      throw new Error('Добавьте Apify токен в настройках');
    }

    const apifyToken = decrypt(settings.apify_token_enc);
    const openaiKey = settings.openai_key_enc ? decrypt(settings.openai_key_enc) : undefined;

    const client = new ApifyClient({ token: apifyToken });

    const totalQueries = config.hashtags.length + config.keywords.length;
    update(job, 'discovery', 0, totalQueries, 'Поиск по хэштегам и ключевым словам...');

    const usernameSet = new Set<string>();
    const usernameToTags = new Map<string, string[]>();
    let doneQueries = 0;
    let quotaExhausted = false;

    const addFound = (usernames: string[], label: string) => {
      for (const u of usernames) {
        usernameSet.add(u);
        if (!usernameToTags.has(u)) usernameToTags.set(u, []);
        usernameToTags.get(u)!.push(label);
      }
    };

    const isQuotaError = (msg: string): boolean => {
      const m = msg.toLowerCase();
      return m.includes('monthly usage hard limit')
        || m.includes('monthly usage limit')
        || m.includes('insufficient funds')
        || m.includes('payment required')
        || m.includes('usage limit exceeded')
        || m.includes('account has run out')
        || m.includes('quota exceeded');
    };

    const prefilterMin = config.minFollowers ?? 20000;
    const prefilteredFollowers = new Map<string, number>();

    const PARALLEL_QUERIES = 6;
    const allQueries: Array<() => Promise<void>> = [];

    for (const tag of config.hashtags) {
      allQueries.push(async () => {
        if (quotaExhausted) { doneQueries++; return; }
        try {
          const users = await scrapeSearch(client, tag, config.profilesPerQuery, prefilterMin);
          addFound(users.map(u => u.username), `#${tag}`);
          for (const u of users) {
            if (u.followersCount > 0) prefilteredFollowers.set(u.username, u.followersCount);
          }
          console.log(`[DISCOVERY] #${tag} (user-search) -> ${users.length} users`);
        } catch (e) {
          const msg = (e as Error).message || String(e);
          console.log(`[DISCOVERY] #${tag} FAILED:`, msg);
          if (isQuotaError(msg)) quotaExhausted = true;
        }
        doneQueries++;
        update(job, 'discovery', doneQueries, totalQueries, `Обработано ${doneQueries}/${totalQueries}. Найдено уник: ${usernameSet.size}`);
      });
    }

    for (const kw of config.keywords) {
      allQueries.push(async () => {
        if (quotaExhausted) { doneQueries++; return; }
        try {
          const users = await scrapeSearch(client, kw, config.profilesPerQuery, prefilterMin);
          addFound(users.map(u => u.username), kw);
          for (const u of users) {
            if (u.followersCount > 0) prefilteredFollowers.set(u.username, u.followersCount);
          }
          console.log(`[DISCOVERY] "${kw}" -> ${users.length} users (pre-filter ${prefilterMin}+)`);
        } catch (e) {
          const msg = (e as Error).message || String(e);
          console.log(`[DISCOVERY] "${kw}" FAILED:`, msg);
          if (isQuotaError(msg)) quotaExhausted = true;
        }
        doneQueries++;
        update(job, 'discovery', doneQueries, totalQueries, `Обработано ${doneQueries}/${totalQueries}. Найдено уник: ${usernameSet.size}`);
      });
    }

    for (let i = 0; i < allQueries.length; i += PARALLEL_QUERIES) {
      if (quotaExhausted) break;
      const chunk = allQueries.slice(i, i + PARALLEL_QUERIES);
      await Promise.all(chunk.map(fn => fn()));
    }

    console.log(`[DISCOVERY] Total unique usernames: ${usernameSet.size}`);

    if (quotaExhausted) {
      throw new Error('APIFY_QUOTA_EXHAUSTED');
    }

    if (usernameSet.size === 0 && totalQueries > 0) {
      throw new Error('Apify не вернул ни одного профиля. Проверьте токен и повторите через минуту.');
    }

    const seen = loadSeenUsernames(userId);
    const savedLeads = db.getUserLeadUsernames(userId);
    let newUsernames = Array.from(usernameSet).filter(u => !seen.has(u) && !savedLeads.has(u));

    const beforePrefilter = newUsernames.length;
    newUsernames = newUsernames.filter(u => {
      const known = prefilteredFollowers.get(u);
      if (known !== undefined && known > 0 && known < prefilterMin) return false;
      return true;
    });
    const droppedByPrefilter = beforePrefilter - newUsernames.length;
    console.log(`[PREFILTER] dropped ${droppedByPrefilter} users with known low followers, remaining ${newUsernames.length}`);

    update(job, 'enrichment', 0, newUsernames.length, `Загружаем ${newUsernames.length} профилей...`);

    const profiles = await enrichProfiles(client, newUsernames, (done, total) => {
      update(job, 'enrichment', done, total, `Обогащение профилей: ${done}/${total}`);
    });

    update(job, 'qualification', 0, profiles.length, 'Квалификация лидов...');
    console.log(`[QUAL] Starting qualification: ${profiles.length} profiles, minFollowers=${config.minFollowers}, minReelsViews=${config.minReelsViews}, minScore=${config.minScore}`);

    const qualifiedLeads: Lead[] = [];
    const rejectStats = { lowFollowers: 0, excluded: 0, noReels: 0, lowReelsViews: 0, lowScore: 0 };

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      update(job, 'qualification', i, profiles.length, `Анализ: @${profile.username}`);

      const qualResult = qualifyProfile(profile, config.minReelsViews, config.minScore, config.minFollowers ?? 20000);
      if (!qualResult.ok) {
        rejectStats[qualResult.reason]++;
        console.log(`[REJECT] @${profile.username} | followers=${profile.followersCount} | reason=${qualResult.reason}`);
        continue;
      }
      const qual = qualResult.data;

      const contact = extractContacts(profile.bio, profile.externalUrl);
      const tags = usernameToTags.get(profile.username.toLowerCase()) || [];

      const lead: Lead = {
        id: uuid(),
        username: profile.username,
        profileUrl: profile.profileUrl,
        fullName: profile.fullName,
        bio: profile.bio,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        postsCount: profile.postsCount,
        isBusinessAccount: profile.isBusinessAccount,
        businessCategory: profile.businessCategory,
        externalUrl: profile.externalUrl,
        contact,
        foundByTags: tags,
        avgReelsViews: qual.avgReelsViews,
        minReelsViews: qual.minReelsViews,
        score: qual.score,
        tier: qual.tier,
        aiAnalysis: null,
        parsedAt: new Date().toISOString(),
      };
      qualifiedLeads.push(lead);
      db.insertLead({ ...lead, user_id: userId, contacted: false, replied: false, called: false, savedAt: new Date().toISOString(), data: {} });
    }

    if (config.useAI && openaiKey) {
      update(job, 'ai', 0, qualifiedLeads.length, 'AI анализ лидов...');
      for (let i = 0; i < qualifiedLeads.length; i++) {
        const lead = qualifiedLeads[i];
        update(job, 'ai', i, qualifiedLeads.length, `AI: @${lead.username}`);
        const p = profiles.find(x => x.username === lead.username);
        if (p) {
          lead.aiAnalysis = await analyzeWithAI(p, openaiKey);
        }
      }
    }

    const exportDir = path.join(__dirname, '../../data/exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const xlsxPath = path.join(exportDir, `leads-${ts}.xlsx`);
    exportToXLSX(qualifiedLeads, xlsxPath);

    console.log(`[QUAL] Results: qualified=${qualifiedLeads.length}, rejected=`, rejectStats);

    saveSeenUsernames(userId, newUsernames);

    // Google Sheets export (optional)
    if (settings.google_sheet_id && qualifiedLeads.length > 0) {
      try {
        await appendLeadsToSheet(settings.google_sheet_id, qualifiedLeads);
        console.log(`[SHEETS] Exported ${qualifiedLeads.length} leads to sheet ${settings.google_sheet_id}`);
      } catch (e) {
        console.error('[SHEETS] Export failed:', (e as Error).message);
      }
    }

    job.leads = qualifiedLeads;
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    update(job, 'done', qualifiedLeads.length, qualifiedLeads.length, `Готово! Найдено ${qualifiedLeads.length} лидов`);

  } catch (err) {
    job.status = 'error';
    const raw = err instanceof Error ? err.message : String(err);

    if (raw.includes('APIFY_QUOTA_EXHAUSTED') || raw.toLowerCase().includes('monthly usage')) {
      job.error = 'Закончились токены APIFY. Месячный лимит исчерпан — пополните баланс или увеличьте лимит на console.apify.com/billing';
    } else if (raw.toLowerCase().includes('unauthorized') || raw.toLowerCase().includes('invalid token') || raw.toLowerCase().includes('401')) {
      job.error = 'Неверный APIFY токен. Проверьте ключ в настройках.';
    } else {
      job.error = raw;
    }
    job.finishedAt = new Date().toISOString();
    console.log(`[JOB ${jobId.slice(0, 8)}] FAILED: ${job.error}`);
  }
}
