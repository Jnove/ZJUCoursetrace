import { router, publicProcedure } from "@/server/_core/trpc";
import { z } from "zod";
import { ZJUService } from "@/server/_core/zju-service";

// 全局 ZJU 服务实例
let zjuService: ZJUService | null = null;

/**
 * 获取或创建 ZJU 服务实例
 */
function getZJUService(): ZJUService {
  if (!zjuService) {
    zjuService = new ZJUService();
  }
  return zjuService;
}

export const zjuRouter = router({
  /**
   * 测试路由
   */
  test: publicProcedure
    .input(
      z.object({
        message: z.string(),
      })
    )
    .query(({ input }) => {
      return { echo: input.message };
    }),

  /**
   * 登录
   */
  login: publicProcedure
    .input(
      z.object({
        username: z.string().min(1, "学号不能为空"),
        password: z.string().min(1, "密码不能为空"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const service = getZJUService();
        const success = await service.login(input.username, input.password);

        if (!success) {
          throw new Error("登录失败，请检查学号和密码");
        }

        return {
          success: true,
          message: "登录成功",
          username: input.username,
        };
      } catch (error) {
        console.error("登录错误:", error);
        throw new Error(error instanceof Error ? error.message : "登录失败");
      }
    }),

  /**
   * 获取课表数据
   */
  getTimetable: publicProcedure.query(async () => {
    try {
      const service = getZJUService();
      const result = await service.getTimetableData();

      if (!result) {
        throw new Error("获取课表失败");
      }

      return {
        success: true,
        courses: result.courses,
        semester_info: result.semester_info,
      };
    } catch (error) {
      console.error("获取课表错误:", error);
      throw new Error(error instanceof Error ? error.message : "获取课表失败");
    }
  }),

  /**
   * 关闭浏览器
   */
  closeBrowser: publicProcedure.mutation(async () => {
    try {
      const service = getZJUService();
      await service.closeBrowser();
      zjuService = null;

      return {
        success: true,
        message: "浏览器已关闭",
      };
    } catch (error) {
      console.error("关闭浏览器错误:", error);
      throw new Error("关闭浏览器失败");
    }
  }),
});
