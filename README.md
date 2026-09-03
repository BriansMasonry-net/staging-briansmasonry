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

    From ......  the shared TBOX sending domain (brandingcentres.com)
    To ........  the client's inbox
    Reply-To ..  the client's own address

The client's own domain is never used as a sending domain, so nothing here can
touch their existing mail reputation. The visitor's address is never put in
From — receiving servers read that as forgery — it travels in the body.

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
| `CONTACT_REPLY_TO` | Worker variable | `briansmasonry@ymail.com` |
| `TURNSTILE_SECRET_KEY` | Worker secret, optional | unset — no challenge |
| `PUBLIC_TURNSTILE_SITE_KEY` | build variable, optional | unset — no widget |

Turnstile is off until both halves are set. Set both or neither: the widget
only renders with the site key, and the route only verifies with the secret.
A honeypot field runs regardless; a WAF rate-limit rule on the same Cloudflare
account is the other half of the abuse protection.

### Responses

| Case | JSON caller | Form post |
|---|---|---|
| accepted | `202 {ok, id}` | `303 → /thank-you/` |
| honeypot filled | `202 {ok}` (dropped) | `303 → /thank-you/` (dropped) |
| missing/invalid fields | `400 invalid` | `303 → <page>?error=invalid#<form id>` |
| challenge failed | `403 challenge` | `303 → ...?error=challenge` |
| key missing at runtime | `500 server` | `303 → ...?error=server` |
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
