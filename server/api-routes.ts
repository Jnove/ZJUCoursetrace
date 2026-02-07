import { Router, Request, Response } from "express";
import { ZJUService, Course } from "./_core/zju-service";

const router = Router();

// 全局 ZJU 服务实例
let zjuService: ZJUService | null = null;

// 内存缓存：用户 -> 学期 -> 课表数据
const scheduleCache: Map<string, Map<string, { courses: Course[]; semester_info: any; timestamp: number }>> = new Map();

// 有课表的学期列表缓存
const activeSemestersCache: Map<string, { semesters: any[]; timestamp: number }> = new Map();

// 缓存有效期：30分钟
const CACHE_DURATION = 30 * 60 * 1000;

function getZJUService(): ZJUService {
  if (!zjuService) {
    zjuService = new ZJUService();
  }
  return zjuService;
}

/**
 * 获取用户的课表缓存
 */
function getUserScheduleCache(username: string): Map<string, { courses: Course[]; semester_info: any; timestamp: number }> {
  if (!scheduleCache.has(username)) {
    scheduleCache.set(username, new Map());
  }
  return scheduleCache.get(username)!;
}

/**
 * 缓存课表数据
 */
function cacheScheduleData(username: string, semesterKey: string, data: { courses: Course[]; semester_info: any }) {
  const userCache = getUserScheduleCache(username);
  userCache.set(semesterKey, {
    ...data,
    timestamp: Date.now()
  });
}

/**
 * 从缓存获取课表数据
 */
function getScheduleFromCache(username: string, semesterKey: string): { courses: Course[]; semester_info: any } | null {
  const userCache = getUserScheduleCache(username);
  const cached = userCache.get(semesterKey);
  
  if (!cached) return null;
  
  // 检查缓存是否过期
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    userCache.delete(semesterKey);
    return null;
  }
  
  return {
    courses: cached.courses,
    semester_info: cached.semester_info
  };
}

/**
 * 生成学期键值
 */
function getSemesterKey(year: string, term: string): string {
  return `${year}_${term}`;
}

/**
 * 后台获取所有学期课表
 */
async function fetchAllSemestersInBackground(username: string, service: ZJUService) {
  try {
    // 获取学年学期选项
    const options = await service.getSemesterOptions();
    if (!options) {
      console.log("无法获取学年学期选项");
      return;
    }

    const { year_options, term_options, current_year, current_term } = options;
    const activeSemesters: any[] = [];

    // 先添加当前学期
    if (current_year && current_term) {
      activeSemesters.push({
        year: current_year,
        term: current_term,
        label: `${current_year} 第${current_term}学期`,
        is_current: true
      });
    }

    // 遍历最近3个学年
    const yearsToCheck = year_options.slice(0, 3);
    
    for (const year of yearsToCheck) {
      for (const term of term_options) {
        // 跳过当前学期
        if (year.text === current_year && term.text === current_term) continue;

        console.log(`检查学期: ${year.text} ${term.text}`);
        
        try {
          const scheduleData = await service.getTimetableDataForSemester(year.text, term.text);
          
          if (scheduleData && !scheduleData.semester_info.no_data && scheduleData.courses.length > 0) {
            console.log(`✅ 发现有课学期: ${year.text} ${term.text}，课程数: ${scheduleData.courses.length}`);
            
            // 缓存课表数据
            const semesterKey = getSemesterKey(year.text, term.text);
            cacheScheduleData(username, semesterKey, scheduleData);
            
            activeSemesters.push({
              year: year.text,
              term: term.text,
              label: `${year.text} 第${term.text}学期`,
              is_current: false
            });
          } else {
            console.log(`ℹ️ 学期 ${year.text} ${term.text} 无课表`);
          }
        } catch (error) {
          console.error(`获取学期 ${year.text} ${term.text} 课表失败:`, error);
        }
      }
    }

    // 恢复到当前学期
    if (current_year && current_term) {
      await service.selectSemester(current_year, current_term);
    }

    // 缓存有课表的学期列表
    activeSemestersCache.set(username, {
      semesters: activeSemesters,
      timestamp: Date.now()
    });

    console.log(`✅ 后台获取完成，共找到 ${activeSemesters.length} 个有课学期`);
  } catch (error) {
    console.error("后台获取学期课表失败:", error);
  }
}

