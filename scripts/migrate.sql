-- ============================================================
-- migrate.sql
-- GRANT PRIME — Supabase Schema Migration
--
-- Safe to run multiple times (all statements use IF NOT EXISTS
-- or DO $$ blocks to skip already-existing objects).
--
-- Run in Supabase SQL Editor or via supabase CLI:
--   supabase db push (if using migrations folder)
--   OR paste directly into SQL Editor
-- ============================================================

-- ── 1. Add missing columns to grants table ──────────────────

ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS proposal_draft    TEXT,
  ADD COLUMN IF NOT EXISTS user_notes        TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to       TEXT,
  ADD COLUMN IF NOT EXISTS match_required    TEXT,
  ADD COLUMN IF NOT EXISTS funder_contact    TEXT;

-- ── 2. Create grant_alerts table ────────────────────────────

CREATE TABLE IF NOT EXISTS grant_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    UUID REFERENCES grants(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL,
  message     TEXT,
  sent_at     TIMESTAMPTZ DEFAULT NOW(),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_alerts_grant_id  ON grant_alerts(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_alerts_alert_type ON grant_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_grant_alerts_sent_at   ON grant_alerts(sent_at DESC);

-- ── 3. Verify system_log table exists (created by agents) ───

CREATE TABLE IF NOT EXISTS system_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent        TEXT NOT NULL,
  run_at       TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'success',
  grants_found INTEGER DEFAULT 0,
  grants_added INTEGER DEFAULT 0,
  details      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_log_agent  ON system_log(agent);
CREATE INDEX IF NOT EXISTS idx_system_log_run_at ON system_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_log_status ON system_log(status);

-- ── 4. Verify grants table has all required columns ─────────

ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS title          TEXT,
  ADD COLUMN IF NOT EXISTS funder         TEXT,
  ADD COLUMN IF NOT EXISTS source         TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS eligibility    TEXT,
  ADD COLUMN IF NOT EXISTS amount_min     NUMERIC,
  ADD COLUMN IF NOT EXISTS amount_max     NUMERIC,
  ADD COLUMN IF NOT EXISTS deadline       DATE,
  ADD COLUMN IF NOT EXISTS apply_url      TEXT,
  ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS score          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes          TEXT,
  ADD COLUMN IF NOT EXISTS entity_fit     TEXT,
  ADD COLUMN IF NOT EXISTS grant_id       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- ── 5. Create updated_at trigger for grants ─────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grants_updated_at ON grants;
CREATE TRIGGER grants_updated_at
  BEFORE UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 6. Performance indexes on grants ────────────────────────

CREATE INDEX IF NOT EXISTS idx_grants_status    ON grants(status);
CREATE INDEX IF NOT EXISTS idx_grants_score     ON grants(score DESC);
CREATE INDEX IF NOT EXISTS idx_grants_deadline  ON grants(deadline ASC);
CREATE INDEX IF NOT EXISTS idx_grants_source    ON grants(source);
CREATE INDEX IF NOT EXISTS idx_grants_grant_id  ON grants(grant_id);
CREATE INDEX IF NOT EXISTS idx_grants_entity    ON grants(entity_fit);

-- ── 7. Row Level Security (enable, public read for dashboard) ─

ALTER TABLE grants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_alerts ENABLE ROW LEVEL SECURITY;

-- Public read access (dashboard uses anon key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'grants' AND policyname = 'Public read grants'
  ) THEN
    CREATE POLICY "Public read grants" ON grants FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_log' AND policyname = 'Public read system_log'
  ) THEN
    CREATE POLICY "Public read system_log" ON system_log FOR SELECT USING (true);
  END IF;
END $$;

-- Service key (agents use SUPABASE_KEY with service role) gets full access
-- No additional policy needed — service role bypasses RLS by default

-- ── Done ─────────────────────────────────────────────────────
-- After running this script:
--   1. Verify in Supabase Table Editor that all columns exist
--   2. Run: npm run scoring (re-score with 3-partner model)
--   3. Run: npm run strategy && npm run intel (seed AI Insights)
