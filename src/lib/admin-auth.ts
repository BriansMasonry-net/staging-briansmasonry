import { Resend } from 'resend';
import { kv, readEnv } from './runtime';

// ---------------------------------------------------------------------------
// Admin login: email a one-time code, then a signed session cookie.
//
//   ADMIN_EMAILS ....  Worker var, comma-separated. The only addresses that can
//                      sign in. Removing one ends that person's access on their
//                      next request, session or not.
//   SESSION_SECRET ..  Worker secret. Signs session cookies and salts the stored
//                      code hashes. Rotating it signs everyone out.
//
// No passwords exist anywhere. Codes live in KV (SESSION binding) for ten
// minutes, hashed, and die after five wrong guesses. Everything fails closed:
// no secret or no allowlist means nobody gets in.
// ---------------------------------------------------------------------------

export const COOKIE = 'bm_admin';
const SESSION_DAYS = 30;
const CODE_TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;
/** Codes one address may request per hour. Stops the form being used to spam an inbox. */
const MAX_CODES_PER_HOUR = 5;

const enc = new TextEncoder();

export function normaliseEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
}

function allowlist(): string[] {
  return (readEnv('ADMIN_EMAILS') ?? '')
    .split(',')
    .map(normaliseEmail)
    .filter(Boolean);
}

export function isAllowed(email: string): boolean {
  return email !== '' && allowlist().includes(email);
}

function secret(): string | undefined {
  const value = readEnv('SESSION_SECRET');
  return value && value.length >= 32 ? value : undefined;
}

export function authConfigured(): boolean {
  return secret() !== undefined && allowlist().length > 0 && kv() !== undefined;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmacKey(key: string) {
  return crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return b64url(new Uint8Array(digest));
}

/** Compare two equal-purpose strings without leaking where they differ. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Codes ----------------------------------------------------------------

interface StoredCode {
  hash: string;
  attempts: number;
  /** Absolute expiry, epoch seconds, so a wrong guess does not extend the window. */
  exp: number;
}

/**
 * Email a sign-in code if the address is on the allowlist. Returns nothing the
 * caller could show: the page says the same thing either way, so the form
 * cannot be used to find out who has access.
 */
export async function sendCode(email: string, origin: string): Promise<void> {
  const key = secret();
  const store = kv();
  const apiKey = readEnv('RESEND_API_KEY');
  if (!key || !store || !apiKey || !isAllowed(email)) return;

  const countKey = `admin-codes-sent:${email}`;
  const sent = Number((await store.get(countKey)) ?? '0') || 0;
  if (sent >= MAX_CODES_PER_HOUR) {
    console.warn('admin: code request limit hit');
    return;
  }
  await store.put(countKey, String(sent + 1), { expirationTtl: 3600 });

  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(n).padStart(6, '0');
  const exp = Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS;
  const stored: StoredCode = { hash: await sha256(`${key}|${email}|${code}`), attempts: 0, exp };
  await store.put(`admin-code:${email}`, JSON.stringify(stored), { expiration: exp });

  const from = readEnv('CONTACT_FROM') ?? "Brian's Masonry Website <forms@brandingcentres.com>";
  const host = new URL(origin).host;
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: email,
    subject: `${code} is your Brian's Masonry admin code`,
    text: `Your sign-in code for ${host}/admin/ is:\n\n${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    html: `<p style="font:15px/1.5 Helvetica,Arial,sans-serif">Your sign-in code for ${host}/admin/ is:</p>
<p style="font:bold 28px/1 Helvetica,Arial,sans-serif;letter-spacing:4px">${code}</p>
<p style="font:13px Helvetica,Arial,sans-serif;color:#666">It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
  });
  if (error) console.error('admin: code email rejected', error.name, error.message);
}

/** True once, for the right code within ten minutes. The code is spent either way after five tries. */
export async function checkCode(email: string, code: string): Promise<boolean> {
  const key = secret();
  const store = kv();
  if (!key || !store || !isAllowed(email) || !/^\d{6}$/.test(code)) return false;

  const storeKey = `admin-code:${email}`;
  const raw = await store.get(storeKey);
  if (!raw) return false;
  const stored = JSON.parse(raw) as StoredCode;
  const now = Math.floor(Date.now() / 1000);
  if (stored.exp <= now) return false;

  if (sameString(stored.hash, await sha256(`${key}|${email}|${code}`))) {
    await store.delete(storeKey);
    return true;
  }
  stored.attempts += 1;
  if (stored.attempts >= MAX_ATTEMPTS) await store.delete(storeKey);
  // KV refuses an expiry under 60s away; the exp check above still enforces the real one.
  else await store.put(storeKey, JSON.stringify(stored), { expiration: Math.max(stored.exp, now + 60) });
  return false;
}

// --- Sessions -------------------------------------------------------------

interface Session {
  e: string;
  exp: number;
}

export async function createSessionCookie(email: string, secure: boolean): Promise<string> {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET missing or shorter than 32 characters');
  const payload = b64url(enc.encode(JSON.stringify({ e: email, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key), enc.encode(payload))));
  return cookie(`${payload}.${sig}`, SESSION_DAYS * 86400, secure);
}

export function clearSessionCookie(secure: boolean): string {
  return cookie('', 0, secure);
}

function cookie(value: string, maxAge: number, secure: boolean): string {
  // Path=/admin keeps the cookie off every public page request.
  return `${COOKIE}=${value}; Path=/admin; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** The signed-in admin's email, or undefined. Re-checks the allowlist every time. */
export async function readSession(cookieValue: string | undefined): Promise<string | undefined> {
  const key = secret();
  if (!key || !cookieValue) return undefined;
  const [payload, sig] = cookieValue.split('.');
  if (!payload || !sig) return undefined;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(key), fromB64url(sig), enc.encode(payload));
    if (!ok) return undefined;
    const session = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    if (typeof session.exp !== 'number' || session.exp < Date.now()) return undefined;
    return isAllowed(session.e) ? session.e : undefined;
  } catch {
    return undefined;
  }
}

/** A POST from another site carries no session cookie (SameSite=Lax), but refuse it outright anyway. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