/**
 * CAS 登录
 * POST /api/auth/login
 * Body: { username: string, password: string }
 */
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "学号和密码不能为空",
      });
    }

    const service = getZJUService();
    const success = await service.login(username, password);

    if (!success) {
      return res.status(401).json({
        success: false,
        error: "登录失败，请检查学号和密码",
      });
    }

    // 登录成功后，立即获取当前学期课表
    console.log("登录成功，正在获取当前学期课表...");
    const currentSchedule = await service.getTimetableDataForSemester();
    
    if (currentSchedule && currentSchedule.semester_info) {
      const { school_year, semester } = currentSchedule.semester_info;
      if (school_year && semester) {
        const semesterKey = getSemesterKey(school_year, semester);
        cacheScheduleData(username, semesterKey, currentSchedule);
        console.log(`✅ 已缓存当前学期课表: ${semesterKey}`);
      }
    }

    // 在后台异步获取所有学期的课表
    setImmediate(async () => {
      try {
        console.log("开始后台获取所有学期课表...");
        await fetchAllSemestersInBackground(username, service);
      } catch (error) {
        console.error("后台获取学期课表失败:", error);
      }
    });

    res.json({
      success: true,
      message: "登录成功",
      username,
      current_schedule: currentSchedule
    });
  } catch (error) {
    console.error("登录错误:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "登录失败",
    });
  }
});

/**
 * 获取课表数据（优先从缓存读取）
 * GET /api/schedule/timetable?username=xxx
 */
router.get("/schedule/timetable", async (req: Request, res: Response) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: "缺少用户名参数",
      });
    }

    // 尝试从缓存获取当前学期课表
    const userCache = getUserScheduleCache(username as string);
    for (const [key, data] of userCache.entries()) {
      if (Date.now() - data.timestamp < CACHE_DURATION) {
        console.log(`从缓存返回课表: ${key}`);
        return res.json({
          success: true,
          courses: data.courses,
          semester_info: data.semester_info,
          from_cache: true
        });
      }
    }

    // 缓存未命中，从服务获取
    const service = getZJUService();
    const result = await service.getTimetableData();

    if (!result) {
      return res.status(400).json({
        success: false,
        error: "获取课表失败",
      });
    }

    // 缓存结果
    if (result.semester_info?.school_year && result.semester_info?.semester) {
      const semesterKey = getSemesterKey(result.semester_info.school_year, result.semester_info.semester);
      cacheScheduleData(username as string, semesterKey, result);
    }

    res.json({
      success: true,
      courses: result.courses,
      semester_info: result.semester_info,
      from_cache: false
    });
  } catch (error) {
    console.error("获取课表错误:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "获取课表失败",
    });
  }
});

/**
 * 获取学年学期选项
 * GET /api/schedule/semester-options
 */
router.get("/schedule/semester-options", async (req: Request, res: Response) => {
  try {
    const service = getZJUService();
    const options = await service.getSemesterOptions();

    if (!options) {
      return res.status(400).json({
        success: false,
        error: "获取学年学期选项失败",
      });
    }

    res.json({
      success: true,
      ...options,
    });
  } catch (error) {
    console.error("获取学年学期选项错误:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "获取学年学期选项失败",
    });
  }
});

/**
 * 获取所有有课的学期（优先从缓存读取）
 * GET /api/schedule/active-semesters?username=xxx
 */
router.get("/schedule/active-semesters", async (req: Request, res: Response) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: "缺少用户名参数",
      });
    }

    // 检查缓存
    const cached = activeSemestersCache.get(username as string);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json({
        success: true,
        semesters: cached.semesters,
        from_cache: true
      });
    }

    // 如果缓存不存在或已过期，触发后台获取
    const service = getZJUService();
    
    // 在后台异步获取
    setImmediate(async () => {
      try {
        console.log("缓存过期，重新后台获取所有学期课表...");
        await fetchAllSemestersInBackground(username as string, service);
      } catch (error) {
        console.error("后台重新获取学期课表失败:", error);
      }
    });

    // 返回空列表，提示前端稍后重试
    res.json({
      success: true,
      semesters: [],
      from_cache: false,
      message: "正在后台获取学期列表，请稍后刷新"
    });
  } catch (error) {
    console.error("获取有课学期错误:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "获取有课学期失败",
    });
  }
});

