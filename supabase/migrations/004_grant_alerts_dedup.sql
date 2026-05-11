-- ============================================================
-- Migration 004: Prevent duplicate grant_alerts rows
-- Noble Erne, LLC — GRANT PRIME System
-- Run in: Supabase → SQL Editor
-- ============================================================

-- Add alerted_on date column if not already present
ALTER TABLE grant_alerts
  ADD COLUMN IF NOT EXISTS alerted_on DATE DEFAULT CURRENT_DATE;

-- Backfill alerted_on from created_at for existing rows
UPDATE grant_alerts
  SET alerted_on = DATE(created_at)
WHERE alerted_on IS NULL;

-- Add unique constraint so upsert can resolve duplicates
-- (alert_type renamed from 'daily_digest' to 'urgent_deadline' going forward)
ALTER TABLE grant_alerts
  DROP CONSTRAINT IF EXISTS grant_alerts_unique_daily;

ALTER TABLE grant_alerts
  ADD CONSTRAINT grant_alerts_unique_daily
  UNIQUE (grant_id, alert_type, alerted_on);
