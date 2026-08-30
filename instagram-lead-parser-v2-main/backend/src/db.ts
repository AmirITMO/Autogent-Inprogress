/**
 * Simple JSON-file database. No native dependencies.
 * Data lives in data/db.json — backed up atomically on every write.
 */
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '../../data/db.json');

interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

interface UserSettings {
  user_id: number;
  apify_token_enc: string | null;
  openai_key_enc: string | null;
  google_sheet_id: string | null;
}

interface PromoCode {
  id: number;
  code: string;
  duration_hours: number;
  used_by: number | null;
  used_at: number | null;
  expires_at: number | null;
  created_at: number;
}

interface Subscription {
  id: number;
  user_id: number;
  expires_at: number;
  promo_code_id: number;
  created_at: number;
}

export interface StoredLead {
  id: string;
  user_id: number;
  username: string;
  profileUrl: string;
  fullName: string;
  bio: string;
  followersCount: number;
  tier: string;
  score: number;
  contacted: boolean;
  replied: boolean;
  called: boolean;
  savedAt: string;
  // rest of lead data
  data: Record<string, unknown>;
}

interface DbData {
  users: User[];
  user_settings: UserSettings[];
  promo_codes: PromoCode[];
  subscriptions: Subscription[];
  leads: StoredLead[];
  _seq: { users: number; promo_codes: number; subscriptions: number };
}

let _data: DbData | null = null;

function load(): DbData {
  if (_data) return _data;
  try {
    if (fs.existsSync(DB_PATH)) {
      _data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      return _data!;
    }
  } catch { /* corrupt — start fresh */ }
  _data = { users: [], user_settings: [], promo_codes: [], subscriptions: [], leads: [], _seq: { users: 0, promo_codes: 0, subscriptions: 0 } };
  return _data;
}

function save(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(_data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function nextId(seq: keyof DbData['_seq']): number {
  const d = load();
  d._seq[seq] += 1;
  return d._seq[seq];
}

export function initDb(): void {
  load(); // ensure file exists / is loaded
  save();
}

// ── Typed query helpers (mirror better-sqlite3 API shape used in index.ts) ──

export const db = {
  // Users
  getUserByUsername(username: string): User | undefined {
    return load().users.find(u => u.username === username);
  },
  getUserById(id: number): User | undefined {
    return load().users.find(u => u.id === id);
  },
  insertUser(username: string, password_hash: string): number {
    const d = load();
    const id = nextId('users');
    const now = Math.floor(Date.now() / 1000);
    d.users.push({ id, username, password_hash, created_at: now });
    // auto-create settings row
    if (!d.user_settings.find(s => s.user_id === id)) {
      d.user_settings.push({ user_id: id, apify_token_enc: null, openai_key_enc: null, google_sheet_id: null });
    }
    save();
    return id;
  },

  // Settings
  getSettings(user_id: number): UserSettings | undefined {
    const d = load();
    return d.user_settings.find(s => s.user_id === user_id);
  },
  upsertSettings(user_id: number, patch: Partial<Omit<UserSettings, 'user_id'>>): void {
    const d = load();
    let row = d.user_settings.find(s => s.user_id === user_id);
    if (!row) {
      row = { user_id, apify_token_enc: null, openai_key_enc: null, google_sheet_id: null };
      d.user_settings.push(row);
    }
    Object.assign(row, patch);
    save();
  },

  // Promo codes
  getPromoByCode(code: string): PromoCode | undefined {
    return load().promo_codes.find(p => p.code === code);
  },
  codeExists(code: string): boolean {
    return !!load().promo_codes.find(p => p.code === code);
  },
  insertPromo(code: string, duration_hours: number): PromoCode {
    const d = load();
    const id = nextId('promo_codes');
    const now = Math.floor(Date.now() / 1000);
    const row: PromoCode = { id, code, duration_hours, used_by: null, used_at: null, expires_at: null, created_at: now };
    d.promo_codes.push(row);
    save();
    return row;
  },
  markPromoUsed(id: number, user_id: number): void {
    const d = load();
    const p = d.promo_codes.find(x => x.id === id);
    if (p) { p.used_by = user_id; p.used_at = Math.floor(Date.now() / 1000); }
    save();
  },

  // Leads
  getLeads(user_id: number): StoredLead[] {
    const d = load();
    if (!d.leads) d.leads = [];
    return d.leads.filter(l => l.user_id === user_id).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  hasLead(user_id: number, username: string): boolean {
    const d = load();
    if (!d.leads) d.leads = [];
    return d.leads.some(l => l.user_id === user_id && l.username.toLowerCase() === username.toLowerCase());
  },
  getUserLeadUsernames(user_id: number): Set<string> {
    const d = load();
    if (!d.leads) d.leads = [];
    return new Set(d.leads.filter(l => l.user_id === user_id).map(l => l.username.toLowerCase()));
  },
  insertLead(lead: StoredLead): void {
    const d = load();
    if (!d.leads) d.leads = [];
    if (!d.leads.some(l => l.user_id === lead.user_id && l.username.toLowerCase() === lead.username.toLowerCase())) {
      d.leads.push(lead);
      save();
    }
  },
  updateLead(user_id: number, id: string, patch: Partial<Pick<StoredLead, 'contacted' | 'replied' | 'called'>>): boolean {
    const d = load();
    if (!d.leads) d.leads = [];
    const lead = d.leads.find(l => l.id === id && l.user_id === user_id);
    if (!lead) return false;
    Object.assign(lead, patch);
    save();
    return true;
  },
  deleteLead(user_id: number, id: string): boolean {
    const d = load();
    if (!d.leads) d.leads = [];
    const before = d.leads.length;
    d.leads = d.leads.filter(l => !(l.id === id && l.user_id === user_id));
    if (d.leads.length !== before) { save(); return true; }
    return false;
  },
  clearLeads(user_id: number): void {
    const d = load();
    if (!d.leads) d.leads = [];
    d.leads = d.leads.filter(l => l.user_id !== user_id);
    save();
  },

  // Subscriptions
  getLatestSubscription(user_id: number): Subscription | undefined {
    const subs = load().subscriptions.filter(s => s.user_id === user_id);
    return subs.sort((a, b) => b.expires_at - a.expires_at)[0];
  },
  insertSubscription(user_id: number, expires_at: number, promo_code_id: number): void {
    const d = load();
    const id = nextId('subscriptions');
    const now = Math.floor(Date.now() / 1000);
    d.subscriptions.push({ id, user_id, expires_at, promo_code_id, created_at: now });
    save();
  },
};
