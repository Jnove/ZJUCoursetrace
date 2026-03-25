/**
 * lib/course-palette.ts
 *
 * Palette definitions and the graph-colouring algorithm that turns a list
 * of raw courses into coloured Course objects.
 *
 * Palette is kept in a module-level variable so it can be read synchronously
 * from anywhere (no React hook required).  ThemeProvider hydrates it from
 * AsyncStorage at startup and updates it whenever the user picks a new palette.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaletteKey = "classic" | "cool" | "warm" | "morandi" | "candy";

export interface CoursePalette {
  key:     PaletteKey;
  name:    string;
  desc:    string;
  colors:  string[];   // 20-colour array used by graph coloring
  preview: string[];   // 6 representative swatches for the UI
}

// ─── Palette definitions ──────────────────────────────────────────────────────
export const DEFAULT_PALETTE_KEY: PaletteKey = "classic";
export const COURSE_PALETTES: Record<PaletteKey, CoursePalette> = {
  classic: {
    key:  "classic",
    name: "默认多彩",
    desc: "高饱和多色，对比鲜明",
    colors: [
      "#ef4444","#3b82f6","#22c55e","#f97316","#8b5cf6",
      "#06b6d4","#ec4899","#14b8a6","#a855f7","#84cc16",
      "#0ea5e9","#f43f5e","#10b981","#6366f1","#d97706",
      "#0891b2","#7c3aed","#059669","#db2777","#65a30d",
    ],
    preview: ["#ef4444","#3b82f6","#22c55e","#f97316","#8b5cf6","#06b6d4"],
  },

  cool: {
    key:  "cool",
    name: "冷色调",
    desc: "蓝紫青绿，沉静专注",
    colors: [
      "#3b82f6","#06b6d4","#8b5cf6","#0ea5e9","#6366f1",
      "#14b8a6","#0891b2","#7c3aed","#10b981","#22c55e",
      "#059669","#4f46e5","#0284c7","#0d9488","#047857",
      "#2563eb","#7e22ce","#0369a1","#115e59","#166534",
    ],
    preview: ["#3b82f6","#06b6d4","#8b5cf6","#0ea5e9","#6366f1","#14b8a6"],
  },

  warm: {
    key:  "warm",
    name: "暖色调",
    desc: "红橙粉黄，活力热情",
    colors: [
      "#ef4444","#f97316","#ec4899","#f43f5e","#d97706",
      "#db2777","#b45309","#dc2626","#ea580c","#e11d48",
      "#c2410c","#be185d","#a21caf","#9d174d","#92400e",
      "#f59e0b","#e879f9","#fb923c","#fb7185","#fbbf24",
    ],
    preview: ["#ef4444","#f97316","#ec4899","#f43f5e","#d97706","#db2777"],
  },

  morandi: {
    key:  "morandi",
    name: "莫兰迪",
    desc: "低饱和灰调，柔和优雅",
    colors: [
      "#9b8ea0","#8fa3b1","#a8b8a8","#c4a882","#b3a090",
      "#89a0ae","#b5a3b5","#a3b09a","#b8a9a9","#9aaeae",
      "#b0a3b5","#a9b5a3","#b5b0a3","#a3a9b5","#aab5a9",
      "#96a0aa","#aa96a0","#a0aa96","#aaa096","#96aaa0",
    ],
    preview: ["#9b8ea0","#8fa3b1","#a8b8a8","#c4a882","#b3a090","#89a0ae"],
  },

  candy: {
    key:  "candy",
    name: "糖果",
    desc: "明亮粉彩，清新可爱",
    colors: [
      "#fb7185","#f472b6","#a78bfa","#60a5fa","#34d399",
      "#fbbf24","#fb923c","#e879f9","#4ade80","#38bdf8",
      "#f9a8d4","#c084fc","#86efac","#7dd3fc","#fcd34d",
      "#fdba74","#f0abfc","#6ee7b7","#93c5fd","#fde68a",
    ],
    preview: ["#fb7185","#f472b6","#a78bfa","#60a5fa","#34d399","#fbbf24"],
  },
};

export const PALETTE_ORDER: PaletteKey[] = ["classic", "cool", "warm", "morandi", "candy"];

// ─── Module-level active palette (sync access) ────────────────────────────────

const STORAGE_KEY = "pref_course_palette";

let _activeKey: PaletteKey = "classic";

/** Call once at app startup (ThemeProvider does this). */
export async function loadCoursePalette(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && stored in COURSE_PALETTES) {
      _activeKey = stored as PaletteKey;
    }
  } catch {}
}

/** Persist and immediately switch the active palette. */
export async function saveCoursePalette(key: PaletteKey): Promise<void> {
  _activeKey = key;
  try { await AsyncStorage.setItem(STORAGE_KEY, key); } catch {}
}

export function getActivePaletteKey(): PaletteKey {
  return _activeKey;
}

export function getActivePalette(): string[] {
  return COURSE_PALETTES[_activeKey].colors;
}

// ─── Graph-colouring ──────────────────────────────────────────────────────────
//
// RawCourse is any object that has the fields we need for layout comparison.
// We keep it generic so schedule-context can use its own RawCourse type.

export interface ColorableItem {
  id:          string;
  name:        string;
  dayOfWeek:   number;
  startPeriod: number;
  endPeriod:   number;
}


export async function updateActivePalette(key: PaletteKey) {
  _activeKey = key;
  await AsyncStorage.setItem(STORAGE_KEY, key);
}

/**
 * Assigns palette colours so no two adjacent course blocks share the same colour.
 * "Adjacent" means same day OR neighbouring days AND periods overlap / touch.
 *
 * Returns a new array with an added `color` field on every item.
 */
export function assignColors<T extends ColorableItem>(
  items: T[],
  palette?: string[],
): (T & { color: string })[] {
  const usedPalette = palette ?? getActivePalette();
  if (items.length === 0) return [];

  const colorMap = new Map<string, string>();

  const sorted = [...items].sort((a, b) =>
    a.dayOfWeek !== b.dayOfWeek   ? a.dayOfWeek   - b.dayOfWeek
    : a.startPeriod !== b.startPeriod ? a.startPeriod - b.startPeriod
    : a.name.localeCompare(b.name)
  );

  for (const item of sorted) {
    const used = new Set<string>();

    for (const other of sorted) {
      if (other.id === item.id) continue;
      const assigned = colorMap.get(other.id);
      if (!assigned) continue;
      if (Math.abs(item.dayOfWeek - other.dayOfWeek) > 1) continue;
      const touches =
        item.startPeriod <= other.endPeriod   + 1 &&
        other.startPeriod <= item.endPeriod   + 1;
      if (touches) used.add(assigned);
    }

    const color =
      usedPalette.find(c => !used.has(c)) ??
      usedPalette[
        Math.abs(item.name.split("").reduce((h, ch) => (h << 5) - h + ch.charCodeAt(0), 0)) %
        usedPalette.length
      ];

    colorMap.set(item.id, color);
  }

  return sorted.map(item => ({ ...item, color: colorMap.get(item.id)! }));
}