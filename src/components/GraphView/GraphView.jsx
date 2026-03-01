import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
import { ArrowLeftIcon, TagIcon, XIcon } from "@phosphor-icons/react";
import { useNoteStore } from "../../store/useNoteStore.js";
import { useBrowser } from "../../hooks/useBrowserDetect.jsx";

// Edge line colors — each type is visually distinct
const EDGE_COLOR = {
  explicit: "#7c3aed", // explicit linked note (originNoteId) — violet-700
  link: "#57534e", // strong relation [[wiki link]] — stone-600
  tag: "#d1d5db", // shared tag — light gray
  content: "#d1d5db", // similar content — light gray
};

// ── Stop words for content similarity ────────────────────────────────────────

// ── TF-IDF text similarity ────────────────────────────────────────────────────

const STOP_EN = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "let",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "did",
  "she",
  "use",
  "had",
  "may",
  "this",
  "that",
  "with",
  "have",
  "from",
  "they",
  "will",
  "what",
  "your",
  "about",
  "would",
  "which",
  "when",
  "there",
  "their",
  "been",
  "just",
  "more",
  "also",
  "into",
  "some",
  "than",
  "then",
  "these",
  "them",
  "were",
  "said",
  "her",
  "we",
  "my",
  "me",
  "he",
  "it",
  "as",
  "at",
  "be",
  "by",
  "do",
  "go",
  "if",
  "in",
  "is",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "us",
  "an",
  "am",
  "any",
  "nor",
  "own",
  "per",
  "via",
  "yet",
]);

const STOP_KO = new Set([
  "이",
  "그",
  "저",
  "것",
  "수",
  "있",
  "하",
  "되",
  "않",
  "없",
  "나",
  "우리",
  "이것",
  "그것",
  "저것",
  "여기",
  "거기",
  "저기",
  "에서",
  "에게",
  "으로",
  "에는",
  "이다",
  "이며",
  "이고",
  "것이",
  "하고",
  "하는",
  "하여",
  "하면",
  "하지",
  "때문",
  "대한",
  "위한",
  "통해",
  "따라",
  "있는",
  "있다",
  "없다",
  "한다",
  "된다",
  "된",
]);

function tokenize(text) {
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase();
  // Korean syllable blocks (2+ chars) and English words (3+ chars)
  const tokens = Array.from(clean.match(/[가-힣]{2,}|[a-z]{3,}/g) || []);
  return tokens.filter((t) => !STOP_EN.has(t) && !STOP_KO.has(t));
}

