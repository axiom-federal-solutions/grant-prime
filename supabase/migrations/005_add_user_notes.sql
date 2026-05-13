-- ============================================================
-- Migration 005: Add user_notes column to grants table
-- Noble Erne, LLC — GRANT PRIME System
-- Run in: Supabase → SQL Editor
-- ============================================================

-- Adds a separate user_notes column so dashboard notes no longer
-- collide with the AI-generated scoring reasoning stored in `notes`.
ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS user_notes TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'grants'
  AND column_name IN ('notes', 'user_notes');
