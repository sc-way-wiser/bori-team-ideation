-- ═══════════════════════════════════════════════════════════════════════════
-- ideation_config
-- One row per user storing all customisable settings for bori_ideation.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ideation_config (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── Appearance ─────────────────────────────────────────────────────────
  theme                    TEXT     NOT NULL DEFAULT 'system'   CHECK (theme IN ('light','dark','system')),
  accent_color             TEXT     NOT NULL DEFAULT '#6366f1',   -- primary brand colour (hex)

  -- ── Sidebar ────────────────────────────────────────────────────────────
  sidebar_default_open     BOOLEAN  NOT NULL DEFAULT true,
  sidebar_width_px         INTEGER  NOT NULL DEFAULT 260,

  -- ── Editor ─────────────────────────────────────────────────────────────
  auto_save_delay_ms       INTEGER  NOT NULL DEFAULT 800,
  default_font_size        TEXT     NOT NULL DEFAULT '14px',
  editor_placeholder       TEXT     NOT NULL DEFAULT 'Start writing… type [[ to link a note',

  -- ── Notes ──────────────────────────────────────────────────────────────
  default_note_visibility  BOOLEAN  NOT NULL DEFAULT true,        -- true = visible
  auto_delete_empty_notes  BOOLEAN  NOT NULL DEFAULT true,        -- delete notes with no content on blur
  default_tags             TEXT[]   NOT NULL DEFAULT '{}',        -- auto-applied tags on every new note

  -- ── Graph View ─────────────────────────────────────────────────────────
  graph_node_color         TEXT     NOT NULL DEFAULT '#6366f1',
  graph_edge_color         TEXT     NOT NULL DEFAULT '#94a3b8',
  graph_link_color         TEXT     NOT NULL DEFAULT '#818cf8',   -- explicit wiki-link edge colour
  graph_show_labels        BOOLEAN  NOT NULL DEFAULT true,
  graph_node_size          INTEGER  NOT NULL DEFAULT 6,           -- base node radius in px
  graph_charge             INTEGER  NOT NULL DEFAULT -120,        -- D3 force charge strength

  -- ── Features ───────────────────────────────────────────────────────────
  enable_graph_view        BOOLEAN  NOT NULL DEFAULT true,
  enable_similarity        BOOLEAN  NOT NULL DEFAULT true,
  similarity_threshold     FLOAT    NOT NULL DEFAULT 0.3  CHECK (similarity_threshold BETWEEN 0 AND 1),
  enable_mentions          BOOLEAN  NOT NULL DEFAULT true,        -- [[ ]] wiki-link autocomplete
  enable_tags              BOOLEAN  NOT NULL DEFAULT true,

  -- ── Overflow (for future / custom settings) ────────────────────────────
  extra                    JSONB    NOT NULL DEFAULT '{}',

  -- ── Timestamps ─────────────────────────────────────────────────────────
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── auto-update updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_ideation_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ideation_config_updated_at ON ideation_config;
CREATE TRIGGER trg_ideation_config_updated_at
  BEFORE UPDATE ON ideation_config
  FOR EACH ROW EXECUTE FUNCTION update_ideation_config_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE ideation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config: select own"
  ON ideation_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "config: insert own"
  ON ideation_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "config: update own"
  ON ideation_config FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "config: delete own"
  ON ideation_config FOR DELETE
  USING (auth.uid() = user_id);

-- ── Helpful index ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ideation_config_user_id ON ideation_config (user_id);

-- ── Comments ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE  ideation_config                       IS 'Per-user settings for the bori_ideation app.';
COMMENT ON COLUMN ideation_config.theme                 IS 'light | dark | system';
COMMENT ON COLUMN ideation_config.accent_color          IS 'Hex string used as the primary UI accent colour.';
COMMENT ON COLUMN ideation_config.auto_save_delay_ms    IS 'Debounce delay (ms) before writing note content to Supabase.';
COMMENT ON COLUMN ideation_config.similarity_threshold  IS 'Minimum cosine-similarity score (0–1) to show a related-note suggestion.';
COMMENT ON COLUMN ideation_config.extra                 IS 'Escape-hatch JSONB for experimental / overflow settings.';
