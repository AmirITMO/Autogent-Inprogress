import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as crypto from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { initDb, db } from './db';
import { hashPassword, verifyPassword, signToken, requireAuth, requireSubscription, getSubscriptionInfo, AuthRequest } from './auth';
import { encrypt, decrypt } from './crypto';
import { createJob, runJob, getJob, getAllJobs } from './pipeline';
import { countSeenUsernames, clearSeenUsernames, saveSeenUsernames } from './store';

const REQUIRED_ENV = ['JWT_SECRET', 'ENCRYPTION_KEY', 'ADMIN_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required env variable: ${key}`);
    process.exit(1);
  }
}

initDb();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  const { username, password, confirmPassword } = req.body || {};

  if (!username || !password || !confirmPassword)
    return res.status(400).json({ error: 'Заполните все поля' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Имя пользователя: 3-20 символов, буквы, цифры и _' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (password !== confirmPassword)
    return res.status(400).json({ error: 'Пароли не совпадают' });

  if (db.getUserByUsername(username))
    return res.status(409).json({ error: 'Пользователь уже существует' });

  const hash = hashPassword(password);
  const userId = db.insertUser(username, hash);
  const token = signToken(userId, username);
  return res.json({ token, username });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Заполните все поля' });

  const user = db.getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: 'Неверный логин или пароль' });

  const token = signToken(user.id, username);
  const subscription = getSubscriptionInfo(user.id);
  return res.json({ token, username, subscription });
});

// ─── Promo ───────────────────────────────────────────────────────────────────

app.post('/api/promo/redeem', requireAuth, (req: AuthRequest, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Введите промокод' });

  const now = Math.floor(Date.now() / 1000);
  const promo = db.getPromoByCode(String(code).toUpperCase().trim());

  if (!promo) return res.status(404).json({ error: 'Промокод не найден' });
  if (promo.used_by !== null) return res.status(409).json({ error: 'Промокод уже использован' });
  if (promo.expires_at !== null && promo.expires_at < now)
    return res.status(410).json({ error: 'Промокод истёк' });

  const userId = req.user!.userId;
  const durationSec = promo.duration_hours * 3600;

  const currentSub = db.getLatestSubscription(userId);
  const base = currentSub && currentSub.expires_at > now ? currentSub.expires_at : now;
  const newExpiresAt = base + durationSec;

  db.markPromoUsed(promo.id, userId);
  db.insertSubscription(userId, newExpiresAt, promo.id);

  return res.json({
    ok: true,
    subscription: { active: true, expiresAt: new Date(newExpiresAt * 1000).toISOString() },
  });
});

// ─── Me / Settings ───────────────────────────────────────────────────────────

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const settings = db.getSettings(userId);
  return res.json({
    username: req.user!.username,
    subscription: getSubscriptionInfo(userId),
    settings: {
      hasApifyToken: !!settings?.apify_token_enc,
      hasOpenaiKey: !!settings?.openai_key_enc,
      googleSheetId: settings?.google_sheet_id || null,
      serviceAccountEmail: getServiceAccountEmail(),
    },
  });
});

app.put('/api/settings', requireAuth, (req: AuthRequest, res) => {
  const { apifyToken, openaiKey, googleSheetId } = req.body || {};
  const userId = req.user!.userId;
  const patch: Record<string, string | null> = {};

  if (apifyToken !== undefined) patch.apify_token_enc = apifyToken ? encrypt(apifyToken) : null;
  if (openaiKey !== undefined) patch.openai_key_enc = openaiKey ? encrypt(openaiKey) : null;
  if (googleSheetId !== undefined) patch.google_sheet_id = googleSheetId || null;

  db.upsertSettings(userId, patch);
  return res.json({ ok: true });
});

app.get('/api/settings', requireAuth, (req: AuthRequest, res) => {
  const settings = db.getSettings(req.user!.userId);
  return res.json({
    hasApifyToken: !!settings?.apify_token_enc,
    hasOpenaiKey: !!settings?.openai_key_enc,
    googleSheetId: settings?.google_sheet_id || null,
    serviceAccountEmail: getServiceAccountEmail(),
  });
});

// ─── Parser ──────────────────────────────────────────────────────────────────

app.post('/api/parse/start', requireAuth, requireSubscription, async (req: AuthRequest, res) => {
  const config = req.body;
  const userId = req.user!.userId;

  if (!config.hashtags?.length && !config.keywords?.length)
    return res.status(400).json({ error: 'hashtags or keywords required' });

  const settings = db.getSettings(userId);
  if (!settings?.apify_token_enc)
    return res.status(400).json({ error: 'Добавьте Apify токен в настройках профиля' });

  const { apifyToken: _a, openaiKey: _o, ...cleanConfig } = config;
  const jobId = createJob(cleanConfig, userId);
  runJob(jobId).catch(() => {});
  return res.json({ jobId });
});

