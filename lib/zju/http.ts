/**
 * XHR helpers（native cookie jar，不手动带 Cookie 头）。
 *
 * 全部用 XHR 而非 fetch：Android 上 fetch 跨域重定向会得到 status=0，
 * XHR 能通过 responseURL 拿到重定向后的最终地址。
 */

import { DATA_HDR } from "./config";

export interface XhrResponse {
  status: number;
  body: string;
  url: string;   // final URL after redirects
}

export function xhrGet(url: string, ua: string, timeoutMs: number = 20000): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader("User-Agent", ua);
    xhr.setRequestHeader("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
    xhr.setRequestHeader("Accept-Language", "zh-CN,zh;q=0.9");
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      resolve({
        status: xhr.status,
        body: xhr.responseText ?? "",
        url: xhr.responseURL ?? url,
      });
    };
    xhr.onerror = () => reject(new Error("网络请求失败"));
    xhr.ontimeout = () => reject(new Error("请求超时，请重试"));
    xhr.send(null);
  });
}

export function xhrPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  ua: string,
  timeoutMs: number = 20000
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader("User-Agent", ua);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      resolve({
        status: xhr.status,
        body: xhr.responseText ?? "",
        url: xhr.responseURL ?? url,
      });
    };
    xhr.onerror = () => reject(new Error("网络请求失败"));
    xhr.ontimeout = () => reject(new Error("请求超时，请重试"));
    xhr.send(body);
  });
}

// ─── 已登录会话下的数据请求（被重定向回 CAS 即视为会话过期） ───────────────────

export async function zGet(url: string): Promise<string> {
  const ua = DATA_HDR["User-Agent"];
  const { body, url: finalUrl } = await xhrGet(url, ua, 15000);
  if (finalUrl.includes("zjuam.zju.edu.cn") || finalUrl.includes("login_slogin.html")) throw new Error("__SESSION_EXPIRED__");
  return body;
}

export async function zPost(url: string, body: string): Promise<string> {
  const ua = DATA_HDR["User-Agent"];
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    ...DATA_HDR,
  };
  const { body: respBody, url: finalUrl } = await xhrPost(url, body, headers, ua, 15000);
  if (finalUrl.includes("zjuam.zju.edu.cn")) throw new Error("__SESSION_EXPIRED__");
  return respBody;
}

export async function zPostJson(url: string, data: any): Promise<string> {
  const ua = DATA_HDR["User-Agent"];
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": ua,
  };
  const { body, url: finalUrl } = await xhrPost(url, JSON.stringify(data), headers, ua, 15000);
  if (finalUrl.includes("zjuam.zju.edu.cn")) throw new Error("__COURSES_EXPIRED__");
  return body;
}

/** courses.zju.edu.cn 的 GET（会话失效标记与 zdbk 区分开） */
export async function zGetCourse(url: string): Promise<string> {
  const { body, url: fin } = await xhrGet(url, DATA_HDR["User-Agent"], 15000);
  if (fin.includes("zjuam.zju.edu.cn")) throw new Error("__COURSES_EXPIRED__");
  return body;
}

/**
 * 二进制 GET：走和 zGetCourse 相同的原生 cookie jar（会话天然有效）。
 * 返回 base64（不含 data URI 前缀），供 expo-file-system 以 Base64 落盘。
 * 会话失效判定交调用方（看 finalUrl 是否落到 zjuam）。
 */
export function xhrGetBinary(
  url: string,
  timeoutMs: number = 30000
): Promise<{ base64: string; finalUrl: string; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.timeout = timeoutMs;
    xhr.responseType = "blob";
    xhr.setRequestHeader("User-Agent", DATA_HDR["User-Agent"]);
    xhr.setRequestHeader("Accept", "*/*");
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      const finalUrl = xhr.responseURL ?? url;
      const status = xhr.status;
      if (status < 200 || status >= 300) {
        reject(new Error(`__HTTP_${status}__`));
        return;
      }
      const blob = xhr.response as Blob;
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.onloadend = () => {
        const dataUrl = String(reader.result ?? "");
        const comma = dataUrl.indexOf(",");
        resolve({ base64: comma >= 0 ? dataUrl.slice(comma + 1) : "", finalUrl, status });
      };
      reader.readAsDataURL(blob);
    };
    xhr.onerror = () => reject(new Error("网络请求失败"));
    xhr.ontimeout = () => reject(new Error("下载超时，请重试"));
    xhr.send(null);
  });
}
