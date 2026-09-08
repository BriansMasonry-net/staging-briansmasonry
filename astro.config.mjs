import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://briansmasonry.net',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      // /thank-you/ is noindex — a sitemap entry would ask Google to crawl a
      // page we have told it not to index.
      filter: (page) => !page.endsWith('/thank-you/'),
    }),
  ],
});
