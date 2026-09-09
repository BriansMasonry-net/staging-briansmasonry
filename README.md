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
    src/components/Seo.astro     every <head> metadata tag, one file
    src/components/Analytics.astro   Google Ads tag, carried from the old site
    seo.config.ts                site-wide SEO + NAP, single source of truth
    bin/check-seo.mjs            build-time SEO lint over dist/
    public/robots.txt            carried from the old site
    public/_redirects            old sitemap addresses only (gate 14 owns the rest)

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

## SEO

### What the old site actually had

Audited against the live WordPress site on 2026-09-09, all six pages. There was
**no SEO plugin** — no Yoast, no RankMath. The entire `<head>` SEO surface was:

| | |
|---|---|
| `<title>` | one per page, hand-written |
| `<link rel="canonical">` | self-referential, trailing slash |
| `<meta name="robots">` | `max-image-preview:large`, nothing else |
| `wp-sitemap.xml` | WordPress core, 6 addresses |
| `robots.txt` | WP defaults + Cloudflare managed content-signal block |
| Google Ads `gtag.js` | `AW-17780632377`, plus a phone-swap config and a Lead Form conversion on `/thank-you/` |

And nothing else. **No meta descriptions on any page. No Open Graph. No Twitter
cards. No JSON-LD of any kind. No verification tokens.** So there is very little
to lose here and a great deal of headroom — the numbers below are mostly
additions, not replacements.

### Carried, unchanged

- **All six addresses**, with their trailing slashes. `trailingSlash: 'always'`
  in `astro.config.mjs`; the sitemap inherits it; `wrangler.jsonc` must be set
  to `"html_handling": "auto-trailing-slash"` at gate 9 or the site
  canonicalises to addresses its own sitemap does not list.
- **Four of five page titles**, verbatim. They lead with the service, they are
  within length, and there is nothing to gain by changing a title that works.
- **`max-image-preview:large`**, on every page.
- **The Google Ads tag**, both conversion actions, with the Lead Form event
  still firing on `/thank-you/` only.
- **robots.txt**, including the Cloudflare content-signal block — that is the
  client's stated position on AI crawling, and dropping it at migration would
  silently reverse it. The WordPress-only `Disallow: /wp-admin/` lines are gone
  because there is no wp-admin.

### Changed on purpose

- **Homepage title.** Was the bare string `Brian's Masonry` — 15 characters, no
  service word, no place name. Now `Masonry Contractor in York & the GTA |
  Brian's Masonry`. Nobody searches by the name of a business they have not
  heard of; the page had nothing in its title to rank for.
- **Homepage H1.** There wasn't one. Every heading on the old homepage,
  including the one that says what the business does, was an `<h2>`. The hero
  headline is now the `<h1>`; the CSS classes are unchanged so the page looks
  identical.
- **`/thank-you/` is `noindex,follow` and out of the sitemap.** The old site
  indexed it. It cannot rank, and an organic visitor landing on it from a
  search result would fire the Ads Lead Form conversion without ever submitting
  the form — poisoning the data the client's ad spend is optimised against.

### Added

- **Meta descriptions** on all six pages. The old site had none anywhere.
- **Open Graph and Twitter cards**, so links shared to Facebook, LinkedIn,
  WhatsApp and X render a card instead of a bare address.
- **JSON-LD**, 12 blocks across 6 pages, every one machine-generated with
  `JSON.stringify` and re-parsed by the lint:
  - `GeneralContractor` / `LocalBusiness` with the full NAP, hours, service
    area and the four HomeStars awards — on every page, by `@id`
  - `WebSite`, `WebPage` — every page
  - `Service` with an `OfferCatalog` — each of the four service pages
  - `FAQPage` — each service page, generated from the same array the page
    renders, so the schema and the visible answers cannot drift. This is what
    earns the expandable Q&A rows under a search result. The questions were
    already on the page; they just never qualified.
  - `BreadcrumbList` — each service page
  - `ItemList` of the nine homepage services
- **Alt text** on 63 images, up from 51. The twelve portfolio photographs all
  carried `alt=""`, and seven service icons carried filenames (`chimney-new`,
  `trowel (1)`). For a trade business the portfolio is the strongest visual
  asset on the site.
- **`sitemap-index.xml`** with lastmod, changefreq and priority, plus edge
  redirects from the old `/wp-sitemap.xml` address that Search Console has on
  file.
- **`bin/check-seo.mjs`**, run after every build, forever.

### The guardrail

The old site never had the one thing that mattered: a box that turns red. Two
layers replace it.

`src/components/Seo.astro` **throws during `astro build`** on a missing title,
a title outside 10–60 characters, a description outside 50–160, or a
non-absolute OG image. A page cannot deploy quietly without metadata.

`bin/check-seo.mjs` then re-checks the built HTML, because the component only
sees what it was passed. It fails the build on a missing tag, a duplicate
title or description across pages, a canonical without a trailing slash, a page
with zero or two `<h1>`s, a sitemap listing an address nothing canonicalises to
or that is noindexed, and — the important one — **any JSON-LD block that does
not `JSON.parse`**. A single literal newline inside a JSON string makes Google
discard the entire block, both nodes, silently. Checking that an
`application/ld+json` tag *exists* passes happily on exactly that.

Current output:

    pages........................... 6
    JSON-LD blocks.................. 12
    H1 elements..................... 6
    sitemap addresses............... 5
    images with alt................. 63
    images without alt.............. 1     (lightbox placeholder, alt set by JS)
    failures........................ 0

### Open items

1. **No verification tokens were found on the old site.** `site.verification`
   in `seo.config.ts` is deliberately an empty array rather than deleted. If
   the client has a Search Console or Bing property verified by meta tag, it
   must go in there **before gate 16 switches the old site off** — re-verifying
   on a live migrated domain is a bad day. Worth asking them directly; a
   DNS-verified property is unaffected.
2. **No review schema.** `aggregateRating` and `Review` are deliberately
   absent. The homepage testimonials carry no verifiable source and no star
   rating, and inventing one is a manual-action risk, not a ranking win. The
   real HomeStars profile rating and review count would be a genuine addition
   and needs the profile URL from the client.
3. **No `sameAs`.** No social, HomeStars or Google Business Profile links
   appear anywhere on the old site. Google Business Profile in particular is
   the single largest remaining local-search lever for this business, and it is
   outside the repo.
4. **OG image is on the old host.** `IMAGE_HOST` in `seo.config.ts` is the one
   constant to flip when gate 7 points `img.briansmasonry.net` at Backblaze
   (AD-9). Every OG image and schema image URL follows it.

## Known gaps

1. Images are hotlinked to briansmasonry.net and are blocked cross-origin.
   They will not render from any other origin, including the Railway preview
   URL. Fixed by moving them to Backblaze B2 (migration gates 4-5).

2. The four service pages and thank-you are styled by inference. Their own
   Elementor stylesheets return 404 on the live server:
   post-1097, post-1101, post-1109, post-1115, post-1078.
   Regenerating them in Elementor would allow an exact port.

3. The contact form posts to /api/contact, which does not exist yet.
   Resend wiring is migration gate 11.
