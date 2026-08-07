import { SignJWT, jwtVerify } from 'jose';
import type { SessionPayload } from '../types';

const ALG = 'HS256';
const SESSION_TTL_DAYS = 7;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secretKey(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return payload as unknown as SessionPayload;
}

export function generatePIN(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  // Map 3 random bytes to a 6-digit PIN (100000–999999)
  const n = ((buf[0] << 16) | (buf[1] << 8) | buf[2]) % 900000;
  return (100000 + n).toString();
}

export async function hashPIN(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export async function verifyPIN(pin: string, hash: string): Promise<boolean> {
  return (await hashPIN(pin)) === hash;
}

// Constant-time compare to prevent timing attacks on HMAC signatures
export function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
