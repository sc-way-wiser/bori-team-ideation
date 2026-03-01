import { useState, useEffect } from "react";
import { useBrowser } from "../../hooks/useBrowserDetect.jsx";
import {
  ShareNetworkIcon as NetworkIcon,
  PlusIcon,
  LightbulbIcon,
  ListIcon as MenuIcon,
  CircleNotchIcon as Loader2Icon,
  SignOutIcon as LogOutIcon,
  GearIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { useNoteStore } from "../../store/useNoteStore.js";
import { useConfigStore } from "../../store/useConfigStore.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import SignIn from "../Auth/SignIn.jsx";
import Sidebar from "../Sidebar/Sidebar.jsx";
import NoteEditor from "../Editor/Editor.jsx";
import GraphView from "../GraphView/GraphView.jsx";
import Settings from "../Settings/Settings.jsx";

const Layout = () => {
  const { activeNoteId, createNote, setActiveNote, loadNotes, isLoading } =
    useNoteStore();
  const { user, signOut } = useAuth();
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showGraph, setShowGraph] = useState(() => window.innerWidth >= 1024);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [graphFitTrigger, setGraphFitTrigger] = useState(0);
  const [handleVisible, setHandleVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { loadConfig } = useConfigStore();
  const { isMobile } = useBrowser();

  useEffect(() => {
    loadNotes();
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNoteSelect = (id) => {
    setActiveNote(id);
    if (window.innerWidth < 1024) setShowGraph(false);
    if (graphExpanded) {
      setGraphExpanded(false);
      setGraphFitTrigger((n) => n + 1);
    }
    setSidebarOpen(false);
  };

  const handleNewNote = () => {
    const id = createNote();
    if (window.innerWidth < 1024) setShowGraph(false);
    setActiveNote(id);
    setSidebarOpen(false);
  };

  console.log("user", user);

  return (
    <div className="h-screen flex flex-col bg-(--color-background) text-(--color-text) overflow-hidden max-w-720 mx-auto">
      {/* Top Navbar */}
      <header className="flex items-center gap-2 px-3 py-2 bg-(--color-background) border-b border-(--color-border) shrink-0 shadow-sm">
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
            setSidebarOpen(false);
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            showGraph
              ? "bg-(--color-primary) text-(--color-on-primary)"
              : "bg-(--color-input) text-(--color-text-sec) hover:bg-(--color-hover)"
          }`}
        >
          <NetworkIcon size={18} />
          <span className="hidden sm:inline">Graph View</span>
        </button>

        {/* <button
          onClick={() => setShowSettings((v) => !v)}
          title="Settings"
          className={`p-1.5 rounded-md transition-colors ${
            showSettings
              ? "bg-(--color-primary) text-(--color-primary-dk)"
              : "text-(--color-text-sec) hover:bg-(--color-hover) hover:text-(--color-text)"
          }`}
        >
          <GearIcon size={18} />
        </button> */}

        {/* <button
          onClick={handleNewNote}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-(--color-primary) hover:bg-(--color-primary-hv) text-(--color-text) transition-colors shadow-sm"
        >
          <PlusIcon size={16} />
          <span className="hidden sm:inline">New Note</span>
        </button> */}

        {user ? (
          <div className="flex items-center gap-1.5 ml-1">
            {user.user_metadata?.avatar_url ? (
              <img
                src={
                  user.user_metadata.avatar_url ?? user.user_metadata?.picture
                }
                alt={user.user_metadata?.full_name ?? "User"}
                className="w-7 h-7 rounded-full object-cover border border-(--color-border)"
                title={user.email ?? ""}
                onError={() => (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      backgroundColor: "var(--color-primary)",
                      color: "var(--color-primary-dk)",
                    }}
                    title={user.email ?? ""}
                  >
                    {(user.email ?? "U")[0].toUpperCase()}
                  </div>
                )}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                }}
                title={user.email ?? ""}
              >
                {(user.email ?? "U")[0].toUpperCase()}
              </div>
            )}
            <button
              onClick={() => setShowSignOutConfirm(true)}
              title="Sign out"
              className="p-1.5 rounded text-(--color-text-muted) hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOutIcon size={16} />
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
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`
            fixed inset-y-0 left-0 z-30 w-full transition-transform duration-200
            md:relative md:flex md:w-75 md:min-w-75 md:translate-x-0 md:z-auto
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          <Sidebar
            onNoteSelect={handleNoteSelect}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        <main className="flex-1 flex min-w-0">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-(--color-text-muted)">
              <Loader2Icon size={20} className="animate-spin" />
              <span className="text-sm">Loading notes…</span>
            </div>
          ) : (
            <>
              <div
                className="flex overflow-hidden min-w-0"
                style={{
                  flex:
                    (showGraph && graphExpanded) || (isMobile && showGraph)
                      ? "0 0 0px"
                      : "1 1 0%",
                  width:
                    (showGraph && graphExpanded) || (isMobile && showGraph)
                      ? 0
                      : undefined,
                  transition:
                    "flex 480ms cubic-bezier(0.4,0,0.2,1), width 480ms cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                <div
                  className="flex-1 flex min-w-0 overflow-hidden"
                  style={{
                    opacity:
                      (showGraph && graphExpanded) || (isMobile && showGraph)
                        ? 0
                        : 1,
                    pointerEvents:
                      (showGraph && graphExpanded) || (isMobile && showGraph)
                        ? "none"
                        : "auto",
                    transition:
                      (showGraph && graphExpanded) || (isMobile && showGraph)
                        ? "opacity 180ms ease" // collapse: fade out quickly
                        : "opacity 280ms ease 220ms", // expand: delayed so frame grows first
                  }}
                >
                  {activeNoteId ? (
                    <NoteEditor
                      noteId={activeNoteId}
                      onNavigate={handleNoteSelect}
                    />
                  ) : (
                    <EmptyState onCreate={handleNewNote} />
                  )}
                </div>
              </div>

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
                  {/* Expand / collapse toggle on left border */}
                  {!isMobile && (
                    <button
                      onClick={() => {
                        setHandleVisible(false);
                        // Defer expand/collapse until the handle has faded out
                        setTimeout(() => {
                          setGraphExpanded((v) => !v);
                          setGraphFitTrigger((n) => n + 1);
                        }, 200);
                      }}
                      title={graphExpanded ? "Collapse graph" : "Expand graph"}
                      style={{
                        opacity: handleVisible ? 1 : 0,
                        transition: "opacity 200ms ease",
                        pointerEvents: handleVisible ? "auto" : "none",
                      }}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 px-1.5 h-14 flex items-center justify-center  bg-black/20 backdrop-blur-sm  text-(--color-text) hover:text-stone-950 hover:bg-white hover:border hover:border-stone-300 shadow-sm transition-colors ${graphExpanded ? "rounded-r-full left-3 hover:border-l-0" : "rounded-l-full -left-3 border-r-0 hover:border-r-0"}`}
                    >
                      {graphExpanded ? (
                        <CaretRightIcon size={12} weight="bold" />
                      ) : (
                        <CaretLeftIcon size={12} weight="bold" />
                      )}
                    </button>
                  )}
                  <div className="flex-1 overflow-hidden h-full">
                    <GraphView
                      fitTrigger={graphFitTrigger}
                      onClose={() => {
                        setShowGraph(false);
                        setGraphExpanded(false);
                      }}
                      onNodeClick={(id) => {
                        setActiveNote(id);
                        if (window.innerWidth < 1024) setShowGraph(false);
                      }}
                    />
                  </div>
                </div>
              )}
            </>
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
      className="flex items-center gap-2 px-5 py-2.5 bg-(--color-primary) hover:bg-(--color-primary-hv) text-(--color-text) rounded-lg font-semibold transition-colors shadow-sm"
    >
      <PlusIcon size={16} /> Create First Note
    </button>
    <div className="mt-2 text-xs text-(--color-text-muted) text-center space-y-1">
      <p>
        💡 Type{" "}
        <code className="bg-(--color-input) px-1 rounded">{`[[ ]]`}</code> in
        the editor to link notes
      </p>
      <p>🏷️ Add tags with the tag input below the note title</p>
      <p>🕸️ Open Graph View to visualize connections</p>
    </div>
  </div>
);

export default Layout;
