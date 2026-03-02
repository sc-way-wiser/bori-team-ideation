-- ═══════════════════════════════════════════════════════════════════════════
-- 007_last_opened_note
-- Adds last_opened_note_id to ideation_config so each user's last viewed
-- note can be restored on page load without relying on note order.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ideation_config
  ADD COLUMN IF NOT EXISTS last_opened_note_id UUID DEFAULT NULL;

-- No foreign key constraint — the referenced note may have been deleted,
-- in which case we simply fall back to the first note on load.
-- A NULL value means "no preference saved yet".

COMMENT ON COLUMN ideation_config.last_opened_note_id IS
  'ID of the last note the user had open. Restored on next page load. NULL = no preference.';
