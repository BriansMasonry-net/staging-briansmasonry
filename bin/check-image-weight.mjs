#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   check-image-weight.mjs — total what each built page actually costs in
   images, and fail the build if a page regresses past its budget.

   The homepage weighed 8.9 MB when this was written: 31 full-resolution
   originals, including a 1920x2112 award badge drawn at 115px and twelve
   portfolio photographs behind 343px thumbnails. Nothing reported it, because
   nothing was measuring it. A budget that fails the build is the only thing
   that keeps a page from drifting back — the next person to add a hero image
   finds out in CI, not from the client six months later.

   Two numbers per page:
     initial  what a browser fetches before scrolling — eager images only.
              This is what Largest Contentful Paint is spent on.
     total    every image on the page, lazy ones included.

   Byte sizes come from src/data/image-manifest.json, which records what
   WordPress reported for each variant. No network access needed, so this
   still works after the old site is switched off at gate 16.
   --------------------------------------------------------------------------- */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMG } from '../src/lib/images.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The Cloudflare adapter puts the static output under dist/client; a plain
   static build puts it at dist/. Check both, or this walks an empty tree and
   reports a clean pass over nothing. */
const distRoot = join(root, 'dist');
const dist = existsSync(join(distRoot, 'client')) ? join(distRoot, 'client') : distRoot;

/* The image host, from the one place it is defined. This was hardcoded to the
   old WordPress origin, so once the images moved to Backblaze every `src`
   stopped matching, nothing was counted, and the budget passed on zero
   images — a check that sees nothing always passes. */
const PREFIX = `${IMG}/`;

/* Ceilings in KB. Tight enough to catch a full-size image slipping back in,
   loose enough not to trip on a genuine content addition. Raise one
   deliberately, with a reason, never to make a red build go green. */
const BUDGET_KB = { initial: 200, total: 1800 };

/* Measured at this viewport, DPR 1 — a normal desktop browser. */
const VIEWPORT = 1440;

/* A page allowed over `total` with the reason printed on every single build.
   This is not a raised budget: the number stays, the page is reported as over
   it, and the waiver says what has to happen for it to come off. Silently
   moving the ceiling to whatever the page costs today is how a budget stops
   meaning anything. */
const WAIVERS = {
  'index.html':
    'three photographs are saved as PNG and account for ~2.6 MB of this on their own ' +
    '(chimney 1300 KB, pillar-after 685 KB, pillar-before 670 KB). For scale, ' +
    'tower-before.jpg is the same 750x1334 as pillar-before.png and weighs 144 KB — ' +
    'the PNG is 15x heavier for no visible gain. Re-encode them to WebP when the ' +
    'images move to Backblaze at gate 5. That is a re-encode, not a resize, so no ' +
    'amount of srcset work in this repo can fix it.',
};

if (!existsSync(dist)) {
  console.error('IMAGE WEIGHT: no dist/ — run `astro build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, 'src/data/image-manifest.json'), 'utf8'));
const bytesByPath = new Map();
for (const entry of Object.values(manifest))
  for (const v of entry.variants) bytesByPath.set(v.path, v.b);

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith('.html') ? [p] : [];
  });

const attrOf = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1] ?? null;
const kb = (b) => Math.round(b / 1024);

/* Resolve a `sizes` attribute to a CSS pixel width at VIEWPORT — the first
   clause whose media condition matches wins, exactly as the browser does it.
   Without this, "initial payload" would be the bytes of the fallback `src`,
   which is the one file a modern browser is guaranteed NOT to download. */
function resolveSizes(sizes) {
  if (!sizes) return null;
  for (const clause of sizes.split(',').map((c) => c.trim())) {
    const m = clause.match(/^(?:\((?<cond>[^)]*)\)\s+)?(?<len>[\d.]+)(?<unit>vw|px)$/);
    if (!m) continue;
    const { cond, len, unit } = m.groups;
    if (cond) {
      const mx = cond.match(/max-width:\s*(\d+)px/);
      const mn = cond.match(/min-width:\s*(\d+)px/);
      if (mx && VIEWPORT > Number(mx[1])) continue;
      if (mn && VIEWPORT < Number(mn[1])) continue;
    }
    return unit === 'vw' ? (Number(len) / 100) * VIEWPORT : Number(len);
  }
  return null;
}

