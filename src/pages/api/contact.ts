import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { escapeHtml, kv, readEnv } from '../../lib/runtime';
import { databaseConfigured, saveQuote } from '../../lib/quotes';
import { isGoogleAdsUrl, leadSource, REMEMBER_DAYS } from '../../lib/attribution';

// An on-demand route (as are the /admin/ pages). It must NOT be prerendered — a
// prerendered API route ships as a static file and silently accepts nothing.
export const prerender = false;

// ---------------------------------------------------------------------------
// Addressing
//
//   From ......  forms@brandingcentres.com — the shared agency domain
//   To ........  the client's inbox
//   Reply-To ..  the visitor, so hitting reply answers the lead
//
// This used to send from briansmasonry.net itself. That domain dropped off
// Resend (the key restricted to it began failing "domain not verified") and the
// Resend plan is at its domain limit, so the site now follows the stack default
// and sends from the verified shared domain. The resend._domainkey and send.
// records on briansmasonry.net are left in place, unused, so the own-domain
// setup can be restored by re-adding the domain on Resend.
//
// A visitor's address is still never put in From — receiving servers read that
// as forgery and bin the message. Reply-To carries it instead, which is what
// makes the notification answerable.
// ---------------------------------------------------------------------------
const DEFAULTS = {
  CONTACT_FROM: "Brian's Masonry Website <forms@brandingcentres.com>",
  CONTACT_TO: 'briansmasonry@ymail.com',
} as const;

const MAX = { name: 100, email: 254, phone: 40, city: 100, message: 5000, source: 200, url: 2000 };

/** Reject a body larger than this outright — a lead is never this big. */
const MAX_BODY_BYTES = 64 * 1024;

/** Per-IP submissions allowed per hour. A form with no limit becomes a relay. */
const RATE_LIMIT = { max: 5, windowSeconds: 3600 };

/** Give up on the provider rather than hang the visitor's browser. */
const SEND_TIMEOUT_MS = 12_000;

function clean(value: unknown, limit: number, keepNewlines = false): string {
  if (typeof value !== 'string') return '';
  // Strip control characters so nothing can smuggle a header through a field.
  // Slice before the regex walk so a huge field cannot burn CPU on its way out.
  const strip = keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.slice(0, limit * 2).replace(strip, ' ').trim().slice(0, limit);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(value);
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

/** The Referer, when it is a page on this site. */
function sameOriginReferer(request: Request): URL | undefined {
  const referer = request.headers.get('referer');
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    return url.origin === new URL(request.url).origin ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The page the lead was sent from, as a full link: the same-origin Referer
 * without its query string, or the site's home page when there is none. Only a
 * same-origin address is trusted, so a forged Referer can't put someone
 * else's link in the email.
 */
function leadPage(request: Request): string {
  const origin = new URL(request.url).origin;
  const url = sameOriginReferer(request);
  return url ? `${origin}${url.pathname}` : `${origin}/`;
}

/**
 * Where the visitor came from, as the form posted it (LeadSourceCapture.astro
 * records it, EstimateForm.astro sends it): the exact address they landed on,
 * the outside page that sent them, and their latest Google Ads click.
 *
 * Landing and ad-click addresses must be on this site, so a forged field
 * can't put a foreign link in the admin or the email. The referrer is an
 * outside page by definition and is only ever shown as text.
 *
 * Without JavaScript none of this is posted, and the page the form was sent
 * from stands in for the landing page — with its query string this time, since
 * an ad click that lands on a page with a form carries its gclid right there.
 */
function leadOrigin(request: Request, fields: Fields) {
  const origin = new URL(request.url).origin;
  const link = (value: unknown, onSite: boolean): string => {
    const text = clean(value, MAX.url);
    if (!text) return '';
    try {
      const url = new URL(text);
      if (onSite ? url.origin !== origin : !/^(https?|android-app):$/.test(url.protocol)) return '';
      return url.href;
    } catch {
      return '';
    }
  };

  let landingUrl = link(fields.landing_url, true);
  const referrer = landingUrl ? link(fields.landing_ref, false) : '';
  if (!landingUrl) {
    const page = sameOriginReferer(request);
    if (page) {
      page.searchParams.delete('error'); // a bounced submission's own marker
      page.hash = '';
      landingUrl = page.href;
    }
  }

  let adClickUrl = link(fields.ad_click_url, true);
  const at = Number(clean(fields.ad_click_at, 20));
  const now = Date.now();
  const recent = Number.isFinite(at) && at <= now + 86_400_000 && at > now - (REMEMBER_DAYS + 1) * 86_400_000;
  if (!adClickUrl || !recent || !isGoogleAdsUrl(adClickUrl)) adClickUrl = '';

  return { landingUrl, referrer, adClickUrl, adClickAt: adClickUrl ? new Date(at) : null };
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

/** Accepted, and the lead is on its way. Both shapes end the same journey. */
function accepted(request: Request, id?: string) {
  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: true, id }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, { status: 303, headers: { location: '/thank-you/' } });
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

/**
 * Per-IP hourly cap, counted in KV. Fails OPEN: if KV is unavailable the lead
 * still goes through, because losing a real customer costs more than a spam
 * message. The hard edge is Turnstile plus a WAF rule, not this.
 */
async function overRateLimit(ip: string | null): Promise<boolean> {
  const store = kv();
  if (!store || !ip) return false;
  const key = `contact-rl:${ip}`;
  try {
    const current = Number((await store.get(key)) ?? '0');
    if (Number.isFinite(current) && current >= RATE_LIMIT.max) return true;
    await store.put(key, String((Number.isFinite(current) ? current : 0) + 1), {
      expirationTtl: RATE_LIMIT.windowSeconds,
    });
    return false;
  } catch {
    return false;
  }
}

/**
 * Stable key for one submission, so a double-click or a retry after a timeout
 * collapses into a single email at Resend rather than two leads for the client.
 */
async function idempotencyKey(parts: string[]): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
    return `contact-${Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 48)}`;
  } catch {
    return undefined;
  }
}

