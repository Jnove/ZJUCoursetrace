import {
  ScrollView, Text, View, TouchableOpacity,
  ActivityIndicator, Animated,RefreshControl,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSession, fetchGrade, fetchMajorGrade, fetchExams, Grade, ExamInfo } from "@/lib/zju-client";
import { useRouter } from 'expo-router';
import { writeLog } from "@/lib/diagnostic-log";
import { Background } from "@react-navigation/elements";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";
import { rmSync } from "fs";


// Cache helpers
function academicCacheKey(type: "major_grade" | "all_grade" | "exams", username: string) {
  return `academic_${type}_${username}`;
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

// Helpers

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseExamDate(examTime: string): Date | null {
  let match = examTime.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }
  match = examTime.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }
  return null;
}

function getDaysUntil(date: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatExamTimeDisplay(examTime: string): string {
  // "2025-01-10 09:00-11:00" → "1月10日  09:00—11:00"
  const m = examTime.match(/(\d{4})-(\d{2})-(\d{2})\s*([\d:]+)?(?:[—\-]([\d:]+))?/);
  if (!m) return examTime;
  const month = parseInt(m[2]);
  const day   = parseInt(m[3]);
  const time  = m[4] ? (m[5] ? `${m[4]}—${m[5]}` : m[4]) : "";
  return `${month}月${day}日${time ? "  " + time : ""}`;
}

// 学期类型解析
function getSemesterType(semester?: string): "春夏" | "秋冬" | "未知" {
  if (!semester) return "未知";
  const lower = semester.toLowerCase();
  if (lower.includes("春") || lower.includes("夏")) return "春夏";
  if (lower.includes("秋") || lower.includes("冬")) return "秋冬";
  // 处理数字编码：1->秋冬, 2->春夏
  if (semester.includes("1") && !semester.includes("2")) return "秋冬";
  if (semester.includes("2") || semester.includes("3")) return "春夏";
  return "未知";
}

// 根据学年字符串和学期类型计算学期结束日期（用于判断是否已结束）
function getSemesterEndDate(yearStr: string, semesterType: string): Date {
  // yearStr 格式如 "2025-2026"
  const startYear = parseInt(yearStr.slice(0, 4));
  const endYear = parseInt(yearStr.slice(5, 9));
  let endDate: Date;
  if (semesterType === "秋冬") {
    // 秋冬学期通常 1 月中下旬结束，取 1 月 20 日
    endDate = new Date(endYear, 0, 20);
  } else {
    // 春夏学期通常 6 月底结束
    endDate = new Date(endYear, 5, 30);
  }
  return endDate;
}

// 提取学年和学期类型，返回用于分组的 key 和显示名称
function extractSemesterInfo(exam: ExamInfo): { year: string; semesterType: string; displayName: string; endDate: Date } {
  // 优先使用已有的 year 字段，否则从 semester 解析
  let year = exam.year;
  let semester = exam.semester;
  if (!year && semester) {
    const match = semester.match(/(\d{4}-\d{4})/);
    if (match) year = match[1];
  }
  // 如果依然没有，尝试从 examTime 的年份推断（后备）
  if (!year) {
    const date = parseExamDate(exam.examTime);
    if (date) {
      const y = date.getFullYear();
      year = `${y}-${y+1}`;
    } else {
      year = "未知学年";
    }
  }
  const semesterType = getSemesterType(semester);
  const displayName = `${year} ${semesterType}`;
  const endDate = getSemesterEndDate(year, semesterType);
  return { year, semesterType, displayName, endDate };
}

// 新增的辅助函数和子组件，放在 AcademicScreen 组件定义之前
function getNearestFutureDate(exams: ExamInfo[]): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let nearest: Date | null = null;
  for (const exam of exams) {
    const date = parseExamDate(exam.examTime);
    if (!date) continue;
    if (date >= today) {
      if (!nearest || date < nearest) {
        nearest = date;
      }
    }
  }
  return nearest;
}

