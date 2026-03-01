import { useState, useRef, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  FolderSimplePlusIcon as FolderPlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  TagIcon,
  CaretDownIcon as ChevronDownIcon,
  CaretRightIcon as ChevronRightIcon,
  XIcon,
  PencilSimpleIcon as PencilIcon,
  TrashIcon as Trash2Icon,
  CheckIcon,
  UserPlusIcon,
  DotsThreeIcon,
  ArrowRightIcon,
  ShareNetworkIcon,
  LockSimpleIcon,
  PencilSimpleIcon as EditIcon,
  LinkSimpleIcon,
  LightbulbIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useNoteStore } from "../../store/useNoteStore.js";
import { fetchAdminUsers } from "../../services/noteService.js";
import BottomSheet from "../ui/BottomSheet.jsx";
import useBrowser from "../../hooks/useBrowserDetect.jsx";

// ── Move-to Popover ──────────────────────────────────────────────────────────
const MoveToPopover = ({
  note,
  anchorRect,
  folders,
  defaultFolderName,
  onMove,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const popRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  const rootLabel = defaultFolderName || "Notes";
  const allFolders = [{ id: null, name: rootLabel }, ...folders];
  const filtered = search.trim()
    ? allFolders.filter((f) =>
        f.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : allFolders;

  const POP_W = 240;
  return ReactDOM.createPortal(
    <div
      data-portal
      ref={popRef}
      style={{
        position: "fixed",
        bottom: window.innerHeight - anchorRect.top + 8,
        right: Math.min(
          window.innerWidth - anchorRect.right,
          window.innerWidth - POP_W - 8,
        ),
        zIndex: 9999,
        width: POP_W,
        maxHeight: 320,
      }}
      className="bg-(--color-surface) border border-(--color-border) rounded-xl shadow-xl flex flex-col overflow-hidden"
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-(--color-border)">
        <MagnifyingGlassIcon
          size={13}
          className="text-(--color-text-muted) shrink-0"
        />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search folders…"
          className="flex-1 bg-transparent text-sm text-(--color-text) placeholder-(--color-text-muted) outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-(--color-text-muted) hover:text-(--color-text)"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* Folder list */}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-(--color-text-muted) text-center py-4">
            No folders found
          </p>
        ) : (
          filtered.map((f) => {
            const isCurrent = note
              ? f.id === null
                ? note.folderId == null
                : note.folderId === f.id
              : false;
            return (
              <button
                key={f.id ?? "__root__"}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(e, f.id);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                  isCurrent
                    ? "bg-(--color-primary-bg) text-(--color-primary-dk) font-semibold"
                    : "text-(--color-text) hover:bg-(--color-hover)"
                }`}
              >
                <FolderIcon size={14} className="shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                {isCurrent && (
                  <CheckIcon size={13} className="shrink-0 ml-auto" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
};

// ── Bulk Share Popover ────────────────────────────────────────────────────────
const BulkSharePopover = ({ noteIds, anchorRect, onClose }) => {
  const {
    addCollaborator,
    removeCollaborator,
    grantEditAccess,
    revokeEditAccess,
    notes,
    currentUserId,
  } = useNoteStore();
  const [adminUsers, setAdminUsers] = useState([]);
  const popRef = useRef(null);
  const isSingle = noteIds.length === 1;
  const singleNote = isSingle ? notes.find((n) => n.id === noteIds[0]) : null;

  useEffect(() => {
    fetchAdminUsers().then(setAdminUsers);
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  const others = adminUsers.filter((u) => u.id !== currentUserId);

  // A user is "fully added" if they appear in every selected note's sharedWith
  const isAddedToAll = (userId) =>
    noteIds.every((id) => {
      const note = notes.find((n) => n.id === id);
      return note?.sharedWith?.includes(userId);
    });

  const isAddedToSome = (userId) =>
    noteIds.some((id) => {
      const note = notes.find((n) => n.id === id);
      return note?.sharedWith?.includes(userId);
    });

  const toggleUser = (userId) => {
    const allAdded = isAddedToAll(userId);
    noteIds.forEach((id) => {
      if (allAdded) {
        removeCollaborator(id, userId);
        // also revoke edit access when unsharing
        revokeEditAccess(id, userId);
      } else {
        addCollaborator(id, userId);
      }
    });
  };

  const hasEditAll = (userId) =>
    isSingle && (singleNote?.editAccess ?? []).includes(userId);

  const toggleEdit = (e, userId) => {
    e.stopPropagation();
    if (!isSingle) return;
    if (hasEditAll(userId)) revokeEditAccess(noteIds[0], userId);
    else grantEditAccess(noteIds[0], userId);
  };

  // Pending edit requests (single note only)
  const pendingRequests = isSingle ? (singleNote?.editRequests ?? []) : [];
  const pendingUsers = pendingRequests
    .map((uid) => adminUsers.find((u) => u.id === uid))
    .filter(Boolean);

  const POP_W = 320;
  return ReactDOM.createPortal(
    <div
      data-portal
      ref={popRef}
      style={{
        position: "fixed",
        bottom: window.innerHeight - anchorRect.top + 8,
        // Clamp right so the popover never bleeds past the left viewport edge
        right: Math.min(
          window.innerWidth - anchorRect.right,
          window.innerWidth - POP_W - 8,
        ),
        zIndex: 9999,
        width: POP_W,
        maxHeight: 380,
      }}
      className="bg-(--color-surface) border border-(--color-border) rounded-xl shadow-xl overflow-y-auto py-1"
    >
      {/* Pending edit requests section */}
      {pendingUsers.length > 0 && (
        <>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider px-3 pt-2 pb-1 flex items-center gap-1.5">
            <EditIcon size={12} />
            Edit requests
          </p>
          {pendingUsers.map((user) => {
            const initials = (user.full_name ||
              user.email ||
              "U")[0].toUpperCase();
            return (
              <div
                key={user.id}
                className="flex items-center gap-2.5 px-3 py-2 bg-amber-50"
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                    alt=""
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-amber-200 text-amber-900">
                    {initials}
                  </div>
                )}
                <span className="flex-1 text-xs font-medium text-(--color-text) truncate">
                  {user.full_name || user.email}
                </span>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    grantEditAccess(noteIds[0], user.id);
                  }}
                  className="text-xs px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 font-semibold hover:bg-amber-500 transition-colors shrink-0"
                >
                  Approve
                </button>
              </div>
            );
          })}
          <div className="border-t border-(--color-border-lt)" />
        </>
      )}

      <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider px-3 pt-2 pb-1">
        Share {noteIds.length} note{noteIds.length > 1 ? "s" : ""} with
      </p>
      <div className="border-t border-(--color-border-lt)" />
      {others.length === 0 ? (
        <p className="text-xs text-(--color-text-muted) px-3 py-3">
          No admin users found
        </p>
      ) : (
        others.map((user) => {
          const addedAll = isAddedToAll(user.id);
          const addedSome = isAddedToSome(user.id);
          const canToggleEdit = isSingle && addedAll;
          const editGranted = hasEditAll(user.id);
          const initials = (user.full_name ||
            user.email ||
            "U")[0].toUpperCase();
          return (
            <div
              key={user.id}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-(--color-hover) transition-colors"
            >
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleUser(user.id);
                }}
                className="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden text-left"
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                    alt=""
                  />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      backgroundColor: "var(--color-primary)",
                      color: "var(--color-primary-dk)",
                    }}
                  >
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-(--color-text) truncate">
                    {user.full_name || user.email}
                  </div>
                  {user.full_name && (
                    <div className="text-xs text-(--color-text-muted) truncate">
                      {user.email}
                    </div>
                  )}
                </div>
                {addedAll && !canToggleEdit && (
                  <CheckIcon
                    size={12}
                    className="text-(--color-primary-dk) shrink-0"
                  />
                )}
                {addedSome && !addedAll && (
                  <span className="w-2 h-2 rounded-full bg-(--color-primary-dk) shrink-0" />
                )}
              </button>

              {/* Edit access toggle — only shown for single note when user is already shared */}
              {canToggleEdit && (
                <button
                  onMouseDown={(e) => toggleEdit(e, user.id)}
                  title={
                    editGranted ? "Revoke edit access" : "Grant edit access"
                  }
                  className={`shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    editGranted
                      ? "bg-(--color-primary) border-(--color-primary-dk) text-(--color-primary-dk) font-semibold"
                      : "border-(--color-border) text-(--color-text-muted) hover:border-(--color-primary-dk) hover:text-(--color-primary-dk)"
                  }`}
                >
                  <EditIcon size={10} />
                  {editGranted ? "Can edit" : "Read-only"}
                </button>
              )}
            </div>
          );
        })
      )}
    </div>,
    document.body,
  );
};

// ── Draggable note row ────────────────────────────────────────────────────────
const NoteRow = ({
  note,
  isActive,
  isLinked,
  onSelect,
  onDragStart,
  onShare,
  isSelected,
  onToggleSelect,
}) => {
  const shared = (note.sharedWith ?? []).length > 0;
  const {
    folders,
    notes,
    deleteNote,
    moveNoteToFolder,
    createNote,
    activeNoteId,
    setActiveNote,
    currentUserId,
    defaultFolderName,
    requestEditAccess,
    thinkingNoteIds,
  } = useNoteStore();
  const isThinking = thinkingNoteIds.includes(note.id);
  const isOwner = note.ownerId === currentUserId;
  const hasEditAccess = (note.editAccess ?? []).includes(currentUserId);
  const hasRequested = (note.editRequests ?? []).includes(currentUserId);
  const hasLinkedNote = notes.some((n) => n.originNoteId === note.id);
  const { isMobile } = useBrowser();
  const [isMoving, setIsMoving] = useState(false);

  // Detect if this is User B's own note sitting in a shared folder
  const isInSharedFolder =
    isOwner &&
    !note.folderId &&
    note.folderName &&
    notes.some(
      (n) =>
        n.ownerId !== currentUserId &&
        n.folderName === note.folderName &&
        (n.sharedWith ?? []).includes(currentUserId),
    );
  const isAlreadySharedToFolder =
    isInSharedFolder && (note.sharedWith ?? []).length > 0;
  const { shareToFolderCollaborators } = useNoteStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveAnchorRect, setMoveAnchorRect] = useState(null);
  // sheet-level sub-view: null | "move"
  const [sheetView, setSheetView] = useState(null);
  const [sheetMoveSearch, setSheetMoveSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAnchorRect, setShareAnchorRect] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const dotsButtonRef = useRef(null);
  const moveButtonRef = useRef(null);
  const shareButtonRef = useRef(null);
  const mobileShareButtonRef = useRef(null);
  const menuRef = useRef(null); // portal dropdown div
  const dotsContainerRef = useRef(null); // wrapper around the ··· button

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!menuOpen || isMobile) return;
    const handler = (e) => {
      const inPortal = menuRef.current?.contains(e.target);
      const inTrigger = dotsContainerRef.current?.contains(e.target);
      if (!inPortal && !inTrigger) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, isMobile]);

  const handleDelete = (e) => {
    e?.stopPropagation();
    setMenuOpen(false);
    if (activeNoteId === note.id) setActiveNote(null);
    deleteNote(note.id);
  };

  const handleAddLinkedNote = (e) => {
    e?.stopPropagation();
    setMenuOpen(false);
    setSheetView(null);
    createNote(note.folderId, { linkedOnly: true, originNote: note });
  };

  const handleMove = (e, folderId) => {
    e?.stopPropagation();
    setMenuOpen(false);
    setMoveOpen(false);
    setMoveAnchorRect(null);
    setSheetView(null);
    // Animate note out, then actually move it
    setIsMoving(true);
    setTimeout(() => moveNoteToFolder(note.id, folderId), 240);
  };

  // ── Folder list (mobile sheet reuses this with search filter) ───────
  const renderFolderList = (search = "") => {
    const q = search.trim().toLowerCase();
    const rootLabel = defaultFolderName || "Notes";
    const allFolders = [{ id: null, name: rootLabel }, ...folders];
    const filtered = q
      ? allFolders.filter((f) => f.name.toLowerCase().includes(q))
      : allFolders;
    if (filtered.length === 0)
      return (
        <p className="text-xs text-(--color-text-muted) text-center py-4">
          No folders found
        </p>
      );
    return filtered.map((f) => {
      const isCurrent =
        f.id === null ? note.folderId == null : note.folderId === f.id;
      return (
        <button
          key={f.id ?? "__root__"}
          onClick={(e) => handleMove(e, f.id)}
          className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
            isCurrent
              ? "text-(--color-primary-dk) font-semibold bg-(--color-primary-bg)"
              : "text-(--color-text) hover:bg-(--color-hover)"
          }`}
        >
          <FolderIcon size={15} />
          <span className="truncate">{f.name}</span>
          {isCurrent && <CheckIcon size={13} className="ml-auto" />}
        </button>
      );
    });
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="cursor-grab active:cursor-grabbing"
      style={{
        transition: "opacity 240ms ease, transform 240ms ease",
        opacity: isMoving ? 0 : 1,
        transform: isMoving
          ? "translateX(18px) scale(0.96)"
          : "translateX(0) scale(1)",
      }}
    >
      <div
        className={`flex items-center gap-0.5 mb-0.5 pr-1 transition-colors group/nr ${
          isActive
            ? "bg-(--color-primary-bg) border-l-2 border-(--color-primary)"
            : "hover:bg-(--color-hover)"
        }`}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(note.id);
          }}
          className={`shrink-0 ml-1 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            isSelected
              ? "bg-(--color-primary-dk) border-(--color-primary-dk)"
              : "border-(--color-border) hover:border-(--color-primary-dk)"
          }`}
        >
          {isSelected && (
            <CheckIcon
              size={12}
              color="text-(--color-on-primary)"
              weight="bold"
            />
          )}
        </button>

        <button
          onClick={onSelect}
          className="flex-1 text-left px-2 py-2 min-w-0 overflow-hidden"
        >
          <div
            className={`text-sm font-medium truncate ${
              isActive ? "text-(--color-primary-dk)" : "text-(--color-text)"
            }`}
          >
            {note.title || "Untitled"}
          </div>
          <div className="text-xs text-(--color-text-muted) mt-0.5">
            {format(new Date(note.updatedAt), "MMM d, yyyy")}
            {note.tags.length > 0 && (
              <span className="ml-2 text-(--color-primary-dk)/70">
                #{note.tags[0]}
                {note.tags.length > 1 ? ` +${note.tags.length - 1}` : ""}
              </span>
            )}
          </div>
        </button>

        {/* Thinking indicator */}
        {isThinking && (
          <span className="shrink-0 p-1 text-(--color-primary-dk)">
            <LightbulbIcon size={16} weight="bold" />
          </span>
        )}

        {/* Linked indicator */}
        {isLinked && (
          <span className="shrink-0 p-1 text-purple-500">
            <LinkSimpleIcon size={18} weight="bold" />
          </span>
        )}

        {/* Shared indicator */}
        {shared && (
          <span className="shrink-0 p-1 text-(--color-primary-dk)/70">
            <UsersIcon size={18} />
          </span>
        )}

        {/* ··· button */}
        <div className="relative shrink-0" ref={dotsContainerRef}>
          <button
            ref={dotsButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              if (!menuOpen && dotsButtonRef.current) {
                const r = dotsButtonRef.current.getBoundingClientRect();
                const dropdownH = 140; // approx height of dropdown
                const spaceBelow = window.innerHeight - r.bottom;
                const top =
                  spaceBelow >= dropdownH
                    ? r.bottom + 2
                    : r.top - dropdownH - 2;
                setMenuPos({ top, right: window.innerWidth - r.right });
              }
              setMenuOpen((v) => !v);
              setMoveOpen(false);
              setSheetView(null);
            }}
            className="p-1 rounded transition-colors text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) cursor-pointer"
            title="More actions"
          >
            <DotsThreeIcon size={20} weight="bold" />
          </button>

          {/* ── DESKTOP dropdown (portal) ── */}
          {!isMobile &&
            menuOpen &&
            ReactDOM.createPortal(
              <div
                ref={menuRef}
                style={{
                  position: "fixed",
                  top: menuPos.top,
                  right: menuPos.right,
                  zIndex: 9999,
                }}
                className="w-44 bg-(--color-surface) border border-(--color-border) rounded-3xl shadow-md overflow-hidden text-sm"
              >
                {isOwner && isInSharedFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      shareToFolderCollaborators(note.id);
                    }}
                    disabled={isAlreadySharedToFolder}
                    className="w-full flex items-center gap-2 px-3 py-3 hover:bg-(--color-hover) text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-default"
                  >
                    <ShareNetworkIcon size={18} />
                    {isAlreadySharedToFolder
                      ? "Shared to folder"
                      : "Share to folder"}
                  </button>
                )}

                {isOwner && !isInSharedFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      const rect =
                        shareButtonRef.current?.getBoundingClientRect();
                      setShareAnchorRect(rect ?? null);
                      setShareOpen((v) => !v);
                    }}
                    ref={shareButtonRef}
                    className="w-full flex items-center gap-2 px-3 py-3 hover:bg-(--color-hover) text-(--color-text) transition-colors"
                  >
                    <UserPlusIcon size={18} />
                    {shared ? `Shared (${note.sharedWith.length})` : "Share"}
                  </button>
                )}

                {isOwner && (
                  <button
                    onClick={handleAddLinkedNote}
                    disabled={hasLinkedNote}
                    className="w-full flex items-center gap-2 px-3 py-3 hover:bg-(--color-hover) text-(--color-text) transition-colors disabled:opacity-40 disabled:cursor-default"
                  >
                    <LinkSimpleIcon size={14} />
                    Add explicit note
                  </button>
                )}

                {/* Non-owner: move/delete hidden; show edit access request */}
                {!isOwner && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      if (!hasRequested && !hasEditAccess)
                        requestEditAccess(note.id, currentUserId);
                    }}
                    disabled={hasRequested || hasEditAccess}
                    className="w-full flex items-center gap-2 px-3 py-3 hover:bg-(--color-hover) text-(--color-text) transition-colors disabled:opacity-50 disabled:cursor-default"
                  >
                    <LockSimpleIcon size={14} />
                    {hasEditAccess
                      ? "You can edit"
                      : hasRequested
                        ? "Edit request sent"
                        : "Request edit access"}
                  </button>
                )}

                {isOwner && (
                  <button
                    ref={moveButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      const rect =
                        moveButtonRef.current?.getBoundingClientRect();
                      setMoveAnchorRect(rect ?? null);
                      setMoveOpen((v) => !v);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-3 hover:bg-(--color-hover) text-(--color-text) transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <FolderIcon size={14} />
                      Move to…
                    </span>
                    <ArrowRightIcon
                      size={12}
                      className="text-(--color-text-muted)"
                    />
                  </button>
                )}

                {isOwner && (
                  <>
                    <div className="border-t border-(--color-border)" />
                    <button
                      onClick={handleDelete}
                      className="w-full flex items-center gap-2 px-3 py-3 text-red-500 hover:bg-stone-100 transition-colors"
                    >
                      <Trash2Icon size={14} />
                      Delete
                    </button>
                  </>
                )}
              </div>,
              document.body,
            )}
          {/* Single-note share popover */}
          {shareOpen && shareAnchorRect && (
            <BulkSharePopover
              noteIds={[note.id]}
              anchorRect={shareAnchorRect}
              onClose={() => setShareOpen(false)}
            />
          )}
          {/* Move-to popover */}
          {moveOpen && moveAnchorRect && (
            <MoveToPopover
              note={note}
              anchorRect={moveAnchorRect}
              folders={folders}
              defaultFolderName={defaultFolderName}
              onMove={(e, folderId) => {
                handleMove(e, folderId);
                setMoveOpen(false);
                setMoveAnchorRect(null);
              }}
              onClose={() => {
                setMoveOpen(false);
                setMoveAnchorRect(null);
              }}
            />
          )}
        </div>
      </div>

      {/* ── MOBILE bottom sheet ── */}
      <BottomSheet
        isOpen={isMobile && menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setSheetView(null);
        }}
        showHandle
        showHeader={!!sheetView}
        headerBackButton={!!sheetView}
        title={sheetView === "move" ? "Move to…" : ""}
        maxHeight="60vh"
        minHeight="auto"
      >
        {sheetView === "move" ? (
          <div className="pb-6">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-(--color-border)">
              <MagnifyingGlassIcon
                size={13}
                className="text-(--color-text-muted) shrink-0"
              />
              <input
                autoFocus
                value={sheetMoveSearch}
                onChange={(e) => setSheetMoveSearch(e.target.value)}
                placeholder="Search folders…"
                className="flex-1 bg-transparent text-sm text-(--color-text) placeholder-(--color-text-muted) outline-none"
              />
              {sheetMoveSearch && (
                <button
                  onClick={() => setSheetMoveSearch("")}
                  className="text-(--color-text-muted) hover:text-(--color-text)"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
            {renderFolderList(sheetMoveSearch)}
          </div>
        ) : (
          <div className="pb-6">
            {/* Note title */}
            <p className="px-4 pt-3 pb-2 text-sm font-semibold text-(--color-text) truncate">
              {note.title || "Untitled"}
            </p>
            <div className="border-t border-(--color-border-lt) mb-1" />

            {/* Share to folder — one-click for notes in shared folders */}
            {isOwner && isInSharedFolder && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setSheetView(null);
                  shareToFolderCollaborators(note.id);
                }}
                disabled={isAlreadySharedToFolder}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-(--color-text) hover:bg-(--color-hover) transition-colors disabled:opacity-50 disabled:cursor-default"
              >
                <ShareNetworkIcon size={18} />
                {isAlreadySharedToFolder
                  ? "Shared to folder"
                  : "Share to folder"}
              </button>
            )}

            {/* Share — owner only (normal folders) */}
            {isOwner && !isInSharedFolder && (
              <button
                ref={mobileShareButtonRef}
                onClick={() => {
                  setMenuOpen(false);
                  setSheetView(null);
                  const rect =
                    mobileShareButtonRef.current?.getBoundingClientRect();
                  setShareAnchorRect(rect ?? null);
                  setShareOpen((v) => !v);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-(--color-text) hover:bg-(--color-hover) transition-colors"
              >
                <UserPlusIcon size={18} />
                {shared ? `Shared with ${note.sharedWith.length}` : "Share"}
              </button>
            )}

            {/* Add linked note — owner only */}
            {isOwner && (
              <button
                onClick={handleAddLinkedNote}
                disabled={hasLinkedNote}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-(--color-text) hover:bg-(--color-hover) transition-colors disabled:opacity-40 disabled:cursor-default"
              >
                <LinkSimpleIcon size={18} />
                Add explicit note
              </button>
            )}

            {/* Non-owner: request edit access */}
            {!isOwner && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setSheetView(null);
                  if (!hasRequested && !hasEditAccess)
                    requestEditAccess(note.id, currentUserId);
                }}
                disabled={hasRequested || hasEditAccess}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-(--color-text) hover:bg-(--color-hover) transition-colors disabled:opacity-50 disabled:cursor-default"
              >
                <LockSimpleIcon size={18} />
                {hasEditAccess
                  ? "You can edit"
                  : hasRequested
                    ? "Edit request sent"
                    : "Request edit access"}
              </button>
            )}

            {/* Move to — owner only */}
            {isOwner && (
              <button
                onClick={() => {
                  setSheetView("move");
                  setSheetMoveSearch("");
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-sm text-(--color-text) hover:bg-(--color-hover) transition-colors"
              >
                <span className="flex items-center gap-3">
                  <FolderIcon size={18} />
                  Move to…
                </span>
                <ArrowRightIcon
                  size={14}
                  className="text-(--color-text-muted)"
                />
              </button>
            )}

            {isOwner && (
              <div className="border-t border-(--color-border-lt) my-1" />
            )}

            {/* Delete — owner only */}
            {isOwner && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2Icon size={18} />
                Delete
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </li>
  );
};

// ── Folder section ────────────────────────────────────────────────────────────
const FolderSection = ({
  folderId,
  folderName,
  notes,
  activeNoteId,
  linkedNoteIdSet,
  isDragOver,
  onNoteSelect,
  onNoteShare,
  onDragStartNote,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddNote,
  onRename,
  onDelete,
  selectedNoteIds,
  onToggleSelect,
  readonly = false,
}) => {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(folderName);
  const longPressTimeout = useRef(null);

  const startEditing = () => {
    setNameVal(folderName);
    setEditing(true);
  };

  const commitRename = () => {
    const trimmed = nameVal.trim();
    if (trimmed) onRename?.(trimmed);
    setEditing(false);
  };

  const cancelRename = () => {
    setNameVal(folderName);
    setEditing(false);
  };

  // Long press on folder name to enter rename mode (owner folders only)
  const handleLongPressStart = (e) => {
    if (readonly) return;
    if (e.button !== undefined && e.button !== 0) return;
    longPressTimeout.current = setTimeout(startEditing, 600);
  };
  const handleLongPressEnd = () => {
    clearTimeout(longPressTimeout.current);
  };

  const folderNoteIds = notes.map((n) => n.id);
  const isAllSelected =
    folderNoteIds.length > 0 &&
    folderNoteIds.every((id) => selectedNoteIds?.has(id));
  const isPartialSelected =
    !isAllSelected && folderNoteIds.some((id) => selectedNoteIds?.has(id));

  const toggleFolderSelect = () => {
    if (isAllSelected) {
      folderNoteIds.forEach(
        (id) => selectedNoteIds?.has(id) && onToggleSelect(id),
      );
    } else {
      folderNoteIds.forEach(
        (id) => !selectedNoteIds?.has(id) && onToggleSelect(id),
      );
    }
  };

  return (
    <div
      className={`rounded-md transition-colors mb-1 ${!readonly && isDragOver ? "ring-2 ring-(--color-primary) bg-(--color-primary-bg)" : ""}`}
      onDragOver={!readonly ? onDragOver : undefined}
      onDragLeave={!readonly ? onDragLeave : undefined}
      onDrop={!readonly ? onDrop : undefined}
    >
      {/* Folder header */}
      <div className="flex items-center gap-1 px-1 py-1 group/fh">
        {/* Icons — click to toggle open/close */}
        <button
          onClick={() => !editing && setOpen((v) => !v)}
          className="flex items-center gap-1 shrink-0 text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {open ? (
            <FolderOpenIcon size={18} className="text-(--color-primary-dk)" />
          ) : (
            <FolderIcon size={18} />
          )}
          {open ? (
            <ChevronDownIcon size={16} />
          ) : (
            <ChevronRightIcon size={16} />
          )}
        </button>

        {/* Folder name — long-press to rename */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === "Escape") cancelRename();
              }}
              autoFocus
              className="w-full bg-(--color-input) border border-(--color-primary) rounded px-1.5 py-0.5 text-xs font-semibold text-(--color-text) outline-none"
            />
          ) : (
            <span
              className="block truncate text-xs font-semibold text-(--color-text) uppercase tracking-wider cursor-default select-none"
              title="Long-press to rename"
              onMouseDown={handleLongPressStart}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={handleLongPressStart}
              onTouchEnd={handleLongPressEnd}
            >
              {folderName}
            </span>
          )}
        </div>

        {!editing && !readonly && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/fh:opacity-100 transition-opacity">
            <button
              onClick={startEditing}
              title="Rename folder"
              className="p-0.5 rounded text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) transition-colors"
            >
              <PencilIcon size={15} />
            </button>
            {folderId !== null && (
              <button
                onClick={onDelete}
                title="Delete folder"
                className="p-0.5 rounded text-(--color-text-muted) hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2Icon size={15} />
              </button>
            )}
          </div>
        )}

        {onAddNote && (
          <button
            onClick={onAddNote}
            title={folderId ? "New note in folder" : "New note"}
            className="p-0.5 rounded text-(--color-text-muted) hover:text-(--color-primary-dk) hover:bg-(--color-hover) transition-colors shrink-0"
          >
            <PlusIcon size={15} />
          </button>
        )}
      </div>

      {open && (
        <ul className="px-2 pb-1 overflow-y-auto max-h-115 md:max-h-192">
          {notes.length === 0 ? (
            <li className="text-xs text-(--color-text-muted) px-2 py-1.5 italic">
              {isDragOver ? "Drop here…" : "No notes"}
            </li>
          ) : (
            <>
              {/* Per-folder select all */}
              <li className="flex items-center gap-2 px-1.5 py-2 border-b border-(--color-border) mb-0.5">
                <button
                  onClick={toggleFolderSelect}
                  aria-label={`Select all in ${folderName}`}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isAllSelected || isPartialSelected
                      ? "bg-(--color-primary-dk) border-(--color-primary-dk)"
                      : "border-(--color-border) hover:border-(--color-primary-dk)"
                  }`}
                >
                  {isAllSelected && (
                    <CheckIcon
                      size={10}
                      color="text-(--color-on-primary)"
                      weight="bold"
                    />
                  )}
                  {isPartialSelected && !isAllSelected && (
                    <span
                      style={{
                        width: 8,
                        height: 2,
                        borderRadius: 1,
                        backgroundColor: "var(--color-on-primary)",
                        display: "block",
                      }}
                    />
                  )}
                </button>
                <button
                  onClick={toggleFolderSelect}
                  className="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  {isAllSelected ? "Deselect all" : "Select all"}
                </button>
              </li>
              {notes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  isActive={activeNoteId === note.id}
                  isLinked={!!linkedNoteIdSet?.has(note.id)}
                  onSelect={() => onNoteSelect(note.id)}
                  onShare={() => onNoteShare?.(note.id)}
                  onDragStart={(e) => onDragStartNote(e, note.id)}
                  isSelected={selectedNoteIds?.has(note.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
              {isDragOver && (
                <li className="text-xs text-(--color-primary-dk) px-2 py-1">
                  <CheckIcon size={10} className="inline mr-1" />
                  Drop to move here
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
};

// ── Main Sidebar ──────────────────────────────────────────────────────────────
const Sidebar = ({ onNoteSelect, onClose }) => {
  const {
    notes,
    folders,
    activeNoteId,
    createNote,
    setActiveNote,
    searchNotes,
    getAllTags,
    getNotesByTag,
    createFolder,
    deleteFolder,
    renameFolder,
    moveNoteToFolder,
    currentUserId,
    defaultFolderName,
    renameDefaultFolder,
    requestShareFor,
  } = useNoteStore();

  const [query, setQuery] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [activeTag, setActiveTag] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState(new Set());
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkShareAnchor, setBulkShareAnchor] = useState(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveAnchor, setBulkMoveAnchor] = useState(null);
  const shareFloatRef = useRef(null);
  const moveFloatRef = useRef(null);
  const draggingNoteId = useRef(null);

  const toggleNoteSelect = (id) =>
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allTags = getAllTags();
  const isSearching = !!query.trim() || !!activeTag;

  // Compute explicitly linked note IDs (originNoteId only, bidirectional)
  const activeNote = notes.find((n) => n.id === activeNoteId);
  const linkedNoteIdSet = useMemo(() => {
    if (!activeNote) return new Set();
    const ids = new Set();
    // Notes explicitly created from the active note
    for (const n of notes) {
      if (n.originNoteId === activeNoteId) ids.add(n.id);
    }
    // The note this active note was explicitly created from
    if (activeNote.originNoteId) ids.add(activeNote.originNoteId);
    return ids;
  }, [activeNote, notes, activeNoteId]);

  // Folder names from other users' shared notes — used to keep B's
  // shared-folder notes out of the root section.
  const sharedFolderNames = useMemo(() => {
    const names = new Set();
    for (const n of notes) {
      if (
        n.ownerId !== currentUserId &&
        (n.sharedWith ?? []).includes(currentUserId) &&
        n.folderName
      ) {
        names.add(n.folderName);
      }
    }
    return names;
  }, [notes, currentUserId]);

  // User B's own folder IDs whose name clashes with a "Shared with me" folder.
  // These folders are hidden from the regular section and their notes are merged
  // into the shared section instead — so the same name never appears twice.
  const clashingFolderIds = useMemo(() => {
    const ids = new Set();
    for (const f of folders) {
      if (sharedFolderNames.has(f.name)) ids.add(f.id);
    }
    return ids;
  }, [folders, sharedFolderNames]);

  const isAccessible = (note) => {
    if (!note.ownerId) return false;
    if (note.ownerId === currentUserId) return true;
    const shared = note.sharedWith ?? [];
    if (shared.length === 0) return false;
    return shared.includes(currentUserId);
  };

  const searchResults = (
    activeTag ? getNotesByTag(activeTag) : searchNotes(query)
  ).filter(isAccessible);

  const handleNoteSelect = (id) => {
    setActiveNote(id);
    onNoteSelect(id);
  };

  const handleDragStart = (e, noteId) => {
    draggingNoteId.current = noteId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", noteId);
  };

  const handleDragOver = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolder(folderId);
  };

  const handleDrop = (e, folderId) => {
    e.preventDefault();
    const noteId =
      draggingNoteId.current ?? e.dataTransfer.getData("text/plain");
    if (noteId) moveNoteToFolder(noteId, folderId);
    draggingNoteId.current = null;
    setDragOverFolder(null);
  };

  return (
    <aside className="w-full h-full bg-(--color-background) border-r border-(--color-border) flex flex-col relative">
      {/* Mobile close header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-border) md:hidden">
        <span className="text-base font-bold text-stone-400 tracking-wider">
          Idearium
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
        >
          <XIcon size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 ">
        <div className="flex items-center gap-2 bg-(--color-input) rounded-full px-3 py-3">
          <MagnifyingGlassIcon
            size={16}
            className="text-(--color-text-muted) shrink-0"
          />
          <input
            type="text"
            placeholder="Search notes..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveTag(null);
            }}
            className="bg-transparent text-sm text-(--color-text) placeholder-(--color-text-muted) outline-none w-full"
          />
        </div>
      </div>

      {/* + Note / + Folder */}
      <div className="flex items-center gap-1.5 px-3 pb-4 bg-(--color-background) border-b border-(--color-border)">
        <button
          onClick={() => {
            const id = createNote(null);
            onNoteSelect(id);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full text-sm font-bold bg-(--color-primary) hover:bg-(--color-primary-hv) text-(--color-on-primary) transition-colors"
        >
          <PlusIcon size={18} /> Note
        </button>
        <button
          onClick={() => createFolder("New Folder")}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full text-sm font-bold bg-(--color-input) hover:bg-(--color-hover) text-(--color-text-sec) transition-colors"
        >
          <FolderPlusIcon size={18} /> Folder
        </button>
      </div>

      {/* Notes tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isSearching ? (
          <>
            <div className="px-1 pb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider flex items-center gap-1">
                <FileTextIcon size={14} />
                {activeTag ? `#${activeTag}` : "Results"}
              </span>
              <button
                onClick={() => {
                  setQuery("");
                  setActiveTag(null);
                }}
                className="text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                <XIcon size={14} />
              </button>
            </div>
            {searchResults.length === 0 ? (
              <p className="text-xs text-(--color-text-muted) px-2 py-3">
                No notes found
              </p>
            ) : (
              <ul className="pb-2">
                {searchResults.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    isActive={activeNoteId === note.id}
                    onSelect={() => handleNoteSelect(note.id)}
                    onShare={() => {
                      requestShareFor(note.id);
                      onNoteSelect(note.id);
                    }}
                    onDragStart={(e) => handleDragStart(e, note.id)}
                    isSelected={selectedNoteIds.has(note.id)}
                    onToggleSelect={toggleNoteSelect}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            {folders
              // Never show a folder in the regular section if its name matches
              // a "Shared with me" folder — regardless of whether it has notes.
              // Notes inside clashing folders are shown under "Shared with me".
              .filter((folder) => !clashingFolderIds.has(folder.id))
              .map((folder) => (
                <FolderSection
                  key={folder.id}
                  folderId={folder.id}
                  folderName={folder.name}
                  notes={notes.filter(
                    (n) =>
                      n.folderId === folder.id && n.ownerId === currentUserId,
                  )}
                  activeNoteId={activeNoteId}
                  isDragOver={dragOverFolder === folder.id}
                  onNoteSelect={handleNoteSelect}
                  onNoteShare={(id) => {
                    requestShareFor(id);
                    onNoteSelect(id);
                  }}
                  onDragStartNote={handleDragStart}
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => handleDrop(e, folder.id)}
                  onAddNote={() => {
                    const id = createNote(folder.id);
                    onNoteSelect(id);
                  }}
                  onRename={(name) => renameFolder(folder.id, name)}
                  onDelete={() => deleteFolder(folder.id)}
                  selectedNoteIds={selectedNoteIds}
                  onToggleSelect={toggleNoteSelect}
                  linkedNoteIdSet={linkedNoteIdSet}
                />
              ))}

            <FolderSection
              folderId={null}
              folderName={defaultFolderName}
              notes={notes.filter(
                (n) =>
                  n.folderId == null &&
                  n.ownerId === currentUserId &&
                  // Exclude notes that belong to a shared folder
                  !(n.folderName && sharedFolderNames.has(n.folderName)),
              )}
              activeNoteId={activeNoteId}
              isDragOver={dragOverFolder === "root"}
              onNoteSelect={handleNoteSelect}
              onNoteShare={(id) => {
                requestShareFor(id);
                onNoteSelect(id);
              }}
              onDragStartNote={handleDragStart}
              onDragOver={(e) => handleDragOver(e, "root")}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(e) => handleDrop(e, null)}
              onAddNote={() => {
                const id = createNote(null);
                onNoteSelect(id);
              }}
              onRename={(name) => renameDefaultFolder(name)}
              selectedNoteIds={selectedNoteIds}
              onToggleSelect={toggleNoteSelect}
              linkedNoteIdSet={linkedNoteIdSet}
            />

            {/* ── Shared with me ── */}
            {(() => {
              const sharedNotes = notes.filter(
                (n) =>
                  n.ownerId !== currentUserId &&
                  (n.sharedWith ?? []).includes(currentUserId),
              );
              if (sharedNotes.length === 0) return null;

              // Group by folderName (null = unfiled by owner)
              const groups = {};
              for (const note of sharedNotes) {
                const key = note.folderName ?? "__root__";
                if (!groups[key]) groups[key] = [];
                groups[key].push(note);
              }

              // Include User B's own notes that sit in a shared folder —
              // either notes filed under a clashing folder id (User B had a
              // same-named folder), or notes filed by name with no folderId.
              const groupNames = new Set(
                Object.keys(groups).filter((k) => k !== "__root__"),
              );
              const myNotesInSharedFolders = notes.filter(
                (n) =>
                  n.ownerId === currentUserId &&
                  n.folderName &&
                  groupNames.has(n.folderName) &&
                  // folderId is null (filed by name only) OR points to one of
                  // User B's clashing folders that we hid from the regular list
                  (!n.folderId || clashingFolderIds.has(n.folderId)),
              );
              for (const note of myNotesInSharedFolders) {
                const key = note.folderName;
                if (!groups[key]) groups[key] = [];
                // Avoid duplicates
                if (!groups[key].some((n) => n.id === note.id)) {
                  groups[key].push(note);
                }
              }

              const groupList = Object.entries(groups).map(
                ([key, grpNotes]) => ({
                  key,
                  name: key === "__root__" ? "Notes" : key,
                  notes: grpNotes,
                }),
              );

              return (
                <>
                  <div className="border-t border-(--color-border-lt) mt-2 mb-1 pt-2 px-2 flex items-center gap-1.5">
                    <ShareNetworkIcon
                      size={13}
                      className="text-(--color-text-muted) shrink-0"
                    />
                    <span className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider">
                      Shared with me
                    </span>
                  </div>
                  {groupList.map((group) => (
                    <FolderSection
                      key={group.key}
                      folderId={group.key}
                      folderName={group.name}
                      notes={group.notes}
                      activeNoteId={activeNoteId}
                      isDragOver={false}
                      onNoteSelect={handleNoteSelect}
                      onNoteShare={(id) => {
                        requestShareFor(id);
                        onNoteSelect(id);
                      }}
                      onDragStartNote={handleDragStart}
                      selectedNoteIds={selectedNoteIds}
                      onToggleSelect={toggleNoteSelect}
                      linkedNoteIdSet={linkedNoteIdSet}
                      readonly
                      onAddNote={() => {
                        const id = createNote(null, { folderName: group.name });
                        onNoteSelect(id);
                      }}
                    />
                  ))}
                </>
              );
            })()}
          </>
        )}

        {/* Tags */}
        <div className="border-t border-(--color-border-lt) mt-2">
          <button
            onClick={() => setTagsOpen(!tagsOpen)}
            className="w-full px-2 py-2 flex items-center gap-1.5 text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider hover:text-(--color-text-sec) transition-colors"
          >
            {tagsOpen ? (
              <ChevronDownIcon size={14} />
            ) : (
              <ChevronRightIcon size={14} />
            )}
            <TagIcon size={14} /> Tags
          </button>
          {tagsOpen && (
            <div className="px-2 pb-3 flex flex-wrap gap-1.5">
              {allTags.length === 0 ? (
                <p className="text-xs text-(--color-text-muted)">No tags yet</p>
              ) : (
                allTags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setActiveTag(activeTag === tag ? null : tag);
                      setQuery("");
                    }}
                    className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                      activeTag === tag
                        ? "bg-(--color-primary) text-(--color-text)"
                        : "bg-(--color-input) text-(--color-text-sec) hover:bg-(--color-hover)"
                    }`}
                  >
                    #{tag} <span className="opacity-60">({count})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating bulk action buttons */}
      {selectedNoteIds.size > 0 && (
        <div className="absolute bottom-5 right-4 flex items-center gap-2 z-20">
          <button
            ref={moveFloatRef}
            onClick={() => {
              const rect = moveFloatRef.current?.getBoundingClientRect();
              setBulkMoveAnchor(rect ?? null);
              setBulkMoveOpen((v) => !v);
              setBulkShareOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-(--color-surface) border border-(--color-border) text-(--color-text) text-xs font-semibold shadow-lg hover:bg-(--color-hover) transition-colors"
          >
            <FolderIcon size={15} weight="bold" />
            Move {selectedNoteIds.size}
          </button>
          <button
            ref={shareFloatRef}
            onClick={() => {
              const rect = shareFloatRef.current?.getBoundingClientRect();
              setBulkShareAnchor(rect ?? null);
              setBulkShareOpen((v) => !v);
              setBulkMoveOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-(--color-on-primary) text-white text-xs font-semibold shadow-lg hover:opacity-90 transition-opacity"
          >
            <ShareNetworkIcon size={15} weight="bold" />
            Share {selectedNoteIds.size}
          </button>
        </div>
      )}

      {bulkShareOpen && bulkShareAnchor && (
        <BulkSharePopover
          noteIds={[...selectedNoteIds]}
          anchorRect={bulkShareAnchor}
          onClose={() => setBulkShareOpen(false)}
        />
      )}

      {bulkMoveOpen && bulkMoveAnchor && (
        <MoveToPopover
          note={null}
          anchorRect={bulkMoveAnchor}
          folders={folders}
          defaultFolderName={defaultFolderName}
          onMove={(e, folderId) => {
            [...selectedNoteIds].forEach((id) =>
              moveNoteToFolder(id, folderId),
            );
            setSelectedNoteIds(new Set());
            setBulkMoveOpen(false);
            setBulkMoveAnchor(null);
          }}
          onClose={() => {
            setBulkMoveOpen(false);
            setBulkMoveAnchor(null);
          }}
        />
      )}
    </aside>
  );
};

export default Sidebar;
