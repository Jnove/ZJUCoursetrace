/**
 * lib/schedule-context.tsx
 *
 * Uses zju-client directly — no backend server.
 * RawCourse from zju-client already matches our Course shape (minus color),
 * so convertBackendCourse is no longer needed.
 *
 * Cache key format: schedule_${yearValue}_${termValue}
 *   e.g. "schedule_2025-2026_2|春"
 */
import React, {useEffect, createContext, useContext, useReducer, ReactNode, useRef} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchTimetable,
  getSemesterOptions,
  RawCourse,
  ZjuSession,
} from "@/lib/zju-client";
import { assignColors, ColorableItem, COURSE_PALETTES } from "@/lib/course-palette";
import { useTheme } from "@/lib/theme-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Course {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  weekStart: number;
  weekEnd: number;
  color: string;
  isSingleWeek?: "single" | "double" | "both";
  periodTime?: string;
  courseCode?: string;
  semester?: string;
  examInfo?: string;
}

export interface ScheduleState {
  courses: Course[];
  isLoading: boolean;
  error: string | null;
  currentWeek: number;
  weekType: "all" | "single" | "double";
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
    case "SET_COURSES":    return { ...state, courses: action.payload };
    case "SET_LOADING":    return { ...state, isLoading: action.payload };
    case "SET_ERROR":      return { ...state, error: action.payload };
    case "SET_CURRENT_WEEK": return { ...state, currentWeek: action.payload };
    case "SET_WEEK_TYPE":  return { ...state, weekType: action.payload };
    case "CLEAR_ERROR":    return { ...state, error: null };
    default:               return state;
  }
}

interface ScheduleContextType {
  state: ScheduleState;
  fetchSchedule: () => Promise<void>;
  fetchScheduleBySemester: (yearValue: string, termValue: string, useCache?: boolean) => Promise<Course[]|undefined>;
  setCurrentWeek: (week: number) => void;
  setWeekType: (type: "all" | "single" | "double") => void;
  getCoursesForWeek: (week: number) => Course[];
  clearError: () => void;
  refreshAllSemesters: (semesters: { yearValue: string; termValue: string }[]) => Promise<{ success: boolean; failedCount: number }>;
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(undefined);

// ─── Helper: split stored key on FIRST pipe only ──────────────────────────────
// termValue may itself contain "|" (e.g. "2|春"), so we must not use
// plain .split("|") which would give the wrong termValue.
function parseStoredKey(key: string): [string, string] {
  const idx = key.indexOf("|");
  if (idx === -1) return [key, ""];
  return [key.slice(0, idx), key.slice(idx + 1)];
}

// ─── Session helper ───────────────────────────────────────────────────────────
async function buildSession(): Promise<ZjuSession> {
  const username = await AsyncStorage.getItem("username");
  if (!username) throw new Error("未找到用户名，请先登录");
  return { username, jsessionId: "native", routeCookie: null };
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const latestRequestIdRef = useRef(0);
  const { coursePaletteKey } = useTheme();

  useEffect(() => {
    const reColor = async () => {
      const username = await AsyncStorage.getItem("username");
      if (!username) return;
      const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
      if (!lastKey || !lastKey.includes("|")) return;
      // ← fixed: split on first | only
      const [yearValue, termValue] = parseStoredKey(lastKey);
      const rawCacheKey = `raw_schedule_${yearValue}_${termValue}`;
      try {
        const raw = await AsyncStorage.getItem(rawCacheKey);
        if (raw) {
          const rawCourses: RawCourse[] = JSON.parse(raw);
          const palette = COURSE_PALETTES[coursePaletteKey].colors;
          const colored = assignColors(rawCourses as ColorableItem[], palette) as Course[];
          dispatch({ type: "SET_COURSES", payload: colored });
        }
      } catch (e) {
        console.warn("重新着色失败", e);
      }
    };
    reColor();
  }, [coursePaletteKey]);

  const scheduleContext: ScheduleContextType = {
    state,

    // Fetch current semester (used on app startup / schedule tab mount)
    fetchSchedule: async () => {
      dispatch({ type: "SET_LOADING", payload: true });
      let loadedFromCache = false;

      // 1. Try to load from last-used cache
      try {
        const username = await AsyncStorage.getItem("username");
        if (username) {
          const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
          if (lastKey && typeof lastKey === "string" && lastKey.includes("|")) {
            // ← fixed: split on first | only
            const [yearValue, termValue] = parseStoredKey(lastKey);
            const raw = await AsyncStorage.getItem(`schedule_${yearValue}_${termValue}`);
            if (raw) {
              dispatch({ type: "SET_COURSES", payload: JSON.parse(raw) });
              dispatch({ type: "SET_ERROR", payload: null });
              loadedFromCache = true;
            }
          }
        }
      } catch (e) {
        console.warn("[ScheduleContext] cache load failed", e);
      }

      // 2. Fetch fresh from API
      try {
        const session = await buildSession();
        const opts = await getSemesterOptions(session);
        const currentYearValue = opts.yearOptions.find(o => o.selected)?.value ?? opts.yearOptions[0]?.value;
        const currentTermValue = opts.termOptions.find(o => o.selected)?.value ?? opts.termOptions[0]?.value;
        if (!currentYearValue || !currentTermValue) throw new Error("无法获取当前学期原始值");

        const result = await fetchTimetable(session, currentYearValue, currentTermValue);
        const converted = assignColors(result.rawCourses as Course[]);

        const cacheKey = `schedule_${currentYearValue}_${currentTermValue}`;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(converted));
        dispatch({ type: "SET_COURSES", payload: converted });
        dispatch({ type: "SET_ERROR", payload: null });
      } catch (error) {
        if (!loadedFromCache)
          dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "获取课表失败" });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },

