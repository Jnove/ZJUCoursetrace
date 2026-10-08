/**
 * lib/calendar-service.ts
 *
 * 数据优先级（立即返回，后台更新）：
 *   1. 内存缓存       — 最快，进程存活期间有效
 *   2. 磁盘缓存       — AsyncStorage，跨 App 启动保存
 *   3. 内置兜底数据   — 随 App 发版打包，永远可用
 *
 * 后台行为：
 *   - 每个 App / JS 进程生命周期最多自动检查一次远端 calendar.json
 *   - 命中内存缓存 → 立即返回，同时保证本次运行已发起过一次远端检查
 *   - 命中磁盘缓存 → 立即返回，同时后台检查远端
 *   - 磁盘缓存未命中 → 立即返回内置数据，同时后台检查远端
 *   - 后台拉取成功后更新内存 + 磁盘，之后的调用直接使用新数据
 *   - 网络失败不影响课表正常功能
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

const CACHE_KEY = "zjuct_academic_calendar_v1";

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SemesterCalendar {
  holiday: string[];
  exchange: Record<string, string>;
}

export type CalendarData = Record<string, SemesterCalendar>;

interface CacheEntry {
  data: CalendarData;

  /**
   * 保留 fetchedAt 字段以兼容已有磁盘缓存的数据结构。
   * 现在不再用它判断是否需要刷新：
   * 每次 App / JS 进程启动后都会后台检查一次远端数据。
   */
  fetchedAt?: number;
}

// ─── 内置兜底数据 ─────────────────────────────────────────────────────────────
// 随 App 打包发版。每次发版前与仓库 calendar.json 保持同步。

const BUNDLED_CALENDAR: CalendarData = {
  "2025-2026-1": {
    holiday: [
      "2025-10-01",
      "2025-10-02",
      "2025-10-03",
      "2025-10-04",
      "2025-10-05",
      "2025-10-06",
      "2025-10-07",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ],
    exchange: {
      "2025-09-28": "2025-09-29",
      "2025-10-11": "2025-10-09",
      "2026-01-06": "2026-01-01",
      "2026-01-04": "2026-01-02",
    },
  },

  "2025-2026-2": {
    holiday: [
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
      "2026-06-21",
    ],
    exchange: {
      "2026-06-22": "2026-05-04",
      "2026-06-23": "2026-06-19",
    },
  },

  "2026-2027-1": {
    holiday: [
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-12-31",
      "2027-01-01",
    ],
    exchange: {
      "2026-09-20": "2026-10-06",
      "2026-10-10": "2026-10-07",
      "2026-10-17": "2026-10-02",
      "2027-01-04": "2026-12-31",
    },
  },
};

// ─── 内存缓存 ──────────────────────────────────────────────────────────────────

let _mem: CalendarData | null = null;

/**
 * 本次 App / JS 进程是否已经尝试检查过远端 calendar.json。
 *
 * 模块在 App 冷启动 / JS 进程重建后会重新加载，因此会恢复为 false，
 * 从而保证每次新的运行周期都会检查一次远端。
 */
let _remoteCheckedThisSession = false;

/**
 * 防止多个 loadCalendarData() 几乎同时调用时发出重复网络请求。
 */
let _remoteFetchInFlight = false;

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

export function toCalendarKey(
  yearValue: string,
  termValue: string
): string {
  return `${yearValue}-${termValue.split("|")[0]}`;
}

export function semesterInfoToCalendarKey(
  schoolYear: string,
  semester: string
): string {
  return `${schoolYear}-${
    semester === "春" || semester === "夏" ? "2" : "1"
  }`;
}

// ─── 后台拉取（fire-and-forget）───────────────────────────────────────────────

/**
 * 后台检查远端 calendar.json。
 *
 * 默认情况下，每个 App / JS 进程生命周期只自动检查一次。
 * force = true 时允许再次检查远端。
 *
 * 如果已经有请求正在进行，则不会重复发起请求。
 */
