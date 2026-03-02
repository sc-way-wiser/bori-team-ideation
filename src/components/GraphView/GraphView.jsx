import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
import { useNoteStore } from "../../store/useNoteStore.js";
import { useBrowser } from "../../hooks/useBrowserDetect.jsx";
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  DotOutlineIcon,
  DotsNineIcon,
} from "@phosphor-icons/react";
import { EDGE_COLOR, tokenize, buildTfIdf, cosineSim } from "./graphUtils.js";

// ── Component ─────────────────────────────────────────────────────────────────

const GraphView = ({ onClose, onNodeClick }) => {
  const {
    notes,
    folders,
    defaultFolderName,
    activeNoteId,
    currentUserId,
    thinkingNoteIds,
  } = useNoteStore();
  const { isMobile } = useBrowser();
  const fgRef = useRef(undefined);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const fitDone = useRef(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [isEvening, setIsEvening] = useState(() =>
    document.documentElement.hasAttribute("data-evening"),
  );

  // Hierarchical drill-down: which folders are expanded (shows children)
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const nodePositionsRef = useRef(new Map()); // nodeId → { x, y }
  const expandOriginRef = useRef(null); // { folderId, x, y }
  const pinnedNodeIdRef = useRef(null); // nodeId to pin (fx/fy) after expand/collapse
  const prevVisibleNodeIdsRef = useRef(new Set()); // IDs present in the last rendered graph
  const fitSchedulerRef = useRef(null); // timer handle for scheduled fit-to-zoom

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

  // All folder IDs available for expand-all
  const allFolderIds = useMemo(
    () => new Set(folders.map((f) => f.id)),
    [folders],
  );

  // Whether every folder is currently expanded
  const allExpanded =
    allFolderIds.size > 0 &&
    [...allFolderIds].every((id) => expandedFolders.has(id));

  const handleToggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedFolders(new Set());
    } else {
      setExpandedFolders(new Set(allFolderIds));
    }
    fitDone.current = false;
    clearTimeout(fitSchedulerRef.current);
    fitSchedulerRef.current = setTimeout(() => {
      const padding = isMobile ? 40 : 80;
      fgRef.current?.zoomToFit(400, padding);
    }, 600);
  }, [allExpanded, allFolderIds, isMobile]);

  // ── Graph data (hierarchical drill-down) ────────────────────────────────
  const graphData = useMemo(() => {
    const accessible = notes.filter(isAccessible);

    // Default folder bridging: notes with folderId=null belong to
    // the default folder's backing row (if it exists).
    const defaultBackingRow = folders.find(
      (f) =>
        !f.parentId &&
        f.ownerId === currentUserId &&
        f.name === (defaultFolderName || "Notes"),
    );

    const normFid = (fid) => {
      if ((fid === null || fid === undefined) && defaultBackingRow)
        return defaultBackingRow.id;
      return fid ?? null;
    };

    // Group notes by their direct (normalized) folder
    const notesByFolder = new Map();
    for (const n of accessible) {
      const fid = normFid(n.folderId);
      if (!notesByFolder.has(fid)) notesByFolder.set(fid, []);
      notesByFolder.get(fid).push(n);
    }

    const topFolders = folders.filter((f) => !f.parentId);

    // Count ALL notes under a folder (recursively)
    const descendantCount = (folderId) => {
      let count = (notesByFolder.get(folderId) ?? []).length;
      for (const f of folders) {
        if (f.parentId === folderId) count += descendantCount(f.id);
      }
      return count;
    };

    // Root folders that actually contain content
    const visibleRoots = topFolders.filter((f) => descendantCount(f.id) > 0);

    // Safety net: orphan null-folderId notes without a backing row
    if (!defaultBackingRow && accessible.some((n) => n.folderId === null)) {
      visibleRoots.push({
        id: null,
        name: defaultFolderName || "Notes",
        parentId: null,
      });
    }

    // Auto-expand when only 1 root folder (nothing to drill into)
    const effectiveExpanded = new Set(expandedFolders);
    if (visibleRoots.length <= 1 && visibleRoots.length > 0) {
      effectiveExpanded.add(visibleRoots[0].id);
    }

    const allNodes = [];
    const allLinks = [];
    const origin = expandOriginRef.current;
    const pinnedId = pinnedNodeIdRef.current;
    // Snapshot of which nodes were on screen in the PREVIOUS render
    const wasVisible = prevVisibleNodeIdsRef.current;

    // Restore stored position for a node that was already on screen
    const restorePos = (nodeId) => {
      const pos = nodePositionsRef.current.get(nodeId);
      if (!pos) return {};
      if (nodeId === pinnedId) {
        return { x: pos.x, y: pos.y, fx: pos.x, fy: pos.y };
      }
      return { x: pos.x, y: pos.y };
    };

    // Position for a node: restore if it was already visible, else spawn at parent center
    const nodePos = (nodeId, parentFolderId) => {
      if (wasVisible.has(nodeId)) return restorePos(nodeId);
      return initChildPos(parentFolderId);
    };

    // Initial position for CHILDREN of a just-expanded folder.
    // Spawn at the parent center with a meaningful jitter so the d3 charge
    // force has a non-zero gradient between nodes and can push them apart.
    // (Nodes at exactly the same pixel produce zero repulsion force.)
    const JITTER = 35;
    const initChildPos = (parentFolderId) => {
      const nodeId = `folder:${parentFolderId}`;
      let cx = 0,
        cy = 0;
      if (origin && origin.folderId === parentFolderId) {
        cx = origin.x;
        cy = origin.y;
      } else {
        const pos = nodePositionsRef.current.get(nodeId);
        if (pos) {
          cx = pos.x;
          cy = pos.y;
        }
      }
      return {
        x: cx + (Math.random() - 0.5) * JITTER,
        y: cy + (Math.random() - 0.5) * JITTER,
      };
    };

    // Collect ALL visible note IDs so we can compute similarity edges later
    const allNoteNodes = [];

    // Recursively add children of an expanded folder
    const addChildren = (parentFolderId, parentNodeId) => {
      const directNotes = notesByFolder.get(parentFolderId) ?? [];
      for (const note of directNotes) {
        const pos = nodePos(note.id, parentFolderId);
        const noteNode = {
          id: note.id,
          type: "note",
          name: note.title || "Untitled",
          tags: note.tags,
          val: 1,
          ownerId: note.ownerId ?? null,
          linkedNoteIds: note.linkedNoteIds ?? [],
          originNoteId: note.originNoteId ?? null,
          linkedOnly: note.linkedOnly ?? false,
          content: note.content ?? "",
          ...pos,
        };
        allNodes.push(noteNode);
        allNoteNodes.push(noteNode);
        allLinks.push({
          source: parentNodeId,
          target: note.id,
          type: "hierarchy",
        });
      }

      const subFolders = folders.filter((f) => f.parentId === parentFolderId);
      for (const sub of subFolders) {
        const subCount = descendantCount(sub.id);
        if (subCount === 0) continue;
        const subNodeId = `folder:${sub.id}`;
        const subPos = nodePos(subNodeId, parentFolderId);
        allNodes.push({
          id: subNodeId,
          type: "folder",
          folderId: sub.id,
          name: sub.name,
          noteCount: subCount,
          val: effectiveExpanded.has(sub.id) ? 4 : 2,
          expanded: effectiveExpanded.has(sub.id),
          isSubFolder: true,
          ...subPos,
        });
        allLinks.push({
          source: parentNodeId,
          target: subNodeId,
          type: "hierarchy",
        });
        if (effectiveExpanded.has(sub.id)) {
          addChildren(sub.id, subNodeId);
        }
      }
    };

    for (const root of visibleRoots) {
      const rootNodeId = `folder:${root.id}`;
      const isExpanded = effectiveExpanded.has(root.id);
      allNodes.push({
        id: rootNodeId,
        type: "folder",
        folderId: root.id,
        name: root.name,
        noteCount: descendantCount(root.id),
        val: isExpanded ? 5 : 3,
        expanded: isExpanded,
        ...restorePos(rootNodeId), // root folders always restore — they're always present
      });
      if (isExpanded) {
        addChildren(root.id, rootNodeId);
      }
    }

    // Update the "previously visible" snapshot for the next render
    prevVisibleNodeIdsRef.current = new Set(allNodes.map((n) => n.id));

    // ── Note-to-note relationship edges ──────────────────────────────────
    if (allNoteNodes.length > 1) {
      const noteIds = new Set(allNoteNodes.map((n) => n.id));
      const linkSet = new Set(); // dedup key per pair
      const addRelLink = (a, b, type, weight, sim = 0) => {
        if (!noteIds.has(a) || !noteIds.has(b) || a === b) return;
        const key = [a, b].sort().join("--");
        if (linkSet.has(key)) return;
        linkSet.add(key);
        allLinks.push({ source: a, target: b, type, weight, sim });
      };

      // Explicit linked notes (originNoteId)
      for (const n of allNoteNodes)
        if (n.originNoteId) addRelLink(n.id, n.originNoteId, "explicit", 12);

      // Strong [[wiki links]]
      for (const n of allNoteNodes)
        for (const lid of n.linkedNoteIds) addRelLink(n.id, lid, "link", 10);

      // Shared tags
      for (let i = 0; i < allNoteNodes.length; i++)
        for (let j = i + 1; j < allNoteNodes.length; j++) {
          if (allNoteNodes[i].linkedOnly || allNoteNodes[j].linkedOnly)
            continue;
          const shared = allNoteNodes[i].tags.filter((t) =>
            allNoteNodes[j].tags.includes(t),
          );
          if (shared.length)
            addRelLink(
              allNoteNodes[i].id,
              allNoteNodes[j].id,
              "tag",
              Math.min(10, shared.length * 3),
            );
        }

      // Content similarity (TF-IDF cosine)
      const tfidfDocs = allNoteNodes.map((n) => ({
        id: n.id,
        tokens: tokenize(n.name + " " + n.content),
      }));
      const tfidfVectors = buildTfIdf(tfidfDocs);
      for (let i = 0; i < allNoteNodes.length; i++)
        for (let j = i + 1; j < allNoteNodes.length; j++) {
          if (allNoteNodes[i].linkedOnly || allNoteNodes[j].linkedOnly)
            continue;
          const a = allNoteNodes[i];
          const b = allNoteNodes[j];
          if (a.tags.some((t) => b.tags.includes(t))) continue;
          const sim = cosineSim(tfidfVectors.get(a.id), tfidfVectors.get(b.id));
          if (sim < 0.15) continue;
          addRelLink(a.id, b.id, "content", 1, sim);
        }
    }

    return { nodes: allNodes, links: allLinks };
  }, [notes, folders, defaultFolderName, currentUserId, expandedFolders]);

  // ── Node painter ────────────────────────────────────────────────────────────
  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Track position for future expansion origin
      nodePositionsRef.current.set(node.id, { x, y });

      // ── Folder dot ──────────────────────────────────────────────────────
      if (node.type === "folder") {
        const isHovered = node.id === hoveredId;
        // Subfolders are half the size of root folder dots
        const scale = node.isSubFolder ? 0.75 : 1;
        const r =
          (isMobile ? (node.expanded ? 5 : 4) : node.expanded ? 3 : 2.5) *
          scale;

        // Outer ring
        ctx.beginPath();
        ctx.arc(x, y, r + 1, 0, 2 * Math.PI);
        ctx.strokeStyle = isHovered
          ? "#7c3aed"
          : node.expanded
            ? "#a78bfa"
            : isEvening
              ? "#78716c"
              : "#a8a29e";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Fill
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = isHovered
          ? "#7c3aed"
          : node.expanded
            ? isEvening
              ? "#4c1d95"
              : "#ede9fe"
            : isEvening
              ? "#292524"
              : "#f5f5f4";
        ctx.fill();

        // Folder name — same size for root and subfolders
        const fs = isMobile ? 4 : 2.5;
        ctx.font = `600 ${fs}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHovered
          ? "#7c3aed"
          : isEvening
            ? "#d6d3d1"
            : "#57534e";
        const label = node.name;
        ctx.fillText(
          label.length > 22 ? label.slice(0, 20) + "\u2026" : label,
          x,
          y + r + 2,
        );

        // Note count badge (collapsed folders only)
        if (!node.expanded) {
          const countFs = isMobile ? 3.5 : 2.2;
          ctx.font = `400 ${countFs}px Inter, sans-serif`;
          ctx.fillStyle = "#a8a29e";
          ctx.fillText(`${node.noteCount}`, x, y + r + 2 + fs + 1);
        }
        return;
      }

      // ── Note dot ────────────────────────────────────────────────────────
      const name = node.name ?? "";
      const id = node.id;
      const isActive = id === activeNoteId;
      const isHovered = id === hoveredId;
      const isThinking =
        node.ownerId === currentUserId && thinkingNoteIds.includes(id);
      const r = isMobile ? 4 : 2;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isActive
        ? "#ebd05e"
        : isHovered
          ? "#7c3aed"
          : isEvening
            ? "#78716c"
            : "#d7dce0";
      ctx.fill();

      // Lightbulb indicator for thinking notes
      if (isThinking) {
        const s = Math.max(5, r * 1.8);
        const ix = x;
        const iy = y - r - s * 0.6;
        ctx.save();
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = Math.max(0.6, s * 0.07);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.arc(ix, iy - s * 0.15, s * 0.32, 0, 2 * Math.PI);
        ctx.stroke();
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

      if (globalScale >= 0.8 || isHovered || isActive) {
        const fs = isMobile
          ? Math.max(7, Math.min(11, 10 / globalScale))
          : Math.max(4, Math.min(7, 6 / globalScale));
        ctx.font = `${isActive ? "700" : "400"} ${fs}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = name.length > 24 ? name.slice(0, 22) + "\u2026" : name;
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

  // ── Link painter ────────────────────────────────────────────────────────────
  const paintLink = useCallback(
    (link, ctx) => {
      const start = link.source;
      const end = link.target;
      if (!start || !end || typeof start !== "object") return;

      const type = link.type;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.setLineDash([]);

      if (type === "hierarchy") {
        // Folder → child line: very thin, subtle
        ctx.strokeStyle = isEvening ? "#44403c" : "#e7e5e4";
        ctx.lineWidth = 0.3;
        ctx.globalAlpha = 0.4;
      } else if (type === "explicit") {
        // Explicit linked note (originNoteId) — solid violet
        ctx.strokeStyle = EDGE_COLOR.explicit;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 1;
      } else if (type === "link") {
        // Strong [[wiki link]] — solid stone
        ctx.strokeStyle = EDGE_COLOR.link;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 1;
      } else if (type === "tag") {
        // Shared tag — dashed gray
        ctx.strokeStyle = EDGE_COLOR.tag;
        ctx.lineWidth = 0.4;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([4, 3]);
      } else if (type === "content") {
        // Content similarity — style by cosine sim
        ctx.lineWidth = 0.4;
        ctx.globalAlpha = 0.7;
        if ((link.sim ?? 0) >= 0.35) {
          ctx.strokeStyle = EDGE_COLOR.content;
          ctx.setLineDash([6, 4]); // dashed — strong
        } else {
          ctx.strokeStyle = "#57534e";
          ctx.setLineDash([1, 4]); // dotted — weak
        }
      } else {
        ctx.strokeStyle = isEvening ? "#44403c" : "#d6d3d1";
        ctx.lineWidth = 0.4;
        ctx.globalAlpha = 0.4;
      }

      ctx.stroke();
      ctx.restore();
    },
    [isEvening],
  );

  // ── Force tuning ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current) return;
    const charge = fgRef.current.d3Force("charge");
    if (charge) charge.strength(isMobile ? -8 : -12);
    const link = fgRef.current.d3Force("link");
    if (link)
      link
        .distance((l) => {
          if (l.type === "hierarchy") return isMobile ? 35 : 50;
          return isMobile ? 8 : 12;
        })
        .strength((l) => (l.type === "hierarchy" ? 0.15 : 0.06));
    fgRef.current.d3Force("x", forceX(0).strength(0.005));
    fgRef.current.d3Force("y", forceY(0).strength(0.005));
    fgRef.current.d3Force("center", null);
  }, [graphData, isMobile]);

  // Inject simulation energy whenever the expanded set changes so new nodes
  // animate outward. We do this in a separate effect (after the force-tuning
  // effect has applied the new forces) using a short timeout.
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.d3Alpha?.(0.25);
    }, 0);
    return () => clearTimeout(timer);
  }, [expandedFolders]);

  // ── Interaction ─────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (node) => {
      if (node.type === "folder") {
        // Pin this folder so it stays put during expand/collapse
        pinnedNodeIdRef.current = node.id;
        if (node.expanded) {
          // Collapse: remove this folder (and all its descendant folders) from expanded set
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            const removeRecursive = (fid) => {
              next.delete(fid);
              for (const f of folders) {
                if (f.parentId === fid) removeRecursive(f.id);
              }
            };
            removeRecursive(node.folderId);
            return next;
          });
          fitDone.current = false;
          clearTimeout(fitSchedulerRef.current);
          fitSchedulerRef.current = setTimeout(() => {
            const padding = isMobile ? 40 : 80;
            fgRef.current?.zoomToFit(400, padding);
          }, 600);
        } else {
          // Expand
          const pos = nodePositionsRef.current.get(node.id);
          expandOriginRef.current = {
            folderId: node.folderId,
            x: pos?.x ?? node.x ?? 0,
            y: pos?.y ?? node.y ?? 0,
          };
          setExpandedFolders((prev) => new Set([...prev, node.folderId]));
          fitDone.current = false;
          clearTimeout(fitSchedulerRef.current);
          fitSchedulerRef.current = setTimeout(() => {
            const padding = isMobile ? 40 : 80;
            fgRef.current?.zoomToFit(400, padding);
          }, 600);
        }
      } else if (node.id) {
        onNodeClick(String(node.id));
      }
    },
    [onNodeClick, folders],
  );

  const handleNodeHover = useCallback((node) => {
    setHoveredId(node?.id != null ? String(node.id) : null);
    document.body.style.cursor = node ? "pointer" : "default";
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-(--color-background)">
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ lineHeight: 0, background: graphBg }}
      >
        {/* Expand / Collapse all toggle */}
        {graphData.nodes.some((n) => n.type === "folder") && (
          <button
            onClick={handleToggleAll}
            title={allExpanded ? "Collapse all folders" : "Expand all folders"}
            className="absolute top-2 left-2 z-10 flex items-center gap-1 p-3 rounded-full text-sm font-medium bg-(--color-surface) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) transition-colors shadow-sm"
          >
            {allExpanded ? (
              <div className="flex items-center gap-1">
                {<ArrowsInIcon size={24} />}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {<DotsNineIcon size={24} />}
              </div>
            )}
          </button>
        )}
        {graphData.nodes.length === 0 ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ color: "#9c9080" }}
          >
            <div className="text-5xl mb-3">{"\uD83D\uDD78\uFE0F"}</div>
            <p className="text-sm font-medium" style={{ color: "#6b6457" }}>
              No notes yet
            </p>
            <p className="text-xs mt-1" style={{ color: "#9c9080" }}>
              Create notes to see the graph
            </p>
          </div>
        ) : dims.width > 0 && dims.height > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dims.width}
            height={dims.height}
            nodeId="id"
            nodeLabel={() => ""}
            nodeCanvasObject={paintNode}
            nodeCanvasObjectMode={() => "replace"}
            linkCanvasObject={paintLink}
            linkCanvasObjectMode={() => "replace"}
            linkColor={() => "transparent"}
            backgroundColor={graphBg}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onNodeDragEnd={(node) => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            warmupTicks={0}
            cooldownTicks={1000}
            d3AlphaDecay={0.008}
            d3VelocityDecay={0.7}
            onEngineStop={() => {
              // Unpin the folder node once the simulation settles
              if (pinnedNodeIdRef.current) {
                const gd = fgRef.current?.graphData?.();
                if (gd) {
                  const pinned = gd.nodes.find(
                    (n) => n.id === pinnedNodeIdRef.current,
                  );
                  if (pinned) {
                    pinned.fx = undefined;
                    pinned.fy = undefined;
                  }
                }
                pinnedNodeIdRef.current = null;
              }
              if (fitDone.current) return;
              fitDone.current = true;
              const padding = isMobile ? 40 : 80;
              setTimeout(() => fgRef.current?.zoomToFit(300, padding), 50);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default GraphView;
