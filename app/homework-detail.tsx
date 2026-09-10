import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import { useTheme, CARD_RADIUS_VALUES, FONT_FAMILY_META } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSession, withRelogin, fetchHomeworks, HomeworkInfo, CoursewareFile } from "@/lib/zju-client";
import { htmlToPlainText } from "@/lib/zju/courses-parsers";
import { CommonNavBar } from "@/components/common/nav-bar";
import { SearchInput } from "@/components/common/search-input";
import { ErrorCard } from "@/components/common/error-card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingView } from "@/components/common/loading-view";
import { useCoursewareDownload } from "@/hooks/use-courseware-download";

// 作业紫用 colors.violet（随深浅色切换，与学业页一致）

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${alpha})`;
}

function isToday(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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

type TabKey = "today" | "week" | "pending" | "submitted" | "overdue";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "week", label: "近七天" },
  { key: "pending", label: "未提交" },
  { key: "submitted", label: "已提交" },
  { key: "overdue", label: "已截止" },
];

function filterHomeworks(homeworks: HomeworkInfo[], tab: TabKey): HomeworkInfo[] {
  switch (tab) {
    case "today":
      return homeworks.filter((h) => !h.submitted && isToday(h.deadlineIso));
    case "week":
      return homeworks.filter((h) => !h.submitted && isWithin7Days(h.deadlineIso));
    case "pending":
      return homeworks.filter((h) => !h.submitted && !isPast(h.deadlineIso));
    case "submitted":
      return homeworks.filter((h) => h.submitted);
    case "overdue":
      return homeworks.filter((h) => !h.submitted && isPast(h.deadlineIso));
    default:
      return homeworks;
  }
}

function HomeworkCard({
  hw,
  radius,
  expanded,
  onToggle,
  onTapAttachment,
  downloadingId,
}: {
  hw: HomeworkInfo;
  radius: number;
  expanded: boolean;
  onToggle: () => void;
  onTapAttachment: (att: CoursewareFile) => void;
  downloadingId: number | null;
}) {
  const colors = useColors();
  const scheme = useColorScheme();
  const past = isPast(hw.deadlineIso);
  const today = isToday(hw.deadlineIso);
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  let accentColor = colors.violet;
  let tagLabel = "待提交";
  let tagBg = hexToRgba(colors.violet, 0.12);
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

  const hasExpandable = hw.description.trim() !== "" || hw.attachments.length > 0;
  // 描述只展示前 3 行：lineHeight=20 × 3 = 60，加 paddingTop/Bottom≈70 高度
  const descriptionPreview = hw.description ? htmlToPlainText(hw.description) : "";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onToggle}
      style={{
        borderRadius: radius,
        backgroundColor: colors.background,
        overflow: "hidden",
        marginBottom: 10,
        ...cardShadow(scheme, { offsetY: 1, opacity: 0.06, radius: 5, elevation: 2 }),
        borderWidth: 0.5,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: accentColor,
        }}
      />
      <View style={{ paddingLeft: 17, paddingRight: 14, paddingVertical: 13, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: "500",
              fontFamily: ff,
              color: colors.foreground,
              lineHeight: 20,
            }}
            numberOfLines={2}
          >
            {hw.title}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: tagBg,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: accentColor, fontFamily: ff }}>
              {tagLabel}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="graduationcap.fill" size={11} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }} numberOfLines={1}>
            {hw.courseName}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="clock.fill" size={11} color={accentColor} />
          <Text style={{ fontSize: 12, fontWeight: "500", color: accentColor, fontFamily: ff }}>
            截止 {hw.deadline}
          </Text>
        </View>

        {hasExpandable && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <IconSymbol
              name={expanded ? "chevron.up" : "chevron.down"}
              size={11}
              color={colors.muted}
            />
            <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>
              {expanded ? "收起" : hw.attachments.length > 0 ? `展开（${hw.attachments.length} 个附件）` : "展开"}
            </Text>
          </View>
        )}

        {expanded && (
          <View
            style={{
              marginTop: 8,
              paddingTop: 10,
              borderTopWidth: 0.5,
              borderTopColor: colors.border,
              gap: 10,
            }}
          >
            {descriptionPreview && (
              <Text
                style={{
                  fontSize: 13,
                  color: colors.foreground,
                  fontFamily: ff,
                  lineHeight: 20,
                }}
              >
                {descriptionPreview}
              </Text>
            )}
            {hw.attachments.length > 0 && (
              <View style={{ gap: 6 }}>
                {descriptionPreview && (
                  <Text
                    style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}
                  >
                    附件
                  </Text>
                )}
                {hw.attachments.map((att) => (
                  <TouchableOpacity
                    key={att.id}
                    activeOpacity={0.7}
                    onPress={() => onTapAttachment(att)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: colors.surface,
                      borderWidth: 0.5,
                      borderColor: colors.border,
                    }}
                  >
                    <IconSymbol
                      name="square.and.arrow.down"
                      size={14}
                      color={colors.violet}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: colors.foreground,
                        fontFamily: ff,
                      }}
                    >
                      {att.name || "未命名附件"}
                    </Text>
                    {downloadingId === att.id ? (
                      <Text style={{ fontSize: 11, color: colors.muted }}>…</Text>
                    ) : (
                      <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function HomeworkTabBar({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  counts: Record<TabKey, number>;
}) {
  const colors = useColors();
  const { primaryColor } = useTheme();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.background,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        paddingHorizontal: 4,
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const count = counts[tab.key];
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text
                style={{
                  fontSize: 13, fontFamily: ff,
                  fontWeight: isActive ? "600" : "400",
                  color: isActive ? primaryColor : colors.muted,
                }}
              >
                {tab.label}
              </Text>
              {count > 0 && (
                <View
                  style={{
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: isActive ? primaryColor : colors.surface,
                    borderWidth: 0.5,
                    borderColor: isActive ? primaryColor : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontFamily: ff,
                      fontWeight: "600",
                      color: isActive ? "#fff" : colors.muted,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {count > 99 ? "99+" : count}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function HomeworkDetailScreen() {
  const colors = useColors();
  const { cardRadius } = useTheme();
  const { state: authState } = useAuth();
  const r = CARD_RADIUS_VALUES[cardRadius];
  const { downloadingId, openFile } = useCoursewareDownload();

  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [query, setQuery] = useState("");
  const [homeworks, setHomeworks] = useState<HomeworkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 展开项用 Set 存，避免 FlatList 虚拟化卸载后丢状态
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [allowPreview, setAllowPreview] = useState(false);

  const loadData = useCallback(async (forceRefresh = false) => {
    const username = await AsyncStorage.getItem("username");
    if (!username) {
      setError("请先登录");
      setLoading(false);
      return;
    }
    const cacheKey = `academic_homeworks_${username}`;

    if (!forceRefresh) {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        try {
          setHomeworks(JSON.parse(raw));
        } catch {
          // 旧缓存无 description/attachments 字段，丢掉重建
        }
        setLoading(false);
        try {
          const session = await loadSession();
          if (session) {
            const fresh = await withRelogin(session, () => fetchHomeworks(session));
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
      if (!session) {
        setError("请先登录");
        return;
      }
      const result = await withRelogin(session, () => fetchHomeworks(session));
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

  useEffect(() => {
    if (authState.userToken) {
      // 拉设置里的「下载未开放课件」开关，决定附件 openFile 时的降级行为
      AsyncStorage.getItem("pref_courseware_preview").then((v) => setAllowPreview(v === "1"));
      loadData();
    }
  }, [authState.userToken, loadData]);

  const onToggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onTapAttachment = useCallback(
    async (att: CoursewareFile) => {
      const hw = homeworks.find((h) => h.attachments.some((a) => a.id === att.id));
      const err = await openFile(att, hw?.courseId ?? 0, allowPreview, hw?.courseName);
      if (err) setError(err);
    },
    [homeworks, openFile, allowPreview]
  );

  const filtered = useMemo(() => {
    const byTab = filterHomeworks(homeworks, activeTab);
    const kw = query.trim().toLowerCase();
    if (!kw) return byTab;
    return byTab.filter(
      (h) => h.title.toLowerCase().includes(kw) || h.courseName.toLowerCase().includes(kw)
    );
  }, [homeworks, activeTab, query]);

  const counts = useMemo(
    () => ({
      today: filterHomeworks(homeworks, "today").length,
      week: filterHomeworks(homeworks, "week").length,
      pending: filterHomeworks(homeworks, "pending").length,
      submitted: filterHomeworks(homeworks, "submitted").length,
      overdue: filterHomeworks(homeworks, "overdue").length,
    }),
    [homeworks]
  );

  const tabLabel = TABS.find((t) => t.key === activeTab)?.label || "作业";

  if (!authState.userToken) {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title="作业" />
        <EmptyState message="请先在首页登录浙大统一身份认证" />
      </ScreenContainer>
    );
  }

  if (loading && homeworks.length === 0) {
    return (
      <ScreenContainer className="flex-1 bg-surface">
        <CommonNavBar title="作业" />
        <HomeworkTabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
        <LoadingView />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <CommonNavBar title="作业" />
      <HomeworkTabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
      {error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <ErrorCard message={error} onRetry={() => loadData(true)} />
        </View>
      ) : (
        <>
          {/* 搜索框必须固定在 FlatList 之外——放 ListHeaderComponent 里会被
              虚拟化卸载/重挂载，导致输入框失焦、键盘反复弹出收起 */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SearchInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索作业 / 课程"
              style={{ backgroundColor: colors.background }}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <HomeworkCard
                hw={item}
                radius={r}
                expanded={expandedIds.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
                onTapAttachment={onTapAttachment}
                downloadingId={downloadingId}
              />
            )}
            contentContainerStyle={{ padding: 16, paddingTop: 12, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.violet} />
            }
            ListEmptyComponent={
              <EmptyState message={query.trim() ? "未找到匹配的作业" : `暂无${tabLabel}作业`} />
            }
          />
        </>
      )}
    </ScreenContainer>
  );
}