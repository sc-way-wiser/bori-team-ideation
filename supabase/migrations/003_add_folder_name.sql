-- Persist folder assignment on the note row so shared users can see
-- the owner's folder label without needing access to owner's ideation_config.
ALTER TABLE bori_ideation
  ADD COLUMN IF NOT EXISTS folder_id    text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS folder_name  text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edit_access  jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edit_requests jsonb  DEFAULT '[]'::jsonb;
