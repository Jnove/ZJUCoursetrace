import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context";
import {
  loadSession,
  fetchGrade,
  fetchMajorGrade,
  Grade,
} from "@/lib/zju-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, CARD_RADIUS_VALUES, DEFAULT_PRIMARY, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";
import { CommonNavBar } from "@/components/common/nav-bar";
import { ErrorCard } from "@/components/common/error-card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingView } from "@/components/common/loading-view";

// 辅助函数
function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getGpaColor(gpa: number, colors: any) {
  if (gpa >= 3.7) return colors.success;
  if (gpa >= 3.0) return colors.primary;
  if (gpa >= 2.0) return colors.warning;
  return colors.error;
}

function formatGpa(gpa: number | null): string {
  if (gpa === null || gpa === undefined) return "—";
  return gpa.toFixed(2);
}

function formatCredit(credit: number | string | null): string {
  if (credit === null || credit === undefined) return "—";
  if (typeof credit === "number") return credit.toFixed(1);
  return credit;
}

// 下划线风格 Tab 切换器（与作业页一致）
function GradeTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: "major" | "all";
  onTabChange: (tab: "major" | "all") => void;
}) {
  const colors = useColors();
  const { primaryColor } = useTheme();
  const tabs = [
    { key: "major", label: "主修课程" },
    { key: "all", label: "全部课程" },
  ] as const;
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.background,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: "center",
              borderBottomWidth: 2,
              borderBottomColor: isActive ? primaryColor : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: ff,
                fontWeight: isActive ? "600" : "400",
                color: isActive ? primaryColor : colors.muted,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 绩点概览卡片
function CompactGpaCard({
  gpa,
  totalCredits,
  loading,
  error,
  onRetry,
  radius = 16,
}: {
  gpa: number;
  totalCredits: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  radius?: number;
}) {
  const colors = useColors();
  const gpaColor = getGpaColor(gpa, colors);
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  if (loading) {
    return (
      <View
        style={{
          borderRadius: radius,
          backgroundColor: colors.background,
          padding: 20,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={{
          borderRadius: radius,
          backgroundColor: colors.background,
          padding: 16,
        }}
      >
        <ErrorCard message={error} onRetry={onRetry} />
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: radius,
        backgroundColor: colors.background,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 0.5,
        borderColor: colors.border,
      }}
    >
      <View style={{ padding: 18, gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "500", fontFamily: ff }}>
            平均绩点
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
            <Text
              style={{
                fontSize: 32,
                fontFamily: ff,
                fontWeight: "700",
                color: gpaColor,
                fontVariant: ["tabular-nums"],
              }}
            >
              {gpa.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>/5.0</Text>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: hexToRgba(gpaColor, 0.15),
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${(gpa / 5.0) * 100}%` as any,
                borderRadius: 3,
                backgroundColor: gpaColor,
              }}
            />
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", fontFamily: ff }}>
            已修 {totalCredits} 学分
          </Text>
        </View>
      </View>
    </View>
  );
}

// 分数分布卡片
function ScoreDistributionCard({ grades, radius }: { grades: Grade[]; radius?: number }) {
  const colors = useColors();
  const validGrades = grades.filter((g) => {
    if (g.score === null || g.score === undefined) return false;
    if (typeof g.score === "number") return true;
    const trimmed = g.score.trim();
    return /^-?\d+(\.\d+)?$/.test(trimmed);
  });
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  const total = validGrades.length;
  if (total === 0) {
    return (
      <View
        style={{
          backgroundColor: colors.background,
          borderRadius: radius,
          padding: 16,
          borderWidth: 0.5,
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", fontFamily: ff }}>
          暂无分数数据
        </Text>
      </View>
    );
  }

  const buckets = [
    { label: "90分以上", min: 90, max: 101, color: colors.success },
    { label: "80–89分", min: 80, max: 90, color: colors.primary },
    { label: "70–79分", min: 70, max: 80, color: colors.warning },
    { label: "60–69分", min: 60, max: 70, color: "#f97316" },
    { label: "60分以下", min: 0, max: 60, color: colors.error },
  ];

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderRadius: radius,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 1,
        borderWidth: 0.5,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12, fontFamily: ff }}>
        分数分布
      </Text>
      <View style={{ gap: 12 }}>
        {buckets.map((bucket) => {
          const count = validGrades.filter((g) => {
            let scoreNum: number;
            if (typeof g.score === "number") {
              scoreNum = g.score;
            } else {
              const trimmed = g.score!.trim();
              if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return false;
              scoreNum = parseFloat(trimmed);
            }
            return scoreNum >= bucket.min && scoreNum < bucket.max;
          }).length;

          if (count === 0 && bucket.min < 60) return null;

          const pct = total > 0 ? count / total : 0;
          return (
            <View key={bucket.label} style={{ gap: 4 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
                  {bucket.label}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: bucket.color, fontFamily: ff }}>
                  {count} 门
                </Text>
              </View>
              <View
                style={{
                  height: 6,
                  borderRadius: radius,
                  backgroundColor: hexToRgba(bucket.color, 0.15),
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${pct * 100}%` as any,
                    borderRadius: radius,
                    backgroundColor: bucket.color,
                  }}
                />
              </View>
            </View>
          );
        })}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            paddingTop: 10,
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>
            共 {total} 门已出分
          </Text>
        </View>
      </View>
    </View>
  );
}

