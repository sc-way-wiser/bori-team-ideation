import { supabase } from "../lib/supabase.js";

// ── Mappers ──────────────────────────────────────────────────────────────────
const toNote = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  tags: row.tags ?? [],
  linkedNoteIds: row.linked_note_ids ?? [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  folderId: row.folder_id ?? null,
  folderName: row.folder_name ?? null,
  isVisible: row.is_visible ?? true,
  ownerId: row.user_id ?? null,
  sharedWith: row.shared_with ?? [],
  editAccess: row.edit_access ?? [],
  editRequests: row.edit_requests ?? [],
  linkedOnly: row.linked_only ?? false,
  originNoteId: row.origin_note_id ?? null,
});

const toRow = (note) => ({
  id: note.id,
  title: note.title,
  content: note.content,
  tags: note.tags,
  linked_note_ids: note.linkedNoteIds,
  created_at: note.createdAt,
  updated_at: note.updatedAt,
  user_id: note.ownerId ?? null,
  is_visible: note.isVisible ?? true,
  shared_with: note.sharedWith ?? [],
  folder_id: note.folderId ?? null,
  folder_name: note.folderName ?? null,
  edit_access: note.editAccess ?? [],
  edit_requests: note.editRequests ?? [],
  linked_only: note.linkedOnly ?? false,
  origin_note_id: note.originNoteId ?? null,
});

// ── API service ──────────────────────────────────────────────────────────────

/** Fetch all notes the current user is allowed to see.
 * Scoping is handled entirely by RLS on bori_ideation — no app-level filter needed.
 */
export async function fetchAllNotes() {
  const { data, error } = await supabase
    .from("bori_ideation")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[noteService] fetchAllNotes error:", error.message);
    return [];
  }
  return data.map(toNote);
}

/** Insert or update a note (upsert by id) */
export async function upsertNote(note) {
  const { error } = await supabase
    .from("bori_ideation")
    .upsert(toRow(note), { onConflict: "id" });

  if (error) {
    console.error("[noteService] upsertNote error:", error.message);
  }
}

/** Delete a note by id */
export async function deleteNoteById(id) {
  const { error } = await supabase.from("bori_ideation").delete().eq("id", id);

  if (error) {
    console.error("[noteService] deleteNoteById error:", error.message);
  }
}

/**
 * Targeted update — only writes folder_id and folder_name.
 * Used by moveNoteToFolder so shared users immediately see the right hierarchy
 * without relying on a full note upsert.
 */
export async function patchNoteFolder(noteId, folderId, folderName) {
  const { error } = await supabase
    .from("bori_ideation")
    .update({
      folder_id: folderId ?? null,
      folder_name: folderName ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    console.error("[noteService] patchNoteFolder error:", error.message);
  }
}

/**
 * Targeted update — only writes shared_with, edit_access, edit_requests.
 * Called immediately on share/unshare so the change is visible without
 * waiting for the full debounced upsert.
 */
export async function patchNoteSharing(
  noteId,
  sharedWith,
  editAccess,
  editRequests,
) {
  const { error } = await supabase
    .from("bori_ideation")
    .update({
      shared_with: sharedWith ?? [],
      edit_access: editAccess ?? [],
      edit_requests: editRequests ?? [],
    })
    .eq("id", noteId);

  if (error) {
    console.error("[noteService] patchNoteSharing error:", error.message);
  }
}

/** Fetch all users who are ideation members from userProfiles table */
export async function fetchAdminUsers() {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("is_ideation_member", true);

  if (error) {
    console.error("[noteService] fetchAdminUsers error:", error.message);
    return [];
  }

  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? u.user_email ?? "",
    full_name: u.full_name ?? u.fullName ?? u.name ?? u.display_name ?? "",
    avatar_url: u.avatar_url ?? u.avatarUrl ?? u.avatar ?? null,
    role: u.role,
  }));
}
