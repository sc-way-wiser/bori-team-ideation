import { supabase } from "../lib/supabase.js";

// ── Mappers ──────────────────────────────────────────────────────────────────
const toFolder = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  parentId: row.parent_id ?? null,
  sharedWith: row.shared_with ?? [],
  editAccess: row.edit_access ?? [],
  editRequests: row.edit_requests ?? [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Fetch all folders owned by the current user.
 * RLS ensures only own rows are returned.
 */
export async function fetchFolders() {
  const { data, error } = await supabase
    .from("ideation_folders")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[foldersService] fetchFolders error:", error.message);
    return [];
  }
  return (data ?? []).map(toFolder);
}

/**
 * Insert a new folder row.  Returns the created folder or null on error.
 * owner_id defaults to the current authenticated user via auth.uid().
 */
export async function insertFolder({ id, name, ownerId, parentId }) {
  const row = { id, name };
  if (ownerId) row.owner_id = ownerId;
  if (parentId) row.parent_id = parentId;
  const { data, error } = await supabase
    .from("ideation_folders")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[foldersService] insertFolder error:", error.message);
    return null;
  }
  return data ? toFolder(data) : null;
}

/**
 * Rename a folder by id.  Owner-only (RLS enforced).
 */
export async function renameFolderById(id, name) {
  const { error } = await supabase
    .from("ideation_folders")
    .update({ name })
    .eq("id", id);

  if (error) {
    console.error("[foldersService] renameFolderById error:", error.message);
  }
}

/**
 * Delete a folder by id.  Owner-only (RLS enforced).
 */
export async function deleteFolderById(id) {
  const { error } = await supabase
    .from("ideation_folders")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[foldersService] deleteFolderById error:", error.message);
  }
}

/**
 * Update sharing arrays on a folder row.
 */
export async function patchFolderSharing(
  id,
  sharedWith,
  editAccess,
  editRequests,
) {
  const { error } = await supabase
    .from("ideation_folders")
    .update({
      shared_with: sharedWith,
      edit_access: editAccess,
      edit_requests: editRequests,
    })
    .eq("id", id);

  if (error) {
    console.error("[foldersService] patchFolderSharing error:", error.message);
  }
}