// 课程条目
function GradeItem({ grade, radius }: { grade: Grade; radius?: number }) {
  const colors = useColors();

  let gpaColor = colors.muted;
  if (grade.gpaPoints !== null && grade.gpaPoints !== undefined) {
    gpaColor = getGpaColor(grade.gpaPoints, colors);
  }

  const gpaDisplay =
    grade.gpaPoints !== null && grade.gpaPoints !== undefined
      ? grade.gpaPoints.toFixed(2)
      : "暂无绩点";

  const creditDisplay = formatCredit(grade.credit ?? null);
  const showProgressBar =
    grade.gpaPoints !== null && grade.gpaPoints !== undefined && grade.gpaPoints >= 0;
  const progressPercent = showProgressBar ? (grade.gpaPoints! / 5.0) * 100 : 0;

  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderRadius: radius,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
        borderWidth: 0.5,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexShrink: 1,
            gap: 4,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "500",
              fontFamily: ff,
              color: colors.foreground,
              lineHeight: 22,
              flexShrink: 1,
            }}
            numberOfLines={2}
          >
            {grade.courseName}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }}>
            / {creditDisplay}学分
          </Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: "600", color: gpaColor, fontFamily: ff }}>
          {grade.score} / {gpaDisplay}
        </Text>
      </View>

      {showProgressBar && (
        <View style={{ marginTop: 12 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: hexToRgba(gpaColor, 0.2),
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.min(progressPercent, 100)}%` as any,
                borderRadius: 2,
                backgroundColor: gpaColor,
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export default function GradeDetailScreen() {
  const router = useRouter();
  const { cardRadius } = useTheme();
  const { state: authState } = useAuth();
  const colors = useColors();
  const r = CARD_RADIUS_VALUES[cardRadius];

  const [activeTab, setActiveTab] = useState<"major" | "all">("major");

  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [allGpa, setAllGpa] = useState(0);
  const [allTotalCredits, setAllTotalCredits] = useState(0);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);

  const [majorGrades, setMajorGrades] = useState<Grade[]>([]);
  const [majorGpa, setMajorGpa] = useState(0);
  const [majorTotalCredits, setMajorTotalCredits] = useState(0);
  const [majorLoading, setMajorLoading] = useState(true);
  const [majorError, setMajorError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  function academicCacheKey(type: "major_grade" | "all_grade", username: string) {
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

  const loadAllGrades = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) {
      setAllError("请先登录");
      setAllLoading(false);
      return;
    }
    const key = academicCacheKey("all_grade", username);

    if (!forceRefresh) {
      const cached = await readCache<{ gpa: number; totalCredits: number; grades: Grade[] }>(key);
      if (cached) {
        setAllGpa(cached.gpa);
        setAllTotalCredits(cached.totalCredits);
        setAllGrades(cached.grades);
        setAllLoading(false);
        setAllError(null);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchGrade(session);
            setAllGpa(result.gpa);
            setAllTotalCredits(result.totalCredits);
            setAllGrades(result.grades);
            await writeCache(key, result);
          }
        } catch {}
        return;
      }
    }

    setAllLoading(true);
    setAllError(null);
    try {
      const session = await loadSession();
      if (!session) {
        setAllError("请先登录");
        return;
      }
      const result = await fetchGrade(session);
      setAllGpa(result.gpa);
      setAllTotalCredits(result.totalCredits);
      setAllGrades(result.grades);
      await writeCache(key, result);
    } catch (e) {
      setAllError(e instanceof Error ? e.message : "获取全部成绩失败");
    } finally {
      setAllLoading(false);
    }
  }, []);

  const loadMajorGrades = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) {
      setMajorError("请先登录");
      setMajorLoading(false);
      return;
    }
    const key = academicCacheKey("major_grade", username);

    if (!forceRefresh) {
      const cached = await readCache<{ gpa: number; totalCredits: number; grades: Grade[] }>(key);
      if (cached) {
        setMajorGpa(cached.gpa);
        setMajorTotalCredits(cached.totalCredits);
        setMajorGrades(cached.grades);
        setMajorLoading(false);
        setMajorError(null);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchMajorGrade(session);
            setMajorGpa(result.gpa);
            setMajorTotalCredits(result.totalCredits);
            setMajorGrades(result.grades);
            await writeCache(key, result);
          }
        } catch {}
        return;
      }
    }

    setMajorLoading(true);
    setMajorError(null);
    try {
      const session = await loadSession();
      if (!session) {
        setMajorError("请先登录");
        return;
      }
      const result = await fetchMajorGrade(session);
      setMajorGpa(result.gpa);
      setMajorTotalCredits(result.totalCredits);
      setMajorGrades(result.grades);
      await writeCache(key, result);
    } catch (e) {
      setMajorError(e instanceof Error ? e.message : "获取主修成绩失败");
    } finally {
      setMajorLoading(false);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    await Promise.all([loadAllGrades(), loadMajorGrades()]);
  }, [loadAllGrades, loadMajorGrades]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllGrades(true), loadMajorGrades(true)]);
    setRefreshing(false);
  }, [loadAllGrades, loadMajorGrades]);

  useEffect(() => {
    if (authState.userToken) {
      loadAllData();
    }
  }, [authState.userToken, loadAllData]);

  if (!authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title="成绩详情" />
        <EmptyState message="请先在首页登录浙大统一身份认证" />
      </ScreenContainer>
    );
  }

  const currentGrades = activeTab === "major" ? majorGrades : allGrades;
  const currentGpa = activeTab === "major" ? majorGpa : allGpa;
  const currentTotalCredits = activeTab === "major" ? majorTotalCredits : allTotalCredits;
  const currentLoading = activeTab === "major" ? majorLoading : allLoading;
  const currentError = activeTab === "major" ? majorError : allError;
  const currentRetry = activeTab === "major" ? () => loadMajorGrades(true) : () => loadAllGrades(true);

  if (currentLoading && currentGrades.length === 0) {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title="成绩详情" />
        <GradeTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <LoadingView />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <CommonNavBar title="成绩详情" />
      <GradeTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <FlatList
        data={currentGrades}
        keyExtractor={(item, index) => `${item.courseName}-${index}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, marginBottom: 16, gap: 16 }}>
            <CompactGpaCard
              gpa={currentGpa}
              totalCredits={currentTotalCredits}
              loading={false}
              error={currentError}
              onRetry={currentRetry}
              radius={r}
            />
            {!currentError && currentGrades.length > 0 && (
              <ScoreDistributionCard grades={currentGrades} radius={r} />
            )}
          </View>
        }
        ListEmptyComponent={
          currentError ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <ErrorCard message={currentError} onRetry={currentRetry} />
            </View>
          ) : (
            <EmptyState message="暂无课程成绩" />
          )
        }
        renderItem={({ item }) => <GradeItem grade={item} radius={r} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}