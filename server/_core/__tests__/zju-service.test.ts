import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cheerio from 'cheerio';

/**
 * 测试课程详情解析方法
 * 模拟 _parseCoursDetails 方法的行为
 */
describe('ZJU Service - Course Parsing', () => {
  /**
   * 模拟 _parseCoursDetails 方法
   * 使用 cheerio 的 contents() 方法提取文本
   */
  function parseCoursDetails(html: string): Record<string, string> {
    const $ = cheerio.load(html);
    const fontElement = $('font');
    const result: Record<string, string> = {};

    try {
      // 获取整个文本然后按换行符分割
      const fullText = fontElement.text();
      const textLines = fullText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      // 按照固定顺序解析
      if (textLines.length > 0) {
        result["course_name"] = textLines[0];
      }

      if (textLines.length > 1) {
        const timeSlotRaw = textLines[1];
        result["time_slot"] = timeSlotRaw;

        // 提取周次范围
        const weekMatch = timeSlotRaw.match(/第(\d+-\d+)周/);
        if (weekMatch) {
          result["week_range"] = weekMatch[1];
        }
      }

      if (textLines.length > 2) {
        result["teacher"] = textLines[2];
      }

      if (textLines.length > 3) {
        result["location"] = textLines[3];
      }

      // 检查考试信息
      if (textLines.length > 4) {
        const examTimePattern = /\d{4}年\d{2}月\d{2}日\(\d{2}:\d{2}-\d{2}:\d{2}\)/;
        if (examTimePattern.test(textLines[4])) {
          result["exam_time"] = textLines[4];
          if (textLines.length > 5) {
            result["exam_location"] = textLines[5];
          }
        }
      }
    } catch (error) {
      console.error("解析课程详情时出错:", error);
    }

    return result;
  }

  it('应该正确解析基本课程信息', () => {
    const html = `
      <font>
        数据结构
        星期一 第1-2节 第1-16周
        张三
        教室A101
      </font>
    `;

    const result = parseCoursDetails(html);

    expect(result.course_name).toBe('数据结构');
    expect(result.time_slot).toContain('星期一');
    expect(result.teacher).toBe('张三');
    expect(result.location).toBe('教室A101');
  });

  it('应该正确提取周次范围', () => {
    const html = `
      <font>
        算法设计
        星期二 第3-4节 第1-8周
        李四
        教室B202
      </font>
    `;

    const result = parseCoursDetails(html);

    expect(result.course_name).toBe('算法设计');
    expect(result.week_range).toBe('1-8');
  });

  it('应该处理包含换行符的HTML', () => {
    const html = `
      <font>
        数据库原理
        星期三 第5-6节 第9-16周
        王五
        教室C303
      </font>
    `;

    const result = parseCoursDetails(html);

    expect(result.course_name).toBe('数据库原理');
    expect(result.teacher).toBe('王五');
    expect(result.location).toBe('教室C303');
    expect(result.week_range).toBe('9-16');
  });

  it('应该处理缺少某些字段的课程信息', () => {
    const html = `
      <font>
        操作系统
        星期四 第7-8节 第1-16周
      </font>
    `;

    const result = parseCoursDetails(html);

    expect(result.course_name).toBe('操作系统');
    expect(result.time_slot).toContain('星期四');
    expect(result.teacher).toBeUndefined();
    expect(result.location).toBeUndefined();
  });

  it('应该正确解析包含考试信息的课程', () => {
    const html = `
      <font>
        编译原理
        星期五 第9-10节 第1-16周
        赵六
        教室D404
        2024年12月20日(14:00-16:00)
        考试中心
      </font>
    `;

    const result = parseCoursDetails(html);

    expect(result.course_name).toBe('编译原理');
    expect(result.exam_time).toBe('2024年12月20日(14:00-16:00)');
    expect(result.exam_location).toBe('考试中心');
  });

  it('应该处理空的或无效的HTML', () => {
    const html = `<font></font>`;

    const result = parseCoursDetails(html);

    expect(Object.keys(result).length).toBe(0);
  });

  it('应该处理只有课程名的情况', () => {
    const html = `
      <font>
        计算机网络
      </font>
    `;

    const result = parseCoursDetails(html);

    expect(result.course_name).toBe('计算机网络');
    expect(result.time_slot).toBeUndefined();
    expect(result.teacher).toBeUndefined();
  });
});