function fetchAndCache(force = false): void {
  if (_remoteFetchInFlight) return;

  if (_remoteCheckedThisSession && !force) return;

  _remoteCheckedThisSession = true;
  _remoteFetchInFlight = true;

  fetch(CALENDAR_URL)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json() as Promise<CalendarData>;
    })
    .then((data) => {
      // 更新内存缓存。
      // 当前页面如果已经拿到了旧对象，不会自动重新渲染；
      // 但之后调用 loadCalendarData() 时会直接得到这里的新数据。
      _mem = data;

      // 同步写入磁盘，供下一次 App 启动立即使用。
      return AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          data,
          fetchedAt: Date.now(),
        })
      );
    })
    .then(() => {
      console.log("[Calendar] 远程校历检查完成，缓存已更新");
    })
    .catch((e) => {
      // 网络失败不影响当前使用的内存 / 磁盘 / 内置数据。
      console.warn(
        "[Calendar] 远程校历检查失败（继续使用当前缓存）:",
        e
      );
    })
    .finally(() => {
      _remoteFetchInFlight = false;
    });
}

// ─── 主加载函数 ───────────────────────────────────────────────────────────────

/**
 * 立即返回当前最佳可用数据，同时按需在后台检查远端。
 *
 * 数据优先级：
 *   内存 → 磁盘 → 内置兜底
 *
 * 正常情况下：
 *   每个 App / JS 进程生命周期只自动检查一次远端 calendar.json。
 *
 * forceRefresh = true：
 *   无视“本次运行已经检查过”的标记，再次发起一次远端检查。
 *   为了不阻塞课表显示，本函数仍然立即返回当前可用数据，
 *   网络请求在后台完成。
 *
 * 永不返回 null —— 至少会返回 BUNDLED_CALENDAR。
 */
export async function loadCalendarData(
  forceRefresh = false
): Promise<CalendarData> {
  // ── 1. 已有内存缓存 ───────────────────────────────────────────────────────
  //
  // 立即返回。
  // 第一次调用时顺便在后台检查远端；
  // 后续调用不会重复发网络请求。
  if (_mem) {
    fetchAndCache(forceRefresh);
    return _mem;
  }

  // ── 2. 尝试读取磁盘缓存 ───────────────────────────────────────────────────
  //
  // forceRefresh 并不意味着“不使用缓存”，而是要求重新检查远端。
  // 在等待网络期间仍然应该优先显示已有磁盘数据。
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);

    if (raw) {
      const entry: CacheEntry = JSON.parse(raw);

      if (entry?.data) {
        _mem = entry.data;

        // 无论磁盘缓存是什么时候保存的，
        // 本次 App 运行都后台检查一次远端。
        fetchAndCache(forceRefresh);

        return _mem;
      }
    }
  } catch (e) {
    console.warn(
      "[Calendar] 读取本地校历缓存失败（使用内置数据）:",
      e
    );
  }

  // ── 3. 没有可用磁盘缓存：使用内置兜底 ─────────────────────────────────────
  _mem = BUNDLED_CALENDAR;

  // 同时后台检查远端。
  fetchAndCache(forceRefresh);

  return _mem;
}

// ─── 查询函数 ──────────────────────────────────────────────────────────────────

export function resolveEffectiveDate(
  cal: SemesterCalendar | null | undefined,
  date: Date
): Date | null {
  if (!cal) return date;

  const ds = toDateStr(date);

  // Remote calendar.json may be malformed / missing keys — guard every access.
  if ((cal.holiday ?? []).includes(ds)) {
    return null;
  }

  const ref = (cal.exchange ?? {})[ds];

  if (ref) {
    return new Date(`${ref}T00:00:00`);
  }

  return date;
}

export function isHoliday(
  cal: SemesterCalendar | null | undefined,
  date: Date
): boolean {
  if (!cal) return false;

  return (cal.holiday ?? []).includes(toDateStr(date));
}

export function getExchangeRef(
  cal: SemesterCalendar | null | undefined,
  date: Date
): string | null {
  if (!cal) return null;

  return (cal.exchange ?? {})[toDateStr(date)] ?? null;
}