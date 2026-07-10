/**
 * courses.zju.edu.cn(TronClass) 业务：作业列表/详情、课件浏览与下载。
 * 与 api.ts(教务/zdbk) 分离——courses 是独立子系统。
 */
import * as FileSystem from "expo-file-system/legacy";
import { CAS_BASE, COURSES_BASE, DATA_HDR } from "./config";
import { xhrGet, xhrPost, zPostJsonEx, zGetCourse, xhrGetBinary } from "./http";
import { rsaEncrypt } from "./rsa";
import { loadCredentials, parseCasForm, buildFormBody } from "./cas";
import { fmtHwDdl } from "./parsers";
import { flattenActivitiesToFiles, sanitizeFileName, parseHomeworkDetail } from "./courses-parsers";
import { writeLog } from "@/lib/diagnostic-log";
import type { ZjuSession, HomeworkInfo, CoursewareFile, HomeworkDetail } from "./types";

// ─── 临时诊断：定位「课程列表响应异常」根因，确认后可移除 ────────────────────
const __coursesDiag: {
  warmupUrl?: string;
  path?: "warm-ok" | "cas-login";
  loginFinalUrl?: string;
} = {};

// ─── Courses 会话建立（作业/课件共用） ────────────────────────────────────────

/**
 * 是否已落在 courses.zju.edu.cn。必须用前缀判断——CAS 登录页 URL 的
 * service 查询串里也含有 "courses.zju.edu.cn" 字样，substring 判断会把
 * 「还停在登录页」误判成「已登录」（正是旧代码跳过登录、API 返 401 的根因）。
 */
const onCourses = (url: string) => url.startsWith(COURSES_BASE);

/**
 * 确保 courses.zju.edu.cn(TronClass) 会话有效。
 *
 * courses 的认证链与 zdbk 不同：它不直接对接 CAS，而是经 identity.zju.edu.cn
 * (Keycloak) 代理 —— courses → identity → zjuam CAS(service=identity broker
 * endpoint，带一次性 state)。因此：
 *  1. 预热 GET courses：TGT 有效时整条重定向链静默完成，最终落回 courses；
 *  2. 停在 zjuam 登录页时，向【预热链停下的那个 URL】（自带本次链路新鲜
 *     state 的 identity broker service）POST 账密表单，成功后随重定向回 courses。
 * 绝不能用 service=courses 或 service=zdbk 去登录——前者不是 CAS 认识的
 * service，后者建立的是教务会话，courses API 仍会返回 401 错误 JSON。
 *
 * 返回 false 表示本地没有存储凭据（未登录），由调用方决定如何呈现。
 * 任何 courses API 裸调都可能拿到 401/错误 JSON 而非重定向（zPostJson 检测
 * 不到），所以【必须】先调本函数再打 API。
 */
