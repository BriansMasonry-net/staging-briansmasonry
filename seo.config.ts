/* ---------------------------------------------------------------------------
   seo.config.ts — everything site-wide, in the repo, findable.

   On the old WordPress site none of this existed in a file. There was no SEO
   plugin at all: the <head> carried a <title>, a canonical, and
   `max-image-preview:large`, and nothing else. No description, no Open Graph,
   no Twitter card, no JSON-LD, no verification tokens. Harvested from all six
   live pages on 2026-09-09 before touching anything — see README.

   So there is nothing to *lose* here beyond titles, canonicals, the six
   addresses and the Google Ads tag. Everything below the CARRIED block is new.
   --------------------------------------------------------------------------- */

/* Image host. Gate 7 has landed: the images are in Backblaze, served through
   Cloudflare, and the host is defined once in src/lib/images.js. Re-export it
   here rather than restating the URL — this file, Img.astro, every OG image
   and every schema image URL then follow that one definition.

   Note the hostname is img.staging.briansmasonry.net, not the conventional
   img.briansmasonry.net: that one belongs to the gallery project, which has
   its own bucket and transform rule on the same zone. See src/lib/images.js. */
export { IMG as IMAGE_HOST } from './src/lib/images.js';
import { IMG as IMAGE_HOST } from './src/lib/images.js';

const siteUrl = 'https://briansmasonry.net';

/* --- CARRIED VERBATIM FROM THE OLD SITE ---------------------------------- */

/* Google Ads tag, found in the <head> of every old page. Not SEO, but it is
   emitted by the thing being replaced, so it dies silently at cutover unless
   it is carried. Both conversion actions were read off the live pages:
     - phone_conversion_number, sitewide, swaps the displayed number
     - the Lead Form conversion event, which fires on /thank-you/ only */
export const ads = {
  id: 'AW-17780632377',
  phoneConversionLabel: 'AW-17780632377/Fq6-CP3Wjc0bELnWu55C',
  phoneConversionNumber: '(416) 244-4113',
  leadConversionSendTo: 'AW-17780632377/lZi6CLn2m-cbELnWu55C',
};

/* The old <head> carried this and nothing else in the robots line. Kept. */
export const robotsDirective = 'max-image-preview:large';

/* --- BUSINESS FACTS ------------------------------------------------------ */

export const business = {
  name: "Brian's Masonry",
  legalName: "Brian's Masonry",
  phone: '+1-416-244-4113',
  phoneDisplay: '(416) 244-4113',
  email: 'briansmasonry@ymail.com',
  street: '221 Todd Baylis Blvd',
  locality: 'York',
  region: 'ON',
  postalCode: 'M6M 0A7',
  country: 'CA',
  mapUrl: 'https://maps.app.goo.gl/vcgKyWXjbYnauoy9A',
  /* Footer: "Monday - Friday 8 AM - 10 PM" */
  hours: [{ days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '22:00' }],
  foundingBlurb: 'over 20 years',
  /* The four HomeStars badges on the homepage. Factual, so safe as `award`. */
  awards: [
    'HomeStars Best of Award Winner 2024',
    'HomeStars Best of Award Winner 2023',
    'HomeStars Best of Award Winner 2022',
    'HomeStars Verified',
  ],
  areaServed: [
    'Toronto', 'York', 'North York', 'Etobicoke', 'Scarborough', 'East York',
    'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Richmond Hill', 'Oakville',
  ],
};

/* NOTE — deliberately absent: aggregateRating and Review.
   The homepage testimonials carry no verifiable source and no star rating, and
   fabricating one is a Google manual-action risk, not a ranking win. The real
   HomeStars profile rating and review count would be a genuine addition here;
   it needs the profile URL from the client. Same for `sameAs` (social /
   HomeStars / Google Business Profile links) — none appear anywhere on the old
   site, so there is nothing to carry and nothing verified to invent. */

