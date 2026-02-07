import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
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
  const { state, setCurrentWeek, setWeekType, getCoursesForWeek, fetchScheduleBySemester } = useSchedule();
  const router = useRouter();
  const [selectedWeekType, setSelectedWeekType] = useState<"all" | "single" | "double">("all");
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);

  // 加载学期列表
  useEffect(() => {
    fetchSemesters();
  }, []);

  const fetchSemesters = async () => {
    try {
      setLoadingSemesters(true);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/schedule/semester-options`);
      const data = await response.json();

      if (data.success) {
        // 将后端返回的 year_options 和 term_options 组合成前端需要的格式
        // 注意：ZJU 的学期通常是 1, 2, 3, 4 (春夏秋冬) 或者 1, 2 (秋冬, 春夏)
        // 这里我们简单地取当前的学年，并展示所有学期选项，或者根据需要生成组合
        const options: SemesterOption[] = [];
        
        // 通常用户最关心的是当前学年及前后的学期
        // 为了简化，我们将所有学年和学期的组合展示出来，或者只展示当前学年的学期
        // 这里我们按照常见的逻辑：展示当前学年和上一学年的所有学期组合
        const years = data.year_options.slice(0, 2); // 取最近两个学年
        const terms = data.term_options;

        years.forEach((y: any) => {
          terms.forEach((t: any) => {
            options.push({
              year: y.text,
              term: t.text,
              label: `${y.text} 第${t.text}学期`
            });
          });
        });

        setSemesters(options);
        
        // 默认选择当前学期
        if (data.current_year && data.current_term) {
          setSelectedSemester(`${data.current_year}-${data.current_term}`);
        } else if (options.length > 0) {
          setSelectedSemester(`${options[0].year}-${options[0].term}`);
        }
      }
    } catch (err) {
      console.error("获取学期列表失败:", err);
    } finally {
      setLoadingSemesters(false);
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

  const handleWeekTypeChange = (type: "all" | "single" | "double") => {
    setSelectedWeekType(type);
    setWeekType(type);
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
          {/* 学期选择器 */}
          <View className="px-4 pt-4 pb-2">
            <TouchableOpacity
              onPress={() => setShowSemesterPicker(!showSemesterPicker)}
              className="bg-surface border border-border rounded-lg px-4 py-3 flex-row justify-between items-center"
            >
              <Text className="text-foreground font-semibold">
                {selectedSemester
                  ? semesters.find((s) => `${s.year}-${s.term}` === selectedSemester)?.label || "选择学期"
                  : "选择学期"}
              </Text>
              <Text className="text-muted">▼</Text>
            </TouchableOpacity>

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

            {/* 课程类型过滤 */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => handleWeekTypeChange("all")}
                className={cn(
                  "flex-1 py-2 rounded-lg items-center justify-center",
                  selectedWeekType === "all" ? "bg-primary" : "bg-surface border border-border"
                )}
              >
                <Text
                  className={cn(
                    "font-semibold text-sm",
                    selectedWeekType === "all" ? "text-white" : "text-foreground"
                  )}
                >
                  全部课程
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleWeekTypeChange("single")}
                className={cn(
                  "flex-1 py-2 rounded-lg items-center justify-center",
                  selectedWeekType === "single" ? "bg-primary" : "bg-surface border border-border"
                )}
              >
                <Text
                  className={cn(
                    "font-semibold text-sm",
                    selectedWeekType === "single" ? "text-white" : "text-foreground"
                  )}
                >
                  单周
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleWeekTypeChange("double")}
                className={cn(
                  "flex-1 py-2 rounded-lg items-center justify-center",
                  selectedWeekType === "double" ? "bg-primary" : "bg-surface border border-border"
                )}
              >
                <Text
                  className={cn(
                    "font-semibold text-sm",
                    selectedWeekType === "double" ? "text-white" : "text-foreground"
                  )}
                >
                  双周
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 课表 */}
          <View className="flex-1 px-4 pb-4">
            {coursesForWeek.length === 0 ? (
              <View className="h-96 justify-center items-center">
                <Text className="text-muted text-center">
                  {selectedWeekType === "single"
                    ? "本周是双周，没有单周课程"
                    : selectedWeekType === "double"
                      ? "本周是单周，没有双周课程"
                      : "本周没有课程"}
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
