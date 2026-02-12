import { Lunar } from 'lunar-javascript';

/**
 * 学期信息
 */
export interface SemesterInfo {
  schoolYear: string;  // 学年，如 "2025-2026"
  semester: string;    // 学期，如 "秋"、"冬"、"春"、"夏"
  week: number;        // 当前周次，如 1-8
}

/**
 * 获取指定日期所在周的周一日期
 */
function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 如果是周日，往前推6天
  return new Date(date.getFullYear(), date.getMonth(), diff);
}

/**
 * 计算两个日期之间相差的周数
 */
function getWeeksDiff(date1: Date, date2: Date): number {
  const monday1 = getMonday(date1);
  const monday2 = getMonday(date2);
  const diffTime = monday2.getTime() - monday1.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return Math.floor(diffDays / 7);
}

/**
 * 获取指定年份的元宵节日期（阳历）
 */
function getLanternFestivalDate(year: number): Date {
  // 农历正月十五
  const lunar = Lunar.fromYmd(year, 1, 15);
  const solar = lunar.getSolar();
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
}

/**
 * 获取指定年份9月15日所在周的周一
 */
function getSeptemberMidMonday(year: number): Date {
  const sept15 = new Date(year, 8, 15); // 月份从0开始，8表示9月
  return getMonday(sept15);
}

/**
 * 根据日期判定当前学期信息
 * 
 * 判定标准：
 * - 春学期：以中国农历元宵节所在的周作为春一周，范围是春一周到春八周
 * - 夏学期：夏一周是春八周后一周，范围是夏一周到夏八周
 * - 秋学期：以阳历9月15所在的周作为秋一周，范围是秋一周到秋八周
 * - 冬学期：冬一周是秋八周后一周，范围是冬一周到冬八周
 * 
 * @param date 要判定的日期，默认为今天
 * @returns 学期信息，如果不在任何学期内则返回 null
 */
export function getCurrentSemester(date: Date = new Date()): SemesterInfo | null {
  const year = date.getFullYear();
  
  // 获取当前年份和前一年的关键日期
  const currentYearLantern = getLanternFestivalDate(year);
  const currentYearSept = getSeptemberMidMonday(year);
  const prevYearSept = getSeptemberMidMonday(year - 1);
  
  // 计算各学期的起始周一
  const springWeek1 = getMonday(currentYearLantern);
  const summerWeek1 = new Date(springWeek1);
  summerWeek1.setDate(summerWeek1.getDate() + 8 * 7); // 春八周后一周
  
  const autumnWeek1 = currentYearSept;
  const winterWeek1 = new Date(autumnWeek1);
  winterWeek1.setDate(winterWeek1.getDate() + 8 * 7); // 秋八周后一周
  
  const prevAutumnWeek1 = prevYearSept;
  const prevWinterWeek1 = new Date(prevAutumnWeek1);
  prevWinterWeek1.setDate(prevWinterWeek1.getDate() + 8 * 7);
  
  // 判定当前日期属于哪个学期
  const currentMonday = getMonday(date);
  
  // 检查秋学期（当前年）
  const autumnWeeks = getWeeksDiff(autumnWeek1, currentMonday);
  if (autumnWeeks >= 0 && autumnWeeks < 8) {
    return {
      schoolYear: `${year}-${year + 1}`,
      semester: '秋',
      week: autumnWeeks + 1
    };
  }
  
  // 检查冬学期（当前年）
  const winterWeeks = getWeeksDiff(winterWeek1, currentMonday);
  if (winterWeeks >= 0 && winterWeeks < 8) {
    return {
      schoolYear: `${year}-${year + 1}`,
      semester: '冬',
      week: winterWeeks + 1
    };
  }
  
  // 检查春学期（当前年）
  const springWeeks = getWeeksDiff(springWeek1, currentMonday);
  if (springWeeks >= 0 && springWeeks < 8) {
    return {
      schoolYear: `${year - 1}-${year}`,
      semester: '春',
      week: springWeeks + 1
    };
  }
  
  // 检查夏学期（当前年）
  const summerWeeks = getWeeksDiff(summerWeek1, currentMonday);
  if (summerWeeks >= 0 && summerWeeks < 8) {
    return {
      schoolYear: `${year - 1}-${year}`,
      semester: '夏',
      week: summerWeeks + 1
    };
  }
  
  // 检查前一年的冬学期（跨年情况）
  const prevWinterWeeks = getWeeksDiff(prevWinterWeek1, currentMonday);
  if (prevWinterWeeks >= 0 && prevWinterWeeks < 8) {
    return {
      schoolYear: `${year - 1}-${year}`,
      semester: '冬',
      week: prevWinterWeeks + 1
    };
  }
  
  // 不在任何学期内
  return null;
}
