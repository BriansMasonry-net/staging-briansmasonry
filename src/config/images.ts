/**
 * Single source of truth for the image host (AD-9).
 *
 * Every image the site serves is requested from the Backblaze B2 bucket
 * `staging-briansmasonry-img`, fronted by Cloudflare at this hostname.
 * Nothing is hotlinked to the WordPress origin — those references return 200
 * to a browser sitting on briansmasonry.net and are blocked everywhere else.
 *
 * Object keys mirror the old `wp-content/uploads/` tree exactly, minus that
 * prefix: `/wp-content/uploads/2024/12/stones.png` -> `${IMG}/2024/12/stones.png`.
 */
export const IMG = 'https://img.staging.briansmasonry.net';
