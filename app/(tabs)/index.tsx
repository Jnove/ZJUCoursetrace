import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Pressable } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScheduleTable } from "@/components/schedule-table";
import { useSchedule, Course } from "@/lib/schedule-context";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { cn } from "@/lib/utils";

export default function HomeScreen() {
  const { state: scheduleState, getCoursesForWeek, setCurrentWeek } = useSchedule();
  const { state: authState, signOut } = useAuth();
  const router = useRouter();
  const [selectedWeek, setSelectedWeek] = useState(1);

  const coursesThisWeek = getCoursesForWeek(selectedWeek);

  const handleWeekChange = (direction: "prev" | "next") => {
    const newWeek = direction === "prev" ? selectedWeek - 1 : selectedWeek + 1;
    if (newWeek >= 1 && newWeek <= 20) {
      setSelectedWeek(newWeek);
      setCurrentWeek(newWeek);
    }
  };

  const handleCoursePress = (course: Course) => {
    router.push(`/course-detail?id=${course.id}`);
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <ScreenContainer className="p-0">
      {/* 顶部导航栏 */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
        <View>
          <Text className="text-foreground font-bold text-lg">我的课表</Text>
          <Text className="text-muted text-xs mt-1">{authState.username}</Text>
        </View>
        <Pressable
          onPress={handleLogout}
          className="w-10 h-10 rounded-full bg-surface justify-center items-center"
        >
          {({ pressed }) => (
            <MaterialIcons
              name="logout"
              size={20}
              color={pressed ? "#0a7ea4" : "#687076"}
            />
          )}
        </Pressable>
      </View>

      {/* 周次选择器 */}
      <View className="px-6 py-4 border-b border-border bg-surface">
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={() => handleWeekChange("prev")}
            disabled={selectedWeek <= 1}
            className={cn(
              "w-10 h-10 rounded-full justify-center items-center",
              selectedWeek <= 1 ? "bg-border/50" : "bg-primary/10"
            )}
          >
            <MaterialIcons
              name="chevron-left"
              size={24}
              color={selectedWeek <= 1 ? "#9BA1A6" : "#0a7ea4"}
            />
          </Pressable>

          <View className="flex-1 items-center">
            <Text className="text-foreground font-bold text-lg">第 {selectedWeek} 周</Text>
            <Text className="text-muted text-xs mt-1">{coursesThisWeek.length} 门课程</Text>
          </View>

          <Pressable
            onPress={() => handleWeekChange("next")}
            disabled={selectedWeek >= 20}
            className={cn(
              "w-10 h-10 rounded-full justify-center items-center",
              selectedWeek >= 20 ? "bg-border/50" : "bg-primary/10"
            )}
          >
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={selectedWeek >= 20 ? "#9BA1A6" : "#0a7ea4"}
            />
          </Pressable>
        </View>
      </View>

      {/* 课表内容 */}
      <View className="flex-1">
        {scheduleState.isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#0a7ea4" />
            <Text className="text-muted mt-4">加载课表中...</Text>
          </View>
        ) : scheduleState.error ? (
          <View className="flex-1 justify-center items-center px-6">
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
            <Text className="text-foreground text-lg font-semibold mt-4 text-center">
              加载失败
            </Text>
            <Text className="text-muted text-center mt-2">{scheduleState.error}</Text>
          </View>
        ) : coursesThisWeek.length === 0 ? (
          <View className="flex-1 justify-center items-center px-6">
            <MaterialIcons name="event-busy" size={48} color="#9BA1A6" />
            <Text className="text-foreground text-lg font-semibold mt-4">这周没有课程</Text>
            <Text className="text-muted text-center mt-2">享受你的假期吧！</Text>
          </View>
        ) : (
          <ScheduleTable courses={coursesThisWeek} onCoursePress={handleCoursePress} />
        )}
      </View>
    </ScreenContainer>
  );
}
