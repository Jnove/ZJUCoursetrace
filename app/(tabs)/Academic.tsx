import {
  ScrollView, Text, View, TouchableOpacity,
  ActivityIndicator, Animated,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSession, fetchGrade, fetchMajorGrade,fetchExams, Grade, ExamInfo } from "@/lib/zju-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Parse exam date from strings like "2025-01-10 09:00-11:00" or "2025-01-10 09:00" */
function parseExamDate(examTime: string): Date | null {
  const m = examTime.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return new Date(m[1] + "T00:00:00");
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

/** Sort exams: upcoming first (ascending), then past (most recent first) */
function sortExams(exams: ExamInfo[]): { upcoming: ExamInfo[]; past: ExamInfo[] } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const withDate = exams.map(e => ({ e, d: parseExamDate(e.examTime) }));
  const upcoming = withDate
    .filter(x => x.d && x.d >= today)
    .sort((a, b) => (a.d!.getTime() - b.d!.getTime()))
    .map(x => x.e);
  const past = withDate
    .filter(x => !x.d || x.d < today)
    .sort((a, b) => {
      const at = a.d?.getTime() ?? 0;
      const bt = b.d?.getTime() ?? 0;
      return bt - at;
    })
    .map(x => x.e);

  return { upcoming, past };
}

const GPA_MAX  = 5.0;
const EXAM_COLOR  = "#f97316";  // amber-orange, consistent across all exam cards
const PAST_COLOR  = "#9BA1A6";

// ─── Sub-components ───────────────────────────────────────────────────────────