/**
 * 测试学期选择功能
 */
describe('ZJU Service - Semester Selection', () => {
  it('应该正确解析学年选项', () => {
    const html = `
      <select id="xnm">
        <option value="2023">2023-2024学年</option>
        <option value="2024" selected>2024-2025学年</option>
        <option value="2025">2025-2026学年</option>
      </select>
    `;

    const $ = cheerio.load(html);
    const yearOptions: any[] = [];

    $("select#xnm option").each((_, el) => {
      const value = $(el).attr("value");
      const text = $(el).text().trim();
      const selected = $(el).attr("selected") !== undefined;
      if (value) {
        yearOptions.push({ value, text, selected });
      }
    });

    expect(yearOptions.length).toBe(3);
    expect(yearOptions[1].selected).toBe(true);
    expect(yearOptions[1].text).toBe('2024-2025学年');
  });

  it('应该正确解析学期选项', () => {
    const html = `
      <select id="xqm">
        <option value="3">第一学期</option>
        <option value="12" selected>第二学期</option>
      </select>
    `;

    const $ = cheerio.load(html);
    const termOptions: any[] = [];

    $("select#xqm option").each((_, el) => {
      const value = $(el).attr("value");
      const text = $(el).text().trim();
      const selected = $(el).attr("selected") !== undefined;
      if (value) {
        termOptions.push({ value, text, selected });
      }
    });

    expect(termOptions.length).toBe(2);
    expect(termOptions[1].selected).toBe(true);
    expect(termOptions[1].text).toBe('第二学期');
  });

  it('应该正确识别当前选中的学年和学期', () => {
    const html = `
      <select id="xnm">
        <option value="2023">2023-2024学年</option>
        <option value="2024" selected>2024-2025学年</option>
      </select>
      <select id="xqm">
        <option value="3">第一学期</option>
        <option value="12" selected>第二学期</option>
      </select>
    `;

    const $ = cheerio.load(html);
    
    const yearOptions: any[] = [];
    $("select#xnm option").each((_, el) => {
      const value = $(el).attr("value");
      const text = $(el).text().trim();
      const selected = $(el).attr("selected") !== undefined;
      if (value) {
        yearOptions.push({ value, text, selected });
      }
    });

    const termOptions: any[] = [];
    $("select#xqm option").each((_, el) => {
      const value = $(el).attr("value");
      const text = $(el).text().trim();
      const selected = $(el).attr("selected") !== undefined;
      if (value) {
        termOptions.push({ value, text, selected });
      }
    });

    const currentYear = yearOptions.find((opt) => opt.selected)?.text;
    const currentTerm = termOptions.find((opt) => opt.selected)?.text;

    expect(currentYear).toBe('2024-2025学年');
    expect(currentTerm).toBe('第二学期');
  });

  it('应该处理没有选中选项的情况', () => {
    const html = `
      <select id="xnm">
        <option value="2023">2023-2024学年</option>
        <option value="2024">2024-2025学年</option>
      </select>
    `;

    const $ = cheerio.load(html);
    const yearOptions: any[] = [];

    $("select#xnm option").each((_, el) => {
      const value = $(el).attr("value");
      const text = $(el).text().trim();
      const selected = $(el).attr("selected") !== undefined;
      if (value) {
        yearOptions.push({ value, text, selected });
      }
    });

    const currentYear = yearOptions.find((opt) => opt.selected)?.text;

    expect(currentYear).toBeUndefined();
  });
});
