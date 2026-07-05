/**
 * ZJU 客户端统一入口（barrel）。
 *
 * 实现已按职责拆分到 lib/zju/：
 *   - config.ts   基地址、UA 池、公共请求头
 *   - types.ts    所有数据类型
 *   - rsa.ts      纯 JS RSA 加密（CAS 密码）
 *   - http.ts     XHR helpers（native cookie jar）
 *   - cas.ts      CAS 登录、会话与凭据管理、withRelogin
 *   - parsers.ts  纯解析函数（课表/成绩/姓名等，可单测）
 *   - api.ts      课表/成绩/考试/作业/姓名等业务请求
 *
 * 外部代码请继续从本模块导入，内部结构变化不影响调用方。
 */

export type {
  ZjuSession,
  RawCourse,
  Course,
  Grade,
  ExamInfo,
  SemesterOption,
  HomeworkInfo,
} from "./zju/types";

export {
  login,
  loadSession,
  saveSession,
  clearSession,
  invalidateSession,
  withRelogin,
} from "./zju/cas";

export {
  getSemesterOptions,
  fetchTimetable,
  checkSemesterHasCourses,
  fetchMajorGrade,
  fetchGrade,
  fetchExams,
  fetchStudentName,
  loadStoredStudentName,
  fetchHomeworks,
} from "./zju/api";

export {
  parseKbList,
  parsePeriod,
  parseWeeks,
  yToXnm,
  tToXqm,
} from "./zju/parsers";
