import { supabase } from "../lib/supabase.js";

// ── Column name ↔ JS camelCase mappers ──────────────────────────────────────

export const CONFIG_DEFAULTS = {
  theme: "system",
  accentColor: "#6366f1",
  sidebarDefaultOpen: true,
  sidebarWidthPx: 260,
  autoSaveDelayMs: 800,
  defaultFontSize: "14px",
  editorPlaceholder: "Start writing… type [[ to link a note",
  defaultNoteVisibility: true,
  autoDeleteEmptyNotes: true,
  defaultTags: [],
  graphNodeColor: "#6366f1",
  graphEdgeColor: "#94a3b8",
  graphLinkColor: "#818cf8",
  graphShowLabels: true,
  graphNodeSize: 6,
  graphCharge: -120,
  enableGraphView: true,
  enableSimilarity: true,
  similarityThreshold: 0.3,
  enableMentions: true,
  enableTags: true,
  extra: {},
};

const toConfig = (row) => ({
  id: row.id,
  userId: row.user_id,
  theme: row.theme,
  accentColor: row.accent_color,
  sidebarDefaultOpen: row.sidebar_default_open,
  sidebarWidthPx: row.sidebar_width_px,
  autoSaveDelayMs: row.auto_save_delay_ms,
  defaultFontSize: row.default_font_size,
  editorPlaceholder: row.editor_placeholder,
  defaultNoteVisibility: row.default_note_visibility,
  autoDeleteEmptyNotes: row.auto_delete_empty_notes,
  defaultTags: row.default_tags ?? [],
  graphNodeColor: row.graph_node_color,
  graphEdgeColor: row.graph_edge_color,
  graphLinkColor: row.graph_link_color,
  graphShowLabels: row.graph_show_labels,
  graphNodeSize: row.graph_node_size,
  graphCharge: row.graph_charge,
  enableGraphView: row.enable_graph_view,
  enableSimilarity: row.enable_similarity,
  similarityThreshold: row.similarity_threshold,
  enableMentions: row.enable_mentions,
  enableTags: row.enable_tags,
  extra: row.extra ?? {},
});

const toRow = (cfg, userId) => ({
  user_id: userId,
  theme: cfg.theme,
  accent_color: cfg.accentColor,
  sidebar_default_open: cfg.sidebarDefaultOpen,
  sidebar_width_px: cfg.sidebarWidthPx,
  auto_save_delay_ms: cfg.autoSaveDelayMs,
  default_font_size: cfg.defaultFontSize,
  editor_placeholder: cfg.editorPlaceholder,
  default_note_visibility: cfg.defaultNoteVisibility,
  auto_delete_empty_notes: cfg.autoDeleteEmptyNotes,
  default_tags: cfg.defaultTags,
  graph_node_color: cfg.graphNodeColor,
  graph_edge_color: cfg.graphEdgeColor,
  graph_link_color: cfg.graphLinkColor,
  graph_show_labels: cfg.graphShowLabels,
  graph_node_size: cfg.graphNodeSize,
  graph_charge: cfg.graphCharge,
  enable_graph_view: cfg.enableGraphView,
  enable_similarity: cfg.enableSimilarity,
  similarity_threshold: cfg.similarityThreshold,
  enable_mentions: cfg.enableMentions,
  enable_tags: cfg.enableTags,
  extra: cfg.extra,
});

// ── API ──────────────────────────────────────────────────────────────────────

/** Fetch config for the current user. Returns defaults merged with DB row. */
export async function fetchConfig(userId) {
  const { data, error } = await supabase
    .from("ideation_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[configService] fetchConfig error:", error.message);
    return { ...CONFIG_DEFAULTS };
  }
  if (!data) return { ...CONFIG_DEFAULTS };
  return toConfig(data);
}

/**
 * Create or update the config row for userId.
 * Only the fields present in `partial` are written.
 */
export async function upsertConfig(partial, userId) {
  const row = toRow({ ...CONFIG_DEFAULTS, ...partial }, userId);
  const { error } = await supabase
    .from("ideation_config")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.error("[configService] upsertConfig error:", error.message);
  }
}

/** Reset a user's config to all defaults (deletes the row). */
export async function deleteConfig(userId) {
  const { error } = await supabase
    .from("ideation_config")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("[configService] deleteConfig error:", error.message);
  }
}

// ── Folder helpers ───────────────────────────────────────────────────────────

/**
 * Upsert the folders array for userId into ideation_config.
 * Creates the config row if it doesn't exist yet.
 */
export async function saveFolders(folders, userId) {
  const { error } = await supabase
    .from("ideation_config")
    .upsert({ user_id: userId, folders }, { onConflict: "user_id" });

  if (error) {
    console.error("[configService] saveFolders error:", error.message);
  }
}

/** Load only the folders column for userId. Returns [] on error / not found. */
export async function loadFolders(userId) {
  const { data, error } = await supabase
    .from("ideation_config")
    .select("folders")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[configService] loadFolders error:", error.message);
    return [];
  }
  return data?.folders ?? [];
}

/**
 * Persist the default folder name for userId inside the `extra` JSONB column.
 * Uses a targeted upsert so it doesn't clobber other columns.
 */
export async function saveDefaultFolderName(name, userId) {
  // Read current extra first so we don't overwrite other keys
  const { data } = await supabase
    .from("ideation_config")
    .select("extra")
    .eq("user_id", userId)
    .maybeSingle();

  const extra = { ...(data?.extra ?? {}), defaultFolderName: name };

  const { error } = await supabase
    .from("ideation_config")
    .upsert({ user_id: userId, extra }, { onConflict: "user_id" });

  if (error) {
    console.error(
      "[configService] saveDefaultFolderName error:",
      error.message,
    );
  }
}

/** Load the default folder name saved for userId. Returns null if not set. */
export async function loadDefaultFolderName(userId) {
  const { data, error } = await supabase
    .from("ideation_config")
    .select("extra")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      "[configService] loadDefaultFolderName error:",
      error.message,
    );
    return null;
  }
  return data?.extra?.defaultFolderName ?? null;
}

/**
 * Load all extra fields at once (single DB read).
 * Returns the full `extra` JSONB object, or {} on error.
 */
export async function loadExtraFields(userId) {
  const { data, error } = await supabase
    .from("ideation_config")
    .select("extra")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[configService] loadExtraFields error:", error.message);
    return {};
  }
  return data?.extra ?? {};
}

/**
 * Persist the thinkingNoteIds array for userId inside the `extra` JSONB column.
 */
export async function saveThinkingNoteIds(ids, userId) {
  const { data } = await supabase
    .from("ideation_config")
    .select("extra")
    .eq("user_id", userId)
    .maybeSingle();

  const extra = { ...(data?.extra ?? {}), thinkingNoteIds: ids };

  const { error } = await supabase
    .from("ideation_config")
    .upsert({ user_id: userId, extra }, { onConflict: "user_id" });

  if (error) {
    console.error("[configService] saveThinkingNoteIds error:", error.message);
  }
}
