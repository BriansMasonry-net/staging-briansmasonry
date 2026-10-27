import { neon } from '@neondatabase/serverless';
import { readEnv } from './runtime';

// Quote requests live in Neon (project "briansmasonry", schema in db/schema.sql).
// The Worker talks to it over Neon's HTTP driver: one fetch per query, no pool
// to hold open between requests. DATABASE_URL is a Worker secret.

export const STATUSES = ['new', 'contacted', 'won', 'lost'] as const;
export type Status = (typeof STATUSES)[number];

export interface Quote {
  id: number;
  /** The HTTP driver parses timestamptz into Date. */
  created_at: Date;
  updated_at: Date;
  name: string;
  email: string;
  phone: string;
  city: string;
  message: string;
  source: string;
  status: Status;
  notes: string;
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function db() {
  const url = readEnv('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL missing at runtime — add it as a Worker secret');
  return neon(url);
}

export function databaseConfigured(): boolean {
  return readEnv('DATABASE_URL') !== undefined;
}

/**
 * Save one form submission and return its id. A double-click or a retry within
 * ten minutes returns the row already saved instead of adding a second one —
 * the same submission the email's idempotency key collapses at Resend.
 */
export async function saveQuote(q: Pick<Quote, 'name' | 'email' | 'phone' | 'city' | 'message' | 'source'>) {
  const sql = db();
  const rows = (await sql`
    WITH existing AS (
      SELECT id FROM quotes
      WHERE email = ${q.email} AND phone = ${q.phone} AND name = ${q.name}
        AND city = ${q.city} AND message = ${q.message}
        AND created_at > now() - interval '10 minutes'
      ORDER BY id DESC LIMIT 1
    ), inserted AS (
      INSERT INTO quotes (name, email, phone, city, message, source)
      SELECT ${q.name}, ${q.email}, ${q.phone}, ${q.city}, ${q.message}, ${q.source}
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    )
    SELECT id FROM inserted UNION ALL SELECT id FROM existing
  `) as { id: number | string }[];
  return Number(rows[0]?.id);
}

export async function listQuotes(opts: { status?: Status; search?: string; limit?: number }) {
  const sql = db();
  const search = opts.search ? `%${opts.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = (await sql`
    SELECT * FROM quotes
    WHERE (${opts.status ?? null}::text IS NULL OR status = ${opts.status ?? null})
      AND (${search}::text IS NULL OR name ILIKE ${search} OR email ILIKE ${search}
           OR phone ILIKE ${search} OR city ILIKE ${search} OR message ILIKE ${search}
           OR notes ILIKE ${search})
    ORDER BY created_at DESC
    LIMIT ${opts.limit ?? 200}
  `) as Quote[];
  return rows;
}

export async function statusCounts(): Promise<Record<Status, number>> {
  const sql = db();
  const rows = (await sql`SELECT status, count(*)::int AS n FROM quotes GROUP BY status`) as {
    status: Status;
    n: number;
  }[];
  const counts = { new: 0, contacted: 0, won: 0, lost: 0 } as Record<Status, number>;
  for (const row of rows) if (isStatus(row.status)) counts[row.status] = row.n;
  return counts;
}

export async function getQuote(id: number) {
  const sql = db();
  const rows = (await sql`SELECT * FROM quotes WHERE id = ${id}`) as Quote[];
  return rows[0];
}

export async function updateQuote(id: number, status: Status, notes: string) {
  const sql = db();
  const rows = (await sql`
    UPDATE quotes SET status = ${status}, notes = ${notes}, updated_at = now()
    WHERE id = ${id} RETURNING id
  `) as { id: number }[];
  return rows.length === 1;
}
