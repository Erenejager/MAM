import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const sessions = new Set<string>();

export function createSession(): string {
  const token = randomBytes(32).toString('hex');
  sessions.add(token);
  return token;
}

export function validateSession(token: string): boolean {
  return sessions.has(token);
}

export function removeSession(token: string): void {
  sessions.delete(token);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.AUTH_PASSWORD!;
  return bcrypt.compare(password, hash);
}
