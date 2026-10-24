# staging-briansmasonry

Astro rebuild of briansmasonry.net — staging.

Part of the TBOX Studio WordPress → Astro migration. Replaces a WordPress 7.1 /
Elementor 4.1.5 site hosted on Cloudways.

## Run locally

    npm install
    cp .dev.vars.example .dev.vars   # add a Resend key to send mail locally
    npm run dev      # http://localhost:4321
    npm run build    # -> dist/
    npm run preview  # wrangler dev, against the built Worker

## Structure

    src/layouts/Base.astro       design tokens + global CSS
    src/components/              Header, Footer, Hero, EstimateForm,
                                 Testimonials, Gallery, ServiceHero,
                                 ServiceGrid, Faq, ClosingCta
    src/pages/                   index + 4 service pages + thank-you
    src/pages/api/contact.ts     the one on-demand route — posts to Resend
    wrangler.jsonc               Worker config for Cloudflare deploys
    src/components/Seo.astro     every <head> metadata tag, one file
    src/components/Analytics.astro   Google Ads tag, carried from the old site
    seo.config.ts                site-wide SEO + NAP, single source of truth
    bin/check-seo.mjs            build-time SEO lint over dist/
    public/robots.txt            carried from the old site
    public/_redirects            old sitemap addresses only (gate 14 owns the rest)
    src/components/Img.astro     responsive <img> from the variant manifest
    src/data/image-manifest.json every size WordPress generated (committed)
    bin/build-image-manifest.mjs regenerates it from the live WP media API
    bin/check-image-weight.mjs   per-page image budget, fails the build

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

Every image is served from the Backblaze B2 bucket `briansmasonry-img`, fronted
by Cloudflare at `https://img.briansmasonry.net` (AD-9). Nothing is hotlinked to
the WordPress origin.

The host is defined once, in `src/lib/images.js`, exported as `IMG`. Object keys
mirror the old uploads tree with the `wp-content/uploads` prefix dropped, which
keeps the gate 14 images redirect one-to-one:

    /wp-content/uploads/2024/12/stones.png  ->  ${IMG}/2024/12/stones.png

Moved here on 2026-10-24. All 184 objects were copied (not synced) from
`staging-briansmasonry-img`, which still answers at `img.staging.briansmasonry.net`
but is no longer referenced. The `img` DNS record is a proxied CNAME to
`f005.backblazeb2.com`; the transform rule "B2 bucket path for img" adds the
`/file/briansmasonry-img` prefix. The bucket also holds 12 `_derivatives/` files
from the retired gallery project (now `gallery.briansmasonry.net`); they share
no keys with this site.

### The images redirect (gate 14)

A zone Redirect Rule, **"Old WordPress uploads → img.briansmasonry.net"**, sends
`https://briansmasonry.net/wp-content/uploads/*` to the same path on the image
host with a 301. It exists but is **disabled until cutover**: while WordPress is
still the live site, enabling it would also redirect WordPress's own Elementor
stylesheets under `/wp-content/uploads/elementor/` and break the old site.
Enable it in the same sitting as attaching the domain.

## Deploying

The isolated staging Worker is staging-briansmasonry, serving only
staging.briansmasonry.net as verified on 22 October 2026. Workers Builds now
has a staging-branch deploy trigger and a non-production-branch version-upload
trigger. These supersede the original manual-only deployment setup. Never
assume a push is inert: inspect the provider configuration before publishing.
The review uses an exact feature-branch commit and leaves production WordPress
unchanged. See docs/review-2026-10-22/REVIEW.md.

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

