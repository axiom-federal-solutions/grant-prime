-- ============================================================
-- Migration 003: Add category column + system_log table
-- Noble Erne, LLC — GRANT PRIME System
-- Run in: Supabase → SQL Editor
-- ============================================================

-- 1. Add category column to grants table (scoring agent writes this)
ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Federal';

-- 2. Update existing scored grants: set category from entity_fit + notes heuristic
-- This is a one-time backfill — new grants will be categorized by scoring agent
UPDATE grants
  SET category = CASE
    WHEN entity_fit = 'Walker Contractors' THEN 'Construction'
    WHEN notes ILIKE '%STEM%' OR notes ILIKE '%science%' OR notes ILIKE '%engineering%' THEN 'STEM'
    WHEN notes ILIKE '%EdTech%' OR notes ILIKE '%workforce%' OR notes ILIKE '%training%' OR notes ILIKE '%SAP%' THEN 'EdTech'
    WHEN source = 'foundation' THEN 'Foundation'
    ELSE 'Federal'
  END
WHERE category IS NULL OR category = 'Federal';

-- 3. Create index for dashboard category filtering
CREATE INDEX IF NOT EXISTS idx_grants_category ON grants (category);
CREATE INDEX IF NOT EXISTS idx_grants_entity_fit ON grants (entity_fit);

-- 4. Create system_log table (if not already created)
-- Agents write run summaries here; dashboard reads for daily briefing
CREATE TABLE IF NOT EXISTS system_log (
  id            BIGSERIAL PRIMARY KEY,
  agent         TEXT        NOT NULL,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT        NOT NULL DEFAULT 'success',  -- 'success' | 'partial' | 'failed' | 'healthy' | 'degraded'
  grants_found  INTEGER     DEFAULT 0,
  grants_added  INTEGER     DEFAULT 0,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for dashboard briefing queries (agent + run_at)
CREATE INDEX IF NOT EXISTS idx_system_log_agent_run ON system_log (agent, run_at DESC);

-- 5. Verify columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'grants'
  AND column_name IN ('category', 'entity_fit', 'naics', 'score', 'status');
