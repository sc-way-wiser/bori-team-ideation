import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useBrowser } from "../../hooks/useBrowserDetect.jsx";
import {
  ShareNetworkIcon as NetworkIcon,
  LightbulbIcon,
  ListIcon as MenuIcon,
  CircleNotchIcon as Loader2Icon,
  SignOutIcon as LogOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  SunIcon,
  MoonIcon,
  PlusIcon,
  CubeIcon,
  XIcon,
  ArrowsInIcon,
  DotsNineIcon,
} from "@phosphor-icons/react";
import { useNoteStore } from "../../store/useNoteStore.js";
import { useConfigStore } from "../../store/useConfigStore.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import SignIn from "../Auth/SignIn.jsx";
import Sidebar from "../Sidebar/Sidebar.jsx";
import NoteEditor from "../Editor/Editor.jsx";
import GraphView from "../GraphView/GraphView.jsx";
import GraphView3D from "../GraphView/GraphView3D.jsx";
import Settings from "../Settings/Settings.jsx";

/* ── tiny id helper ──────────────────────────────────────────────────────── */
// Use time+random to avoid collisions during HMR (module re-exec resets counters)
const nextTabId = () =>
  `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const MAX_TABS = 5;

const Layout = () => {
  const {
    activeNoteId,
    createNote,
    setActiveNote,
    loadNotes,
    isLoading,
    notes,
    folders,
  } = useNoteStore();
  const { user, signOut } = useAuth();
  const { themeOverride, setThemeOverride } = useConfigStore();
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showMaxTabsWarning, setShowMaxTabsWarning] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [profileMenuRect, setProfileMenuRect] = useState(null);
  const profileRef = useRef(null);
  const profileMenuRef = useRef(null);
  const [showGraph, setShowGraph] = useState(() => window.innerWidth >= 1024);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [handleVisible, setHandleVisible] = useState(true);
  const [graphMode, setGraphMode] = useState("2d"); // "2d" | "3d"
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  );
  const [showSettings, setShowSettings] = useState(false);
  const { loadConfig } = useConfigStore();
  const { isMobile, viewportHeight } = useBrowser();

  // ── Folder expand/collapse state (shared with both GraphView 2D and 3D) ──
  const graphView2dRef = useRef(null);
  const graphView3dRef = useRef(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const allFolderIds = useMemo(
    () => new Set(folders.map((f) => f.id)),
    [folders],
  );
  const hasFolders = allFolderIds.size > 0;
  const allExpanded =
    hasFolders && [...allFolderIds].every((id) => expandedFolders.has(id));
  const handleToggleAll = useCallback(() => {
    setExpandedFolders(allExpanded ? new Set() : new Set(allFolderIds));
    if (graphMode === "3d") graphView3dRef.current?.zoomToFit();
    else graphView2dRef.current?.zoomToFit();
  }, [allExpanded, allFolderIds, graphMode]);

  // ── Tab state ────────────────────────────────────────────────────────────
  // Each tab: { id: string, noteId: string | null }
  const [tabs, setTabs] = useState(() => {
    const firstId = nextTabId();
    return [{ id: firstId, noteId: null }];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id);

  // Keep the store's activeNoteId in sync with the current tab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const currentNoteId = activeTab?.noteId ?? null;

  // Reset tabs completely when the authenticated user changes (sign-out / switch).
  // This prevents User A's note IDs from leaking into User B's session.
  const prevUserIdRef = useRef(user?.id ?? null);
  useEffect(() => {
    const prevId = prevUserIdRef.current;
    const nextId = user?.id ?? null;
    if (prevId !== nextId) {
      prevUserIdRef.current = nextId;
      const freshId = nextTabId();
      setTabs([{ id: freshId, noteId: null }]);
      setActiveTabId(freshId);
    }
  }, [user?.id]);

  // On initial notes load: if the active tab has no note yet, seed it with the
  // first note the store loaded. We watch notes.length (0→N) NOT activeNoteId,
  // so switching/closing tabs never accidentally overwrites a tab's note.
  useEffect(() => {
    if (notes.length > 0 && activeNoteId) {
      setTabs((prev) => {
        const firstEmpty = prev.find((t) => !t.noteId);
        if (!firstEmpty) return prev; // all tabs already have notes, leave alone
        return prev.map((t) =>
          t.id === firstEmpty.id ? { ...t, noteId: activeNoteId } : t,
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.length]);

  // When user switches tab, update the store's active note
  useEffect(() => {
    if (currentNoteId && currentNoteId !== activeNoteId) {
      setActiveNote(currentNoteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, currentNoteId]);

  const openNoteInCurrentTab = useCallback(
    (noteId) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, noteId } : t)),
      );
      setActiveNote(noteId);
    },
    [activeTabId, setActiveNote],
  );

  const addNewTab = useCallback(() => {
    // If already on an empty tab, nothing to do
    const curTab = tabs.find((t) => t.id === activeTabId);
    if (curTab && !curTab.noteId) return;

    if (tabs.filter((t) => t.noteId).length >= MAX_TABS) {
      setShowMaxTabsWarning(true);
      return;
    }
    const tabId = nextTabId();
    // Open an empty tab — user can pick a note or create one from EmptyState
    setTabs((prev) => [...prev, { id: tabId, noteId: null }]);
    setActiveTabId(tabId);
  }, [tabs, activeTabId]);

  const closeTab = useCallback(
    (tabId) => {
      setTabs((prev) => {
        if (prev.length <= 1) {
          // Last tab: clear its note instead of removing, showing EmptyState
          return prev.map((t) => (t.id === tabId ? { ...t, noteId: null } : t));
        }
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev; // tab not found, nothing to do
        const next = prev.filter((t) => t.id !== tabId);
        if (tabId === activeTabId) {
          // pick neighbour
          const newIdx = Math.min(Math.max(idx - 1, 0), next.length - 1);
          const newTab = next[newIdx];
          if (newTab) {
            setActiveTabId(newTab.id);
            if (newTab.noteId) setActiveNote(newTab.noteId);
          }
        }
        return next;
      });
    },
    [activeTabId, setActiveNote],
  );

  // ── Existing handlers (updated for tabs) ─────────────────────────────────
  // Close profile menu on outside click
  useEffect(() => {
    if (!showProfileMenu) return;
    const handler = (e) => {
      const inMenu = profileMenuRef.current?.contains(e.target);
      const inTrigger = profileRef.current?.contains(e.target);
      if (!inMenu && !inTrigger) setShowProfileMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfileMenu]);

  useEffect(() => {
    loadNotes();
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNoteSelect = (id, { closeSidebar = false } = {}) => {
    // 1. Already open in a tab → switch to it
    const existingTab = tabs.find((t) => t.noteId === id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setActiveNote(id);
    } else {
      // 2. Current tab is empty → fill it in place
      const curTab = tabs.find((t) => t.id === activeTabId);
      if (curTab && !curTab.noteId) {
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, noteId: id } : t)),
        );
        setActiveNote(id);
      } else {
        // 3. Open in a new tab — respect MAX_TABS
        if (tabs.filter((t) => t.noteId).length >= MAX_TABS) {
          setShowMaxTabsWarning(true);
          return;
        }
        const newTab = { id: nextTabId(), noteId: id };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        setActiveNote(id);
      }
    }
    if (window.innerWidth < 1024) setShowGraph(false);
    if (graphExpanded) setGraphExpanded(false);
    if (closeSidebar) setSidebarOpen(false);
  };

  const handleNewNote = () => {
    const id = createNote();
    if (window.innerWidth < 1024) setShowGraph(false);
    openNoteInCurrentTab(id);
    setSidebarOpen(false);
  };

  // ── Derived helpers ──────────────────────────────────────────────────────
  const isLg = typeof window !== "undefined" && window.innerWidth >= 1024;

  const getTabLabel = (noteId) => {
    if (!noteId) return "New Note";
    const n = notes.find((note) => note.id === noteId);
    return n?.title?.trim() || "Untitled";
  };

  /* ── Profile popover content (shared between top-bar and left-rail) ──── */
  // On the left rail the button is at the BOTTOM of a narrow strip, so we
  // position the popover to the RIGHT of the button, vertically centred on it.
  // On the mobile top bar the button is near the top-right, so we drop below.
  const isRailProfile = profileMenuRect != null && profileMenuRect.left < 80; // rail is ≤52px wide
  const profilePopover =
    user && showProfileMenu && profileMenuRect
      ? ReactDOM.createPortal(
          <div
            ref={profileMenuRef}
            style={{
              position: "fixed",
              top: isRailProfile
                ? Math.min(profileMenuRect.top, window.innerHeight - 250)
                : profileMenuRect.bottom + 8,
              left: isRailProfile ? profileMenuRect.right + 20 : undefined,
              right: isRailProfile
                ? undefined
                : window.innerWidth - profileMenuRect.right,
              zIndex: 9999,
              width: 300,
            }}
            className="bg-(--color-surface) border border-(--color-border) rounded-2xl shadow-xl overflow-hidden"
          >
            {/* User info */}
            <div className="px-3 py-3 border-b border-(--color-border)">
              <p className="text-sm font-semibold text-(--color-text) truncate">
                {user.user_metadata?.full_name || user.email}
              </p>
              {user.user_metadata?.full_name && (
                <p className="text-xs text-(--color-text-muted) truncate mt-0.5">
                  {user.email}
                </p>
              )}
            </div>

            {/* Appearance */}
            <div className="px-4 py-3 border-b border-(--color-border) space-y-3">
              <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider">
                Appearance
              </p>

              {/* Auto toggle */}
              <button
                onClick={() =>
                  setThemeOverride(themeOverride === null ? "day" : null)
                }
                className="w-full flex items-center justify-between"
              >
                <span className="text-xs font-medium text-(--color-text)">
                  Auto{" "}
                  <span className="text-(--color-text-muted) font-normal">
                    (7 pm – 7 am)
                  </span>
                </span>
                {/* Toggle pill */}
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
                    themeOverride === null
                      ? "bg-(--color-primary)"
                      : "bg-(--color-input)"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                      themeOverride === null ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>

              {/* Day / Night buttons — disabled when Auto is on */}
              <div className="flex gap-1.5">
                <button
                  disabled={themeOverride === null}
                  onClick={() =>
                    setThemeOverride(themeOverride === "day" ? null : "day")
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                    themeOverride === null
                      ? "opacity-40 cursor-not-allowed bg-(--color-input) border-(--color-border) text-(--color-text-sec)"
                      : themeOverride === "day"
                        ? "bg-(--color-primary) border-(--color-primary-dk) text-(--color-primary-dk)"
                        : "bg-(--color-input) border-(--color-border) text-(--color-text-sec) hover:bg-(--color-hover)"
                  }`}
                >
                  <SunIcon
                    size={14}
                    weight={themeOverride === "day" ? "fill" : "regular"}
                  />
                  Day
                </button>
                <button
                  disabled={themeOverride === null}
                  onClick={() =>
                    setThemeOverride(themeOverride === "night" ? null : "night")
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                    themeOverride === null
                      ? "opacity-40 cursor-not-allowed bg-(--color-input) border-(--color-border) text-(--color-text-sec)"
                      : themeOverride === "night"
                        ? "bg-(--color-primary) border-(--color-primary-dk) text-(--color-on-primary)"
                        : "bg-(--color-input) border-(--color-border) text-(--color-text-sec) hover:bg-(--color-hover)"
                  }`}
                >
                  <MoonIcon
                    size={14}
                    weight={themeOverride === "night" ? "fill" : "regular"}
                  />
                  Night
                </button>
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={() => {
                setShowProfileMenu(false);
                setShowSignOutConfirm(true);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-(--color-hover) text-red-500 transition-colors text-left"
            >
              <LogOutIcon size={16} />
              Sign out
            </button>
          </div>,
          document.body,
        )
      : null;

  /* ── graph hide helper (shared between editor tab and graphview) ─────── */
  const editorHidden = (showGraph && graphExpanded) || (isMobile && showGraph);

  return (
    <div
      className="flex bg-(--color-background) text-(--color-text) overflow-hidden"
      style={{ height: viewportHeight > 0 ? viewportHeight : "100dvh" }}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          LEFT RAIL — lg+ only (icon-only, ~52px)
          ═══════════════════════════════════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col items-center w-[52px] shrink-0 border-r border-(--color-border) bg-(--color-background) py-3 gap-4">
        {/* Logo */}
        <LightbulbIcon
          size={24}
          className="text-(--color-primary-dk) mb-1"
          weight="fill"
        />

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle sidebar"
          className="p-2 rounded-xl text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
        >
          <MenuIcon size={20} />
        </button>

        {/* Graph View */}
        <button
          onClick={() => {
            setShowGraph((v) => !v);
            setGraphExpanded(false);
          }}
          title="Graph View"
          className={`p-2 rounded-xl transition-colors ${
            showGraph
              ? "bg-(--color-primary) text-(--color-on-primary)"
              : "text-(--color-text-sec) hover:bg-(--color-hover)"
          }`}
        >
          <NetworkIcon size={20} />
        </button>

        {/* spacer */}
        <div className="flex-1" />

        {/* profile / sign-in */}
        {user ? (
          <button
            ref={profileRef}
            onClick={() => {
              const rect = profileRef.current?.getBoundingClientRect();
              setProfileMenuRect(rect ?? null);
              setShowProfileMenu((v) => !v);
            }}
            className="focus:outline-none"
          >
            {user.user_metadata?.avatar_url ? (
              <img
                src={
                  user.user_metadata.avatar_url ?? user.user_metadata?.picture
                }
                alt={user.user_metadata?.full_name ?? "User"}
                className="w-8 h-8 rounded-full object-cover border-2 border-(--color-border) hover:border-(--color-primary-dk) transition-colors"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-(--color-border) hover:border-(--color-primary-dk) transition-colors"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                }}
              >
                {(user.email ?? "U")[0].toUpperCase()}
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => setShowSignIn(true)}
            title="Sign in"
            className="p-2 rounded-xl text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
          >
            <LogOutIcon size={20} className="rotate-180" />
          </button>
        )}
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN COLUMN (top bar on small screens + body)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Navbar — visible only below lg */}
        <header className="lg:hidden flex items-center gap-2 px-3 py-3 bg-(--color-background) border-b border-(--color-border) shrink-0 shadow-sm">
          <button
            className="md:hidden p-1.5 rounded text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <MenuIcon size={22} />
          </button>

          <div className="flex items-center gap-2 mr-auto">
            <LightbulbIcon size={20} className="text-(--color-primary-dk)" />
            <span className="font-bold text-2xl text-(--color-text) tracking-tight">
              idearium
            </span>
          </div>

          <button
            onClick={() => {
              setShowGraph((v) => !v);
              setGraphExpanded(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-2.5 rounded-full text-sm font-bold transition-colors ${
              showGraph
                ? "bg-(--color-primary) text-(--color-on-primary)"
                : "bg-(--color-input) text-(--color-text-sec) hover:bg-(--color-hover)"
            }`}
          >
            <NetworkIcon size={20} />
            <span className="hidden sm:inline">Graph View</span>
          </button>

          {user ? (
            <div className="relative flex items-center ml-1">
              <button
                ref={!isLg ? profileRef : undefined}
                onClick={() => {
                  const rect = (
                    isLg ? profileRef : profileRef
                  ).current?.getBoundingClientRect();
                  setProfileMenuRect(rect ?? null);
                  setShowProfileMenu((v) => !v);
                }}
                className="focus:outline-none"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={
                      user.user_metadata.avatar_url ??
                      user.user_metadata?.picture
                    }
                    alt={user.user_metadata?.full_name ?? "User"}
                    className="w-10 h-10 rounded-full object-cover border-2 border-(--color-border) hover:border-(--color-primary-dk) transition-colors"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2 border-(--color-border) hover:border-(--color-primary-dk) transition-colors"
                    style={{
                      backgroundColor: "var(--color-primary)",
                      color: "var(--color-on-primary)",
                    }}
                  >
                    {(user.email ?? "U")[0].toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignIn(true)}
              title="Sign in to sync notes across devices"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-(--color-input) text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
            >
              <LogOutIcon size={16} className="rotate-180" />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden relative">
          {sidebarOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/20 z-20"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <div
            className={[
              "transition-all duration-200 overflow-hidden",
              "fixed inset-y-0 left-0 z-30",
              "md:relative md:flex md:z-auto",
              sidebarOpen
                ? "translate-x-0 w-full md:w-80 md:min-w-80"
                : "-translate-x-full w-full md:translate-x-0 md:w-80 md:min-w-80 lg:w-0 lg:min-w-0",
            ].join(" ")}
          >
            <Sidebar
              onNoteSelect={(id) =>
                handleNoteSelect(id, { closeSidebar: window.innerWidth < 1024 })
              }
              onClose={() => setSidebarOpen(false)}
            />
          </div>

          <main className="flex-1 flex flex-col min-w-0">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-(--color-text-muted)">
                <Loader2Icon size={20} className="animate-spin" />
                <span className="text-sm">Loading notes…</span>
              </div>
            ) : (
              <div className="flex-1 flex min-w-0 overflow-hidden">
                {/* ── Editor column (tabs + editor) ─────────────────────── */}
                <div
                  className="flex flex-col overflow-hidden min-w-0"
                  style={{
                    flex: editorHidden ? "0 0 0px" : "1 1 0%",
                    width: editorHidden ? 0 : undefined,
                    transition:
                      "flex 480ms cubic-bezier(0.4,0,0.2,1), width 480ms cubic-bezier(0.4,0,0.2,1)",
                  }}
                >
                  <div
                    className="flex-1 flex flex-col min-w-0 overflow-hidden"
                    style={{
                      opacity: editorHidden ? 0 : 1,
                      pointerEvents: editorHidden ? "none" : "auto",
                      transition: editorHidden
                        ? "opacity 180ms ease"
                        : "opacity 280ms ease 220ms",
                    }}
                  >
                    {/* Tab bar — only render tabs that have a note */}
                    <div className="flex items-center border-b border-(--color-border) bg-(--color-background) shrink-0 overflow-hidden">
                      {/* Tab list — fills remaining width, tabs share space equally like Chrome */}
                      <div className="flex flex-1 min-w-0 overflow-hidden">
                        {tabs
                          .filter((tab) => tab.noteId || tab.id === activeTabId)
                          .map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => {
                                setActiveTabId(tab.id);
                                if (tab.noteId) setActiveNote(tab.noteId);
                              }}
                              className={`group relative flex items-center gap-1.5 px-3 py-4 text-xs font-medium border-r border-(--color-border) transition-colors flex-1 min-w-[72px] max-w-[240px] overflow-hidden ${
                                tab.id === activeTabId
                                  ? "bg-(--color-surface) text-(--color-text) border-b-2 border-b-(--color-primary)"
                                  : "text-(--color-text-sec) hover:bg-(--color-hover)"
                              }`}
                            >
                              <span className="truncate flex-1 min-w-0">
                                {getTabLabel(tab.noteId)}
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeTab(tab.id);
                                }}
                                className="shrink-0 ml-1 p-0.5 rounded hover:bg-(--color-hover) text-(--color-text-muted) hover:text-(--color-text) opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <XIcon size={12} />
                              </span>
                            </button>
                          ))}
                      </div>
                      {/* + new tab — hidden once limit is reached or already on empty tab */}
                      {tabs.filter((t) => t.noteId).length < MAX_TABS &&
                        tabs.find((t) => t.id === activeTabId)?.noteId && (
                          <button
                            onClick={addNewTab}
                            title="New tab"
                            className="p-4 text-(--color-text-sec) hover:bg-(--color-hover) hover:text-(--color-text) transition-colors shrink-0"
                          >
                            <PlusIcon size={14} />
                          </button>
                        )}
                    </div>

                    {/* Editor area */}
                    <div className="flex-1 flex min-w-0 overflow-hidden">
                      {currentNoteId ? (
                        <NoteEditor
                          noteId={currentNoteId}
                          onNavigate={handleNoteSelect}
                        />
                      ) : (
                        <EmptyState onCreate={handleNewNote} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Graph panel ────────────────────────────────────────── */}
                {showGraph && (
                  <div
                    className="flex flex-1 lg:flex-none h-full border-l border-(--color-border) relative"
                    style={{
                      width: graphExpanded || isMobile ? "100%" : "50vw",
                      transition: "width 480ms cubic-bezier(0.4,0,0.2,1)",
                    }}
                    onTransitionEnd={(e) => {
                      if (e.propertyName === "width") setHandleVisible(true);
                    }}
                  >
                    <div className="flex-1 overflow-hidden h-full">
                      {/* ── Bottom-right button island: expand/collapse + 2D/3D ── */}
                      <div className="absolute bottom-6 right-6 z-10 flex items-center rounded-full border border-(--color-border) bg-(--color-surface) shadow-sm overflow-hidden">
                        {/* Expand / collapse graph panel */}
                        {!isMobile && (
                          <button
                            onClick={() => {
                              setHandleVisible(false);
                              setTimeout(() => {
                                setGraphExpanded((v) => !v);
                                setTimeout(() => {
                                  if (graphMode === "3d")
                                    graphView3dRef.current?.zoomToFit();
                                  else graphView2dRef.current?.zoomToFit();
                                }, 500);
                              }, 200);
                            }}
                            title={
                              graphExpanded ? "Collapse graph" : "Expand graph"
                            }
                            style={{
                              opacity: handleVisible ? 1 : 0,
                              transition: "opacity 200ms ease",
                              pointerEvents: handleVisible ? "auto" : "none",
                            }}
                            className="flex items-center gap-1 p-4 text-xs font-semibold text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) border-r border-(--color-border) transition-colors"
                          >
                            {graphExpanded ? (
                              <CaretRightIcon size={14} weight="bold" />
                            ) : (
                              <CaretLeftIcon size={14} weight="bold" />
                            )}
                            <span>{graphExpanded ? "Collapse" : "Expand"}</span>
                          </button>
                        )}
                        {/* Expand / collapse all folders (both 2D and 3D) */}
                        {hasFolders && (
                          <button
                            onClick={handleToggleAll}
                            title={
                              allExpanded
                                ? "Collapse all folders"
                                : "Expand all folders"
                            }
                            className="flex items-center gap-1 p-4 text-xs font-semibold text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) border-r border-(--color-border) transition-colors"
                          >
                            {allExpanded ? (
                              <ArrowsInIcon size={14} />
                            ) : (
                              <DotsNineIcon size={14} />
                            )}
                            <span>{allExpanded ? "Folders" : "All Notes"}</span>
                          </button>
                        )}
                        {/* 2D / 3D toggle */}
                        <button
                          onClick={() =>
                            setGraphMode((m) => (m === "2d" ? "3d" : "2d"))
                          }
                          title={
                            graphMode === "2d"
                              ? "Switch to 3D view"
                              : "Switch to 2D view"
                          }
                          className="flex items-center gap-1 p-4 text-xs font-semibold text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) transition-colors"
                        >
                          <CubeIcon
                            size={14}
                            weight={graphMode === "3d" ? "fill" : "regular"}
                          />
                          <span>{graphMode === "2d" ? "3D" : "2D"}</span>
                        </button>
                      </div>
                      {graphMode === "3d" ? (
                        <GraphView3D
                          ref={graphView3dRef}
                          expandedFolders={expandedFolders}
                          onExpandedFoldersChange={setExpandedFolders}
                          onClose={() => {
                            setShowGraph(false);
                            setGraphExpanded(false);
                          }}
                          onNodeClick={(id) => {
                            handleNoteSelect(id);
                          }}
                        />
                      ) : (
                        <GraphView
                          ref={graphView2dRef}
                          expandedFolders={expandedFolders}
                          onExpandedFoldersChange={setExpandedFolders}
                          onClose={() => {
                            setShowGraph(false);
                            setGraphExpanded(false);
                          }}
                          onNodeClick={(id) => {
                            handleNoteSelect(id);
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Settings — fixed slide-in from right, no layout shift */}
          <div
            className={`fixed inset-y-0 right-0 z-40 w-80 shadow-2xl transition-transform duration-200 ${
              showSettings ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <Settings onClose={() => setShowSettings(false)} />
          </div>
          {showSettings && (
            <div
              className="fixed inset-0 z-30 bg-black/10"
              onClick={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PORTALS & MODALS (shared)
          ═══════════════════════════════════════════════════════════════════ */}
      {profilePopover}

      {showSignIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onClick={() => setShowSignIn(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <SignIn onClose={() => setShowSignIn(false)} />
          </div>
        </div>
      )}

      {showMaxTabsWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onClick={() => setShowMaxTabsWarning(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-(--color-background) rounded-xl shadow-xl border border-(--color-border) p-6 w-full max-w-xs text-center space-y-4"
          >
            <p className="text-sm font-semibold text-(--color-text)">
              Tab limit reached
            </p>
            <p className="text-xs text-(--color-text-muted)">
              Max allowed tab number is {MAX_TABS}. Please close one of the note
              tabs in order to open a new one.
            </p>
            <button
              onClick={() => setShowMaxTabsWarning(false)}
              className="w-full py-3 rounded-full text-xs font-medium bg-(--color-input) text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-(--color-background) rounded-xl shadow-xl border border-(--color-border) p-6 w-full max-w-xs text-center space-y-4"
          >
            <p className="text-sm font-semibold text-(--color-text)">
              Sign out?
            </p>
            <p className="text-xs text-(--color-text-muted)">
              Are you sure you want to sign out?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 py-3 rounded-full text-xs font-medium bg-(--color-input) text-(--color-text-sec) hover:bg-(--color-hover) transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSignOutConfirm(false);
                  signOut();
                }}
                className="flex-1 py-3 rounded-full text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ onCreate }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-(--color-text-sec) gap-4 px-6">
    <LightbulbIcon size={52} className="text-(--color-primary)" />
    <div className="text-center">
      <p className="text-xl font-semibold text-(--color-text)">
        Welcome to{" "}
        <span style={{ color: "var(--color-primary)", fontWeight: "bold" }}>
          Idearium
        </span>
      </p>
      <p className="text-sm mt-1 text-(--color-text-sec)">
        Your personal knowledge base. Create a note to get started.
      </p>
    </div>
    <button
      onClick={onCreate}
      className="flex items-center gap-2 px-5 py-2.5 bg-(--color-primary) hover:bg-(--color-primary-hv) text-(--color-on-primary) rounded-full font-bold transition-colors shadow-sm"
    >
      <PlusIcon size={16} /> Create First Note
    </button>
    <div className="mt-2 text-xs text-(--color-text-muted) text-center space-y-1">
      <p>🏷️ Add tags with the tag input below the note title</p>
      <p>🕸️ Open Graph View to visualize connections</p>
    </div>
  </div>
);

export default Layout;
