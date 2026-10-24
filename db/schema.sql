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
