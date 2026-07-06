/**
 * CAS 统一认证：登录流程、会话与凭据管理。
 *
 * Auth flow:
 *   1. XHR  GET  /cas/login?service=ZDBK_SSO     → parse ALL form fields
 *   2. XHR  GET  /cas/v2/getPubKey               → RSA modulus + exponent
 *   3. RSA encrypt password, pad to mod.length    (NOT hardcoded 256)
 *   4. Re-GET login page for fresh execution token
 *   5. XHR POST /cas/login  (redirect followed natively)
 *      → final URL on zdbk or back to zjuam (failure)
 *   6. Verify: final URL on zdbk domain
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { CAS_BASE, ZDBK_BASE, SERVICE_URL, randomUA } from "./config";
import { xhrGet, xhrPost } from "./http";
import { rsaEncrypt } from "./rsa";
import type { ZjuSession } from "./types";

const SESSION_KEY = "zju_session_v3";
const CREDENTIALS_KEY = "zju_credentials_v1";

// ─── Form parser ──────────────────────────────────────────────────────────────

interface FormField { name: string; value: string; type: string }

export function parseCasForm(html: string): FormField[] {
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
    const a = m[1];
    const name = getAttr(a, "name");
    const value = getAttr(a, "value") ?? "";
    const type = (getAttr(a, "type") ?? "text").toLowerCase();
    if (name && !["submit", "button", "image"].includes(type))
      fields.push({ name, value, type });
  }
  return fields;
}

export function buildFormBody(
  fields: FormField[],
  username: string,
  pwdEnc: string,
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

// ─── Credential storage ───────────────────────────────────────────────────────

async function saveCredentials(u: string, p: string) {
  try { await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify({ username: u, password: p })); } catch { }
}
export async function loadCredentials(): Promise<{ username: string; password: string } | null> {
  try { const r = await SecureStore.getItemAsync(CREDENTIALS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function clearCredentials() {
  try { await SecureStore.deleteItemAsync(CREDENTIALS_KEY); } catch { }
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

export async function invalidateSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

async function checkSessionAlive(): Promise<boolean> {
  try {
    const ua = randomUA(); // use any UA
    const { url } = await xhrGet(`${ZDBK_BASE}/jwglxt/xtgl/login_ssologin.html`, ua, 10000);
    return !url.includes("zjuam.zju.edu.cn");
  } catch {
    return false;
  }
}

export async function loadSession(): Promise<ZjuSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw) as ZjuSession;
      if (await checkSessionAlive()) return s;
      console.log("[zju-client] 已存会话失效，尝试静默重登");
    }
    // Silently re-login
    const creds = await loadCredentials();
    if (creds) {
      try { return await loginCore(creds.username, creds.password); } catch { }
    }
    return null;
  } catch { return null; }
}

// ─── Core login
// - Step 1 被重定向到非 zjuam.zju.edu.cn → 换 UA 重试，最多 5 次
// - Step 1 网络错误 / 超时（无响应）→ 立即 throw，不进行 Step 2+

async function loginCore(username: string, password: string): Promise<ZjuSession> {
  const loginWithService = `${CAS_BASE}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`;

  // ── Step 1: GET 登录页 ────────────────────────────────────────────────────
  // 若被重定向到非 zjuam 域名，换 UA 重试；若网络无响应则立即终止。
  const MAX_STEP1_RETRIES = 5;
  let pageRes1: Awaited<ReturnType<typeof xhrGet>> | null = null;
  let ua = randomUA();

  for (let attempt = 0; attempt < MAX_STEP1_RETRIES; attempt++) {
    if (attempt > 0) {
      ua = randomUA();
      console.log(`[zju-client] Step1 retry ${attempt} with new UA`);
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

    if (res.url.includes("zjuam.zju.edu.cn")) {
      // 正常落地到 CAS 登录页
      pageRes1 = res;
      break;
    }

    // 被重定向到其他域名（如验证码页、中间跳转页等），换 UA 重试
    console.warn(`[zju-client] Step1 redirected to unexpected URL: ${res.url.slice(0, 80)}`);
  }

  if (!pageRes1) {
    throw new Error(
      "CAS 登录页面持续重定向到非认证地址，请稍后重试。\n" +
      "如问题持续，可尝试在浏览器访问 https://zjuam.zju.edu.cn 解锁账号。"
    );
  }

  // ── Step 2: GET RSA 公钥 ─────────────────────────────────────────────────
  const pkRes = await xhrGet(`${CAS_BASE}/cas/v2/getPubKey`, ua);
  const pkJson = JSON.parse(pkRes.body);
  const modulus  = pkJson.modulus  as string | undefined;
  const exponent = pkJson.exponent as string | undefined;
  if (!modulus || !exponent) throw new Error("RSA 公钥获取失败");

  const pwdEnc = rsaEncrypt(password, modulus, exponent);

  // ── Step 3: 重新 GET 登录页拿新的 execution token ──────────────────────
  const pageRes2 = await xhrGet(loginWithService, ua);
  const fields   = parseCasForm(pageRes2.body);
  if (fields.length === 0) throw new Error("CAS 登录表单解析失败，页面结构可能已变更");

  console.log("[zju-client] form fields:", fields.map(f => `${f.name}(${f.type})`).join(", "));

  const formBody = buildFormBody(fields, username, pwdEnc);

  // ── Step 4: POST 登录 ────────────────────────────────────────────────────
  const postResp = await xhrPost(
    `${CAS_BASE}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`,
    formBody.toString(),
    {
      "Content-Type":             "application/x-www-form-urlencoded",
      "Referer":                   loginWithService,
      "sec-fetch-dest":            "document",
      "sec-fetch-mode":            "navigate",
      "sec-fetch-site":            "same-origin",
      "sec-fetch-user":            "?1",
      "upgrade-insecure-requests": "1",
    },
    ua,
    20000
  );

  const finalUrl = postResp.url;

  if (finalUrl.includes("zjuam.zju.edu.cn")) {
    const errBody    = postResp.body;
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
      "CAS 认证失败（最终停在 zjuam）。\n" +
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

/**
 * 会话过期时用已存凭据静默重登，并重试一次请求。
 */
export async function withRelogin<T>(_session: ZjuSession, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  }
  catch (e: any) {
    if (e.message !== "__SESSION_EXPIRED__") throw e;
    const creds = await loadCredentials();
    if (!creds) throw new Error("会话已过期，请重新登录");
    console.log("重新登录");
    await loginCore(creds.username, creds.password);
    return fn();
  }
}
