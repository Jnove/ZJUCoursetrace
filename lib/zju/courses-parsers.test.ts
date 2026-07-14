import { describe, it, expect } from "vitest";
import { sanitizeFileName, htmlToPlainText, flattenActivitiesToFiles, parseHomeworkDetail } from "./courses-parsers";

describe("sanitizeFileName", () => {
  it("strips path separators to prevent traversal", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("a/b/c.pdf")).toBe("c.pdf");
    expect(sanitizeFileName("x\\y\\z.ppt")).toBe("z.ppt");
  });
  it("keeps normal names and extensions", () => {
    expect(sanitizeFileName("第1章 绪论.pdf")).toBe("第1章 绪论.pdf");
  });
  it("falls back for empty/blank names", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("///")).toBe("file");
  });
  it("removes characters illegal on common filesystems", () => {
    expect(sanitizeFileName('a:b*c?"<>|.txt')).toBe("abc.txt");
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and keeps text", () => {
    expect(htmlToPlainText("<p>请完成<strong>习题</strong>3.1</p>")).toBe("请完成习题3.1");
  });
  it("turns <br> and block ends into newlines", () => {
    expect(htmlToPlainText("第一行<br/>第二行")).toBe("第一行\n第二行");
    expect(htmlToPlainText("<p>A</p><p>B</p>")).toBe("A\nB");
  });
  it("decodes common entities", () => {
    expect(htmlToPlainText("a &amp; b &lt;c&gt; &nbsp;d")).toBe("a & b <c> d");
  });
  it("decodes &amp; last so escaped entities are not double-decoded", () => {
    expect(htmlToPlainText("&amp;lt;")).toBe("&lt;");
    expect(htmlToPlainText("a &amp; b &lt;c&gt;")).toBe("a & b <c>");
  });
  it("handles empty/nullish", () => {
    expect(htmlToPlainText("")).toBe("");
  });
});

describe("flattenActivitiesToFiles", () => {
  it("flattens uploads across activities and maps fields", () => {
    const activities = [
      { uploads: [{ id: 1, reference_id: 11, name: "a.pdf", size: 100, allow_download: true }] },
      { uploads: [{ id: 2, reference_id: 22, name: "b.ppt", size: 200, allow_download: false }] },
    ];
    expect(flattenActivitiesToFiles(activities)).toEqual([
      { id: 1, referenceId: 11, name: "a.pdf", size: 100, allowDownload: true },
      { id: 2, referenceId: 22, name: "b.ppt", size: 200, allowDownload: false },
    ]);
  });
  it("dedupes by upload id and skips entries without id", () => {
    const activities = [
      { uploads: [{ id: 1, reference_id: 11, name: "a.pdf" }, { id: 1, reference_id: 11, name: "a.pdf" }] },
      { uploads: [{ reference_id: 9, name: "no-id" }] },
    ];
    const out = flattenActivitiesToFiles(activities);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });
  it("defaults allowDownload=true and size=0 when missing", () => {
    const out = flattenActivitiesToFiles([{ uploads: [{ id: 5, reference_id: 5, name: "x" }] }]);
    expect(out[0].allowDownload).toBe(true);
    expect(out[0].size).toBe(0);
  });
  it("handles empty / malformed input", () => {
    expect(flattenActivitiesToFiles([])).toEqual([]);
    expect(flattenActivitiesToFiles([{}])).toEqual([]);
  });
});

describe("parseHomeworkDetail", () => {
  it("extracts title, body, attachments, score, comment", () => {
    const raw = {
      id: 7, title: "作业一",
      description: "<p>完成 <b>3.1</b></p>",
      uploads: [{ id: 1, reference_id: 11, name: "题目.pdf", size: 10, allow_download: true }],
      submission: { score: "95", comment: "不错" },
    };
    expect(parseHomeworkDetail(raw)).toEqual({
      id: 7, title: "作业一", bodyText: "完成 3.1",
      attachments: [{ id: 1, referenceId: 11, name: "题目.pdf", size: 10, allowDownload: true }],
      score: "95", comment: "不错",
    });
  });
  it("nulls score/comment when absent and empty attachments", () => {
    const out = parseHomeworkDetail({ id: 3, title: "T", content: "hi" });
    expect(out.bodyText).toBe("hi");
    expect(out.attachments).toEqual([]);
    expect(out.score).toBeNull();
    expect(out.comment).toBeNull();
  });
  it("preserves a score of 0 / \"0\" (not nulled by a falsy check)", () => {
    expect(parseHomeworkDetail({ id: 1, title: "T", submission: { score: 0 } }).score).toBe("0");
    expect(parseHomeworkDetail({ id: 1, title: "T", score: "0" }).score).toBe("0");
  });
  it("nulls a blank/whitespace comment", () => {
    expect(parseHomeworkDetail({ id: 1, title: "T", submission: { comment: "   " } }).comment).toBeNull();
    expect(parseHomeworkDetail({ id: 1, title: "T", comment: "" }).comment).toBeNull();
  });
  it("falls back to top-level score/comment when submission is absent", () => {
    const d = parseHomeworkDetail({ id: 1, title: "T", score: "88", comment: "ok" });
    expect(d.score).toBe("88");
    expect(d.comment).toBe("ok");
  });
  it("reads the homework body from data.description (real TronClass shape)", () => {
    // 作业活动的正文在 data.description，顶层 description 为 null —— 曾导致「无题目描述」
    const d = parseHomeworkDetail({
      id: 9, title: "T",
      description: null,
      data: { description: "<p>阅读第 4 章</p>" },
    });
    expect(d.bodyText).toBe("阅读第 4 章");
  });
  it("prefers data.description over top-level description", () => {
    const d = parseHomeworkDetail({
      id: 9, title: "T",
      description: "outer",
      data: { description: "inner" },
    });
    expect(d.bodyText).toBe("inner");
  });
});
