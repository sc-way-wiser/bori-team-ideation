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
    let updated;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        updated = {
          ...n,
          folderId,
          folderName,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    if (updated) {
      // Write folder assignment immediately (not debounced) so shared
      // users see the correct folder hierarchy on their next load
      dbPatchFolder(updated.id, updated.folderId, updated.folderName);
      scheduleUpsert(updated, 800);
    }
  },

  createFolder: (name) => {
    const id = uuidv4();
    const userId = get().currentUserId;
    const folder = {
      id,
      name,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ folders: [...state.folders, folder] }));
    insertFolder({ id, name, ownerId: userId });
    return id;
  },

  deleteFolder: (id) => {
    // Collect notes that will be unfiled so we can sync them
    const affectedNotes = get().notes.filter((n) => n.folderId === id);
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      notes: state.notes.map((n) =>
        n.folderId === id ? { ...n, folderId: null, folderName: null } : n,
      ),
    }));
    deleteFolderById(id); // DB delete
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
    set((state) => ({
      defaultFolderName: name,
      // Update folderName on all notes currently in the default folder
      notes: state.notes.map((n) =>
        n.folderId === null ? { ...n, folderName: name } : n,
      ),
    }));
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
