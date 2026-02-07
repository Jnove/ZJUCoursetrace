import { Router, Request, Response } from "express";
import { ZJUService } from "./_core/zju-service";

const router = Router();

// 全局 ZJU 服务实例
let zjuService: ZJUService | null = null;

function getZJUService(): ZJUService {
  if (!zjuService) {
    zjuService = new ZJUService();
  }
  return zjuService;
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

    res.json({
      success: true,
      message: "登录成功",
      username,
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
 * 获取课表数据
 * GET /api/schedule/timetable
 */
router.get("/schedule/timetable", async (req: Request, res: Response) => {
  try {
    const service = getZJUService();
    const result = await service.getTimetableData();

    if (!result) {
      return res.status(400).json({
        success: false,
        error: "获取课表失败",
      });
    }

    res.json({
      success: true,
      courses: result.courses,
      semester_info: result.semester_info,
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
 * 获取所有有课的学期
 * GET /api/schedule/active-semesters
 */
router.get("/schedule/active-semesters", async (req: Request, res: Response) => {
  try {
    const service = getZJUService();
    const semesters = await service.getAllActiveSemesters();

    res.json({
      success: true,
      semesters,
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
 * 获取指定学年学期的课表
 * GET /api/schedule/timetable-by-semester?year=2025-2026&term=1
 */
router.get("/schedule/timetable-by-semester", async (req: Request, res: Response) => {
  try {
    const { year, term } = req.query;
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

    res.json({
      success: true,
      courses: result.courses,
      semester_info: result.semester_info,
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
 * 获取当天课程
 * GET /api/schedule/todays-courses
 */
router.get("/schedule/todays-courses", async (req: Request, res: Response) => {
  try {
    const service = getZJUService();
    const result = await service.getTimetableData();

    if (!result) {
      return res.status(400).json({
        success: false,
        error: "获取课表失败",
      });
    }

    const todaysCourses = service.getTodaysCourses(result.courses);

    res.json({
      success: true,
      courses: todaysCourses,
      total: todaysCourses.length,
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
