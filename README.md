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
is hotlinked to the WordPress origin any more.

The host lives in one place — `src/config/images.ts`, exported as `IMG`. Object
keys mirror the old uploads tree with the `wp-content/uploads` prefix dropped:

    /wp-content/uploads/2024/12/stones.png  ->  ${IMG}/2024/12/stones.png

## Deploying — READ THIS FIRST

**Do not run `wrangler deploy` from this repo. It would take the staging site
backwards.**

staging.briansmasonry.net is the Worker `staging-briansmasonry`, deployed by
hand with wrangler (ash@brandingcentres.com, 2026-09-05). There is no Workers
Builds connection and no CI — pushing to `main` deploys nothing.

**The deployed Worker was built from a source tree that is ahead of this repo.**
It serves things that exist in no commit here:

| Live on the Worker | In this repo |
|---|---|
| `/api/contact` — validates, returns JSON, backed by a `RESEND_API_KEY` secret | nothing |
| Form fields `robots` (honeypot), `form_ref`, `source` | absent — the form has 5 fields, the live one has 8 |
| `public/_headers` — staging noindex + immutable `/_astro/*` caching | absent |
| `wrangler.jsonc`, `@astrojs/cloudflare`, a 404 page | absent |
| Bindings `ASSETS`, `IMAGES`, `SESSION` (KV `a1314bcb…`) | n/a |
| compatibility_date 2026-09-03, flags `nodejs_compat` | n/a |

A deploy from this repo therefore 404s the contact form and drops the noindex
header. **That second one has already happened once on this site** — the comment
in the deployed `_headers` records a redeploy silently dropping a noindex that
lived only in build output and not in git. That is what this section exists to
stop repeating.

Recovering Ash's tree into git is the open task. The deployed `_headers` is
recoverable verbatim from the Worker version API and reads:

    /_astro/*
      Cache-Control: public, max-age=31536000, immutable

    https://staging.briansmasonry.net/*
      X-Robots-Tag: noindex, nofollow

The noindex is scoped to the staging hostname deliberately: the client's real
domain is attached to this same Worker at cutover, and an unscoped `/*` rule
would carry noindex onto the production site and deindex the business.

## Known gaps

1. The deployed Worker's source is not in this repo — see **Deploying** above.
   Until it is, this repo cannot reproduce what is live.

2. `package.json` declares no dependencies — `astro` is not installed by
   `npm install`, so the build only runs after adding it by hand.

3. The four service pages and thank-you are styled by inference. Their own
   Elementor stylesheets return 404 on the live server:
   post-1097, post-1101, post-1109, post-1115, post-1078.
   Regenerating them in Elementor would allow an exact port.

4. ~~The contact form posts to /api/contact, which does not exist yet.~~
   Stale — the endpoint is live on the deployed Worker (gate 11 appears done).
   Its source is part of the tree missing from this repo.
