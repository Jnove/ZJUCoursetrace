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
 * Assigns palette colours so no two adjacent course blocks share the same colour,
 * while guaranteeing that courses with the same name always share the same colour
 * and maximising the number of distinct palette colours actually used.
 *
 * Algorithm (name-level graph colouring):
 *   1. Group items by name – one colour per unique name.
 *   2. Build a name-level adjacency graph: two names are adjacent if any of their
 *      course instances are on the same/neighbouring day and their periods touch.
 *   3. Sort names by degree descending (most-constrained first).
 *   4. For each name pick the *least-used* available colour, falling back to a
 *      palette-index tiebreaker so the spread is stable across re-renders.
 *
 * Returns a new array (order preserved) with an added `color` field on every item.
 */
export function assignColors<T extends ColorableItem>(
  items: T[],
  palette?: string[],
): (T & { color: string })[] {
  const usedPalette = palette ?? getActivePalette();
  if (items.length === 0) return [];

  //1. Group items by course name
  const nameToItems = new Map<string, T[]>();
  for (const item of items) {
    if (!nameToItems.has(item.name)) nameToItems.set(item.name, []);
    nameToItems.get(item.name)!.push(item);
  }
  const uniqueNames = Array.from(nameToItems.keys());

  //2. Build name-level adjacency graph
  const nameAdj = new Map<string, Set<string>>();
  for (const name of uniqueNames) nameAdj.set(name, new Set());

  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const nameA = uniqueNames[i];
      const nameB = uniqueNames[j];
      const itemsA = nameToItems.get(nameA)!;
      const itemsB = nameToItems.get(nameB)!;

      let adjacent = false;
      outer: for (const a of itemsA) {
        for (const b of itemsB) {
          if (Math.abs(a.dayOfWeek - b.dayOfWeek) > 1) continue;
          if (
            a.startPeriod <= b.endPeriod + 1 &&
            b.startPeriod <= a.endPeriod + 1
          ) {
            adjacent = true;
            break outer;
          }
        }
      }

      if (adjacent) {
        nameAdj.get(nameA)!.add(nameB);
        nameAdj.get(nameB)!.add(nameA);
      }
    }
  }

  //3. Sort names: most-constrained (highest degree) firs
  const sortedNames = [...uniqueNames].sort(
    (a, b) => nameAdj.get(b)!.size - nameAdj.get(a)!.size,
  );

  // 4. Assign colours greedily, always choosing the least-used available 
  const nameColorMap = new Map<string, string>();
  // Track how many times each palette colour has been assigned
  const colorUsage = new Map<string, number>(usedPalette.map(c => [c, 0]));

  for (const name of sortedNames) {
    // Collect colours already used by adjacent names
    const forbidden = new Set<string>();
    for (const adjName of nameAdj.get(name)!) {
      const c = nameColorMap.get(adjName);
      if (c) forbidden.add(c);
    }

    const available = usedPalette.filter(c => !forbidden.has(c));

    let chosen: string;
    if (available.length === 0) {
      // If no valid colour exists (graph needs more colours than palette has)，fall back to a deterministic hash so the same name always gets the same colour.
      const h = Math.abs(
        name.split("").reduce((acc, ch) => (acc << 5) - acc + ch.charCodeAt(0), 0),
      );
      chosen = usedPalette[h % usedPalette.length];
    } else {
      // Pick the least-used available colour.
      // Use palette index as a stable tiebreaker: prefer the colour that appears later in the palette so we cycle forward through all colours before repeating.
      chosen = available.reduce((best, c) => {
        const cu = colorUsage.get(c) ?? 0;
        const bu = colorUsage.get(best) ?? 0;
        if (cu !== bu) return cu < bu ? c : best;
        // prefer the colour with a higher palette index to cycle evenly through the whole palette.
        return usedPalette.indexOf(c) > usedPalette.indexOf(best) ? c : best;
      });
    }

    nameColorMap.set(name, chosen);
    colorUsage.set(chosen, (colorUsage.get(chosen) ?? 0) + 1);
  }

  // ── 5. Stamp every item with its name's colour (order preserved) ──────────
  return items.map(item => ({
    ...item,
    color: nameColorMap.get(item.name) ?? usedPalette[0],
  }));
}