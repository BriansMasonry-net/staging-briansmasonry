# Brian's Masonry — review 22 October 2026

Site 0004. Old production https://briansmasonry.net/ remains WordPress. Astro staging https://staging.briansmasonry.net/. Repository BriansMasonry-net/staging-briansmasonry. Baseline main 20463f2; feature chatgpt/review-0004-20261022.

## Comparison and scope
routes-before.json inventories six matching routes: home, brick repair, chimney repair, commercial masonry, tuck-pointing, thank-you. All 12 old/staging requests returned HTTP 200. The four service headings and two forms per service match; thank-you has no form. Old homepage lacks an H1; Astro has an H1. Homepage image element counts differ (17 old, 33 Astro); full image parity is not asserted. Source comments identify the Elementor-derived Helvetica, blue/red, spacing and layout baseline. Historic service stylesheets were unavailable according to existing repository notes. No new business claims were added.

## Changes
Reviewed PR2 and cherry-picked its two commits: footer H2 headings with retained style, keyboard-focusable mobile menu, and header landmark.
Four service titles now include their established GTA service area.
ServiceHero now uses its existing contrasting white-button class, with branded hover and visible focus.
Base two/three-column grids shrink below their previous fixed 320/300px minimum to prevent narrow-container overflow.
Brick page image uses the defined 5px --r token rather than undefined --radius.
README deployment section now describes the verified Workers Builds integration instead of claiming no CI.

## Actual review
npm ci and npm run build succeeded. Image checker passes with its EXISTING homepage exception: 4952KB estimated against 1800KB budget; PNG re-encoding remains outstanding.
SEO lint: six pages, 12 JSON-LD blocks, six H1, five sitemap URLs, zero failures, 63 non-empty image alts. Its four empty-alt notes represent three decorative hero slides (HTML minimized alt attribute) and the lightbox placeholder; no absent attribute was found by manual markup inspection.
Built service titles and form counts were inspected. git diff --check passed. Full source diff and PR2 were reviewed.
Browser viewport, complete visual parity, lightbox, real form/CAPTCHA/persistence/email tests are waived by user direction and were NOT performed. No real leads or test emails were sent. Existing conversion tags and form API were preserved.
Production rollback planning and functional post-release checks remain operator responsibilities.

## Publishing and staging
Review decision: acceptable under user-accepted limitations, conditional on exact remote SHA and successful staging publication. No visible Neon approval before publication.
Verified Cloudflare Worker staging-briansmasonry serves only staging.briansmasonry.net; zone Worker route list is empty. Existing non-production build trigger 9242c0ee-6624-4da2-a15e-58fa355de096 uploads a version; deployment can promote the exact resulting version on this isolated Worker without changing DNS. Deployment result, version and exact SHA will be recorded in PR and Neon after provider completion. No production release, merge or default-branch push is authorized.

## Manual production release
Review the approved PR head against the recorded SHA. Back up WordPress and existing production routing first. Deploy only through the operator's chosen production workflow; check production canonical/sitemap origin, indexing, all six routes, images, keyboard/mobile navigation, contact delivery and conversion behaviour. Retain the old production host for rollback. A future rollback restores the previous production build/routing; a code rollback does not undo external form or storage activity.
