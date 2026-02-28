import { useState } from "react";
import {
  XIcon,
  FloppyDiskIcon as SaveIcon,
  ArrowCounterClockwiseIcon as ResetIcon,
  PaintBucketIcon,
  TextTIcon,
  GraphIcon,
  GearIcon,
  SlidersHorizontalIcon as SlidersIcon,
} from "@phosphor-icons/react";
import { useConfigStore } from "../../store/useConfigStore.js";
import Select from "../ui/Select.jsx";

// ── Small helpers ─────────────────────────────────────────────────────────────
const Section = ({ icon, title, children }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-(--color-border)">
      <span className="text-(--color-primary-dk)">{icon}</span>
      <h3 className="text-sm font-semibold text-(--color-text)">{title}</h3>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Row = ({ label, hint, children }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="flex-1 min-w-0">
      <label className="text-sm text-(--color-text)">{label}</label>
      {hint && (
        <p className="text-xs text-(--color-text-muted) mt-0.5">{hint}</p>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Toggle = ({ checked, onChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
      checked ? "bg-(--color-primary)" : "bg-(--color-border)"
    }`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

const NumberInput = ({ value, onChange, min, max, step = 1, unit }) => (
  <div className="flex items-center gap-1">
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-20 h-8 px-2 rounded text-sm bg-(--color-input) border border-(--color-border) text-(--color-text) outline-none hover:border-(--color-primary) transition-colors text-right"
    />
    {unit && <span className="text-xs text-(--color-text-muted)">{unit}</span>}
  </div>
);

const ColorSwatch = ({ value, onChange }) => (
  <label className="flex items-center gap-1.5 cursor-pointer">
    <span
      className="w-6 h-6 rounded border border-(--color-border) shrink-0"
      style={{ backgroundColor: value }}
    />
    <span className="text-xs font-mono text-(--color-text-sec)">{value}</span>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sr-only"
    />
  </label>
);

// ── Main Settings panel ───────────────────────────────────────────────────────
const Settings = ({ onClose }) => {
  const store = useConfigStore();
  // Work on a local draft so user can cancel unsaved changes
  const [draft, setDraft] = useState(() => {
    const { isLoaded, loadConfig, updateConfig, resetConfig, ...cfg } = store;
    return cfg;
  });
  const [saved, setSaved] = useState(false);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    store.updateConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleReset = async () => {
    if (!confirm("Reset all settings to defaults?")) return;
    await store.resetConfig();
    const { isLoaded, loadConfig, updateConfig, resetConfig, ...cfg } =
      useConfigStore.getState();
    setDraft(cfg);
  };

  return (
    <div className="flex flex-col h-full bg-(--color-surface)">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-border) shrink-0">
        <div className="flex items-center gap-2">
          <GearIcon size={18} className="text-(--color-primary-dk)" />
          <h2 className="text-sm font-semibold text-(--color-text)">
            Settings
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-hover) transition-colors"
        >
          <XIcon size={18} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {/* ── Appearance ── */}
        <Section icon={<PaintBucketIcon size={16} />} title="Appearance">
          <Row label="Theme">
            <Select
              value={draft.theme}
              onChange={(v) => set("theme", v)}
              bottomSheetTitle="Theme"
              showBottomSheetHeader
              bottomSheetMinHeight="auto"
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Row>
          <Row
            label="Accent colour"
            hint="Primary brand colour throughout the UI"
          >
            <ColorSwatch
              value={draft.accentColor}
              onChange={(v) => set("accentColor", v)}
            />
          </Row>
          <Row
            label="Default sidebar open"
            hint="Show the sidebar by default on load"
          >
            <Toggle
              checked={draft.sidebarDefaultOpen}
              onChange={(v) => set("sidebarDefaultOpen", v)}
            />
          </Row>
          <Row label="Sidebar width">
            <NumberInput
              value={draft.sidebarWidthPx}
              onChange={(v) => set("sidebarWidthPx", v)}
              min={180}
              max={480}
              step={10}
              unit="px"
            />
          </Row>
        </Section>

        {/* ── Editor ── */}
        <Section icon={<TextTIcon size={16} />} title="Editor">
          <Row
            label="Auto-save delay"
            hint="Time after you stop typing before saving to the database"
          >
            <NumberInput
              value={draft.autoSaveDelayMs}
              onChange={(v) => set("autoSaveDelayMs", v)}
              min={200}
              max={5000}
              step={100}
              unit="ms"
            />
          </Row>
          <Row label="Default font size">
            <Select
              value={draft.defaultFontSize}
              onChange={(v) => set("defaultFontSize", v)}
              bottomSheetTitle="Default font size"
              showBottomSheetHeader
              bottomSheetMinHeight="auto"
              options={[
                "11px",
                "12px",
                "13px",
                "14px",
                "15px",
                "16px",
                "18px",
                "20px",
              ].map((s) => ({ value: s, label: s }))}
            />
          </Row>
          <Row
            label="Auto-delete empty notes"
            hint="Remove a note automatically when you click away if it has no title, content, or tags"
          >
            <Toggle
              checked={draft.autoDeleteEmptyNotes}
              onChange={(v) => set("autoDeleteEmptyNotes", v)}
            />
          </Row>
          <Row
            label="Enable [[mentions]]"
            hint="Show note-link suggestions while typing"
          >
            <Toggle
              checked={draft.enableMentions}
              onChange={(v) => set("enableMentions", v)}
            />
          </Row>
          <Row label="Enable tags">
            <Toggle
              checked={draft.enableTags}
              onChange={(v) => set("enableTags", v)}
            />
          </Row>
        </Section>

        {/* ── Graph View ── */}
        <Section icon={<GraphIcon size={16} />} title="Graph View">
          <Row label="Enable Graph View">
            <Toggle
              checked={draft.enableGraphView}
              onChange={(v) => set("enableGraphView", v)}
            />
          </Row>
          <Row label="Show node labels">
            <Toggle
              checked={draft.graphShowLabels}
              onChange={(v) => set("graphShowLabels", v)}
            />
          </Row>
          <Row label="Node colour">
            <ColorSwatch
              value={draft.graphNodeColor}
              onChange={(v) => set("graphNodeColor", v)}
            />
          </Row>
          <Row label="Edge colour" hint="Default relationship edge">
            <ColorSwatch
              value={draft.graphEdgeColor}
              onChange={(v) => set("graphEdgeColor", v)}
            />
          </Row>
          <Row label="Link colour" hint="[[wiki-link]] edge">
            <ColorSwatch
              value={draft.graphLinkColor}
              onChange={(v) => set("graphLinkColor", v)}
            />
          </Row>
          <Row label="Node size">
            <NumberInput
              value={draft.graphNodeSize}
              onChange={(v) => set("graphNodeSize", v)}
              min={3}
              max={20}
              unit="px"
            />
          </Row>
          <Row label="Force charge" hint="Negative = repel, positive = attract">
            <NumberInput
              value={draft.graphCharge}
              onChange={(v) => set("graphCharge", v)}
              min={-500}
              max={0}
              step={10}
            />
          </Row>
        </Section>

        {/* ── Similarity / AI ── */}
        <Section icon={<SlidersIcon size={16} />} title="Similarity">
          <Row
            label="Enable similarity"
            hint="Show related notes based on content overlap"
          >
            <Toggle
              checked={draft.enableSimilarity}
              onChange={(v) => set("enableSimilarity", v)}
            />
          </Row>
          <Row
            label="Similarity threshold"
            hint="Minimum score (0–1) for a note to appear as related"
          >
            <NumberInput
              value={draft.similarityThreshold}
              onChange={(v) =>
                set("similarityThreshold", Math.min(1, Math.max(0, v)))
              }
              min={0}
              max={1}
              step={0.05}
            />
          </Row>
        </Section>

        {/* ── Notes ── */}
        <Section icon={<GearIcon size={16} />} title="Notes">
          <Row label="Default note visibility">
            <Toggle
              checked={draft.defaultNoteVisibility}
              onChange={(v) => set("defaultNoteVisibility", v)}
            />
          </Row>
        </Section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-(--color-border) shrink-0">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-(--color-text-muted) hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <ResetIcon size={14} /> Reset to defaults
        </button>
        <button
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium transition-colors ${
            saved
              ? "bg-green-100 text-green-700"
              : "bg-(--color-primary) text-(--color-primary-dk) hover:bg-(--color-primary-hv)"
          }`}
        >
          <SaveIcon size={14} />
          {saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default Settings;