async function ensureCoursesSession(): Promise<boolean> {
  const ua = DATA_HDR["User-Agent"];

  // ── 预热：TGT 有效则 courses → identity → CAS → identity → courses 静默完成 ──
  const warm = await xhrGet(COURSES_BASE, ua, 15000).catch((err) => {
    console.warn(`[zju-client-Homework] 预热失败:`, err);
    throw new Error("无法连接课程平台，请检查网络");
  });
  __coursesDiag.warmupUrl = warm.url.slice(0, 80);

  if (onCourses(warm.url)) {
    __coursesDiag.path = "warm-ok";
    return true;
  }

  // ── 停在 CAS 登录页（service=identity broker + 一次性 state）→ 账密登录 ──
  if (!warm.url.includes("zjuam.zju.edu.cn")) {
    throw new Error(`课程平台登录跳转异常（停在 ${warm.url.slice(0, 60)}），请稍后重试`);
  }

  const creds = await loadCredentials();
  if (!creds) return false;

  const pkRes = await xhrGet(`${CAS_BASE}/cas/v2/getPubKey`, ua);
  const pkJson = JSON.parse(pkRes.body);
  const modulus = pkJson.modulus as string | undefined;
  const exponent = pkJson.exponent as string | undefined;
  if (!modulus || !exponent) throw new Error("RSA 公钥获取失败");
  const pwdEnc = rsaEncrypt(creds.password, modulus, exponent);

  // 重新 GET 同一个带 state 的登录页，拿新鲜 execution token
  const pageRes = await xhrGet(warm.url, ua);
  const fields = parseCasForm(pageRes.body);
  if (fields.length === 0) throw new Error("CAS 登录表单解析失败，页面结构可能已变更");
  const formBody = buildFormBody(fields, creds.username, pwdEnc);

  // POST 回登录页自身（保留 service=identity...&state=...）；认证成功后
  // CAS → identity → courses 一路跟随重定向，最终应落回 courses.zju.edu.cn
  const postResp = await xhrPost(
    pageRes.url,
    formBody.toString(),
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": pageRes.url,
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
    },
    ua,
    20000
  );
  __coursesDiag.path = "cas-login";
  __coursesDiag.loginFinalUrl = postResp.url.slice(0, 80);

  if (onCourses(postResp.url)) {
    console.log("[zju-client-Homework] ✅ courses 会话建立");
    return true;
  }

  if (postResp.url.includes("zjuam.zju.edu.cn")) {
    const errPatterns = [
      /class="[^"]*text-danger/i, /class="[^"]*alert-danger/i,
      /class="[^"]*is-invalid/i, /id="errormsg"/i,
      /authenticationFailure/i, /登录失败/,
      /密码不正确|密码错误/, /账号不存在/,
    ];
    if (errPatterns.some((p) => p.test(postResp.body))) {
      throw new Error("学号或密码错误，请检查后重试");
    }
    throw new Error(
      "CAS 认证失败（最终停在 zjuam）。\n" +
      "可能账号被锁定需要滑块验证，请先在浏览器访问 https://zjuam.zju.edu.cn 解锁。"
    );
  }

  throw new Error(`已登录但未能回到课程平台（最终停在 ${postResp.url.slice(0, 60)}），请重试`);
}

// ─── 课程列表（作业/课件共用） ────────────────────────────────────────────────

