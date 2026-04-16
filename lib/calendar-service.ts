/**
 * lib/calendar-service.ts
 *
 * 数据优先级（全部同步返回，后台更新）：
 *   1. 内存缓存       — 最快，进程存活期间有效
 *   2. 磁盘缓存       — AsyncStorage，24 小时有效
 *   3. 内置兜底数据   — 随 App 发版打包，永远可用
 *
 * 后台行为：
 *   - 磁盘缓存命中但已过期 → 立即返回旧数据，同时后台拉取
 *   - 磁盘缓存未命中       → 立即返回内置数据，同时后台拉取
 *   - 后台拉取成功后更新内存 + 磁盘，下次调用即用新数据
 *   - 网络失败完全静默，不影响课表正常功能
 *
 * calendar.json 格式（放仓库根目录，通过 GitHub raw 访问）：
 * {
 *   "2025-2026-1": {
 *     "holiday": ["2025-10-01", ..., "2025-10-07"],
 *     "exchange": {
 *       "2025-09-28": "2025-09-29",
 *       "2025-10-11": "2025-10-09"
 *     }
 *   },
 *   "2025-2026-2": { ... }
 * }
 *
 * key 规则（与活跃学期列表对应）：
 *   yearValue "2025-2026" + termValue "1|秋" or "1|冬" → "2025-2026-1"
 *   yearValue "2025-2026" + termValue "2|春" or "2|夏" → "2025-2026-2"
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const CALENDAR_URL =
  "https://raw.githubusercontent.com/Jnove/ZJUCoursetrace/main/calendar.json";

const CACHE_KEY    = "zjuct_academic_calendar_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SemesterCalendar {
  holiday: string[];
  exchange: Record<string, string>;
}

export type CalendarData = Record<string, SemesterCalendar>;

interface CacheEntry {
  data: CalendarData;
  fetchedAt: number;
}

// ─── 内置兜底数据 ─────────────────────────────────────────────────────────────
// 随 App 打包发版。每次发版前与仓库 calendar.json 保持同步。

const BUNDLED_CALENDAR: CalendarData = {
  "2025-2026-1": {
    "holiday": [
      "2025-10-01",
      "2025-10-02",
      "2025-10-03",
      "2025-10-04",
      "2025-10-05",
      "2025-10-06",
      "2025-10-07",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03"
    ],
    "exchange": {
      "2025-09-28": "2025-09-29",
      "2025-10-11": "2025-10-09",
      "2026-01-06": "2026-01-01",
      "2026-01-04": "2026-01-02"
    }
  },

  "2025-2026-2": {
    "holiday": [
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21"
    ],
    "exchange": {
      "2026-06-22": "2026-05-04",
      "2026-06-23": "2026-06-19"
    }
  }
};

// ─── 内存缓存 ──────────────────────────────────────────────────────────────────

let _mem: CalendarData | null = null;

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

export function toCalendarKey(yearValue: string, termValue: string): string {
  return `${yearValue}-${termValue.split("|")[0]}`;
}

export function semesterInfoToCalendarKey(schoolYear: string, semester: string): string {
  return `${schoolYear}-${semester === "春" || semester === "夏" ? "2" : "1"}`;
}

// ─── 后台拉取（fire-and-forget）───────────────────────────────────────────────

function fetchAndCache(): void {
  fetch(CALENDAR_URL)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<CalendarData>;
    })
    .then(data => {
      _mem = data;
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() })).catch(() => {});
      console.log("[Calendar] 远程更新成功");
    })
    .catch(e => console.warn("[Calendar] 远程更新失败（使用兜底数据）:", e));
}

// ─── 主加载函数 ───────────────────────────────────────────────────────────────

/**
 * 立即返回最佳可用数据，后台静默刷新。
 * 永不返回 null — 至少返回内置兜底数据。
 */
export async function loadCalendarData(forceRefresh = false): Promise<CalendarData> {
  if (_mem && !forceRefresh) return _mem;

  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const entry: CacheEntry = JSON.parse(raw);
        _mem = entry.data;
        if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) fetchAndCache();
        return _mem;
      }
    } catch {}
  }

  // 无磁盘缓存或强制刷新：用内置数据兜底，后台拉取
  if (!_mem) _mem = BUNDLED_CALENDAR;
  fetchAndCache();
  return _mem;
}

// ─── 查询函数 ──────────────────────────────────────────────────────────────────

export function resolveEffectiveDate(
  cal: SemesterCalendar | null | undefined,
  date: Date
): Date | null {
  if (!cal) return date;
  const ds = toDateStr(date);
  if (cal.holiday.includes(ds)) return null;
  const ref = cal.exchange[ds];
  if (ref) return new Date(`${ref}T00:00:00`);
  return date;
}

export function isHoliday(cal: SemesterCalendar | null | undefined, date: Date): boolean {
  if (!cal) return false;
  return cal.holiday.includes(toDateStr(date));
}

export function getExchangeRef(cal: SemesterCalendar | null | undefined, date: Date): string | null {
  if (!cal) return null;
  return cal.exchange[toDateStr(date)] ?? null;
}