/* Which file the browser actually fetches for this <img> at VIEWPORT. */
function chosenPath(tag) {
  const srcset = attrOf(tag, 'srcset');
  const src = attrOf(tag, 'src');
  const fallback = src?.startsWith(PREFIX) ? src.slice(PREFIX.length) : null;
  if (!srcset) return fallback;

  const cands = srcset
    .split(',')
    .map((e) => e.trim().match(/^(\S+)\s+(\d+)w$/))
    .filter(Boolean)
    .map(([, u, w]) => ({ path: u.startsWith(PREFIX) ? u.slice(PREFIX.length) : u, w: Number(w) }))
    .sort((a, b) => a.w - b.w);
  if (!cands.length) return fallback;

  const need = resolveSizes(attrOf(tag, 'sizes'));
  if (need == null) return cands[cands.length - 1].path;
  return (cands.find((c) => c.w >= need) ?? cands[cands.length - 1]).path;
}

const rows = [];
const fails = [];
const waived = [];
const unknown = new Set();
const oversized = [];
const heavy = [];

for (const f of walk(dist)) {
  const html = readFileSync(f, 'utf8');
  const rel = f.slice(dist.length + 1).split(sep).join('/');
  let initial = 0;
  let total = 0;
  let count = 0;
  let responsive = 0;

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = attrOf(tag, 'src');
    if (!src || !src.startsWith(PREFIX)) continue;
    count++;
    if (attrOf(tag, 'srcset')) responsive++;

    const path = chosenPath(tag) ?? src.slice(PREFIX.length);
    const b = bytesByPath.get(path);
    if (b === undefined) {
      unknown.add(path);
      continue;
    }
    total += b;
    if ((attrOf(tag, 'loading') ?? 'eager') !== 'lazy') initial += b;

    /* A single file over this is almost always a photograph saved as PNG. */
    if (b > 250 * 1024) heavy.push(`${rel}: ${path} — ${kb(b)} KB`);

    /* An image whose default src is far wider than it is ever drawn at means
       a displayWidth is missing or wrong on the <Img>. */
    const w = Number(attrOf(tag, 'width'));
    const sizes = attrOf(tag, 'sizes') ?? '';
    const fixed = sizes.match(/(\d+)px\s*$/);
    if (w && fixed && w > Number(fixed[1]) * 2.5)
      oversized.push(`${rel}: ${path} is ${w}px wide, drawn at ${fixed[1]}px`);
  }

  rows.push({ rel, count, responsive, initial, total });
  if (kb(initial) > BUDGET_KB.initial)
    fails.push(`${rel}: eager images ${kb(initial)} KB, budget ${BUDGET_KB.initial} KB`);
  if (kb(total) > BUDGET_KB.total) {
    const why = WAIVERS[rel];
    if (why) waived.push(`${rel}: ${kb(total)} KB against a ${BUDGET_KB.total} KB budget — ${why}`);
    else fails.push(`${rel}: all images ${kb(total)} KB, budget ${BUDGET_KB.total} KB`);
  }
}

console.log('\nIMAGE WEIGHT\n');
console.log(`  ${'page'.padEnd(34)}${'imgs'.padStart(5)}${'srcset'.padStart(8)}${'initial'.padStart(10)}${'total'.padStart(9)}`);
for (const r of rows.sort((a, b) => b.total - a.total))
  console.log(
    `  ${r.rel.padEnd(34)}${String(r.count).padStart(5)}${String(r.responsive).padStart(8)}` +
      `${(kb(r.initial) + ' KB').padStart(10)}${(kb(r.total) + ' KB').padStart(9)}`,
  );
console.log(`\n  measured at a ${VIEWPORT}px viewport, DPR 1 — the file srcset actually picks`);
console.log(`  budget: initial ${BUDGET_KB.initial} KB, total ${BUDGET_KB.total} KB per page`);

if (heavy.length) {
  console.log('\nHEAVY SOURCE FILES (re-encode, not resize):');
  for (const x of [...new Set(heavy)]) console.log(`  ${x}`);
}
if (waived.length) {
  console.log('\nOVER BUDGET, WAIVED:');
  for (const w of waived) console.log(`  ${w}`);
}

if (unknown.size) {
  console.log('\nNOT IN MANIFEST (served at full size, no srcset):');
  for (const u of unknown) console.log(`  ${u}`);
  console.log('  -> run `npm run images:manifest` while the source site is still up.');
}
if (oversized.length) {
  console.log('\nOVERSIZED (check displayWidth on the <Img>):');
  for (const o of oversized) console.log(`  ${o}`);
}
if (fails.length) {
  console.log('\nOVER BUDGET:');
  for (const f of fails) console.log(`  ${f}`);
  console.log('\nIMAGE WEIGHT FAILED.\n');
  process.exit(1);
}
console.log('\nIMAGE WEIGHT PASSED.\n');