// Build L2-normalised TF-IDF vectors for a pool of documents
function buildTfIdf(docs) {
  const N = docs.length;
  if (N === 0) return new Map();

  // Document frequency per term
  const df = new Map();
  for (const { tokens } of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const vectors = new Map();
  for (const { id, tokens } of docs) {
    if (tokens.length === 0) {
      vectors.set(id, new Map());
      continue;
    }
    // Raw term frequency
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    // TF-IDF with log normalisation
    const vec = new Map();
    for (const [t, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;
      vec.set(t, (1 + Math.log(count)) * idf);
    }
    // L2 normalise so dot product == cosine similarity
    const norm = Math.sqrt(
      Array.from(vec.values()).reduce((s, v) => s + v * v, 0),
    );
    if (norm > 0) for (const [t, v] of vec) vec.set(t, v / norm);
    vectors.set(id, vec);
  }
  return vectors;
}

function cosineSim(vecA, vecB) {
  if (!vecA || !vecB || !vecA.size || !vecB.size) return 0;
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  for (const [t, v] of small) {
    const u = large.get(t);
    if (u) dot += v * u;
  }
  return dot;
}

// ── Component ─────────────────────────────────────────────────────────────────

const GraphView = ({ onClose, onNodeClick, fitTrigger }) => {
  const { notes, getAllTags, activeNoteId, currentUserId, thinkingNoteIds } =
    useNoteStore();
  const { isMobile } = useBrowser();
  const allTags = getAllTags();
  const [tagFilter, setTagFilter] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const fgRef = useRef(undefined);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const fitDone = useRef(false);
  const [isEvening, setIsEvening] = useState(() =>
    document.documentElement.hasAttribute("data-evening"),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsEvening(document.documentElement.hasAttribute("data-evening"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-evening"],
    });
    return () => observer.disconnect();
  }, []);

  const graphBg = isEvening ? "#1c1917" : "#ffffff";

  // Stable folder scope — only changes when active note moves to a different folder.
  // Switching notes within the same folder must NOT update this, so graphData stays
  // stable and node positions are preserved.
  const [graphScope, setGraphScope] = useState(() => {
    const activeNote = notes.find((n) => n.id === activeNoteId);
    return {
      folderId: activeNote?.folderId ?? null,
      ownerId: activeNote?.ownerId ?? null,
    };
  });

  useEffect(() => {
    const activeNote = notes.find((n) => n.id === activeNoteId);
    const folderId = activeNote?.folderId ?? null;
    const ownerId = activeNote?.ownerId ?? null;
    setGraphScope((prev) => {
      if (prev.folderId === folderId && prev.ownerId === ownerId) return prev;
      return { folderId, ownerId };
    });
  }, [notes, activeNoteId]);

  // Same visibility rule as Sidebar
  const isAccessible = (note) => {
    if (!note.ownerId) return true;
    if (note.ownerId === currentUserId) return true;
    const shared = note.sharedWith ?? [];
    if (shared.length === 0) return false;
    return shared.includes(currentUserId);
  };

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setDims({ width: r.width, height: r.height });
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // ── Graph data ──────────────────────────────────────────────────────────────
  const graphData = useMemo(() => {
    const accessible = notes.filter(isAccessible);

    // Scope to the folder of the active note (null = root/unfiled).
    // Uses graphScope which only changes on folder transitions — not on every
    // note selection — so node positions are preserved within a folder.
    const { folderId: activeFolderId, ownerId: activeOwnerId } = graphScope;
    const folderScoped = accessible.filter(
      (n) =>
        (n.folderId ?? null) === activeFolderId &&
        (activeOwnerId === null || n.ownerId === activeOwnerId),
    );

    const pool = tagFilter
      ? folderScoped.filter((n) => n.tags.includes(tagFilter))
      : folderScoped;
    const ids = new Set(pool.map((n) => n.id));

    // Build TF-IDF vectors once for all notes in this pool
    const tfidfDocs = pool.map((n) => ({
      id: n.id,
      tokens: tokenize(n.title + " " + n.content),
    }));
    const tfidfVectors = buildTfIdf(tfidfDocs);

    const degree = new Map();
    const bump = (id) => degree.set(id, (degree.get(id) ?? 0) + 1);

    const linkSet = new Set();
    const links = [];

    const addLink = (a, b, type, weight, sim = 0) => {
      if (!ids.has(a) || !ids.has(b) || a === b) return;
      const key = [a, b].sort().join("--"); // no type — one edge per pair, first added wins
      if (linkSet.has(key)) return;
      linkSet.add(key);
      links.push({ source: a, target: b, type, weight, sim });
      bump(a);
      bump(b);
    };

    // 0. Explicit linked notes (originNoteId) — purple, highest priority
    for (const n of pool)
      if (n.originNoteId) addLink(n.id, n.originNoteId, "explicit", 12);

    // 1. Strong relation [[links]]
    for (const n of pool)
      for (const lid of n.linkedNoteIds) addLink(n.id, lid, "link", 10);

    // 2. Shared tags — skipped for linkedOnly notes (strong-relation-only)
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) {
        if (pool[i].linkedOnly || pool[j].linkedOnly) continue;
        const shared = pool[i].tags.filter((t) => pool[j].tags.includes(t));
        if (shared.length)
          addLink(
            pool[i].id,
            pool[j].id,
            "tag",
            Math.min(10, shared.length * 3),
          );
      }

    // 3. Content similarity (TF-IDF cosine) — skipped for linkedOnly notes
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) {
        if (pool[i].linkedOnly || pool[j].linkedOnly) continue;
        const a = pool[i];
        const b = pool[j];
        // Skip if already connected by tags
        const hasTag = a.tags.some((t) => b.tags.includes(t));
        if (hasTag) continue;
        const sim = cosineSim(tfidfVectors.get(a.id), tfidfVectors.get(b.id));
        // Only connect notes with meaningful topical overlap
        // sim 0.00–0.14 : noise / coincidental words → no edge
        // sim 0.15–0.34 : weak similarity          → dotted line
        // sim 0.35–1.00 : strong similarity         → dashed line
        if (sim < 0.15) continue;
        addLink(a.id, b.id, "content", 1, sim);
      }

    const nodes = pool.map((n) => ({
      id: n.id,
      name: n.title || "Untitled",
      tags: n.tags,
      val: 1 + (degree.get(n.id) ?? 0),
      ownerId: n.ownerId ?? null,
    }));

    return { nodes, links };
  }, [notes, tagFilter, currentUserId, graphScope]);

  // Re-fit whenever the panel is resized (e.g. expand/collapse toggle)
  // Must be declared AFTER graphData to avoid temporal dead zone reference.
  useEffect(() => {
    if (!fitTrigger) return; // skip initial render (value=0)
    const timer = setTimeout(() => {
      const single = graphData.nodes.length <= 1;
      const padding = single ? (isMobile ? 100 : 400) : isMobile ? 40 : 160;
      fgRef.current?.zoomToFit(400, padding);
    }, 520); // wait for 480ms CSS transition + small buffer
    return () => clearTimeout(timer);
  }, [fitTrigger, dims.width, graphData.nodes.length, isMobile]);

  // Reset fit flag whenever graphData changes
  useEffect(() => {
    fitDone.current = false;
  }, [graphData]);

  // ── Node painter ────────────────────────────────────────────────────────────
  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const name = node.name ?? "";
      const id = node.id;
      const val = node.val ?? 1;
      const isActive = id === activeNoteId;
      const isHovered = id === hoveredId;
      const isThinking =
        node.ownerId === currentUserId && thinkingNoteIds.includes(id);
      const r = isMobile
        ? Math.max(3, Math.sqrt(val) * 3.5)
        : Math.max(1.5, Math.sqrt(val) * 1.5);
      const fillColor = isActive
        ? "#ebd05e"
        : isHovered
          ? "#7c3aed"
          : "#d7dce0";

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Lightbulb indicator — drawn with canvas primitives
      if (isThinking) {
        const s = Math.max(5, r * 1.8); // larger icon, scales with node
        const ix = x;
        const iy = y - r - s * 0.6;
        ctx.save();
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = Math.max(0.6, s * 0.07);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // bulb circle — stroke only
        ctx.beginPath();
        ctx.arc(ix, iy - s * 0.15, s * 0.32, 0, 2 * Math.PI);
        ctx.stroke();
        // base cap strokes
        ctx.beginPath();
        ctx.moveTo(ix - s * 0.16, iy + s * 0.18);
        ctx.lineTo(ix + s * 0.16, iy + s * 0.18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ix - s * 0.11, iy + s * 0.3);
        ctx.lineTo(ix + s * 0.11, iy + s * 0.3);
        ctx.stroke();
        ctx.restore();
      }

      if (globalScale >= 0.5 || isHovered || isActive) {
        const fs = isMobile
          ? Math.max(8, Math.min(14, 12 / globalScale))
          : Math.max(5, Math.min(8, 7 / globalScale));
        ctx.font = `${isActive ? "700" : "400"} ${fs}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = name.length > 24 ? name.slice(0, 22) + "…" : name;
        ctx.fillStyle = isActive
          ? isEvening
            ? "#fef3c7"
            : "#0c0a09"
          : "#a8a29e";
        ctx.fillText(label, x, y + r + 3);
      }
    },
    [
      activeNoteId,
      hoveredId,
      thinkingNoteIds,
      currentUserId,
      isMobile,
      isEvening,
    ],
  );

  const paintLink = useCallback((link, ctx) => {
    const start = link.source;
    const end = link.target;
    if (!start || !end || typeof start !== "object") return;

    const type = link.type;
    const color = EDGE_COLOR[type] ?? "#9c9080";

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = color;
    ctx.setLineDash([]);

    if (type === "explicit") {
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 1;
    } else if (type === "link") {
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 1;
    } else if (type === "tag") {
      ctx.lineWidth = 0.4;
      ctx.globalAlpha = 0.85;
    } else {
      // Content similarity — style driven by raw cosine similarity:
      //   sim ≥ 0.35 : dashed  [6,4] — strong topical overlap
      //   sim < 0.35 : dotted  [1,4] — weak / moderate overlap
      ctx.lineWidth = 0.4;
      ctx.globalAlpha = 0.7;
      if ((link.sim ?? 0) >= 0.35) {
        ctx.setLineDash([6, 4]); // dashed — strong similarity
      } else {
        ctx.strokeStyle = "#57534e"; // stone-600 — cooler tone for weak links
        ctx.setLineDash([1, 4]); // dotted — weak similarity
      }
    }

    ctx.stroke();
    ctx.restore();
  }, []);

  // ── Node spacing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current) return;
    // Moderate repulsion — keeps nodes from overlapping
    // On mobile: less repulsion + shorter link distance so nodes cluster closer
    const charge = fgRef.current.d3Force("charge");
    if (charge) charge.strength(isMobile ? -12 : -30);
    // Soft link springs — easy to deform manually
    const link = fgRef.current.d3Force("link");
    if (link) link.distance(isMobile ? 10 : 50).strength(0.3);
    // Very gentle gravity — just enough to keep isolated nodes nearby,
    // but weak enough that manual drags stick
    fgRef.current.d3Force("x", forceX(0).strength(0.02));
    fgRef.current.d3Force("y", forceY(0).strength(0.02));
    // Disable the default center force — it fights with forceX/forceY
    fgRef.current.d3Force("center", null);
    fgRef.current.d3ReheatSimulation?.();
  }, [graphData, isMobile]);

  const handleNodeClick = useCallback(
    (node) => {
      if (node.id) onNodeClick(String(node.id));
    },
    [onNodeClick],
  );
  const handleNodeHover = useCallback((node) => {
    setHoveredId(node?.id != null ? String(node.id) : null);
    document.body.style.cursor = node ? "pointer" : "default";
  }, []);

  return (
    <div
      className="flex-1 flex flex-col h-full bg-(--color-background)"
      // style={{ background: "#f9f7f0" }}
    >
      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ lineHeight: 0, background: graphBg }}
      >
        {graphData.nodes.length === 0 ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ color: "#9c9080" }}
          >
            <div className="text-5xl mb-3">🕸️</div>
            <p className="text-sm font-medium" style={{ color: "#6b6457" }}>
              No connections yet
            </p>
            <p className="text-xs mt-1" style={{ color: "#9c9080" }}>
              Add shared tags or [[link notes]] to see connections
            </p>
          </div>
        ) : dims.width > 0 && dims.height > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dims.width}
            height={dims.height}
            nodeId="id"
            nodeLabel={(n) =>
              `${n.name}${n.tags?.length ? " · " + n.tags.map((t) => "#" + t).join(" ") : ""}`
            }
            nodeCanvasObject={paintNode}
            nodeCanvasObjectMode={() => "replace"}
            linkCanvasObject={paintLink}
            linkCanvasObjectMode={() => "replace"}
            linkColor={() => "transparent"}
            backgroundColor={graphBg}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onNodeDragEnd={(node) => {
              // Pin the node at its dropped position so forces don't pull it back
              node.fx = node.x;
              node.fy = node.y;
            }}
            warmupTicks={100}
            cooldownTicks={100}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.4}
            onEngineStop={() => {
              if (fitDone.current) return;
              fitDone.current = true;
              const single = graphData.nodes.length <= 1;
              const padding = single
                ? isMobile
                  ? 100
                  : 400
                : isMobile
                  ? 40
                  : 160;
              setTimeout(() => fgRef.current?.zoomToFit(300, padding), 50);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default GraphView;