// 与网页端一致的完整 fields —— 裁剪过的精简版曾导致接口行为不一致，保持原样。
const MY_COURSES_PAYLOAD = {
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

/**
 * POST /api/my-courses（调用前必须 ensureCoursesSession）。
 * `courses` 字段缺失说明响应异常（如未登录时的 401 JSON）——抛错，
 * 绝不吞成空数组（否则 UI 会误报「暂无课程」）。
 */
async function postMyCourses(): Promise<{ id: number; name: string }[]> {
  const { body, status, finalUrl } = await zPostJsonEx(`${COURSES_BASE}/api/my-courses`, MY_COURSES_PAYLOAD);

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      `课程列表响应非 JSON（status=${status}）\nurl=${finalUrl.slice(0, 60)}\nbody=${body.slice(0, 160)}`
    );
  }

  if (!Array.isArray(parsed.courses)) {
    // 带上真实证据：HTTP 状态、最终 URL、会话路径、JSON 顶层键、body 片段
    const diag =
      `status=${status}\n` +
      `finalUrl=${finalUrl.slice(0, 60)}\n` +
      `sessionPath=${__coursesDiag.path ?? "?"} warmup=${__coursesDiag.warmupUrl ?? "?"}\n` +
      (__coursesDiag.loginFinalUrl ? `loginFinalUrl=${__coursesDiag.loginFinalUrl}\n` : "") +
      `keys=${Object.keys(parsed).slice(0, 8).join(",")}\n` +
      `body=${body.slice(0, 200)}`;
    console.warn("[courses] my-courses 无 courses 字段:", diag);
    void writeLog("NETWORK", "my-courses 响应无 courses 字段", "error", {
      status,
      finalUrl,
      sessionPath: __coursesDiag.path,
      warmupUrl: __coursesDiag.warmupUrl,
      loginFinalUrl: __coursesDiag.loginFinalUrl,
      keys: Object.keys(parsed),
      bodyPrefix: body.slice(0, 300),
    });
    throw new Error(`课程列表响应异常\n${diag}`);
  }
  return parsed.courses.map((c: any) => ({ id: c.id as number, name: String(c.name ?? "") }));
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
  if (!(await ensureCoursesSession())) return [];

  // 1. 获取课程列表（POST JSON）
  let courses: Array<{ id: number; name: string }>;
  try {
    courses = await postMyCourses();
  } catch (e: any) {
    // 会话过期哨兵必须原样抛出，否则 withRelogin 认不出来、静默重登就失效了
    if (e?.message === "__COURSES_EXPIRED__" || e?.message === "__SESSION_EXPIRED__") throw e;
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

/** 单个作业详情（正文/附件/得分/评语）。会话失效抛 __COURSES_EXPIRED__。 */
export async function fetchHomeworkDetail(homeworkId: number): Promise<HomeworkDetail> {
  const text = await zGetCourse(`${COURSES_BASE}/api/course/activities/${homeworkId}`);
  return parseHomeworkDetail(JSON.parse(text));
}

// ─── Courseware (courses.zju.edu.cn) ──────────────────────────────────────────

/**
 * 列出「我的课程」(TronClass id + name)。
 * 走与 fetchHomeworks 完全相同的会话链路（预热+登录），修复裸调 API 时
 * 401 JSON 被吞成空数组、UI 误报「暂无课程」的问题。
 */
export async function listMyCourses(): Promise<{ id: number; name: string }[]> {
  if (!(await ensureCoursesSession())) throw new Error("请先登录");
  return postMyCourses();
}

/** 按课程名匹配 TronClass 课程 id（课表数据无此 id，需在此解析）。 */
export async function resolveCourseId(courseName: string): Promise<{ id: number; name: string } | null> {
  const courses = await listMyCourses();
  const exact = courses.find((c) => c.name === courseName);
  if (exact) return exact;
  const norm = (s: string) => s.replace(/[（(].*?[)）]/g, "").trim();
  return courses.find((c) => norm(c.name) === norm(courseName)) ?? null;
}

/** 某课程的课件文件（扁平化 activities.uploads）。 */
export async function fetchCourseFiles(courseId: number): Promise<CoursewareFile[]> {
  const text = await zGetCourse(`${COURSES_BASE}/api/courses/${courseId}/activities`);
  const activities = JSON.parse(text).activities ?? [];
  return flattenActivitiesToFiles(activities);
}

/**
 * 下载单个课件到本地缓存目录，返回本地 fileUri。
 * 已开放：reference/{referenceId}/blob；失败且 allowPreview → 降级 uploads/{id}/blob。
 * 会话失效（落到 zjuam）抛 __COURSES_EXPIRED__；未开放且不允许预览抛用户可读错误。
 */
export async function downloadCourseFile(
  file: CoursewareFile,
  courseId: number,
  allowPreview: boolean
): Promise<string> {
  const tryUrls: string[] = [`${COURSES_BASE}/api/uploads/reference/${file.referenceId}/blob`];
  if (allowPreview) tryUrls.push(`${COURSES_BASE}/api/uploads/${file.id}/blob`);

  let base64 = "";
  let lastErr: unknown = null;
  for (const url of tryUrls) {
    try {
      const res = await xhrGetBinary(url);
      if (res.finalUrl.includes("zjuam.zju.edu.cn")) throw new Error("__COURSES_EXPIRED__");
      base64 = res.base64;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.message === "__COURSES_EXPIRED__") throw e;
    }
  }
  if (lastErr) throw new Error(file.allowDownload ? "课件下载失败，请重试" : "老师未开放该课件下载");
  if (!base64) throw new Error(file.allowDownload ? "课件下载失败，请重试" : "老师未开放该课件下载");

  const dir = `${FileSystem.documentDirectory}courseware/${courseId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const fileUri = `${dir}${sanitizeFileName(file.name)}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}
