/**
 * 课表导出为 iCalendar (.ics)。
 *
 * 周次 → 日期：以「当前学期一周的周一」为锚点（getCurrentSemester 推算），
 * 假期中则用下一学期开学日兜底。单双周课程只在对应周生成事件；
 * 每次上课生成独立 VEVENT（不用 RRULE，规避单双周/跨周的兼容性问题）。
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { Course } from "@/lib/schedule-context";
import { getCourseSeconds } from "@/lib/course-time";
import { getCurrentSemester, getNextSemesterStart } from "@/lib/semester-utils";
import { loadCustomCourses, mergeCustomCourses } from "@/lib/custom-courses";

function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.getFullYear(), date.getMonth(), diff);
}

/** 当前（或下一）学期一周的周一 */
function resolveWeek1Monday(now: Date): { monday: Date; label: string } | null {
  const info = getCurrentSemester(now);
  if (info) {
    const monday = getMonday(now);
    monday.setDate(monday.getDate() - (info.week - 1) * 7);
    return { monday, label: `${info.schoolYear} ${info.semester}` };
  }
  const next = getNextSemesterStart(now);
  if (next) return { monday: next.startDate, label: `${next.schoolYear} ${next.semester}（按下学期推算）` };
  return null;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

/** 本地时间的 ICS 时间串（浮动时间，无时区后缀——国内使用足够） */
function icsDateTime(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/** ICS 文本转义：逗号/分号/反斜杠/换行 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(courses: Course[], week1Monday: Date): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZJUCoursetrace//Schedule Export//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const stamp = icsDateTime(new Date()) ;

  for (const c of courses) {
    const secs = getCourseSeconds(c);
    if (!secs) continue;
    for (let week = c.weekStart; week <= c.weekEnd; week++) {
      const isOdd = week % 2 === 1;
      if (c.isSingleWeek === "single" && !isOdd) continue;
      if (c.isSingleWeek === "double" && isOdd) continue;

      const day = new Date(week1Monday);
      day.setDate(day.getDate() + (week - 1) * 7 + (c.dayOfWeek - 1));
      const start = new Date(day); start.setSeconds(secs.start);
      const end   = new Date(day); end.setSeconds(secs.end);

      lines.push(
        "BEGIN:VEVENT",
        `UID:${c.id}-w${week}@zjucoursetrace`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDateTime(start)}`,
        `DTEND:${icsDateTime(end)}`,
        `SUMMARY:${esc(c.name)}`,
        `LOCATION:${esc(c.classroom || "")}`,
        `DESCRIPTION:${esc([c.teacher && `教师：${c.teacher}`, `第 ${week} 周`].filter(Boolean).join(" · "))}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * 导出当前选中学期的课表（含自定义课程）并调起系统分享。
 * 失败时抛出带用户可读信息的 Error，由调用方 Alert。
 */
export async function exportScheduleIcs(): Promise<void> {
  if (Platform.OS === "web") throw new Error("网页端暂不支持导出，请在手机 App 内使用");

  const username = await AsyncStorage.getItem("username");
  if (!username) throw new Error("请先登录");

  const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
  if (!lastKey || !lastKey.includes("|")) throw new Error("尚无课表数据，请先在课表页加载一次");
  const idx = lastKey.indexOf("|");
  const yearValue = lastKey.slice(0, idx);
  const termValue = lastKey.slice(idx + 1);

  const raw = await AsyncStorage.getItem(`schedule_${yearValue}_${termValue}`);
  if (!raw) throw new Error("课表缓存为空，请先在课表页加载一次");
  let courses: Course[] = JSON.parse(raw);
  courses = mergeCustomCourses(courses, await loadCustomCourses(username)) as Course[];
  if (courses.length === 0) throw new Error("该学期没有课程可导出");

  const anchor = resolveWeek1Monday(new Date());
  if (!anchor) throw new Error("无法确定学期起始日期，暂时无法导出");

  const ics = buildIcs(courses, anchor.monday);
  const fileUri = `${FileSystem.cacheDirectory}zju-schedule-${yearValue}.ics`;
  await FileSystem.writeAsStringAsync(fileUri, ics, { encoding: FileSystem.EncodingType.UTF8 });

  if (!(await Sharing.isAvailableAsync())) throw new Error("当前设备不支持分享文件");
  await Sharing.shareAsync(fileUri, {
    mimeType: "text/calendar",
    dialogTitle: "导出课表到日历",
    UTI: "com.apple.ical.ics",
  });
}
