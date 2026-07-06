/**
 * 纯解析函数：不发网络请求、不读存储，方便单测。
 */

import type { Grade, RawCourse } from "./types";

// ─── Period times ─────────────────────────────────────────────────────────────

export const PT: Record<number, [string, string]> = {
  1: ["08:00", "08:45"], 2: ["08:50", "09:35"], 3: ["10:00", "10:45"],
  4: ["10:50", "11:35"], 5: ["11:40", "12:25"], 6: ["13:25", "14:10"],
  7: ["14:15", "15:00"], 8: ["15:05", "15:50"], 9: ["16:15", "17:00"],
  10: ["17:05", "17:50"], 11: ["18:50", "19:35"], 12: ["19:40", "20:25"], 13: ["20:30", "21:15"],
};

export function parsePeriod(jcs: string) {
  const m = jcs.match(/0?(\d+)(?:-0?(\d+))?/);
  const s = m ? parseInt(m[1]) : 1, e = m?.[2] ? parseInt(m[2]) : s;
  const ts = PT[s]?.[0] ?? "", te = PT[e]?.[1] ?? "";
  return { start: s, end: e, range: e > s ? `${s}-${e}` : `${s}`, time: ts && te ? `${ts}—${te}` : "" };
}

export function parseWeeks(zcd: string) {
  const m = zcd.match(/(\d+)-(\d+)/);
  return m ? { start: parseInt(m[1]), end: parseInt(m[2]) } : { start: 1, end: 16 };
}

export function toNum(v: unknown): number | null {
  const n = parseFloat(String(v ?? ""));
  return isNaN(n) ? null : n;
}

// ─── Semester value converters ────────────────────────────────────────────────

export function yToXnm(t: string) { return t.match(/(\d{4})/)?.[1] ?? t; }

export function tToXqm(t: string) {
  if (t.includes("一") || t === "3") return "3";
  if (t.includes("二") || t === "12") return "12";
  return "3";
}

// ─── Timetable (kbList) ───────────────────────────────────────────────────────

