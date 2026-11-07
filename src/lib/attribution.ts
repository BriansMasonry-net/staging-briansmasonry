// ---------------------------------------------------------------------------
// Lead source: was this quote a Google Ads click, an organic search, or
// something else?
//
// The visitor's browser records where they arrived (the capture script in
// src/layouts/Base.astro) and the estimate form posts it with the lead. This
// module turns that into a channel. It runs at display time, not save time, so
// improving a rule here re-labels every past lead too.
//
//   landing_url ..  the exact address the visitor arrived on, query string and
//                   all — a Google Ads click carries ?gclid= (auto-tagging)
//   referrer .....  the page outside this site that sent them, if the browser
//                   said; Google search sends only https://www.google.com/
//
// Google Ads is recognised by its click IDs (gclid, or gbraid/wbraid on iOS),
// gad_source, or utm tags saying google + cpc. A Google ad without auto-tagging
// or utm tags is indistinguishable from an organic Google search.
// ---------------------------------------------------------------------------

/** localStorage key the capture script writes and the estimate form reads. */
export const STORAGE_KEY = 'bm_lead_source';
/** How long a visit's source is remembered — Google Ads' default click window. */
export const REMEMBER_DAYS = 90;

export type Channel =
  | 'google-ads'
  | 'paid'
  | 'organic'
  | 'social'
  | 'referral'
  | 'campaign'
  | 'direct'
  | 'unknown';

export interface LeadSource {
  channel: Channel;
  /** Short label for a badge: "Google Ads", "Organic search · Google". */
  label: string;
  /** Google Ads click ID (gclid, gbraid or wbraid), when there is one. */
  clickId?: { name: string; value: string };
  /** Google Ads campaign ID (gad_campaignid) or utm_campaign. */
  campaign?: string;
}

const GOOGLE_CLICK_IDS = ['gclid', 'gbraid', 'wbraid'] as const;
const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'paid-search', 'sem', 'ads']);

/**
 * Hostname pattern → engine name. Checked against the referrer, www. stripped.
 * Country domains are spelled out (google.ca, google.co.uk, google.com.au) so
 * an Android app referrer such as android-app://com.google.android.gm (Gmail)
 * is not mistaken for google.<something>. The Google app itself does count.
 */
const SEARCH_ENGINES: [RegExp, string][] = [
  [/^(.+\.)?google\.(com?\.)?[a-z]{2,3}$|^com\.google\.android\.googlequicksearchbox$/, 'Google'],
  [/^(.+\.)?bing\.com$/, 'Bing'],
  [/^(.+\.)?yahoo\.(com?\.)?[a-z]{2,3}$/, 'Yahoo'],
  [/^(.+\.)?duckduckgo\.com$/, 'DuckDuckGo'],
  [/^(.+\.)?ecosia\.org$/, 'Ecosia'],
  [/^search\.brave\.com$/, 'Brave'],
  [/^(.+\.)?baidu\.com$/, 'Baidu'],
  [/^(.+\.)?yandex\.(com?\.)?[a-z]{2,3}$/, 'Yandex'],
  [/^(.+\.)?(ask|aol)\.com$/, 'Ask/AOL'],
];

/** Google properties that link out but are not search. */
const GOOGLE_NOT_SEARCH = /^(mail|docs|drive|accounts|calendar)\.google\./;

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|^fb\.me$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/^t\.co$|(^|\.)(twitter|x)\.com$/, 'X'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)pinterest\.(com?\.)?[a-z]{2,3}$/, 'Pinterest'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)nextdoor\.(com?\.)?[a-z]{2,3}$/, 'Nextdoor'],
];

function parse(value: string): URL | undefined {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/** Host of a referrer, www. stripped. For an android-app:// referrer, the app's package name. */
function refHost(ref: URL | undefined): string {
  return ref ? ref.hostname.replace(/^www\./, '').toLowerCase() : '';
}

function match(list: [RegExp, string][], host: string): string | undefined {
  return list.find(([re]) => re.test(host))?.[1];
}

/** The Google Ads click ID in a URL, if any. */
export function googleClickId(url: URL | undefined): LeadSource['clickId'] {
  for (const name of GOOGLE_CLICK_IDS) {
    const value = url?.searchParams.get(name);
    if (value) return { name, value };
  }
  return undefined;
}

/** True when a URL is a Google Ads click by its own tagging. */
export function isGoogleAdsUrl(value: string): boolean {
  const url = parse(value);
  if (!url) return false;
  if (googleClickId(url) || url.searchParams.has('gad_source')) return true;
  const source = (url.searchParams.get('utm_source') ?? '').toLowerCase();
  const medium = (url.searchParams.get('utm_medium') ?? '').toLowerCase();
  return source.includes('google') && PAID_MEDIUMS.has(medium);
}

export function leadSource(q: { landing_url?: string | null; referrer?: string | null }): LeadSource {
  const landing = parse(q.landing_url ?? '');
  if (!landing) return { channel: 'unknown', label: 'Not recorded' };

  const params = landing.searchParams;
  const campaign = params.get('gad_campaignid') || params.get('utm_campaign') || undefined;
  const source = (params.get('utm_source') ?? '').trim();
  const medium = (params.get('utm_medium') ?? '').trim().toLowerCase();

  if (isGoogleAdsUrl(landing.href)) {
    return { channel: 'google-ads', label: 'Google Ads', clickId: googleClickId(landing), campaign };
  }
  if (params.has('msclkid')) return { channel: 'paid', label: 'Paid · Microsoft Ads', campaign };
  if (PAID_MEDIUMS.has(medium)) return { channel: 'paid', label: `Paid · ${source || 'unknown source'}`, campaign };

  const ref = parse(q.referrer ?? '');
  const host = refHost(ref);
  const engine = host && !GOOGLE_NOT_SEARCH.test(host) ? match(SEARCH_ENGINES, host) : undefined;

  if (source) {
    // Tagged by hand: a Google Business Profile link, a newsletter, a flyer QR.
    if (medium === 'organic') return { channel: 'organic', label: `Organic · ${source}`, campaign };
    return { channel: 'campaign', label: `Campaign · ${[source, medium].filter(Boolean).join(' / ')}`, campaign };
  }
  if (engine) return { channel: 'organic', label: `Organic search · ${engine}` };

  // fbclid rides on every Facebook outbound link, ads or not, so it means
  // "from Facebook", nothing more.
  const social = match(SOCIAL, host) ?? (params.has('fbclid') ? 'Facebook' : undefined);
  if (social) return { channel: 'social', label: `Social · ${social}` };

  if (host) return { channel: 'referral', label: `Referral · ${host}` };
  return { channel: 'direct', label: 'Direct' };
}
