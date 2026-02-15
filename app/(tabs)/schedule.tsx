import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Modal} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ScheduleTable } from "@/components/schedule-table";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/constants/oauth";
import CourseDetailContent from "@/app/courseDetailContent";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SFSymbol } from "expo-symbols";
import { SFSymbols7_0 } from "sf-symbols-typescript";

interface SemesterOption {
  year: string;
  term: string;
  label: string;
}

export default function ScheduleScreen() {
  const { state, setCurrentWeek, getCoursesForWeek, fetchScheduleBySemester } = useSchedule();
  //const router = useRouter();
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // 加载学期列表
  useEffect(() => {
    const loadInitialData = async () => {
      const username = await AsyncStorage.getItem("username");
      if (username) {
        // 尝试从缓存加载活跃学期列表
        try {
          const cachedActiveSemesters = await AsyncStorage.getItem(`activeSemesters_${username}`);
          if (cachedActiveSemesters) {
            setSemesters(JSON.parse(cachedActiveSemesters));
            console.log("[ScheduleScreen] 从缓存加载活跃学期列表");
          }
        } catch (e) {
          console.warn("[ScheduleScreen] 从缓存加载活跃学期列表失败", e);
        }

        // 尝试从缓存加载上次选择的学期
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
      fetchSemesters(); // 无论是否从缓存加载，都尝试从 API 获取最新数据
    };
    loadInitialData();
  }, []);

  const fetchSemesters = async () => {
    try {
      setLoadingSemesters(true);
      const apiBaseUrl = getApiBaseUrl();
      
      // 1. 先获取基础学期选项，用于默认选择当前学期
      const response = await fetch(`${apiBaseUrl}/api/schedule/semester-options`);
      const data = await response.json();

      if (data.success) {
        const currentYear = data.current_year;
        const currentTerm = data.current_term;
        
        if (currentYear && currentTerm) {
          // 如果没有从缓存加载 selectedSemester，则设置为当前学期
          if (!selectedSemester) {
            setSelectedSemester(`${currentYear}-${currentTerm}`);
            console.log(`[ScheduleScreen] 设置默认当前学期: ${currentYear}-${currentTerm}`);
          }
          // 如果 semesters 为空，则初始显示当前学期
          if (semesters.length === 0) {
            setSemesters([{
              year: currentYear,
              term: currentTerm,
              label: `${currentYear} 第${currentTerm}学期`
            }]);
          }
        }

        // 2. 后台异步获取所有“有课”的学期，并更新缓存
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
      // 从 AsyncStorage 获取用户名
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

  const coursesForWeek = getCoursesForWeek(state.currentWeek);

  const handleSemesterChange = async (year: string, term: string) => {
    setSelectedSemester(`${year}-${term}`);
    setShowSemesterPicker(false);
    
    // 保存当前选中的学期到 AsyncStorage
    const username = await AsyncStorage.getItem("username");
    if (username) {
      await AsyncStorage.setItem(`lastSelectedSemester_${username}`, `${year}-${term}`);
      console.log(`[ScheduleScreen] 保存 lastSelectedSemester: ${year}-${term}`);
    }

    // 调用 context 中的方法来获取新学期的课表
    await fetchScheduleBySemester(year, term);
  };

  const handlePrevWeek = () => {
    if (state.currentWeek > 1) {
      setCurrentWeek(state.currentWeek - 1);
    }
  };

  const handleNextWeek = () => {
    if (state.currentWeek < 20) {
      setCurrentWeek(state.currentWeek + 1);
    }
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

      // 逐个刷新每个学期（串行执行）
      for (const semester of semesters) {
        const semesterParam = `${semester.year}_${semester.term}`; // 转换为 year_term 格式
        console.log(`[Frontend] Refreshing semester: ${semesterParam}`);

        try {
          const response = await fetch(`${apiBaseUrl}/api/schedule/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, semester: semesterParam }),
          });

          const result = await response.json();
          if (!result.success) {
            // 单个学期刷新失败，给出警告并继续下一个学期（可根据需求改为中断）
            Alert.alert("警告", `${semester.label} 刷新失败: ${result.error || "未知错误"}，继续刷新其他学期`);
          }
        } catch (err) {
          console.error(`刷新学期 ${semester.label} 失败:`, err);
          Alert.alert("警告", `${semester.label} 刷新失败，请稍后重试`);
          // 继续处理下一个学期，不中断
        }
      }

      // 所有学期刷新尝试结束后，重新获取当前选中学期的课表以更新界面
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

  // 关闭弹窗
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
          </View>

          {/* 周次选择器 */}
          <View className="px-4 py-4 gap-4">
            {/* 周次显示和导航 */}
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={handlePrevWeek}
                disabled={state.currentWeek === 1}
                className={cn(
                  "px-4 py-2 rounded-lg",
                  state.currentWeek === 1 ? "bg-surface opacity-50" : "bg-primary"
                )}
              >
                <Text className={cn("font-semibold", state.currentWeek === 1 ? "text-muted" : "text-white")}>
                  上一周
                </Text>
              </TouchableOpacity>

              <View className="items-center">
                <Text className="text-2xl font-bold text-foreground">第 {state.currentWeek} 周</Text>
                <Text className="text-xs text-muted mt-1">
                  {state.currentWeek % 2 === 1 ? "单周" : "双周"}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleNextWeek}
                disabled={state.currentWeek === 8}
                className={cn(
                  "px-4 py-2 rounded-lg",
                  state.currentWeek === 8 ? "bg-surface opacity-50" : "bg-primary"
                )}
              >
                <Text className={cn("font-semibold", state.currentWeek === 8 ? "text-muted" : "text-white")}>
                  下一周
                </Text>
              </TouchableOpacity>
            </View>


          </View>
            <View className="items-center gap-2 mt-4">
            <Text className="text-sm text-muted text-center">
              点击课程块可查看详细信息
            </Text>
          </View>
          {/* 课表 */}
          <View className="flex-1 px-4 pb-4">
            {coursesForWeek.length === 0 ? (
              <View className="h-96 justify-center items-center">
                <Text className="text-muted text-center">
                  本周没有课程
                </Text>
              </View>
            ) : (
              <ScheduleTable courses={coursesForWeek} onCoursePress={handleCoursePress} />
            )}
            </View>
            
          <View className="items-center gap-2 mt-4">
            <Text className="text-xs text-muted text-center">
              本课表调休和节假日信息仅供参考，具体以学校通知为准。部分单、双周课程具体情况请依据教学班通知。
            </Text>
          </View>
        </ScrollView>
      )}

      {/* 课程详情弹窗 */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        {/* 半透明背景遮罩，点击关闭 */}
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={closeModal}
        >
          {/* 弹窗内容容器，阻止点击事件冒泡到遮罩 */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] max-w-md bg-surface rounded-xl p-5"
          >
            {/* 关闭按钮 */}
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
                    : "" // 单双周
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

// 辅助组件：信息行（可根据需要提取到单独文件）
function InfoRow({ icon, label, value }: { icon: SFSymbols7_0; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3">
      {/* 这里需要根据你的 IconSymbol 组件调整 */}
      <IconSymbol name={icon} size={20} color="#888" />
      <Text className="text-foreground font-medium">{label}:</Text>
      <Text className="text-foreground flex-1">{value}</Text>
    </View>
  );
}