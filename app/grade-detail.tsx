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

// 辅助函数

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 根据绩点值获取颜色
function getGpaColor(gpa: number, colors: any) {
  if (gpa >= 3.7) return colors.success;
  if (gpa >= 3.0) return colors.primary;
  if (gpa >= 2.0) return colors.warning;
  return colors.error;
}

//格式化绩点显示
function formatGpa(gpa: number | null): string {
  if (gpa === null || gpa === undefined) return "—";
  return gpa.toFixed(2);
}

//格式化学分显示
function formatCredit(credit: number | string | null): string {
  if (credit === null || credit === undefined) return "—";
  if (typeof credit === "number") return credit.toFixed(1);
  return credit;
}

// 子组件

// 空状态卡片
function EmptyCard({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 18,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 13, color: colors.muted }}>{message}</Text>
    </View>
  );
}

// 错误卡片
function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: hexToRgba(colors.error, 0.08),
        borderWidth: 0.5,
        borderColor: hexToRgba(colors.error, 0.3),
        padding: 16,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 13, color: colors.error }}>{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 8,
          backgroundColor: hexToRgba(colors.error, 0.1),
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.error }}>
          重试
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// 分段选择器 (主修/全部)
function TabSwitcher({
  activeTab,
  onTabChange,
}: {
  activeTab: "major" | "all";
  onTabChange: (tab: "major" | "all") => void;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 4,
        borderWidth: 0.5,
        borderColor: colors.border,
      }}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          paddingVertical: 8,
          borderRadius: 10,
          backgroundColor: activeTab === "major" ? colors.background : "transparent",
          alignItems: "center",
          shadowColor: activeTab === "major" ? "#000" : "transparent",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: activeTab === "major" ? 1 : 0,
        }}
        onPress={() => onTabChange("major")}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: activeTab === "major" ? colors.primary : colors.muted,
          }}
        >
          主修课程
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{
          flex: 1,
          paddingVertical: 8,
          borderRadius: 10,
          backgroundColor: activeTab === "all" ? colors.background : "transparent",
          alignItems: "center",
        }}
        onPress={() => onTabChange("all")}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: activeTab === "all" ? colors.primary : colors.muted,
          }}
        >
          全部课程
        </Text>
      </TouchableOpacity>
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
}: {
  gpa: number;
  totalCredits: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const colors = useColors();
  const gpaColor = getGpaColor(gpa, colors);

  if (loading) {
    return (
      <View
        style={{
          borderRadius: 16,
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
          borderRadius: 16,
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
        borderRadius: 16,
        backgroundColor: colors.background,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
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
          <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "500" }}>
            平均绩点
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: "700",
                color: gpaColor,
                fontVariant: ["tabular-nums"],
              }}
            >
              {gpa.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>/5.0</Text>
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
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
            已修 {totalCredits} 学分
          </Text>
        </View>
      </View>
    </View>
  );
}

