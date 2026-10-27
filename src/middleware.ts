import { defineMiddleware } from 'astro:middleware';
import { COOKIE, readSession } from './lib/admin-auth';

// Every /admin/ page except the login page needs a valid session. Guarding here
// rather than in each page means a new admin page is private by default.
// Prerendered pages never reach this (they are served as files), and nothing
// under /admin/ is prerendered.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return next();

  const email = await readSession(context.cookies.get(COOKIE)?.value);
  context.locals.adminEmail = email;

  if (!email && !pathname.startsWith('/admin/login')) {
    return context.redirect('/admin/login/', 303);
  }

  const response = await next();
  // Private, per-person pages: never cached, never indexed.
  response.headers.set('cache-control', 'private, no-store');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  response.headers.set('referrer-policy', 'same-origin');
  return response;
});
