import {
  useCallback,
  useRef,
  useState,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import ForceGraph3D from "react-force-graph-3d";
import { forceX, forceY, forceZ } from "d3-force-3d";
import SpriteText from "three-spritetext";
import * as THREE from "three";
import { useNoteStore } from "../../store/useNoteStore.js";
import { useBrowser } from "../../hooks/useBrowserDetect.jsx";
import { tokenize, buildTfIdf, cosineSim, EDGE_COLOR } from "./graphUtils.js";

// ── Component ─────────────────────────────────────────────────────────────────

const GraphView3D = forwardRef(
  ({ onClose, onNodeClick, expandedFolders, onExpandedFoldersChange }, ref) => {
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
    // Use refs (not state) for hover/active so nodeThreeObject never re-creates
    // during a drag — rebuilding Three.js objects mid-drag kills the interaction.
    const hoveredIdRef = useRef(null);
    const activeNoteIdRef = useRef(activeNoteId);
    // Use refs so nodeThreeObject dep stays [isEvening] — avoids rebuild on every change
    const thinkingNoteIdsRef = useRef(thinkingNoteIds);
    useEffect(() => {
      thinkingNoteIdsRef.current = thinkingNoteIds;
    }, [thinkingNoteIds]);
    const [isEvening, setIsEvening] = useState(() =>
      document.documentElement.hasAttribute("data-evening"),
    );

    // fitSchedulerRef used by handleNodeClick expand-zoom
    const fitSchedulerRef = useRef(null);

    // Expose zoomToFit imperatively so Layout can call it after toggle-all
    useImperativeHandle(ref, () => ({
      zoomToFit: () => {
        clearTimeout(fitSchedulerRef.current);
        fitSchedulerRef.current = setTimeout(() => {
          fgRef.current?.zoomToFit(400, isMobile ? 40 : 80);
        }, 600);
      },
    }));
    const graphDataRef = useRef({ nodes: [], links: [] }); // always-current for click handler

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

    // Safety: whenever the graph is ready, attach a pointerup listener on the
    // renderer canvas so OrbitControls always gets unstuck even if onNodeDragEnd
    // fires before the controls re-enable path runs.
    useEffect(() => {
      if (!dims.width) return;
      const reenable = () => {
        const ctrl = fgRef.current?.controls?.();
        if (ctrl) ctrl.enabled = true;
      };
      const canvas = fgRef.current?.renderer?.().domElement;
      if (!canvas) return;
      canvas.addEventListener("pointerup", reenable);
      canvas.addEventListener("pointercancel", reenable);
      return () => {
        canvas.removeEventListener("pointerup", reenable);
        canvas.removeEventListener("pointercancel", reenable);
      };
    }, [dims.width]);

    // ── Graph data (hierarchical drill-down) ────────────────────────────────
    const graphData = useMemo(() => {
      const accessible = notes.filter(isAccessible);

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

      const notesByFolder = new Map();
      for (const n of accessible) {
        const fid = normFid(n.folderId);
        if (!notesByFolder.has(fid)) notesByFolder.set(fid, []);
        notesByFolder.get(fid).push(n);
      }

      const topFolders = folders.filter((f) => !f.parentId);

      const descendantCount = (folderId) => {
        let count = (notesByFolder.get(folderId) ?? []).length;
        for (const f of folders) {
          if (f.parentId === folderId) count += descendantCount(f.id);
        }
        return count;
      };

      const visibleRoots = topFolders.filter((f) => descendantCount(f.id) > 0);

      if (!defaultBackingRow && accessible.some((n) => n.folderId === null)) {
        visibleRoots.push({
          id: null,
          name: defaultFolderName || "Notes",
          parentId: null,
        });
      }

      const effectiveExpanded = new Set(expandedFolders);
      if (visibleRoots.length <= 1 && visibleRoots.length > 0) {
        effectiveExpanded.add(visibleRoots[0].id);
      }

      const allNodes = [];
      const allLinks = [];
      const allNoteNodes = [];

      const addChildren = (parentFolderId, parentNodeId) => {
        const directNotes = notesByFolder.get(parentFolderId) ?? [];
        for (const note of directNotes) {
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
          allNodes.push({
            id: subNodeId,
            type: "folder",
            folderId: sub.id,
            name: sub.name,
            noteCount: subCount,
            val: effectiveExpanded.has(sub.id) ? 4 : 2,
            expanded: effectiveExpanded.has(sub.id),
            isSubFolder: true,
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
        });
        if (isExpanded) {
          addChildren(root.id, rootNodeId);
        }
      }

      // Note-to-note relationship edges
      if (allNoteNodes.length > 1) {
        const noteIds = new Set(allNoteNodes.map((n) => n.id));
        const linkSet = new Set();
        const addRelLink = (a, b, type, weight, sim = 0) => {
          if (!noteIds.has(a) || !noteIds.has(b) || a === b) return;
          const key = [a, b].sort().join("--");
          if (linkSet.has(key)) return;
          linkSet.add(key);
          allLinks.push({ source: a, target: b, type, weight, sim });
        };

        for (const n of allNoteNodes)
          if (n.originNoteId) addRelLink(n.id, n.originNoteId, "explicit", 12);

        for (const n of allNoteNodes)
          for (const lid of n.linkedNoteIds) addRelLink(n.id, lid, "link", 10);

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
            const sim = cosineSim(
              tfidfVectors.get(a.id),
              tfidfVectors.get(b.id),
            );
            if (sim < 0.15) continue;
            addRelLink(a.id, b.id, "content", 1, sim);
          }
      }

      return { nodes: allNodes, links: allLinks };
    }, [notes, folders, defaultFolderName, currentUserId, expandedFolders]);

    // Keep activeNoteIdRef in sync with store
    useEffect(() => {
      activeNoteIdRef.current = activeNoteId;
    }, [activeNoteId]);

    // Keep activeNoteIdRef in sync with store
    useEffect(() => {
      activeNoteIdRef.current = activeNoteId;
    }, [activeNoteId]);

    // Keep graphDataRef in sync so click handlers read latest node positions
    useEffect(() => {
      graphDataRef.current = graphData;
    }, [graphData]);

    // ── 3D Node objects: flat billboard circle + crisp text label ─────────────────
    const nodeThreeObject = useCallback(
      (node) => {
        // Read from refs so this callback is never re-created on hover/active
        // changes — rebuilding Three.js objects mid-drag kills the drag.
        const isActive = node.id === activeNoteIdRef.current;
        const isHovered = String(node.id) === hoveredIdRef.current;

        // Dot color
        let dotColor;
        if (node.type === "folder") {
          dotColor = isHovered
            ? "#7c3aed"
            : node.expanded
              ? isEvening
                ? "#4c1d95"
                : "#c4b5fd"
              : isEvening
                ? "#57534e"
                : "#d6d3d1";
        } else {
          dotColor = isActive
            ? "#ebd05e"
            : isHovered
              ? "#7c3aed"
              : isEvening
                ? "#78716c"
                : "#d7dce0";
        }

        // Flat circle dot via billboard sprite — no 3D depth, always faces camera
        const dotCanvas = document.createElement("canvas");
        dotCanvas.width = 64;
        dotCanvas.height = 64;
        const dCtx = dotCanvas.getContext("2d");
        dCtx.beginPath();
        dCtx.arc(32, 32, 28, 0, Math.PI * 2);
        dCtx.fillStyle = dotColor;
        dCtx.fill();
        const dotTex = new THREE.CanvasTexture(dotCanvas);
        const dotSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: dotTex,
            depthWrite: false,
            depthTest: false,
          }),
        );
        dotSprite.renderOrder = 2;

        // 1/3 of original sizes ×1.5 = 0.5× original (folder expanded ~2.1, collapsed ~1.5, note ~1.05)
        const dotSize =
          node.type === "folder" ? (node.expanded ? 2.1 : 1.5) : 1.05;
        dotSprite.scale.set(dotSize * 2, dotSize * 2, 1);

        // Label
        const rawLabel =
          node.type === "folder"
            ? node.name.length > 22
              ? node.name.slice(0, 20) + "\u2026"
              : node.name
            : (node.name ?? "").length > 24
              ? (node.name ?? "").slice(0, 22) + "\u2026"
              : (node.name ?? "");

        const label = new SpriteText(rawLabel);
        label.color = isHovered
          ? "#7c3aed"
          : isActive
            ? isEvening
              ? "#fef3c7"
              : "#0c0a09"
            : node.type === "folder"
              ? isEvening
                ? "#d6d3d1"
                : "#57534e"
              : "#a8a29e";
        label.textHeight = node.type === "folder" ? 3.2 : 2.6;
        label.fontWeight = isActive || node.type === "folder" ? "600" : "400";
        label.backgroundColor = "transparent";
        label.padding = 0;
        // More margin: dotSize radius + 6 units of breathing room
        label.position.set(0, -(dotSize + 6), 0);
        label.renderOrder = 2;
        label.material.depthTest = false;

        const group = new THREE.Group();
        group.renderOrder = 2;

        // Invisible sphere mesh — gives the raycaster a solid hit surface for
        // drag and click. Without this, THREE.Group has no geometry to raycast.
        const hitSphere = new THREE.Mesh(
          new THREE.SphereGeometry(dotSize * 1.8, 8, 8),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        group.add(hitSphere);

        group.add(dotSprite);
        group.add(label);

        // Thinking indicator — small yellow lightbulb sprite above the dot
        if (
          node.type !== "folder" &&
          node.ownerId === currentUserId &&
          thinkingNoteIdsRef.current.includes(node.id)
        ) {
          const thinkCanvas = document.createElement("canvas");
          thinkCanvas.width = 32;
          thinkCanvas.height = 32;
          const tc = thinkCanvas.getContext("2d");
          // Yellow circle
          tc.beginPath();
          tc.arc(16, 16, 12, 0, Math.PI * 2);
          tc.fillStyle = "#fbbf24";
          tc.fill();
          const thinkTex = new THREE.CanvasTexture(thinkCanvas);
          const thinkSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: thinkTex,
              depthWrite: false,
              depthTest: false,
            }),
          );
          thinkSprite.renderOrder = 2;
          thinkSprite.scale.set(dotSize * 1.2, dotSize * 1.2, 1);
          thinkSprite.position.set(dotSize * 0.9, dotSize * 0.9, 0);
          group.add(thinkSprite);
        }

        // Count badge for collapsed folders
        if (node.type === "folder" && !node.expanded) {
          const badge = new SpriteText(`${node.noteCount}`);
          badge.color = "#a8a29e";
          badge.textHeight = 2.4;
          badge.backgroundColor = "transparent";
          badge.padding = 0;
          badge.position.set(0, -(dotSize + 13), 0);
          badge.renderOrder = 2;
          badge.material.depthTest = false;
          group.add(badge);
        }

        return group;
      },
      [isEvening],
    );

    // ── Link visuals ────────────────────────────────────────────────────────────
    const linkColor = useCallback(
      (link) => {
        const type = link.type;
        if (type === "hierarchy") return isEvening ? "#44403c" : "#e7e5e4";
        if (type === "explicit") return EDGE_COLOR.explicit;
        if (type === "link") return EDGE_COLOR.link;
        if (type === "tag") return EDGE_COLOR.tag;
        if (type === "content") return EDGE_COLOR.content;
        return isEvening ? "#44403c" : "#d6d3d1";
      },
      [isEvening],
    );

    // pick a representative scalar for bulk opacity (per-link fn not supported)
    const LINK_OPACITY = 0.6;

    const linkWidth = useCallback((link) => {
      const type = link.type;
      if (type === "hierarchy") return 0.3;
      if (type === "explicit") return 0.8;
      if (type === "link") return 0.8;
      // 0 → Line geometry (required for LineDashedMaterial to render dashes)
      if (type === "tag") return 0;
      if (type === "content") return 0;
      return 0.3;
    }, []);

    // LineDashedMaterial for tag and content (similarity) links.
    // linkLineDash is a 2D-only canvas feature; in 3D we supply a custom material.
    const linkMaterial = useCallback(
      (link) => {
        const type = link.type;
        if (type === "tag") {
          return new THREE.LineDashedMaterial({
            color: EDGE_COLOR.tag,
            dashSize: 4,
            gapSize: 3,
            opacity: LINK_OPACITY,
            transparent: true,
          });
        }
        if (type === "content") {
          const isStrong = (link.sim ?? 0) >= 0.35;
          return new THREE.LineDashedMaterial({
            color: EDGE_COLOR.content,
            dashSize: isStrong ? 8 : 2,
            gapSize: isStrong ? 2 : 3,
            opacity: LINK_OPACITY,
            transparent: true,
          });
        }
        return null; // use default material for all other types
      },
      [isEvening],
    );

    // ── Force tuning ──────────────────────────────────────────────────────────
    useEffect(() => {
      if (!fgRef.current) return;
      const charge = fgRef.current.d3Force("charge");
      if (charge) charge.strength(-20);
      const link = fgRef.current.d3Force("link");
      if (link)
        link
          .distance((l) => {
            if (l.type === "hierarchy") return 22;
            return 15;
          })
          .strength((l) => (l.type === "hierarchy" ? 0.15 : 0.06));
      fgRef.current.d3Force("x", forceX(0).strength(0.005));
      fgRef.current.d3Force("y", forceY(0).strength(0.005));
      fgRef.current.d3Force("z", forceZ(0).strength(0.005));
      fgRef.current.d3Force("center", null);
    }, [graphData]);

    // Inject simulation energy on expand/collapse
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
          if (node.expanded) {
            // Collapse — no zoom, just collapse
            onExpandedFoldersChange((prev) => {
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
          } else {
            // Expand — fly camera to just this folder's area after simulation settles
            onExpandedFoldersChange(
              (prev) => new Set([...prev, node.folderId]),
            );
            clearTimeout(fitSchedulerRef.current);
            fitSchedulerRef.current = setTimeout(() => {
              const gd = graphDataRef.current;
              const folderNodeId = `folder:${node.folderId}`;

              // BFS: collect all node IDs reachable from this folder via hierarchy links
              const childIds = new Set([folderNodeId]);
              const queue = [folderNodeId];
              while (queue.length > 0) {
                const cur = queue.shift();
                for (const link of gd.links) {
                  const src =
                    typeof link.source === "object"
                      ? link.source.id
                      : link.source;
                  const tgt =
                    typeof link.target === "object"
                      ? link.target.id
                      : link.target;
                  if (
                    link.type === "hierarchy" &&
                    src === cur &&
                    !childIds.has(tgt)
                  ) {
                    childIds.add(tgt);
                    queue.push(tgt);
                  }
                }
              }

              const positions = gd.nodes
                .filter((n) => childIds.has(n.id) && n.x != null)
                .map((n) => ({ x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }));

              if (positions.length < 2) return;

              const cx =
                positions.reduce((s, p) => s + p.x, 0) / positions.length;
              const cy =
                positions.reduce((s, p) => s + p.y, 0) / positions.length;
              const cz =
                positions.reduce((s, p) => s + p.z, 0) / positions.length;
              const spread = Math.max(
                ...positions.map((p) =>
                  Math.sqrt(
                    (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2,
                  ),
                ),
              );
              const distance = Math.max(60, spread * 3.5);
              fgRef.current?.cameraPosition(
                { x: cx, y: cy, z: cz + distance },
                { x: cx, y: cy, z: cz },
                600,
              );
            }, 600);
          }
        } else if (node.id) {
          onNodeClick(String(node.id));
        }
      },
      [onNodeClick, folders],
    );

    const handleNodeHover = useCallback((node) => {
      hoveredIdRef.current = node?.id != null ? String(node.id) : null;
      document.body.style.cursor = node ? "pointer" : "default";
    }, []);

    return (
      <div className="flex-1 flex flex-col h-full bg-(--color-background)">
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
              <div className="text-5xl mb-3">{"\uD83D\uDD78\uFE0F"}</div>
              <p className="text-sm font-medium" style={{ color: "#6b6457" }}>
                No notes yet
              </p>
              <p className="text-xs mt-1" style={{ color: "#9c9080" }}>
                Create notes to see the graph
              </p>
            </div>
          ) : dims.width > 0 && dims.height > 0 ? (
            <ForceGraph3D
              ref={fgRef}
              graphData={graphData}
              width={dims.width}
              height={dims.height}
              nodeId="id"
              nodeLabel={(node) =>
                node.type === "folder"
                  ? `${node.name} (${node.noteCount})`
                  : (node.name ?? "Untitled")
              }
              nodeColor={() => "transparent"}
              nodeVal={(node) =>
                node.type === "folder" ? (node.expanded ? 6 : 4) : 2
              }
              nodeThreeObject={nodeThreeObject}
              nodeThreeObjectExtend={false}
              linkColor={linkColor}
              linkOpacity={LINK_OPACITY}
              linkWidth={linkWidth}
              linkMaterial={linkMaterial}
              linkPositionUpdate={(line, _coords, link) => {
                // Let the library handle position — we only need computeLineDistances()
                // so Three.js renders the LineDashedMaterial dash pattern correctly.
                if (
                  (link.type === "tag" || link.type === "content") &&
                  typeof line?.computeLineDistances === "function"
                ) {
                  line.computeLineDistances();
                }
                // Return falsy so the library still applies its own position update.
              }}
              backgroundColor={graphBg}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onNodeDrag={() => {
                // Disable OrbitControls while dragging to prevent pointer event conflict
                const ctrl = fgRef.current?.controls?.();
                if (ctrl) ctrl.enabled = false;
              }}
              onNodeDragEnd={(node) => {
                if (!node) return; // guard — library may pass undefined after a cancelled drag
                node.fx = node.x;
                node.fy = node.y;
                node.fz = node.z;
                // Re-enable controls and flush OrbitControls' internal pointer-down
                // state by dispatching a synthetic pointerup on the canvas.
                const ctrl = fgRef.current?.controls?.();
                if (ctrl) ctrl.enabled = true;
                const canvas = fgRef.current?.renderer?.().domElement;
                if (canvas) {
                  canvas.dispatchEvent(
                    new PointerEvent("pointerup", {
                      bubbles: true,
                      pointerId: 1,
                    }),
                  );
                }
              }}
              warmupTicks={0}
              cooldownTicks={1000}
              d3AlphaDecay={0.008}
              d3VelocityDecay={0.7}
              enableNavigationControls={true}
              showNavInfo={false}
              onEngineStop={() => {
                // Unpin simulation — no auto-fit; zoom-to-fit is only user-triggered
              }}
            />
          ) : null}
        </div>
      </div>
    );
  },
);

export default GraphView3D;
