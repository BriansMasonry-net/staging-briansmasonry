-- Quote requests from the estimate form, managed at /admin/.
-- Neon project "briansmasonry" (delicate-pine-99135095), database neondb.
-- Safe to re-run: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS quotes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text NOT NULL,
  city        text NOT NULL DEFAULT '',
  message     text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'contacted', 'won', 'lost')),
  notes       text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS quotes_status_created_idx ON quotes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_created_idx ON quotes (created_at DESC);

-- Lead source (added 2026-11-07). Where the visitor arrived and from where, so
-- the admin can tell a Google Ads click from an organic search; the channel is
-- worked out from these at display time (src/lib/attribution.ts). Quotes saved
-- before this keep '' and show "Not recorded". `source` stays the page the form
-- was sent from.
--   landing_url ..  exact address the visitor landed on, query string included
--   referrer .....  the outside page that sent them, '' for none
--   ad_click_* ...  their latest Google Ads click within 90 days, if any
-- Apply BEFORE deploying code that writes them: the insert names these columns.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS landing_url  text NOT NULL DEFAULT '';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS referrer     text NOT NULL DEFAULT '';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ad_click_url text NOT NULL DEFAULT '';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ad_click_at  timestamptz;
