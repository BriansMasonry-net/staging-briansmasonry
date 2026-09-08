#!/usr/bin/env node
/* ------------------------------------------------------------------
   Reads what was actually built and refuses to let it ship broken.

   Seo.astro validates what a page hands it; this checks the output, so
   a page that bypasses the component, or an integration that changes
   the head, still gets caught. Runs as part of `npm run build`.

   Every JSON-LD block is parsed, not pattern-matched: malformed
   structured data is silently ignored by search engines, which is the
   worst failure mode — it looks fine and does nothing.
   ------------------------------------------------------------------ */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const failures = [];

function pages(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return pages(full);
    return full.endsWith('.html') ? [full] : [];
  });
}

/** Entities are how the value is stored, not how it is read — measure the text. */
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function one(html, re) {
  const m = html.match(re);
  return m ? decode(m[1].trim()) : null;
}

for (const file of pages(DIST).sort()) {
  const page = '/' + relative(DIST, file).replace(/index\.html$/, '');
  const html = readFileSync(file, 'utf8');
  const fail = (msg) => failures.push(`${page}  ${msg}`);

  const head = one(html, /<head[^>]*>([\s\S]*?)<\/head>/i) ?? '';
  const title = one(head, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = one(head, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const canonical = one(head, /<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const robots = one(head, /<meta\s+name="robots"\s+content="([^"]*)"/i);

  if (!title) fail('no <title>');
  else if (title.length > 65) fail(`title is ${title.length} characters (max 65)`);

  if (!desc) fail('no meta description');
  else if (desc.length < 50 || desc.length > 160) fail(`meta description is ${desc.length} characters (50-160)`);

  if (!canonical) fail('no canonical link');
  else if (!canonical.startsWith('https://')) fail(`canonical is not absolute: ${canonical}`);

  if (!robots) fail('no robots meta');

  for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
    if (!head.includes(`property="${tag}"`)) fail(`missing ${tag}`);
  }
  if (!head.includes('name="twitter:card"')) fail('missing twitter:card');
  if (!/rel="icon"/i.test(head)) fail('no favicon link');
  if (!/rel="apple-touch-icon"/i.test(head)) fail('no apple-touch-icon link');

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) fail('no JSON-LD');
  for (const [, body] of blocks) {
    try {
      const parsed = JSON.parse(body);
      const nodes = parsed['@graph'] ?? [parsed];
      if (!nodes.length) fail('JSON-LD graph is empty');
      for (const node of nodes) {
        if (!node['@type']) fail(`JSON-LD node with no @type: ${JSON.stringify(node).slice(0, 80)}`);
      }
    } catch (err) {
      fail(`JSON-LD does not parse: ${err.message}`);
    }
  }

  // A noindex page must not be advertised in the sitemap.
  if (robots?.includes('noindex')) {
    const sitemapFile = join(DIST, 'sitemap-0.xml');
    if (existsSync(sitemapFile) && readFileSync(sitemapFile, 'utf8').includes(`${canonical}<`)) {
      fail('is noindex but listed in the sitemap');
    }
  }
}

if (!existsSync(join(DIST, 'robots.txt'))) failures.push('/  no robots.txt in the build');
if (!existsSync(join(DIST, 'sitemap-index.xml'))) failures.push('/  no sitemap-index.xml in the build');

if (failures.length) {
  console.error(`\ncheck-seo: ${failures.length} problem${failures.length === 1 ? '' : 's'}\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('');
  process.exit(1);
}

console.log(`check-seo: ${pages(DIST).length} pages OK`);