// 分数分布条组件 
function ScoreDistribution({ grades }: { grades: Grade[] }) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();

  // 有效分数（数字型或可转为数字的字符串）
  const validGrades = grades.filter((g) => {
    if (g.score === null || g.score === undefined) return false;
    if (typeof g.score === "number") return true;
    const trimmed = g.score.trim();
    return /^-?\d+(\.\d+)?$/.test(trimmed);
  });

  const total = validGrades.length;
  if (total === 0) {
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
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
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {bucket.label}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: bucket.color }}>
                {count} 门
              </Text>
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: hexToRgba(bucket.color, 0.15),
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${pct * 100}%` as any,
                  borderRadius: 3,
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
        <Text style={{ fontSize: 11, color: colors.muted }}>
          共 {total} 门已出分
        </Text>
      </View>
    </View>
  );
}

//课程块：课程名称、绩点、学分，底部绩点进度条 
function GradeItem({ grade }: { grade: Grade }) {
  const colors = useColors();

  // 绩点颜色（若有）
  let gpaColor = colors.muted;
  if (grade.gpaPoints !== null && grade.gpaPoints !== undefined) {
    gpaColor = getGpaColor(grade.gpaPoints, colors);
  }

  // 绩点显示
  const gpaDisplay = grade.gpaPoints !== null && grade.gpaPoints !== undefined
    ? grade.gpaPoints.toFixed(2)
    : "暂无绩点";

  // 学分显示
  const creditDisplay = formatCredit(grade.credit ?? null);

  // 是否显示进度条（有绩点且绩点有效）
  const showProgressBar = grade.gpaPoints !== null && grade.gpaPoints !== undefined && grade.gpaPoints >= 0;

  // 进度比例（绩点 / 5.0）
  const progressPercent = showProgressBar ? (grade.gpaPoints! / 5.0) * 100 : 0;

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderRadius: 12,
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
      {/* 第一行：课程名 + 学分（紧挨） + 绩点（最右） */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* 左侧：课程名 + 学分，紧挨着 */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexShrink: 1,          // 防止内容过多时溢出
            gap: 4,                 // 可根据需要调整间隙（紧挨时可设为 0 或 4）
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "500",
              color: colors.foreground,
              lineHeight: 22,
              flexShrink: 1,        // 允许课程名压缩，保证整体不溢出
            }}
            numberOfLines={2}
          >
            {grade.courseName}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            / {creditDisplay}学分
          </Text>
        </View>

        {/* 右侧：绩点 */}
        <Text style={{ fontSize: 16, fontWeight: "600", color: gpaColor }}>
          { grade.score} / {gpaDisplay}
        </Text>
      </View>

      

      {/* 底部绩点进度条 */}
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

// 主界面 

export default function GradeDetailScreen() {
  const { state: authState } = useAuth();
  const colors = useColors();

  // Tab 状态
  const [activeTab, setActiveTab] = useState<"major" | "all">("major");

  // 全部成绩数据
  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [allGpa, setAllGpa] = useState(0);
  const [allTotalCredits, setAllTotalCredits] = useState(0);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);

  // 主修成绩数据
  const [majorGrades, setMajorGrades] = useState<Grade[]>([]);
  const [majorGpa, setMajorGpa] = useState(0);
  const [majorTotalCredits, setMajorTotalCredits] = useState(0);
  const [majorLoading, setMajorLoading] = useState(true);
  const [majorError, setMajorError] = useState<string | null>(null);

  // 刷新控制
  const [refreshing, setRefreshing] = useState(false);

  function academicCacheKey(type: "major_grade" | "all_grade", username: string) {
    return `academic_${type}_${username}`;
  }

  async function readCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  async function writeCache(key: string, data: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }

  // 加载全部成绩（缓存优先）
  const loadAllGrades = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) {
      setAllError("请先登录");
      setAllLoading(false);
      return;
    }
    const key = academicCacheKey("all_grade", username);

    // 非强制刷新时尝试读取缓存
    if (!forceRefresh) {
      const cached = await readCache<{ gpa: number; totalCredits: number; grades: Grade[] }>(key);
      if (cached) {
        // 立即展示缓存数据
        setAllGpa(cached.gpa);
        setAllTotalCredits(cached.totalCredits);
        setAllGrades(cached.grades);
        setAllLoading(false);
        setAllError(null);
        // 后台静默刷新
        //setAllStale(true);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchGrade(session);
            setAllGpa(result.gpa);
            setAllTotalCredits(result.totalCredits);
            setAllGrades(result.grades);
            await writeCache(key, result);
          }
        } catch {
          // 静默失败，保留缓存数据
        } finally {
          //setAllStale(false);
        }
        return;
      }
    }

    // 无缓存或强制刷新：显示 loading 并请求网络
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

  // 加载主修成绩
  const loadMajorGrades = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) {
      setMajorError("请先登录");
      setMajorLoading(false);
      return;
    }
    const key = academicCacheKey("major_grade", username);

    // 非强制刷新：优先尝试缓存
    if (!forceRefresh) {
      const cached = await readCache<{ gpa: number; totalCredits: number; grades: Grade[] }>(key);
      if (cached) {
        // 立即展示缓存数据
        setMajorGpa(cached.gpa);
        setMajorTotalCredits(cached.totalCredits);
        setMajorGrades(cached.grades);
        setMajorLoading(false);
        setMajorError(null);
        // setMajorStale(true);
        try {
          const session = await loadSession();
          if (session) {
            const result = await fetchMajorGrade(session);
            setMajorGpa(result.gpa);
            setMajorTotalCredits(result.totalCredits);
            setMajorGrades(result.grades);
            await writeCache(key, result);
          }
        } catch {
          // 静默失败，保留缓存数据
        } finally {
          // setMajorStale(false);
        }
        return;
      }
    }

    // 无缓存或强制刷新：显示 loading 并请求网络
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

  // 同时加载两种数据
  const loadAllData = useCallback(async () => {
    await Promise.all([loadAllGrades(), loadMajorGrades()]);
  }, [loadAllGrades, loadMajorGrades]);

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadAllGrades(true),// 强制刷新
      loadMajorGrades(true),
    ]);
    setRefreshing(false);
  }, [loadAllGrades, loadMajorGrades]);

  // 初始加载及登录状态变化时重新加载
  useEffect(() => {
    if (authState.userToken) {
      loadAllData();
    }
  }, [authState.userToken, loadAllData]);

  // 未登录状态
  if (!authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-background">
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            padding: 24,
          }}
        >
          <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center" }}>
            请先在首页登录浙大统一身份认证
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // 根据当前 tab 获取数据
  const currentGrades = activeTab === "major" ? majorGrades : allGrades;
  const currentGpa = activeTab === "major" ? majorGpa : allGpa;
  const currentTotalCredits =
    activeTab === "major" ? majorTotalCredits : allTotalCredits;
  const currentLoading = activeTab === "major" ? majorLoading : allLoading;
  const currentError = activeTab === "major" ? majorError : allError;
  const currentRetry = activeTab === "major" ? loadMajorGrades : loadAllGrades;

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <FlatList
        data={currentGrades}
        keyExtractor={(item, index) => `${item.courseName}-${index}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 16 }}>
            {/* 页面标题 */}
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              成绩详情
            </Text>

            {/* Tab 切换器 */}
            <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

            {/* 绩点卡片 */}
            <CompactGpaCard
              gpa={currentGpa}
              totalCredits={currentTotalCredits}
              loading={currentLoading}
              error={currentError}
              onRetry={currentRetry}
            />

            {/* 分数分布（可选，保留） */}
            {!currentLoading && !currentError && currentGrades.length > 0 && (
              <View
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 16,
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
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
                  分数分布
                </Text>
                <ScoreDistribution grades={currentGrades} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !currentLoading && !currentError ? (
            <EmptyCard message="暂无课程成绩" />
          ) : null
        }
        renderItem={({ item }) => <GradeItem grade={item} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}