/**
 * courses.zju.edu.cn(TronClass) 纯解析/清洗函数。
 * 不 import react-native —— 供 vitest 在 node 下直接运行。
 */

/** 文件名清洗：取路径末段，去掉文件系统非法字符，防路径穿越。 */
export function sanitizeFileName(name: string): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[<>:"|?*]/g, "").trim();
  return cleaned.length > 0 ? cleaned : "file";
}
