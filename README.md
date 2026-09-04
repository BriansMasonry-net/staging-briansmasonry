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

## Known gaps

1. Images are hotlinked to briansmasonry.net and are blocked cross-origin.
   They will not render from any other origin, including the Railway preview
   URL. Fixed by moving them to Backblaze B2 (migration gates 4-5).

2. The four service pages and thank-you are styled by inference. Their own
   Elementor stylesheets return 404 on the live server:
   post-1097, post-1101, post-1109, post-1115, post-1078.
   Regenerating them in Elementor would allow an exact port.

3. The Resend send path has not been proven end to end. Every other branch of
   /api/contact has (405, 400, honeypot, missing key, provider rejection), but a
   real delivery needs the Worker secret set — see below.


## Contact form → Resend

`src/pages/api/contact.ts` takes the estimate form and sends it with Resend.
It is the only on-demand route on the site; every content page carries
`export const prerender = true` and is served as a file. The route carries
`export const prerender = false` — a prerendered API route ships as a static
file and silently accepts nothing.

### Addressing

    From ......  forms@briansmasonry.net — the client's own domain
    To ........  the client's inbox (briansmasonry@ymail.com)
    Reply-To ..  the visitor, so hitting reply answers the customer

**This site sends from the client's own domain, which is a deliberate exception
to the stack default** (wp-15 says to send from the shared TBOX domain and never
from the client's). The rule exists to protect a client's existing mail, and
this zone had almost none to protect: briansmasonry.net publishes no MX — Brian
reads mail at Yahoo, on ymail.com — and no apex SPF. Setting it up added three
records on `resend._domainkey` and a `send.` subdomain and touched nothing at
the apex, which still has 0 MX and 0 TXT.

It also fixed a latent problem rather than creating one. The domain already
published `DMARC p=quarantine` with no SPF and no DKIM to satisfy it, so
anything claiming to be from briansmasonry.net was destined for the spam
folder. It now has aligned DKIM and SPF.

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
| `CONTACT_FROM` | Worker variable | `Brian's Masonry Website <forms@briansmasonry.net>` |
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
    Address ........... https://staging.briansmasonry.net — the ONLY one.
    Secret ............ RESEND_API_KEY, secret_text on the Worker
    Resend API key .... "staging.briansmasonry.net worker — own domain",
                        sending_access, restricted to briansmasonry.net
    Sending domain .... briansmasonry.net, verified on Resend 2026-09-04.
                        Records in the client's Cloudflare zone:
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
