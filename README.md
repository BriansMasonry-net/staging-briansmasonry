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

## Known gaps

1. ~~Images are hotlinked to briansmasonry.net and are blocked cross-origin.~~
   Closed. All 184 files from `wp-content/uploads` now live in the Backblaze
   B2 bucket `staging-briansmasonry-img` and are served through Cloudflare at
   `img.staging.briansmasonry.net`. Paths are unchanged from WordPress, so the
   gate 18 redirects stay one-to-one. The host is defined once, in
   `src/lib/images.js`.

   That hostname is permanent, not staging-only. The conventional
   `img.briansmasonry.net` belongs to the gallery project, which has its own
   bucket and transform rule on the same zone, so this site keeps
   `img.staging.briansmasonry.net` through go-live.

2. The four service pages and thank-you are styled by inference. Their own
   Elementor stylesheets return 404 on the live server:
   post-1097, post-1101, post-1109, post-1115, post-1078.
   Regenerating them in Elementor would allow an exact port.

3. The contact form posts to /api/contact, which does not exist yet.
   Resend wiring is migration gate 11.
