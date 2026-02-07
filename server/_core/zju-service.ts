import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import { z } from "zod";

/**
 * 课程数据类型定义
 */
export const CourseSchema = z.object({
  course_id: z.string(),
  course_code: z.string(),
  course_name: z.string(),
  semester: z.string(),
  teacher: z.string(),
  location: z.string(),
  time_slot: z.string(),
  exam_time: z.string().optional(),
  exam_location: z.string().optional(),
  day_of_week: z.number().optional(),
  is_single_week: z.boolean().nullable().optional(), // true=单周，false=双周，null=单双周
  period: z.string().optional(),
  period_time: z.string().optional(),
  week_range: z.string().optional(),
  credit: z.number().optional(),
});

export type Course = z.infer<typeof CourseSchema>;

/**
 * ZJU 课表服务类
 */
export class ZJUService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private currentUser: string | null = null;
  private sessionCookies: any[] = [];

  private readonly BASE_URL = "https://zdbk.zju.edu.cn";
  private readonly CAS_URL = "https://zjuam.zju.edu.cn/cas/login";

  /**
   * 初始化浏览器
   */
  async initBrowser(): Promise<void> {
    if (this.browser) {
      console.log("浏览器已初始化");
      return;
    }

    console.log("🚀 正在初始化浏览器...");

    // 尝试使用系统已安装的 Chrome/Chromium
    const executablePath = this.getChromePath();
    
    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined, // 如果找到系统 Chrome，使用它；否则使用 Puppeteer 管理的版本
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-resources",
      ],
    });

    this.page = await this.browser.newPage();

    // 设置用户代理
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // 禁用自动化检测
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    console.log("✅ 浏览器初始化完成");
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取系统中已安装的 Chrome 路径
   */
  private getChromePath(): string | null {
    const os = require("os");
    const path = require("path");
    const fs = require("fs");

    const possiblePaths = [
      // Windows
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      // macOS
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      // Linux
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    ];

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        console.log(`✅ 找到系统 Chrome: ${chromePath}`);
        return chromePath;
      }
    }

    console.log("⚠️ 未找到系统 Chrome，将使用 Puppeteer 管理的浏览器");
    return null;
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * CAS 登录
   */
  async login(username: string, password: string): Promise<boolean> {
    if (!this.browser || !this.page) {
      await this.initBrowser();
    }

    console.log("\n" + "=".repeat(50));
    console.log("正在登录浙江大学本科教学管理信息服务平台...");
    console.log("=".repeat(50));

    this.currentUser = username;

    try {
      // 访问 CAS 登录页面
      const serviceUrl = `${this.BASE_URL}/jwglxt/xtgl/login_slogin.html`;
      const fullUrl = `${this.CAS_URL}?service=${encodeURIComponent(serviceUrl)}`;

      console.log("访问 CAS 登录页面...");
      await this.page!.goto(fullUrl, { waitUntil: "networkidle2" });

      // 等待页面加载
      await this.sleep(1000);

      // 查找并填充用户名
      console.log("查找登录表单元素...");
      const usernameInput = await this.page!.$(
        "input#username, input[name='username'], input[type='text']"
      );
      if (!usernameInput) {
        console.log("❌ 无法找到用户名输入框");
        return false;
      }

      // 查找并填充密码
      const passwordInput = await this.page!.$(
        "input#password, input[name='password'], input[type='password']"
      );
      if (!passwordInput) {
        console.log("❌ 无法找到密码输入框");
        return false;
      }

      console.log("输入用户名和密码...");
      await usernameInput.type(username);
      await passwordInput.type(password);

      // 查找登录按钮
      console.log("查找登录按钮...");
      let loginButton = null;

      const selectors = [
        "button:has-text('登录')",
        "button.btn-login",
        "button[type='submit']",
        "#dl",
        "input[type='submit']",
      ];

      for (const selector of selectors) {
        try {
          loginButton = await this.page!.$(selector);
          if (loginButton) break;
        } catch {
          continue;
        }
      }

      if (!loginButton) {
        console.log("❌ 无法找到登录按钮");
        return false;
      }

      // 点击登录按钮
      console.log("点击登录按钮...");
      await loginButton.click();

      // 等待登录完成
      console.log("等待登录完成...");
      try {
        await this.page!.waitForFunction(
          () => !window.location.href.includes('cas/login'),
          { timeout: 15000 }
        );
        console.log("✅ 已离开 CAS 登录页面");
      } catch {
        const hasError = await this._checkLoginError();
        if (hasError) {
          console.log("❌ 登录失败：学号或密码错误");
          return false;
        }
        console.log("⚠️ 导航超时，继续...");
      }

      await this.sleep(1000);
      const ssoExists = await this._checkSSO();
      if (ssoExists) {
        console.log("检测到 SSO 登录图片，尝试点击...");
        await this._clickSSO();
        await this.sleep(1000);
      }

      this.sessionCookies = await this.page!.cookies();
      console.log(`✅ 登录成功！已保存 ${this.sessionCookies.length} 个 cookies`);
      console.log(`当前 URL: ${this.page!.url()}`);
      this.currentUser = username;

      return true;
    } catch (error) {
      console.error("❌ 登录过程中发生错误:", error);
      return false;
    }
  }

  /**
   * 检查登录错误
   */
  private async _checkLoginError(): Promise<boolean> {
    try {
      const errorSelectors = ['.alert-error', '.error', '#error'];
      for (const selector of errorSelectors) {
        const elements = await this.page!.$$(selector);
        if (elements.length > 0) {
          return true;
        }
      }
    } catch (error) {
      console.error("检查错误时出错:", error);
    }
    return false;
  }

  /**
   * 检查 SSO 图片是否存在
   */
  private async _checkSSO(): Promise<boolean> {
    try {
      const ssoElement = await this.page!.$("#ssodl");
      return ssoElement !== null;
    } catch {
      return false;
    }
  }

  /**
   * 点击 SSO 图片
   */
  private async _clickSSO(): Promise<boolean> {
    try {
      const ssoElement = await this.page!.$("#ssodl");
      if (!ssoElement) {
        return false;
      }

      await ssoElement.click();
      return true;
    } catch (error) {
      console.error("❌ 点击 SSO 图片时出错:", error);
      return false;
    }
  }

  /**
   * 获取课表 HTML
   */
  async getTimetableHTML(): Promise<string | null> {
    if (!this.page || !this.currentUser) {
      console.log("❌ 请先登录");
      return null;
    }

    try {
      const timetableUrl = `${this.BASE_URL}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N253508&layout=default&su=${this.currentUser}`;
      console.log(`访问课表页面: ${timetableUrl}`);

      await this.page.goto(timetableUrl, { waitUntil: "networkidle2" });

      // 等待课表表格加载
      try {
        await this.page.waitForSelector("#kbgrid_table", { timeout: 10000 });
        console.log("✅ 课表页面加载成功");
      } catch {
        console.log("⚠️ 课表页面加载较慢，继续等待...");
        await this.sleep(3000);
      }

      const html = await this.page.content();
      console.log(`✅ 获取到课表 HTML，长度: ${html.length} 字节`);

      return html;
    } catch (error) {
      console.error("❌ 获取课表时发生错误:", error);
      return null;
    }
  }

  /**
   * 解析课程详情
   */
  private _parseCoursDetails(fontElement: cheerio.Cheerio<any>): Record<string, string> {
    const result: Record<string, string> = {};
    
    try {
      // 使用 cheerio 的 contents() 获取所有子节点，然后提取文本
      // 这模拟了 Python BeautifulSoup 的 stripped_strings 行为
      const textLines: string[] = [];
      
      fontElement.contents().each((_, node) => {
        if (node.type === 'text') {
          const text = (node as any).data?.trim();
          if (text && text.length > 0) {
            textLines.push(text);
          }
        }
      });

      // 如果直接获取文本为空，尝试获取整个文本然后按换行符分割
      if (textLines.length === 0) {
        const fullText = fontElement.text();
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        textLines.push(...lines);
      }

      // 按照固定顺序解析
      if (textLines.length > 0) {
        result["course_name"] = textLines[0];
      }

      if (textLines.length > 1) {
        const timeSlotRaw = textLines[1];
        result["time_slot"] = this._formatTimeSlot(timeSlotRaw);

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

  /**
   * 格式化时间描述
   */
  private _formatTimeSlot(timeSlotRaw: string): string {
    if (!timeSlotRaw) {
      return "";
    }

    // 尝试提取季节和周次信息
    const match = timeSlotRaw.match(/([\u4e00-\u9fa5]+)\{第(\d+-\d+)周/);
    if (match) {
      const season = match[1];
      const weekRange = `第${match[2]}周`;
      return `${season} ${weekRange}`;
    }

    return timeSlotRaw;
  }

  /**
   * 解析单元格 ID
   */
  private _parseCellId(cellId: string): Record<string, any> {
    if (!cellId) {
      return {};
    }

    const parts = cellId.split("-");
    if (parts.length >= 3) {
      try {
        const day = parseInt(parts[0]);
        const weekType = parseInt(parts[1]); // 0=单周，1=双周
        const period = parseInt(parts[2]);

        return {
          day_of_week: day,
          is_single_week: weekType === 0, // true=单周，false=双周
          period: period,
        };
      } catch {
        return {};
      }
    }

    return {};
  }

  /**
   * 获取节次时间映射
   */
  private _getPeriodTimeMap($: cheerio.CheerioAPI): Record<number, string> {
    const periodTimeMap: Record<number, string> = {};

    try {
      $("tr").each((_, row) => {
        const $row = $(row);
        $row.find("td").each((_, td) => {
          const $td = $(td);
          const festivalSpan = $td.find("span.festival");

          if (festivalSpan.length > 0) {
            const periodText = festivalSpan.text().trim();
            if (/^\d+$/.test(periodText)) {
              const periodNum = parseInt(periodText);
              const nextTd = $td.next();
              const timeSpan = nextTd.find("span.festival-time");

              if (timeSpan.length > 0) {
                const timeText = timeSpan.text().trim();
                periodTimeMap[periodNum] = timeText;
              }
            }
          }
        });
      });
    } catch (error) {
      console.error("获取节次时间映射时出错:", error);
    }

    return periodTimeMap;
  }

  /**
   * 获取时间范围
   */
  private _getPeriodTimeRange(
    periodStart: number,
    rowspan: number,
    periodTimeMap: Record<number, string>
  ): string | null {
    try {
      if (!(periodStart in periodTimeMap)) {
        return null;
      }

      if (rowspan === 1) {
        return periodTimeMap[periodStart];
      }

      const periodEnd = periodStart + rowspan - 1;

      if (periodEnd in periodTimeMap) {
        const startTimeText = periodTimeMap[periodStart];
        const endTimeText = periodTimeMap[periodEnd];

        const startMatch = startTimeText.match(/(\d{2}:\d{2})/);
        const endMatch = endTimeText.match(/—(\d{2}:\d{2})/);

        if (startMatch && endMatch) {
          return `${startMatch[1]}—${endMatch[1]}`;
        }
      }

      return periodTimeMap[periodStart];
    } catch (error) {
      console.error("计算时间范围时出错:", error);
      return null;
    }
  }

  /**
   * 从链接元素提取课程信息
   */
  private _extractCourseFromLink(
    $: cheerio.CheerioAPI,
    linkElement: any
  ): Record<string, any> | null {
    try {
      const $link = $(linkElement);
      const onclick = $link.attr("onclick") || "";
      const match = onclick.match(/showCourseInfo2\('jxrwbview', '(.*?)', '(.*?)'\)/);

      if (!match) {
        return null;
      }

      let courseFullId = match[1];
      const courseCodeShort = match[2];

      // 去掉两边的括号
      if (courseFullId.startsWith("(") && courseFullId.endsWith(")")) {
        courseFullId = courseFullId.slice(1, -1);
      }

      // 分割各部分
      const idParts = courseFullId.split("-");
      let semester = "";
      let courseCodeFull = "";

      if (idParts.length >= 3) {
        semester = idParts[0];
        courseCodeFull = idParts[1];
      }

      // 获取课程文本内容
      const fontElement = $link.find("font");
      if (fontElement.length === 0) {
        return null;
      }
      
      const courseDetails = this._parseCoursDetails(fontElement);

      return {
        course_id: courseFullId,
        course_code: courseCodeFull,
        semester: semester,
        ...courseDetails,
      };
    } catch (error) {
      console.error("解析课程链接时出错:", error);
      return null;
    }
  }

  /**
   * 合并相邻课程
   */
  private _mergeAdjacentCourses(courses: Course[]): Course[] {
    if (courses.length === 0) {
      return [];
    }

    // 按星期、单双周、课程 ID 分组
    const groups: Record<string, Course[]> = {};

    for (const course of courses) {
      const key = `${course.day_of_week}-${course.is_single_week}-${course.course_id}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(course);
    }

    const mergedCourses: Course[] = [];

    for (const courseList of Object.values(groups)) {
      // 按起始节次排序
      courseList.sort((a, b) => {
        const aPeriod = a.period ? parseInt(a.period.split("-")[0]) : 0;
        const bPeriod = b.period ? parseInt(b.period.split("-")[0]) : 0;
        return aPeriod - bPeriod;
      });

      let i = 0;
      while (i < courseList.length) {
        const currentCourse = courseList[i];
        let j = i + 1;

        while (j < courseList.length) {
          const nextCourse = courseList[j];

          if (currentCourse.period && nextCourse.period) {
            const currentEnd = currentCourse.period.includes("-")
              ? parseInt(currentCourse.period.split("-")[1])
              : parseInt(currentCourse.period);

            const nextStart = nextCourse.period.includes("-")
              ? parseInt(nextCourse.period.split("-")[0])
              : parseInt(nextCourse.period);

            if (nextStart === currentEnd + 1) {
              // 合并课程
              const currentStart = currentCourse.period.includes("-")
                ? parseInt(currentCourse.period.split("-")[0])
                : parseInt(currentCourse.period);

              const nextEnd = nextCourse.period.includes("-")
                ? parseInt(nextCourse.period.split("-")[1])
                : parseInt(nextCourse.period);

              currentCourse.period = `${currentStart}-${nextEnd}`;

              // 合并时间
              if (currentCourse.period_time && nextCourse.period_time) {
                const currentEndTimeMatch = currentCourse.period_time.match(/—(\d{2}:\d{2})/);
                const nextEndTimeMatch = nextCourse.period_time.match(/—(\d{2}:\d{2})/);

                if (currentEndTimeMatch && nextEndTimeMatch) {
                  const startTime = currentCourse.period_time.split("—")[0];
                  currentCourse.period_time = `${startTime}—${nextEndTimeMatch[1]}`;
                }
              }

              j++;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        mergedCourses.push(currentCourse);
        i = j;
      }
    }

    return mergedCourses;
  }

  /**
   * 解析课表 HTML
   */
  parseTimetable(htmlContent: string): { courses: Course[]; semester_info: any } {
    const $ = cheerio.load(htmlContent);
    const courses: Course[] = [];

    try {
      // 解析学期信息
      const semesterElement = $(".timetable_title");
      let semesterInfo: any = {};

      if (semesterElement.length > 0) {
        const text = semesterElement.text();
        const match = text.match(/(\d{4}-\d{4})\s*学年\s*(\S+)\s*学期/);
        if (match) {
          semesterInfo = {
            school_year: match[1],
            semester: match[2],
            raw_text: text,
          };
        }
      }

      // 获取节次时间映射
      const periodTimeMap = this._getPeriodTimeMap($);
      console.log(`📊 获取到 ${Object.keys(periodTimeMap).length} 个节次的时间映射`);

      // 解析课表表格
      const table = $("#kbgrid_table");
      if (table.length === 0) {
        console.log("未找到课表表格");
        return { courses: [], semester_info: semesterInfo };
      }

      // 遍历所有单元格
      table.find("td").each((_, td) => {
        const $td = $(td);
        const link = $td.find("a[onclick*='showCourseInfo2']");

        if (link.length > 0) {
          const courseInfo = this._extractCourseFromLink($, link[0]);

          if (courseInfo) {
            const cellId = $td.attr("id") || "";
            const cellInfo = this._parseCellId(cellId);

            const rowspan = parseInt($td.attr("rowspan") || "1");
            const colspan = parseInt($td.attr("colspan") || "1");

            const periodStart = cellInfo.period;
            if (periodStart !== undefined) {
              const periodEnd = periodStart + rowspan - 1;
              const periodRange =
                periodEnd > periodStart ? `${periodStart}-${periodEnd}` : String(periodStart);

              const timeInfo = this._getPeriodTimeRange(periodStart, rowspan, periodTimeMap);

              let weekType = cellInfo.is_single_week;
              if (colspan === 2) {
                // 跨两周，说明是单双周都有
                weekType = null;
              }

              const course: Course = {
                course_id: courseInfo.course_id || "",
                course_code: courseInfo.course_code || "",
                course_name: courseInfo.course_name || "",
                semester: courseInfo.semester || "",
                teacher: courseInfo.teacher || "",
                location: courseInfo.location || "",
                time_slot: courseInfo.time_slot || "",
                exam_time: courseInfo.exam_time,
                exam_location: courseInfo.exam_location,
                day_of_week: cellInfo.day_of_week,
                is_single_week: weekType,
                period: periodRange,
                period_time: timeInfo || undefined,
                week_range: courseInfo.week_range,
              };

              courses.push(course);
            }
          }
        }
      });

      console.log(`📊 解析到 ${courses.length} 门原始课程`);

      // 合并相邻课程
      const mergedCourses = this._mergeAdjacentCourses(courses);
      console.log(`📊 合并为 ${mergedCourses.length} 门课程`);

      return { courses: mergedCourses, semester_info: semesterInfo };
    } catch (error) {
      console.error("解析课表时出错:", error);
      return { courses: [], semester_info: {} };
    }
  }

  /**
   * 获取学年学期选项
   */
  async getSemesterOptions(): Promise<any> {
    if (!this.currentUser || !this.page) {
      console.log("❌ 请先登录");
      return null;
    }

    try {
      // 确保在课表页
      const currentUrl = this.page.url();
      if (!currentUrl.includes("xskbcx_cxXskbcxIndex.html")) {
        const timetableUrl = `${this.BASE_URL}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N253508&layout=default&su=${this.currentUser}`;
        await this.page.goto(timetableUrl, { waitUntil: "networkidle2" });
      }

      const html = await this.page.content();
      const $ = cheerio.load(html);

      // 解析学年选项
      const yearOptions: any[] = [];
      $("select#xnm option").each((_, el) => {
        const value = $(el).attr("value");
        const text = $(el).text().trim();
        const selected = $(el).attr("selected") !== undefined || $(el).prop("selected");
        if (value) {
          yearOptions.push({ value, text, selected });
        }
      });

      // 解析学期选项
      const termOptions: any[] = [];
      $("select#xqm option").each((_, el) => {
        const value = $(el).attr("value");
        const text = $(el).text().trim();
        const selected = $(el).attr("selected") !== undefined || $(el).prop("selected");
        if (value) {
          termOptions.push({ value, text, selected });
        }
      });

      // 修正 selected 逻辑：如果没有任何 option 被标记为 selected，尝试从页面元素获取当前值
      let currentYear = yearOptions.find((opt) => opt.selected)?.text;
      let currentTerm = termOptions.find((opt) => opt.selected)?.text;

      if (!currentYear) {
        currentYear = await this.page.$eval("select#xnm", (el) => (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.text);
      }
      if (!currentTerm) {
        currentTerm = await this.page.$eval("select#xqm", (el) => (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.text);
      }

      console.log(`✅ 获取到学年选项: ${yearOptions.length} 个，学期选项: ${termOptions.length} 个`);

      return {
        year_options: yearOptions,
        term_options: termOptions,
        current_year: currentYear,
        current_term: currentTerm,
      };
    } catch (error) {
      console.error("❌ 获取学年学期选项时出错:", error);
      return null;
    }
  }

  /**
   * 遍历所有学期，筛选有课的学期
   */
  async getAllActiveSemesters(): Promise<any[]> {
    const options = await this.getSemesterOptions();
    if (!options) return [];

    const activeSemesters: any[] = [];
    const { year_options, term_options, current_year, current_term } = options;

    // 先把当前学期加入（假设当前学期是有课的，或者作为默认项）
    activeSemesters.push({
      year: current_year,
      term: current_term,
      label: `${current_year} 第${current_term}学期`,
      is_current: true
    });

    // 为了效率，我们只检查最近的几个学年
    const yearsToCheck = year_options.slice(0, 3); 
    
    for (const year of yearsToCheck) {
      for (const term of term_options) {
        // 跳过当前学期，已经加过了
        if (year.text === current_year && term.text === current_term) continue;

        console.log(`正在检查学期是否有课: ${year.text} ${term.text}`);
        const success = await this.selectSemester(year.text, term.text);
        if (!success) continue;

        // 检查是否显示"尚无您的课表"
        const noTimetable = await this.page!.evaluate(() => {
          // 方法1：检查 .nodata 元素
          const nodataDiv = document.querySelector(".nodata");
          if (nodataDiv) {
            return true;
          }
          
          // 方法2：检查 h3.align-center 下的 span 文本
          const h3Elements = Array.from(document.querySelectorAll("h3.align-center"));
          for (const h3 of h3Elements) {
            const span = h3.querySelector("span");
            if (span && span.textContent?.includes("尚无您的课表")) {
              return true;
            }
          }
          
          // 方法3：全局检查 span 文本（兜底）
          const spans = Array.from(document.querySelectorAll("span"));
          return spans.some((span) => span.textContent?.includes("尚无您的课表"));
        });

        if (!noTimetable) {
          console.log(`✅ 发现有课学期: ${year.text} ${term.text}`);
          activeSemesters.push({
            year: year.text,
            term: term.text,
            label: `${year.text} 第${term.text}学期`,
            is_current: false
          });
        }
      }
    }

    // 恢复到当前学期
    await this.selectSemester(current_year, current_term);

    return activeSemesters;
  }

  /**
   * 选择学年学期 - 使用 chosen 下拉框
   */
  async selectSemester(yearText: string, termText: string): Promise<boolean> {
    try {
      console.log(`正在选择学年: ${yearText}, 学期: ${termText}`);

      // 选择学年
      if (yearText) {
        await this.clickChosenDropdownAndSelect("xnm_chosen", yearText);
        await this.sleep(1000);
      }

      // 选择学期
      if (termText) {
        await this.clickChosenDropdownAndSelect("xqm_chosen", termText);
        await this.sleep(1000);
      }

      // 等待课表刷新
      if (this.page) {
        try {
          await this.page.waitForFunction(
            () => document.getElementById("kbgrid_table") !== null,
            { timeout: 5000 }
          );
        } catch {
          console.log("⚠️ 课表刷新较慢...");
        }
      }

      console.log(`✅ 已选择学年: ${yearText}, 学期: ${termText}`);
      return true;
    } catch (error) {
      console.error("❌ 选择学年学期时出错:", error);
      return false;
    }
  }

  /**
   * 点击 chosen 下拉框并选择选项
   */
  private async clickChosenDropdownAndSelect(chosenId: string, optionText: string): Promise<void> {
    if (!this.page) return;
    try {
      console.log(`正在选择 ${optionText}...`);

      // 点击打开下拉框
      await this.page.click(`#${chosenId}`);
      await this.sleep(300);

      // 等待下拉框展开
      try {
        await this.page.waitForSelector(".chosen-drop", { timeout: 2000 });
      } catch {
        console.log("下拉框展开较慢...");
      }

      // 在下拉框列表中查找并点击选项
      await this.page.evaluate((text) => {
        const dropdown = document.querySelector(".chosen-drop");
        if (!dropdown) return;

        const options = Array.from(dropdown.querySelectorAll(".chosen-results li"));
        for (const option of options) {
          if (option.textContent?.trim() === text) {
            (option as HTMLElement).click();
            return;
          }
        }
      }, optionText);

      await this.sleep(500);
      console.log(`✅ 已选择选项: ${optionText}`);
    } catch (error) {
      console.error(`❌ 选择选项时出错: ${error}`);
    }
  }

  /**
   * 获取指定学年学期的课表
   */
  async getTimetableDataForSemester(
    yearText?: string,
    termText?: string
  ): Promise<{ courses: Course[]; semester_info: any } | null> {
    if (!this.currentUser || !this.page) {
      console.log("❌ 请先登录");
      return null;
    }

    try {
      // 检查当前是否在课表页面，如果不在则跳转
      const currentUrl = this.page.url();
      if (!currentUrl.includes("xskbcx_cxXskbcxIndex.html")) {
        const timetableUrl = `${this.BASE_URL}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N253508&layout=default&su=${this.currentUser}`;
        console.log(`跳转到课表页面: ${timetableUrl}`);
        await this.page.goto(timetableUrl, { waitUntil: "networkidle2" });
      }

      // 如果指定了学年学期，则直接在当前页面通过下拉框选择
      if (yearText || termText) {
        const success = await this.selectSemester(yearText || "", termText || "");
        if (!success) {
          console.log("⚠️ 选择学年学期失败，继续使用当前选择");
        }
      }

      // 检查是否显示"尚无您的课表"
      // HTML结构：<h3 class="align-center"><div class="nodata"><span>该学年学期尚无您的课表！</span></div></h3>
      const noTimetable = await this.page.evaluate(() => {
        // 方法1：检查 .nodata 元素
        const nodataDiv = document.querySelector(".nodata");
        if (nodataDiv) {
          return true;
        }
        
        // 方法2：检查 h3.align-center 下的 span 文本
        const h3Elements = Array.from(document.querySelectorAll("h3.align-center"));
        for (const h3 of h3Elements) {
          const span = h3.querySelector("span");
          if (span && span.textContent?.includes("尚无您的课表")) {
            return true;
          }
        }
        
        // 方法3：全局检查 span 文本（兜底）
        const spans = Array.from(document.querySelectorAll("span"));
        return spans.some((span) => span.textContent?.includes("尚无您的课表"));
      });

      if (noTimetable) {
        console.log(`ℹ️ 学期 ${yearText} ${termText} 尚无您的课表`);
        return { 
          courses: [], 
          semester_info: { 
            year_text: yearText, 
            term_text: termText, 
            no_data: true,
            school_year: yearText,
            semester: termText
          } 
        };
      }

      // 等待表格出现（如果是切换学期，可能需要一点时间刷新）
      try {
        await this.page.waitForSelector("#kbgrid_table", { timeout: 5000 });
      } catch (e) {
        console.log("等待表格超时，尝试直接解析内容");
      }

      const html = await this.page.content();
      return this.parseTimetable(html);
    } catch (error) {
      console.error("❌ 获取课表时出错:", error);
      return null;
    }
  }

  /**
   * 获取当天课程
   */
  getTodaysCourses(allCourses: Course[]): Course[] {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const todayDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // 转换为 1-7 格式

    // 简单实现：只返回今天的课程
    // 注意：这里没有考虑周次和单双周，因为需要知道学期开始日期
    const todaysCourses = allCourses.filter((course) => course.day_of_week === todayDayOfWeek);

    console.log(`📅 今天是星期${todayDayOfWeek}，找到 ${todaysCourses.length} 门课程`);

    return todaysCourses;
  }

  /**
   * 获取并解析课表数据
   */
  async getTimetableData(): Promise<{ courses: Course[]; semester_info: any } | null> {
    if (!this.currentUser) {
      console.log("❌ 请提供用户名");
      return null;
    }

    try {
      const html = await this.getTimetableHTML();
      if (!html) {
        console.log("❌ 未能获取课表 HTML");
        return null;
      }

      const result = this.parseTimetable(html);
      console.log(`✅ 解析到 ${result.courses.length} 门课程`);

      return result;
    } catch (error) {
      console.error("❌ 获取并解析课表时出错:", error);
      return null;
    }
  }
}