function SemesterExamGroup({
  group,
  isPast = false,
  radius = 12,
}: {
  group: { key: string; displayName: string; endDate: Date; exams: ExamInfo[] };
  isPast?: boolean;
  radius?: number;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  
  // 对于非 past 的组，才需要折叠逻辑
  const nearestDate = !isPast ? getNearestFutureDate(group.exams) : null;
  const hasFutureExams = nearestDate !== null;

  let recentExams: ExamInfo[] = [];
  let otherExams: ExamInfo[] = [];
  if (!isPast && hasFutureExams) {
    recentExams = group.exams.filter((exam) => {
      const d = parseExamDate(exam.examTime);
      return d && d.toDateString() === nearestDate!.toDateString();
    });
    otherExams = group.exams.filter((exam) => {
      const d = parseExamDate(exam.examTime);
      return !d || d.toDateString() !== nearestDate!.toDateString();
    });
  } else {
    // 已结束学期，或没有未来考试，直接显示所有
    recentExams = group.exams;
    otherExams = [];
  }

  const showExpandButton = !isPast && hasFutureExams && otherExams.length > 0;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <SectionHeader title={group.displayName} count={group.exams.length} />
      {showExpandButton && !expanded && (
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius:radius,
            backgroundColor: hexToRgba(colors.primary, 0.1),
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '500' }}>
            展开剩余 {otherExams.length} 场考试
          </Text>
        </TouchableOpacity>
      )}
      {expanded && (
        <TouchableOpacity
          onPress={() => setExpanded(false)}
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius,
            backgroundColor: hexToRgba(colors.muted, 0.1),
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '500' }}>收起</Text>
        </TouchableOpacity>
      )}
      </View>

      {recentExams.map((exam, idx) => (
        <ExamCard key={`recent-${group.key}-${idx}`} exam={exam} isPast={isPast} compact={false} radius={radius}/>
      ))}
      {expanded && otherExams.map((exam, idx) => (
        <ExamCard key={`other-${group.key}-${idx}`} exam={exam} isPast={isPast} compact radius={radius}/>
      ))}
    </View>
  );
}

// 按学期分组考试
function groupExamsBySemester(exams: ExamInfo[]): Map<string, { key: string; displayName: string; endDate: Date; exams: ExamInfo[] }> {
  const groups = new Map<string, { key: string; displayName: string; endDate: Date; exams: ExamInfo[] }>();
  for (const exam of exams) {
    const { year, semesterType, displayName, endDate } = extractSemesterInfo(exam);
    const key = `${year}-${semesterType}`;
    if (!groups.has(key)) {
      groups.set(key, { key, displayName, endDate, exams: [] });
    }
    groups.get(key)!.exams.push(exam);
  }
  // 对每个组内的考试按考试时间排序
  for (const group of groups.values()) {
    group.exams.sort((a, b) => {
      const da = parseExamDate(a.examTime)?.getTime() ?? 0;
      const db = parseExamDate(b.examTime)?.getTime() ?? 0;
      return da - db;
    });
  }
  return groups;
}

// 判断学期是否已结束（基于结束日期 < 今天）
function isSemesterPast(endDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today;
}

const GPA_MAX  = 5.0;
const EXAM_COLOR  = "#f97316";
const PAST_COLOR  = "#9BA1A6";

// Sub-components

function getGpaColor(gpa: number, colors: any) {
  if (gpa >= 3.7) return colors.success;
  if (gpa >= 3.0) return colors.primary;
  if (gpa >= 2.0) return colors.warning;
  return colors.error;
}

