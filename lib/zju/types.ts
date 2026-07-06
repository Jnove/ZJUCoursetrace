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

export interface CoursewareFile {
  id: number;            // upload id
  referenceId: number;   // reference_id（开放下载走这个）
  name: string;          // 清洗前的原始文件名
  size: number;          // 字节；未知为 0
  allowDownload: boolean;// false = 老师未开放
}

export interface HomeworkDetail {
  id: number;
  title: string;
  bodyText: string;      // 已 htmlToPlainText
  attachments: CoursewareFile[];
  score: string | null;  // 得分，无则 null
  comment: string | null;// 评语，无则 null
}
