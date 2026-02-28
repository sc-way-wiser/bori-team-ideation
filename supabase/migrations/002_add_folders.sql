-- Add folders column to ideation_config to persist user folders to Supabase.
-- Run this after 001_ideation_config.sql.

ALTER TABLE ideation_config
  ADD COLUMN IF NOT EXISTS folders JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN ideation_config.folders IS 'JSON array of folder objects {id, name, createdAt} owned by this user.';
