import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Every content page is prerendered (`export const prerender = true`).
// The adapter is here for one on-demand route: src/pages/api/contact.ts,
// which posts the estimate form to Resend.
export default defineConfig({
  site: 'https://briansmasonry.net',
  build: { format: 'directory' },
  adapter: cloudflare(),
});
