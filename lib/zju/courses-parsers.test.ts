import { describe, it, expect } from "vitest";
import { sanitizeFileName } from "./courses-parsers";

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
