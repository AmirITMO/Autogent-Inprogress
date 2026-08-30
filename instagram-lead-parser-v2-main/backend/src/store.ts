import * as fs from 'fs';
import * as path from 'path';

function getFilePath(userId: number): string {
  return path.join(__dirname, `../../data/seen/${userId}.json`);
}

export function loadSeenUsernames(userId: number): Set<string> {
  const filePath = getFilePath(userId);
  try {
    if (!fs.existsSync(filePath)) return new Set();
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return new Set(data.usernames || []);
  } catch {
    return new Set();
  }
}

export function saveSeenUsernames(userId: number, usernames: string[]): void {
  const filePath = getFilePath(userId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = loadSeenUsernames(userId);
  for (const u of usernames) existing.add(u.toLowerCase());
  fs.writeFileSync(filePath, JSON.stringify({ usernames: Array.from(existing) }, null, 2));
}

export function clearSeenUsernames(userId: number): void {
  const filePath = getFilePath(userId);
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ usernames: [] }, null, 2));
  }
}

export function countSeenUsernames(userId: number): number {
  return loadSeenUsernames(userId).size;
}
