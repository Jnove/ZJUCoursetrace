/**
 * app/dev/login-debug.tsx
 * 
 * 完全复刻 login_debug.py。
 * 
 * 唯一核心修复：React Native fetch 不维护 Cookie jar。
 * 改为手动 Cookie jar，对应 Dart 的 cookies.addAll(response.cookies)。
 * 
 * redirect 策略与原版保持一致（除 Step4 POST 外全部 follow）。
 * 
 * 新增 Step 5：获取课表数据，检测课表接口是否正常。
 */

import { useState } from "react";
import {
  ScrollView, View, Text, TextInput,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { PasswordInput } from "@/components/password-input";
import { useColors } from "@/hooks/use-colors";
import { useTheme } from "@/lib/theme-provider";
import { useRouter } from "expo-router";

// 导入 zju-client 中的解析工具
import {
  parseKbList,
  yToXnm,
  tToXqm,
} from "@/lib/zju-client";

// ── 常量 ──────────────────────────────────────────────────────────────────────
const BASE_URL    = "https://zjuam.zju.edu.cn";
const SERVICE_URL = "https://zdbk.zju.edu.cn/jwglxt/xtgl/login_ssologin.html";
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

// ── Manual Cookie Jar ─────────────────────────────────────────────────────────
type CookieJar = Record<string, string>;

function parseSetCookie(response: Response, jar: CookieJar) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return;
  const entries = raw.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_-]*\s*=)/);
  for (const entry of entries) {
    const [nameVal] = entry.split(";");
    const eq = nameVal.indexOf("=");
    if (eq > 0) {
      jar[nameVal.slice(0, eq).trim()] = nameVal.slice(eq + 1).trim();
    }
  }
}

function buildCookieHeader(jar: CookieJar): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── parse_cas_form ────────────────────────────────────────────────────────────
function parseCasForm(html: string): { name: string; value: string; type: string }[] {
  const fields: { name: string; value: string; type: string }[] = [];
  const tagPat = /<input([^>]*?)\/?>/gi;
  function attr(attrs: string, name: string) {
    const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>/"']+))`, "i");
    const m = attrs.match(re);
    return m ? (m[1] ?? m[2] ?? m[3] ?? "") : undefined;
  }
  let m: RegExpExecArray | null;
  while ((m = tagPat.exec(html))) {
    const a     = m[1];
    const name  = attr(a, "name");
    const value = attr(a, "value") ?? "";
    const type  = (attr(a, "type") ?? "text").toLowerCase();
    if (name && !["submit", "button", "image"].includes(type))
      fields.push({ name, value, type });
  }
  return fields;
}

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

// ── sessionGet / sessionPost (手动 Cookie jar) ─────────────────────────────────
const SESSION_HEADERS = {
  "User-Agent":      randomUA(),
  "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

async function sessionGet(
  url: string,
  jar: CookieJar,
): Promise<{ status: number; url: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      ...SESSION_HEADERS,
      ...(Object.keys(jar).length ? { Cookie: buildCookieHeader(jar) } : {}),
    },
    redirect: "follow",
  });
  parseSetCookie(res, jar);
  return { status: res.status, url: res.url, text: await res.text().catch(() => "") };
}

async function sessionPost(
  url: string,
  jar: CookieJar,
  body: string,
  contentType = "application/x-www-form-urlencoded"
): Promise<{ status: number; url: string; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...SESSION_HEADERS,
      "Content-Type": contentType,
      ...(Object.keys(jar).length ? { Cookie: buildCookieHeader(jar) } : {}),
    },
    body,
    redirect: "follow",
  });
  parseSetCookie(res, jar);
  return { status: res.status, url: res.url, text: await res.text().catch(() => "") };
}

// ── Log ───────────────────────────────────────────────────────────────────────
interface Log { id: number; label: string; ok: boolean | null; detail: string }
let seq = 0;
const mk = (l: string, ok: boolean | null, d: string): Log => ({ id: ++seq, label: l, ok, detail: d });

