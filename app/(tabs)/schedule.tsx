import { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, Pressable, Image,RefreshControl,
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
import { getSemesterOptions as zjuGetSemesterOptions, ZjuSession, checkSemesterHasCourses} from "@/lib/zju-client";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";
import { writeLog } from "@/lib/diagnostic-log";
import { loadActiveSemesters } from "@/lib/semester-loader";

// ─── Types 

interface SemesterOption {
  yearValue: string;   // e.g. "2025-2026"
  termValue: string;   // e.g. "2|春"
  yearText: string;    // e.g. "2025-2026学年"
  termText: string;    // e.g. "第1学期"
  label: string;       // e.g. "2025-2026学年 第一学期"
}

// Stable key for AsyncStorage: uses original value
function semesterKey(yearValue: string, termValue: string) {
  return `${yearValue}|${termValue}`;
}

/**
 * Split a stored key back into [yearValue, termValue].
 * termValue itself may contain "|" (e.g. "2|春"), so we only
 * split on the FIRST pipe character.
 */
function parseKey(key: string): [string, string] {
  const idx = key.indexOf("|");
  if (idx === -1) return [key, ""];
  return [key.slice(0, idx), key.slice(idx + 1)];
}

export default function ScheduleScreen() {
  const { state, fetchScheduleBySemester, refreshAllSemesters, resetScheduleLoading } = useSchedule();
  const colors = useColors();
  const { primaryColor } = useTheme();
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterType, setFilterType] = useState<"all" | "single" | "double">("all");
  const [tableAvailableH, setTableAvailableH] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // Modals
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [overlappingCourses, setOverlappingCourses] = useState<Course[]>([]);
  const [overlapVisible, setOverlapVisible] = useState(false);
  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];

  // Ref for screenshot capture
  const captureViewRef = useRef<View>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const username = await AsyncStorage.getItem("username");
      if (!username || cancelled) return;

      // 1. 恢复上次选中的学期（仅用于 UI 记忆）
      let restoredKey: string | null = null;
      try {
        const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
        if (lastKey) {
          restoredKey = lastKey;
          if (!cancelled) setSelectedSemester(lastKey);
          writeLog("SCHEDULE", `恢复上次选中学期: ${lastKey}`, "info");
        } else {
          writeLog("SCHEDULE", "无上次选中学期记录", "info");
        }
      } catch (e) {
        writeLog("SCHEDULE", `读取上次选中学期异常: ${String(e)}`, "error");
      }

      // 2. 加载学期列表（复用公共函数，内部已做并发控制和缓存）
      if (!cancelled) setLoadingSemesters(true);
      try {
        const allSemesters = await loadActiveSemesters(username);
        if (cancelled) return;

        if (allSemesters && allSemesters.length > 0) {
          setSemesters(allSemesters);

          // 决定默认选中的学期
          let defaultSemester: SemesterOption | undefined;
          if (restoredKey) {
            defaultSemester = allSemesters.find(
              s => semesterKey(s.yearValue, s.termValue) === restoredKey
            );
          }
          if (!defaultSemester) {
            defaultSemester = allSemesters[0];
          }

          if (defaultSemester) {
            const key = semesterKey(defaultSemester.yearValue, defaultSemester.termValue);
            if (!cancelled) setSelectedSemester(key);
            await AsyncStorage.setItem(`lastSelectedSemester_${username}`, key);
            await fetchScheduleBySemester(defaultSemester.yearValue, defaultSemester.termValue, true);
            writeLog("SCHEDULE", `默认学期已选中: ${key}`, "info");
          }
        } else {
          // 无有效学期：清空课表并结束加载状态
          resetScheduleLoading();
          writeLog("SCHEDULE", "加载到的学期列表为空", "error");
          setSemesters([]);
          setSelectedSemester(null);
        }
      } catch (e) {
        writeLog("SCHEDULE", `加载学期列表失败: ${e instanceof Error ? e.message : String(e)}`, "error");
        setSemesters([]);
        setSelectedSemester(null);
        // 同样需要重置 loading 状态
      } finally {
        if (!cancelled) setLoadingSemesters(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Semester change ────────────────────────────────────────────────────────
  const handleSemesterChange = async (yearValue: string, termValue: string) => {
    console.log("semester change:", yearValue, termValue);
    const key = semesterKey(yearValue, termValue);
    setSelectedSemester(key);
    setShowSemesterPicker(false);
    const username = await AsyncStorage.getItem("username");
    if (username) await AsyncStorage.setItem(`lastSelectedSemester_${username}`, key);
    await fetchScheduleBySemester(yearValue, termValue);
  };

  // ── Refresh (re-fetch from network, bypass cache) ──────────────────────────
  const handleRefresh = async () => {
    if (isRefreshing) return;
    if (!selectedSemester) return;
    setIsRefreshing(true);

    const [yearValue, termValue] = parseKey(selectedSemester);

    try {
      const allSemesters = semesters.map(s => ({
        yearValue: s.yearValue,
        termValue: s.termValue,
      }));

      if (allSemesters.length === 0) {
        Alert.alert("提示", "学期列表未加载，请稍后重试");
        return;
      }

      const { success, failedCount } = await refreshAllSemesters(allSemesters);

      if (failedCount > 0) {
        console.warn(`${failedCount} 个学期刷新失败`);
      }
      writeLog("SCHEDULE", `刷新完成: ${success ? "全部成功" : `${failedCount} 个学期失败`}`, failedCount > 0 ? "error" : "info");
      Alert.alert("完成", success ? "所有学期课表已更新" : `部分学期更新失败（${failedCount} 个）`);
    } catch (error: any) {
      Alert.alert("错误", error.message || "刷新失败，请重试");
    } finally {
      setIsRefreshing(false);
    }
    await handleSemesterChange(yearValue, termValue);
  };

  // Download (screenshot) 
  const handleDownload = async () => {
    if (!captureViewRef.current) return;
    try {
      setIsDownloading(true);
      const uri = await captureRef(captureViewRef, { format: "png", quality: 1.0 });
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("权限不足", "请允许访问相册"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("完成", "已保存到相册");
    } catch {
      Alert.alert("导出失败", "截图失败，请重试");
    } finally {
      setIsDownloading(false);
    }
  };
  //Share
  const handleShare = async () => {
    if (!captureViewRef.current) return;
    try {
      setIsDownloading(true);
      const uri = await captureRef(captureViewRef, { format: "png", quality: 1.0 });
    
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "分享课表截图" });
      } else {
        Alert.alert("提示", "当前设备不支持分享");
      }
    } catch {
      Alert.alert("导出失败", "截图失败，请重试");
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Course press
  const handleCoursePress = (course: Course) => { setSelectedCourse(course); setDetailVisible(true); };
  const handleMultipleCoursesPress = (courses: Course[]) => { setOverlappingCourses(courses); setOverlapVisible(true); };
  const openDetailFromOverlap = (course: Course) => {
    setOverlapVisible(false);
    setTimeout(() => { setSelectedCourse(course); setDetailVisible(true); }, 220);
  };

  // ── Filtered courses ───────────────────────────────────────────────────────
  const filteredCourses = (state.courses ?? []).filter(c => {
    if (filterType === "single") return c.isSingleWeek !== "double";
    if (filterType === "double") return c.isSingleWeek !== "single";
    return true;
  });

  const selectedLabel = selectedSemester
    ? (semesters.find(s => semesterKey(s.yearValue, s.termValue) === selectedSemester)?.label ?? "选择学期")
    : "选择学期";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer className="flex-1 bg-surface">
      {state.isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.muted }}>加载课表中...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>

          <View style={{
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
            gap: 10,
            backgroundColor: colors.surface,
            borderBottomWidth: 0.5, borderBottomColor: colors.border,
          }}>
            {/* Row 1: semester selector + buttons */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowSemesterPicker(v => !v)}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.background,
                  borderRadius: r, paddingHorizontal: 14, paddingVertical: 10,
                  borderWidth: 0.5, borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {loadingSemesters ? "加载中..." : selectedLabel}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {showSemesterPicker ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
                
              {/* Download button */}
              <TouchableOpacity
                onPress={handleDownload}
                disabled={isDownloading}
                style={{
                  width: 44, height: 44, borderRadius: r,
                  backgroundColor: colors.background,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 0.5, borderColor: colors.border,
                }}
              >
                {isDownloading
                  ? <ActivityIndicator size="small" color={colors.muted} />
                  : <IconSymbol name="square.and.arrow.down" size={18} color={colors.foreground} />
                }
                </TouchableOpacity>
                
              {/* Share button */}
              <TouchableOpacity
                onPress={handleShare}
                disabled={isDownloading}
                style={{
                  width: 44, height: 44, borderRadius: r,
                  backgroundColor: colors.background,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 0.5, borderColor: colors.border,
                }}
              >
                {isDownloading
                  ? <ActivityIndicator size="small" color={colors.muted} />
                  : <IconSymbol name="arrowshape.turn.up.right" size={18} color={colors.foreground} />
                }
              </TouchableOpacity>

              {/* Refresh button
              <TouchableOpacity
                onPress={handleRefresh}
                disabled={isRefreshing}
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: isRefreshing ? colors.surface : primaryColor,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: isRefreshing ? 0.5 : 0, borderColor: colors.border,
                }}
              >
                {isRefreshing
                  ? <ActivityIndicator size="small" color={colors.muted} />
                  : <Image
                      source={require("@/assets/images/refresh-icon.png")}
                      style={{ width: 18, height: 18, tintColor: "#fff" }}
                    />
                }
              </TouchableOpacity> */}
            </View>

            {/* Semester dropdown */}
            {showSemesterPicker && (
              <View style={{
                backgroundColor: colors.background, borderRadius: r,
                overflow: "hidden", borderWidth: 0.5, borderColor: colors.border,
              }}>
                {semesters.length === 0 ? (
                  <View style={{ padding: 16, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: colors.muted }}>
                      {loadingSemesters ? "正在加载学期列表..." : "暂无学期数据"}
                    </Text>
                  </View>
                ) : (
                  semesters.map((s, i) => {
                    const key = semesterKey(s.yearValue, s.termValue);
                    const isActive = selectedSemester === key;
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => handleSemesterChange(s.yearValue, s.termValue)}
                        style={{
                          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                          paddingHorizontal: 14, paddingVertical: 12,
                          borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border,
                          backgroundColor: isActive ? `${colors.primary}15` : "transparent",
                        }}
                      >
                        <Text style={{
                          fontSize: 14,
                          fontWeight: isActive ? "600" : "400",
                          color: isActive ? primaryColor : colors.foreground,
                        }}>
                          {s.label}
                        </Text>
                        {isActive && <Text style={{ fontSize: 14, color: primaryColor }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}

            {/* Row 2: view toggle + filter pills */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                flexDirection: "row",
                backgroundColor: colors.background,
                borderRadius: r, borderWidth: 0.5, borderColor: colors.border,
                overflow: "hidden",
              }}>
                {(["grid", "list"] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setViewMode(m)}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 8,
                      backgroundColor: viewMode === m ? primaryColor : "transparent",
                    }}
                  >
                    <IconSymbol
                      name={m === "grid" ? "square.grid.2x2" : "list.bullet"}
                      size={16}
                      color={viewMode === m ? "#fff" : colors.muted}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
                {(["all", "single", "double"] as const).map(f => {
                  const label = f === "all" ? "全部" : f === "single" ? "单周" : "双周";
                  const isActive = filterType === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFilterType(f)}
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: r, alignItems: "center",
                        backgroundColor: isActive ? primaryColor : colors.background,
                        borderWidth: isActive ? 0 : 0.5, borderColor: colors.border,
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: isActive ? "600" : "400",
                        color: isActive ? "#fff" : colors.foreground,
                      }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── Content (capturable area) */}
          {state.isLoading || !selectedSemester ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 14, color: colors.muted }}>加载课表中...</Text>
            </View>
          ) : filteredCourses.length === 0 ? (
            // ↓ View 改成 ScrollView，这样没课时也能下拉刷新
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flex: 1, justifyContent: "center", alignItems: "center" }}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                />
              }
            >
              <Text style={{ fontSize: 14, color: colors.muted }}>当前筛选条件下没有课程</Text>
            </ScrollView>
          ) : (
            <View
              ref={captureViewRef}
              collapsable={false}
              style={{ flex: 1, backgroundColor: colors.surface }}
              onLayout={e => setTableAvailableH(e.nativeEvent.layout.height)}
            >
              {viewMode === "grid" ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing}
                      onRefresh={handleRefresh}
                      tintColor={colors.primary}
                    />
                  }
                >
                  <ScheduleTable
                    courses={filteredCourses}
                    onCoursePress={handleCoursePress}
                    onMultipleCoursesPress={handleMultipleCoursesPress}
                    mode="grid"
                    availableHeight={tableAvailableH}
                    radius={r}
                  />
                  <View style={{ paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" }}>
                    <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", lineHeight: 17 }}>
                      课表调休及节假日信息仅供参考，以学校通知为准{"\n"}
                      部分单双周课程请依据教学班通知
                    </Text>
                  </View>
                </ScrollView>
              ) : (
                <ScheduleTable
                  courses={filteredCourses}
                  onCoursePress={handleCoursePress}
                  onMultipleCoursesPress={handleMultipleCoursesPress}
                  mode="list"
                  availableHeight={tableAvailableH}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing}
                      onRefresh={handleRefresh}
                      tintColor={colors.primary}
                    />
                  }
                  radius={r}
                />
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Course detail modal */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={() => setDetailVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setDetailVisible(false)}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              width: "85%", maxWidth: 360,
              backgroundColor: colors.background,
              borderRadius: 16, padding: 20,
              shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.16, shadowRadius: 20, elevation: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
              <TouchableOpacity onPress={() => setDetailVisible(false)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 18, color: colors.muted }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedCourse && (
              <CourseDetailContent
                courseName={selectedCourse.name}
                teacher={selectedCourse.teacher}
                classroom={selectedCourse.classroom}
                weekType={
                  selectedCourse.isSingleWeek === "single" ? "single"
                  : selectedCourse.isSingleWeek === "double" ? "double"
                  : ""
                }
                examInfo={selectedCourse.examInfo}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Overlap modal */}
      <Modal visible={overlapVisible} transparent animationType="fade" onRequestClose={() => setOverlapVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setOverlapVisible(false)}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              width: "78%", maxWidth: 300,
              backgroundColor: colors.background,
              borderRadius: 16, overflow: "hidden",
              shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.16, shadowRadius: 20, elevation: 10,
            }}
          >
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 18, paddingVertical: 14,
              borderBottomWidth: 0.5, borderBottomColor: colors.border,
            }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                该时段 {overlappingCourses.length} 门课程
              </Text>
              <TouchableOpacity onPress={() => setOverlapVisible(false)} style={{ padding: 2 }}>
                <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
              </TouchableOpacity>
            </View>

            {overlappingCourses.map((course, i) => (
              <TouchableOpacity
                key={course.id}
                onPress={() => openDetailFromOverlap(course)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  paddingHorizontal: 18, paddingVertical: 14,
                  borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border,
                }}
                activeOpacity={0.7}
              >
                <View style={{ width: 4, height: 38, borderRadius: 2, backgroundColor: course.color }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground, lineHeight: 20 }} numberOfLines={2}>
                    {course.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
                    {course.classroom}
                  </Text>
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