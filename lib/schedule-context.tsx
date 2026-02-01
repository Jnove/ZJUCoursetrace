import React, { createContext, useContext, useReducer, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
}

export interface ScheduleState {
  courses: Course[];
  isLoading: boolean;
  error: string | null;
  currentWeek: number;
}

type ScheduleAction =
  | { type: "SET_COURSES"; payload: Course[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_CURRENT_WEEK"; payload: number }
  | { type: "CLEAR_ERROR" };

const initialState: ScheduleState = {
  courses: [],
  isLoading: false,
  error: null,
  currentWeek: 1,
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
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

interface ScheduleContextType {
  state: ScheduleState;
  fetchSchedule: (username: string) => Promise<void>;
  setCurrentWeek: (week: number) => void;
  getCoursesForWeek: (week: number) => Course[];
  clearError: () => void;
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(undefined);

// 生成示例课程数据（用于演示）
function generateMockCourses(): Course[] {
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"];
  const courses: Course[] = [
    {
      id: "1",
      name: "数据结构",
      teacher: "张三",
      classroom: "教室A101",
      dayOfWeek: 1,
      startPeriod: 1,
      endPeriod: 2,
      weekStart: 1,
      weekEnd: 16,
      color: colors[0],
    },
    {
      id: "2",
      name: "算法设计",
      teacher: "李四",
      classroom: "教室B202",
      dayOfWeek: 2,
      startPeriod: 3,
      endPeriod: 4,
      weekStart: 1,
      weekEnd: 16,
      color: colors[1],
    },
    {
      id: "3",
      name: "数据库系统",
      teacher: "王五",
      classroom: "教室C303",
      dayOfWeek: 3,
      startPeriod: 1,
      endPeriod: 2,
      weekStart: 1,
      weekEnd: 16,
      color: colors[2],
    },
    {
      id: "4",
      name: "操作系统",
      teacher: "赵六",
      classroom: "教室D404",
      dayOfWeek: 4,
      startPeriod: 5,
      endPeriod: 6,
      weekStart: 1,
      weekEnd: 16,
      color: colors[3],
    },
    {
      id: "5",
      name: "计算机网络",
      teacher: "孙七",
      classroom: "教室E505",
      dayOfWeek: 5,
      startPeriod: 3,
      endPeriod: 4,
      weekStart: 1,
      weekEnd: 16,
      color: colors[4],
    },
    {
      id: "6",
      name: "编译原理",
      teacher: "周八",
      classroom: "教室F606",
      dayOfWeek: 2,
      startPeriod: 7,
      endPeriod: 8,
      weekStart: 1,
      weekEnd: 16,
      color: colors[5],
    },
  ];
  return courses;
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);

  const scheduleContext: ScheduleContextType = {
    state,
    fetchSchedule: async (username: string) => {
      dispatch({ type: "SET_LOADING", payload: true });
      try {
        // 这里应该调用实际的API获取课表数据
        // 目前使用模拟数据
        await new Promise((resolve) => setTimeout(resolve, 800));
        
        const mockCourses = generateMockCourses();
        await AsyncStorage.setItem("courses", JSON.stringify(mockCourses));
        
        dispatch({ type: "SET_COURSES", payload: mockCourses });
        dispatch({ type: "SET_ERROR", payload: null });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "获取课表失败";
        dispatch({ type: "SET_ERROR", payload: errorMessage });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    setCurrentWeek: (week: number) => {
      dispatch({ type: "SET_CURRENT_WEEK", payload: week });
    },
    getCoursesForWeek: (week: number) => {
      return state.courses.filter(
        (course) => course.weekStart <= week && week <= course.weekEnd
      );
    },
    clearError: () => {
      dispatch({ type: "CLEAR_ERROR" });
    },
  };

  return (
    <ScheduleContext.Provider value={scheduleContext}>
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule() {
  const context = useContext(ScheduleContext);
  if (!context) {
    throw new Error("useSchedule must be used within a ScheduleProvider");
  }
  return context;
}