/**
 * 获取指定学年学期的课表（优先从缓存读取）
 * GET /api/schedule/timetable-by-semester?username=xxx&year=2025-2026&term=1
 */
router.get("/schedule/timetable-by-semester", async (req: Request, res: Response) => {
  try {
    const { username, year, term } = req.query;
    
    if (!username || !year || !term) {
      return res.status(400).json({
        success: false,
        error: "缺少必要参数",
      });
    }

    const semesterKey = getSemesterKey(year as string, term as string);
    
    // 先尝试从缓存获取
    const cached = getScheduleFromCache(username as string, semesterKey);
    if (cached) {
      console.log(`从缓存返回课表: ${semesterKey}`);
      return res.json({
        success: true,
        courses: cached.courses,
        semester_info: cached.semester_info,
        from_cache: true
      });
    }

    // 缓存未命中，从服务获取
    console.log(`缓存未命中，从服务获取课表: ${semesterKey}`);
    const service = getZJUService();
    const result = await service.getTimetableDataForSemester(
      year as string,
      term as string
    );

    if (!result) {
      return res.status(400).json({
        success: false,
        error: "获取课表失败",
      });
    }

    // 缓存结果
    cacheScheduleData(username as string, semesterKey, result);

    res.json({
      success: true,
      courses: result.courses,
      semester_info: result.semester_info,
      from_cache: false
    });
  } catch (error) {
    console.error("获取课表错误:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "获取课表失败",
    });
  }
});

/**
 * 获取当天课程（从缓存中推算）
 * GET /api/schedule/todays-courses?username=xxx&semester=2025-2026_1
 */
router.get("/schedule/todays-courses", async (req: Request, res: Response) => {
  try {
    const { username, semester } = req.query;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: "缺少用户名参数",
      });
    }

    // 如果没有指定学期，尝试获取当前学期
    let semesterKey = semester as string;
    let courses: Course[] = [];

    if (semesterKey) {
      // 从指定学期的缓存获取
      const cached = getScheduleFromCache(username as string, semesterKey);
      if (cached) {
        courses = cached.courses;
      }
    } else {
      // 没有指定学期，从所有缓存的学期中查找当前学期
      const userCache = getUserScheduleCache(username as string);
      for (const [key, data] of userCache.entries()) {
        if (Date.now() - data.timestamp < CACHE_DURATION) {
          courses = data.courses;
          semesterKey = key;
          break;
        }
      }
    }

    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        error: "未找到缓存的课表数据，请先登录或刷新课表",
      });
    }

    // 计算今天是星期几
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const todayDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // 转换为 1-7 格式

    // 筛选今天的课程
    const todaysCourses = courses.filter((course) => course.day_of_week === todayDayOfWeek);

    console.log(`📅 今天是星期${todayDayOfWeek}，从缓存中找到 ${todaysCourses.length} 门课程`);

    res.json({
      success: true,
      courses: todaysCourses,
      total: todaysCourses.length,
      day_of_week: todayDayOfWeek,
      semester: semesterKey,
      from_cache: true
    });
  } catch (error) {
    console.error("获取当天课程错误:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "获取当天课程失败",
    });
  }
});

/**
 * 清除缓存
 * POST /api/schedule/clear-cache
 * Body: { username?: string }
 */
router.post("/schedule/clear-cache", async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (username) {
      scheduleCache.delete(username);
      activeSemestersCache.delete(username);
      console.log(`已清除用户 ${username} 的缓存`);
    } else {
      scheduleCache.clear();
      activeSemestersCache.clear();
      console.log("已清除所有缓存");
    }

    res.json({
      success: true,
      message: "缓存已清除",
    });
  } catch (error) {
    console.error("清除缓存错误:", error);
    res.status(500).json({
      success: false,
      error: "清除缓存失败",
    });
  }
});

/**
 * 关闭浏览器
 * POST /api/auth/logout
 */
router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    const service = getZJUService();
    await service.closeBrowser();
    zjuService = null;

    res.json({
      success: true,
      message: "已退出登录",
    });
  } catch (error) {
    console.error("退出登录错误:", error);
    res.status(500).json({
      success: false,
      error: "退出登录失败",
    });
  }
});

export default router;
