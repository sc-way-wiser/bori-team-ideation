-- ═══════════════════════════════════════════════════════════════════════════
-- 003_folders_table.sql
--
-- Replaces the JSONB ideation_config.folders array with a proper relational
-- table.  Also promotes defaultFolderName and thinkingNoteIds from the
-- ideation_config.extra escape-hatch into real typed columns.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Proper folders table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ideation_folders (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES ideation_folders(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN ideation_folders.parent_id IS 'NULL = top-level folder. Non-null = sub-folder of the referenced parent (max depth 1).';

CREATE INDEX IF NOT EXISTS idx_ideation_folders_owner  ON ideation_folders (owner_id);
CREATE INDEX IF NOT EXISTS idx_ideation_folders_parent ON ideation_folders (parent_id);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_ideation_folders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ideation_folders_updated_at ON ideation_folders;
CREATE TRIGGER trg_ideation_folders_updated_at
  BEFORE UPDATE ON ideation_folders
  FOR EACH ROW EXECUTE FUNCTION update_ideation_folders_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE ideation_folders ENABLE ROW LEVEL SECURITY;

-- Owners have full CRUD
CREATE POLICY "folders: owner full access"
  ON ideation_folders
  USING  (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Collaborators can READ folders that contain notes shared with them
-- (needed so shared users can resolve folder names)
CREATE POLICY "folders: collaborators can read"
  ON ideation_folders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bori_ideation
      WHERE bori_ideation.folder_id::UUID = ideation_folders.id
        AND auth.uid() = ANY(bori_ideation.shared_with)
    )
  );

-- ── 2. Promote extra fields into real columns on ideation_config ─────────────
ALTER TABLE ideation_config
  ADD COLUMN IF NOT EXISTS default_folder_name  TEXT    NOT NULL DEFAULT 'Notes',
  ADD COLUMN IF NOT EXISTS thinking_note_ids    UUID[]  NOT NULL DEFAULT '{}';

-- Migrate existing data from extra JSONB → proper columns (one-time)
UPDATE ideation_config
SET
  default_folder_name = COALESCE((extra->>'defaultFolderName'), 'Notes'),
  thinking_note_ids   = COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(extra->'thinkingNoteIds'))::UUID),
    '{}'
  )
WHERE extra IS NOT NULL
  AND (extra ? 'defaultFolderName' OR extra ? 'thinkingNoteIds');

-- ── 3. Migrate existing folder JSONB rows → ideation_folders table ───────────
-- Each element in ideation_config.folders looks like {id, name, createdAt}
INSERT INTO ideation_folders (id, owner_id, name, created_at)
SELECT
  (f->>'id')::UUID,
  ic.user_id,
  f->>'name',
  COALESCE((f->>'createdAt')::TIMESTAMPTZ, NOW())
FROM ideation_config ic,
     jsonb_array_elements(ic.folders) AS f
WHERE jsonb_array_length(ic.folders) > 0
ON CONFLICT (id) DO NOTHING;

-- ── Comments ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE  ideation_folders IS 'Per-user named folders. Shared users can read folders their shared notes belong to.';
COMMENT ON COLUMN ideation_config.default_folder_name IS 'Display name for the uncategorised (folderId=null) notes section.';
COMMENT ON COLUMN ideation_config.thinking_note_ids   IS 'Note IDs the user has marked as "thinking" (lightbulb mode).';
