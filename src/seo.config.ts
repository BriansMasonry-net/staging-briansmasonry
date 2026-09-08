/* ------------------------------------------------------------------
   Everything the SEO layer needs to know about this client, in one
   place. Seo.astro reads it; nothing else should hard-code a phone
   number, an address or a business name.

   Facts here are taken from the live site's own pages (footer NAP,
   opening hours, about copy). Nothing is invented — where a value is
   unknown it is left out rather than guessed, because a wrong value in
   structured data is worse than a missing one. Notably absent:
     - geo coordinates      (never published on the live site)
     - sameAs profiles      (no social links anywhere on the site)
     - aggregateRating      (testimonials carry no ratings; inventing
                             one is a manual action from Google)
     - priceRange           (not published)
   ------------------------------------------------------------------ */

export const seo = {
  siteName: "Brian's Masonry",
  url: 'https://briansmasonry.net',
  locale: 'en_CA',
  lang: 'en',

  telephone: '+14162444113',
  telephoneDisplay: '(416) 244-4113',
  email: 'briansmasonry@ymail.com',

  address: {
    street: '221 Todd Baylis Blvd',
    locality: 'York',
    region: 'ON',
    postalCode: 'M6M 0A7',
    country: 'CA',
  },

  // Live site footer: "Monday - Friday 8 AM - 10 PM"
  hours: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '08:00',
    closes: '22:00',
  },

  areaServed: 'Greater Toronto Area',
  map: 'https://maps.app.goo.gl/vcgKyWXjbYnauoy9A',
  logo: 'https://briansmasonry.net/wp-content/uploads/2024/12/Brians-Masonry-Logo-Only0-e1737996026967.webp',

  // Committed to public/ rather than hotlinked: social scrapers fetch this
  // server-side and the WordPress origin blocks cross-origin requests.
  ogImage: { path: '/og-image.jpg', width: 1200, height: 630, type: 'image/jpeg' },

  // Length gates enforced by Seo.astro. Titles beyond ~60 and descriptions
  // beyond ~160 get truncated in results; well under either means the page
  // is not saying enough.
  limits: { titleMin: 10, titleMax: 65, descriptionMin: 50, descriptionMax: 160 },
} as const;

/** The business node. Referenced by @id from every other node. */
export function businessNode() {
  return {
    '@type': 'HomeAndConstructionBusiness',
    '@id': `${seo.url}/#business`,
    name: seo.siteName,
    url: `${seo.url}/`,
    telephone: seo.telephone,
    email: seo.email,
    image: `${seo.url}${seo.ogImage.path}`,
    logo: seo.logo,
    hasMap: seo.map,
    address: {
      '@type': 'PostalAddress',
      streetAddress: seo.address.street,
      addressLocality: seo.address.locality,
      addressRegion: seo.address.region,
      postalCode: seo.address.postalCode,
      addressCountry: seo.address.country,
    },
    areaServed: { '@type': 'AdministrativeArea', name: seo.areaServed },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: seo.hours.days,
      opens: seo.hours.opens,
      closes: seo.hours.closes,
    }],
    knowsAbout: [
      'Chimney repair', 'Chimney rebuilding', 'Brick repair', 'Brick restoration',
      'Tuck-pointing', 'Repointing', 'Stone masonry', 'Retaining walls',
      'Window sills', 'Heritage masonry restoration', 'Commercial masonry',
    ],
  };
}

/** A Service offered by the business, for a service page. */
export function serviceNode({ name, description, url }: { name: string; description: string; url: string }) {
  return {
    '@type': 'Service',
    '@id': `${url}#service`,
    name,
    description,
    serviceType: name,
    provider: { '@id': `${seo.url}/#business` },
    areaServed: { '@type': 'AdministrativeArea', name: seo.areaServed },
  };
}

/** Q&A already rendered on the page, restated for search engines. */
export function faqNode(items: { q: string; a: string }[], url: string) {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

/** Home > This page. Only worth emitting below the top level. */
export function breadcrumbNode(name: string, url: string) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${seo.url}/` },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };
}
