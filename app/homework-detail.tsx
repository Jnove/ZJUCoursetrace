import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSession, fetchHomeworks, HomeworkInfo } from "@/lib/zju-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HW_COLOR = "#8b5cf6";

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${alpha})`;
}

function isToday(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isWithin7Days(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(todayStart);
  end.setDate(end.getDate() + 7);
  return d >= todayStart && d < end;
}

function isPast(iso: string): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabKey = "today" | "week" | "pending" | "submitted" | "overdue";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today",     label: "今天" },
  { key: "week",      label: "近七天" },
  { key: "pending",   label: "未提交" },
  { key: "submitted", label: "已提交" },
  { key: "overdue",   label: "已截止" },
];

function filterHomeworks(homeworks: HomeworkInfo[], tab: TabKey): HomeworkInfo[] {
  switch (tab) {
    case "today":
      return homeworks.filter(h => !h.submitted && isToday(h.deadlineIso));
    case "week":
      return homeworks.filter(h => !h.submitted && isWithin7Days(h.deadlineIso));
    case "pending":
      return homeworks.filter(h => !h.submitted && !isPast(h.deadlineIso));
    case "submitted":
      return homeworks.filter(h => h.submitted);
    case "overdue":
      return homeworks.filter(h => !h.submitted && isPast(h.deadlineIso));
    default:
      return homeworks;
  }
}

// ─── Homework card ────────────────────────────────────────────────────────────

function HomeworkCard({
  hw, radius, tab,
}: {
  hw: HomeworkInfo; radius: number; tab: TabKey;
}) {
  const colors = useColors();
  const past = isPast(hw.deadlineIso);
  const today = isToday(hw.deadlineIso);

  let accentColor = HW_COLOR;
  let tagLabel = "待提交";
  let tagBg = hexToRgba(HW_COLOR, 0.12);
  if (hw.submitted) {
    accentColor = colors.success;
    tagLabel = "已提交";
    tagBg = hexToRgba(colors.success, 0.12);
  } else if (past) {
    accentColor = colors.error;
    tagLabel = "已截止";
    tagBg = hexToRgba(colors.error, 0.12);
  } else if (today) {
    accentColor = colors.warning;
    tagLabel = "今日截止";
    tagBg = hexToRgba(colors.warning, 0.12);
  }

  return (
    <View style={{
      borderRadius: radius,
      backgroundColor: colors.background,
      overflow: "hidden",
      marginBottom: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 5,
      elevation: 2,
    }}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accentColor }} />
      <View style={{ paddingLeft: 17, paddingRight: 14, paddingVertical: 13, gap: 6 }}>
        {/* Title row */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={{
            flex: 1, fontSize: 15, fontWeight: "500",
            color: colors.foreground, lineHeight: 20,
          }} numberOfLines={2}>
            {hw.title}
          </Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: tagBg }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: accentColor }}>{tagLabel}</Text>
          </View>
        </View>
        {/* Course name */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="graduationcap.fill" size={11} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
            {hw.courseName}
          </Text>
        </View>
        {/* Deadline */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="clock.fill" size={11} color={accentColor} />
          <Text style={{ fontSize: 12, fontWeight: "500", color: accentColor }}>
            截止 {hw.deadline}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: TabKey }) {
  const colors = useColors();
  const msg = {
    today:     "今天没有截止的作业",
    week:      "近七天没有截止的作业",
    pending:   "没有待提交的作业",
    submitted: "没有已提交的作业",
    overdue:   "没有已截止未提交的作业",
  }[tab];

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60, gap: 8 }}>
      <Text style={{ fontSize: 14, color: colors.muted }}>{msg}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeworkDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { primaryColor, cardRadius } = useTheme();
  const { state: authState } = useAuth();
  const r = CARD_RADIUS_VALUES[cardRadius];

  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [homeworks, setHomeworks] = useState<HomeworkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
    
  const Service_url = "courses.zju.edu.cn";

  const loadData = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) { setError("请先登录"); setLoading(false); return; }
    const cacheKey = `academic_homeworks_${username}`;

    if (!forceRefresh) {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        setHomeworks(JSON.parse(raw));
        setLoading(false);
        // background refresh
        try {
          const session = await loadSession();
          if (session) {
            const fresh = await fetchHomeworks(session);
            setHomeworks(fresh);
            await AsyncStorage.setItem(cacheKey, JSON.stringify(fresh));
          }
        } catch {}
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const session = await loadSession();
      if (!session) { setError("请先登录"); return; }
      const result = await fetchHomeworks(session);
      setHomeworks(result);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取作业失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => { if (authState.userToken) loadData(); }, [authState.userToken]);

  const filtered = useMemo(() => filterHomeworks(homeworks, activeTab), [homeworks, activeTab]);

  // Tab badges
  const counts = useMemo(() => ({
    today:     filterHomeworks(homeworks, "today").length,
    week:      filterHomeworks(homeworks, "week").length,
    pending:   filterHomeworks(homeworks, "pending").length,
    submitted: filterHomeworks(homeworks, "submitted").length,
    overdue:   filterHomeworks(homeworks, "overdue").length,
  }), [homeworks]);

  return (
    <ScreenContainer className="flex-1 bg-surface">
      {/* Nav bar */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <IconSymbol name="chevron.left" size={22} color={primaryColor} />
        </TouchableOpacity>
        <Text style={{
          flex: 1, textAlign: "center",
          fontSize: 17, fontWeight: "600", color: colors.foreground,
        }}>
          作业
        </Text>
        {loading && !refreshing && (
          <ActivityIndicator size="small" color={colors.muted} style={{ opacity: 0.5 }} />
        )}
        {!loading && <View style={{ width: 22 }} />}
      </View>

      {/* Tab bar */}
      <View style={{
        flexDirection: "row",
        backgroundColor: colors.background,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        paddingHorizontal: 4,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const count = counts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: isActive ? primaryColor : "transparent",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: isActive ? "600" : "400",
                  color: isActive ? primaryColor : colors.muted,
                }}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={{
                    minWidth: 16, height: 16,
                    borderRadius: 8,
                    backgroundColor: isActive ? primaryColor : colors.surface,
                    borderWidth: 0.5,
                    borderColor: isActive ? primaryColor : colors.border,
                    alignItems: "center", justifyContent: "center",
                    paddingHorizontal: 4,
                  }}>
                    <Text style={{
                      fontSize: 9, fontWeight: "600",
                      color: isActive ? "#fff" : colors.muted,
                      //lineHeight: 12,
                      fontVariant: ['tabular-nums']
                    }}>
                      {count > 99 ? "99+" : count}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 }}>
          <Text style={{ fontSize: 14, color: colors.error, textAlign: "center" }}>{error}</Text>
          <TouchableOpacity
            onPress={() => loadData(true)}
            style={{
              paddingHorizontal: 20, paddingVertical: 10,
              borderRadius: r, backgroundColor: hexToRgba(colors.error, 0.1),
            }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.error }}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : loading && homeworks.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={HW_COLOR} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <HomeworkCard hw={item} radius={r} tab={activeTab} />}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={HW_COLOR}
            />
          }
          ListEmptyComponent={<EmptyState tab={activeTab} />}
        />
      )}
    </ScreenContainer>
  );
}