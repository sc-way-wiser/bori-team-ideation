import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../lib/supabase.js";
import { extractLinks } from "../utils/parseLinks.js";
import {
  fetchAllNotes,
  upsertNote as dbUpsert,
  deleteNoteById as dbDelete,
  patchNoteFolder as dbPatchFolder,
  patchNoteSharing as dbPatchSharing,
} from "../services/noteService.js";
import {
  fetchFolders,
  insertFolder,
  renameFolderById,
  deleteFolderById,
  patchFolderSharing,
} from "../services/foldersService.js";
import {
  fetchConfig,
  saveDefaultFolderName,
  saveThinkingNoteIds,
} from "../services/configService.js";

// Debounce map: noteId → timeout handle
// Prevents hammering Supabase on every keystroke
const debounceMap = new Map();

function scheduleUpsert(note, delayMs = 800) {
  const existing = debounceMap.get(note.id);
  if (existing) clearTimeout(existing);
  debounceMap.set(
    note.id,
    setTimeout(() => {
      dbUpsert(note);
      debounceMap.delete(note.id);
    }, delayMs),
  );
}

/** Returns true when a note has no meaningful user content. */
function isNoteEmpty(note) {
  if (!note) return true;
  const hasTitle = note.title && note.title !== "Untitled";
  const hasContent =
    note.content && note.content.replace(/<[^>]*>/g, "").trim() !== "";
  const hasTags = (note.tags ?? []).length > 0;
  return !hasTitle && !hasContent && !hasTags;
}

