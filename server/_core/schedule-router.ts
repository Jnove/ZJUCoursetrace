import { z } from "zod";
import { protectedProcedure, router } from "./trpc";
import * as db from "../db";
import { casService } from "./cas-service";

export const scheduleRouter = router({
  /**
   * Get user's courses for a specific semester
   */
  getCourses: protectedProcedure
    .input(
      z.object({
        semester: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      try {
        const courses = await db.getCoursesByUser(ctx.user.id, input.semester);
        return {
          success: true,
          courses,
        };
      } catch (error) {
        console.error("[Schedule] Get courses error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get courses",
          courses: [],
        };
      }
    }),

  /**
   * Fetch and update courses from ZJU system
   * This would integrate with the Python script
   */
  refreshSchedule: protectedProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
        semester: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      try {
        // Authenticate with CAS
        const loginResult = await casService.login(input.username, input.password);
        if (!loginResult.success) {
          return {
            success: false,
            error: loginResult.message || "CAS authentication failed",
          };
        }

        // Get schedule data
        const scheduleData = await casService.getSchedule(input.username);

        // Save to database
        if (scheduleData.courses.length > 0) {
          const courseList = scheduleData.courses.map((course) => ({
            userId: ctx.user.id,
            courseId: course.courseId,
            courseCode: course.courseCode,
            courseName: course.courseName,
            semester: course.semester,
            teacher: course.teacher,
            location: course.location,
            timeSlot: course.timeSlot,
            examTime: course.examTime,
            examLocation: course.examLocation,
            dayOfWeek: course.dayOfWeek,
            isSingleWeek: course.isSingleWeek,
            period: course.period,
            periodTime: course.periodTime,
            weekRange: course.weekRange,
            credit: course.credit,
          }));

          await db.saveCourses(ctx.user.id, courseList);

          // Save raw data to cache
          await db.saveScheduleCache(ctx.user.id, scheduleData.semester, JSON.stringify(scheduleData));
        }

        return {
          success: true,
          message: "Schedule refreshed successfully",
          courseCount: scheduleData.courses.length,
        };
      } catch (error) {
        console.error("[Schedule] Refresh schedule error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to refresh schedule",
        };
      }
    }),

  /**
   * Get courses filtered by week type (single, double, or both)
   */
  getCoursesByWeekType: protectedProcedure
    .input(
      z.object({
        semester: z.string().optional(),
        weekType: z.enum(["single", "double", "both"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      try {
        const courses = await db.getCoursesByUser(ctx.user.id, input.semester);

        let filtered = courses;
        if (input.weekType && input.weekType !== "both") {
          filtered = courses.filter((course) => course.isSingleWeek === input.weekType);
        }

        return {
          success: true,
          courses: filtered,
        };
      } catch (error) {
        console.error("[Schedule] Get courses by week type error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get courses",
          courses: [],
        };
      }
    }),

  /**
   * Get courses for a specific day of week
   */
  getCoursesByDay: protectedProcedure
    .input(
      z.object({
        dayOfWeek: z.number().min(1).max(7),
        semester: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      try {
        const courses = await db.getCoursesByUser(ctx.user.id, input.semester);
        const filtered = courses.filter((course) => course.dayOfWeek === input.dayOfWeek);

        return {
          success: true,
          courses: filtered,
        };
      } catch (error) {
        console.error("[Schedule] Get courses by day error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get courses",
          courses: [],
        };
      }
    }),
});