export const site = {
  siteUrl,
  /* 1882x1162 — comfortably over the 1200x630 that Facebook, LinkedIn and
     X want. Verified 200 on the live host. */
  defaultOgImage: `${IMAGE_HOST}/2025/01/Brians-Masonry-Home-Page-Banner.webp`,
  logo: `${IMAGE_HOST}/2024/12/Brians-Masonry-Logo-Only0-e1737996026967.webp`,
  locale: 'en_CA',
  twitterCard: 'summary_large_image',
  /* Harvested from the old <head>: none. Left empty on purpose rather than
     removed — if the client has a Search Console or Bing property verified by
     meta tag it will be here, and it must be filled BEFORE gate 16 switches
     the old site off. Re-verifying on a live migrated domain is a bad day. */
  verification: [] as Array<{ name: string; content: string }>,
};

const address = {
  '@type': 'PostalAddress',
  streetAddress: business.street,
  addressLocality: business.locality,
  addressRegion: business.region,
  postalCode: business.postalCode,
  addressCountry: business.country,
};

const openingHours = business.hours.map((h) => ({
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: h.days,
  opens: h.opens,
  closes: h.closes,
}));

/* The organisation node, referenced by @id from every page's graph so the
   business is described once and pointed at, not repeated six times. */
export const businessId = `${siteUrl}/#business`;
export const websiteId = `${siteUrl}/#website`;

export const businessNode = {
  '@type': ['GeneralContractor', 'LocalBusiness'],
  '@id': businessId,
  name: business.name,
  legalName: business.legalName,
  url: `${siteUrl}/`,
  telephone: business.phone,
  email: business.email,
  image: site.defaultOgImage,
  logo: site.logo,
  address,
  hasMap: business.mapUrl,
  openingHoursSpecification: openingHours,
  priceRange: '$$',
  currenciesAccepted: 'CAD',
  award: business.awards,
  areaServed: business.areaServed.map((n) => ({ '@type': 'City', name: n })),
  description:
    "Masonry contractor serving York and the Greater Toronto Area for over 20 years. " +
    'Chimney repair and rebuilds, brick repair and restoration, tuck-pointing and repointing, ' +
    'and commercial masonry.',
  knowsAbout: [
    'Chimney repair', 'Chimney rebuilds', 'Brick repair', 'Brick restoration',
    'Tuck-pointing', 'Repointing', 'Commercial masonry', 'Heritage masonry restoration',
    'Retaining walls', 'Window sills', 'Porches', 'Walkways',
  ],
};

export const websiteNode = {
  '@type': 'WebSite',
  '@id': websiteId,
  url: `${siteUrl}/`,
  name: business.name,
  publisher: { '@id': businessId },
  inLanguage: 'en-CA',
};

/* ---------------------------------------------------------------------------
   Helpers. Each returns a plain object; Seo.astro serialises the graph once.
   --------------------------------------------------------------------------- */

/** BreadcrumbList. Pass the trail without the home crumb — it is prepended. */
export function breadcrumbs(trail: Array<{ name: string; path: string }>) {
  const items = [{ name: 'Home', path: '/' }, ...trail];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${siteUrl}${items[items.length - 1].path}#breadcrumbs`,
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${siteUrl}${c.path}`,
    })),
  };
}

/** A Service offered by the business, provider pointed at the shared @id. */
export function service(opts: {
  name: string;
  path: string;
  description: string;
  serviceType?: string;
  offers?: string[];
}) {
  return {
    '@type': 'Service',
    '@id': `${siteUrl}${opts.path}#service`,
    name: opts.name,
    serviceType: opts.serviceType ?? opts.name,
    description: opts.description,
    provider: { '@id': businessId },
    areaServed: business.areaServed.map((n) => ({ '@type': 'City', name: n })),
    ...(opts.offers && {
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: opts.name,
        itemListElement: opts.offers.map((o) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: o },
        })),
      },
    }),
  };
}

/** FAQPage built from the same array the page renders, so they cannot drift. */
export function faqPage(path: string, items: Array<{ q: string; a: string }>) {
  return {
    '@type': 'FAQPage',
    '@id': `${siteUrl}${path}#faq`,
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

export default site;
