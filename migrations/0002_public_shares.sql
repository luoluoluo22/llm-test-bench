-- Public, user-submitted text evaluation snapshots.
-- API credentials are never stored in this table.
CREATE TABLE IF NOT EXISTS public_shares (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  outputs       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'published'
                CHECK (status IN ('published', 'hidden')),
  ip_hash       TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS public_shares_public
  ON public_shares (status, created_at DESC);

CREATE INDEX IF NOT EXISTS public_shares_rate_limit
  ON public_shares (ip_hash, created_at DESC);
