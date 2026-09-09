#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   check-seo.mjs — runs over dist/ after every build, forever, not once at
   migration. Five seconds. A missing title caught here beats a seven-minute
   Lighthouse run nobody waits for.

   The JSON.parse of every ld+json block is the whole point of the structured
   data half. Checking that a <script type="application/ld+json"> tag *exists*
   is a check that passes happily on a block Google has been discarding for
   years — one stray newline inside a JSON string literal and the entire block,
   every node in it, is thrown away with no error reported anywhere.
   --------------------------------------------------------------------------- */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('SEO LINT: no dist/ — run `astro build` first.');
  process.exit(1);
}

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith('.html') ? [p] : [];
  });

/* Attribute values arrive HTML-escaped: "Brian&#39;s Masonry" is 18 characters
   in the source and 15 in a search result. Decode before measuring anything, or
   every apostrophe on the site costs a phantom four characters — and a regex
   character class that excludes `'` silently stops matching at the entity. */
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const attr = (html, re) => {
  const m = html.match(re);
  return m ? decode(m[1]).trim() : null;
};

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const DESC = /<meta[^>]+name="description"[^>]+content="([^"]*)"/i;
const CANON = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i;
const meta = (name, kind = 'property') =>
  new RegExp(`<meta[^>]+${kind}="${name.replace(/[:]/g, '[:]')}"[^>]+content="([^"]*)"`, 'i');

/* Presence-and-shape checks. Length bounds are handled separately, on decoded
   text, so a failure can say what the actual length was. */
const need = {
  'og:title': { re: meta('og:title'), test: (v) => !!v },
  'og:description': { re: meta('og:description'), test: (v) => !!v },
  'og:image': { re: meta('og:image'), test: (v) => /^https?:\/\//.test(v ?? '') },
  'og:url': { re: meta('og:url'), test: (v) => /^https:\/\//.test(v ?? '') },
  'twitter:card': { re: meta('twitter:card', 'name'), test: (v) => !!v },
  'twitter:image': { re: meta('twitter:image', 'name'), test: (v) => /^https?:\/\//.test(v ?? '') },
};

const fails = [];
const warns = [];
let pages = 0;
let ldBlocks = 0;
let alt = 0;
let noalt = 0;
let h1Total = 0;

const canonicals = new Set();
const titles = new Map();
const descriptions = new Map();

for (const f of walk(dist)) {
  const html = readFileSync(f, 'utf8');
  pages++;
  const rel = f.slice(dist.length + 1).split(sep).join('/');

  for (const [k, { re, test }] of Object.entries(need)) {
    if (!test(attr(html, re))) fails.push([rel, `missing or malformed ${k}`]);
  }

  const title = attr(html, TITLE);
  if (!title) fails.push([rel, 'no <title>']);
  else if (title.length < 10 || title.length > 60)
    fails.push([rel, `title is ${title.length} chars, wanted 10-60 — "${title}"`]);

  const desc = attr(html, DESC);
  if (!desc) fails.push([rel, 'no meta description']);
  else if (desc.length < 50 || desc.length > 160)
    fails.push([rel, `description is ${desc.length} chars, wanted 50-160`]);

  /* Exactly one H1 per page. The old homepage had zero — every heading on it
     was an <h2>, including the one that says what the business does. */
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  h1Total += h1s.length;
  if (h1s.length === 0) fails.push([rel, 'no <h1>']);
  if (h1s.length > 1) fails.push([rel, `${h1s.length} <h1> elements, expected exactly 1`]);

  /* Canonical must be self-referential and trailing-slash, matching the old
     site's addresses and this build's sitemap. */
  const canon = attr(html, CANON);
  if (!canon || !/^https:\/\//.test(canon)) {
    fails.push([rel, 'missing or non-absolute canonical']);
  } else {
    if (!canon.endsWith('/')) fails.push([rel, `canonical has no trailing slash — ${canon}`]);
    if (canonicals.has(canon)) fails.push([rel, `duplicate canonical — ${canon}`]);
    canonicals.add(canon);
  }

  /* Duplicate titles and descriptions across pages are the classic thin-site
     signal. Report the collision, name both pages. */
  if (title) {
    if (titles.has(title)) fails.push([rel, `title duplicates ${titles.get(title)} — "${title}"`]);
    else titles.set(title, rel);
  }
  if (desc) {
    if (descriptions.has(desc)) fails.push([rel, `description duplicates ${descriptions.get(desc)}`]);
    else descriptions.set(desc, rel);
  }

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) fails.push([rel, 'no JSON-LD']);
  for (const b of blocks) {
    ldBlocks++;
    try {
      const parsed = JSON.parse(b[1]);
      const nodes = parsed['@graph'] ?? [parsed];
      for (const n of nodes) {
        if (!n['@type']) fails.push([rel, 'JSON-LD node with no @type']);
      }
    } catch (e) {
      fails.push([rel, `JSON-LD does not parse — ${e.message}`]);
    }
  }

  for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
    /\salt\s*=\s*["'][^"']+["']/i.test(img[0]) ? alt++ : noalt++;
  }
}

/* The sitemap must exist and must list only addresses this build produced. */
const sitemapIndex = join(dist, 'sitemap-index.xml');
let sitemapUrls = [];
if (!existsSync(sitemapIndex)) {
  fails.push(['sitemap-index.xml', 'not generated']);
} else {
  for (const f of readdirSync(dist).filter((n) => /^sitemap-\d+\.xml$/.test(n))) {
    const xml = readFileSync(join(dist, f), 'utf8');
    sitemapUrls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  for (const u of sitemapUrls) {
    if (!canonicals.has(u)) fails.push(['sitemap', `lists ${u}, which no page canonicalises to`]);
  }
  /* A noindexed address in the sitemap is a contradictory instruction. */
  for (const u of sitemapUrls) {
    const p = u.replace('https://briansmasonry.net', '');
    const file = join(dist, p === '/' ? 'index.html' : join(p, 'index.html'));
    if (existsSync(file) && /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(readFileSync(file, 'utf8')))
      fails.push(['sitemap', `lists ${u}, which is noindexed`]);
  }
}

if (!existsSync(join(dist, 'robots.txt'))) fails.push(['robots.txt', 'not present in dist/']);
if (noalt) warns.push(`${noalt} <img> without alt text — empty alt="" is correct for decorative images only`);

const p = (l, n) => console.log(`  ${String(l).padEnd(32, '.')} ${n}`);
console.log('\nSEO LINT\n');
p('pages', pages);
p('JSON-LD blocks', ldBlocks);
p('H1 elements', h1Total);
p('sitemap addresses', sitemapUrls.length);
p('images with alt', alt);
p('images without alt', noalt);
p('failures', fails.length);

if (warns.length) {
  console.log('\nNOTES:');
  for (const w of warns) console.log(`  ${w}`);
}

if (fails.length) {
  console.log('\nFAILURES:');
  for (const [f, why] of fails) console.log(`  ${f}\n    ${why}`);
  console.log('\nSEO LINT FAILED.\n');
  process.exit(1);
}
console.log('\nSEO LINT PASSED.\n');
