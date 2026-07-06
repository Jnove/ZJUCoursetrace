/**
 * ZDBK / courses.zju.edu.cn 业务数据请求：
 * 课表、成绩、考试、作业、学生姓名、学期选项。
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { ZDBK_BASE, DATA_HDR } from "./config";
import { zGet, zPost } from "./http";
import { withRelogin } from "./cas";
import { PT, parseKbList, parseGrades, computeGPA, parseStudentName } from "./parsers";
import type { ZjuSession, RawCourse, Grade, ExamInfo, SemesterOption } from "./types";

// PT 由 parsers 提供，此处仅 re-export 供调试页使用
export { PT };

// ─── Semester options ─────────────────────────────────────────────────────────

export async function getSemesterOptions(session: ZjuSession) {
  const text = await withRelogin(session, () =>
    zGet(`${ZDBK_BASE}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N253508&layout=default&su=${session.username}`)
  );
  const parseSelect = (id: string): SemesterOption[] => {
    const opts: SemesterOption[] = [];
    const block = text.match(new RegExp(`<select[^>]+id="${id}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? "";
    const re = /<option([^>]*)>(.*?)<\/option>/gi; let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      const v = m[1].match(/value="([^"]*)"/)?.[1] ?? "";
      const sel = /selected/i.test(m[1]);
      const t = m[2].trim().replace(/&amp;/g, "&");
      if (v) opts.push({ value: v, text: t, selected: sel });
    }
    return opts;
  };
  const yo = parseSelect("xnm"), to = parseSelect("xqm");
  return {
    yearOptions: yo, termOptions: to,
    currentYear: yo.find(o => o.selected)?.text ?? yo[0]?.text ?? "",
    currentTerm: to.find(o => o.selected)?.text ?? to[0]?.text ?? "",
  };
}

// ─── Timetable ────────────────────────────────────────────────────────────────

export async function fetchTimetable(
  session: ZjuSession,
  yearValue: string,   // 如 "2025-2026"
  termValue: string,   // 如 "2|春"
  captchaAnswer?: string,
) {
  // 从 termValue 提取学期显示名（如 "2|春" -> "春"）
  const termDisplay = termValue.includes("|") ? termValue.split("|")[1] : termValue;
  const dy = yearValue;  // 学年显示文本（学年值本身就是显示文本）
  const dt = termDisplay;

  const text = await withRelogin(session, () =>
    zPost(
      `${ZDBK_BASE}/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N253508&su=${session.username}`,
      new URLSearchParams({
        xnm: yearValue,
        xqm: termValue,
        xqmmc: termDisplay,
        xxqf: "0",
        xsfs: "0",
        captcha_value: captchaAnswer ?? "",
      }).toString()
    )
  );

  const t = text.trim();
  if (t.includes("captcha_error")) {
    const img = await zGet(`${ZDBK_BASE}/jwglxt/kaptcha?time=${Date.now()}`);
    return {
      rawCourses: [] as RawCourse[],
      semesterInfo: { schoolYear: dy, semester: dt },
      captchaRequired: true,
      captchaImage: btoa(unescape(encodeURIComponent(img))),
    };
  }
  if (!t || t === "null" || t === "{}") {
    return { rawCourses: [] as RawCourse[], semesterInfo: { schoolYear: dy, semester: dt } };
  }
  let data: any;
  try {
    data = JSON.parse(t);
  } catch {
    const m = t.match(/"kbList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (!m) throw new Error("课表数据格式异常，请重试");
    data = { kbList: JSON.parse(m[1]) };
  }
  const rawCourses = parseKbList(data?.kbList ?? data?.kblist ?? [], dy, dt);
  return { rawCourses, semesterInfo: { schoolYear: dy, semester: dt } };
}

export async function checkSemesterHasCourses(
  session: ZjuSession,
  yearValue: string,
  termValue: string,
): Promise<boolean> {
  try {
    const result = await Promise.race([
      fetchTimetable(session, yearValue, termValue, ""),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("check timeout")), 8000)
      ),
    ]);
    return (result.rawCourses?.length ?? 0) > 0;
  } catch (e) {
    // 如果请求失败，保守认为有课
    console.warn(`检查学期 ${yearValue} ${termValue} 失败:`, e);
    return true;
  }
}

// ─── Grades ───────────────────────────────────────────────────────────────────

export async function fetchMajorGrade(session: ZjuSession): Promise<{ grades: Grade[]; gpa: number; totalCredits: number }> {
  const text = await withRelogin(session, () =>
    zPost(`${ZDBK_BASE}/jwglxt/zycjtj/xszgkc_cxXsZgkcIndex.html?doType=query&queryModel.showCount=5000`, ""));
  const grades = parseGrades(text, true);
  return { grades, ...computeGPA(grades) };
}

export async function fetchGrade(session: ZjuSession): Promise<{ grades: Grade[]; gpa: number; totalCredits: number }> {
  const text = await withRelogin(session, () =>
    zPost(`${ZDBK_BASE}/jwglxt/cxdy/xscjcx_cxXscjIndex.html?doType=query&queryModel.showCount=5000`, ""));
  const grades = parseGrades(text, true);
  return { grades, ...computeGPA(grades) };
}

// ─── Exams ────────────────────────────────────────────────────────────────────

export async function fetchExams(session: ZjuSession): Promise<ExamInfo[]> {
  const text = await withRelogin(session, () =>
    zPost(`${ZDBK_BASE}/jwglxt/xskscx/kscx_cxXsgrksIndex.html?doType=query&queryModel.showCount=5000`, ""));
  const m = text.match(/(?<="items":)(\[[\s\S]*?\])(?=,"limit")/);
  if (!m) return [];
  let items: any[];
  try {
    items = JSON.parse(m[1]);
  } catch {
    return [];
  }
  return items
    .filter(e => e.xkkh != null)   // 保留有课程代码的项
    .map(e => {
      const examTime = e.kssj ?? "";
      // 考试地点字段是 jsmc
      const examLocation = e.jsmc ?? "";
      // 座位号：zwxh
      const seat = e.zwxh != null ? String(e.zwxh) : undefined;
      // 学年可以从 xkkh 中提取（如 (2025-2026-1)...）
      let year: string | undefined;
      if (e.xkkh) {
        const match = e.xkkh.match(/\((\d{4}-\d{4})-\d+\)/);
        if (match) year = match[1];
      }
      // 学期：xxq 字段（例如 "秋冬"、"春夏"、"夏"、"春"）
      const semester = e.xxq ?? undefined;
      // 学分：xf
      const credit = e.xf != null ? parseFloat(String(e.xf)) : undefined;

      return {
        courseCode: String(e.kch ?? ""),
        courseName: String(e.kcmc ?? ""),
        examTime,
        examLocation,
        seat,
        credit,
        year,
        semester,
      };
    })
    // 过滤掉既没有考试时间也没有考试地点的无效条目
    .filter(exam => exam.examTime || exam.examLocation);
}

// ─── 学生姓名 ─────────────────────────────────────────────────────────────────
// 登录后访问用户信息页，解析「姓名」并本地缓存，供首页欢迎语和设置页头像使用。

const STUDENT_NAME_KEY = "studentName";

/** 读取本地缓存的姓名（无网络） */
export async function loadStoredStudentName(): Promise<string | null> {
  try { return await AsyncStorage.getItem(STUDENT_NAME_KEY); } catch { return null; }
}

/**
 * 拉取并缓存学生姓名。session 过期时 withRelogin 会用已存凭据静默重登。
 * 失败静默返回 null，绝不影响登录/课表主流程。
 */
export async function fetchStudentName(username: string): Promise<string | null> {
  const session: ZjuSession = { username, jsessionId: "native", routeCookie: null };
  try {
    const html = await withRelogin(session, () =>
      zGet(`${ZDBK_BASE}/jwglxt/xtgl/yhxx_cxYhxx.html?gnmkdm=index`)
    );
    const name = parseStudentName(html);
    if (name) await AsyncStorage.setItem(STUDENT_NAME_KEY, name);
    return name;
  } catch {
    return null;
  }
}

