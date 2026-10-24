import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../lib/admin-auth';

export const prerender = false;

// POST only, so a link or prefetch can never sign someone out.
export const POST: APIRoute = ({ url }) =>
  new Response(null, {
    status: 303,
    headers: { location: '/admin/login/', 'set-cookie': clearSessionCookie(url.protocol === 'https:') },
  });
