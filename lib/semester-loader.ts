import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getSemesterOptions as zjuGetSemesterOptions,
  ZjuSession,
  checkSemesterHasCourses,
} from "@/lib/zju-client";
import { writeLog } from "@/lib/diagnostic-log";

export interface SemesterOption {
  yearValue: string;
  termValue: string;
  yearText: string;
  termText: string;
  label: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 天

// 按用户分别做网络刷新去重，避免同一用户在多个页面同时触发重复请求。
const refreshPromises = new Map<string, Promise<SemesterOption[] | null>>();

function cacheKey(username: string): string {
  return `activeSemesters_${username}`;
}

function refreshTimeKey(username: string): string {
  return `activeSemestersLastRefresh_${username}`;
}

function isSemesterOption(item: unknown): item is SemesterOption {
  if (!item || typeof item !== "object") return false;

  const value = item as Record<string, unknown>;
  return (
    typeof value.yearValue === "string" &&
    typeof value.termValue === "string" &&
    typeof value.yearText === "string" &&
    typeof value.termText === "string" &&
    typeof value.label === "string"
  );
}

function mergeSemesters(...semesterSets: SemesterOption[][]): SemesterOption[] {
  const mergedMap = new Map<string, SemesterOption>();

  for (const semesterSet of semesterSets) {
    for (const semester of semesterSet) {
      const key = `${semester.yearValue}_${semester.termValue}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, semester);
      }
    }
  }

  return Array.from(mergedMap.values());
}

async function readCachedSemesters(username: string): Promise<SemesterOption[]> {
  try {
    const cached = await AsyncStorage.getItem(cacheKey(username));
    if (!cached) return [];

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isSemesterOption);
  } catch (e) {
    writeLog(
      "SCHEDULE",
      `读取缓存学期列表失败: ${e instanceof Error ? e.message : String(e)}`,
      "error",
    );
    return [];
  }
}

/**
 * 从网络刷新学期列表。
 *
 * 已经存在于缓存中的学期不再逐个请求课表，只检查教务网当前提供、
 * 但缓存里尚不存在的候选学期。最终结果与旧缓存取并集，因此偶发网络
 * 异常不会把已经确认过的历史学期删掉。
 */
async function refreshActiveSemesters(
  username: string,
  cachedSemesters: SemesterOption[],
): Promise<SemesterOption[] | null> {
  const existingPromise = refreshPromises.get(username);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      writeLog("SCHEDULE", "开始网络刷新学期列表", "info");

      const session: ZjuSession = {
        username,
        jsessionId: "native",
        routeCookie: null,
      };

      const opts = await zjuGetSemesterOptions(session);

      const knownKeys = new Set(
        cachedSemesters.map(
          semester => `${semester.yearValue}_${semester.termValue}`,
        ),
      );

      const discoveredSemesters: SemesterOption[] = [];

      for (const yo of opts.yearOptions) {
        for (const to of opts.termOptions) {
          const key = `${yo.value}_${to.value}`;

          // 已经确认过的历史学期无需再次请求课表。
          if (knownKeys.has(key)) continue;

          const hasCourses = await checkSemesterHasCourses(
            session,
            yo.value,
            to.value,
          );

          // true = 确定有课；false = 确定没课；null = 网络异常，暂不处理。
          if (hasCourses === true) {
            discoveredSemesters.push({
              yearValue: yo.value,
              termValue: to.value,
              yearText: yo.text,
              termText: to.text,
              label: `${yo.text}学年 ${to.text}学期`,
            });
          }
        }
      }

      const mergedSemesters = mergeSemesters(
        cachedSemesters,
        discoveredSemesters,
      );

      if (mergedSemesters.length === 0) {
        writeLog(
          "SCHEDULE",
          "网络刷新完成，但没有发现有效学期且本地缓存为空",
          "warn",
        );
        return null;
      }

      await AsyncStorage.setItem(
        cacheKey(username),
        JSON.stringify(mergedSemesters),
      );
      await AsyncStorage.setItem(
        refreshTimeKey(username),
        String(Date.now()),
      );

      writeLog(
        "SCHEDULE",
        `学期列表刷新完成，共 ${mergedSemesters.length} 个；本次新增 ${discoveredSemesters.length} 个`,
        "info",
      );

      return mergedSemesters;
    } catch (e) {
      if (cachedSemesters.length > 0) {
        writeLog(
          "SCHEDULE",
          `网络刷新学期列表失败，继续使用缓存: ${cachedSemesters.length} 个`,
          "warn",
        );
        return cachedSemesters;
      }

      writeLog(
        "SCHEDULE",
        `加载学期列表失败: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
      return null;
    }
  })();

  refreshPromises.set(username, promise);

  try {
    return await promise;
  } finally {
    // 只清理当前这一次请求，避免极端情况下误删后来启动的新 Promise。
    if (refreshPromises.get(username) === promise) {
      refreshPromises.delete(username);
    }
  }
}

/**
 * 加载用户有课的学期列表。
 *
 * - 有缓存：立即返回缓存；若缓存刷新时间超过 TTL，则在后台刷新，不阻塞 UI。
 * - 无缓存：首次使用必须等待一次网络扫描。
 * - forceRefresh：用户主动刷新时等待网络刷新完成。
 */
export async function loadActiveSemesters(
  username: string,
  options?: { forceRefresh?: boolean },
): Promise<SemesterOption[] | null> {
  const cachedSemesters = await readCachedSemesters(username);

  if (options?.forceRefresh) {
    return refreshActiveSemesters(username, cachedSemesters);
  }

  if (cachedSemesters.length > 0) {
    writeLog(
      "SCHEDULE",
      `缓存学期列表命中: ${cachedSemesters.length} 个`,
      "info",
    );

    try {
      const lastRefreshRaw = await AsyncStorage.getItem(
        refreshTimeKey(username),
      );
      const lastRefresh = lastRefreshRaw ? Number(lastRefreshRaw) : 0;

      if (
        !Number.isFinite(lastRefresh) ||
        lastRefresh <= 0 ||
        Date.now() - lastRefresh > CACHE_TTL_MS
      ) {
        // 只维护缓存，不阻塞当前页面使用已有学期列表。
        refreshActiveSemesters(username, cachedSemesters).catch(() => {});
      }
    } catch (e) {
      writeLog(
        "SCHEDULE",
        `读取学期列表刷新时间失败: ${e instanceof Error ? e.message : String(e)}`,
        "warn",
      );
    }

    return cachedSemesters;
  }

  // 首次使用没有缓存，只能等待网络获取。
  return refreshActiveSemesters(username, []);
}
