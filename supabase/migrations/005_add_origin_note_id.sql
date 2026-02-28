-- Track the explicit origin note for "Add linked note" notes.
-- Unlike [[wiki links]] (strong relation), this is a direct structural parent
-- stored on the row itself, not derived from note content.
ALTER TABLE bori_ideation
  ADD COLUMN IF NOT EXISTS origin_note_id text DEFAULT NULL;
