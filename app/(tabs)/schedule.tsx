import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  useWindowDimensions, PanResponder, Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ScheduleTable } from "@/components/schedule-table";
import { useSchedule } from "@/lib/schedule-context";
import CourseDetailContent from "@/app/courseDetailContent";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { Course } from "@/lib/schedule-context";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";
import { useTheme, CARD_RADIUS_VALUES, DEFAULT_PRIMARY, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";
import { writeLog } from "@/lib/diagnostic-log";
import { loadActiveSemesters } from "@/lib/semester-loader";
import { getCurrentSemester } from "@/lib/semester-utils";
import {
  loadCalendarData,
  resolveEffectiveDate,
  isHoliday as calIsHoliday,
  getExchangeRef,
  semesterInfoToCalendarKey,
  type CalendarData,
  type SemesterCalendar,
} from "@/lib/calendar-service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SemesterOption {
  yearValue: string; termValue: string;
  yearText: string; termText: string; label: string;
}

function semesterKey(y: string, t: string) { return `${y}|${t}`; }
function parseKey(key: string): [string, string] {
  const idx = key.indexOf("|");
  return idx === -1 ? [key, ""] : [key.slice(0, idx), key.slice(idx + 1)];
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function rgba(hex: string, a: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${a})`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/**
 * Find the SemesterCalendar that governs a given date.
 *
 * Priority:
 *   1. The semester the date naturally falls inside (via getCurrentSemester).
 *   2. If the date is outside every semester (e.g. a makeup day in week 9),
 *      scan every SemesterCalendar in calData and return the first one that
 *      lists this date in its `exchange` map or `holiday` array.
 *      This handles the case where a 调休 makeup date falls after the last
 *      official week of the semester.
 */
function getSemCal(date: Date, calData: CalendarData | null): { selcal: SemesterCalendar | null,sem: string | null} {
  if (!calData) return { selcal: null, sem: null };

  // 1. Normal path — date is inside a recognised semester
  const info = getCurrentSemester(date);
  if (info) {
    const key = semesterInfoToCalendarKey(info.schoolYear, info.semester);
    const cal = calData[key];
    if (cal) return { selcal: cal, sem: key };
  }

  // 2. Fallback — scan all semesters for an explicit entry matching this date
  const ds = toDateStr(date);
  for (const semKey of Object.keys(calData)) {
    if (Object.keys(calData[semKey].exchange).includes(ds) || calData[semKey].holiday.includes(ds) ) {
      return { selcal: calData[semKey], sem: semKey };
    }
  }

  return { selcal: null, sem: null };
}

function computeCoursesForDate(
  date: Date,
  all: Course[],
  calData: CalendarData | null,
): Course[] {
  const res = getSemCal(date, calData);
  const semCal = res.selcal, semester = res.sem;
  
  const effective = resolveEffectiveDate(semCal, date);
  if (effective === null) return [];
  
  const dateSemester = getCurrentSemester(date);
  if (!dateSemester) return [];

  const exchRef = getExchangeRef(semCal, date);

  const effInfo = getCurrentSemester(effective);
  if (!effInfo) return [];

  const effDow = effective.getDay() === 0 ? 7 : effective.getDay();
  const { week } = effInfo;
  const isOddWeek = week % 2 === 1;
  //console.log(toDateStr(date), semester, effDow);
  return all
    .filter(c => {
      //console.log(c.semester);
      if (c.dayOfWeek !== effDow) return false;
      if (week < c.weekStart || week > c.weekEnd) return false;
      if ((c.semester?.split(' ')[0] !== dateSemester.schoolYear || c.semester?.split(' ')[1] !== dateSemester.semester) || (!exchRef && dateSemester.week === 9 ))return false;
      if (c.isSingleWeek === "single") return isOddWeek;
      if (c.isSingleWeek === "double") return !isOddWeek;
      return true;
    })
    .sort((a, b) => a.startPeriod - b.startPeriod);
}

// ─── Calendar Mode ────────────────────────────────────────────────────────────

const CN_WEEKDAYS = ["一","二","三","四","五","六","日"];
const CN_MONTHS   = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

interface DayCell {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isHol: boolean;
  exchRef: string | null;
  courses: Course[];
  isOtherMonth: boolean; // 本月视图中显示的上/下月日期
}

function CalendarMode({
  courses,
  onCoursePress,
  refreshControl,
  r,
}: {
  courses: Course[];
  onCoursePress: (c: Course) => void;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  r: number;
}) {
  const colors = useColors();
  const { primaryColor } = useTheme();
  const { width: sw } = useWindowDimensions();

  const HPAD    = 16;
  const cellW   = Math.floor((sw - HPAD * 2) / 7);
  const CELL_NUM_H = 34;
  const CELL_TAG_H = 14;
  const CELL_DOT_H = 8;
  const CELL_GAP   = 4;
  const cellH = CELL_NUM_H + CELL_TAG_H + CELL_DOT_H + CELL_GAP;

  const todayStr = useMemo(() => toDateStr(new Date()), []);

  const [isWeekView, setIsWeekView] = useState(false);
  const [viewMonth, setViewMonth]   = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [calData, setCalData]           = useState<CalendarData | null>(null);

  // Animated values
  const collapseAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;
  const monthSlideX = useRef(new Animated.Value(0)).current;
  const monthAlpha  = useRef(new Animated.Value(1)).current;

  const animValueRef      = useRef(0);
  const gestureStartAnim  = useRef(0);
  const gestureDir        = useRef<"h" | "v" | null>(null);
  const weekRowRef        = useRef(0);
  const cellHRef          = useRef(cellH);
  const fullGridHRef      = useRef(0);
  const changeMonthRef    = useRef<(dir: "prev" | "next") => void>(() => {});

  useEffect(() => { cellHRef.current = cellH; }, [cellH]);

  useEffect(() => {
    const id = collapseAnim.addListener(({ value }) => { animValueRef.current = value; });
    return () => collapseAnim.removeListener(id);
  }, [collapseAnim]);

  useEffect(() => {
    const id = collapseAnim.addListener(({ value }) => {
      translateAnim.setValue(-value * weekRowRef.current * cellHRef.current);
    });
    return () => collapseAnim.removeListener(id);
  }, [collapseAnim, translateAnim]);

  useEffect(() => {
    loadCalendarData().then(d => setCalData(d)).catch(() => {});
  }, []);

  const selectedDateStr = toDateStr(selectedDate);

  const { weeks, courseMap } = useMemo(() => {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);
    let offset  = first.getDay() - 1;
    if (offset < 0) offset = 6;

    const courseMap = new Map<string, Course[]>();
    const days: DayCell[] = [];

    // 前月末尾填充：让第一行的周一~周六显示上月日期（标记 isOtherMonth）
    if (offset > 0) {
      const prevMonthLastDay = new Date(y, m, 0).getDate(); // 上月最后一天
      for (let i = 0; i < offset; i++) {
        const d    = prevMonthLastDay - offset + 1 + i;
        const date = new Date(y, m - 1, d);
        const dateStr = toDateStr(date);
        const semCal  = getSemCal(date, calData).selcal;
        const isHol   = calIsHoliday(semCal, date);
        const exchRef = getExchangeRef(semCal, date);
        const cs      = computeCoursesForDate(date, courses, calData);
        courseMap.set(dateStr, cs);
        days.push({ date, dateStr, isToday: dateStr === todayStr, isHol, exchRef, courses: cs, isOtherMonth: true });
      }
    }

    for (let d = 1; d <= last.getDate(); d++) {
      const date    = new Date(y, m, d);
      const dateStr = toDateStr(date);
      const semCal  = getSemCal(date, calData).selcal;
      const isHol   = calIsHoliday(semCal, date);
      const exchRef = getExchangeRef(semCal, date);
      const cs      = computeCoursesForDate(date, courses, calData);
      courseMap.set(dateStr, cs);
      days.push({ date, dateStr, isToday: dateStr === todayStr, isHol, exchRef, courses: cs, isOtherMonth: false });
    }
    // 后月头部填充
    let nextMonthDay = 1;
    while (days.length % 7 !== 0) {
      const date    = new Date(y, m + 1, nextMonthDay++);
      const dateStr = toDateStr(date);
      const semCal  = getSemCal(date, calData).selcal;
      const isHol   = calIsHoliday(semCal, date);
      const exchRef = getExchangeRef(semCal, date);
      const cs      = computeCoursesForDate(date, courses, calData);
      courseMap.set(dateStr, cs);
      days.push({ date, dateStr, isToday: dateStr === todayStr, isHol, exchRef, courses: cs, isOtherMonth: true });
    }

    const weeks: DayCell[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks, courseMap };
  }, [viewMonth, courses, calData, todayStr]);

  const selectedWeekRow = useMemo(() => {
    const idx = weeks.findIndex(w => w.some(d => d.date && toDateStr(d.date) === selectedDateStr));
    return Math.max(0, idx);
  }, [weeks, selectedDateStr]);

  const FULL_GRID_H = weeks.length * cellH;
  const ONE_WEEK_H  = cellH;

  useEffect(() => { weekRowRef.current = selectedWeekRow; }, [selectedWeekRow]);
  useEffect(() => { fullGridHRef.current = FULL_GRID_H; }, [FULL_GRID_H]);

  const animatedGridH = useMemo(() =>
    collapseAnim.interpolate({
      inputRange:  [0, 1],
      outputRange: [FULL_GRID_H, ONE_WEEK_H],
    }),
  [collapseAnim, FULL_GRID_H, ONE_WEEK_H]);

  useEffect(() => {
    const target = isWeekView ? 1 : 0;
    const targetTY = isWeekView ? -selectedWeekRow * cellH : 0;
    Animated.parallel([
      Animated.spring(collapseAnim, {
        toValue: target, useNativeDriver: false, tension: 68, friction: 12,
      }),
      Animated.spring(translateAnim, {
        toValue: targetTY, useNativeDriver: true, tension: 68, friction: 12,
      }),
    ]).start();
  }, [isWeekView, selectedWeekRow, cellH, collapseAnim, translateAnim]);

  const changeMonth = useCallback((dir: "prev" | "next") => {
    const outX = dir === "next" ? -sw * 0.28 : sw * 0.28;
    Animated.parallel([
      Animated.timing(monthAlpha,  { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(monthSlideX, { toValue: outX, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + (dir === "next" ? 1 : -1), 1));
      monthSlideX.setValue(-outX * 0.35);
      Animated.parallel([
        Animated.spring(monthAlpha,  { toValue: 1, useNativeDriver: true, overshootClamping: true }),
        Animated.spring(monthSlideX, { toValue: 0, useNativeDriver: true, tension: 85, friction: 12 }),
      ]).start();
    });
  }, [sw, monthAlpha, monthSlideX]);

  useEffect(() => { changeMonthRef.current = changeMonth; }, [changeMonth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        gestureStartAnim.current = animValueRef.current;
        gestureDir.current = null;
        collapseAnim.stopAnimation();
        translateAnim.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        if (!gestureDir.current) {
          if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) {
            gestureDir.current = Math.abs(g.dx) > Math.abs(g.dy) ? "h" : "v";
          }
          return;
        }
        if (gestureDir.current !== "v") return;
        const range = fullGridHRef.current - cellHRef.current;
        if (range <= 0) return;
        const delta  = -g.dy / range;
        const newVal = Math.max(0, Math.min(1, gestureStartAnim.current + delta));
        collapseAnim.setValue(newVal);
      },
      onPanResponderRelease: (_, g) => {
        const dir = gestureDir.current;
        gestureDir.current = null;
        if (dir === "h" && Math.abs(g.dx) > 50) {
          changeMonthRef.current(g.dx < 0 ? "next" : "prev");
          Animated.spring(collapseAnim, {
            toValue: animValueRef.current > 0.5 ? 1 : 0,
            useNativeDriver: false, tension: 70, friction: 12,
          }).start();
        } else {
          const snapToWeek = animValueRef.current > 0.42;
          setIsWeekView(snapToWeek);
          const targetTY = snapToWeek ? -weekRowRef.current * cellHRef.current : 0;
          Animated.parallel([
            Animated.spring(collapseAnim, {
              toValue: snapToWeek ? 1 : 0, useNativeDriver: false, tension: 70, friction: 12,
            }),
            Animated.spring(translateAnim, {
              toValue: targetTY, useNativeDriver: true, tension: 70, friction: 12,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        const snapToWeek = animValueRef.current > 0.42;
        Animated.spring(collapseAnim, {
          toValue: snapToWeek ? 1 : 0, useNativeDriver: false, tension: 70, friction: 12,
        }).start();
      },
    })
  ).current;

  const selCourses = useMemo(() =>
    courseMap.get(selectedDateStr) ?? computeCoursesForDate(selectedDate, courses, calData),
  [selectedDate, selectedDateStr, courseMap, courses, calData]);

  const selSemInfo  = useMemo(() => getCurrentSemester(selectedDate), [selectedDate]);
  const selSemCal   = useMemo(() => getSemCal(selectedDate, calData).selcal, [selectedDate, calData]);
  const selIsHol    = calIsHoliday(selSemCal, selectedDate);
  const selExchRef  = getExchangeRef(selSemCal, selectedDate);
  const selDow      = selectedDate.getDay();
  const selIsWknd   = (selDow === 0 || selDow === 6) && !selExchRef && !selIsHol && selCourses.length === 0;

  const exchRefDate = selExchRef ? new Date(`${selExchRef}T00:00:00`) : null;
  const exchLabel   = exchRefDate
    ? `${exchRefDate.getMonth()+1}月${exchRefDate.getDate()}日（周${CN_WEEKDAYS[exchRefDate.getDay()===0?6:exchRefDate.getDay()-1]}）`
    : null;

  const STATUS_COLOR = selIsHol ? colors.error : selExchRef ? "#f97316" : selIsWknd ? rgba(colors.muted,0.7) : primaryColor;

  const goToToday = useCallback(() => {
    const n = new Date();
    setViewMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelectedDate(n);
  }, []);

  const pillW = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 20] });
  
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View style={{ flex: 1 }}>
      {/* 日历区域（带手势） */}
      <View
        {...panResponder.panHandlers}
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          paddingBottom: 4,
        }}
      >
        {/* 月份头部 */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: HPAD,
          paddingTop: 14, paddingBottom: 10,
        }}>
          <TouchableOpacity
            onPress={() => changeMonth("prev")}
            hitSlop={{ top:12, bottom:12, left:12, right:12 }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: colors.background,
              borderWidth: 0.5, borderColor: colors.border,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <IconSymbol name="chevron.left" size={16} color={colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity onPress={goToToday} activeOpacity={0.7} style={{ alignItems: "center", gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground, letterSpacing: -0.4, fontFamily: ff}}>
                  {CN_MONTHS[viewMonth.getMonth()]}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "500", color: colors.muted, fontFamily: ff }}>
                  {viewMonth.getFullYear()}
                </Text>
              </View>
              {todayStr.slice(0, 7) !== toDateStr(viewMonth).slice(0, 7) && (
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                  backgroundColor: rgba(primaryColor, 0.12),
                  flexDirection: "row", alignItems: "center", gap: 4,
                }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: primaryColor }} />
                  <Text style={{ fontSize: 10, color: primaryColor, fontWeight: "600", fontFamily: ff }}>回到今日</Text>
                </View>
              )}
            </TouchableOpacity>

          <TouchableOpacity
            onPress={() => changeMonth("next")}
            hitSlop={{ top:12, bottom:12, left:12, right:12 }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: colors.background,
              borderWidth: 0.5, borderColor: colors.border,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <IconSymbol name="chevron.right" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* 星期行 + 可折叠网格：整体受月份滑动动画驱动 */}
        {/* 外层用 native driver（opacity + translateX），内层用 JS driver（height） */}
        <Animated.View style={{ opacity: monthAlpha, transform: [{ translateX: monthSlideX }] }}>
          <View style={{ flexDirection: "row", paddingHorizontal: HPAD, marginBottom: 4 }}>
            {CN_WEEKDAYS.map((d, i) => (
              <View key={d} style={{ width: cellW, alignItems: "center" }}>
                <Text style={{
                  fontSize: 11, fontWeight: "700", letterSpacing: 0.2, fontFamily: ff,
                  color: i >= 5 ? rgba(colors.error, 0.65) : rgba(colors.muted, 0.65),
                }}>
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* 可折叠网格 */}
          <Animated.View style={{ height: animatedGridH, overflow: "hidden", paddingHorizontal: HPAD }}>
            <Animated.View style={{ transform: [{ translateY: translateAnim }] }}>
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: "row" }}>
                {week.map((day, di) => {
                  const isSelected   = day.dateStr === selectedDateStr;
                  const isWknd       = di >= 5 && !day.exchRef && !day.isHol;
                  const topColors    = day.courses.slice(0, 10).map(c => c.color);
                  const otherOpacity = day.isOtherMonth ? 0.28 : 1;

                  let bubbleBg     = "transparent";
                  let bubbleBorder = "transparent";
                  let numWeight: "700" | "400" = "400";
                  let numColor: string;

                  if (day.isToday && isSelected) {
                    bubbleBg = primaryColor; numColor = "#fff"; numWeight = "700";
                  } else if (day.isToday) {
                    bubbleBg = rgba(primaryColor, 0.14); bubbleBorder = primaryColor;
                    numColor = primaryColor; numWeight = "700";
                  } else if (isSelected) {
                    bubbleBg = primaryColor; numColor = "#fff"; numWeight = "700";
                  } else if (day.isHol) {
                    numColor = colors.error;
                  } else if (day.exchRef) {
                    numColor = "#1616f9";
                  } else if (isWknd) {
                    numColor = rgba(colors.foreground, 0.3);
                  } else {
                    numColor = colors.foreground;
                  }

                  return (
                    <TouchableOpacity
                      key={di}
                      onPress={() => setSelectedDate(day.date)}
                      activeOpacity={0.6}
                      style={{ width: cellW, height: cellH, alignItems: "center", paddingTop: 2, opacity: otherOpacity }}
                    >
                      <View style={{
                        width: CELL_NUM_H*1.05, height: CELL_NUM_H*1.05, borderRadius: CELL_NUM_H / 2,
                        backgroundColor: bubbleBg,
                        borderWidth: (day.isToday && !isSelected) ? 1.6 : 0,
                        borderColor: bubbleBorder,
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Text style={{ fontSize: 15, fontWeight: numWeight, color: numColor, fontFamily: ff }}>
                          {day.date.getDate()}
                        </Text>
                        <View style={{
                          position: "absolute", top: 1, right: 1,
                          //backgroundColor: color,
                          borderRadius: r, paddingHorizontal: 2.5, paddingVertical: 1,
                        }}>
                          {day.isHol ? (
                            <Text style={{ fontSize: 9, color: numColor, fontWeight: "700", fontFamily: ff }}>假</Text>
                          ) : day.exchRef ? (
                            <Text style={{ fontSize: 9, color: numColor, fontWeight: "700", fontFamily: ff }}>补</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={{
                        flexDirection: "row",
                        width:CELL_NUM_H,
                        height: CELL_DOT_H, gap: 1.5, alignItems: "center", justifyContent: "center"
                      }}>
                        {topColors.map((col, ci) => {
                          const stripW = Math.min(9, Math.floor((cellW - 12) / Math.max(topColors.length,1) - 1.5));
                          return (
                            <View key={ci} style={{
                              width: stripW/1.8, height: 3.5, borderRadius: 2,
                              backgroundColor: col,
                              opacity: isSelected ? 1 : 0.7,
                            }} />
                          );
                        })}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </Animated.View>
          </Animated.View>
        </Animated.View> {/* end monthSlideX wrapper */}

        {/* 折叠手柄 */}
        <TouchableOpacity
          onPress={() => setIsWeekView(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 60, right: 60 }}
          style={{ alignItems: "center", paddingTop: 8, paddingBottom: 2 }}
        >
          <Animated.View style={{
            width: pillW, height: 4, borderRadius: 2,
            backgroundColor: rgba(colors.muted, 0.28),
          }} />
        </TouchableOpacity>
      </View>

      {/* 详情区域（独立 ScrollView，带刷新控件） */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* 图例 */}
        <View style={{
          flexDirection: "row", gap: 14, flexWrap: "wrap",
          paddingHorizontal: HPAD, paddingTop: 10, paddingBottom: 4,
        }}>
          {[
            { color: primaryColor, label: "今日" },
            { color: colors.error,  label: "假期" },
            { color: "#f97316",     label: "调休补班" },
          ].map(item => (
            <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: item.color }} />
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "500", fontFamily: ff }}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* 详情卡片 */}
        <View style={{
          marginHorizontal: HPAD,
          marginTop: 6,
          borderRadius: r + 2,
          backgroundColor: colors.background,
          overflow: "hidden",
          borderWidth: 0.5, borderColor: colors.border,
          shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        }}>
          <View style={{
            paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14,
            borderBottomWidth: 0.5, borderBottomColor: colors.border,
            gap: 8,
          }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, letterSpacing: -0.3, fontFamily: ff }}>
                  {selectedDate.getDate()}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "500", color: colors.muted, fontFamily: ff }}>
                  {selectedDate.getMonth() + 1}月 · 周{CN_WEEKDAYS[selDow === 0 ? 6 : selDow - 1]}
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 20,
                backgroundColor: rgba(STATUS_COLOR, 0.12),
                borderWidth: 0.5, borderColor: rgba(STATUS_COLOR, 0.28),
              }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLOR, fontFamily: ff }}>
                  {selIsHol
                    ? "假期"
                    : selIsWknd
                      ? "周末"
                      : !selSemInfo
                        ? "课外"
                        : `第 ${selSemInfo.week} 周 · ${selSemInfo.week % 2 === 1 ? "单" : "双"}周`}
                </Text>
              </View>
            </View>
            {selExchRef && exchLabel && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                paddingHorizontal: 12, paddingVertical: 7,
                borderRadius: r, backgroundColor: rgba("#f97316", 0.08),
                borderWidth: 0.5, borderColor: rgba("#f97316", 0.22),
              }}>
                <IconSymbol name="clock.fill" size={13} color="#f97316" />
                <Text style={{ fontSize: 12, color: "#f97316", fontWeight: "500", flex: 1, fontFamily: ff }}>
                  今日调休补班，按 {exchLabel} 课表上课
                </Text>
              </View>
            )}
          </View>

          {selIsHol ? (
            <View style={{ paddingVertical: 22, alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 26, fontFamily: ff }}>🎉</Text>
              <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "500", fontFamily: ff }}>放假，好好休息</Text>
            </View>
          ) : selIsWknd ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: rgba(colors.muted, 0.65), fontFamily: ff }}>周末，无课程安排</Text>
            </View>
          ) : !selSemInfo ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: rgba(colors.muted, 0.65), fontFamily: ff }}>不在学期范围内</Text>
            </View>
          ) : selCourses.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: rgba(colors.muted, 0.65), fontFamily: ff }}>今日无课程安排</Text>
            </View>
          ) : (
            selCourses.map((course, idx) => (
              <Pressable key={course.id} onPress={() => onCoursePress(course)}>
                {({ pressed }) => (
                  <View style={{
                    flexDirection: "row",
                    paddingRight: 18, paddingVertical: 14,
                    borderTopWidth: idx > 0 ? 0.5 : 0,
                    borderTopColor: colors.border,
                    alignItems: "stretch",
                    backgroundColor: pressed ? rgba(course.color, 0.05) : "transparent",
                    gap: 14,
                  }}>
                    <View style={{ width: 4, borderRadius: 2, backgroundColor: course.color, marginLeft: 14 }} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{
                        fontSize: 15, fontWeight: "600", fontFamily: ff,
                        color: colors.foreground, lineHeight: 20,
                      }} numberOfLines={2}>
                        {course.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <IconSymbol name="person.fill" size={11} color={course.color} />
                          {course.teacher ? (
                            <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>{course.teacher}</Text>
                              ) : null}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <IconSymbol name="clock.fill" size={11} color={course.color} />
                          <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: "500", fontFamily: ff }}>
                            {course.periodTime ?? ""}
                          </Text>
                        </View>
                        {course.classroom ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <IconSymbol name="location.fill" size={11} color={colors.muted} />
                            <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }} numberOfLines={1}>
                              {course.classroom}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
                      <IconSymbol name="chevron.right" size={13} color={rgba(colors.muted, 0.45)} />
                    </View>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const { state, fetchScheduleBySemester, refreshAllSemesters, resetScheduleLoading } = useSchedule();
  const colors = useColors();
  const { primaryColor } = useTheme();
  const [semesters, setSemesters]               = useState<SemesterOption[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [isRefreshing, setIsRefreshing]         = useState(false);
  const [viewMode, setViewMode]                 = useState<"grid" | "calendar">("grid");
  const [filterType, setFilterType]             = useState<"all" | "single" | "double">("all");
  const [tableAvailableH, setTableAvailableH]   = useState(0);
  const [isDownloading, setIsDownloading]       = useState(false);

  const [selectedCourse, setSelectedCourse]     = useState<Course | null>(null);
  const [detailVisible, setDetailVisible]       = useState(false);
  const [overlappingCourses, setOverlappingCourses] = useState<Course[]>([]);
  const [overlapVisible, setOverlapVisible]     = useState(false);

  // 所有学期课程合并，供日历模式跨学期显示使用
  const [allCourses, setAllCourses] = useState<Course[]>([]);

  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  const captureViewRef = useRef<View>(null);

  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const username = await AsyncStorage.getItem("username");
      if (!username || cancelled) return;

      let restoredKey: string | null = null;
      try {
        const last = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
        if (last) { restoredKey = last; if (!cancelled) setSelectedSemester(last); }
      } catch {}

      if (!cancelled) setLoadingSemesters(true);
      try {
        const all = await loadActiveSemesters(username);
        if (cancelled) return;
        if (all && all.length > 0) {
          setSemesters(all);

          // 后台加载所有学期缓存并合并，供日历模式跨学期展示
          (async () => {
            const combined: Course[] = [];
            for (const s of all) {
              try {
                const key = `schedule_${s.yearValue}_${s.termValue}`;
                const raw = await AsyncStorage.getItem(key);
                if (raw) {
                  const cs: Course[] = JSON.parse(raw);
                  combined.push(...cs);
                }
              } catch {}
            }
            setAllCourses(combined);
          })();
          let def = restoredKey ? all.find(s => semesterKey(s.yearValue, s.termValue) === restoredKey) : undefined;
          if (!def) def = all[0];
          if (def) {
            const key = semesterKey(def.yearValue, def.termValue);
            if (!cancelled) setSelectedSemester(key);
            await AsyncStorage.setItem(`lastSelectedSemester_${username}`, key);
            await fetchScheduleBySemester(def.yearValue, def.termValue, true);
          }
        } else { resetScheduleLoading(); setSemesters([]); setSelectedSemester(null); }
      } catch (e) {
        writeLog("SCHEDULE", `加载学期列表失败: ${e instanceof Error ? e.message : String(e)}`, "error");
        setSemesters([]); setSelectedSemester(null);
      } finally { if (!cancelled) setLoadingSemesters(false); }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  const handleSemesterChange = async (yv: string, tv: string) => {
    const key = semesterKey(yv, tv);
    setSelectedSemester(key); setShowSemesterPicker(false);
    const u = await AsyncStorage.getItem("username");
    if (u) await AsyncStorage.setItem(`lastSelectedSemester_${u}`, key);
    await fetchScheduleBySemester(yv, tv);

    // 重新合并所有学期缓存（新学期可能刚刚落盘）
    const combined: Course[] = [];
    for (const s of semesters) {
      try {
        const cacheKey = `schedule_${s.yearValue}_${s.termValue}`;
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) combined.push(...(JSON.parse(raw) as Course[]));
      } catch {}
    }
    setAllCourses(combined);
  };

  const handleRefresh = async () => {
    if (isRefreshing || !selectedSemester) return;
    setIsRefreshing(true);
    try {
      const all = semesters.map(s => ({ yearValue: s.yearValue, termValue: s.termValue }));
      if (!all.length) { Alert.alert("提示", "学期列表未加载"); return; }
      const { success, failedCount } = await refreshAllSemesters(all);
  
      // ✅ 区分"部分失败"和"全部成功"
      if (failedCount > 0) {
        Alert.alert(
          "刷新完成",
          `${failedCount} 个学期因网络问题未能更新，已保留原有数据。\n请在网络恢复后重试。`
        );
      } else {
        Alert.alert("完成", "所有学期课表已更新");
      }
    } catch (e: any) { Alert.alert("错误", e.message || "刷新失败"); }
    finally { setIsRefreshing(false); }
    const [yv, tv] = parseKey(selectedSemester);
    await handleSemesterChange(yv, tv);
  };
  const handleDownload = async () => {
    if (!captureViewRef.current) return;
    try {
      setIsDownloading(true);
      const uri = await captureRef(captureViewRef, { format: "png", quality: 1.0 });
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("权限不足", "请允许访问相册"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("完成", "已保存到相册");
    } catch { Alert.alert("导出失败", "截图失败，请重试"); }
    finally { setIsDownloading(false); }
  };

  const handleShare = async () => {
    if (!captureViewRef.current) return;
    try {
      setIsDownloading(true);
      const uri = await captureRef(captureViewRef, { format: "png", quality: 1.0 });
      const can = await Sharing.isAvailableAsync();
      if (can) await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "分享课表截图" });
      else Alert.alert("提示", "当前设备不支持分享");
    } catch { Alert.alert("导出失败", "截图失败，请重试"); }
    finally { setIsDownloading(false); }
  };

  const handleCoursePress = (c: Course) => { setSelectedCourse(c); setDetailVisible(true); };
  const handleMultiple    = (cs: Course[]) => { setOverlappingCourses(cs); setOverlapVisible(true); };
  const openFromOverlap   = (c: Course) => {
    setOverlapVisible(false);
    setTimeout(() => { setSelectedCourse(c); setDetailVisible(true); }, 220);
  };

  const filteredCourses = (state.courses ?? []).filter(c => {
    if (filterType === "single") return c.isSingleWeek !== "double";
    if (filterType === "double") return c.isSingleWeek !== "single";
    return true;
  });

  const selectedLabel = selectedSemester
    ? (semesters.find(s => semesterKey(s.yearValue, s.termValue) === selectedSemester)?.label ?? "选择学期")
    : "选择学期";

  return (
    <ScreenContainer className="flex-1 bg-surface">
      {state.isLoading && viewMode !== "calendar" ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.muted, fontFamily: ff }}>加载课表中...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* 顶部工具栏 */}
          <View style={{
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
            gap: 10, backgroundColor: colors.surface,
            borderBottomWidth: 0.5, borderBottomColor: colors.border,
          }}>
            {/* 学期选择器：仅网格模式显示（日历模式展示全部学期） */}
            {viewMode === "grid" && (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setShowSemesterPicker(v => !v)}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: colors.background, borderRadius: r,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderWidth: 0.5, borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
                      {loadingSemesters ? "加载中..." : selectedLabel}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>{showSemesterPicker ? "▲" : "▼"}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleDownload} disabled={isDownloading}
                    style={{ width: 44, height: 44, borderRadius: r, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: colors.border }}>
                    {isDownloading ? <ActivityIndicator size="small" color={colors.muted} />
                      : <IconSymbol name="square.and.arrow.down" size={18} color={colors.foreground} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleShare} disabled={isDownloading}
                    style={{ width: 44, height: 44, borderRadius: r, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: colors.border }}>
                    {isDownloading ? <ActivityIndicator size="small" color={colors.muted} />
                      : <IconSymbol name="arrowshape.turn.up.right" size={18} color={colors.foreground} />}
                  </TouchableOpacity>
                </View>

                {showSemesterPicker && (
                  <View style={{ backgroundColor: colors.background, borderRadius: r, overflow: "hidden", borderWidth: 0.5, borderColor: colors.border }}>
                    {semesters.length === 0 ? (
                      <View style={{ padding: 16, alignItems: "center" }}>
                        <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>
                          {loadingSemesters ? "正在加载学期列表..." : "暂无学期数据"}
                        </Text>
                      </View>
                    ) : semesters.map((s, i) => {
                      const key = semesterKey(s.yearValue, s.termValue);
                      const active = selectedSemester === key;
                      return (
                        <TouchableOpacity key={i} onPress={() => handleSemesterChange(s.yearValue, s.termValue)}
                          style={{
                            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                            paddingHorizontal: 14, paddingVertical: 12,
                            borderTopWidth: i ? 0.5 : 0, borderTopColor: colors.border,
                            backgroundColor: active ? `${colors.primary}15` : "transparent",
                          }}>
                          <Text style={{ fontSize: 14, fontWeight: active ? "600" : "400", color: active ? primaryColor : colors.foreground, fontFamily: ff }}>
                            {s.label}
                          </Text>
                          {active && <Text style={{ fontSize: 14, color: primaryColor, fontFamily: ff }}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flexDirection: "row", backgroundColor: colors.background, borderRadius: r, borderWidth: 0.5, borderColor: colors.border, overflow: "hidden" }}>
                {(["grid", "calendar"] as const).map(m => (
                  <TouchableOpacity key={m} onPress={() => setViewMode(m)}
                    style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: viewMode === m ? primaryColor : "transparent" }}>
                    <IconSymbol name={m === "grid" ? "square.grid.2x2" : "calendar"} size={16} color={viewMode === m ? "#fff" : colors.muted} />
                  </TouchableOpacity>
                ))}
              </View>

              {viewMode === "grid" ? (
                <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
                  {(["all", "single", "double"] as const).map(f => {
                    const label = f === "all" ? "全部" : f === "single" ? "单周" : "双周";
                    const active = filterType === f;
                    return (
                      <TouchableOpacity key={f} onPress={() => setFilterType(f)}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: r, alignItems: "center", backgroundColor: active ? primaryColor : colors.background, borderWidth: active ? 0 : 0.5, borderColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: active ? "600" : "400", color: active ? "#fff" : colors.foreground, fontFamily: ff }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: colors.muted, flex: 1, fontFamily: ff }}>左右滑换月 · 上下滑收起</Text>
              )}
            </View>
          </View>

          {/* 内容区域 */}
          {viewMode === "calendar" ? (
            <CalendarMode
              courses={allCourses}
              onCoursePress={handleCoursePress}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
              r={r}
            />
          ) : filteredCourses.length === 0 ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flex: 1, justifyContent: "center", alignItems: "center" }}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
              <Text style={{ fontSize: 14, color: colors.muted, fontFamily: ff }}>当前筛选条件下没有课程</Text>
            </ScrollView>
          ) : (
            <View ref={captureViewRef} collapsable={false} style={{ flex: 1, backgroundColor: colors.surface }}
              onLayout={e => setTableAvailableH(e.nativeEvent.layout.height)}>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
                <ScheduleTable
                  courses={filteredCourses}
                  onCoursePress={handleCoursePress}
                  onMultipleCoursesPress={handleMultiple}
                  mode="grid"
                  availableHeight={tableAvailableH}
                  radius={r}
                />
                <View style={{ paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", lineHeight: 17, fontFamily: ff }}>
                    课表调休及节假日信息仅供参考，以学校通知为准{"\n"}部分单双周课程请依据教学班通知
                  </Text>
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* 课程详情模态框 */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={() => setDetailVisible(false)}>
        <Pressable style={{ flex:1, backgroundColor:"rgba(0,0,0,0.38)", justifyContent:"center", alignItems:"center" }} onPress={() => setDetailVisible(false)}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ width:"85%", maxWidth:360, backgroundColor:colors.background, borderRadius:16, padding:20, shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:0.16, shadowRadius:20, elevation:10 }}>
            <View style={{ flexDirection:"row", justifyContent:"flex-end", marginBottom:4 }}>
              <TouchableOpacity onPress={() => setDetailVisible(false)} style={{ padding:4 }}>
                <Text style={{ fontSize:18, color:colors.muted, fontFamily: ff }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedCourse && (
              <CourseDetailContent
                courseName={selectedCourse.name}
                teacher={selectedCourse.teacher}
                classroom={selectedCourse.classroom}
                weekType={selectedCourse.isSingleWeek === "single" ? "single" : selectedCourse.isSingleWeek === "double" ? "double" : ""}
                examInfo={selectedCourse.examInfo}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* 课程冲突模态框 */}
      <Modal visible={overlapVisible} transparent animationType="fade" onRequestClose={() => setOverlapVisible(false)}>
        <Pressable style={{ flex:1, backgroundColor:"rgba(0,0,0,0.38)", justifyContent:"center", alignItems:"center" }} onPress={() => setOverlapVisible(false)}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ width:"78%", maxWidth:300, backgroundColor:colors.background, borderRadius:16, overflow:"hidden", shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:0.16, shadowRadius:20, elevation:10 }}>
            <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:18, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:colors.border }}>
              <Text style={{ fontSize:15, fontWeight:"600", color:colors.foreground, fontFamily: ff }}>该时段 {overlappingCourses.length} 门课程</Text>
              <TouchableOpacity onPress={() => setOverlapVisible(false)} style={{ padding:2 }}>
                <Text style={{ fontSize:16, color:colors.muted, fontFamily: ff }}>✕</Text>
              </TouchableOpacity>
            </View>
            {overlappingCourses.map((c, i) => (
              <TouchableOpacity key={c.id} onPress={() => openFromOverlap(c)}
                style={{ flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:18, paddingVertical:14, borderTopWidth:i?0.5:0, borderTopColor:colors.border }}
                activeOpacity={0.7}>
                <View style={{ width:4, height:38, borderRadius:2, backgroundColor:c.color }} />
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize:14, fontWeight:"500", color:colors.foreground, lineHeight:20, fontFamily: ff }} numberOfLines={2}>{c.name}</Text>
                  <Text style={{ fontSize:12, color:colors.muted, marginTop:1, fontFamily: ff }}>{c.classroom}</Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}