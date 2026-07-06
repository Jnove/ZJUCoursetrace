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
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";

import type { Course } from "@/lib/schedule-context";
import { getCourseSeconds } from "@/lib/course-time";
import { getCurrentSemester, getNextSemesterStart, getSemesterStartDate } from "@/lib/semester-utils";
import { loadCustomCourses, mergeCustomCourses } from "@/lib/custom-courses";

/** 可供导出的学期（有本地课表缓存的才算） */
export interface ExportSemester {
  yearValue: string;
  termValue: string;
  label: string;
  /** 是当前学期（假期中则指下一学期），用于默认勾选 */
  isCurrent: boolean;
}

/** termValue（如 "1|秋"）里提取学期名 */
function termName(termValue: string): string | null {
  return termValue.match(/[春夏秋冬]+/)?.[0] ?? null;
}

/** 列出所有有课表缓存、可导出的学期，供设置页多选 */
export async function listExportableSemesters(): Promise<ExportSemester[]> {
  const username = await AsyncStorage.getItem("username");
  if (!username) return [];
  const raw = await AsyncStorage.getItem(`activeSemesters_${username}`);
  if (!raw) return [];

  const now = new Date();
  const cur = getCurrentSemester(now) ?? getNextSemesterStart(now);

  const all: { yearValue: string; termValue: string; label: string }[] = JSON.parse(raw);
  const out: ExportSemester[] = [];
  for (const s of all) {
    const cached = await AsyncStorage.getItem(`schedule_${s.yearValue}_${s.termValue}`);
    if (!cached) continue;
    const sem = termName(s.termValue);
    if (!sem || !getSemesterStartDate(s.yearValue, sem)) continue; // 推不出起始日的不给选
    out.push({
      yearValue: s.yearValue,
      termValue: s.termValue,
      label: s.label,
      isCurrent: !!cur && s.yearValue.includes(cur.schoolYear) && s.termValue.includes(cur.semester),
    });
  }
  return out;
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

/** 一个导出分组 = 一个学期的课程 + 该学期一周周一锚点 */
export interface IcsGroup {
  courses: Course[];
  week1Monday: Date;
  /** UID 命名空间，避免同一门课在不同学期的事件 UID 冲突 */
  uidScope: string;
}

export function buildIcs(groups: IcsGroup[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZJUCoursetrace//Schedule Export//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const stamp = icsDateTime(new Date()) ;

  for (const g of groups) {
    for (const c of g.courses) {
      const secs = getCourseSeconds(c);
      if (!secs) continue;
      for (let week = c.weekStart; week <= c.weekEnd; week++) {
        const isOdd = week % 2 === 1;
        if (c.isSingleWeek === "single" && !isOdd) continue;
        if (c.isSingleWeek === "double" && isOdd) continue;

        const day = new Date(g.week1Monday);
        day.setDate(day.getDate() + (week - 1) * 7 + (c.dayOfWeek - 1));
        const start = new Date(day); start.setSeconds(secs.start);
        const end   = new Date(day); end.setSeconds(secs.end);

        lines.push(
          "BEGIN:VEVENT",
          `UID:${g.uidScope}-${c.id}-w${week}@zjucoursetrace`,
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
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * 导出所选学期的课表并调起日历导入/分享。
 * @param selected 要导出的学期；缺省时回退到上次选中的学期（老行为）。
 * 自定义课程只合入当前学期（假期则下一学期）——它们不与历史学期绑定。
 * 失败时抛出带用户可读信息的 Error，由调用方 Alert。
 */
export async function exportScheduleIcs(
  selected?: { yearValue: string; termValue: string }[],
): Promise<void> {
  if (Platform.OS === "web") throw new Error("网页端暂不支持导出，请在手机 App 内使用");

  const username = await AsyncStorage.getItem("username");
  if (!username) throw new Error("请先登录");

  let targets = selected;
  if (!targets || targets.length === 0) {
    const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
    if (!lastKey || !lastKey.includes("|")) throw new Error("尚无课表数据，请先在课表页加载一次");
    const idx = lastKey.indexOf("|");
    targets = [{ yearValue: lastKey.slice(0, idx), termValue: lastKey.slice(idx + 1) }];
  }

  const now = new Date();
  const cur = getCurrentSemester(now) ?? getNextSemesterStart(now);
  const customCourses = await loadCustomCourses(username);

  const groups: IcsGroup[] = [];
  for (const t of targets) {
    const raw = await AsyncStorage.getItem(`schedule_${t.yearValue}_${t.termValue}`);
    if (!raw) continue;
    let courses: Course[] = JSON.parse(raw);

    const isCurrent = !!cur && t.yearValue.includes(cur.schoolYear) && t.termValue.includes(cur.semester);
    if (isCurrent || targets.length === 1) {
      courses = mergeCustomCourses(courses, customCourses) as Course[];
    }
    if (courses.length === 0) continue;

    const sem = termName(t.termValue);
    const monday = sem ? getSemesterStartDate(t.yearValue, sem) : null;
    if (!monday) continue;

    groups.push({ courses, week1Monday: monday, uidScope: `${t.yearValue}-${sem}` });
  }

  if (groups.length === 0) throw new Error("所选学期没有可导出的课程（课表缓存为空或无法推算开学日期）");

  const ics = buildIcs(groups);
  const fileUri = `${FileSystem.cacheDirectory}zju-schedule.ics`;
  await FileSystem.writeAsStringAsync(fileUri, ics, { encoding: FileSystem.EncodingType.UTF8 });

  // Android：日历应用只注册 ACTION_VIEW（打开方式），不注册 ACTION_SEND（分享），
  // 所以分享面板里不会出现日历。这里直接以 VIEW 打开 → 弹出日历导入界面。
  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: "text/calendar",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION：授予日历应用读取该文件的权限
      });
      return;
    } catch {
      // 设备没有能处理 .ics 的应用（或被拒）→ 回退到分享面板
    }
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error("当前设备不支持分享文件");
  await Sharing.shareAsync(fileUri, {
    mimeType: "text/calendar",
    dialogTitle: "导出课表到日历",
    UTI: "com.apple.ical.ics",
  });
}
