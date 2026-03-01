import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import ReactDOM from "react-dom";
import { useNoteStore } from "../../store/useNoteStore.js";
import { fetchAdminUsers } from "../../services/noteService.js";
import { format } from "date-fns";
import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  ReactRenderer,
  NodeViewWrapper,
  NodeViewContent,
} from "@tiptap/react";
import { Node, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import tippy from "tippy.js";
import {
  TextBIcon as BoldIcon,
  TextItalicIcon as ItalicIcon,
  TextHTwoIcon as Heading2Icon,
  ListBulletsIcon as ListIcon,
  ListNumbersIcon as ListOrderedIcon,
  CodeSimpleIcon as CodeIcon,
  CodeBlockIcon as FileCode2Icon,
  LinkSimpleIcon as Link2Icon,
  TextAlignLeftIcon as AlignLeftIcon,
  TextAlignCenterIcon as AlignCenterIcon,
  TextAlignRightIcon as AlignRightIcon,
  TextAlignJustifyIcon as AlignJustifyIcon,
  TableIcon as TableIconPH,
  ColumnsIcon as Columns2Icon,
  RowsIcon as Rows2Icon,
  MinusIcon,
  PaintBucketIcon,
  TrashIcon as Trash2Icon,
  UserPlusIcon,
  TagIcon,
  ArrowRightIcon,
  PlusIcon,
  XIcon,
  CheckIcon,
  LightbulbIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import { useBrowser } from "../../hooks/useBrowserDetect.jsx";
import Select from "../ui/Select.jsx";

/* ─── Fetch link metadata via CORS proxy ─────────────────────────────────── */
async function fetchLinkMeta(href) {
  try {
    const hostname = new URL(href).hostname;
    const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(href)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const data = await res.json();
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, "text/html");
    const title =
      doc.querySelector('meta[property="og:title"]')?.content ||
      doc.querySelector('meta[name="twitter:title"]')?.content ||
      doc.querySelector("title")?.textContent?.trim() ||
      hostname;
    return { title, favicon, hostname };
  } catch {
    const hostname = (() => {
      try {
        return new URL(href).hostname;
      } catch {
        return href;
      }
    })();
    return {
      title: hostname,
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
      hostname,
    };
  }
}

/* ─── LinkCard node view ─────────────────────────────────────────────────── */
const LinkCardView = ({ node, updateAttributes, deleteNode }) => {
  const { href, title, favicon } = node.attrs;
  const [loading, setLoading] = useState(!title);

  useEffect(() => {
    if (title || !href) return;
    fetchLinkMeta(href).then(({ title: t, favicon: f }) => {
      updateAttributes({ title: t, favicon: f });
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  const hostname = (() => {
    try {
      return new URL(href).hostname;
    } catch {
      return href;
    }
  })();
  const displayTitle = title || hostname;

  return (
    <NodeViewWrapper>
      <div
        contentEditable={false}
        className="group/lc my-4 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-(--color-border) bg-(--color-background) hover:bg-white transition-colors w-fit max-w-full cursor-pointer select-none"
        style={{ userSelect: "none" }}
        onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
      >
        {favicon && (
          <img
            src={favicon}
            alt=""
            className="w-4 h-4 rounded-sm shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="flex flex-col min-w-0">
          {loading ? (
            <span className="text-xs text-(--color-text-muted) italic">
              Loading…
            </span>
          ) : (
            <span className="text-sm font-medium text-(--color-primary-dk) truncate max-w-xs">
              {displayTitle}
            </span>
          )}
          <span className="text-xs text-(--color-text-muted) truncate max-w-xs">
            {hostname}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 256 256"
          className="shrink-0 opacity-40 group-hover/lc:opacity-70 transition-opacity"
          fill="currentColor"
        >
          <path d="M224,104a8,8,0,0,1-16,0V59.32l-82.34,82.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z" />
        </svg>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteNode();
          }}
          className="ml-1 opacity-0 group-hover/lc:opacity-60 hover:opacity-100! text-(--color-text-muted) hover:text-stone-950 transition-opacity cursor-pointer"
          title="Remove"
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>
    </NodeViewWrapper>
  );
};

/* ─── LinkCard TipTap extension ──────────────────────────────────────────── */
const LinkCardExtension = Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      href: { default: "" },
      title: { default: "" },
      favicon: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="link-card"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "link-card" }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LinkCardView);
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const text = (
              event.clipboardData?.getData("text/plain") ?? ""
            ).trim();
            if (!/^https?:\/\/\S+$/.test(text)) return false;
            event.preventDefault();
            const nodeType = view.state.schema.nodes.linkCard;
            if (!nodeType) return false;
            const node = nodeType.create({ href: text });
            const tr = view.state.tr.replaceSelectionWith(node);
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

/* ─── Lowlight instance ──────────────────────────────────────────────────── */
const lowlight = createLowlight(common);

/* ─── Tab / Shift-Tab indentation ───────────────────────────────────────── */
const IndentExtension = Extension.create({
  name: "indent",
  addKeyboardShortcuts() {
    return {
      // Tab: indent list items or insert 4 spaces in regular paragraphs
      Tab: ({ editor }) => {
        if (editor.isActive("listItem")) {
          return editor.commands.sinkListItem("listItem");
        }
        return editor.commands.insertContent("    ");
      },
      // Shift-Tab: lift list items; no-op elsewhere (let browser handle focus)
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("listItem")) {
          return editor.commands.liftListItem("listItem");
        }
        return false;
      },
    };
  },
});

/* ─── CommentedLine node ─────────────────────────────────────────────────── */
// A block node identical to paragraph but rendered with data-commented="true".
// CSS adds the visual "// " prefix and grays the text — the actual content
// stays clean. Mention/link suggestions are suppressed when the cursor is here.
const CommentedLine = Node.create({
  name: "commentedLine",
  group: "block",
  content: "inline*",
  parseHTML() {
    // priority > default (50) so this rule wins over StarterKit's Paragraph
    // which also matches <p> tags — without this the style is lost on reload.
    return [{ tag: 'p[data-commented="true"]', priority: 1000 }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, { "data-commented": "true" }),
      0,
    ];
  },
});