/** Provider failures worth a "try again" rather than a flat "we could not send". */
function isTransient(error: { name?: string; statusCode?: number | null }): boolean {
  const transientNames = [
    'rate_limit_exceeded',
    'daily_quota_exceeded',
    'monthly_quota_exceeded',
    'internal_server_error',
    'application_error',
  ];
  const status = error.statusCode ?? 0;
  return transientNames.includes(error.name ?? '') || status === 429 || status >= 500;
}

export const POST: APIRoute = async ({ request }) => {
  // Cheap guard first: a lead is never 64 KB, and clean() should not walk a
  // multi-megabyte string just to throw it away.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return reply(request, '', 413, 'toobig', 'That message is too large to send.');
  }

  const fields = await readFields(request).catch(() => ({} as Fields));
  const source = clean(fields.source, MAX.source);

  // Honeypot. Bots fill it, people never see it. Answer as if it worked.
  // The field is NOT called "company": browser address autofill maps that to
  // `organization` and would fill it for a real person, silently losing a lead.
  if (clean(fields.form_ref, 100) !== '') {
    return accepted(request);
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

  if (await overRateLimit(request.headers.get('cf-connecting-ip'))) {
    console.warn('contact: rate limit hit');
    return reply(request, source, 429, 'toomany', 'That is a lot of submissions. Please call us instead.');
  }

  const page = leadPage(request);
  const site = new URL(page).host;
  const arrival = leadOrigin(request, fields);
  const channel = leadSource({ landing_url: arrival.landingUrl, referrer: arrival.referrer });
  // An ad click that isn't the visit this lead came from: worth a line of its own.
  const earlierAd = arrival.adClickUrl && channel.channel !== 'google-ads' ? arrival.adClickUrl : '';

  // Save the lead for /admin/ before emailing it. Fails OPEN like the rate
  // limit: if Neon is down the email still goes, so no lead is lost — it just
  // won't appear in the admin list. `source` is the page the form was sent
  // from; landing_url and referrer are where the visitor arrived from.
  let quoteId: number | undefined;
  if (databaseConfigured()) {
    try {
      quoteId = await saveQuote({
        name,
        email,
        phone,
        city,
        message,
        source: page,
        landing_url: arrival.landingUrl,
        referrer: arrival.referrer,
        ad_click_url: arrival.adClickUrl,
        ad_click_at: arrival.adClickAt,
      });
    } catch (e) {
      console.error('contact: saving quote to Neon failed', (e as Error)?.message);
    }
  }
  const adminUrl = quoteId ? `${new URL(request.url).origin}/admin/quotes/${quoteId}/` : undefined;

  const from = readEnv('CONTACT_FROM') ?? DEFAULTS.CONTACT_FROM;
  const to = readEnv('CONTACT_TO') ?? DEFAULTS.CONTACT_TO;
  // Reply-To is the visitor unless overridden, so Brian can just hit reply.
  const replyTo = readEnv('CONTACT_REPLY_TO') ?? email;

  const lines = [
    `New estimate request from ${site}`,
    '',
    `Website: ${page}`,
    `Source:  ${channel.label}`,
    arrival.landingUrl ? `Landed:  ${arrival.landingUrl}` : null,
    arrival.referrer ? `From:    ${arrival.referrer}` : null,
    earlierAd ? `Earlier Google Ads click: ${earlierAd}` : null,
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone}`,
    city ? `City:    ${city}` : null,
    '',
    message || '(no message)',
    adminUrl ? '' : null,
    adminUrl ? `Manage this quote: ${adminUrl}` : null,
  ].filter((line): line is string => line !== null);

  const html = `<p style="font:15px/1.5 Helvetica,Arial,sans-serif">New estimate request from <a href="${escapeHtml(page)}">${escapeHtml(site)}</a></p>
<table cellpadding="4" style="font:15px/1.5 Helvetica,Arial,sans-serif">
  <tr><td><strong>Website</strong></td><td><a href="${escapeHtml(page)}">${escapeHtml(page)}</a></td></tr>
  <tr><td><strong>Source</strong></td><td>${escapeHtml(channel.label)}</td></tr>
  ${arrival.landingUrl ? `<tr><td><strong>Landed</strong></td><td style="word-break:break-all"><a href="${escapeHtml(arrival.landingUrl)}">${escapeHtml(arrival.landingUrl)}</a></td></tr>` : ''}
  ${arrival.referrer ? `<tr><td><strong>From</strong></td><td style="word-break:break-all">${escapeHtml(arrival.referrer)}</td></tr>` : ''}
  ${earlierAd ? `<tr><td><strong>Earlier ad click</strong></td><td style="word-break:break-all"><a href="${escapeHtml(earlierAd)}">${escapeHtml(earlierAd)}</a></td></tr>` : ''}
  <tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
  <tr><td><strong>Email</strong></td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
  <tr><td><strong>Phone</strong></td><td><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a></td></tr>
  ${city ? `<tr><td><strong>City</strong></td><td>${escapeHtml(city)}</td></tr>` : ''}
  <tr><td valign="top"><strong>Message</strong></td><td>${escapeHtml(message || '(no message)').replace(/\n/g, '<br />')}</td></tr>
</table>
${adminUrl ? `<p style="font:13px Helvetica,Arial,sans-serif"><a href="${escapeHtml(adminUrl)}">Manage this quote</a></p>` : ''}`;

  const resend = new Resend(apiKey);
  const key = await idempotencyKey([to, email, phone, name, city, message]);

  let outcome: Awaited<ReturnType<typeof resend.emails.send>> | 'timeout';
  try {
    outcome = await Promise.race([
      resend.emails.send(
        {
          from,
          to,
          replyTo,
          subject: `New estimate request from ${site} — ${name}${city ? ` (${city})` : ''}`,
          text: lines.join('\n'),
          html,
        },
        key ? { idempotencyKey: key } : undefined,
      ),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), SEND_TIMEOUT_MS)),
    ]);
  } catch (thrown) {
    console.error('contact: resend call threw', (thrown as Error)?.name, (thrown as Error)?.message);
    return reply(request, source, 502, 'send', 'We could not send that just now. Please call us instead.');
  }

  if (outcome === 'timeout') {
    // The send may still land — the idempotency key stops a retry duplicating it.
    console.error(`contact: resend did not answer within ${SEND_TIMEOUT_MS}ms`);
    return reply(request, source, 504, 'busy', 'That is taking longer than usual. Please try again in a moment.');
  }

  const { data, error } = outcome;
  if (error) {
    // Log the provider's reason, never the key.
    console.error('contact: resend rejected the send', error.name, error.message, error.statusCode ?? '');
    return isTransient(error)
      ? reply(request, source, 503, 'busy', 'That is taking longer than usual. Please try again in a moment.')
      : reply(request, source, 502, 'send', 'We could not send that just now. Please call us instead.');
  }

  return accepted(request, data?.id);
};

/** Anything but POST. Keeps a stray GET from looking like a broken page. */
export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method', message: 'POST only.' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST' },
  });
