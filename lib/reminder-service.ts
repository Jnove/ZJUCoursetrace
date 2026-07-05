/**
 * 作业 DDL / 考试倒计时本地提醒。
 *
 * 学业页每次成功拉取作业/考试后调用 syncHomeworkReminders / syncExamReminders：
 * 先取消上一轮排的通知（id 列表存 AsyncStorage，pref_ 前缀防清缓存误删），
 * 再按「截止/开考前 24 小时 + 前 2 小时」重新安排，只排未来的时间点。
 *
 * 开关：pref_reminders（"0" 关闭，默认开启）。关闭时同步会清掉已排通知。
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { ExamInfo, HomeworkInfo } from "@/lib/zju-client";

export const REMINDER_PREF_KEY = "pref_reminders";
const IDS_KEY = "pref_reminder_ids_v1";
const CHANNEL_ID = "reminders";

interface StoredIds { hw: string[]; exam: string[] }

async function loadIds(): Promise<StoredIds> {
  try {
    const raw = await AsyncStorage.getItem(IDS_KEY);
    return raw ? JSON.parse(raw) : { hw: [], exam: [] };
  } catch {
    return { hw: [], exam: [] };
  }
}

async function saveIds(ids: StoredIds) {
  await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids)).catch(() => {});
}

export async function isReminderEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(REMINDER_PREF_KEY)) !== "0"; } catch { return true; }
}

/** 提醒渠道（普通优先级，有横幅）；App 启动时随 setupNotificationChannel 一起调用 */
export async function setupReminderChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "作业与考试提醒",
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});
}

async function cancelIds(ids: string[]) {
  await Promise.all(ids.map(id =>
    Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
  ));
}

async function scheduleAt(title: string, body: string, date: Date): Promise<string | null> {
  if (date.getTime() <= Date.now()) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: Platform.OS === "android"
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch {
    return null;
  }
}

/** 提前量：24 小时与 2 小时 */
const OFFSETS: { ms: number; label: string }[] = [
  { ms: 24 * 3600 * 1000, label: "24 小时" },
  { ms: 2 * 3600 * 1000, label: "2 小时" },
];

// ─── 作业 ─────────────────────────────────────────────────────────────────────

export async function syncHomeworkReminders(homeworks: HomeworkInfo[]) {
  if (Platform.OS === "web") return;
  const ids = await loadIds();
  await cancelIds(ids.hw);
  ids.hw = [];

  if (await isReminderEnabled()) {
    for (const hw of homeworks) {
      if (hw.submitted || !hw.deadlineIso) continue;
      const ddl = new Date(hw.deadlineIso);
      if (isNaN(ddl.getTime())) continue;
      for (const off of OFFSETS) {
        const id = await scheduleAt(
          `作业将在 ${off.label}后截止`,
          `${hw.courseName}《${hw.title}》· 截止 ${hw.deadline}`,
          new Date(ddl.getTime() - off.ms),
        );
        if (id) ids.hw.push(id);
      }
    }
  }
  await saveIds(ids);
}

// ─── 考试 ─────────────────────────────────────────────────────────────────────

/** 解析 zdbk 考试时间，如 "2026年01月15日(08:00-10:00)"，取开考时刻 */
export function parseExamStart(examTime: string): Date | null {
  const d = examTime.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!d) return null;
  const t = examTime.match(/(\d{1,2}):(\d{2})/);
  const date = new Date(
    parseInt(d[1]), parseInt(d[2]) - 1, parseInt(d[3]),
    t ? parseInt(t[1]) : 8, t ? parseInt(t[2]) : 0,
  );
  return isNaN(date.getTime()) ? null : date;
}

export async function syncExamReminders(exams: ExamInfo[]) {
  if (Platform.OS === "web") return;
  const ids = await loadIds();
  await cancelIds(ids.exam);
  ids.exam = [];

  if (await isReminderEnabled()) {
    for (const exam of exams) {
      const start = parseExamStart(exam.examTime ?? "");
      if (!start) continue;
      for (const off of OFFSETS) {
        const id = await scheduleAt(
          `考试将在 ${off.label}后开始`,
          `${exam.courseName} · ${exam.examTime}${exam.examLocation ? ` · ${exam.examLocation}` : ""}${exam.seat ? ` · 座位 ${exam.seat}` : ""}`,
          new Date(start.getTime() - off.ms),
        );
        if (id) ids.exam.push(id);
      }
    }
  }
  await saveIds(ids);
}

/** 关闭开关时调用：清掉全部已排提醒 */
export async function cancelAllReminders() {
  const ids = await loadIds();
  await cancelIds([...ids.hw, ...ids.exam]);
  await saveIds({ hw: [], exam: [] });
}
