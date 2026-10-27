import { env as workerEnv } from 'cloudflare:workers';

/**
 * Read config from the Worker's runtime env (`cloudflare:workers`), which is
 * where a Worker secret and `.dev.vars` both arrive.
 *
 * There is deliberately no `import.meta.env` fallback: Vite snapshots the build
 * machine's environment into that object, so a key present at build time gets
 * inlined verbatim into the deployed bundle. Runtime only, always.
 */
export function readEnv(key: string): string | undefined {
  const runtime = workerEnv as unknown as Record<string, unknown>;
  const value = runtime?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** The KV namespace Astro's session support already binds. Used for rate limits and login codes. */
export function kv(): KVNamespace | undefined {
  const binding = (workerEnv as unknown as Record<string, unknown>)?.SESSION;
  return binding && typeof (binding as KVNamespace).get === 'function' ? (binding as KVNamespace) : undefined;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