    // Fetch a specific semester; yearValue and termValue are raw values (e.g., "2025-2026", "2|春")
    fetchScheduleBySemester: async (yearValue: string, termValue: string, useCache = true) => {
      const cacheKey = `schedule_${yearValue}_${termValue}`;

      if (useCache) {
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            dispatch({ type: "SET_COURSES", payload: JSON.parse(raw) });
            return;
          }
        } catch (e) {
          console.warn("读取课表缓存失败", e);
        }
      }

      // 清空旧数据，显示加载状态
      dispatch({ type: "SET_COURSES", payload: [] });
      dispatch({ type: "SET_LOADING", payload: true });

      // 生成新请求ID
      const requestId = ++latestRequestIdRef.current;

      try {
        const session = await buildSession();
        const result = await fetchTimetable(session, yearValue, termValue);
        const converted = assignColors(result.rawCourses as Course[]);
        
        // 只有最新请求才更新UI和缓存
        if (requestId === latestRequestIdRef.current) {
          await AsyncStorage.setItem(cacheKey, JSON.stringify(converted));
          dispatch({ type: "SET_COURSES", payload: converted });
          dispatch({ type: "SET_ERROR", payload: null });
        } else {
          console.log(`丢弃过时请求 (${requestId})，当前最新为 ${latestRequestIdRef.current}`);
        }
        return result.rawCourses as Course[];
      } catch (error) {
        if (requestId === latestRequestIdRef.current) {
          dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "获取学期课表失败" });
        }
      } finally {
        if (requestId === latestRequestIdRef.current) {
          dispatch({ type: "SET_LOADING", payload: false });
        }
      }
      
    },

    setCurrentWeek: (week) => dispatch({ type: "SET_CURRENT_WEEK", payload: week }),
    setWeekType: (type) => dispatch({ type: "SET_WEEK_TYPE", payload: type }),
    getCoursesForWeek: (week: number) => {
      const isOddWeek = week % 2 === 1;
      return state.courses.filter(course => {
        if (course.weekStart > week || week > course.weekEnd) return false;
        if (course.isSingleWeek === "single") return isOddWeek;
        if (course.isSingleWeek === "double") return !isOddWeek;
        return true;
      });
    },
    clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    refreshAllSemesters: async (semesters) => {
      const concurrency = 3;
      let failedCount = 0;

      for (let i = 0; i < semesters.length; i += concurrency) {
        const chunk = semesters.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (sem) => {
            try {
              const session = await buildSession();
              const result = await fetchTimetable(session, sem.yearValue, sem.termValue);
              const converted = assignColors(result.rawCourses as Course[]);
              const cacheKey = `schedule_${sem.yearValue}_${sem.termValue}`;
              await AsyncStorage.setItem(cacheKey, JSON.stringify(converted));
            } catch (error) {
              console.error(`刷新学期 ${sem.yearValue} ${sem.termValue} 失败:`, error);
              failedCount++;
            }
          })
        );
      }

      return { success: failedCount === 0, failedCount };
    }
  };

  return <ScheduleContext.Provider value={scheduleContext}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error("useSchedule must be used within a ScheduleProvider");
  return ctx;
}