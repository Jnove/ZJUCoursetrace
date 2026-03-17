import React, { createContext, useContext, useReducer, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

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
  fetchScheduleBySemester: (year: string, term: string, useCache?: boolean) => Promise<void>;
  setCurrentWeek: (week: number) => void;
  setWeekType: (type: "all" | "single" | "double") => void;
  getCoursesForWeek: (week: number) => Course[];
  clearError: () => void;
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(undefined);

// ─── Color palette (20 visually distinct colors) ─────────────────────────────
// Arranged so consecutive entries look different — helps greedy graph coloring
const COLOR_PALETTE = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
  "#a855f7", // purple
  "#84cc16", // lime
  "#0ea5e9", // sky
  "#f43f5e", // rose
  "#10b981", // emerald
  "#6366f1", // indigo
  "#d97706", // amber
  "#0891b2", // dark cyan
  "#7c3aed", // dark violet
  "#059669", // dark emerald
  "#db2777", // dark pink
  "#65a30d", // dark lime
];

/**
 * Graph-colour the course list so no two visually adjacent cells share a colour.
 * "Adjacent" = (same day, periods overlap or touch) OR (neighbouring days, periods overlap).
 */
function assignCourseColors(courses: Course[]): Course[] {
  if (courses.length === 0) return [];

  const colorMap = new Map<string, string>();

  // Stable sort: day → startPeriod → name (deterministic across sessions)
  const sorted = [...courses].sort((a, b) =>
    a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek
    : a.startPeriod !== b.startPeriod ? a.startPeriod - b.startPeriod
    : a.name.localeCompare(b.name)
  );

  for (const course of sorted) {
    const usedColors = new Set<string>();

    for (const other of sorted) {
      if (other.id === course.id) continue;
      const assigned = colorMap.get(other.id);
      if (!assigned) continue;

      const dayDiff = Math.abs(course.dayOfWeek - other.dayOfWeek);
      if (dayDiff > 1) continue; // not adjacent in the grid

      // Periods "touch" if they overlap or are immediately consecutive
      const touches =
        course.startPeriod <= other.endPeriod + 1 &&
        other.startPeriod <= course.endPeriod + 1;

      if (touches) usedColors.add(assigned);
    }

    const color =
      COLOR_PALETTE.find(c => !usedColors.has(c)) ??
      COLOR_PALETTE[Math.abs(
        course.name.split("").reduce((h, ch) => (h << 5) - h + ch.charCodeAt(0), 0)
      ) % COLOR_PALETTE.length];

    colorMap.set(course.id, color);
  }

  return sorted.map(c => ({ ...c, color: colorMap.get(c.id)! }));
}

// ─── Backend → frontend conversion (no colour here) ──────────────────────────
function convertBackendCourse(backendCourse: any): Omit<Course, "color"> {
  let weekStart = 1, weekEnd = 20;
  if (backendCourse.week_range) {
    const m = backendCourse.week_range.match(/(\d+)-(\d+)/);
    if (m) { weekStart = parseInt(m[1]); weekEnd = parseInt(m[2]); }
  }

  let startPeriod = 1, endPeriod = 2;
  if (backendCourse.period) {
    const m = backendCourse.period.match(/(\d+)-?(\d+)?/);
    if (m) {
      startPeriod = parseInt(m[1]);
      endPeriod = m[2] ? parseInt(m[2]) : startPeriod;
    }
  }

  let isSingleWeek: "single" | "double" | "both" = "both";
  if (backendCourse.is_single_week === true)       isSingleWeek = "single";
  else if (backendCourse.is_single_week === false) isSingleWeek = "double";

  let examInfo = "";
  if (backendCourse.exam_time) {
    examInfo = `时间: ${backendCourse.exam_time}`;
    if (backendCourse.exam_location) examInfo += `\n地点: ${backendCourse.exam_location}`;
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
    isSingleWeek,
    periodTime: backendCourse.period_time,
    courseCode: backendCourse.course_code,
    semester: backendCourse.semester,
    examInfo: examInfo || backendCourse.exam_info,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);

  const scheduleContext: ScheduleContextType = {
    state,

    fetchSchedule: async () => {
      dispatch({ type: "SET_LOADING", payload: true });
      let loadedFromCache = false;

      try {
        const username = await AsyncStorage.getItem("username");
        if (username) {
          const lastSemester = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
          let year: string | undefined, term: string | undefined;

          if (lastSemester) {
            [year, term] = lastSemester.split("-");
          } else {
            const res = await fetch(`${getApiBaseUrl()}/api/schedule/semester-options`);
            const data = await res.json();
            if (data.success && data.current_year && data.current_term) {
              year = data.current_year;
              term = data.current_term;
            }
          }

          if (year && term) {
            const raw = await AsyncStorage.getItem(`schedule_${year}_${term}`);
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

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/schedule/timetable`);
        const result = await res.json();
        if (!result.success) throw new Error(result.error || "获取课表失败");

        const raw = (result.courses || []).map(convertBackendCourse);
        const converted = assignCourseColors(raw as Course[]);

        if (result.semester_info?.school_year && result.semester_info?.semester) {
          const key = `schedule_${result.semester_info.school_year}_${result.semester_info.semester}`;
          await AsyncStorage.setItem(key, JSON.stringify(converted));
        }
        dispatch({ type: "SET_COURSES", payload: converted });
        dispatch({ type: "SET_ERROR", payload: null });
      } catch (error) {
        if (!loadedFromCache)
          dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "获取课表失败" });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },

    fetchScheduleBySemester: async (year: string, term: string, useCache = true) => {
      const cacheKey = `schedule_${year}_${term}`;

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

      dispatch({ type: "SET_LOADING", payload: true });
      try {
        const username = await AsyncStorage.getItem("username");
        if (!username) throw new Error("未找到用户名，请先登录");

        const res = await fetch(
          `${getApiBaseUrl()}/api/schedule/timetable-by-semester` +
          `?username=${encodeURIComponent(username)}&year=${encodeURIComponent(year)}&term=${encodeURIComponent(term)}`
        );
        const result = await res.json();
        if (!result.success) throw new Error(result.error || "获取学期课表失败");

        const raw = (result.courses || []).map(convertBackendCourse);
        const converted = assignCourseColors(raw as Course[]);

        await AsyncStorage.setItem(cacheKey, JSON.stringify(converted));
        dispatch({ type: "SET_COURSES", payload: converted });
        dispatch({ type: "SET_ERROR", payload: null });
      } catch (error) {
        dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "获取学期课表失败" });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },

    setCurrentWeek: (week: number) => dispatch({ type: "SET_CURRENT_WEEK", payload: week }),
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
  };

  return <ScheduleContext.Provider value={scheduleContext}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error("useSchedule must be used within a ScheduleProvider");
  return ctx;
}
