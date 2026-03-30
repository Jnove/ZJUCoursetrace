import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSemesterOptions as zjuGetSemesterOptions, ZjuSession, checkSemesterHasCourses } from "@/lib/zju-client";
import { writeLog } from "@/lib/diagnostic-log";

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

  loadingPromise = (async () => {
    try {
      // 1. 优先读取缓存
      const cached = await AsyncStorage.getItem(`activeSemesters_${username}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.length > 0) {
          writeLog("SCHEDULE", `缓存学期列表命中: ${parsed.length} 个`, "info");
          return parsed;
        }
      }

      // 2. 缓存无效，发起网络请求
      writeLog("SCHEDULE", "缓存不存在或为空，开始网络拉取学期列表", "info");
      const session: ZjuSession = { username, jsessionId: "native", routeCookie: null };
      const opts = await zjuGetSemesterOptions(session);

      const allSemesters: SemesterOption[] = [];
      for (const yo of opts.yearOptions) {
        for (const to of opts.termOptions) {
          if (await checkSemesterHasCourses(session, yo.value, to.value)) {
            allSemesters.push({
              yearValue: yo.value,
              termValue: to.value,
              yearText: yo.text,
              termText: to.text,
              label: `${yo.text}学年 ${to.text}学期`,
            });
          }
        }
      }

      if (allSemesters.length > 0) {
        await AsyncStorage.setItem(`activeSemesters_${username}`, JSON.stringify(allSemesters));
        writeLog("SCHEDULE", `网络拉取成功，共 ${allSemesters.length} 个有效学期`, "info");
        return allSemesters;
      } else {
        writeLog("SCHEDULE", "网络返回有效学期为 0", "error");
        return null;
      }
    } catch (e) {
      writeLog("SCHEDULE", `加载学期列表失败: ${e instanceof Error ? e.message : String(e)}`, "error");
      return null;
    } finally {
      loadingPromise = null; // 清除缓存，允许下次重新加载
    }
  })();

  return loadingPromise;
}
