import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ScheduleTable } from "@/components/schedule-table";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/constants/oauth";

interface SemesterOption {
  year: string;
  term: string;
  label: string;
}

export default function ScheduleScreen() {
  const { state, setCurrentWeek, getCoursesForWeek, fetchScheduleBySemester } = useSchedule();
  const router = useRouter();
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 加载学期列表
  useEffect(() => {
    fetchSemesters();
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
          setSelectedSemester(`${currentYear}-${currentTerm}`);
          // 初始显示当前学期
          setSemesters([{
            year: currentYear,
            term: currentTerm,
            label: `${currentYear} 第${currentTerm}学期`
          }]);
        }

        // 2. 后台异步获取所有“有课”的学期
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
        console.log(`✅ 获取到 ${data.semesters.length} 个有课学期`);
      }
    } catch (err) {
      console.error("后台获取活跃学期失败:", err);
    }
  };

  const coursesForWeek = getCoursesForWeek(state.currentWeek);

  const handleSemesterChange = async (year: string, term: string) => {
    setSelectedSemester(`${year}-${term}`);
    setShowSemesterPicker(false);
    
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

      // 调用刷新 API
      const response = await fetch(`${apiBaseUrl}/api/schedule/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      const result = await response.json();

      if (result.success) {
        // 重新获取当前学期的课表
        if (selectedSemester) {
          const [year, term] = selectedSemester.split("-");
          await fetchScheduleBySemester(year, term);
        }
        Alert.alert("成功", "课表已刷新");
      } else {
        Alert.alert("错误", result.error || "刷新失败");
      }
    } catch (error) {
      console.error("刷新课表失败:", error);
      Alert.alert("错误", "刷新课表失败，请稍后重试");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCoursePress = (course: any) => {
    router.push({
      pathname: "/course-detail",
      params: {
        courseId: course.id,
        courseName: course.name,
        teacher: course.teacher,
        classroom: course.classroom,
        weekType: course.isSingleWeek,
        examInfo: course.examInfo || "",
      },
    });
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
                  <Text className="text-white font-semibold">🔄</Text>
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
                disabled={state.currentWeek === 20}
                className={cn(
                  "px-4 py-2 rounded-lg",
                  state.currentWeek === 20 ? "bg-surface opacity-50" : "bg-primary"
                )}
              >
                <Text className={cn("font-semibold", state.currentWeek === 20 ? "text-muted" : "text-white")}>
                  下一周
                </Text>
              </TouchableOpacity>
            </View>


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
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