export function parseKbList(kbList: any[], yearText: string, termText: string): RawCourse[] {
  // 第一步：将每个原始条目转换为 RawCourse 对象
  const rawCourses: RawCourse[] = [];

  for (const item of kbList) {
    try {
      if (item.sfyjskc === "1") continue;

      const xkkh = String(item.xkkh ?? "");
      const dayOfWeek = parseInt(String(item.xqj ?? "1")) || 1;

      // 节次解析：djj 为起始节次，skcd 为节数
      const startPeriod = parseInt(String(item.djj ?? "1")) || 1;
      const skcd = parseInt(String(item.skcd ?? "1")) || 1;
      const endPeriod = startPeriod + skcd - 1;

      // 单双周：0=单周, 1=双周, 2=单双周都上
      const dsz = String(item.dsz ?? "2");
      let isSingleWeek: RawCourse["isSingleWeek"] = "both";
      if (dsz === "0") isSingleWeek = "single";
      else if (dsz === "1") isSingleWeek = "double";

      // 周次
      const weekMatch = (item.zcd ?? "1-16周").match(/(\d+)-(\d+)/);
      const weekStart = weekMatch ? parseInt(weekMatch[1]) : 1;
      const weekEnd = weekMatch ? parseInt(weekMatch[2]) : 16;

      // 从 kcb 解析课程名、教师、教室、考试信息
      let name = "";
      let teacher = "";
      let classroom = "";
      let examInfo = "";

      if (item.kcb) {
        const parts = item.kcb.split(/<br\s*\/?>/i);
        name = parts[0]?.trim() || "";

        // 教师通常出现在第三个 <br> 之后（索引2），但可能因周次信息而偏移
        // 寻找包含字母/中文且不含 "zwf" 且不是考试时间的部分
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i].trim();
          if (!p) continue;
          if (p.includes(name)) continue;
          // 考试时间模式
          if (/\d{4}年\d{1,2}月\d{1,2}日/.test(p)) {
            // 这是考试信息，后面再处理
            continue;
          }
          // 教师通常不含中文冒号，且长度适中
          if (!teacher && !p.includes("周") && p.length < 30) {
            teacher = p;
            continue;
          }
        }

        // 提取考试信息和教室（在最后一部分）
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i].trim();
          if (!p) continue;
          if (p === name || p === teacher) continue;
          const examMatch = p.match(/(\d{4}年\d{1,2}月\d{1,2}日\([^)]+\))/);
          if (examMatch) {
            examInfo = examMatch[1];
            classroom = p.substring(0, examMatch.index).trim();
            // 清理教室末尾的 "zwf" 及其后续内容
            classroom = classroom.replace(/zwf.*$/i, "").trim();
            break;
          } else {
            classroom = p;
            // 同样清理
            classroom = classroom.replace(/zwf.*$/i, "").trim();
            break;
          }
        }
      }

      // 回退字段
      if (!name && item.kcmc) name = item.kcmc;
      if (!teacher && (item.xm || item.jsxm)) teacher = item.xm || item.jsxm;
      if (!classroom && item.cdmc) classroom = item.cdmc;

      // 标准化教师和教室（去除首尾空格，统一大小写等，便于后续合并）
      teacher = teacher.trim();
      classroom = classroom.trim();
      const periodTime = (() => {
        const start = PT[startPeriod]?.[0];
        const end = PT[endPeriod]?.[1];
        if (start && end) return `${start}—${end}`;
        return "";
      })();
      rawCourses.push({
        id: xkkh || `${name}_${dayOfWeek}_${startPeriod}`,
        name,
        teacher,
        classroom,
        dayOfWeek,
        startPeriod,
        endPeriod,
        weekStart,
        weekEnd,
        isSingleWeek,
        periodTime,
        courseCode: item.kch || undefined,
        semester: `${yearText} ${termText}`,
        examInfo: examInfo || undefined,
      });
    } catch (err) {
      console.warn("解析课程条目失败", err, item);
    }
  }

  // 第二步：合并相邻连续节次的同一课程
  // 分组键：课程名 + 教师 + 星期 + 单双周
  const grouped = new Map<string, RawCourse[]>();
  for (const course of rawCourses) {
    const key = `${course.name}|${course.teacher}|${course.dayOfWeek}|${course.isSingleWeek}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(course);
  }

  const mergedCourses: RawCourse[] = [];
  for (const [, courses] of grouped.entries()) {
    // 按 startPeriod 排序
    courses.sort((a, b) => a.startPeriod - b.startPeriod);
    let current = courses[0];
    const merged = [current];
    for (let i = 1; i < courses.length; i++) {
      const next = courses[i];
      // 检查是否连续：next.startPeriod === current.endPeriod + 1
      if (next.startPeriod === current.endPeriod + 1) {
        // 合并：扩展 endPeriod
        current.endPeriod = next.endPeriod;
        current.periodTime = (() => {
          const start = PT[current.startPeriod]?.[0];
          const end = PT[next.endPeriod]?.[1];
          if (start && end) return `${start}—${end}`;
          return "";
        })();
        current.id = `${current.id}_${next.id}`;
      } else {
        merged.push(next);
        current = next;
      }
    }
    mergedCourses.push(...merged);
  }

  return mergedCourses;
}

// ─── Grades ───────────────────────────────────────────────────────────────────

const EXCLUDED_SCORE_STRINGS = ['缓考', '补考', '缺考', '免修', '未修'];

export function computeGPA(grades: Grade[]): { gpa: number; totalCredits: number } {
  let weightedSum = 0;
  let totalCredits = 0;

  for (const g of grades) {
    if (g.credit <= 0) continue;

    // 跳过特定成绩字符串的课程
    const scoreStr = g.score?.toString().trim();
    if (scoreStr && EXCLUDED_SCORE_STRINGS.includes(scoreStr)) {
      continue;
    }

    // 使用系统返回的绩点
    if (g.gpaPoints !== null && typeof g.gpaPoints === 'number') {
      weightedSum += g.gpaPoints * g.credit;
      totalCredits += g.credit;
    }
  }

  const gpa = totalCredits > 0 ? Math.round(weightedSum / totalCredits * 100) / 100 : 0;
  return { gpa, totalCredits };
}

/**
 * 提取成绩条目的学期。优先显式字段（xnxqdm_display / xn+xq），
 * 兜底从选课课号 xkkh 解析——格式 "(2025-2026-1)-XXX…"，1=秋冬、2=春夏。
 */
function gradeSemester(e: any): string | undefined {
  if (e.xnxqdm_display) return String(e.xnxqdm_display);
  const termLabel = (t: string) => (t === "1" ? "秋冬" : t === "2" ? "春夏" : t);
  if (e.xn && e.xq != null) return `${e.xn} ${termLabel(String(e.xq))}`;
  const m = String(e.xkkh ?? "").match(/^\((\d{4}-\d{4})-([12])\)/);
  if (m) return `${m[1]} ${termLabel(m[2])}`;
  return undefined;
}

export function parseGrades(text: string, isMajor: boolean): Grade[] {
  const m = text.match(/(?<="items":)(\[[\s\S]*?\])(?=,"limit")/);
  if (!m) return [];
  let items: any[]; try { items = JSON.parse(m[1]); } catch { return []; }
  return items.filter(e => e.xkkh != null).map(e => ({
    courseCode: String(e.kch ?? ""), courseName: String(e.kcmc ?? ""),
    credit: parseFloat(String(e.xf ?? "0")) || 0, score: (e.cj), gpaPoints: toNum(e.jd),
    courseType: e.kcxzdm_display ?? e.kclbmc ?? undefined,
    semester: gradeSemester(e), isMajor,
  }));
}

// ─── Student name ─────────────────────────────────────────────────────────────

/** 从用户信息页 HTML 中解析姓名。结构：<th><b>姓名</b></th><td ...>张三</td> */
export function parseStudentName(html: string): string | null {
  const m = html.match(/姓名\s*<\/b>\s*<\/th>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>/);
  const name = m?.[1]?.trim();
  return name ? name : null;
}

// ─── Homework ─────────────────────────────────────────────────────────────────

/** ISO-8601 → "M月D日 HH:mm" */
export function fmtHwDdl(iso: string): string {
  try {
    const d = new Date(iso);
    const mo = d.getMonth() + 1;
    const da = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${mo}月${da}日 ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
