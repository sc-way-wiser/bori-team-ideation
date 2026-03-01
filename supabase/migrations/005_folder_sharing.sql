-- ═══════════════════════════════════════════════════════════════════════════
-- 005_folder_sharing.sql
--
-- Adds sharing columns to ideation_folders so sub-folders (and top-level
-- folders) can be individually shared with other users, mirroring the
-- sharing model on bori_ideation (notes).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ideation_folders
  ADD COLUMN IF NOT EXISTS shared_with    UUID[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS edit_access    UUID[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS edit_requests  UUID[]  NOT NULL DEFAULT '{}';

-- Allow shared users to read folders shared with them (direct share)
-- This supplements the existing "collaborators can read" policy which
-- checks notes inside the folder.
CREATE POLICY "folders: shared users can read"
  ON ideation_folders FOR SELECT
  USING (auth.uid() = ANY(shared_with));

-- Allow shared users with edit access to create sub-folders inside
-- a folder that has been shared with them.
CREATE POLICY "folders: shared editors can insert sub-folders"
  ON ideation_folders FOR INSERT
  WITH CHECK (
    -- Either you own it…
    auth.uid() = owner_id
    -- …or the parent folder grants you edit access
    OR EXISTS (
      SELECT 1 FROM ideation_folders parent
      WHERE parent.id = parent_id
        AND auth.uid() = ANY(parent.edit_access)
    )
  );

-- Allow shared editors to update sub-folders they have edit access to
CREATE POLICY "folders: shared editors can update"
  ON ideation_folders FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM ideation_folders parent
      WHERE parent.id = ideation_folders.parent_id
        AND auth.uid() = ANY(parent.edit_access)
    )
  );

COMMENT ON COLUMN ideation_folders.shared_with   IS 'User IDs this folder is shared with (read access).';
COMMENT ON COLUMN ideation_folders.edit_access    IS 'User IDs that have edit access to this folder.';
COMMENT ON COLUMN ideation_folders.edit_requests  IS 'User IDs that have requested edit access.';
