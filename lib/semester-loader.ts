import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSemesterOptions as zjuGetSemesterOptions, ZjuSession, checkSemesterHasCourses } from "@/lib/zju-client";
import { writeLog } from "@/lib/diagnostic-log";
import { resolve } from "path";
export interface SemesterOption {
  yearValue: string;
  termValue: string;
  yearText: string;
  termText: string;
  label: string;
}

let loadingPromise: Promise<SemesterOption[] | null> | null = null;// 全局 Promise 缓存，用于并发去重

/**
 * 加载用户有课的学期列表，并存入 AsyncStorage
 * @param username 用户名
 * @returns 成功返回 SemesterOption[]，失败返回 null
 */
export async function loadActiveSemesters(username: string): Promise<SemesterOption[] | null> {
  // 如果已有正在进行的加载，直接返回同一个 Promise
  if (loadingPromise) {
    return loadingPromise;
  }

  const mergeSemesters = (...semesterSets: SemesterOption[][]): SemesterOption[] => {
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
  };

  loadingPromise = (async () => {
    let cachedSemesters: SemesterOption[] = [];
    try {
      const cached = await AsyncStorage.getItem(`activeSemesters_${username}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          cachedSemesters = parsed.filter(
            (item): item is SemesterOption =>
              item &&
              typeof item.yearValue === "string" &&
              typeof item.termValue === "string" &&
              typeof item.yearText === "string" &&
              typeof item.termText === "string" &&
              typeof item.label === "string"
          );
        }
      }
    } catch (cacheError) {
      writeLog("SCHEDULE", `读取缓存学期列表失败: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`, "error");
    }

    try {
      // 1. 优先发起网络请求
      writeLog("SCHEDULE", "开始网络拉取学期列表", "info");
      const session: ZjuSession = { username, jsessionId: "native", routeCookie: null };
      const opts = await zjuGetSemesterOptions(session);
      const networkSemesters: SemesterOption[] = [];
      for (const yo of opts.yearOptions) {
        for (const to of opts.termOptions) {
          if (await checkSemesterHasCourses(session, yo.value, to.value)) {
            networkSemesters.push({
              yearValue: yo.value,
              termValue: to.value,
              yearText: yo.text,
              termText: to.text,
              label: `${yo.text}学年 ${to.text}学期`,
            });
          }
        }
      }

      const mergedSemesters = mergeSemesters(cachedSemesters, networkSemesters);
      if (mergedSemesters.length > 0) {
        await AsyncStorage.setItem(`activeSemesters_${username}`, JSON.stringify(mergedSemesters));
        writeLog(
          "SCHEDULE",
          `网络拉取成功，缓存与网络结果并集后共 ${mergedSemesters.length} 个有效学期`,
          "info"
        );
        return mergedSemesters;
      }

      writeLog("SCHEDULE", "网络返回有效学期为 0，且缓存为空", "error");
      return null;
    } catch (e) {
      // 2. 网络请求失败，回退到缓存并集
      if (cachedSemesters.length > 0) {
        writeLog("SCHEDULE", `网络拉取失败，返回缓存学期列表: ${cachedSemesters.length} 个`, "warn");
        return cachedSemesters;
      }

      writeLog("SCHEDULE", `加载学期列表失败: ${e instanceof Error ? e.message : String(e)}`, "error");
      return null;
    } finally {
      loadingPromise = null; // 清除缓存，允许下次重新加载
    }
  })();

  return loadingPromise;
}
