# staging-briansmasonry

Astro rebuild of briansmasonry.net — staging.

Part of the TBOX Studio WordPress → Astro migration. Replaces a WordPress 7.1 /
Elementor 4.1.5 site hosted on Cloudways.

## Run locally

    npm install
    npm run dev      # http://localhost:4321
    npm run build    # -> dist/

## Structure

    src/layouts/Base.astro       design tokens + global CSS
    src/components/              Header, Footer, Hero, EstimateForm,
                                 Testimonials, Gallery, ServiceHero,
                                 ServiceGrid, Faq, ClosingCta
    src/pages/                   index + 4 service pages + thank-you

## Where the design came from

CSS values are ported from the live site's Elementor stylesheets, not eyeballed.
Each block carries the originating Elementor element id in a comment.

    post-939.css    global kit    colours, container widths, spacing
    post-1000.css   header template
    post-943.css    home page
    post-1005.css   footer template

Brand tokens: #243F98 blue, #BD2031 red, #F7F7F7 page, 5px radius,
1400px content width, Helvetica stack (Roboto loads on the live site but
does not win the cascade).

## Images

Every image is served from the Backblaze B2 bucket `staging-briansmasonry-img`,
fronted by Cloudflare at `https://img.staging.briansmasonry.net` (AD-9). Nothing
is hotlinked to the WordPress origin.

The host is defined once, in `src/lib/images.js`, exported as `IMG`. Object keys
mirror the old uploads tree with the `wp-content/uploads` prefix dropped, which
keeps the gate 18 redirects one-to-one:

    /wp-content/uploads/2024/12/stones.png  ->  ${IMG}/2024/12/stones.png

That hostname is permanent, not staging-only. The conventional
`img.briansmasonry.net` belongs to the gallery project, which has its own bucket
and transform rule on the same zone.

## Deploying

staging.briansmasonry.net is the Worker `staging-briansmasonry`, deployed with
`npx wrangler deploy`. There is no Workers Builds connection and no CI, so
**pushing to `main` deploys nothing** — a deploy is always someone running that
command against a checkout.

That makes it worth knowing which branch a deploy came from, because the work on
this site lives in unmerged branches and `main` is still the first commit. Before
deploying, check what the Worker is actually running (the version API reports its
compatibility date, assets config and bindings) against the branch in hand.

`wrangler.jsonc` sets `workers_dev: false` and `preview_urls: false` — without
them every deploy publishes the client's unfinished site on a public
`*.workers.dev` URL.

`public/_headers` carries the staging noindex. It is scoped to the staging
hostname on purpose: the client's real domain is attached to this same Worker at
cutover, and an unscoped `/*` rule would carry noindex onto the production site
and deindex the business. It lives in `public/` so it survives every deploy — an
earlier build served that header from a file that existed only in build output,
and the first redeploy silently dropped it.

Runtime secrets (`RESEND_API_KEY`) are Worker secrets, not build variables, and
persist across deploys. `wrangler deploy` does not touch them.

## Known gaps

1. `main` is one commit behind everything. The site's real work — the contact
   endpoint, the image host, SEO, image optimisation — sits in unmerged
   `claude/*` branches. Anyone starting fresh from `main` will rebuild what
   already exists; that has happened at least once.

2. The four service pages and thank-you are styled by inference. Their own
   Elementor stylesheets return 404 on the live server:
   post-1097, post-1101, post-1109, post-1115, post-1078.
   Regenerating them in Elementor would allow an exact port.
