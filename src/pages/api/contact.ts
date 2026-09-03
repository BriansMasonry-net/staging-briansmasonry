import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { Resend } from 'resend';

// The one on-demand route on this site. It must NOT be prerendered — a
// prerendered API route ships as a static file and silently accepts nothing.
export const prerender = false;

// ---------------------------------------------------------------------------
// Addressing
//
//   From ......  the shared TBOX sending domain (brandingcentres.com)
//   To ........  the client's inbox
//   Reply-To ..  the client's own address
//
// The client's own domain is never used as a sending domain, so nothing here
// can touch their existing mail reputation. A visitor's address is never put in
// From either — receiving servers read that as forgery and bin the message.
// The visitor's address travels in the body instead.
// ---------------------------------------------------------------------------
const DEFAULTS = {
  CONTACT_FROM: "Brian's Masonry Website <forms@brandingcentres.com>",
  CONTACT_TO: 'briansmasonry@ymail.com',
  CONTACT_REPLY_TO: 'briansmasonry@ymail.com',
} as const;

const MAX = { name: 100, email: 254, phone: 40, city: 100, message: 5000, source: 200 };

/**
 * Read config. On the Worker the API key arrives as a runtime secret through
 * `cloudflare:workers`; `import.meta.env` covers `astro dev` reading .dev.vars.
 * Build-time variables are deliberately not a supported source: they are absent
 * when the route executes, which fails in production after a passing build.
 */
function readEnv(key: string): string | undefined {
  const runtime = workerEnv as unknown as Record<string, unknown>;
  const value = runtime?.[key] ?? (import.meta.env as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function clean(value: unknown, limit: number, keepNewlines = false): string {
  if (typeof value !== 'string') return '';
  // Strip control characters so nothing can smuggle a header through a field.
  const strip = keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(strip, ' ').trim().slice(0, limit);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Fields = Record<string, string>;

async function readFields(request: Request): Promise<Fields> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : String(v ?? '')]),
    );
  }
  const form = await request.formData();
  const out: Fields = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

/** JSON callers (and the proof curl) get JSON; a plain form post gets a redirect. */
function wantsJson(request: Request): boolean {
  const type = request.headers.get('content-type') ?? '';
  const accept = request.headers.get('accept') ?? '';
  return type.includes('application/json') || accept.includes('application/json');
}

/** Same-origin path to send a no-JS form back to, so errors land on the form. */
function backTo(request: Request, source: string, code: string): string {
  let path = '/';
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === new URL(request.url).origin) path = url.pathname;
    } catch {
      /* ignore an unparseable referer */
    }
  }
  const hash = /^[a-z0-9_-]+$/i.test(source) ? `#${source}` : '';
  return `${path}?error=${code}${hash}`;
}

function reply(request: Request, source: string, status: number, code: string, message: string) {
  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: false, error: code, message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, { status: 303, headers: { location: backTo(request, source, code) } });
}

/** Optional: only enforced once TURNSTILE_SECRET_KEY is set on the Worker. */
async function turnstileOk(secret: string, token: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  }).catch(() => null);
  if (!res?.ok) return false;
  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
  return data?.success === true;
}

export const POST: APIRoute = async ({ request }) => {
  const fields = await readFields(request).catch(() => ({} as Fields));
  const source = clean(fields.source, MAX.source);

  // Honeypot. Bots fill it, people never see it. Answer as if it worked.
  if (clean(fields.company, 100) !== '') {
    return wantsJson(request)
      ? new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'content-type': 'application/json' } })
      : new Response(null, { status: 303, headers: { location: '/thank-you/' } });
  }

  const name = clean(fields.name, MAX.name);
  const email = clean(fields.email, MAX.email);
  const phone = clean(fields.phone, MAX.phone);
  const city = clean(fields.city, MAX.city);
  const message = clean(fields.message, MAX.message, true);

  if (!name || !phone || !isEmail(email)) {
    return reply(request, source, 400, 'invalid', 'Name, a valid email address and a phone number are required.');
  }

  const apiKey = readEnv('RESEND_API_KEY');
  if (!apiKey) {
    console.error('contact: RESEND_API_KEY missing at runtime — add it as a Worker secret, not a build variable');
    return reply(request, source, 500, 'server', 'The form is not configured to send mail yet.');
  }

  const turnstileSecret = readEnv('TURNSTILE_SECRET_KEY');
  if (turnstileSecret) {
    const token = clean(fields['cf-turnstile-response'], 4096);
    const ok = await turnstileOk(turnstileSecret, token, request.headers.get('cf-connecting-ip'));
    if (!ok) return reply(request, source, 403, 'challenge', 'Please complete the challenge and try again.');
  }

  const from = readEnv('CONTACT_FROM') ?? DEFAULTS.CONTACT_FROM;
  const to = readEnv('CONTACT_TO') ?? DEFAULTS.CONTACT_TO;
  const replyTo = readEnv('CONTACT_REPLY_TO') ?? DEFAULTS.CONTACT_REPLY_TO;

  const lines = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone}`,
    city ? `City:    ${city}` : null,
    '',
    message || '(no message)',
    '',
    `Sent from ${source || 'the estimate form'} on briansmasonry.net`,
  ].filter((line) => line !== null) as string[];

  const html = `<table cellpadding="4" style="font:15px/1.5 Helvetica,Arial,sans-serif">
  <tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
  <tr><td><strong>Email</strong></td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
  <tr><td><strong>Phone</strong></td><td><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a></td></tr>
  ${city ? `<tr><td><strong>City</strong></td><td>${escapeHtml(city)}</td></tr>` : ''}
  <tr><td valign="top"><strong>Message</strong></td><td>${escapeHtml(message || '(no message)').replace(/\n/g, '<br />')}</td></tr>
</table>
<p style="font:13px Helvetica,Arial,sans-serif;color:#666">Sent from ${escapeHtml(source || 'the estimate form')} on briansmasonry.net</p>`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    replyTo,
    subject: `New estimate request — ${name}${city ? ` (${city})` : ''}`,
    text: lines.join('\n'),
    html,
  });

  if (error) {
    // Log the provider's reason, never the key.
    console.error('contact: resend rejected the send', error.name, error.message);
    return reply(request, source, 502, 'send', 'We could not send that just now. Please call us instead.');
  }

  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: true, id: data?.id }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, { status: 303, headers: { location: '/thank-you/' } });
};

/** Anything but POST. Keeps a stray GET from looking like a broken page. */
export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method', message: 'POST only.' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST' },
  });