// ── Screen ────────────────────────────────────────────────────────────────────
export default function LoginDebugScreen() {
  const router = useRouter();
  const colors = useColors();
  const { primaryColor } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const add = (e: Log) => setLogs(p => [...p, e]);

  const run = async () => {
    if (!username || !password) return;
    setLogs([]); setBusy(true);

    // 整个登录流程共享同一个 jar
    const jar: CookieJar = {};

    // ── Step 1 ────────────────────────────────────────────────────────────────
    try {
      add(mk("Step 1  GET /cas/login?service=…", null, "…"));
      const r      = await sessionGet(`${BASE_URL}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`, jar);
      const fields = parseCasForm(r.text);
      const pwdFields = fields.filter(f =>
        f.type === "password" || /pwd|pass|credential|encrypt/i.test(f.name));
      add(mk("Step 1  表单字段", fields.length > 0, [
        `status: ${r.status}`,
        `responseURL: ${r.url}`,
        `Total fields: ${fields.length}`,
        `jar keys: ${Object.keys(jar).join(", ") || "（空）"}`,
        ``,
        `ALL FIELDS:`,
        ...fields.map(f => `  ${f.name.padEnd(30)} | ${f.type.padEnd(10)} | ${f.value.slice(0, 40)}`),
        ``,
        `PASSWORD FIELD(S):`,
        pwdFields.length === 0
          ? "  ⚠️ NONE — Step4 将兜底 append password="
          : pwdFields.map(f => `  ✅ "${f.name}" type="${f.type}"`).join("\n"),
      ].join("\n")));
      if (fields.length === 0) { setBusy(false); return; }
    } catch (e: any) { add(mk("Step 1", false, e.message)); setBusy(false); return; }

    // ── Step 2 ────────────────────────────────────────────────────────────────
    let modulus = "", exponent = "";
    try {
      add(mk("Step 2  GET /cas/v2/getPubKey", null, "…"));
      const r  = await sessionGet(`${BASE_URL}/cas/v2/getPubKey`, jar);
      const j  = JSON.parse(r.text);
      modulus  = j.modulus  ?? "";
      exponent = j.exponent ?? "";
      add(mk("Step 2  公钥", !!(modulus && exponent), [
        `status: ${r.status}`,
        `modulus 长度: ${modulus.length}`,
        `exponent: ${exponent || "❌"}`,
        `jar keys: ${Object.keys(jar).join(", ")}`,
      ].join("\n")));
      if (!modulus || !exponent) { setBusy(false); return; }
    } catch (e: any) { add(mk("Step 2", false, e.message)); setBusy(false); return; }

    // ── Step 3 ────────────────────────────────────────────────────────────────
    let encryptedPw = "";
    try {
      encryptedPw = rsaEncrypt(password, modulus, exponent);
      const ok = encryptedPw.length === modulus.length;
      add(mk("Step 3  RSA 加密", ok, [
        `长度: ${encryptedPw.length}（应 = modulus 长度 ${modulus.length}）`,
        `前32位: ${encryptedPw.slice(0, 32)}…`,
      ].join("\n")));
      if (!ok) { setBusy(false); return; }
    } catch (e: any) { add(mk("Step 3", false, e.message)); setBusy(false); return; }

    // ── Step 4 ────────────────────────────────────────────────────────────────
    try {
      add(mk("Step 4  重新 GET → POST /cas/login", null, "…"));
      const encodedService = encodeURIComponent(SERVICE_URL);
      const loginUrl = `${BASE_URL}/cas/login?service=${encodedService}`;

      const pageRes = await sessionGet(loginUrl, jar);
      const fields  = parseCasForm(pageRes.text);

      const data = new URLSearchParams();
      let pwdSet = false;
      for (const { name, value, type } of fields) {
        if (name.toLowerCase() === "username") {
          data.append(name, username);
        } else if (type === "password" || /pwd|pass|credential|encrypt/i.test(name)) {
          data.append(name, encryptedPw);
          pwdSet = true;
        } else if (type === "checkbox" && /remember/i.test(name)) {
          data.append(name, "true");
        } else {
          data.append(name, value);
        }
      }
      if (!data.has("_eventId")) data.append("_eventId", "submit");
      if (!pwdSet) data.append("password", encryptedPw);

      add(mk("Step 4a  POST body", null,
        data.toString().split("&").map(kv => {
          const eq = kv.indexOf("=");
          const k  = decodeURIComponent(kv.slice(0, eq));
          const v  = decodeURIComponent(kv.slice(eq + 1));
          return /pass|encrypt/i.test(k)
            ? `  ${k.padEnd(28)} = ${v.slice(0, 16)}… [encrypted, len=${v.length}]`
            : `  ${k.padEnd(28)} = ${v.slice(0, 60)}`;
        }).join("\n") +
        `\n\njar keys: ${Object.keys(jar).join(", ")}`
      ));

      const postResp = await fetch(`${BASE_URL}/cas/login?service=${encodedService}`, {
        method:  "POST",
        headers: {
          "Content-Type":             "application/x-www-form-urlencoded",
          "Referer":                   loginUrl,
          "User-Agent":                randomUA(),
          "sec-fetch-dest":            "document",
          "sec-fetch-mode":            "navigate",
          "sec-fetch-site":            "same-origin",
          "sec-fetch-user":            "?1",
          "upgrade-insecure-requests": "1",
          Cookie:                      buildCookieHeader(jar),
        },
        body:     data.toString(),
        redirect: "manual",
      });
      parseSetCookie(postResp, jar);

      const postStatus = postResp.status;
      const location   = postResp.headers.get("Location") ?? "";
      const is302 = postStatus === 302 || postStatus === 0;

      add(mk("Step 4b  POST 响应", is302, [
        `status: ${postStatus}${postStatus === 0 ? " (opaque, 视为302)" : ""}`,
        `Location: ${location || "无"}`,
        `jar keys: ${Object.keys(jar).join(", ")}`,
        `iPlanetDirectoryPro: ${jar["iPlanetDirectoryPro"]
          ? "✅ " + jar["iPlanetDirectoryPro"].slice(0, 20) + "…"
          : "❌ 未获取 — execution 不匹配或密码错误"}`,
      ].join("\n")));

      // 以下注释是因为 iOS 会自动跟随重定向，不需要手动处理
      // if (!is302 || !location) {
      //   try {
      //     const errText = await postResp.text();
      //     const errM    = errText.match(/<div[^>]*class="error"[^>]*>([\s\S]*?)<\/div>/i);
      //     add(mk("Step 4  登录失败", false, [
      //       errM ? `错误信息: ${errM[1].replace(/<[^>]*>/g, "").trim()}` : "",
      //       `响应体前500:\n${errText.slice(0, 500)}`,
      //     ].filter(Boolean).join("\n")));
      //   } catch (_) {
      //     add(mk("Step 4  opaque — 无法读响应体", false,
      //       "status=0 且 Location 为空，无法继续。\n" +
      //       `jar keys: ${Object.keys(jar).join(", ")}`));
      //   }
      //   setBusy(false); return;
      // }

      // const resolved = location.startsWith("/") ? `${BASE_URL}${location}` : location;
      // const finalResp = await fetch(resolved, {
      //   headers: { "User-Agent": USER_AGENT, Cookie: buildCookieHeader(jar) },
      //   redirect: "follow",
      // });
      // parseSetCookie(finalResp, jar);
      // const onZdbk = finalResp.url.includes("zdbk.zju.edu.cn");

      // add(mk("Step 4c  跟随重定向", onZdbk, [
      //   `最终 URL: ${finalResp.url}`,
      //   `On zdbk: ${onZdbk ? "✅" : "❌"}`,
      //   `jar keys: ${Object.keys(jar).join(", ")}`,
      // ].join("\n")));
      // if (!onZdbk) { setBusy(false); return; }
    } catch (e: any) { add(mk("Step 4", false, e.message)); setBusy(false); return; }

    // ── Step 5 完整重写（适配真实 API 字段，正确分离教室和考试时间）────────────────
  try {
    add(mk("Step 5  获取课表数据", null, "请求学期选项页…"));

    // 1. 获取学期选项页面（必须带 gnmkdm 和 su，且 su 为学号）
    const semUrl = `${SERVICE_URL.replace("/jwglxt/xtgl/login_ssologin.html", "")}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N253508&su=${username}`;
    const semResp = await sessionGet(semUrl, jar);

    if (semResp.url.includes("zjuam.zju.edu.cn")) {
      throw new Error("会话无效，可能登录失败");
    }

    // 2. 解析学年选项（value 格式如 "2025-2026"）
    const yearOptions: { value: string; text: string; selected: boolean }[] = [];
    const yearSelectMatch = semResp.text.match(/<select[^>]*id="xnm"[^>]*>([\s\S]*?)<\/select>/i);
    if (yearSelectMatch) {
      const optRe = /<option(?:\s+[^>]*)?\s+value="([^"]+)"(?:\s+selected)?\s*>([^<]*)<\/option>/gi;
      let m: RegExpExecArray | null;
      while ((m = optRe.exec(yearSelectMatch[1]))) {
        yearOptions.push({
          value: m[1],
          text: m[2].trim().replace(/&amp;/g, "&"),
          selected: m[0].includes("selected"),
        });
      }
    }

    // 3. 解析学期选项（value 格式如 "2|春"）
    const termOptions: { value: string; text: string; selected: boolean }[] = [];
    const termSelectMatch = semResp.text.match(/<select[^>]*id="xqm"[^>]*>([\s\S]*?)<\/select>/i);
    if (termSelectMatch) {
      const optRe = /<option(?:\s+[^>]*)?\s+value="([^"]+)"(?:\s+selected)?\s*>([^<]*)<\/option>/gi;
      let m: RegExpExecArray | null;
      while ((m = optRe.exec(termSelectMatch[1]))) {
        termOptions.push({
          value: m[1],
          text: m[2].trim().replace(/&amp;/g, "&"),
          selected: m[0].includes("selected"),
        });
      }
    }

    if (yearOptions.length === 0 || termOptions.length === 0) {
      throw new Error("学期选项解析失败，请检查页面结构");
    }

    const selectedYear = yearOptions.find(o => o.selected)?.value ?? yearOptions[0].value;
    const selectedTerm = termOptions.find(o => o.selected)?.value ?? termOptions[0].value;

    // 从 value 中提取显示文本（如 "2|春" -> "春"）和学期标识（竖线前的数字）
    const termValueParts = selectedTerm.split("|");
    const termCode = termValueParts[0];      // "1" 或 "2"
    const termDisplay = termValueParts[1] || selectedTerm; // "春"/"秋" 等

    add(mk("Step 5a  学期识别", true, [
      `学年 value: ${selectedYear}`,
      `学期 value: ${selectedTerm} → 学期码: ${termCode}, 显示名: ${termDisplay}`,
    ].join("\n")));

    // 4. 构建 POST 表单（与浏览器抓包一致）
    const kbUrl = `${SERVICE_URL.replace("/jwglxt/xtgl/login_ssologin.html", "")}/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N253508&su=${username}`;
    const formData = new URLSearchParams();
    formData.append("xnm", selectedYear);
    formData.append("xqm", selectedTerm);
    formData.append("xqmmc", termDisplay);
    formData.append("xxqf", "0");
    formData.append("xsfs", "0");

    add(mk("Step 5b  发送课表请求", null, `POST ${kbUrl}\n表单: ${formData.toString()}`));

    const kbResp = await sessionPost(kbUrl, jar, formData.toString());
    const kbText = kbResp.text.trim();

    if (kbText.includes("captcha_error")) {
      add(mk("Step 5c  课表获取", false, "需要验证码，无法自动获取课表"));
      setBusy(false);
      return;
    }
    add(mk("Step 5d  课表获取", 1 > 0, [
      `课表总数: `,
      kbText,
      `原始响应长度: ${kbText.length}`,
    ].join("\n")));
    // 5. 解析 JSON 响应
    let data: any;
    try {
      data = JSON.parse(kbText);
    } catch {
      // 尝试正则提取（防御）
      const match = kbText.match(/"kbList"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (!match) throw new Error("课表数据解析失败，非JSON格式");
      data = { kbList: JSON.parse(match[1]) };
    }

    const rawList = data?.kbList ?? data?.kblist ?? [];

    // ── 自定义解析函数，适配实际 API 字段（kcb 包含 HTML 信息，分离教室和考试时间） ──
    function parseKbItem(item: any) {
    let name = "";
    let teacher = "";
    let classroom = "";
    let examInfo = "";

    if (item.kcb) {
      const parts = item.kcb.split(/<br\s*\/?>/i);
      name = parts[0]?.trim() || "";
      // 第三部分通常为教师（索引2）
      if (parts.length >= 3) teacher = parts[2]?.trim() || "";
      // 第四部分包含教室+考试信息
      if (parts.length >= 4) {
        let rest = parts[3]?.trim() || "";
        // 匹配考试时间模式
        const examMatch = rest.match(/(\d{4}年\d{1,2}月\d{1,2}日\([^)]+\))/);
        if (examMatch) {
          examInfo = examMatch[1];
          classroom = rest.substring(0, examMatch.index).trim();
        } else {
          classroom = rest;
        }
        // 统一清理教室末尾的 "zwf" 及其后续字符（如 "zwf2026年..." 或单独的 "zwf"）
        classroom = classroom.replace(/zwf.*$/i, "").trim();
      }
    }

    // 回退字段
    if (!name && item.kcmc) name = item.kcmc;
    if (!teacher && (item.xm || item.jsxm)) teacher = item.xm || item.jsxm;
    if (!classroom && item.cdmc) classroom = item.cdmc;

    // 解析周次、节次等（沿用原有逻辑）
    const weekMatch = (item.zcd || "").match(/(\d+)-(\d+)/);
    const weekStart = weekMatch ? parseInt(weekMatch[1]) : 1;
    const weekEnd = weekMatch ? parseInt(weekMatch[2]) : 16;

    const periodMatch = (item.jcs || "").match(/(\d+)-?(\d+)?/);
    const startPeriod = periodMatch ? parseInt(periodMatch[1]) : 1;
    const endPeriod = periodMatch && periodMatch[2] ? parseInt(periodMatch[2]) : startPeriod;

    const dsz = item.dsz;
    let isSingleWeek: "single" | "double" | "both" = "both";
    if (dsz === "1") isSingleWeek = "single";
    else if (dsz === "2") isSingleWeek = "double";

    return {
      id: item.xkkh || `${item.kcb}_${item.xqj}`,
      name,
      teacher,
      classroom,
      dayOfWeek: parseInt(item.xqj || "1"),
      startPeriod,
      endPeriod,
      weekStart,
      weekEnd,
      isSingleWeek,
      periodTime: "",
      courseCode: item.kch || undefined,
      semester: `${selectedYear} ${termDisplay}`,
      examInfo,
    };
  }

    const rawCourses = rawList.map(parseKbItem);
    const courseCount = rawCourses.length;
    const sample = rawCourses.slice(0, 3).map((c: any) => {
      let info = `${c.name || "?"}（${c.teacher || "?"}）`;
      if (c.classroom) info += ` 地点：${c.classroom}`;
      if (c.examInfo) info += ` 考试:${c.examInfo}`;
      return info;
    }).join("；");

    add(mk("Step 5d  课表获取", courseCount > 0, [
      `课表总数: ${courseCount}`,
      courseCount > 0 ? `示例课程: ${sample}` : "无课程数据",
      `原始响应长度: ${kbText.length}`,
    ].join("\n")));
  } catch (e: any) {
    add(mk("Step 5  课表获取失败", false, e.message));
  }
    

    setBusy(false);
  };

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <View style={{ flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:colors.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color:primaryColor, fontSize:15 }}>← 返回</Text>
        </TouchableOpacity>
        <Text style={{ flex:1, textAlign:"center", fontWeight:"700", fontSize:15, color:colors.foreground }}>
          CAS 调试 + 课表测试
        </Text>
        <TouchableOpacity onPress={() => setLogs([])}>
          <Text style={{ fontSize:13, color:colors.muted }}>清除</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding:16, gap:12, paddingBottom:40 }}>
        <View style={{ backgroundColor:colors.background, borderRadius:12, borderWidth:0.5, borderColor:colors.border, padding:16, gap:12 }}>
          <TextInput
            value={username} onChangeText={setUsername}
            placeholder="学号" placeholderTextColor={colors.muted} autoCapitalize="none"
            style={{ backgroundColor:colors.surface, borderRadius:8, borderWidth:0.5, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10, color:colors.foreground, fontSize:15 }}
          />
          <PasswordInput value={password} onChangeText={setPassword} placeholder="密码" />
        </View>

        <TouchableOpacity onPress={run} disabled={busy || !username || !password}
          style={{ backgroundColor:primaryColor, borderRadius:10, paddingVertical:14, alignItems:"center", opacity:(busy||!username||!password)?0.5:1, flexDirection:"row", justifyContent:"center", gap:8 }}>
          {busy && <ActivityIndicator size="small" color="#fff" />}
          <Text style={{ color:"#fff", fontWeight:"600", fontSize:15 }}>{busy ? "测试中…" : "运行"}</Text>
        </TouchableOpacity>

        <View style={{ backgroundColor:`${primaryColor}12`, borderRadius:10, borderWidth:0.5, borderColor:`${primaryColor}30`, padding:14 }}>
          <Text style={{ fontSize:12, color:colors.muted, lineHeight:19 }}>
            修复：手动 Cookie jar（对应 Python Session / Dart cookies.addAll）{"\n"}
            Step1/2/4-reGET: redirect follow（原版行为）{"\n"}
            Step4 POST: redirect manual + 手动注入 Cookie{"\n"}
            Step4b 成功标志：jar 里出现 iPlanetDirectoryPro{"\n"}
            Step5 实际获取课表并显示数量。
          </Text>
        </View>

        {logs.map(log => (
          <View key={log.id} style={{ borderRadius:10, overflow:"hidden", borderWidth:1, borderColor:log.ok===null?colors.border:log.ok?colors.success:colors.error }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:8, padding:12, backgroundColor:log.ok===null?colors.surface:log.ok?`${colors.success}18`:`${colors.error}18` }}>
              <Text style={{ fontSize:14 }}>{log.ok===null?"⏳":log.ok?"✅":"❌"}</Text>
              <Text style={{ flex:1, fontSize:13, fontWeight:"600", color:log.ok===null?colors.foreground:log.ok?colors.success:colors.error }}>{log.label}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <Text style={{ fontFamily:"monospace", fontSize:11, color:colors.foreground, padding:12, lineHeight:17, backgroundColor:colors.background }}>{log.detail}</Text>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}