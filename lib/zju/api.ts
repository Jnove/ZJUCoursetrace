/**
 * ZDBK / courses.zju.edu.cn 业务数据请求：
 * 课表、成绩、考试、作业、学生姓名、学期选项。
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { CAS_BASE, ZDBK_BASE, COURSES_BASE, SERVICE_URL, DATA_HDR, randomUA } from "./config";
import { xhrGet, xhrPost, zGet, zPost, zPostJson, zGetCourse } from "./http";
import { rsaEncrypt } from "./rsa";
import { withRelogin, loadCredentials, parseCasForm, buildFormBody } from "./cas";
import { PT, parseKbList, parseGrades, computeGPA, parseStudentName, fmtHwDdl } from "./parsers";
import type { ZjuSession, RawCourse, Grade, ExamInfo, SemesterOption, HomeworkInfo } from "./types";

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

// ─── Homework (courses.zju.edu.cn) ────────────────────────────────────────────

/**
 * Fetch homework list for all current-semester courses.
 *
 * After CAS login the native cookie jar already holds the TGT, so a warm-up
 * GET to courses.zju.edu.cn performs the service-ticket exchange silently.
 * If that fails (account locked, network down) we re-throw with a user-
 * friendly message.
 */
export async function fetchHomeworks(_session: ZjuSession): Promise<HomeworkInfo[]> {
  // 预热：建立 courses 会话
  await xhrGet(COURSES_BASE, DATA_HDR["User-Agent"], 10000).catch((err) => {
    console.warn(`[zju-client-Homework] 预热失败:`, err);
    throw new Error("无法连接课程平台，请检查网络");
  });

  const loginWithService = `${CAS_BASE}/cas/login?service=${encodeURIComponent(COURSES_BASE)}`;
  let logged_in = false;
  // ── Step 1: GET 登录页 ────────────────────────────────────────────────────
  // 若被重定向到非 zjuam 域名，换 UA 重试；若网络无响应则立即终止。
  const MAX_STEP1_RETRIES = 5;
  let pageRes1: Awaited<ReturnType<typeof xhrGet>> | null = null;
  let ua = randomUA();

  for (let attempt = 0; attempt < MAX_STEP1_RETRIES; attempt++) {
    if (attempt > 0) {
      ua = randomUA();
      console.log(`[zju-client-Homework] Step1 retry ${attempt} with new UA`);
    }

    let res: Awaited<ReturnType<typeof xhrGet>>;
    try {
      // xhrGet 内部在 onerror / ontimeout 时 reject —— 网络无响应走这里
      res = await xhrGet(loginWithService, ua);
    } catch (netErr: any) {
      // 无响应：直接抛出，不继续任何后续步骤
      throw new Error(`无法访问浙大统一认证页面：${netErr?.message ?? "网络错误"}`);
    }

    if (!res.body) {
      // 有连接但响应体为空，同样视为无响应
      throw new Error("无法访问浙大统一认证页面，响应为空，请检查网络");
    }
    if (res.url.includes("courses.zju.edu.cn")) {
      logged_in = true;
      break;
    }
    if (res.url.includes("zjuam.zju.edu.cn")) {
      // 正常落地到 CAS 登录页
      pageRes1 = res;
      break;
    }

    // 被重定向到其他域名（如验证码页、中间跳转页等），换 UA 重试
    console.warn(`[zju-client-Homework] Step1 redirected to unexpected URL: ${res.url.slice(0, 80)}`);
  }
  if (!logged_in) {
    if (!pageRes1) {
      throw new Error(
        "CAS 登录页面持续重定向到非认证地址，请稍后重试。\n" +
        "如问题持续，可尝试在浏览器访问 https://zjuam.zju.edu.cn 解锁账号。"
      );
    }

    // ── Step 2: GET RSA 公钥 ─────────────────────────────────────────────────
    const pkRes = await xhrGet(`${CAS_BASE}/cas/v2/getPubKey`, ua);
    const pkJson = JSON.parse(pkRes.body);
    const modulus = pkJson.modulus as string | undefined;
    const exponent = pkJson.exponent as string | undefined;
    if (!modulus || !exponent) throw new Error("RSA 公钥获取失败");
    const creds = await loadCredentials();
    if (!creds) return [];
    const password = creds.password;
    const username = creds.username;
    const pwdEnc = rsaEncrypt(password, modulus, exponent);

    // ── Step 3: 重新 GET 登录页拿新的 execution token ──────────────────────
    const pageRes2 = await xhrGet("https://zjuam.zju.edu.cn/cas/login?service=https%3A%2F%2Fidentity.zju.edu.cn%2Fauth%2Frealms%2Fzju%2Fbroker%2Fcas-client%2Fendpoint?state%3D96tljSdUIBD2ckfXLUO5scSkQuTG4SliBzf7dZqGTDo._Nx_LhVKldk.TronClass", ua);
    const fields = parseCasForm(pageRes2.body);
    if (fields.length === 0) throw new Error("CAS 登录表单解析失败，页面结构可能已变更");

    console.log("[zju-client-Homework] form fields:", fields.map(f => `${f.name}(${f.type})`).join(", "));

    const formBody = buildFormBody(fields, username, pwdEnc);

    // ── Step 4: POST 登录 ────────────────────────────────────────────────────
    const postResp = await xhrPost(
      `${CAS_BASE}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`,
      formBody.toString(),
      {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": loginWithService,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      },
      ua,
      20000
    );

    const finalUrl = postResp.url;
    if (finalUrl.includes("zjuam.zju.edu.cn")) {
      const errBody = postResp.body;
      const errPatterns = [
        /class="[^"]*text-danger/i, /class="[^"]*alert-danger/i,
        /class="[^"]*is-invalid/i, /id="errormsg"/i,
        /authenticationFailure/i, /登录失败/,
        /密码不正确|密码错误/, /账号不存在/,
      ];
      if (errPatterns.some(p => p.test(errBody))) {
        throw new Error("学号或密码错误，请检查后重试");
      }
      throw new Error(
        "CAS 认证失败（最终停在 zjuam）。\n" +
        "可能账号被锁定需要滑块验证，请先在浏览器访问 https://zjuam.zju.edu.cn 解锁。"
      );
    }

    console.log(`[zju-client] ✅ 登录成功: ${username}`);
  }

  // 1. 获取课程列表（POST JSON）
  const listPayload = {
    fields: "id,name,course_code,department(id,name),grade(id,name),klass(id,name),course_type,cover,small_cover,start_date,end_date,is_started,is_closed,academic_year_id,semester_id,credit,compulsory,second_name,display_name,created_user(id,name),org(is_enterprise_or_organization),org_id,public_scope,audit_status,audit_remark,can_withdraw_course,imported_from,allow_clone,is_instructor,is_team_teaching,is_default_course_cover,archived,instructors(id,name,email,avatar_small_url),course_attributes(teaching_class_name,is_during_publish_period,copy_status,tip,data,audience_type,graduate_method),user_stick_course_record(id),classroom_schedule",
    page: 1,
    page_size: 1000,          // 一次拉取足够多的课程
    conditions: {
      status: ["ongoing", "notStarted"],
      keyword: "",
      classify_type: "recently_started",
      display_studio_list: false
    },
    showScorePassedStatus: false
  };

  let courses: Array<{ id: number; name: string }>;
  try {
    const listText = await zPostJson(`${COURSES_BASE}/api/my-courses`, listPayload);
    const parsed = JSON.parse(listText);
    courses = parsed.courses ?? [];
  } catch (e: any) {
    throw new Error(`获取课程列表失败：${e?.message || "未知错误"}`);
  }

  // 2. 并行获取每个课程的作业活动
  //    注意：这里必须区分「这门课确实没有作业」与「请求失败」——
  //    以前失败被静默吞成 []，一旦会话/网络瞬时异常导致全部课程同时失败，
  //    结果就会误报「作业 0 项」。改为：失败的课程重试一次；若全部课程都失败，
  //    抛错让 UI 显示重试，而不是把用户骗成「没有作业」。
  const fetchCourseHw = async (c: { id: number; name: string }): Promise<HomeworkInfo[]> => {
    const url = `${COURSES_BASE}/api/courses/${c.id}/homework-activities?page=1&page_size=1000`;
    const body = await zGetCourse(url); // 作业列表仍为 GET 请求
    const acts: any[] = JSON.parse(body).homework_activities ?? [];
    return acts
      .filter((hw) => !hw.is_closed)
      .map(
        (hw): HomeworkInfo => ({
          id: hw.id as number,
          title: (hw.title ?? "") as string,
          courseName: c.name,
          courseId: c.id,
          deadline: hw.deadline ? fmtHwDdl(hw.deadline as string) : "未知",
          deadlineIso: (hw.deadline as string) ?? "",
          submitted: !!(hw.submitted),
        })
      );
  };

  let results = await Promise.allSettled(courses.map(fetchCourseHw));
  let failedIdx = results.flatMap((r, i) => (r.status === "rejected" ? [i] : []));

  // 失败的课程稍后重试一次（多为并发突发 / 会话尚未热的瞬时问题）
  if (failedIdx.length > 0) {
    await new Promise((r) => setTimeout(r, 600));
    const retried = await Promise.allSettled(failedIdx.map((i) => fetchCourseHw(courses[i])));
    retried.forEach((r, j) => {
      results[failedIdx[j]] = r;
    });
    failedIdx = results.flatMap((r, i) => (r.status === "rejected" ? [i] : []));
  }

  // 全部课程都失败 → 会话/网络异常，抛错让 UI 显示重试，避免误报「0 项」
  if (failedIdx.length > 0 && failedIdx.length === courses.length) {
    const reason = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    const detail = reason?.reason instanceof Error ? reason.reason.message : "";
    throw new Error(`作业加载失败，请下拉重试${detail ? `（${detail}）` : ""}`);
  }
  if (failedIdx.length > 0) {
    console.warn(`[zju-client-Homework] ${failedIdx.length}/${courses.length} 门课程作业获取失败，返回部分结果`);
  }

  // 3. 扁平化并按截止时间升序排列
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => a.deadlineIso.localeCompare(b.deadlineIso));
}
