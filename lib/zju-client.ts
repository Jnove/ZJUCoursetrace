/**
 * lib/zju-client.ts  —  pure mobile, no backend
 *
 * Auth flow (based on working debug script):
 *
 *   1. XHR  GET  /cas/login?service=ZDBK_SSO     → parse ALL form fields
 *   2. XHR  GET  /cas/v2/getPubKey               → RSA modulus + exponent
 *   3. RSA encrypt password, pad to mod.length    (NOT hardcoded 256)
 *   4. Re-GET login page for fresh execution token
 *   5. fetch POST /cas/login  redirect:'manual'  credentials:'include'
 *      → 302 + Location header (readable because credentials:include changes
 *        how RN handles manual redirects vs plain opaque)
 *   6. fetch GET  Location URL  credentials:'include'  → follow to zdbk
 *   7. Verify: final URL on zdbk domain → native jar has JSESSIONID
 *
 * Key differences from previous attempts:
 *   - RSA pad length = mod.length (not hardcoded 256)
 *   - GET login page WITH ?service= param
 *   - fetch + redirect:'manual' + credentials:'include'
 *   - _eventId and service fields added if missing from form
 *   - Manual single-hop redirect follow with credentials:'include'
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY     = "zju_session_v3";
const CREDENTIALS_KEY = "zju_credentials_v1";

const CAS_BASE    = "https://zjuam.zju.edu.cn";
const ZDBK_BASE   = "https://zdbk.zju.edu.cn";
const SERVICE_URL = `${ZDBK_BASE}/jwglxt/xtgl/login_ssologin.html`;

// UA 池：每次登录随机选一个，避免固定 UA 触发 CAS 频率限制
const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
];
function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZjuSession {
  username:    string;
  jsessionId:  "native";
  routeCookie: null;
}

export interface RawCourse {
  id:            string;
  name:          string;
  teacher:       string;
  classroom:     string;
  dayOfWeek:     number;
  startPeriod:   number;
  endPeriod:     number;
  weekStart:     number;
  weekEnd:       number;
  isSingleWeek?: "single" | "double" | "both";
  periodTime?:   string;
  courseCode?:   string;
  semester?:     string;
  examInfo?:     string;
}

export type Course = RawCourse & { color: string };

export interface Grade {
  courseCode:  string;
  courseName:  string;
  credit:      number;
  score:       string | null;
  gpaPoints:   number | null;
  courseType?: string;
  semester?:   string;
  isMajor:     boolean;
}

export interface ExamInfo {
  courseCode:    string;
  courseName:    string;
  examTime:      string;
  examLocation:  string;
  seat?:         string;
  credit?:       number;
}

export interface SemesterOption {
  value:    string;
  text:     string;
  selected: boolean;
}

// ─── RSA ──────────────────────────────────────────────────────────────────────

// ── rsa_encrypt ───────────────────────────────────────────────────────────────
function rsaEncrypt(password: string, modulusHex: string, exponentHex: string): string {
  function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let r = 1n; base %= mod;
    while (exp > 0n) { if (exp & 1n) r = r * base % mod; exp >>= 1n; base = base * base % mod; }
    return r;
  }
  const m   = BigInt("0x" + modulusHex);
  const e   = BigInt("0x" + exponentHex);
  const hex = Array.from(new TextEncoder().encode(password))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return modPow(BigInt("0x" + hex), e, m)
    .toString(16).padStart(modulusHex.length, "0");
}

// ─── Form parser ──────────────────────────────────────────────────────────────

interface FormField { name: string; value: string; type: string }

function parseCasForm(html: string): FormField[] {
  const fields: FormField[] = [];
  const tagPat = /<input([^>]*?)\/?>/gi;
  // 支持双引号 / 单引号 / 无引号属性，兼容各类 CAS HTML 输出
  function getAttr(attrs: string, attrName: string): string | undefined {
    const re = new RegExp(
      `\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>/"']+))`, "i"
    );
    const res = attrs.match(re);
    if (!res) return undefined;
    return res[1] ?? res[2] ?? res[3] ?? "";
  }
  let m: RegExpExecArray | null;
  while ((m = tagPat.exec(html))) {
    const a     = m[1];
    const name  = getAttr(a, "name");
    const value = getAttr(a, "value") ?? "";
    const type  = (getAttr(a, "type") ?? "text").toLowerCase();
    if (name && !["submit", "button", "image"].includes(type))
      fields.push({ name, value, type });
  }
  return fields;
}

function buildFormBody(
  fields:   FormField[],
  username: string,
  pwdEnc:   string,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const f of fields) {
    if (f.name.toLowerCase() === "username") {
      params.append(f.name, username);
      continue;
    }
    const isPwd =
      f.type === "password" ||
      /pwd|pass|credential|encrypt/i.test(f.name);
    if (isPwd) {
      params.append(f.name, pwdEnc);
      continue;
    }
    if (f.type === "checkbox") {
      if (/remember/i.test(f.name)) params.append(f.name, "true");
      continue;
    }
    params.append(f.name, f.value);
  }

  // _eventId 必须在 body 里
  if (!params.has("_eventId")) params.append("_eventId", "submit");
  // service 放在 POST URL 的 query string，不放 body（浏览器抓包行为）

  return params;
}

// ─── XHR helper (for GET requests — native jar, no manual cookie header) ──────

function xhrGet(url: string, ua: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.timeout = 20_000;
    xhr.setRequestHeader("User-Agent",      ua);
    xhr.setRequestHeader("Accept",          "text/html,application/xhtml+xml,*/*;q=0.8");
    xhr.setRequestHeader("Accept-Language", "zh-CN,zh;q=0.9");
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      resolve({ status: xhr.status, body: xhr.responseText ?? "" });
    };
    xhr.onerror   = () => reject(new Error("网络请求失败"));
    xhr.ontimeout = () => reject(new Error("请求超时，请重试"));
    xhr.send(null);
  });
}

