/**
 * ZJU 各系统基地址与请求头配置。
 */

export const CAS_BASE = "https://zjuam.zju.edu.cn";
export const ZDBK_BASE = "https://zdbk.zju.edu.cn";
export const COURSES_BASE = "https://courses.zju.edu.cn";
export const SERVICE_URL = `${ZDBK_BASE}/jwglxt/xtgl/login_ssologin.html`;

// UA 池：每次登录随机选一个，避免固定 UA 触发 CAS 频率限制
export const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
];

export function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 数据请求用固定 UA（登录已完成，native store 有 JSESSIONID，UA 不影响认证）
export const DATA_HDR = {
  "User-Agent": USER_AGENTS[0],
  "Accept": "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};
