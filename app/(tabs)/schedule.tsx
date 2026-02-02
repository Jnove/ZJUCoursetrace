import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScheduleTable } from "@/components/schedule-table";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { cn } from "@/lib/utils";

export default function ScheduleScreen() {
  const { state, setCurrentWeek, setWeekType, getCoursesForWeek } = useSchedule();
  const router = useRouter();
  const [selectedWeekType, setSelectedWeekType] = useState<"all" | "single" | "double">("all");

  const coursesForWeek = getCoursesForWeek(state.currentWeek);

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
