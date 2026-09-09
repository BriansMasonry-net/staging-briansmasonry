#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   build-image-manifest.mjs — record every resized variant WordPress already
   generated, so the site can serve a 150px icon instead of a 512px one.

   WordPress has been quietly producing these for years: for each upload it
   writes -150x150, -300x300, -768x768 and so on next to the original. The old
   site linked the originals anyway, which is how the homepage came to weigh
   8.9 MB. Nothing needs to move; the smaller files are already sitting there.

   The output is COMMITTED to the repo, deliberately. Reading the WordPress
   REST API at build time would work today and fail permanently at gate 16,
   when the old site is switched off — and it would fail by silently emitting
   no srcset, which is the kind of failure that passes. Re-run this by hand
   (`npm run images:manifest`) whenever images change, while the source is
   still reachable.

   The variant filenames are plain files under wp-content/uploads, so gate 5
   (rclone, whole-bucket copy) carries them to Backblaze along with the
   originals. Flipping IMAGE_HOST at gate 7 moves the whole srcset at once.
   --------------------------------------------------------------------------- */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://briansmasonry.net/wp-json/wp/v2/media';
const PREFIX = 'https://briansmasonry.net/wp-content/uploads/';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'image-manifest.json');

/* curl, not fetch: Node's fetch ignores HTTPS_PROXY, and behind a proxy it
   returns the interception page — which parses as HTML, not JSON, and would
   otherwise fail here with a confusing SyntaxError. */
const get = (url) =>
  JSON.parse(execFileSync('curl', ['-sSL', '--max-time', '60', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const all = [];
for (let page = 1; page <= 20; page++) {
  const batch = get(`${API}?per_page=100&page=${page}&_fields=source_url,media_details`);
  if (!Array.isArray(batch) || !batch.length) break;   // page past the end returns an error object
  all.push(...batch);
  if (batch.length < 100) break;
}

const manifest = {};
for (const m of all) {
  const url = m.source_url ?? '';
  if (!url.startsWith(PREFIX)) continue;
  const d = m.media_details ?? {};
  if (!d.width || !d.height) continue;

  const key = url.slice(PREFIX.length);
  const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';

  /* The original, plus every generated size, de-duplicated by width.
     `b` is the file size in bytes, so bin/check-image-weight.mjs can total up
     a page's real payload without hitting the network. */
  const variants = new Map([[d.width, { w: d.width, h: d.height, b: d.filesize ?? 0, path: key }]]);
  for (const s of Object.values(d.sizes ?? {})) {
    if (!s.width || !s.height || !s.file) continue;
    if (!variants.has(s.width))
      variants.set(s.width, { w: s.width, h: s.height, b: s.filesize ?? 0, path: dir + s.file });
  }

  manifest[key] = {
    w: d.width,
    h: d.height,
    variants: [...variants.values()].sort((a, b) => a.w - b.w),
  };
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(manifest, null, 1) + '\n');

const count = Object.keys(manifest).length;
const total = Object.values(manifest).reduce((n, m) => n + m.variants.length, 0);
console.log(`image manifest: ${count} images, ${total} variants -> src/data/image-manifest.json`);
