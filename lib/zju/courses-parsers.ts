/**
 * courses.zju.edu.cn(TronClass) 纯解析/清洗函数。
 * 不 import react-native —— 供 vitest 在 node 下直接运行。
 */

import type { CoursewareFile, HomeworkDetail } from "./types";

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
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/** activities[].uploads[] → 去重的 CoursewareFile[]（字段缺省安全默认）。 */
export function flattenActivitiesToFiles(activities: any[]): CoursewareFile[] {
  const seen = new Set<number>();
  const out: CoursewareFile[] = [];
  for (const act of activities ?? []) {
    for (const up of act?.uploads ?? []) {
      const id = up?.id;
      if (typeof id !== "number" || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        referenceId: typeof up?.reference_id === "number" ? up.reference_id : id,
        name: String(up?.name ?? ""),
        size: typeof up?.size === "number" ? up.size : 0,
        allowDownload: up?.allow_download !== false,
      });
    }
  }
  return out;
}

/** 作业活动详情 JSON → HomeworkDetail（字段容错）。 */
export function parseHomeworkDetail(raw: any): HomeworkDetail {
  // 作业活动的题目正文在 data.description（顶层 description 对 homework 类型为空，
  // 参考 fiz 的 homework["data"]["description"]）；顶层字段仅作兜底
  const body = raw?.data?.description ?? raw?.description ?? raw?.content ?? "";
  const attachments = flattenActivitiesToFiles([{ uploads: raw?.uploads ?? [] }]);
  const score = raw?.submission?.score ?? raw?.score ?? null;
  const comment = raw?.submission?.comment ?? raw?.comment ?? null;
  return {
    id: Number(raw?.id ?? 0),
    title: String(raw?.title ?? ""),
    bodyText: htmlToPlainText(String(body)),
    attachments,
    score: score != null ? String(score) : null,
    comment: comment != null && String(comment).trim() !== "" ? String(comment) : null,
  };
}
