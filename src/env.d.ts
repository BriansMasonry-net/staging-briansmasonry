/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

/**
 * Worker bindings, as read through `cloudflare:workers`.
 * RESEND_API_KEY is a runtime secret, never a build variable.
 */
interface Env {
  RESEND_API_KEY: string;
  CONTACT_FROM?: string;
  CONTACT_TO?: string;
  CONTACT_REPLY_TO?: string;
  TURNSTILE_SECRET_KEY?: string;
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
