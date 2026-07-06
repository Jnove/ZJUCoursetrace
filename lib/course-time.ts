/**
 * 课程时间工具：节次时间表、倒计时格式化、按天筛选课程。
 * 被首页（今日课程/倒计时卡片）等复用，纯函数无副作用。
 */

import type { Course } from "@/lib/schedule-context";

// ─── Period table ─────────────────────────────────────────────────────────────
export const PERIODS = [
  { number: 1,  startTime: "08:00", endTime: "08:45" },
  { number: 2,  startTime: "08:50", endTime: "09:35" },
  { number: 3,  startTime: "10:00", endTime: "10:45" },
  { number: 4,  startTime: "10:50", endTime: "11:35" },
  { number: 5,  startTime: "11:40", endTime: "12:25" },
  { number: 6,  startTime: "13:25", endTime: "14:10" },
  { number: 7,  startTime: "14:15", endTime: "15:00" },
  { number: 8,  startTime: "15:05", endTime: "15:50" },
  { number: 9,  startTime: "16:15", endTime: "17:00" },
  { number: 10, startTime: "17:05", endTime: "17:50" },
  { number: 11, startTime: "18:50", endTime: "19:35" },
  { number: 12, startTime: "19:40", endTime: "20:25" },
  { number: 13, startTime: "20:30", endTime: "21:15" },
];

export function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 3600 + m * 60;
}

export function getCourseSeconds(course: Course): { start: number; end: number } | null {
  if (course.periodTime) {
    const m = course.periodTime.match(/(\d{2}:\d{2})[—\-](\d{2}:\d{2})/);
    if (m) return { start: parseTimeStr(m[1]), end: parseTimeStr(m[2]) };
  }
  const sp = PERIODS.find(p => p.number === course.startPeriod);
  const ep = PERIODS.find(p => p.number === course.endPeriod);
  if (sp && ep) return { start: parseTimeStr(sp.startTime), end: parseTimeStr(ep.endTime) };
  return null;
}

export function getNowSeconds(): number {
  const n = new Date();
  return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
}

export function formatCountdown(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function filterCourses(
  allCourses: Course[], dayOfWeek: number, week: number, isOddWeek: boolean
): Course[] {
  return allCourses
    .filter(c => {
      if (c.dayOfWeek !== dayOfWeek) return false;
      if (week < c.weekStart || week > c.weekEnd) return false;
      if (c.isSingleWeek === "single") return isOddWeek;
      if (c.isSingleWeek === "double") return !isOddWeek;
      return true;
    })
    .sort((a, b) => a.startPeriod - b.startPeriod);
}