/* ─── Cmd+/ / Ctrl+/ comment toggle (VS Code style) ─────────────────────── */
const CommentToggleExtension = Extension.create({
  name: "commentToggle",
  addKeyboardShortcuts() {
    return {
      "Mod-/": ({ editor }) => {
        const { state } = editor.view;
        const { from, to } = state.selection;

        // VS Code rule: if ANY block in selection is a plain paragraph/heading,
        // comment all; if ALL are already commentedLine, uncomment all.
        let hasUncommented = false;
        state.doc.nodesBetween(from, to, (node) => {
          if (["paragraph", "heading"].includes(node.type.name))
            hasUncommented = true;
        });

        return editor
          .chain()
          .focus()
          .setNode(hasUncommented ? "commentedLine" : "paragraph")
          .run();
      },
    };
  },
});

/* ─── Inline SuggestionList (mention autocomplete dropdown) ──────────────── */
const SuggestionList = forwardRef((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevItems, setPrevItems] = useState(props.items);
  if (prevItems !== props.items) {
    setPrevItems(props.items);
    setSelectedIndex(0);
  }

  const selectItem = (index) => {
    const item = props.items[index];
    if (item) props.command({ id: item.id, label: item.title });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex(
          (i) => (i + props.items.length - 1) % props.items.length,
        );
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="bg-(--color-surface) border border-(--color-border) rounded-lg shadow-lg p-2 text-xs text-(--color-text-muted)">
        No results
      </div>
    );
  }

  return (
    <div className="bg-(--color-surface) border border-(--color-border) rounded-lg shadow-lg py-1 min-w-45">
      {props.items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => selectItem(index)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
            index === selectedIndex
              ? "bg-(--color-primary-bg) text-(--color-primary-dk)"
              : "text-(--color-text) hover:bg-(--color-hover)"
          }`}
        >
          {item.title || "Untitled"}
        </button>
      ))}
    </div>
  );
});
SuggestionList.displayName = "SuggestionList";

/* ─── Inline CodeBlockView (syntax-highlighted code block) ───────────────── */
const CodeBlockView = ({ node, updateAttributes, extension }) => (
  <NodeViewWrapper className="relative">
    <select
      contentEditable={false}
      className="absolute right-2 top-2 text-xs bg-(--color-input) border border-(--color-border) rounded px-1 py-0.5 text-(--color-text) outline-none"
      value={node.attrs.language ?? ""}
      onChange={(e) => updateAttributes({ language: e.target.value })}
    >
      <option value="">auto</option>
      {extension.options.lowlight.listLanguages().map((lang) => (
        <option key={lang} value={lang}>
          {lang}
        </option>
      ))}
    </select>
    <pre>
      <NodeViewContent as="code" />
    </pre>
  </NodeViewWrapper>
);

/* ─── CustomTextStyle extension (fontSize + color on TextStyle spans) ────── */
const CustomTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) => {
          const parts = [
            attrs.fontSize ? `font-size: ${attrs.fontSize}` : "",
            attrs.color ? `color: ${attrs.color}` : "",
          ]
            .filter(Boolean)
            .join("; ");
          return parts ? { style: parts } : {};
        },
      },
      color: {
        default: null,
        parseHTML: (el) => el.style.color || null,
        renderHTML: () => ({}),
      },
    };
  },
});

/* ─── Extended TableCell / TableHeader with backgroundColor attribute ─────── */
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.style.backgroundColor || null,
        renderHTML: (attrs) => {
          if (!attrs.backgroundColor) return {};
          return { style: `background-color: ${attrs.backgroundColor}` };
        },
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.style.backgroundColor || null,
        renderHTML: (attrs) => {
          if (!attrs.backgroundColor) return {};
          return { style: `background-color: ${attrs.backgroundColor}` };
        },
      },
    };
  },
});

/* ─── Colour palettes ────────────────────────────────────────────────────── */
const CELL_COLORS = [
  { label: "White", hex: "#ffffff" },
  { label: "Light grey", hex: "#f3f4f6" },
  { label: "Grey", hex: "#e5e7eb" },
  { label: "Mid grey", hex: "#d1d5db" },
  { label: "Dark grey", hex: "#6b7280" },
  { label: "Charcoal", hex: "#374151" },
  { label: "Lemon", hex: "#fef9c3" },
  { label: "Yellow", hex: "#fef08a" },
  { label: "Amber", hex: "#fde68a" },
  { label: "Peach", hex: "#fed7aa" },
  { label: "Orange", hex: "#fdba74" },
  { label: "Coral", hex: "#fca5a5" },
  { label: "Mint", hex: "#dcfce7" },
  { label: "Light green", hex: "#bbf7d0" },
  { label: "Green", hex: "#86efac" },
  { label: "Teal", hex: "#6ee7b7" },
  { label: "Sea foam", hex: "#a7f3d0" },
  { label: "Sage", hex: "#d1fae5" },
];

/* ─── Table border colour options ─────────────────────────────────────────── */
const BORDER_OPTIONS = [
  { value: "none", label: "None", hex: "transparent" },
  { value: "stone-100", label: "Light", hex: "#f5f5f4" },
  { value: "stone-300", label: "Mid", hex: "#d6d3d1" },
];
const BORDER_ACTIVE_HEX = "#78716c"; // stone-500 — shown while cursor is in table

const TEXT_COLORS = [
  { label: "Default", hex: "" },
  { label: "Black", hex: "#111827" },
  { label: "Dark grey", hex: "#374151" },
  { label: "Grey", hex: "#6b7280" },
  { label: "Red", hex: "#dc2626" },
  { label: "Orange", hex: "#ea580c" },
  { label: "Amber", hex: "#d97706" },
  { label: "Gold", hex: "#a16207" },
  { label: "Green", hex: "#16a34a" },
  { label: "Teal", hex: "#0d9488" },
  { label: "Blue", hex: "#2563eb" },
  { label: "Indigo", hex: "#4f46e5" },
  { label: "Violet", hex: "#7c3aed" },
  { label: "Pink", hex: "#db2777" },
  { label: "Rose", hex: "#e11d48" },
];

/* ─── Portal-based colour palette popover ─────────────────────────────────── */
const ColorPalettePopover = ({
  label,
  icon,
  colors,
  onSelect,
  onClear,
  clearLabel = "Clear",
  activeColor,
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openPalette = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + window.scrollY + 4,
        left: r.left + window.scrollX,
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const colCount = colors.length <= 15 ? 5 : 6;

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else openPalette();
        }}
        className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-(--color-text-sec) hover:text-(--color-text) hover:bg-(--color-hover) transition-colors"
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open &&
        ReactDOM.createPortal(
          <div
            ref={popRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
            className="bg-(--color-surface) border border-(--color-border) rounded-xl shadow-xl p-3"
          >
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
            >
              {colors.map((c) => (
                <button
                  key={c.hex || "default"}
                  onClick={() => {
                    onSelect(c.hex);
                    setOpen(false);
                  }}
                  className={`w-6 h-6 rounded border transition-transform hover:scale-110 ${
                    activeColor === c.hex
                      ? "border-indigo-500 ring-2 ring-indigo-400"
                      : "border-(--color-border)"
                  } ${!c.hex ? "flex items-center justify-center" : ""}`}
                  style={c.hex ? { backgroundColor: c.hex } : {}}
                  title={c.label}
                >
                  {!c.hex && (
                    <span className="text-xs font-bold text-(--color-text-muted)">
                      A
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-(--color-border-lt)">
              <label className="flex-1 flex items-center gap-1 cursor-pointer text-xs text-(--color-text-sec) hover:text-(--color-text) transition-colors">
                <span>Custom…</span>
                <input
                  type="color"
                  className="sr-only"
                  defaultValue={activeColor || "#000000"}
                  onChange={(e) => {
                    onSelect(e.target.value);
                    setOpen(false);
                  }}
                />
              </label>
              {onClear && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onClear();
                    setOpen(false);
                  }}
                  className="text-xs text-(--color-text-muted) hover:text-red-500 transition-colors px-1"
                >
                  {clearLabel}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

/* ─── Font size popover ──────────────────────────────────────────────────── */
const FONT_SIZES = [
  { label: "Default", value: "" },
  { label: "11", value: "11px" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" },
];

const FontSizePopover = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openPop = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + window.scrollY + 4,
        left: r.left + window.scrollX,
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const numLabel = value ? parseInt(value) : null;

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else openPop();
        }}
        title="Font size"
        className={`flex items-center gap-0.5 h-7 px-1.5 rounded text-xs transition-colors ${
          value
            ? "bg-(--color-primary-bg) text-(--color-primary-dk) font-semibold"
            : "text-(--color-text-sec) hover:text-(--color-text) hover:bg-(--color-hover)"
        }`}
      >
        <span className="tabular-nums w-6 text-center">{numLabel ?? "—"}</span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 10 10"
          fill="currentColor"
          className="opacity-50 shrink-0"
        >
          <path d="M5 7L1 3h8z" />
        </svg>
      </button>
      {open &&
        ReactDOM.createPortal(
          <div
            ref={popRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
              width: 60,
            }}
            className="bg-(--color-surface) border border-(--color-border) rounded-lg shadow-xl py-0.5 overflow-hidden"
          >
            {FONT_SIZES.map((f) => (
              <button
                key={f.value || "default"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(f.value);
                  setOpen(false);
                }}
                className={`block w-full text-left px-2 py-1 text-xs tabular-nums transition-colors ${
                  value === f.value
                    ? "bg-(--color-primary-bg) text-(--color-primary-dk) font-semibold"
                    : "text-(--color-text) hover:bg-(--color-hover)"
                }`}
              >
                {f.value ? parseInt(f.value) : "—"}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};

/* ─── Share popover ───────────────────────────────────────────────────────── */
const SharePopover = ({ note, onClose, anchorRect }) => {
  const { addCollaborator, removeCollaborator, currentUserId } = useNoteStore();
  const [adminUsers, setAdminUsers] = useState([]);
  const popRef = useRef(null);

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

  const sharedWith = note.sharedWith ?? [];
  const others = adminUsers.filter((u) => u.id !== currentUserId);

  return ReactDOM.createPortal(
    <div
      data-portal
      ref={popRef}
      style={{
        position: "fixed",
        top: anchorRect.bottom + 6,
        right: window.innerWidth - anchorRect.right,
        zIndex: 9999,
        minWidth: 250,
        maxHeight: 320,
      }}
      className="bg-(--color-surface) border border-(--color-border) rounded-xl shadow-xl overflow-y-auto py-1"
    >
      <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider px-3 pt-2 pb-1">
        Share note with
      </p>
      {sharedWith.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {sharedWith.map((uid) => {
            const u = adminUsers.find((a) => a.id === uid);
            return (
              <span
                key={uid}
                className="flex items-center gap-1 text-xs bg-(--color-primary-bg) text-(--color-primary-dk) border border-(--color-primary) px-2 py-0.5 rounded-full"
              >
                {u?.full_name || u?.email || uid}
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    removeCollaborator(note.id, uid);
                  }}
                  className="hover:text-red-500 transition-colors"
                >
                  <XIcon size={9} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="border-t border-(--color-border-lt)" />
      {others.length === 0 ? (
        <p className="text-xs text-(--color-text-muted) px-3 py-3">
          No admin users found
        </p>
      ) : (
        others.map((user) => {
          const added = sharedWith.includes(user.id);
          const initials = (user.full_name ||
            user.email ||
            "U")[0].toUpperCase();
          return (
            <button
              key={user.id}
              onMouseDown={(e) => {
                e.preventDefault();
                added
                  ? removeCollaborator(note.id, user.id)
                  : addCollaborator(note.id, user.id);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-(--color-hover) transition-colors text-left"
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
              {added && (
                <CheckIcon
                  size={12}
                  className="text-(--color-primary-dk) shrink-0"
                />
              )}
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
};

/* ─── Small toolbar button components ─────────────────────────────────────── */
const ToolbarButton = ({ onClick, title, isActive, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-2 rounded transition-colors ${
      isActive
        ? "bg-(--color-primary) text-(--color-primary-dk) font-semibold"
        : "text-(--color-text-sec) hover:text-(--color-text) hover:bg-(--color-hover)"
    }`}
  >
    {children}
  </button>
);

