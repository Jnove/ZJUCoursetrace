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
  /** 原始 HTML 字符串（来自 data.description），列表卡片展开时 htmlToPlainText 渲染 */
  description: string;
  /** 附件（来自 uploads），点按走 useCoursewareDownload 走缓存/下载流程 */
  attachments: CoursewareFile[];
}

export interface CoursewareFile {
  id: number;            // upload id
  referenceId: number;   // reference_id（开放下载走这个）
  name: string;          // 清洗前的原始文件名
  size: number;          // 字节；未知为 0
  allowDownload: boolean;// false = 老师未开放
}