/** The GPA hero card */
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
}) {
  const colors = useColors();
  
  const majorColor = getGpaColor(majorGpa, colors);
  const allColor = getGpaColor(allGpa, colors);

  // 动画透明度（隐藏时统一控制）
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: hidden ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hidden]);

  // 单个绩点区域的渲染函数
  const renderGpaColumn = (
    title: string,
    gpa: number,
    totalCredits: number,
    loading: boolean,
    error: string | null,
    onRetry: () => void,
    color: string,
  ) => (
    
    <View style={{ flex: 1, gap: 8 }}>
      {/* 标题行 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ fontSize: 16, fontWeight: "600", color }}>{title}</Text>
      </View>

      {/* 绩点数值或隐藏占位 */}
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
        ) : hidden ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", height: 56 }}>
            {[0, 1, 2].map(i => (
            <Text key={i} style={{
                fontSize: 36,           // 根据设计调整大小
                color: colors.primary,
                opacity: 1,
            }}>
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
              {gpa.toFixed(3)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>/5.0</Text>
          </View>
        </Animated.View>
      )}

      {/* 进度条 */}
      {!loading && !error && !hidden && (
        <View style={{ gap: 4 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: hexToRgba(color, 0.15),
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${(gpa / 5.0) * 100}%` as any,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          </View>
          <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>
            已修 {totalCredits} 学分
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: colors.background,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
        elevation: 6,
      }}
    >
      {/* 顶部双色条（可选，用两个并列渐变） */}
      <View style={{ flexDirection: "row", height: 3 }}>
        <View style={{ flex: 1, backgroundColor: majorColor }} />
        <View style={{ flex: 1, backgroundColor: allColor }} />
      </View>

      <View style={{ padding: 20, gap: 12 }}>
        {/* 头部行：标题 + 隐藏按钮 */}
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
          <TouchableOpacity
            onPress={onToggleHide}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 4, borderRadius: 6 }}
          >
            <IconSymbol
              name={hidden ? "eye.slash" : "eye"}
              size={18}
              color={colors.muted}
            />
          </TouchableOpacity>
        </View>

        {/* 左右两列 */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {/* 主修绩点 */}
          <View style={{ flex: 1, minWidth: 150 }}>
            {renderGpaColumn(
              "主修绩点",
              majorGpa,
              majorTotalCredits,
              majorLoading,
              majorError,
              onRetryMajor,
              majorColor,
            )}
          </View>

          {/* 全部绩点 */}
          {/* <View style={{ flex: 1, minWidth: 150 }}>
            {renderGpaColumn(
              "全部绩点",
              allGpa,
              allTotalCredits,
              allLoading,
              allError,
              onRetryAll,
              allColor,
            )}
          </View> */}
        </View>
            
        {/* 底部比例尺（可选，保留原进度条的参考刻度） */}
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
    </View>
  );
}

/** Countdown badge shown on exam cards */
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

/** Individual exam card */
function ExamCard({ exam, isPast = false }: { exam: ExamInfo; isPast?: boolean }) {
  const colors = useColors();
  const accentColor = isPast ? PAST_COLOR : EXAM_COLOR;
  const date  = parseExamDate(exam.examTime);
  const days  = date ? getDaysUntil(date) : -999;

  return (
    <View style={{
      borderRadius: 13,
      backgroundColor: colors.background,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isPast ? 0.04 : 0.07,
      shadowRadius: 5,
      elevation: isPast ? 1 : 2,
      opacity: isPast ? 0.72 : 1,
    }}>
      {/* Left accent bar */}
      <View style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: 4, backgroundColor: accentColor,
      }} />
      <View style={{ paddingLeft: 17, paddingRight: 14, paddingVertical: 13, gap: 7 }}>
        {/* Course name + countdown */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={{
            flex: 1, fontSize: 15, fontWeight: "500",
            color: colors.foreground, lineHeight: 20,
          }} numberOfLines={2}>
            {exam.courseName}
          </Text>
          {date && <CountdownBadge days={days} />}
        </View>

        {/* Time */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="clock.fill" size={12} color={accentColor} />
          <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
            {formatExamTimeDisplay(exam.examTime)}
          </Text>
        </View>

        {/* Location + seat */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
            <IconSymbol name="location.fill" size={12} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
              {exam.examLocation || "地点待定"}
            </Text>
          </View>
          {exam.seat && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5,
              backgroundColor: hexToRgba(accentColor, 0.1),
            }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: accentColor }}>
                座位 {exam.seat}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/** Section header with optional right-side action */
function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
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
      </View>
      {action && (
        <TouchableOpacity onPress={action.onPress}>
          <Text style={{ fontSize: 13, color: colors.primary }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Empty state placeholder */
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

/** Error card with retry */
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

const GPA_HIDDEN_KEY = "pref_gpa_hidden";

export default function AcademicScreen() {
  const { state: authState } = useAuth();
  const colors = useColors();

  const [gpa,          setGpa]          = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [grades,       setGrades]       = useState<Grade[]>([]);
  const [exams,        setExams]        = useState<ExamInfo[]>([]);

  const [gpaLoading,   setGpaLoading]   = useState(true);
  const [examLoading,  setExamLoading]  = useState(true);
  const [gpaError,     setGpaError]     = useState<string | null>(null);
  const [examError,    setExamError]    = useState<string | null>(null);

  const [gpaHidden,    setGpaHidden]    = useState(false);
  const [showPast,     setShowPast]     = useState(false);

  const [majorGpa, setMajorGpa] = useState(0);
  const [majorTotalCredits, setMajorTotalCredits] = useState(0);
  const [majorGrades, setMajorGrades] = useState<Grade[]>([]);
  const [majorLoading, setMajorLoading] = useState(true);
  const [majorError, setMajorError] = useState<string | null>(null);

  const [allGpa, setAllGpa] = useState(0);
  const [allTotalCredits, setAllTotalCredits] = useState(0);
  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);

  // 加载主修绩点
  const loadMajorGpa = useCallback(async () => {
    setMajorLoading(true);
    setMajorError(null);
    try {
      const session = await loadSession();
      if (!session) { setMajorError("请先登录"); return; }
      const result = await fetchMajorGrade(session);
      setMajorGpa(result.gpa);
      setMajorTotalCredits(result.totalCredits);
      setMajorGrades(result.grades);
    } catch (e) {
      setMajorError(e instanceof Error ? e.message : "获取主修绩点失败");
    } finally {
      setMajorLoading(false);
    }
  }, []);

  // 加载全部绩点
  const loadAllGpa = useCallback(async () => {
    setAllLoading(true);
    setAllError(null);
    try {
      const session = await loadSession();
      if (!session) { setAllError("请先登录"); return; }
      const result = await fetchGrade(session);
      setAllGpa(result.gpa);
      setAllTotalCredits(result.totalCredits);
      setAllGrades(result.grades);
      console.log(result.grades.length);
    } catch (e) {
      setAllError(e instanceof Error ? e.message : "获取全部绩点失败");
    } finally {
      setAllLoading(false);
    }
    
  }, []);



  // Restore GPA hidden preference
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

  // Load GPA
  const loadGpa = useCallback(async () => {
    setGpaLoading(true);
    setGpaError(null);
    try {
      const session = await loadSession();
      if (!session) { setGpaError("请先登录"); return; }
      const result = await fetchGrade(session);
      setGpa(result.gpa);
      setTotalCredits(result.totalCredits);
      setGrades(result.grades);
    } catch (e) {
      setGpaError(e instanceof Error ? e.message : "获取绩点失败");
    } finally {
      setGpaLoading(false);
    }
  }, []);

  // Load Exams
  const loadExams = useCallback(async () => {
    setExamLoading(true);
    setExamError(null);
    try {
      const session = await loadSession();
      if (!session) { setExamError("请先登录"); return; }
      const result = await fetchExams(session);
      setExams(result);
    } catch (e) {
      setExamError(e instanceof Error ? e.message : "获取考试信息失败");
    } finally {
      setExamLoading(false);
    }
  }, []);

    useEffect(() => {
    if (authState.userToken) {
      loadMajorGpa();
      loadAllGpa();
      loadExams();
    }
  }, [authState.userToken, loadMajorGpa, loadAllGpa, loadExams]);

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

  const { upcoming, past } = sortExams(exams);

  // Next exam for the top hint
  const nextExam   = upcoming[0];
  const nextDate   = nextExam ? parseExamDate(nextExam.examTime) : null;
  const nextDays   = nextDate ? getDaysUntil(nextDate) : null;

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1, gap: 22, padding: 24 }}>

          {/* ── Page title */}
          <View style={{ alignItems: "center", gap: 5 }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}>
              学业
            </Text>
            {nextDays !== null && !examLoading && (
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>
                {nextDays === 0
                  ? "今天有考试，加油！"
                  : nextDays === 1
                  ? "明天有考试，做好准备"
                  : `距下次考试还有 ${nextDays} 天`}
              </Text>
            )}
            {nextDays === null && !examLoading && upcoming.length === 0 && (
              <Text style={{ fontSize: 13, color: colors.muted }}>暂无考试安排</Text>
            )}
          </View>

          {/* ── GPA Card */}
          {gpaError ? (
            <ErrorCard message={gpaError} onRetry={loadGpa} />
          ) : (
            <GpaCard
            majorGpa={majorGpa}
            majorTotalCredits={majorTotalCredits}
            majorLoading={majorLoading}
            majorError={majorError}
            onRetryMajor={loadMajorGpa}
            allGpa={allGpa}
            allTotalCredits={allTotalCredits}
            allLoading={allLoading}
            allError={allError}
            onRetryAll={loadAllGpa}
            hidden={gpaHidden}
            onToggleHide={toggleGpaHidden}
            />
          )}

          {/* ── Upcoming exams */}
          <View style={{ gap: 10 }}>
            <SectionHeader
              title="即将考试"
              count={upcoming.length}
            />

            {examLoading ? (
              <View style={{
                backgroundColor: colors.background, borderRadius: 12,
                padding: 20, alignItems: "center",
              }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : examError ? (
              <ErrorCard message={examError} onRetry={loadExams} />
            ) : upcoming.length === 0 ? (
              <EmptyCard message="暂无即将到来的考试" />
            ) : (
              upcoming.map((exam, i) => (
                <ExamCard key={`up-${i}`} exam={exam} isPast={false} />
              ))
            )}
          </View>

          {/* ── Past exams (collapsible) */}
          {!examLoading && !examError && past.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader
                title="已结束考试"
                count={past.length}
                action={{
                  label: showPast ? "收起" : "展开",
                  onPress: () => setShowPast(v => !v),
                }}
              />

              {showPast && past.map((exam, i) => (
                <ExamCard key={`past-${i}`} exam={exam} isPast />
              ))}
            </View>
          )}

          {/* ── Grade summary (lightweight, no full list) */}
          {/* {!allLoading && !allError && allGrades.length > 0 && !gpaHidden&& (
            <View style={{ gap: 10 }}>
              <SectionHeader title="成绩概览" />

              {/* Score distribution chips *
              <View style={{
                backgroundColor: colors.background, borderRadius: 14,
                padding: 16, gap: 14,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
              }}>
                {/* Distribution buckets *
                {(() => {
                  const buckets = [
                    { label: "90分以上", min: 90, max: 101, color: colors.success },
                    { label: "80–89分", min: 80, max: 90,  color: colors.primary },
                    { label: "70–79分", min: 70, max: 80,  color: colors.warning },
                    { label: "60–69分", min: 60, max: 70,  color: "#f97316" },
                    { label: "60分以下", min: 0,  max: 60,  color: colors.error },
                  ];
                  const total = allGrades.filter(g => g.score !== null).length;
                  return buckets.map(b => {
                    const count = allGrades.filter(g => {
                        if (g.score == null) return false;

                        let scoreNum: number;
                        if (typeof g.score === 'number') {
                            scoreNum = g.score;
                        } else {
                            // 字符串：必须为纯数字格式（允许整数或小数，不含字母等）
                            const trimmed = g.score.trim();
                            if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return false;
                            scoreNum = parseFloat(trimmed);
                        }

                        return scoreNum >= b.min && scoreNum < b.max;
                        }).length;
                    if (count === 0 && b.min < 60) return null;
                    const pct   = total > 0 ? count / total : 0;
                    return (
                      <View key={b.label} style={{ gap: 5 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 12, color: colors.muted }}>{b.label}</Text>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: b.color }}>
                            {count} 门
                          </Text>
                        </View>
                        <View style={{
                          height: 5, borderRadius: 2.5,
                          backgroundColor: hexToRgba(b.color, 0.15),
                          overflow: "hidden",
                        }}>
                          <View style={{
                            height: "100%",
                            width: `${pct * 100}%` as any,
                            borderRadius: 2.5,
                            backgroundColor: b.color,
                          }} />
                        </View>
                      </View>
                    );
                  });
                })()}

                <View style={{
                  flexDirection: "row", justifyContent: "flex-end",
                  borderTopWidth: 0.5, borderTopColor: colors.border,
                  paddingTop: 10,
                }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    共 {grades.filter(g => g.score !== null).length} 门已出分
                  </Text>
                </View>
              </View>
            </View>
          )} */}

          <View style={{ height: 8 }} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}