app.get('/api/parse/:jobId/status', requireAuth, (req: AuthRequest, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (job.userId !== req.user!.userId) return res.status(403).json({ error: 'forbidden' });
  return res.json({ id: job.id, status: job.status, progress: job.progress, leadsCount: job.leads.length, error: job.error, startedAt: job.startedAt, finishedAt: job.finishedAt });
});

app.get('/api/parse/:jobId/leads', requireAuth, (req: AuthRequest, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (job.userId !== req.user!.userId) return res.status(403).json({ error: 'forbidden' });
  return res.json(job.leads);
});

app.get('/api/parse/:jobId/export', requireAuth, (req: AuthRequest, res) => {
  const job = getJob(req.params.jobId);
  if (!job || job.status !== 'done') return res.status(404).json({ error: 'not ready' });
  if (job.userId !== req.user!.userId) return res.status(403).json({ error: 'forbidden' });

  const exportDir = path.join(__dirname, '../../data/exports');
  let files: string[];
  try {
    const fs = require('fs');
    files = fs.readdirSync(exportDir).filter((f: string) => f.endsWith('.xlsx')).sort().reverse();
  } catch { return res.status(404).json({ error: 'no export file' }); }
  if (!files.length) return res.status(404).json({ error: 'no export file' });

  return res.download(path.join(exportDir, files[0]), `leads-${job.id.slice(0, 8)}.xlsx`);
});

// ─── My Leads ────────────────────────────────────────────────────────────────

app.get('/api/my-leads', requireAuth, (req: AuthRequest, res) => {
  return res.json(db.getLeads(req.user!.userId));
});

app.patch('/api/my-leads/:id', requireAuth, (req: AuthRequest, res) => {
  const { contacted, replied, called } = req.body || {};
  const patch: Record<string, boolean> = {};
  if (contacted !== undefined) patch.contacted = Boolean(contacted);
  if (replied !== undefined) patch.replied = Boolean(replied);
  if (called !== undefined) patch.called = Boolean(called);
  const ok = db.updateLead(req.user!.userId, req.params.id, patch);
  return ok ? res.json({ ok: true }) : res.status(404).json({ error: 'not found' });
});

app.delete('/api/my-leads/:id', requireAuth, (req: AuthRequest, res) => {
  const ok = db.deleteLead(req.user!.userId, req.params.id);
  return ok ? res.json({ ok: true }) : res.status(404).json({ error: 'not found' });
});

app.delete('/api/my-leads', requireAuth, (req: AuthRequest, res) => {
  db.clearLeads(req.user!.userId);
  return res.json({ ok: true });
});

// ─── Seen ─────────────────────────────────────────────────────────────────────

app.get('/api/seen-count', requireAuth, (req: AuthRequest, res) => {
  return res.json({ count: countSeenUsernames(req.user!.userId) });
});

app.delete('/api/seen', requireAuth, (req: AuthRequest, res) => {
  try { clearSeenUsernames(req.user!.userId); return res.json({ ok: true }); }
  catch { return res.status(500).json({ error: 'failed' }); }
});

app.post('/api/seen/import-xlsx', requireAuth, upload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const IG_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?/g;
    const found = new Set<string>();

    for (const sheetName of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      let m: RegExpExecArray | null;
      IG_RE.lastIndex = 0;
      while ((m = IG_RE.exec(csv)) !== null) {
        const username = m[1].toLowerCase().replace(/\/$/, '');
        if (username && username !== 'p' && username !== 'reel' && username !== 'stories') {
          found.add(username);
        }
      }
    }

    if (found.size === 0) return res.status(422).json({ error: 'Instagram-ссылки не найдены в файле' });

    saveSeenUsernames(req.user!.userId, Array.from(found));
    return res.json({ ok: true, imported: found.size });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

app.post('/api/admin/promo', (req, res) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: 'Forbidden' });

  const { durationHours, count = 1 } = req.body || {};
  if (!durationHours || typeof durationHours !== 'number' || durationHours <= 0)
    return res.status(400).json({ error: 'durationHours must be a positive number' });

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const results: { code: string }[] = [];

  for (let i = 0; i < Math.min(count, 100); i++) {
    let code: string;
    let attempts = 0;
    do {
      code = Array.from({ length: 12 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
      attempts++;
    } while (attempts < 10 && db.codeExists(code));
    db.insertPromo(code, durationHours);
    results.push({ code });
  }

  return res.json(results);
});

// ─── Jobs ────────────────────────────────────────────────────────────────────

app.get('/api/jobs', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  return res.json(
    getAllJobs()
      .filter(j => j.userId === userId)
      .map(j => ({ id: j.id, status: j.status, leadsCount: j.leads.length, startedAt: j.startedAt, finishedAt: j.finishedAt }))
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getServiceAccountEmail(): string | null {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    return JSON.parse(raw).client_email || null;
  } catch { return null; }
}

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
