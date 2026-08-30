import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return s;
}

export function hashPassword(pass: string): string {
  return bcrypt.hashSync(pass, 10);
}

export function verifyPassword(pass: string, hash: string): boolean {
  return bcrypt.compareSync(pass, hash);
}

export interface TokenPayload {
  userId: number;
  username: string;
}

export function signToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Требуется авторизация' }); return;
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Невалидный или истёкший токен' });
  }
}

export function requireSubscription(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: 'Требуется авторизация' }); return; }
  const now = Math.floor(Date.now() / 1000);
  const sub = db.getLatestSubscription(req.user.userId);
  if (!sub || sub.expires_at <= now) {
    res.status(403).json({ error: 'Нет активной подписки. Введите промокод в профиле.' }); return;
  }
  next();
}

export function getSubscriptionInfo(userId: number): { active: boolean; expiresAt: string | null } {
  const now = Math.floor(Date.now() / 1000);
  const sub = db.getLatestSubscription(userId);
  if (!sub) return { active: false, expiresAt: null };
  return { active: sub.expires_at > now, expiresAt: new Date(sub.expires_at * 1000).toISOString() };
}
