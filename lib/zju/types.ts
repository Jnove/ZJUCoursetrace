/**
 * ZJU 数据类型定义。
 */

export interface ZjuSession {
  username: string;
  jsessionId: "native";
  routeCookie: null;
}

export interface RawCourse {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  weekStart: number;
  weekEnd: number;
  isSingleWeek?: "single" | "double" | "both";
  periodTime?: string;
  courseCode?: string;
  semester?: string;
  examInfo?: string;
}

export type Course = RawCourse & { color: string };

export interface Grade {
  courseCode: string;
  courseName: string;
  credit: number;
  score: string | null;
  gpaPoints: number | null;
  courseType?: string;
  semester?: string;
  isMajor: boolean;
}

export interface ExamInfo {
  courseCode: string;
  courseName: string;
  examTime: string;
  examLocation: string;
  seat?: string;
  credit?: number;
  semester?: string;
  year?: string;
}

export interface SemesterOption {
  value: string;
  text: string;
  selected: boolean;
}

export interface HomeworkInfo {
  id: number;
  title: string;
  courseName: string;
  courseId: number;
  /** formatted "M月D日 HH:mm" */
  deadline: string;
  /** raw ISO-8601, used for sorting */
  deadlineIso: string;
  submitted: boolean;
}
