/**
 * 出分提醒：比对成绩快照，发现新出分的课程时发通知。
 *
 * - 前台：学业页每次成功拉到全部成绩后调 updateGradeSnapshot()（静默更新，不通知）。
 * - 后台：course-notification 的 background task 每次唤醒时调 checkNewGradesIfDue()，
 *   内部节流（≥2 小时才真正发请求），拉最新成绩与快照比对，有新分则通知。
 * - 无历史快照时只建立快照不通知（避免首次全量误报）。
 *
 * 开关：pref_grade_notify（"0" 关闭，默认开启）。
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { fetchGrade, loadSession, type Grade } from "@/lib/zju-client";

export const GRADE_NOTIFY_PREF_KEY = "pref_grade_notify";
// v2：semester 字段改为从 xkkh 解析后快照键全部变化，换前缀让老快照作废、
// 首轮静默重建（否则升级后所有已出分课程会被误判为"新出分"轰炸一条通知）
const SNAPSHOT_KEY_PREFIX = "gradeSnapshot2_";
const LAST_CHECK_KEY = "grade_check_ts";
const CHECK_INTERVAL_MS = 2 * 3600 * 1000; // 后台检查节流：2 小时

export async function isGradeNotifyEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(GRADE_NOTIFY_PREF_KEY)) !== "0"; } catch { return true; }
}

/** 快照条目键：课程代码 + 学期（同一门课不同学期算不同条目） */
function gradeKey(g: Grade): string {
  return `${g.courseCode}|${g.semester ?? ""}`;
}

/** 只记录已出分的条目 */
function toSnapshot(grades: Grade[]): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const g of grades) {
    const score = g.score?.toString().trim();
    if (score) snap[gradeKey(g)] = score;
  }
  return snap;
}

/**
 * 前台更新快照（学业页拉到成绩后调用）。
 * 前台看到的成绩用户马上就能看见，不需要通知，只同步快照防止后台误报。
 */
export async function updateGradeSnapshot(grades: Grade[]) {
  try {
    const username = await AsyncStorage.getItem("username");
    if (!username) return;
    await AsyncStorage.setItem(SNAPSHOT_KEY_PREFIX + username, JSON.stringify(toSnapshot(grades)));
  } catch { /* 快照失败不影响主流程 */ }
}

/**
 * 后台检查（由 background task 调用）。所有异常静默——后台任务不能被它拖垮。
 */
export async function checkNewGradesIfDue(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!(await isGradeNotifyEnabled())) return;

    const last = parseInt((await AsyncStorage.getItem(LAST_CHECK_KEY)) ?? "0");
    if (Date.now() - last < CHECK_INTERVAL_MS) return;

    const username = await AsyncStorage.getItem("username");
    if (!username) return;

    // 先写时间戳再发请求：即使请求失败也不会在每个 15 分钟唤醒里重试轰炸
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

    const session = await loadSession();
    if (!session) return;

    const { grades } = await fetchGrade(session);
    const fresh = toSnapshot(grades);

    const snapKey = SNAPSHOT_KEY_PREFIX + username;
    const prevRaw = await AsyncStorage.getItem(snapKey);
    await AsyncStorage.setItem(snapKey, JSON.stringify(fresh));

    // 无历史快照：首次建立，不通知
    if (!prevRaw) return;
    const prev: Record<string, string> = JSON.parse(prevRaw);

    const newlyScored = grades.filter(g => {
      const k = gradeKey(g);
      return fresh[k] !== undefined && prev[k] === undefined;
    });
    if (newlyScored.length === 0) return;

    const names = newlyScored.slice(0, 3).map(g => g.courseName).join("、");
    const suffix = newlyScored.length > 3 ? ` 等 ${newlyScored.length} 门课程` : "";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "有新成绩发布 🎉",
        body: `${names}${suffix}已出分，点开查看`,
      },
      trigger: Platform.OS === "android" ? { channelId: "reminders" } : null,
    });
  } catch (e) {
    console.warn("[grade-watcher] 后台检查失败:", e);
  }
}
