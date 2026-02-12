import React, { createContext, useContext, useReducer, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * 前端使用的课程数据类型
 */
export interface Course {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  dayOfWeek: number; // 1-7 (Monday-Sunday)
  startPeriod: number; // 1-12
  endPeriod: number;
  weekStart: number;
  weekEnd: number;
  color: string;
  isSingleWeek?: "single" | "double" | "both"; // single=单周, double=双周, both=单双周
  periodTime?: string; // 具体时间，如"08:00—09:35"
  courseCode?: string;
  semester?: string;
  examInfo?: string; // 考试信息
}

export interface ScheduleState {
  courses: Course[];
  isLoading: boolean;
  error: string | null;
  currentWeek: number;
  weekType: "all" | "single" | "double"; // Filter type
}

type ScheduleAction =
  | { type: "SET_COURSES"; payload: Course[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_CURRENT_WEEK"; payload: number }
  | { type: "SET_WEEK_TYPE"; payload: "all" | "single" | "double" }
  | { type: "CLEAR_ERROR" };

const initialState: ScheduleState = {
  courses: [],
  isLoading: false,
  error: null,
  currentWeek: 1,
  weekType: "all",
};

function scheduleReducer(state: ScheduleState, action: ScheduleAction): ScheduleState {
  switch (action.type) {
    case "SET_COURSES":
      return { ...state, courses: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_CURRENT_WEEK":
      return { ...state, currentWeek: action.payload };
    case "SET_WEEK_TYPE":
      return { ...state, weekType: action.payload };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

interface ScheduleContextType {
  state: ScheduleState;
  fetchSchedule: () => Promise<void>;
  fetchScheduleBySemester: (year: string, term: string, useCache?: boolean) => Promise<void>;
  setCurrentWeek: (week: number) => void;
  setWeekType: (type: "all" | "single" | "double") => void;
  getCoursesForWeek: (week: number) => Course[];
  clearError: () => void;
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(undefined);

/**
 * 简单的字符串哈希函数
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// 极简扰动：RGB 整体偏移 ±delta，保留原透明度
function perturbHex8(hex: string, seed: number, delta = 10): string {
  // 提取 RRGGBB 和 AA（兼容 #RRGGBB 和 #RRGGBBAA）
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length >= 9 ? hex.slice(7, 9) : 'ff'; // 默认不透明

  // 根据 seed 生成 [-delta, delta] 内的偏移
  const off = (seed % (delta * 2 + 1)) - delta;
  const clamp = (n: number) => Math.max(0, Math.min(255, n + off));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');

  return `#${toHex(clamp(r))}${toHex(clamp(g))}${toHex(clamp(b))}${a}`;
}

/**
 * 将后端课程数据转换为前端格式
 */
function convertBackendCourse(backendCourse: any, index: number): Course {
  // 优化后的颜色库，具有更高的对比度和区分度
  const colors = [
    "#ef746bff", // 珊瑚红
    "#4eef71ff", // 草绿
    "#3cc0ddff", // 天蓝
    "#f79872ff", // 浅橙
    "#a0e3d2ff", // 薄荷绿
    "#e6e595ff", // 浅黄
    "#bc9bfeff", // 浅紫
    "#f67be1ff", // 亮粉
    "#f5bc54ff", // 橙黄
    "#432ee7ff", // 深紫
    "#6dc2f3ff", // 亮蓝
    "#057c21ff", // 深绿
    "#f68317ff", // 橙色
    "#f91d1dff", // 红色
    "#0de2e2ff", // 青色
  ];
  
  // 使用课程名称的哈希值来选择颜色
  // 为了增加相邻课程的差异，我们可以对哈希值进行一些扰动
  const hash = hashString(backendCourse.course_name);
  const colorIndex = (hash ) % colors.length;

  // 解析周次范围
  let weekStart = 1;
  let weekEnd = 20;

  if (backendCourse.week_range) {
    const match = backendCourse.week_range.match(/(\d+)-(\d+)/);
    if (match) {
      weekStart = parseInt(match[1]);
      weekEnd = parseInt(match[2]);
    }
  }

  // 解析节次范围
  let startPeriod = 1;
  let endPeriod = 2;

  if (backendCourse.period) {
    const match = backendCourse.period.match(/(\d+)-?(\d+)?/);
    if (match) {
      startPeriod = parseInt(match[1]);
      endPeriod = match[2] ? parseInt(match[2]) : startPeriod;
    }
  }
  const color = perturbHex8(colors[colorIndex],(backendCourse.day_of_week || 0) * 3 + startPeriod, 15);
  // 判断单双周
  let isSingleWeek: "single" | "double" | "both" = "both";
  if (backendCourse.is_single_week === true) {
    isSingleWeek = "single";
  } else if (backendCourse.is_single_week === false) {
    isSingleWeek = "double";
  }

  return {
    id: backendCourse.course_id,
    name: backendCourse.course_name,
    teacher: backendCourse.teacher,
    classroom: backendCourse.location,
    dayOfWeek: backendCourse.day_of_week || 1,
    startPeriod,
    endPeriod,
    weekStart,
    weekEnd,
    color,
    isSingleWeek,
    periodTime: backendCourse.period_time,
    courseCode: backendCourse.course_code,
    semester: backendCourse.semester,
    examInfo: backendCourse.exam_info,
  };
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);

  const scheduleContext: ScheduleContextType = {
    state,
    fetchSchedule: async () => {
      dispatch({ type: "SET_LOADING", payload: true });
      try {
        // 调用后端 API 获取课表数据
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/api/schedule/timetable`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "获取课表失败");
        }

        // 转换后端数据格式
        const convertedCourses = (result.courses || []).map((course: any, index: number) =>
          convertBackendCourse(course, index)
        );

        await AsyncStorage.setItem("courses", JSON.stringify(convertedCourses));
        dispatch({ type: "SET_COURSES", payload: convertedCourses });
        dispatch({ type: "SET_ERROR", payload: null });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "获取课表失败";
        console.error("Fetch schedule error:", error);
        dispatch({ type: "SET_ERROR", payload: errorMessage });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    fetchScheduleBySemester: async (year: string, term: string, useCache = true) => {
      const cacheKey = `schedule_${year}_${term}`;
      
      // 尝试从缓存获取
      if (useCache) {
        try {
          const cachedData = await AsyncStorage.getItem(cacheKey);
          if (cachedData) {
            const courses = JSON.parse(cachedData);
            dispatch({ type: "SET_COURSES", payload: courses });
            return;
          }
        } catch (e) {
          console.warn("读取课表缓存失败", e);
        }
      }

      dispatch({ type: "SET_LOADING", payload: true });
      try {
        const apiBaseUrl = getApiBaseUrl();
        // 从 AsyncStorage 获取用户名
        const username = await AsyncStorage.getItem("username");
        if (!username) {
          throw new Error("未找到用户名，请先登录");
        }
        
        const response = await fetch(
          `${apiBaseUrl}/api/schedule/timetable-by-semester?username=${encodeURIComponent(username)}&year=${encodeURIComponent(
            year
          )}&term=${encodeURIComponent(term)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "获取学期课表失败");
        }

        const convertedCourses = (result.courses || []).map((course: any, index: number) =>
          convertBackendCourse(course, index)
        );

        // 写入缓存
        await AsyncStorage.setItem(cacheKey, JSON.stringify(convertedCourses));
        
        dispatch({ type: "SET_COURSES", payload: convertedCourses });
        dispatch({ type: "SET_ERROR", payload: null });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "获取学期课表失败";
        console.error("Fetch semester schedule error:", error);
        dispatch({ type: "SET_ERROR", payload: errorMessage });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    setCurrentWeek: (week: number) => {
      dispatch({ type: "SET_CURRENT_WEEK", payload: week });
    },
    setWeekType: (type: "all" | "single" | "double") => {
      dispatch({ type: "SET_WEEK_TYPE", payload: type });
    },
    getCoursesForWeek: (week: number) => {
      // 筛选在当前周次范围内的课程
      let filtered = state.courses.filter(
        (course) => course.weekStart <= week && week <= course.weekEnd
      );

      // 根据单双周过滤课程
      const isOddWeek = week % 2 === 1; // 奇数周 = 单周
      
      filtered = filtered.filter((course) => {
        if (course.isSingleWeek === "both") {
          // 单双周都上，总是显示
          return true;
        } else if (course.isSingleWeek === "single") {
          // 单周课，只在奇数周显示
          return isOddWeek;
        } else if (course.isSingleWeek === "double") {
          // 双周课，只在偶数周显示
          return !isOddWeek;
        }
        return true;
      });

      return filtered;
    },
    clearError: () => {
      dispatch({ type: "CLEAR_ERROR" });
    },
  };

  return <ScheduleContext.Provider value={scheduleContext}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const context = useContext(ScheduleContext);
  if (!context) {
    throw new Error("useSchedule must be used within a ScheduleProvider");
  }
  return context;
}
