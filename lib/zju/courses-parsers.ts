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

/** 富文本 → 纯文本：块级/换行转 \n，剥标签，解码常见实体，折叠多余空白。 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  let s = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}
