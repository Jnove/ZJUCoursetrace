import { describe, it, expect } from "vitest";
import { sanitizeFileName, htmlToPlainText } from "./courses-parsers";

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
  it("handles empty/nullish", () => {
    expect(htmlToPlainText("")).toBe("");
  });
});
