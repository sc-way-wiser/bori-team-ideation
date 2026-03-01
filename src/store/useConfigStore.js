import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase.js";
import {
  CONFIG_DEFAULTS,
  fetchConfig,
  upsertConfig,
  deleteConfig,
} from "../services/configService.js";

// Debounce for remote saves
let saveTimeout = null;
function scheduleSave(config, userId) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => upsertConfig(config, userId), 600);
}

export const useConfigStore = create(
  persist(
    (set, get) => ({
      ...CONFIG_DEFAULTS,
      isLoaded: false,
      // Device-local only — never synced to Supabase
      // null = auto (time-based), "day" = force light, "night" = force dark
      themeOverride: null,

      setThemeOverride: (override) => set({ themeOverride: override }),

      // ── Load from Supabase ─────────────────────────────────────────────
      loadConfig: async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const remote = await fetchConfig(user.id);
        set({ ...remote, isLoaded: true });
      },

      // ── Update one or more fields ──────────────────────────────────────
      updateConfig: (partial) => {
        set((state) => {
          const next = { ...state, ...partial };
          // Schedule remote save (skip non-config keys like isLoaded)
          const {
            isLoaded: _isLoaded,
            themeOverride: _to,
            loadConfig: _lc,
            updateConfig: _uc,
            resetConfig: _rc,
            setThemeOverride: _sto,
            ...configOnly
          } = next;
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.id) scheduleSave(configOnly, user.id);
          });
          return next;
        });
      },

      // ── Reset to defaults ──────────────────────────────────────────────
      resetConfig: async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) await deleteConfig(user.id);
        set({ ...CONFIG_DEFAULTS, isLoaded: true });
      },
    }),
    {
      name: "bori-ideation-config",
      partialize: (state) => {
        // Persist all except functions
        const { loadConfig, updateConfig, resetConfig, ...rest } = state;
        return rest;
      },
    },
  ),
);
