import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://briansmasonry.net',

  /* The old WordPress site served, canonicalised to, and listed in its sitemap
     addresses WITH a trailing slash — /chimney-repair-rebuilds/, not
     /chimney-repair-rebuilds. Every one of those addresses has whatever link
     equity it has under that exact form. This has to agree in three places or
     the site canonicalises to addresses its own sitemap does not list:
       here                       trailingSlash: 'always'
       @astrojs/sitemap           inherits it from this config
       wrangler.jsonc (gate 9)    "html_handling": "auto-trailing-slash"  */
  trailingSlash: 'always',
  build: { format: 'directory' },

  integrations: [
    sitemap({
      /* /thank-you/ was in the old wp-sitemap. It is a post-submission page:
         it cannot rank, it should not be a landing page from search, and it
         fires the Ads Lead Form conversion — so an organic visitor arriving
         on it would log a false conversion. It is noindexed in the page, and
         a noindexed address must not be advertised in the sitemap. */
      filter: (page) => !page.endsWith('/thank-you/'),
      serialize(item) {
        item.lastmod = new Date().toISOString();
        if (item.url === 'https://briansmasonry.net/') {
          item.changefreq = 'weekly';
          item.priority = 1.0;
        } else {
          item.changefreq = 'monthly';
          item.priority = 0.8;
        }
        return item;
      },
    }),
  ],
});
