import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ScheduleTable } from "@/components/schedule-table";
import { useSchedule } from "@/lib/schedule-context";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/constants/oauth";
import CourseDetailContent from "@/app/courseDetailContent";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SFSymbols7_0 } from "sf-symbols-typescript";

interface SemesterOption {
  year: string;
  term: string;
  label: string;
}

export default function ScheduleScreen() {
  const { state, fetchScheduleBySemester } = useSchedule();
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'single' | 'double'>('all'); // 新增筛选状态

  // 轮询相关
  const pollingTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRY = 15;

  // 加载学期列表
  useEffect(() => {
    const loadInitialData = async () => {
      const username = await AsyncStorage.getItem("username");
      if (username) {
        try {
          const cachedActiveSemesters = await AsyncStorage.getItem(`activeSemesters_${username}`);
          if (cachedActiveSemesters) {
            setSemesters(JSON.parse(cachedActiveSemesters));
            console.log("[ScheduleScreen] 从缓存加载活跃学期列表");
          }
        } catch (e) {
          console.warn("[ScheduleScreen] 从缓存加载活跃学期列表失败", e);
        }

        try {
          const cachedSelectedSemester = await AsyncStorage.getItem(`lastSelectedSemester_${username}`);
          if (cachedSelectedSemester) {
            setSelectedSemester(cachedSelectedSemester);
            console.log(`[ScheduleScreen] 从缓存加载上次选择的学期: ${cachedSelectedSemester}`);
          }
        } catch (e) {
          console.warn("[ScheduleScreen] 从缓存加载上次选择的学期失败", e);
        }
      }
      fetchSemesters();
    };
    loadInitialData();
  }, []);

  // 轮询
  useEffect(() => {
    // 清理之前的定时器
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    // 重置重试计数（当 semesters 有数据或加载状态变化时，重置计数）
    if (semesters.length > 0 || loadingSemesters) {
      retryCountRef.current = 0;
    }
    if (semesters.length === 0 && !loadingSemesters && retryCountRef.current < MAX_RETRY) {
      pollingTimerRef.current = setInterval(() => {
        retryCountRef.current += 1;
        fetchActiveSemesters();
      }, 1000);
    }
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [semesters, loadingSemesters]);

  const fetchSemesters = async () => {
    try {
      setLoadingSemesters(true);
      const apiBaseUrl = getApiBaseUrl();

      const response = await fetch(`${apiBaseUrl}/api/schedule/semester-options`);
      const data = await response.json();

      if (data.success) {
        const currentYear = data.current_year;
        const currentTerm = data.current_term;

        if (currentYear && currentTerm) {
          if (!selectedSemester) {
            setSelectedSemester(`${currentYear}-${currentTerm}`);
            console.log(`[ScheduleScreen] 设置默认当前学期: ${currentYear}-${currentTerm}`);
          }
          if (semesters.length === 0) {
            setSemesters([{
              year: currentYear,
              term: currentTerm,
              label: `${currentYear} ${currentTerm}学期`
            }]);
          }
        }
        fetchActiveSemesters();
      }
    } catch (err) {
      console.error("获取学期列表失败:", err);
    } finally {
      setLoadingSemesters(false);
    }
  };

  const fetchActiveSemesters = async () => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const username = await AsyncStorage.getItem("username");
      if (!username) {
        console.error("未找到用户名，无法获取有课学期列表");
        return;
      }

      const response = await fetch(`${apiBaseUrl}/api/schedule/active-semesters?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (data.success && data.semesters) {
        setSemesters(data.semesters);
        await AsyncStorage.setItem(`activeSemesters_${username}`, JSON.stringify(data.semesters));
        console.log(`✅ 获取到 ${data.semesters.length} 个有课学期并已缓存`);
      }
    } catch (err) {
      console.error("后台获取活跃学期失败:", err);
    }
  };

  // 根据筛选类型过滤课程
  const filteredCourses = (state.courses || []).filter(course => {
    if (filterType === 'all') return true;
    if (filterType === 'single') return course.isSingleWeek !== 'double';
    if (filterType === 'double') return course.isSingleWeek !== 'single';
    return true;
  });

  const handleSemesterChange = async (year: string, term: string) => {
    setSelectedSemester(`${year}-${term}`);
    setShowSemesterPicker(false);

    const username = await AsyncStorage.getItem("username");
    if (username) {
      await AsyncStorage.setItem(`lastSelectedSemester_${username}`, `${year}-${term}`);
      console.log(`[ScheduleScreen] 保存 lastSelectedSemester: ${year}-${term}`);
    }

    await fetchScheduleBySemester(year, term);
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const apiBaseUrl = getApiBaseUrl();
      const username = await AsyncStorage.getItem("username");

      if (!username) {
        Alert.alert("错误", "未找到用户信息，请重新登录");
        return;
      }

      if (semesters.length === 0) {
        Alert.alert("提示", "没有可刷新的学期");
        return;
      }

      for (const semester of semesters) {
        const semesterParam = `${semester.year}_${semester.term}`;
        console.log(`[Frontend] Refreshing semester: ${semesterParam}`);

        try {
          const response = await fetch(`${apiBaseUrl}/api/schedule/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, semester: semesterParam }),
          });

          const result = await response.json();
          if (!result.success) {
            Alert.alert("警告", `${semester.label} 刷新失败: ${result.error || "未知错误"}，继续刷新其他学期`);
          }
        } catch (err) {
          console.error(`刷新学期 ${semester.label} 失败:`, err);
          Alert.alert("警告", `${semester.label} 刷新失败，请稍后重试`);
        }
      }

      if (selectedSemester) {
        const [year, term] = selectedSemester.split("-");
        await fetchScheduleBySemester(year, term);
      }

      Alert.alert("完成", "所有学期刷新处理完成");
    } catch (error: any) {
      console.error("刷新课表失败:", error);
      Alert.alert("错误", error.message || "刷新课表失败，请稍后重试");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCoursePress = (course: any) => {
    setSelectedCourse(course);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedCourse(null);
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      {state.isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#0a7ea4" />
          <Text className="mt-4 text-muted">加载课表中...</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* 学期选择器和刷新按钮 */}
          <View className="px-4 pt-4 pb-2">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setShowSemesterPicker(!showSemesterPicker)}
                className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 flex-row justify-between items-center"
              >
                <Text className="text-foreground font-semibold">
                  {selectedSemester
                    ? semesters.find((s) => `${s.year}-${s.term}` === selectedSemester)?.label || "选择学期"
                    : "选择学期"}
                </Text>
                <Text className="text-muted">▼</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  "bg-primary rounded-lg px-4 py-3 justify-center items-center",
                  isRefreshing && "opacity-50"
                )}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Image
                    source={require("@/assets/images/refresh-icon.png")}
                    style={{ width: 20, height: 20, tintColor: "white" }}
                  />
                )}
              </TouchableOpacity>
            </View>

            {showSemesterPicker && (
              <View className="bg-surface border border-border rounded-lg mt-2 overflow-hidden">
                {semesters.map((semester, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleSemesterChange(semester.year, semester.term)}
                    className={cn(
                      "px-4 py-3 border-b border-border",
                      selectedSemester === `${semester.year}-${semester.term}` ? "bg-primary/10" : ""
                    )}
                  >
                    <Text
                      className={cn(
                        "font-semibold",
                        selectedSemester === `${semester.year}-${semester.term}`
                          ? "text-primary"
                          : "text-foreground"
                      )}
                    >
                      {semester.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
              
            {/* 视图切换按钮 */}
            <View className="flex-row gap-2 items-center justify-center mt-2">
              <TouchableOpacity
                onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="bg-surface border border-border rounded-lg px-4 py-3 flex-row items-center gap-2 justify-center"
              >
                <IconSymbol
                  name={viewMode === 'grid' ? 'list.bullet' : 'square.grid.2x2'}
                  size={20}
                  color="#888"
                />
                <Text className="text-foreground">
                  {viewMode === 'grid' ? '点击切换列表模式' : '点击切换网格模式'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* 单双周筛选按钮 */}
            <View className="flex-row gap-2 mt-2">
              {[
                { label: '全部', value: 'all' },
                { label: '单周', value: 'single' },
                { label: '双周', value: 'double' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setFilterType(option.value as typeof filterType)}
                  className={cn(
                    "flex-1 py-2 rounded-lg items-center",
                    filterType === option.value
                      ? "bg-primary"
                      : "bg-surface border border-border"
                  )}
                >
                  <Text
                    className={cn(
                      "font-medium",
                      filterType === option.value ? "text-white" : "text-foreground"
                    )}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
          </View>


          {filteredCourses.length > 0 && (
            <View className="items-center gap-2 mt-4">
              <Text className="text-sm text-muted text-center">
                点击课程块可查看详细信息
              </Text>
            </View>
          )}

          {/* 课表 */}
          <View className="flex-1 px-4 pb-4">
            {filteredCourses.length === 0 ? (
              <View className="h-96 justify-center items-center">
                <Text className="text-muted text-center">
                  当前筛选条件下没有课程
                </Text>
              </View>
            ) : (
              <ScheduleTable
                courses={filteredCourses}
                onCoursePress={handleCoursePress}
                mode={viewMode}
              />
            )}
          </View>

          <View className="items-center mt-4">
            <Text className="text-xs text-muted text-center">
              本课表调休和节假日信息仅供参考，具体以学校通知为准。
            </Text>
            <Text className="text-xs text-muted text-center">
              部分单、双周课程具体情况请依据教学班通知。
            </Text>
          </View>
        </ScrollView>
      )}

      {/* 课程详情弹窗（保持不变） */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={closeModal}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="w-[60%] max-w-md bg-surface rounded-xl p-5"
          >
            <View className="flex-row justify-end mb-2">
              <TouchableOpacity onPress={closeModal} className="p-2">
                <Text className="text-muted text-lg">✕</Text>
              </TouchableOpacity>
            </View>

            {selectedCourse && (
              <CourseDetailContent
                courseName={selectedCourse.name}
                teacher={selectedCourse.teacher}
                classroom={selectedCourse.classroom}
                weekType={
                  selectedCourse.isSingleWeek === 1
                    ? "single"
                    : selectedCourse.isSingleWeek === 2
                    ? "double"
                    : ""
                }
                examInfo={selectedCourse.examInfo}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}