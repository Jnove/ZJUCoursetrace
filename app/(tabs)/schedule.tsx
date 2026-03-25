import { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, Pressable, Image,
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
import { getSemesterOptions as zjuGetSemesterOptions, ZjuSession, checkSemesterHasCourses, invalidateSession, } from "@/lib/zju-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SemesterOption {
  yearValue: string;   // e.g. "2025-2026"
  termValue: string;   // e.g. "2|春"
  yearText: string;    // e.g. "2025-2026学年"
  termText: string;    // e.g. "第一学期"
  label: string;       // e.g. "2025-2026学年 第一学期"
}

// Stable key for AsyncStorage: uses original value
function semesterKey(yearValue: string, termValue: string) {
  return `${yearValue}|${termValue}`;
}

export default function ScheduleScreen() {
  const { state, fetchScheduleBySemester, refreshAllSemesters } = useSchedule();
  const colors = useColors();

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

  // Ref for screenshot capture
  const captureViewRef = useRef<View>(null);

  // ── Init: restore cache, then refresh from API ─────────────────────────────
  useEffect(() => {
    const init = async () => {
      const username = await AsyncStorage.getItem("username");
      if (!username) return;

      // 1. Restore cached semester list and last selection instantly
      let restoredKey: string | null = null;
      try {
        const cachedSems = await AsyncStorage.getItem(`activeSemesters_${username}`);
        if (cachedSems) setSemesters(JSON.parse(cachedSems));
        const lastKey = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
        if (lastKey) { setSelectedSemester(lastKey); restoredKey = lastKey; }
      } catch {}

      // 2. Load schedule for restored selection from local cache
      if (restoredKey && typeof restoredKey === "string" && restoredKey.includes("|")) {
        const [yearValue, termValue] = restoredKey.split("|");
        await fetchScheduleBySemester(yearValue, termValue, true);
      }

      // 3. Refresh semester options from network
      setLoadingSemesters(true);
      try {
        const session: ZjuSession = { username, jsessionId: "native", routeCookie: null };
        const opts = await zjuGetSemesterOptions(session);

        // 构建所有学年-学期组合（笛卡尔积）
        const allCombos: { yearValue: string; termValue: string; yearText: string; termText: string }[] = [];
        for (const yo of opts.yearOptions) {
          for (const to of opts.termOptions) {
            allCombos.push({
              yearValue: yo.value,
              termValue: to.value,
              yearText: yo.text,
              termText: to.text,
            });
          }
        }

        // 并发检测哪些组合有课程（限制并发数，避免过多请求）
        const concurrency = 3;
        const results: { combo: typeof allCombos[0]; hasCourses: boolean }[] = [];
        for (let i = 0; i < allCombos.length; i += concurrency) {
          const chunk = allCombos.slice(i, i + concurrency);
          const chunkResults = await Promise.all(
            chunk.map(combo =>
              checkSemesterHasCourses(session, combo.yearValue, combo.termValue)
                .then(has => ({ combo, hasCourses: has }))
            )
          );
          results.push(...chunkResults);
        }

        // 过滤出有课程的学期
        const allSemesters: SemesterOption[] = results
          .filter(r => r.hasCourses)
          .map(r => ({
            yearValue: r.combo.yearValue,
            termValue: r.combo.termValue,
            yearText: r.combo.yearText,
            termText: r.combo.termText,
            label: `${r.combo.yearText} ${r.combo.termText}`,
          }));

        // 如果没有检测到有课程的学期（可能全部请求失败），回退到所有组合
        if (allSemesters.length === 0) {
          console.warn("未检测到有课程的学期，回退到全部学期组合");
          allSemesters.push(...allCombos.map(c => ({
            yearValue: c.yearValue,
            termValue: c.termValue,
            yearText: c.yearText,
            termText: c.termText,
            label: `${c.yearText} ${c.termText}`,
          })));
        }

        setSemesters(allSemesters);
        await AsyncStorage.setItem(`activeSemesters_${username}`, JSON.stringify(allSemesters));

        // 如果没有恢复上次选择的学期，默认选择第一个有课程的学期（或当前学期）
        if (!restoredKey) {
          // 尝试从 opts 中获取当前选中的学期，但仅当该学期在有课程列表中时使用
          const defaultYearValue = opts.yearOptions.find(o => o.selected)?.value ?? opts.yearOptions[0]?.value;
          const defaultTermValue = opts.termOptions.find(o => o.selected)?.value ?? opts.termOptions[0]?.value;
          const defaultSemester = allSemesters.find(
            s => s.yearValue === defaultYearValue && s.termValue === defaultTermValue
          ) ?? allSemesters[0];

          if (defaultSemester) {
            const key = semesterKey(defaultSemester.yearValue, defaultSemester.termValue);
            setSelectedSemester(key);
            await AsyncStorage.setItem(`lastSelectedSemester_${username}`, key);
            await fetchScheduleBySemester(defaultSemester.yearValue, defaultSemester.termValue, true);
          }
        }
      } catch (e) {
        console.error("Failed to load semester options:", e);
      } finally {
        setLoadingSemesters(false);
      }
    };
    init();
  }, []); // run once on mount

  // ── Semester change ────────────────────────────────────────────────────────
  const handleSemesterChange = async (yearValue: string, termValue: string) => {
    console.log("semester change:",yearValue,termValue);
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
    setIsRefreshing(true);
    if(!selectedSemester) return;
    const [yearValue, termValue] = selectedSemester.split("|");
    // console.log(yearValue,termValue);
    try {
      // 获取所有可用学期（从 semesters state 中提取）
      const allSemesters = semesters.map(s => ({
        yearValue: s.yearValue,
        termValue: s.termValue,
      }));

      if (allSemesters.length === 0) {
        Alert.alert("提示", "学期列表未加载，请稍后重试");
        return;
      }

      // 显示加载提示（可选，用户可看到进度）
      //Alert.alert("刷新中", "正在刷新所有学期课表，请稍候...", [{ text: "确定" }], { cancelable: false });

      const { success, failedCount } = await refreshAllSemesters(allSemesters);

      if (failedCount > 0) {
        console.warn(`${failedCount} 个学期刷新失败`);
        // 可以选择提示部分失败，但不影响主流程
      }

      // // 刷新完成后，重新加载当前学期（确保 UI 更新）
      // if (selectedSemester && selectedSemester.includes("|")) {
      //   const [yearValue, termValue] = selectedSemester.split("|");
      //   await fetchScheduleBySemester(yearValue, termValue, false);
      // }

      Alert.alert("完成", success ? "所有学期课表已更新" : `部分学期更新失败（${failedCount} 个）`);
    } catch (error: any) {
      Alert.alert("错误", error.message || "刷新失败，请重试");
    } finally {
      setIsRefreshing(false);
    }
    console.log(selectedCourse);
    await handleSemesterChange(yearValue,termValue);
  };

  // ── Download (screenshot) ──────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!captureViewRef.current) return;
    try {
      setIsDownloading(true);
      const uri = await captureRef(captureViewRef, { format: "png", quality: 1.0 });
      Alert.alert("课表截图", "选择操作", [
        {
          text: "保存到相册",
          onPress: async () => {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== "granted") { Alert.alert("权限不足", "请允许访问相册"); return; }
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert("完成", "已保存到相册");
          },
        },
        {
          text: "分享",
          onPress: async () => {
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
              await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "分享课表截图" });
            } else {
              Alert.alert("提示", "当前设备不支持分享");
            }
          },
        },
        { text: "取消", style: "cancel" },
      ]);
    } catch {
      Alert.alert("导出失败", "截图失败，请重试");
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Course press ───────────────────────────────────────────────────────────
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

          {/* ── Fixed header */}
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
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
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
                  width: 44, height: 44, borderRadius: 10,
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

              {/* Refresh button */}
              <TouchableOpacity
                onPress={handleRefresh}
                disabled={isRefreshing}
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: isRefreshing ? colors.surface : colors.primary,
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
              </TouchableOpacity>
            </View>

            {/* Semester dropdown */}
            {showSemesterPicker && (
              <View style={{
                backgroundColor: colors.background, borderRadius: 10,
                overflow: "hidden", borderWidth: 0.5, borderColor: colors.border,
              }}>
                {semesters.map((s, i) => {
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
                        color: isActive ? colors.primary : colors.foreground,
                      }}>
                        {s.label}
                      </Text>
                      {isActive && <Text style={{ fontSize: 14, color: colors.primary }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Row 2: view toggle + filter pills */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                flexDirection: "row",
                backgroundColor: colors.background,
                borderRadius: 8, borderWidth: 0.5, borderColor: colors.border,
                overflow: "hidden",
              }}>
                {(["grid", "list"] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setViewMode(m)}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 8,
                      backgroundColor: viewMode === m ? colors.primary : "transparent",
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
                        flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                        backgroundColor: isActive ? colors.primary : colors.background,
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
          {state.isLoading || !selectedSemester  ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 14, color: colors.muted }}>加载课表中...</Text>
            </View>
          ) : filteredCourses.length === 0 ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: colors.muted }}>当前筛选条件下没有课程</Text>
            </View>
          ) : (
            <View
              ref={captureViewRef}
              collapsable={false}
              style={{ flex: 1, backgroundColor: colors.surface }}
              onLayout={e => setTableAvailableH(e.nativeEvent.layout.height)}
            >
              {viewMode === "grid" ? (
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                  <ScheduleTable
                    courses={filteredCourses}
                    onCoursePress={handleCoursePress}
                    onMultipleCoursesPress={handleMultipleCoursesPress}
                    mode="grid"
                    availableHeight={tableAvailableH}
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