1. Service page titles stay as the old site had them ("Chimney Repair &
   Rebuilds – Brian's Masonry"). PR #3 proposed "… in the GTA | Brian's
   Masonry"; that change was held back so the cutover does not move titles
   and addresses on the same day. Revisit it once rankings settle.

2. The four service pages and thank-you are styled by inference. Their own
   Elementor stylesheets return 404 on the live server:
   post-1097, post-1101, post-1109, post-1115, post-1078.
   Regenerating them in Elementor would allow an exact port.

3. Delivery to the client's own inbox is proven to the Yahoo server, not to
   the inbox. On 2026-10-24 a test lead (Resend id 01a16f4d-18e0-…) went from
   forms@brandingcentres.com to briansmasonry@ymail.com with the visitor as
   Reply-To, and Resend reports it delivered. Whether Yahoo filed it in the
   inbox or in spam is only visible from Brian's side.


## Contact form → Resend

`src/pages/api/contact.ts` takes the estimate form and sends it with Resend.
It is the only on-demand route on the site; every content page carries
`export const prerender = true` and is served as a file. The route carries
`export const prerender = false` — a prerendered API route ships as a static
file and silently accepts nothing.

### Addressing

    From ......  forms@brandingcentres.com — the shared agency domain
    To ........  the client's inbox (briansmasonry@ymail.com)
    Reply-To ..  the visitor, so hitting reply answers the customer

**This site sends from the shared domain, the stack default (AD-3).** Until
2026-10-24 it sent from briansmasonry.net itself, as a documented exception:
the zone publishes no MX and no apex SPF, so there was no client mail to
protect. That stopped working when briansmasonry.net dropped off Resend — the
Worker's key, restricted to that domain, began failing with "The associated
domain with your API key is not verified" — and the Resend plan is at its
domain limit, so it could not be re-added. The DKIM and `send.` records on the
zone are left in place, unused. To go back to the client's own domain: free a
domain slot on Resend, re-add briansmasonry.net (its DKIM value will change),
create a key restricted to it, and set `CONTACT_FROM`.

The visitor's address is never put in From — receiving servers read that as
forgery — it goes in Reply-To. (The gate-11 note in wp-15 says Reply-To should
be the client's own address; that would have Brian replying to himself, so this
build sends the visitor instead. Set CONTACT_REPLY_TO to override.)

### Configuration

`RESEND_API_KEY` goes on the Worker under **Settings → Variables & Secrets** as
a **secret**. A key added under Build settings is present while the build runs
and absent when the route executes: the build passes and the form fails in
production. Locally it comes from `.dev.vars` (git-ignored; see
`.dev.vars.example`).

| Variable | Where | Default |
|---|---|---|
| `RESEND_API_KEY` | Worker secret | none — the route 500s without it |
| `CONTACT_FROM` | Worker variable | `Brian's Masonry Website <forms@brandingcentres.com>` |
| `CONTACT_TO` | Worker variable | `briansmasonry@ymail.com` |
| `CONTACT_REPLY_TO` | Worker variable | the visitor's own address |
| `TURNSTILE_SECRET_KEY` | Worker secret, optional | unset — no challenge |
| `PUBLIC_TURNSTILE_SITE_KEY` | build variable, optional | unset — no widget |

Turnstile is off until both halves are set. Set both or neither: the widget
only renders with the site key, and the route only verifies with the secret.

Three things run regardless of Turnstile:

- a **honeypot** field, deliberately NOT named `company` — browser address
  autofill maps that name to `organization` and would fill it for a real
  person, silently binning the lead;
- a **per-IP cap** of 5 posts an hour, counted in the Worker's existing SESSION
  KV namespace. It fails open: if KV is unavailable the lead still goes
  through, because losing a customer costs more than receiving a spam message;
- an **idempotency key** derived from the submission itself, so a double-click
  or a retry after a timeout collapses into one email at Resend.

A WAF rate-limit rule on the same Cloudflare account is still the hard edge.

### Responses

| Case | JSON caller | Form post |
|---|---|---|
| accepted | `202 {ok, id}` | `303 → /thank-you/` |
| honeypot filled | `202 {ok}` (dropped) | `303 → /thank-you/` (dropped) |
| missing/invalid fields | `400 invalid` | `303 → <page>?error=invalid#<form id>` |
| body over 64 KB | `413 toobig` | `303 → ...?error=toobig` |
| challenge failed | `403 challenge` | `303 → ...?error=challenge` |
| over 5 posts/hour from one IP | `429 toomany` | `303 → ...?error=toomany` |
| key missing at runtime | `500 server` | `303 → ...?error=server` |
| Resend busy (429/5xx/quota) | `503 busy` | `303 → ...?error=busy` |
| Resend silent past 12s | `504 busy` | `303 → ...?error=busy` |
| Resend rejected the send | `502 send` | `303 → ...?error=send` |
| not POST | `405` | `405` |

The form posts without JavaScript. A small inline script only turns `?error=`
into a message above the form. Form-encoded posts must carry an `Origin`
header — Astro's CSRF check rejects them otherwise, which browsers satisfy but
`curl` does not unless you pass `-H 'Origin: ...'`.

### Proof

    curl -s -o /dev/null -w '%{http_code}\n' -X POST \
      https://<preview-host>/api/contact \
      -H 'Content-Type: application/json' \
      -d '{"name":"Test","email":"you@example.com","phone":"4162444113"}'

    curl -s https://api.resend.com/emails/<id> -H "Authorization: Bearer $RESEND_API_KEY" \
      | jq '{id,from,to,reply_to,subject,last_event}'

Then open the message in the client's inbox and hit reply: it must address the
client, not the sending domain. Re-check `dig +short MX briansmasonry.net` and
`dig +short TXT briansmasonry.net` against the gate 0.3 baseline — every gate
that touches mail re-proves the client's own mail survived it.


## What is deployed, and where the key lives

    Worker ............ staging-briansmasonry (Cloudflare account
                        Ash@brandingcentres.com's, 47a8235...)
    Addresses ......... https://briansmasonry.net (live since 2026-10-24)
                        https://staging.briansmasonry.net (noindex)
                        www, http:// and no-trailing-slash addresses 301 to
                        the apex via zone redirect rules; Always Use HTTPS on.
    Rollback .......... remove the briansmasonry.net Custom Domain, re-create
                        A briansmasonry.net 134.122.42.18 (proxied), and
                        disable the three zone redirect rules. WordPress on
                        Cloudways is still running at that address.
    Secret ............ RESEND_API_KEY, secret_text on the Worker
    Resend API key .... "staging-briansmasonry worker — brandingcentres.com",
                        sending_access, restricted to brandingcentres.com
                        (created 2026-10-24; replaces the briansmasonry.net key)
    Sending domain .... brandingcentres.com, verified on Resend.
                        briansmasonry.net is no longer on Resend. Its old
                        records remain in the client's zone, unused:
                          TXT resend._domainkey  (DKIM)
                          TXT send               v=spf1 include:amazonses.com ~all
                          MX  send  10           feedback-smtp.us-east-1.amazonses.com
                        The apex carries none of these and must stay that way.

`wrangler.jsonc` sets `workers_dev: false` and `preview_urls: false` on
purpose. Without them every `wrangler deploy` re-enables a public
`*.workers.dev` hostname and per-version preview URLs, which puts the client's
unfinished site on the open internet under a second name. Note that wrangler
reads its deploy config from the adapter's generated `dist/server/wrangler.json`,
so if those flags ever stop taking effect, turn the subdomain off directly:

    curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
      -H 'Content-Type: application/json' --data '{"enabled":false,"previews_enabled":false}' \
      https://api.cloudflare.com/client/v4/accounts/<account>/workers/scripts/staging-briansmasonry/subdomain

Secrets cannot be changed while an undeployed version exists — `wrangler secret
put` fails with "deploy the latest version first". Deploy, then set secrets.

### Proven on 2026-09-04

    route deployed ............ yes, /api/contact answers on staging
    prerendered ............... no
    secret at runtime ......... yes, Worker secret (not a build variable)
    build-time key inlining ... none — a canary key in the build env does not
                                appear anywhere in dist/
    GET / bad fields / 64KB ... 405 / 400 / 413, no mail sent
    honeypot .................. 202, dropped, no mail sent
    rate limit ................ 6th post in an hour returns 429
    one real submission ....... 202, Resend id cf9eca5c-…, last_event delivered
    from ...................... Brian's Masonry Website <forms@brandingcentres.com>
    reply_to .................. the visitor's address
    client MX / TXT / DMARC ... unchanged: 0 MX, 0 apex TXT, 1 DMARC — identical
                                to the pre-work baseline

The one test message was addressed to Paolo@tboxstudio.com via a temporary
`CONTACT_TO` secret, which has since been deleted so the code default (the
client's inbox) applies. **Delivery to briansmasonry@ymail.com has therefore
not been proven** — Yahoo's spam filtering and Brian's reply behaviour are
still untested, and that is what gate 11's SEE step asks for.


## Staging must not be indexed

`public/_headers` sets `X-Robots-Tag: noindex, nofollow`, scoped to
`https://staging.briansmasonry.net/*`.

Two things make that scoping load-bearing. Every page's canonical points at
`https://briansmasonry.net/`, so an indexed preview would compete with the
client's live site. And at the domain cutover the real domain is attached to
**this same Worker** — an unscoped `/*` rule would follow it into production and
quietly deindex the business.

It lives in `public/` so it survives every deploy. The build before this one
served the header from a `_headers` file that existed only inside the build
output and never in git, so the first redeploy from a clean checkout silently
dropped it and left the preview indexable. Check the header after any deploy:

    curl -sD - -o /dev/null https://staging.briansmasonry.net/ | grep -i x-robots-tag

Cloudflare applies `_headers` only to static asset responses — `/api/contact` is
the Worker script and sets its own.
