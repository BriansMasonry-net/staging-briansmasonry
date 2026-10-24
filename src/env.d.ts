/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

/**
 * Worker bindings, as read through `cloudflare:workers`.
 * RESEND_API_KEY, DATABASE_URL and SESSION_SECRET are runtime secrets, never
 * build variables.
 */
interface Env {
  RESEND_API_KEY: string;
  CONTACT_FROM?: string;
  CONTACT_TO?: string;
  CONTACT_REPLY_TO?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Neon connection string for the quotes table. */
  DATABASE_URL?: string;
  /** Comma-separated addresses allowed into /admin/. */
  ADMIN_EMAILS?: string;
  /** 32+ random characters; signs admin session cookies. */
  SESSION_SECRET?: string;
}

declare namespace App {
  interface Locals {
    /** Set by src/middleware.ts on /admin/ requests with a valid session. */
    adminEmail?: string;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