// ─── Credential storage ───────────────────────────────────────────────────────

async function saveCredentials(u: string, p: string) {
  try { await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify({ username: u, password: p })); } catch {}
}
async function loadCredentials(): Promise<{ username: string; password: string } | null> {
  try { const r = await SecureStore.getItemAsync(CREDENTIALS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function clearCredentials() {
  try { await SecureStore.deleteItemAsync(CREDENTIALS_KEY); } catch {}
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function saveSession(s: ZjuSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  await AsyncStorage.setItem("username", s.username);
}
export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
  await clearCredentials();
}

async function checkSessionAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${ZDBK_BASE}/jwglxt/xtgl/login_ssologin.html`, {
      credentials: "include",
      redirect:    "follow",
    });
    return !res.url.includes("zjuam.zju.edu.cn");
  } catch { return false; }
}

export async function loadSession(): Promise<ZjuSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ZjuSession;
    if (await checkSessionAlive()) return s;
    // Silently re-login
    const creds = await loadCredentials();
    if (creds) {
      try { return await loginCore(creds.username, creds.password); } catch {}
    }
    return null;
  } catch { return null; }
}

// ─── Core login ───────────────────────────────────────────────────────────────

async function loginCore(username: string, password: string): Promise<ZjuSession> {
  // 每次登录选一个新的 UA，避免固定 UA 触发 CAS 频率限制导致 Step 1 失败
  const ua = randomUA();
  const loginWithService = `${CAS_BASE}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`;

  // ── Step 1: GET 登录页（带 service param）────────────────────────────────
  // XHR 使用 iOS NSURLSession，自动维护 native cookie store（含 _csrf 等）
  const pageRes1 = await xhrGet(loginWithService, ua);
  if (!pageRes1.body) throw new Error("无法访问浙大统一认证页面，请检查网络");

  // ── Step 2: GET RSA 公钥 ─────────────────────────────────────────────────
  const pkRes  = await xhrGet(`${CAS_BASE}/cas/v2/getPubKey`, ua);
  const pkJson = JSON.parse(pkRes.body);
  const modulus  = pkJson.modulus  as string | undefined;
  const exponent = pkJson.exponent as string | undefined;
  if (!modulus || !exponent) throw new Error("RSA 公钥获取失败");

  const pwdEnc = rsaEncrypt(password, modulus, exponent);

  // ── Step 3: 重新 GET 登录页拿新的 execution token ──────────────────────
  // execution token 是一次性的，必须重新 GET 而不是复用 Step1 的 HTML
  const pageRes2 = await xhrGet(loginWithService, ua);
  const fields   = parseCasForm(pageRes2.body);
  if (fields.length === 0) throw new Error("CAS 登录表单解析失败，页面结构可能已变更");

  console.log("[zju-client] form fields:", fields.map(f => `${f.name}(${f.type})`).join(", "));

  const formBody = buildFormBody(fields, username, pwdEnc);

  // ── Step 4: POST 登录 ────────────────────────────────────────────────────
  //
  // 关键发现（来自 login-debug 实验）：
  //   iOS NSURLSession 会静默忽略 redirect:"manual"，自动跟完整条 302 链，
  //   并把 iPlanetDirectoryPro 等 Set-Cookie 存入 native cookie store。
  //   JS 层只看到最终 200，status 永远不会是 302。
  //
  // 因此：
  //   1. 用 redirect:"follow"（iOS 本来就会 follow，显式声明更清晰）
  //   2. 不检查 status===302，改为检查最终 URL 是否落在 zdbk
  //   3. 不需要手动读 Location 头再发第二次请求
  //   4. service 放在 POST URL 的 query string，不放 body（与浏览器抓包一致）
  //   5. native cookie store 在后续所有 fetch/XHR 请求中自动携带，无需手动注入
  //
  const postResp = await fetch(`${CAS_BASE}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`, {
    method:  "POST",
    headers: {
      "Content-Type":             "application/x-www-form-urlencoded",
      "Referer":                   loginWithService,
      "User-Agent":                ua,
      "sec-fetch-dest":            "document",
      "sec-fetch-mode":            "navigate",
      "sec-fetch-site":            "same-origin",
      "sec-fetch-user":            "?1",
      "upgrade-insecure-requests": "1",
    },
    body:        formBody.toString(),
    credentials: "include",  // 让 iOS 把 native store 的 cookie 带上
    redirect:    "follow",   // iOS 会 follow，最终落在 zdbk 或回到 zjuam（失败）
  });

  const finalUrl = postResp.url;

  // 登录失败：最终落点仍在 zjuam（密码错、execution 不匹配、账号被锁）
  if (finalUrl.includes("zjuam.zju.edu.cn")) {
    const errBody = await postResp.text().catch(() => "");
    const errPatterns = [
      /class="[^"]*text-danger/i, /class="[^"]*alert-danger/i,
      /class="[^"]*is-invalid/i,  /id="errormsg"/i,
      /authenticationFailure/i,   /登录失败/,
      /密码不正确|密码错误/,       /账号不存在/,
    ];
    if (errPatterns.some(p => p.test(errBody))) {
      throw new Error("学号或密码错误，请检查后重试");
    }
    throw new Error(
      `CAS 认证失败（最终停在 zjuam）。\n` +
      "可能账号被锁定需要滑块验证，请先在浏览器访问 https://zjuam.zju.edu.cn 解锁。"
    );
  }

  if (!finalUrl.includes("zdbk.zju.edu.cn")) {
    throw new Error(
      `登录未到达 zdbk（最终 URL: ${finalUrl.slice(0, 80)}）\n` +
      "可能账号被锁定，请在浏览器访问 https://zjuam.zju.edu.cn 解锁后重试。"
    );
  }

  console.log(`[zju-client] ✅ 登录成功: ${username}`);

  const session: ZjuSession = { username, jsessionId: "native", routeCookie: null };
  await saveSession(session);
  await saveCredentials(username, password);
  return session;
}

export async function login(username: string, password: string): Promise<ZjuSession> {
  return loginCore(username, password);
}

// ─── Data helpers (native cookie jar, no explicit Cookie header) ──────────────

// 数据请求用固定 UA（登录已完成，native store 有 JSESSIONID，UA 不影响认证）
const DATA_HDR = {
  "User-Agent":      USER_AGENTS[0],
  "Accept":          "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

async function zGet(url: string): Promise<string> {
  const res = await fetch(url, { headers: DATA_HDR, credentials: "include", redirect: "follow" });
  if (res.url.includes("zjuam.zju.edu.cn")) throw new Error("__SESSION_EXPIRED__");
  return res.text().catch(() => "");
}

async function zPost(url: string, body: string): Promise<string> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { ...DATA_HDR, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body,
    credentials: "include",
    redirect:    "follow",
  });
  if (res.url.includes("zjuam.zju.edu.cn")) throw new Error("__SESSION_EXPIRED__");
  return res.text().catch(() => "");
}

async function withRelogin<T>(session: ZjuSession, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    if (e.message !== "__SESSION_EXPIRED__") throw e;
    const creds = await loadCredentials();
    if (!creds) throw new Error("会话已过期，请重新登录");
    await loginCore(creds.username, creds.password);
    return fn();
  }
}

// ─── Period times ─────────────────────────────────────────────────────────────

const PT: Record<number, [string, string]> = {
  1:["08:00","08:45"],2:["08:50","09:35"],3:["10:00","10:45"],
  4:["10:50","11:35"],5:["11:40","12:25"],6:["13:25","14:10"],
  7:["14:15","15:00"],8:["15:05","15:50"],9:["16:15","17:00"],
  10:["17:05","17:50"],11:["18:50","19:35"],12:["19:40","20:25"],13:["20:30","21:15"],
};

function parsePeriod(jcs: string) {
  const m = jcs.match(/0?(\d+)(?:-0?(\d+))?/);
  const s = m ? parseInt(m[1]) : 1, e = m?.[2] ? parseInt(m[2]) : s;
  const ts = PT[s]?.[0] ?? "", te = PT[e]?.[1] ?? "";
  return { start: s, end: e, range: e > s ? `${s}-${e}` : `${s}`, time: ts && te ? `${ts}—${te}` : "" };
}

function parseWeeks(zcd: string) {
  const m = zcd.match(/(\d+)-(\d+)/);
  return m ? { start: parseInt(m[1]), end: parseInt(m[2]) } : { start: 1, end: 16 };
}

function toNum(v: unknown): number | null {
  const n = parseFloat(String(v ?? ""));
  return isNaN(n) ? null : n;
}

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

function yToXnm(t: string) { return t.match(/(\d{4})/)?.[1] ?? t; }
function tToXqm(t: string) {
  if (t.includes("一") || t === "3")  return "3";
  if (t.includes("二") || t === "12") return "12";
  return "3";
}

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

function parseKbList(kbList: any[], yearText: string, termText: string): RawCourse[] {
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
  // 分组键：课程名 + 教师 + 教室 + 星期 + 周次范围 + 单双周
  const grouped = new Map<string, RawCourse[]>();
  for (const course of rawCourses) {
    // 标准化教师和教室（已做）
    const key = `${course.name}|${course.teacher}|${course.classroom}|${course.dayOfWeek}|${course.weekStart}-${course.weekEnd}|${course.isSingleWeek}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(course);
  }

  const mergedCourses: RawCourse[] = [];
  for (const [key, courses] of grouped.entries()) {
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
        // 可选：合并 id（使用第一个的 id 或拼接）
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

export async function fetchMajorGrade(session: ZjuSession): Promise<{ grades: Grade[]; gpa: number; totalCredits: number }> {
  const text = await withRelogin(session, () =>
    zPost(`${ZDBK_BASE}/jwglxt/zycjtj/xszgkc_cxXsZgkcIndex.html?doType=query&queryModel.showCount=5000`, ""));
  const grades = parseGrades(text, true);
  let ws = 0, tc = 0;
  for (const g of grades) {
    // 检查是否满足绩点、学分有效，且成绩字符串是数字格式
    const isValidScore = /^\d+(\.\d+)?$/.test(g.score?.trim() ?? '');
    if (g.gpaPoints != null && g.credit > 0 && isValidScore) {
      ws += g.gpaPoints * g.credit;
      tc += g.credit;
    }
  }
  return { grades, gpa: tc > 0 ? Math.round(ws / tc * 1000) / 1000 : 0, totalCredits: tc };
}

export async function fetchGrade(session: ZjuSession): Promise<{ grades: Grade[]; gpa: number; totalCredits: number }> {
  const text = await withRelogin(session, () =>
    zPost(`${ZDBK_BASE}/jwglxt/cxdy/xscjcx_cxXscjIndex.html?doType=query&queryModel.showCount=5000`, ""));
  console.log("[DEBUG] fetchGrade raw response length:", text.length, "preview:", text.slice(0, 500));
  const grades = parseGrades(text, true);
  let ws = 0, tc = 0;
  for (const g of grades) {
    // 检查是否满足绩点、学分有效，且成绩字符串是数字格式
    const isValidScore = /^\d+(\.\d+)?$/.test(g.score?.trim() ?? '');
    if (g.gpaPoints != null && g.credit > 0 && isValidScore) {
      ws += g.gpaPoints * g.credit;
      tc += g.credit;
    }
  }
  return { grades, gpa: tc > 0 ? Math.round(ws / tc * 1000) / 1000 : 0, totalCredits: tc };
}

function parseGrades(text: string, isMajor: boolean): Grade[] {
  const m = text.match(/(?<="items":)(\[[\s\S]*?\])(?=,"limit")/);
  console.log("[DEBUG] parseGrades regex match:", m ? "success" : "fail", m ? m[1].slice(0, 200) : "");
  if (!m) return [];
  let items: any[]; try { items = JSON.parse(m[1]); } catch { return []; }
  return items.filter(e => e.xkkh != null).map(e => ({
    courseCode: String(e.kch ?? ""), courseName: String(e.kcmc ?? ""),
    credit: parseFloat(String(e.xf ?? "0")) || 0, score: (e.cj), gpaPoints: toNum(e.jd),
    courseType: e.kcxzdm_display ?? e.kclbmc ?? undefined,
    semester: e.xnxqdm_display ?? undefined, isMajor,
  }));
}

// ─── Exams ────────────────────────────────────────────────────────────────────

export async function fetchExams(session: ZjuSession): Promise<ExamInfo[]> {
  const text = await withRelogin(session, () =>
    zPost(`${ZDBK_BASE}/jwglxt/xskscx/kscx_cxXsgrksIndex.html?doType=query&queryModel.showCount=5000`, ""));
  const m = text.match(/(?<="items":)(\[[\s\S]*?\])(?=,"limit")/);
  if (!m) return [];
  let items: any[]; try { items = JSON.parse(m[1]); } catch { return []; }
  return items.filter(e => e.xkkh != null).map(e => {
    let examTime = "";
    if (e.ksrq && e.kssj) { examTime = `${e.ksrq} ${e.kssj}`; if (e.jssj) examTime += `—${e.jssj}`; }
    else if (e.kssj) examTime = String(e.kssj);
    return {
      courseCode: String(e.kch ?? ""), courseName: String(e.kcmc ?? ""),
      examTime, examLocation: String(e.cdmc ?? e.ksdd ?? ""),
      seat: e.zwh != null ? String(e.zwh) : undefined,
      credit: e.xf != null ? parseFloat(String(e.xf)) : undefined,
    };
  });
}

export async function checkSemesterHasCourses(
  session: ZjuSession,
  yearValue: string,
  termValue: string,
): Promise<boolean> {
  try {
    const result = await fetchTimetable(session, yearValue, termValue, "");
    return (result.rawCourses?.length ?? 0) > 0;
  } catch (e) {
    // 如果请求失败（如验证码），保守认为有课，避免误过滤
    console.warn(`检查学期 ${yearValue} ${termValue} 失败:`, e);
    return true;
  }
}
// lib/zju-client.ts 末尾添加
export async function invalidateSession() {
  // 仅清除 session 存储，不清除凭据
  await AsyncStorage.removeItem(SESSION_KEY);
}
export { parseKbList, yToXnm, tToXqm, parsePeriod, parseWeeks };