const TableToolbarButton = ({ onClick, title, danger, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`flex items-center px-2.5 py-1 rounded text-xs transition-colors ${
      danger
        ? "text-red-500 hover:text-red-600 hover:bg-red-50"
        : "text-(--color-primary-dk) hover:bg-(--color-primary-bg)"
    }`}
  >
    {children}
  </button>
);

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main Editor component                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */
const NoteEditor = ({ noteId, onNavigate }) => {
  /* ── All hooks at top level (never conditional) ── */
  const {
    getNoteById,
    updateNote,
    deleteNote,
    addTag,
    removeTag,
    notes,
    currentUserId,
    pendingShareNoteId,
    clearPendingShare,
    thinkingNoteIds,
    toggleThinking,
  } = useNoteStore();

  const { isMobile } = useBrowser();

  const note = getNoteById(noteId);
  const isOwner = note?.ownerId === currentUserId;
  const canEdit = isOwner || (note?.editAccess ?? []).includes(currentUserId);
  const hasRequested = (note?.editRequests ?? []).includes(currentUserId);
  const titleRef = useRef(null);
  const containerRef = useRef(null);
  const isUpdating = useRef(false);
  const [tagInput, setTagInput] = useState("");
  const [isInTable, setIsInTable] = useState(false);
  const [activeFontSize, setActiveFontSize] = useState("");
  const [tableBorderColor, setTableBorderColor] = useState("stone-100");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAnchor, setShareAnchor] = useState(null);
  const [linkBubble, setLinkBubble] = useState({ open: false, url: "" });
  const linkInputRef = useRef(null);
  const linkBubbleRef = useRef(null);

  // Dismiss link bubble on outside click
  useEffect(() => {
    if (!linkBubble.open) return;
    const handler = (e) => {
      if (linkBubbleRef.current && !linkBubbleRef.current.contains(e.target))
        setLinkBubble((b) => ({ ...b, open: false }));
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [linkBubble.open]);
  const shareBtnRef = useRef(null);

  // Open share panel when triggered from sidebar
  useEffect(() => {
    if (pendingShareNoteId === noteId && shareBtnRef.current) {
      setShareAnchor(shareBtnRef.current.getBoundingClientRect());
      setShareOpen(true);
      clearPendingShare();
    }
  }, [pendingShareNoteId, noteId, clearPendingShare]);

  const isAccessible = (n) => {
    if (!n || !n.ownerId) return false;
    if (n.ownerId === currentUserId) return true;
    const shared = n.sharedWith ?? [];
    return shared.length > 0 && shared.includes(currentUserId);
  };

  /* Auto-delete empty note when user clicks outside the editor */
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!containerRef.current || containerRef.current.contains(e.target))
        return;
      if (e.target.closest("[data-portal]")) return;
      const current = getNoteById(noteId);
      if (!current) return;
      const isEmpty =
        (!current.title || current.title === "Untitled") &&
        (!current.content ||
          current.content.replace(/<[^>]*>/g, "").trim() === "") &&
        current.tags.length === 0;
      if (isEmpty) deleteNote(noteId);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [noteId, getNoteById, deleteNote]);

  /* TipTap editor */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      CommentedLine,
      IndentExtension,
      CommentToggleExtension,
      Table.configure({ resizable: true, lastColumnResizable: true }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
      CustomTextStyle,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight }),
      Link.configure({ openOnClick: false }),
      LinkCardExtension,
      Placeholder.configure({
        placeholder: "Start writing… type [[ to link a note",
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          allow: ({ editor: ed }) => !ed.isActive("commentedLine"),
          items: ({ query, editor: ed }) => {
            // Suppress mention popup on commented lines
            if (ed?.isActive("commentedLine")) return [];
            return notes
              .filter(
                (n) =>
                  n.id !== noteId &&
                  n.title.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 8)
              .map((n) => ({ id: n.id, title: n.title }));
          },
          render: () => {
            let component;
            let popup;
            return {
              onStart: (props) => {
                component = new ReactRenderer(SuggestionList, {
                  props,
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate: (props) => {
                component.updateProps(props);
                if (!props.clientRect || !popup?.[0]) return;
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    content: note?.content ?? "",
    editable: canEdit,
    onUpdate: ({ editor: ed }) => {
      if (isUpdating.current) return;
      updateNote(noteId, { content: ed.getHTML() });
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setIsInTable(ed.isActive("table"));
      setActiveFontSize(ed.getAttributes("textStyle").fontSize ?? "");
    },
  });

  /* Sync editor content when noteId changes */
  useEffect(() => {
    if (!editor || !note) return;
    const current = editor.getHTML();
    if (current !== note.content) {
      isUpdating.current = true;
      editor.commands.setContent(note.content ?? "");
      isUpdating.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  /* Keep editor editable state in sync */
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit);
  }, [editor, canEdit]);

  /* ── Conditional returns AFTER all hooks ── */

  if (!isAccessible(note)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-(--color-text-sec) gap-4 px-6">
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          className="text-(--color-primary)"
        >
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div className="text-center">
          <p className="text-xl font-semibold text-(--color-text)">
            Welcome to IdeaFlow
          </p>
          <p className="text-sm mt-1 text-(--color-text-sec)">
            Your personal knowledge base. Create a note to get started.
          </p>
        </div>
        <div className="mt-2 text-xs text-(--color-text-muted) text-center space-y-1">
          <p>
            💡 Type{" "}
            <code className="bg-(--color-input) px-1 rounded">{"[["}</code> in
            the editor to link notes
          </p>
          <p>🏷️ Add tags with the tag input below the note title</p>
          <p>🕸️ Open Graph View to visualize connections</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-(--color-text-muted)">
        Note not found
      </div>
    );
  }

  /* ── Event handlers ── */

  const openShare = () => {
    if (shareOpen) {
      setShareOpen(false);
      return;
    }
    const rect = shareBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setShareAnchor(rect);
      setShareOpen(true);
    }
  };

  const handleTitleChange = (e) => {
    updateNote(noteId, { title: e.target.value });
  };

  const handleTagKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().replace(/^#+/, "").toLowerCase();
      if (val) {
        addTag(noteId, val);
        setTagInput("");
      }
    } else if (
      e.key === "Backspace" &&
      tagInput === "" &&
      note.tags.length > 0
    ) {
      removeTag(noteId, note.tags[note.tags.length - 1]);
    }
  };

  const linkedNotes =
    note.linkedNoteIds?.map((id) => getNoteById(id)).filter(Boolean) ?? [];

  /* ── Render ── */

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col h-full overflow-hidden bg-(--color-background) relative"
    >
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-3 border-b border-(--color-border) bg-(--color-background) shrink-0">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="Bold"
          isActive={editor?.isActive("bold")}
        >
          <BoldIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="Italic"
          isActive={editor?.isActive("italic")}
        >
          <ItalicIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title="Heading"
          isActive={editor?.isActive("heading", { level: 2 })}
        >
          <Heading2Icon size={20} />
        </ToolbarButton>
        <div className="w-px h-4 bg-(--color-border) mx-1 shrink-0" />

        {/* Font size */}
        <FontSizePopover
          value={activeFontSize}
          onChange={(v) =>
            editor
              ?.chain()
              .focus()
              .setMark("textStyle", { fontSize: v || null })
              .run()
          }
        />

        {/* Text colour */}
        <ColorPalettePopover
          label="Color"
          icon={
            <span
              className="font-bold text-sm leading-none"
              style={{
                fontFamily: "serif",
                color:
                  editor?.getAttributes("textStyle").color || "currentColor",
              }}
            >
              A
            </span>
          }
          colors={TEXT_COLORS}
          activeColor={editor?.getAttributes("textStyle").color ?? ""}
          onSelect={(hex) =>
            editor
              ?.chain()
              .focus()
              .setMark("textStyle", { color: hex || null })
              .run()
          }
          onClear={() =>
            editor?.chain().focus().setMark("textStyle", { color: null }).run()
          }
          clearLabel="Default"
        />
        <div className="w-px h-4 bg-(--color-border) mx-1 shrink-0" />
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          title="Bullet list"
          isActive={editor?.isActive("bulletList")}
        >
          <ListIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
          isActive={editor?.isActive("orderedList")}
        >
          <ListOrderedIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          title="Code block"
          isActive={editor?.isActive("codeBlock")}
        >
          <FileCode2Icon size={20} />
        </ToolbarButton>
        {/* <ToolbarButton
          onClick={() => {
            const existing = editor?.getAttributes("link").href ?? "";
            setLinkBubble({ open: true, url: existing });
            setTimeout(() => linkInputRef.current?.select(), 30);
          }}
          title="Link"
          isActive={editor?.isActive("link")}
        >
          <Link2Icon size={20} />
        </ToolbarButton> */}
        <div className="w-px h-4 bg-(--color-border) mx-1 shrink-0" />
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          title="Align left"
          isActive={editor?.isActive({ textAlign: "left" })}
        >
          <AlignLeftIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          title="Align center"
          isActive={editor?.isActive({ textAlign: "center" })}
        >
          <AlignCenterIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          title="Align right"
          isActive={editor?.isActive({ textAlign: "right" })}
        >
          <AlignRightIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          title="Justify"
          isActive={editor?.isActive({ textAlign: "justify" })}
        >
          <AlignJustifyIcon size={20} />
        </ToolbarButton>
        <div className="w-px h-4 bg-(--color-border) mx-1 shrink-0" />
        <ToolbarButton
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="Insert grid (Tab to move between cells)"
        >
          <TableIconPH size={20} />
        </ToolbarButton>
        <div className="flex-1" />

        {/* Share button */}
        {/* <button
          ref={shareBtnRef}
          onClick={openShare}
          className={`relative flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors shrink-0 ${
            (note.sharedWith?.length ?? 0) > 0 || shareOpen
              ? "bg-(--color-primary) text-(--color-primary-dk)"
              : "text-(--color-text-sec) hover:bg-(--color-hover) hover:text-(--color-text)"
          }`}
          title="Share note"
        >
          <UserPlusIcon size={18} />
          <span className="hidden sm:inline">Share</span>
          {(note.sharedWith?.length ?? 0) > 0 && (
            <span
              className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
              style={{
                backgroundColor: "var(--color-primary-dk)",
                color: "var(--color-primary)",
              }}
            >
              {note.sharedWith.length}
            </span>
          )}
        </button> */}
      </div>

      {shareOpen && shareAnchor && note && (
        <SharePopover
          note={note}
          onClose={() => setShareOpen(false)}
          anchorRect={shareAnchor}
        />
      )}

      {/* Grid toolbar — shown when cursor is inside a table */}
      {isInTable && (
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-3 border-b border-(--color-border) bg-(--color-background) shrink-0">
          <span className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mr-2 shrink-0">
            Grid
          </span>
          <div className="w-px h-4 bg-(--color-border) mr-1 shrink-0" />
          <TableToolbarButton
            onClick={() => editor?.chain().focus().addColumnBefore().run()}
            title="Add column left"
          >
            <Columns2Icon size={18} />
            <span className="text-xs ml-1">Col ←</span>
          </TableToolbarButton>
          <TableToolbarButton
            onClick={() => editor?.chain().focus().addColumnAfter().run()}
            title="Add column right"
          >
            <Columns2Icon size={18} />
            <span className="text-xs ml-1">Col →</span>
          </TableToolbarButton>
          <TableToolbarButton
            onClick={() => editor?.chain().focus().deleteColumn().run()}
            title="Delete column"
            danger
          >
            <MinusIcon size={18} />
            <span className="text-xs ml-1">Del Col</span>
          </TableToolbarButton>
          <div className="w-px h-4 bg-(--color-border) mx-0.5 shrink-0" />
          <TableToolbarButton
            onClick={() => editor?.chain().focus().addRowBefore().run()}
            title="Add row above"
          >
            <Rows2Icon size={18} />
            <span className="text-xs ml-1">Row ↑</span>
          </TableToolbarButton>
          <TableToolbarButton
            onClick={() => editor?.chain().focus().addRowAfter().run()}
            title="Add row below"
          >
            <Rows2Icon size={18} />
            <span className="text-xs ml-1">Row ↓</span>
          </TableToolbarButton>
          <TableToolbarButton
            onClick={() => editor?.chain().focus().deleteRow().run()}
            title="Delete row"
            danger
          >
            <MinusIcon size={18} />
            <span className="text-xs ml-1">Del Row</span>
          </TableToolbarButton>
          <div className="w-px h-4 bg-(--color-border) mx-0.5 shrink-0" />
          <TableToolbarButton
            onClick={() => editor?.chain().focus().deleteTable().run()}
            title="Delete entire table"
            danger
          >
            <Trash2Icon size={18} />
            <span className="text-xs ml-1">Del Table</span>
          </TableToolbarButton>
          <div className="w-px h-4 bg-(--color-border) mx-0.5 shrink-0" />
          {/* Border colour buttons */}
          <span className="text-xs text-(--color-text-muted) mr-1 shrink-0">
            Border:
          </span>
          {BORDER_OPTIONS.map(({ value, label, hex }) => (
            <button
              key={value}
              title={`Table border: ${label}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setTableBorderColor(value);
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                tableBorderColor === value
                  ? "bg-(--color-primary-bg) text-(--color-primary-dk) ring-1 ring-(--color-primary)"
                  : "text-(--color-text-sec) hover:bg-(--color-hover)"
              }`}
            >
              <span
                className="inline-block w-3.5 h-3.5 rounded-sm border"
                style={{
                  borderColor: hex === "transparent" ? "currentColor" : hex,
                  borderWidth: hex === "transparent" ? "1px" : "2px",
                  borderStyle: hex === "transparent" ? "dashed" : "solid",
                  opacity: hex === "transparent" ? 0.4 : 1,
                }}
              />
              {label}
            </button>
          ))}
          <div className="w-px h-4 bg-(--color-border) mx-0.5 shrink-0" />
          <ColorPalettePopover
            label="Cell color"
            icon={<PaintBucketIcon size={18} />}
            colors={CELL_COLORS}
            onSelect={(hex) =>
              editor
                ?.chain()
                .focus()
                .setCellAttribute("backgroundColor", hex)
                .run()
            }
            onClear={() =>
              editor
                ?.chain()
                .focus()
                .setCellAttribute("backgroundColor", null)
                .run()
            }
          />
        </div>
      )}

      {/* ── Editor area ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-10 py-6 pb-20">
        {/* Read-only banner */}
        {!canEdit && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-(--color-background) border border-(--color-border) text-xs text-(--color-text-muted)">
            <LockSimpleIcon size={14} className="shrink-0" />
            <span className="flex-1">
              This note is <strong>read-only</strong>. You can request edit
              access from the note menu.
            </span>
            {hasRequested && (
              <span className="text-(--color-primary-dk) font-medium shrink-0">
                Request sent
              </span>
            )}
          </div>
        )}
        {/* Title */}
        <input
          ref={titleRef}
          type="text"
          value={note.title}
          onChange={canEdit ? handleTitleChange : undefined}
          readOnly={!canEdit}
          placeholder="Note title"
          className={`w-full text-2xl sm:text-3xl font-bold bg-transparent text-(--color-text) outline-none placeholder-(--color-text-muted) mb-1 ${
            !canEdit ? "cursor-default select-text" : ""
          }`}
        />
        <p className="text-xs text-(--color-text-muted) mb-4">
          {format(new Date(note.updatedAt), "MMMM d, yyyy 'at' h:mm a")}
        </p>

        {/* Tag input row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5 py-4 rounded-2xl">
          <TagIcon size={15} className="text-(--color-text-muted) shrink-0" />
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-xs bg-(--color-primary-bg) text-(--color-primary-dk) border border-(--color-primary) px-2 py-0.5 rounded-full cursor-pointer"
            >
              #{tag}
              {canEdit && (
                <button
                  onClick={() => removeTag(noteId, tag)}
                  className="hover:text-red-500 transition-colors leading-none"
                  title={`Remove #${tag}`}
                >
                  <XIcon size={10} />
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={
                note.tags.length === 0
                  ? "Add tags… (press Enter or ,)"
                  : "Add tag…"
              }
              className="flex-1 min-w-30 bg-transparent text-xs text-(--color-text) placeholder-(--color-text-muted) outline-none py-0.5"
            />
          )}
          {canEdit && tagInput.trim() && (
            <button
              onClick={() => {
                const val = tagInput.trim().replace(/^#+/, "").toLowerCase();
                if (val) {
                  addTag(noteId, val);
                  setTagInput("");
                }
              }}
              className="text-(--color-primary-dk) hover:text-(--color-text) transition-colors"
              title="Add tag"
            >
              <PlusIcon size={15} />
            </button>
          )}
        </div>

        {/* TipTap content */}
        {/* Link bar — shown at the top of the content area when active */}
        {linkBubble.open && (
          <div
            ref={linkBubbleRef}
            className="flex items-center gap-1.5 px-3 py-2 border-b border-(--color-border) bg-(--color-surface) shrink-0"
          >
            <Link2Icon
              size={14}
              className="text-(--color-text-muted) shrink-0"
            />
            <input
              ref={linkInputRef}
              type="url"
              placeholder="https://…"
              value={linkBubble.url}
              onChange={(e) =>
                setLinkBubble((b) => ({ ...b, url: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const href = linkBubble.url.trim();
                  if (href)
                    editor
                      ?.chain()
                      .focus()
                      .extendMarkRange("link")
                      .setLink({ href })
                      .run();
                  else
                    editor
                      ?.chain()
                      .focus()
                      .extendMarkRange("link")
                      .unsetLink()
                      .run();
                  setLinkBubble((b) => ({ ...b, open: false }));
                }
                if (e.key === "Escape") {
                  editor?.chain().focus().run();
                  setLinkBubble((b) => ({ ...b, open: false }));
                }
              }}
              className="flex-1 bg-transparent text-sm text-(--color-text) placeholder-(--color-text-muted) outline-none"
              autoFocus
            />
            <button
              onClick={() => {
                const href = linkBubble.url.trim();
                if (href)
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .setLink({ href })
                    .run();
                else
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                setLinkBubble((b) => ({ ...b, open: false }));
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-(--color-primary) text-(--color-primary-dk) font-medium hover:bg-(--color-primary-hv) transition-colors shrink-0"
            >
              Apply
            </button>
            {linkBubble.url && (
              <button
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                  setLinkBubble({ open: false, url: "" });
                }}
                className="text-xs text-(--color-text-muted) hover:text-red-500 transition-colors shrink-0 px-1"
                title="Remove link"
              >
                Remove
              </button>
            )}
            <button
              onClick={() => setLinkBubble((b) => ({ ...b, open: false }))}
              className="text-(--color-text-muted) hover:text-(--color-text) transition-colors shrink-0"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}
        <EditorContent
          editor={editor}
          className="text-(--color-text)"
          style={{
            "--table-border-color": isInTable
              ? BORDER_ACTIVE_HEX
              : (BORDER_OPTIONS.find((o) => o.value === tableBorderColor)
                  ?.hex ?? "#f5f5f4"),
            "--table-border-style": isInTable ? "dotted" : "solid",
          }}
        />

        {/* Linked notes */}
        {linkedNotes.length > 0 && (
          <div className="mt-8 border-t border-(--color-border-lt) pt-4">
            <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-2">
              Linked Notes
            </p>
            <div className="flex flex-wrap gap-2">
              {linkedNotes.map((ln) =>
                ln ? (
                  <button
                    key={ln.id}
                    onClick={() => onNavigate(ln.id)}
                    className="flex items-center gap-1 text-sm text-(--color-primary-dk) hover:bg-(--color-primary-bg) border border-(--color-border) px-3 py-1 rounded-full transition-colors"
                  >
                    <ArrowRightIcon size={12} /> {ln.title}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Thinking toggle — owner only ── */}
      {note?.ownerId === currentUserId && (
        <button
          onClick={() => toggleThinking(noteId)}
          title={
            thinkingNoteIds.includes(noteId) ? "Stop thinking" : "I am thinking"
          }
          className={`absolute bottom-20 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all z-10 ${
            thinkingNoteIds.includes(noteId)
              ? "bg-(--color-primary) text-(--color-on-primary) shadow-amber-200"
              : "bg-(--color-surface) border border-(--color-border) text-(--color-text-muted) hover:border-amber-400 hover:text-amber-400"
          }`}
        >
          <LightbulbIcon
            size={24}
            weight={thinkingNoteIds.includes(noteId) ? "fill" : "regular"}
          />
        </button>
      )}
    </div>
  );
};

export default NoteEditor;