function GpaCard({
  majorGpa,
  majorTotalCredits,
  majorLoading,
  majorError,
  onRetryMajor,
  allGpa,
  allTotalCredits,
  allLoading,
  allError,
  onRetryAll,
  hidden,
  onToggleHide,
  onPress,
  stale = false,
  radius = 12,
}: {
  majorGpa: number;
  majorTotalCredits: number;
  majorLoading: boolean;
  majorError: string | null;
  onRetryMajor: () => void;
  allGpa: number;
  allTotalCredits: number;
  allLoading: boolean;
  allError: string | null;
  onRetryAll: () => void;
  hidden: boolean;
  onToggleHide: () => void;
  onPress: () => void;
  stale?: boolean;
  radius?: number;
}) {
  const colors = useColors();
  
  const majorColor = getGpaColor(majorGpa, colors);
  const allColor = getGpaColor(allGpa, colors);
  const majorBg = hexToRgba("#1adfd2ec", 0.2);
  const allBg = hexToRgba("#70d809", 0.1);
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: hidden ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hidden]);

  const renderGpaColumn = (
    title: string,
    gpa: number,
    totalCredits: number,
    loading: boolean,
    error: string | null,
    onRetry: () => void,
    color: string,
    backgroundColor?: string,
  ) => (
    
    <View style={{ 
      flex: 1, 
      gap: 0,
      borderWidth: 0,
      borderColor: colors.border,
      backgroundColor: backgroundColor ,
      borderRadius: 12,
      padding: 12,  
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: radius, backgroundColor: color }} />
        <Text style={{ fontSize: 12, fontWeight: "600", color }}>{title}</Text>
        <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>
            已修 {totalCredits} 学分
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : hidden ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", height: 56 }}>
          {[0, 1, 2].map(i => (
            <Text key={i} style={{ fontSize: 36, color: colors.primary, opacity: 1 }}>
              *
            </Text>
          ))}
        </View>
      ) : (
        <Animated.View style={{ opacity, alignItems: "center", gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
            <Text
              style={{
                fontSize: 36,
                fontWeight: "500",
                color,
                fontVariant: ["tabular-nums"],
                lineHeight: 42,
              }}
            >
              {gpa.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>/5.0</Text>
          </View>
        </Animated.View>
      )}

      {!loading && !error && !hidden && (
        <View style={{ gap: 4 }}>
          <View
            style={{
              height: 4,
              borderRadius: radius,
              backgroundColor: hexToRgba(color, 0.15),
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${(gpa / 5.0) * 100}%` as any,
                borderRadius: radius,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      )}
      {!hidden && !majorLoading && !allLoading && !majorError && !allError && (
        <View style={{ marginTop: 8 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingHorizontal: 8,
            }}
          >
            {["0", "1", "2", "3", "4", "5"].map(label => (
              <Text key={label} style={{ fontSize: 9, color: colors.muted }}>
                {label}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        borderRadius: radius,
        backgroundColor: colors.background,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: "row", height: 3 }}>
        <View style={{ flex: 1, backgroundColor: majorColor }} />
        <View style={{ flex: 1, backgroundColor: allColor }} />
      </View>

      <View style={{ padding: 20, gap: 2 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.muted }}>
            绩点概览
          </Text>
          {stale && (
            <ActivityIndicator size="small" color={colors.muted} style={{ opacity: 0.5 }} />
          )}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onToggleHide();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 4, borderRadius: radius }}
          >
            <IconSymbol
              name={hidden ? "eye.slash" : "eye"}
              size={18}
              color={colors.muted}
            />
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <View style={{ flex: 1, minWidth: 100 }}>
            {renderGpaColumn(
              "主修绩点",
              majorGpa,
              majorTotalCredits,
              majorLoading,
              majorError,
              onRetryMajor,
              majorColor,
              majorBg,
            )}
          </View>

          <View style={{ flex: 1, minWidth: 100 }}>
            {renderGpaColumn(
              "全部绩点",
              allGpa,
              allTotalCredits,
              allLoading,
              allError,
              onRetryAll,
              allColor,
              allBg,
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CountdownBadge({ days }: { days: number }) {
  const colors = useColors();

  if (days < 0) {
    return (
      <View style={{
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: hexToRgba(PAST_COLOR, 0.12),
      }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: PAST_COLOR }}>已结束</Text>
      </View>
    );
  }
  if (days === 0) {
    return (
      <View style={{
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: hexToRgba(colors.error, 0.13),
      }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>今天</Text>
      </View>
    );
  }
  if (days === 1) {
    return (
      <View style={{
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: hexToRgba(colors.warning, 0.14),
      }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.warning }}>明天</Text>
      </View>
    );
  }
  const color = days <= 7 ? colors.warning : EXAM_COLOR;
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: hexToRgba(color, 0.12),
    }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color }}>还有 {days} 天</Text>
    </View>
  );
}

/** 考试卡片，支持灰色调小模式 */
function ExamCard({ exam, isPast = false, compact = false, radius = 13 }: { exam: ExamInfo; isPast?: boolean; compact?: boolean; radius?: number }) {
  const colors = useColors();
  const accentColor = isPast ? PAST_COLOR : EXAM_COLOR;
  const date  = parseExamDate(exam.examTime);
  const days  = date ? getDaysUntil(date) : -999;

  const cardStyle = {
    borderRadius: radius,
    backgroundColor: colors.background,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isPast ? 0.04 : 0.07,
    shadowRadius: 5,
    elevation: isPast ? 1 : 2,
    opacity: isPast ? 0.72 : 1,
    // 紧凑模式缩小内边距
    paddingLeft: compact ? 12 : 17,
    paddingRight: compact ? 12 : 14,
    paddingVertical: compact ? 10 : 13,
  } as const;

  const textStyle = compact ? {
    fontSize: 13,
    lineHeight: 15,
  } : {
    fontSize: 15,
    lineHeight: 17,
  };

  return (
    <View style={cardStyle}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accentColor }} />
      <View style={{ gap: compact ? 4 : 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={[textStyle, { flex: 1, fontWeight: "500", color: colors.foreground }]} numberOfLines={2}>
            {exam.courseName}
          </Text>
          {date && <CountdownBadge days={days} />}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="clock.fill" size={compact ? 8 : 10} color={accentColor} />
          <Text style={[textStyle, { fontWeight: "500", color: colors.foreground }]}>
            {formatExamTimeDisplay(exam.examTime)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
            <IconSymbol name="location.fill" size={compact ? 7 : 9} color={colors.muted} />
            <Text style={[textStyle, { color: colors.muted }]} numberOfLines={1}>
              {exam.examLocation || "地点待定"}
            </Text>
          </View>
          {exam.seat && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              paddingHorizontal: compact ? 6 : 8, paddingVertical: compact ? 2 : 2,
              borderRadius: 5,
              backgroundColor: hexToRgba(accentColor, 0.1),
            }}>
              <Text style={{ fontSize: compact ? 10 : 11, fontWeight: "600", color: accentColor }}>
                座位 {exam.seat}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  count,
  action,
  stale,
}: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
  stale?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
          {title}
        </Text>
        {count !== undefined && (
          <View style={{
            paddingHorizontal: 7, paddingVertical: 1,
            borderRadius: 8, backgroundColor: colors.surface,
            borderWidth: 0.5, borderColor: colors.border,
          }}>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>{count}</Text>
          </View>
        )}
        {stale && (
          <ActivityIndicator size="small" color={colors.muted} style={{ opacity: 0.5 }} />
        )}
      </View>
      {action && (
        <TouchableOpacity onPress={action.onPress}>
          <Text style={{ fontSize: 13, color: colors.primary }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View style={{
      backgroundColor: colors.background, borderRadius: 12,
      borderWidth: 0.5, borderColor: colors.border,
      paddingHorizontal: 16, paddingVertical: 18, alignItems: "center",
    }}>
      <Text style={{ fontSize: 13, color: colors.muted }}>{message}</Text>
    </View>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={{
      borderRadius: 12, backgroundColor: hexToRgba(colors.error, 0.08),
      borderWidth: 0.5, borderColor: hexToRgba(colors.error, 0.3),
      padding: 16, gap: 10,
    }}>
      <Text style={{ fontSize: 13, color: colors.error }}>{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 14, paddingVertical: 7,
          borderRadius: 8, backgroundColor: hexToRgba(colors.error, 0.1),
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.error }}>重试</Text>
      </TouchableOpacity>
    </View>
  );
}

// Main Screen

const GPA_HIDDEN_KEY = "pref_gpa_hidden";

export default function AcademicScreen() {
  const { state: authState } = useAuth();
  const colors = useColors();

  const [majorGpa, setMajorGpa] = useState(0);
  const [majorTotalCredits, setMajorTotalCredits] = useState(0);
  const [majorGrades, setMajorGrades] = useState<Grade[]>([]);
  const [majorLoading, setMajorLoading] = useState(true);
  const [majorError, setMajorError] = useState<string | null>(null);
  const [majorStale, setMajorStale] = useState(false);

  const [allGpa, setAllGpa] = useState(0);
  const [allTotalCredits, setAllTotalCredits] = useState(0);
  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);
  const [allStale, setAllStale] = useState(false);

  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [examLoading, setExamLoading] = useState(true);
  const [examError, setExamError] = useState<string | null>(null);
  const [examStale, setExamStale] = useState(false);

  const [gpaHidden, setGpaHidden] = useState(false);
  const [showPastSemesters, setShowPastSemesters] = useState(false); // 控制是否显示已结束学期的分组
  const [academicRefreshing, setAcademicRefreshing] = useState(false);
  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  const router = useRouter();

  
  // 加载主修绩点（缓存优先）
  const loadMajorGpa = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) { setMajorError("请先登录"); setMajorLoading(false); return; }
    const key = academicCacheKey("major_grade", username);

    if (!forceRefresh) {
      const cached = await readCache<{ gpa: number; totalCredits: number; grades: Grade[] }>(key);
      if (cached) {
        setMajorGpa(cached.gpa);
        setMajorTotalCredits(cached.totalCredits);
        setMajorGrades(cached.grades);
        setMajorLoading(false);
        setMajorError(null);
        setMajorStale(true);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchMajorGrade(session);
            setMajorGpa(result.gpa);
            setMajorTotalCredits(result.totalCredits);
            setMajorGrades(result.grades);
            await writeCache(key, result);
          }
        } catch { /* 静默失败 */ } finally {
          setMajorStale(false);
        }
        return;
      }
    }

    setMajorLoading(true);
    setMajorError(null);
    try {
      const session = await loadSession();
      if (!session) { setMajorError("请先登录"); return; }
      const result = await fetchMajorGrade(session);
      setMajorGpa(result.gpa);
      setMajorTotalCredits(result.totalCredits);
      setMajorGrades(result.grades);
      if (result.grades.length === 0) {
        writeLog("ACADEMIC", "主修成绩列表为空（网络返回）", "warn",
          { gpa: result.gpa, credits: result.totalCredits });
      } else {
        writeLog("ACADEMIC",
          `主修成绩加载成功: ${result.grades.length} 门, GPA=${result.gpa}`, "info");
      }
      await writeCache(key, result);
    } catch (e) {
      writeLog("ACADEMIC", `主修成绩加载失败: ${e instanceof Error ? e.message : String(e)}`, "error");
      setMajorError(e instanceof Error ? e.message : "获取主修绩点失败");
    } finally {
      setMajorLoading(false);
    }
  }, []);

  // 加载全部绩点（缓存优先）
  const loadAllGpa = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) { setAllError("请先登录"); setAllLoading(false); return; }
    const key = academicCacheKey("all_grade", username);

    if (!forceRefresh) {
      const cached = await readCache<{ gpa: number; totalCredits: number; grades: Grade[] }>(key);
      if (cached) {
        setAllGpa(cached.gpa);
        setAllTotalCredits(cached.totalCredits);
        setAllGrades(cached.grades);
        setAllLoading(false);
        setAllError(null);
        setAllStale(true);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchGrade(session);
            setAllGpa(result.gpa);
            setAllTotalCredits(result.totalCredits);
            setAllGrades(result.grades);
            await writeCache(key, result);
          }
        } catch { /* 静默失败 */ } finally {
          setAllStale(false);
        }
        return;
      }
    }

    setAllLoading(true);
    setAllError(null);
    try {
      const session = await loadSession();
      if (!session) { setAllError("请先登录"); return; }
      const result = await fetchGrade(session);
      setAllGpa(result.gpa);
      setAllTotalCredits(result.totalCredits);
      setAllGrades(result.grades);
      if (result.grades.length === 0) {
        writeLog("ACADEMIC", "全部成绩列表为空（网络返回）", "warn",
          { gpa: result.gpa, credits: result.totalCredits });
      } else {
        writeLog("ACADEMIC",
          `全部成绩加载成功: ${result.grades.length} 门, GPA=${result.gpa}`, "info");
      }
      await writeCache(key, result);
    } catch (e) {
      writeLog("ACADEMIC", `全部成绩加载失败: ${e instanceof Error ? e.message : String(e)}`, "error");
      setAllError(e instanceof Error ? e.message : "获取全部绩点失败");
    } finally {
      setAllLoading(false);
    }
  }, []);

  // 加载考试（缓存优先）
  const loadExams = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) { setExamError("请先登录"); setExamLoading(false); return; }
    const key = academicCacheKey("exams", username);

    if (!forceRefresh) {
      const cached = await readCache<ExamInfo[]>(key);
      if (cached) {
        setExams(cached);
        setExamLoading(false);
        setExamError(null);
        setExamStale(true);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchExams(session);
            setExams(result);
            //console.log('[DEBUG] fetchExams result length:', result.length);
      //console.log('[DEBUG] first exam:', result[0]);
            await writeCache(key, result);
          }
        } catch { /* 静默失败 */ } finally {
          setExamStale(false);
        }
        return;
      }
    }
    
    
    setExamLoading(true);
    setExamError(null);
    try {
      const session = await loadSession();
      if (!session) { setExamError("请先登录"); return; }
      const result = await fetchExams(session);
      writeLog("ACADEMIC",
        `考试列表加载完成: ${result.length} 场`,
        result.length === 0 ? "warn" : "info",
        result.length === 0 ? { note: "可能正常（无考试安排）" } : undefined,
      );
      setExams(result);
      //console.log('[DEBUG] fetchExams result length:', result.length);
      //console.log('[DEBUG] first exam:', result[0]);
      await writeCache(key, result);
    } catch (e) {
      writeLog("ACADEMIC", `考试列表加载失败: ${e instanceof Error ? e.message : String(e)}`, "error");
      setExamError(e instanceof Error ? e.message : "获取考试信息失败");
    } finally {
      setExamLoading(false);
    }
  }, []);
  const handleAcademicRefresh = useCallback(async () => {
    setAcademicRefreshing(true);
    try {
      await Promise.all([
        loadMajorGpa(true),
        loadAllGpa(true),
        loadExams(true),
      ]);
    } finally {
      setAcademicRefreshing(false);
    }
  }, [loadMajorGpa, loadAllGpa, loadExams]);

  useEffect(() => {
    if (authState.userToken) {
      loadMajorGpa();
      loadAllGpa();
      loadExams();
    }
  }, [authState.userToken, loadMajorGpa, loadAllGpa, loadExams]);

  useEffect(() => {
    AsyncStorage.getItem(GPA_HIDDEN_KEY)
      .then(v => { if (v === "1") setGpaHidden(true); })
      .catch(() => {});
  }, []);

  const toggleGpaHidden = useCallback(async () => {
    const next = !gpaHidden;
    setGpaHidden(next);
    await AsyncStorage.setItem(GPA_HIDDEN_KEY, next ? "1" : "0").catch(() => {});
  }, [gpaHidden]);

  const handleCardPress = () => {
    router.push('/grade-detail');
  };

  if (!authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-background">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 }}>
          <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center" }}>
            请先在首页登录浙大统一身份认证
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // 分组考试
  const examGroups = groupExamsBySemester(exams);
  const currentGroups: { key: string; displayName: string; endDate: Date; exams: ExamInfo[] }[] = [];
  const pastGroups: { key: string; displayName: string; endDate: Date; exams: ExamInfo[] }[] = [];

  for (const group of examGroups.values()) {
    if (isSemesterPast(group.endDate)) {
      pastGroups.push(group);
    } else {
      currentGroups.push(group);
    }
  }

  // 按学年倒序排序（最新的在前）
  currentGroups.sort((a, b) => b.displayName.localeCompare(a.displayName));
  pastGroups.sort((a, b) => b.displayName.localeCompare(a.displayName));

  const currentTotalExams = currentGroups.reduce((acc, g) => acc + g.exams.length, 0);
  const pastTotalExams = pastGroups.reduce((acc, g) => acc + g.exams.length, 0);

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
        <RefreshControl
          refreshing={academicRefreshing}
          onRefresh={handleAcademicRefresh}
          tintColor={colors.primary}
        />
  }
      >
        <View style={{ flex: 1, gap: 22, padding: 24 }}>
          {/* 页面标题 */}
          <View style={{ alignItems: "center", gap: 5 }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}>
              学业
            </Text>
            {currentTotalExams > 0 && (
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>
                共 {currentTotalExams} 场考试
              </Text>
            )}
          </View>

          {/* 绩点卡片 */}
          <GpaCard
            majorGpa={majorGpa}
            majorTotalCredits={majorTotalCredits}
            majorLoading={majorLoading}
            majorError={majorError}
            onRetryMajor={() => loadMajorGpa(true)}
            allGpa={allGpa}
            allTotalCredits={allTotalCredits}
            allLoading={allLoading}
            allError={allError}
            onRetryAll={() => loadAllGpa(true)}
            hidden={gpaHidden}
            onToggleHide={toggleGpaHidden}
            onPress={handleCardPress}
            stale={majorStale || allStale}
            radius={r}
          />

          {/* 考试区域 - 按学期分组 */}
          {examLoading ? (
            <View style={{ backgroundColor: colors.background, borderRadius: r, padding: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : examError ? (
            <ErrorCard message={examError} onRetry={() => loadExams(true)} />
          ) : exams.length === 0 ? (
            <EmptyCard message="暂无考试安排" />
          ) : (
            <>
              {/* 当前学期考试 */}
              {currentGroups.length > 0 && (
                <View style={{ gap: 20 }}>
                  {currentGroups.map(group => (
                    <SemesterExamGroup key={group.key} group={group} isPast={false} radius={r} />
                  ))}
                </View>
              )}

              {/* 已结束学期考试（可折叠） */}
              {pastGroups.length > 0 && (
                <View style={{ gap: 10 }}>
                  <SectionHeader
                    title="已结束学期"
                    count={pastTotalExams}
                    action={{
                      label: showPastSemesters ? "收起" : "展开",
                      onPress: () => setShowPastSemesters(v => !v),
                    }}
                  />
                  {showPastSemesters && (
                    <View style={{ gap: 16 }}>
                      {pastGroups.map(group => (
                        <View key={group.key} style={{ gap: 10, opacity: 0.75 }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: PAST_COLOR }}>
                            {group.displayName}
                          </Text>
                          {group.exams.map((exam, idx) => (
                            <ExamCard key={`past-${group.key}-${idx}`} exam={exam} isPast compact />
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          <View style={{ height: 8 }} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}