export const useNoteStore = create((set, get) => ({
  notes: [],
  folders: [],
  defaultFolderName: "Notes",
  activeNoteId: null,
  pendingShareNoteId: null,
  isLoading: false,
  currentUserId: null,
  thinkingNoteIds: [],

  // ── Boot: load everything from Supabase ─────────────────────────────────
  loadNotes: async () => {
    set({ isLoading: true });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      set({ isLoading: false });
      return;
    }
    set({ currentUserId: user.id });

    // Parallel fetch: notes + folders + config
    const [remote, folders, config] = await Promise.all([
      fetchAllNotes(),
      fetchFolders(),
      fetchConfig(user.id),
    ]);

    const configDefaultName = config.defaultFolderName ?? "Notes";
    const thinkingNoteIds = config.thinkingNoteIds ?? [];

    // Prune empty own notes never given content
    const emptyOwn = remote.filter(
      (n) => n.ownerId === user.id && isNoteEmpty(n),
    );
    if (emptyOwn.length > 0) {
      await Promise.all(emptyOwn.map((n) => dbDelete(n.id)));
    }
    const cleaned = remote.filter(
      (n) => !(n.ownerId === user.id && isNoteEmpty(n)),
    );

    // ── Reconstruct any folders missing from ideation_folders ─────────────
    // Pre-migration (or if the table is empty), notes still carry their
    // folderId + folderName from the bori_ideation row. Rebuild folder
    // objects from that denormalized data so the Sidebar always renders
    // the correct sections. Any reconstructed folders are also backfilled
    // into ideation_folders so future loads are consistent.
    const knownFolderIds = new Set(folders.map((f) => f.id));
    const syntheticMap = new Map(); // id → name (deduplicated)
    for (const n of cleaned) {
      if (
        n.ownerId === user.id &&
        n.folderId &&
        !knownFolderIds.has(n.folderId)
      ) {
        if (!syntheticMap.has(n.folderId)) {
          syntheticMap.set(n.folderId, n.folderName ?? "Folder");
        }
      }
    }
    if (syntheticMap.size > 0) {
      const synthetic = Array.from(syntheticMap, ([id, name]) => ({
        id,
        name,
        ownerId: user.id,
        createdAt: new Date().toISOString(),
      }));
      // Backfill into ideation_folders (idempotent via ON CONFLICT DO NOTHING)
      await Promise.all(
        synthetic.map((f) =>
          insertFolder({ id: f.id, name: f.name, ownerId: user.id }),
        ),
      );
      folders.push(...synthetic);
    }

    // ── Resolve defaultFolderName ──────────────────────────────────────────
    // The config column may not exist yet (pre-migration), so also check the
    // denormalized folderName on own notes with folderId=null — those are
    // written by dbPatchFolder and survive even without the new column.
    const ownDefaultNote = cleaned.find(
      (n) =>
        n.ownerId === user.id &&
        n.folderId === null &&
        n.folderName &&
        n.folderName !== "Notes",
    );
    const defaultFolderName = ownDefaultNote?.folderName ?? configDefaultName;

    // ── Ensure exactly ONE backing row for the default folder ─────────────
    // Collect all top-level own rows with the default name (duplicates included)
    const allDefaultRows = folders.filter(
      (f) =>
        !f.parentId && f.ownerId === user.id && f.name === defaultFolderName,
    );
    if (allDefaultRows.length > 1) {
      // Keep the first, delete the rest from DB and from local array
      const toDelete = allDefaultRows.slice(1);
      toDelete.forEach((f) => deleteFolderById(f.id));
      const deleteIds = new Set(toDelete.map((f) => f.id));
      folders.splice(
        0,
        folders.length,
        ...folders.filter((f) => !deleteIds.has(f.id)),
      );
    } else if (allDefaultRows.length === 0) {
      // No row at all — reuse an orphaned "Notes" row or create fresh
      const orphaned = folders.find(
        (f) => !f.parentId && f.ownerId === user.id && f.name === "Notes",
      );
      if (orphaned && defaultFolderName !== "Notes") {
        await renameFolderById(orphaned.id, defaultFolderName);
        const idx = folders.findIndex((f) => f.id === orphaned.id);
        folders[idx] = { ...folders[idx], name: defaultFolderName };
      } else if (!orphaned) {
        const newId = uuidv4();
        folders.push({
          id: newId,
          name: defaultFolderName,
          ownerId: user.id,
          parentId: null,
          sharedWith: [],
          editAccess: [],
          editRequests: [],
          createdAt: new Date().toISOString(),
        });
        await insertFolder({
          id: newId,
          name: defaultFolderName,
          ownerId: user.id,
          parentId: null,
        });
      }
    }

    // Normalize notes that had folderId set to the default folder's backing
    // row UUID back to null — they belong in the unfiled default section.
    const defaultBackingId = folders.find(
      (f) =>
        !f.parentId && f.ownerId === user.id && f.name === defaultFolderName,
    )?.id;
    if (defaultBackingId) {
      for (let i = 0; i < cleaned.length; i++) {
        if (
          cleaned[i].folderId === defaultBackingId &&
          cleaned[i].ownerId === user.id
        ) {
          cleaned[i] = { ...cleaned[i], folderId: null };
          dbPatchFolder(cleaned[i].id, null, defaultFolderName);
        }
      }
    }

    set({
      notes: cleaned,
      folders,
      defaultFolderName,
      thinkingNoteIds,
      isLoading: false,
      activeNoteId: get().activeNoteId ?? cleaned[0]?.id ?? null,
    });
  },

  createNote: (folderId = null, opts = {}) => {
    const userId = get().currentUserId;
    if (!userId) {
      console.warn("Cannot create note: no current user ID");
      return null;
    }
    const {
      linkedOnly = false,
      originNote = null,
      folderName: explicitFolderName = null,
    } = opts;
    const id = uuidv4();
    const now = new Date().toISOString();
    const folder = folderId
      ? get().folders.find((f) => f.id === folderId)
      : null;
    const newNote = {
      id,
      title: "Untitled",
      content: "",
      tags: [],
      linkedNoteIds: [],
      folderId: folderId ?? null,
      folderName: explicitFolderName ?? folder?.name ?? get().defaultFolderName,
      isVisible: true,
      ownerId: userId,
      sharedWith: [],
      editAccess: [],
      editRequests: [],
      linkedOnly,
      originNoteId: originNote?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      notes: [newNote, ...state.notes],
      activeNoteId: id,
    }));
    // Don't persist to DB yet — the first real edit (updateNote) will do it.
    return id;
  },

  updateNote: (id, data) => {
    let updatedNote;
    set((state) => ({
      notes: state.notes.map((note) => {
        if (note.id !== id) return note;
        const newContent = data.content ?? note.content;
        const newTitle = data.title ?? note.title;
        const wikiLinks = extractLinks(newContent);
        const linkedNoteIds = wikiLinks
          .map(
            (linkTitle) =>
              state.notes.find((n) => n.id !== id && n.title === linkTitle)?.id,
          )
          .filter((lid) => !!lid);
        updatedNote = {
          ...note,
          title: newTitle,
          content: newContent,
          // tags are managed exclusively via addTag/removeTag — never overwrite here
          linkedNoteIds,
          updatedAt: new Date().toISOString(),
        };
        return updatedNote;
      }),
    }));
    if (updatedNote) scheduleUpsert(updatedNote);
  },

  deleteNote: (id) => {
    set((state) => {
      const notes = state.notes.filter((n) => n.id !== id);
      let nextActiveId = state.activeNoteId;
      if (state.activeNoteId === id) {
        const idx = state.notes.findIndex((n) => n.id === id);
        // pick the note that was below, or the one above if it was last
        nextActiveId =
          state.notes[idx + 1]?.id ?? state.notes[idx - 1]?.id ?? null;
      }
      return { notes, activeNoteId: nextActiveId };
    });
    dbDelete(id);
  },

  addTag: (id, tag) => {
    const clean = tag.trim().replace(/^#+/, "").toLowerCase();
    if (!clean) return;
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== id || n.tags.includes(clean)) return n;
        updated = {
          ...n,
          tags: [...n.tags, clean],
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) scheduleUpsert(updated, 200);
  },

  removeTag: (id, tag) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== id) return n;
        updated = {
          ...n,
          tags: n.tags.filter((t) => t !== tag),
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) scheduleUpsert(updated, 200);
  },

  addCollaborator: (noteId, userId) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        const sharedWith = n.sharedWith ?? [];
        if (sharedWith.includes(userId)) return n;
        updated = {
          ...n,
          sharedWith: [...sharedWith, userId],
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests,
      );
      scheduleUpsert(updated, 800);
    }
  },

  removeCollaborator: (noteId, userId) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        updated = {
          ...n,
          sharedWith: (n.sharedWith ?? []).filter((id) => id !== userId),
          // Also revoke edit access when unsharing
          editAccess: (n.editAccess ?? []).filter((id) => id !== userId),
          editRequests: (n.editRequests ?? []).filter((id) => id !== userId),
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests,
      );
      scheduleUpsert(updated, 800);
    }
  },

  toggleNoteVisibility: (id) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== id) return n;
        updated = {
          ...n,
          isVisible: !(n.isVisible ?? true),
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) scheduleUpsert(updated, 200);
  },

  setActiveNote: (id) => {
    const prev = get().activeNoteId;
    // Auto-delete the note we're leaving if it's still empty
    if (prev && prev !== id) {
      const old = get().notes.find((n) => n.id === prev);
      if (old && old.ownerId === get().currentUserId && isNoteEmpty(old)) {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== prev),
        }));
        dbDelete(prev);
      }
    }
    set({ activeNoteId: id });
  },

  requestShareFor: (id) => set({ activeNoteId: id, pendingShareNoteId: id }),

  clearPendingShare: () => set({ pendingShareNoteId: null }),

  /** Non-owner requests edit access for a note */
  requestEditAccess: (noteId, userId) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        const editRequests = n.editRequests ?? [];
        if (editRequests.includes(userId)) return n;
        updated = {
          ...n,
          editRequests: [...editRequests, userId],
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests,
      );
      scheduleUpsert(updated, 800);
    }
  },

  /** Owner grants edit access to a user (and removes any pending request) */
  grantEditAccess: (noteId, userId) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        const editAccess = n.editAccess ?? [];
        if (editAccess.includes(userId)) return n;
        updated = {
          ...n,
          editAccess: [...editAccess, userId],
          editRequests: (n.editRequests ?? []).filter((id) => id !== userId),
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests,
      );
      scheduleUpsert(updated, 800);
    }
  },

  /** Owner revokes edit access from a user */
  revokeEditAccess: (noteId, userId) => {
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        updated = {
          ...n,
          editAccess: (n.editAccess ?? []).filter((id) => id !== userId),
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests,
      );
      scheduleUpsert(updated, 800);
    }
  },

  moveNoteToFolder: (noteId, folderId) => {
    const folder = folderId
      ? get().folders.find((f) => f.id === folderId)
      : null;
    const folderName = folder?.name ?? get().defaultFolderName;

    // Resolve effective sharing on the target folder (or its parent)
    const resolveSharing = (f) => {
      if (!f) return { sharedWith: [], editAccess: [] };
      // If the folder itself is shared, use its sharing
      if ((f.sharedWith ?? []).length > 0) return f;
      // Otherwise check the parent folder
      if (f.parentId) {
        const parent = get().folders.find((p) => p.id === f.parentId);
        if (parent && (parent.sharedWith ?? []).length > 0) return parent;
      }
      return { sharedWith: [], editAccess: [] };
    };
    const targetSharing = resolveSharing(folder);
    const targetSharedWith = targetSharing.sharedWith ?? [];
    const targetEditAccess = targetSharing.editAccess ?? [];

    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        // Auto-share: if target folder is shared, adopt its sharing.
        // Auto-unshare: if target folder is NOT shared, clear sharing.
        const newSharedWith =
          targetSharedWith.length > 0 ? [...targetSharedWith] : [];
        const newEditAccess =
          targetEditAccess.length > 0 ? [...targetEditAccess] : [];
        updated = {
          ...n,
          folderId,
          folderName,
          sharedWith: newSharedWith,
          editAccess: newEditAccess,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      // Write folder assignment immediately (not debounced) so shared
      // users see the correct folder hierarchy on their next load
      dbPatchFolder(updated.id, updated.folderId, updated.folderName);
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests ?? [],
      );
      scheduleUpsert(updated, 800);
    }
  },

  createFolder: (name, parentId = null) => {
    const id = uuidv4();
    const userId = get().currentUserId;
    const folder = {
      id,
      name,
      parentId,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ folders: [...state.folders, folder] }));
    insertFolder({ id, name, ownerId: userId, parentId });
    return id;
  },

  deleteFolder: (id) => {
    // Collect child sub-folder ids (DB cascade handles the rows, but we
    // need to unfile notes assigned to them in local state too).
    const childIds = get()
      .folders.filter((f) => f.parentId === id)
      .map((f) => f.id);
    const removedIds = new Set([id, ...childIds]);

    // Collect notes that will be unfiled so we can sync them
    const affectedNotes = get().notes.filter((n) => removedIds.has(n.folderId));
    set((state) => ({
      folders: state.folders.filter((f) => !removedIds.has(f.id)),
      notes: state.notes.map((n) =>
        removedIds.has(n.folderId)
          ? { ...n, folderId: null, folderName: null }
          : n,
      ),
    }));
    deleteFolderById(id); // DB cascade deletes children too
    affectedNotes.forEach((n) =>
      scheduleUpsert({ ...n, folderId: null, folderName: null }, 200),
    );
  },

  renameFolder: (id, name) => {
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, name } : f)),
      // Keep folderName on notes in sync
      notes: state.notes.map((n) =>
        n.folderId === id ? { ...n, folderName: name } : n,
      ),
    }));
    // Persist updated names to Supabase — immediate targeted write for shared-user sync
    const renamedNotes = get().notes.filter((n) => n.folderId === id);
    renamedNotes.forEach((n) => dbPatchFolder(n.id, n.folderId, name));
    renamedNotes.forEach((n) => scheduleUpsert(n, 200));
    renameFolderById(id, name); // update ideation_folders row
  },

  renameDefaultFolder: (name) => {
    // Also rename the backing ideation_folders row if it exists
    const { folders, defaultFolderName: oldName, currentUserId } = get();
    const backingRow = folders.find(
      (f) => !f.parentId && f.ownerId === currentUserId && f.name === oldName,
    );
    if (backingRow) {
      // Rename the existing backing row
      set((state) => ({
        defaultFolderName: name,
        notes: state.notes.map((n) =>
          n.folderId === null ? { ...n, folderName: name } : n,
        ),
        folders: state.folders.map((f) =>
          f.id === backingRow.id ? { ...f, name } : f,
        ),
      }));
      renameFolderById(backingRow.id, name);
    } else {
      // No backing row yet — create one with the new name
      const newId = uuidv4();
      const newRow = {
        id: newId,
        name,
        ownerId: currentUserId,
        parentId: null,
        sharedWith: [],
        editAccess: [],
        editRequests: [],
        createdAt: new Date().toISOString(),
      };
      set((state) => ({
        defaultFolderName: name,
        notes: state.notes.map((n) =>
          n.folderId === null ? { ...n, folderName: name } : n,
        ),
        folders: [...state.folders, newRow],
      }));
      insertFolder({ id: newId, name, ownerId: currentUserId, parentId: null });
    }
    // Immediately patch DB so shared users see the new name
    const defaultNotes = get().notes.filter(
      (n) => n.folderId === null && n.ownerId === get().currentUserId,
    );
    defaultNotes.forEach((n) => dbPatchFolder(n.id, null, name));
    // Persist the name itself so it loads consistently on any device
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id) saveDefaultFolderName(name, user.id);
    });
  },

  // ── Folder sharing ──────────────────────────────────────────────────────

  /** Share a folder (and all its notes) with a user */
  addFolderCollaborator: (folderId, userId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const sharedWith = folder.sharedWith ?? [];
    if (sharedWith.includes(userId)) return;
    const newSharedWith = [...sharedWith, userId];
    // Update folder state
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId ? { ...f, sharedWith: newSharedWith } : f,
      ),
    }));
    patchFolderSharing(
      folderId,
      newSharedWith,
      folder.editAccess ?? [],
      folder.editRequests ?? [],
    );
    // Auto-share all notes in this folder with the user
    const folderNotes = get().notes.filter((n) => n.folderId === folderId);
    for (const n of folderNotes) {
      if (!(n.sharedWith ?? []).includes(userId)) {
        const updated = {
          ...n,
          sharedWith: [...(n.sharedWith ?? []), userId],
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          notes: state.notes.map((x) => (x.id === n.id ? updated : x)),
        }));
        dbPatchSharing(
          updated.id,
          updated.sharedWith,
          updated.editAccess,
          updated.editRequests ?? [],
        );
        scheduleUpsert(updated, 300);
      }
    }
  },

  /** Unshare a folder (and all its notes) from a user */
  removeFolderCollaborator: (folderId, userId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const newSharedWith = (folder.sharedWith ?? []).filter(
      (id) => id !== userId,
    );
    const newEditAccess = (folder.editAccess ?? []).filter(
      (id) => id !== userId,
    );
    const newEditRequests = (folder.editRequests ?? []).filter(
      (id) => id !== userId,
    );
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              sharedWith: newSharedWith,
              editAccess: newEditAccess,
              editRequests: newEditRequests,
            }
          : f,
      ),
    }));
    patchFolderSharing(folderId, newSharedWith, newEditAccess, newEditRequests);
    // Auto-unshare all notes in this folder from the user
    const folderNotes = get().notes.filter((n) => n.folderId === folderId);
    for (const n of folderNotes) {
      if ((n.sharedWith ?? []).includes(userId)) {
        const updated = {
          ...n,
          sharedWith: (n.sharedWith ?? []).filter((id) => id !== userId),
          editAccess: (n.editAccess ?? []).filter((id) => id !== userId),
          editRequests: (n.editRequests ?? []).filter((id) => id !== userId),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          notes: state.notes.map((x) => (x.id === n.id ? updated : x)),
        }));
        dbPatchSharing(
          updated.id,
          updated.sharedWith,
          updated.editAccess,
          updated.editRequests,
        );
        scheduleUpsert(updated, 300);
      }
    }
  },

  /** Request edit access on a folder */
  requestFolderEditAccess: (folderId, userId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const editRequests = folder.editRequests ?? [];
    if (editRequests.includes(userId)) return;
    const newEditRequests = [...editRequests, userId];
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId ? { ...f, editRequests: newEditRequests } : f,
      ),
    }));
    patchFolderSharing(
      folderId,
      folder.sharedWith ?? [],
      folder.editAccess ?? [],
      newEditRequests,
    );
  },

  /** Grant edit access on a folder (and all its notes) */
  grantFolderEditAccess: (folderId, userId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const editAccess = folder.editAccess ?? [];
    if (editAccess.includes(userId)) return;
    const newEditAccess = [...editAccess, userId];
    const newEditRequests = (folder.editRequests ?? []).filter(
      (id) => id !== userId,
    );
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId
          ? { ...f, editAccess: newEditAccess, editRequests: newEditRequests }
          : f,
      ),
    }));
    patchFolderSharing(
      folderId,
      folder.sharedWith ?? [],
      newEditAccess,
      newEditRequests,
    );
    // Grant edit access on all notes in this folder too
    const folderNotes = get().notes.filter((n) => n.folderId === folderId);
    for (const n of folderNotes) {
      if (!(n.editAccess ?? []).includes(userId)) {
        const updated = {
          ...n,
          editAccess: [...(n.editAccess ?? []), userId],
          editRequests: (n.editRequests ?? []).filter((id) => id !== userId),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          notes: state.notes.map((x) => (x.id === n.id ? updated : x)),
        }));
        dbPatchSharing(
          updated.id,
          updated.sharedWith,
          updated.editAccess,
          updated.editRequests,
        );
        scheduleUpsert(updated, 300);
      }
    }
  },

  /** Revoke edit access on a folder (and all its notes) */
  revokeFolderEditAccess: (folderId, userId) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const newEditAccess = (folder.editAccess ?? []).filter(
      (id) => id !== userId,
    );
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId ? { ...f, editAccess: newEditAccess } : f,
      ),
    }));
    patchFolderSharing(
      folderId,
      folder.sharedWith ?? [],
      newEditAccess,
      folder.editRequests ?? [],
    );
    // Revoke edit on all notes in the folder
    const folderNotes = get().notes.filter((n) => n.folderId === folderId);
    for (const n of folderNotes) {
      if ((n.editAccess ?? []).includes(userId)) {
        const updated = {
          ...n,
          editAccess: (n.editAccess ?? []).filter((id) => id !== userId),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          notes: state.notes.map((x) => (x.id === n.id ? updated : x)),
        }));
        dbPatchSharing(
          updated.id,
          updated.sharedWith,
          updated.editAccess,
          updated.editRequests ?? [],
        );
        scheduleUpsert(updated, 300);
      }
    }
  },

  /** Directly links two notes (bidirectional strong relationship) */
  addLinkedNote: (noteId, targetId) => {
    if (noteId === targetId) return;
    let updatedA, updatedB;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id === noteId && !n.linkedNoteIds.includes(targetId)) {
          updatedA = {
            ...n,
            linkedNoteIds: [...n.linkedNoteIds, targetId],
            updatedAt: new Date().toISOString(),
          };
          return updatedA;
        }
        if (n.id === targetId && !n.linkedNoteIds.includes(noteId)) {
          updatedB = {
            ...n,
            linkedNoteIds: [...n.linkedNoteIds, noteId],
            updatedAt: new Date().toISOString(),
          };
          return updatedB;
        }
        return n;
      }),
    }));
    if (updatedA) scheduleUpsert(updatedA, 300);
    if (updatedB) scheduleUpsert(updatedB, 300);
  },

  /** Removes a direct link between two notes (bidirectional) */
  removeLinkedNote: (noteId, targetId) => {
    let updatedA, updatedB;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id === noteId) {
          updatedA = {
            ...n,
            linkedNoteIds: n.linkedNoteIds.filter((id) => id !== targetId),
            updatedAt: new Date().toISOString(),
          };
          return updatedA;
        }
        if (n.id === targetId) {
          updatedB = {
            ...n,
            linkedNoteIds: n.linkedNoteIds.filter((id) => id !== noteId),
            updatedAt: new Date().toISOString(),
          };
          return updatedB;
        }
        return n;
      }),
    }));
    if (updatedA) scheduleUpsert(updatedA, 300);
    if (updatedB) scheduleUpsert(updatedB, 300);
  },

  /**
   * One-click share: copies the folder owner's sharedWith list
   * (+ the owner themselves) onto the given note.
   */
  shareToFolderCollaborators: (noteId) => {
    const note = get().notes.find((n) => n.id === noteId);
    if (!note || !note.folderName) return;
    const userId = get().currentUserId;

    // Find notes in that same folderName owned by someone else
    const ownerNotes = get().notes.filter(
      (n) =>
        n.folderName === note.folderName &&
        n.ownerId !== userId &&
        (n.sharedWith ?? []).includes(userId),
    );
    if (ownerNotes.length === 0) return;

    // Collect all collaborators from the folder owner's notes + the owner
    const collabSet = new Set();
    for (const on of ownerNotes) {
      collabSet.add(on.ownerId);
      for (const uid of on.sharedWith ?? []) collabSet.add(uid);
    }
    // Remove self from the set
    collabSet.delete(userId);
    const sharedWith = [...collabSet];
    const editAccess = [...collabSet];

    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        updated = {
          ...n,
          sharedWith,
          editAccess,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      dbPatchSharing(
        updated.id,
        updated.sharedWith,
        updated.editAccess,
        updated.editRequests ?? [],
      );
      scheduleUpsert(updated, 300);
    }
  },

  getNoteById: (id) => get().notes.find((n) => n.id === id),

  getNoteByTitle: (title) =>
    get().notes.find((n) => n.title.toLowerCase() === title.toLowerCase()),

  getLinkedNotes: (id) => {
    const note = get().getNoteById(id);
    if (!note) return [];
    return note.linkedNoteIds
      .map((lid) => get().getNoteById(lid))
      .filter((n) => !!n);
  },

  getGraphData: () => {
    const { notes } = get();
    const nodes = notes.map((n) => ({
      id: n.id,
      name: n.title,
      val: 1 + n.linkedNoteIds.length,
    }));
    const linkSet = new Set();
    const links = [];
    for (const note of notes) {
      for (const lid of note.linkedNoteIds) {
        const key = [note.id, lid].sort().join("--");
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: note.id, target: lid });
        }
      }
    }
    return { nodes, links };
  },

  searchNotes: (query) => {
    if (!query.trim()) return get().notes;
    const q = query.toLowerCase();
    return get().notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content
          .replace(/<[^>]*>/g, " ")
          .toLowerCase()
          .includes(q),
    );
  },

  toggleThinking: (id) => {
    set((state) => ({
      thinkingNoteIds: state.thinkingNoteIds.includes(id)
        ? state.thinkingNoteIds.filter((x) => x !== id)
        : [...state.thinkingNoteIds, id],
    }));
    // Persist to Supabase so the toggle syncs across devices
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id) saveThinkingNoteIds(get().thinkingNoteIds, user.id);
    });
  },

  getNotesByTag: (tag) => get().notes.filter((n) => n.tags.includes(tag)),

  getAllTags: () => {
    // Only count tags from notes visible to the user
    const counts = {};
    const notes = get().notes;
    // Use isAccessible from Sidebar, so expose a helper or pass in a filter
    // For now, assume currentUserId is available and note.sharedWith/ownerId
    const userId = get().currentUserId;
    for (const note of notes) {
      const isOwner = note.ownerId === userId;
      const isShared =
        Array.isArray(note.sharedWith) && note.sharedWith.includes(userId);
      if (isOwner || isShared) {
        for (const tag of note.tags) {
          counts[tag] = (counts[tag] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  },
}));
