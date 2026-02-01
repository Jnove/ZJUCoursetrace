import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useSchedule, Course } from "@/lib/schedule-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function CourseDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { state } = useSchedule();

  const courseId = params.id as string;
  const course = state.courses.find((c) => c.id === courseId);

  if (!course) {
    return (
      <ScreenContainer className="justify-center items-center">
        <Text className="text-foreground text-lg">课程未找到</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6">
          <Text className="text-primary font-semibold">返回</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const dayName = DAYS[course.dayOfWeek - 1];
  const periodRange = `第${course.startPeriod}-${course.endPeriod}节`;
  const weekRange = `第${course.weekStart}-${course.weekEnd}周`;

  return (
    <ScreenContainer className="p-0">
      {/* 顶部导航栏 */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-2">
          <MaterialIcons name="chevron-left" size={24} color="#0a7ea4" />
          <Text className="text-primary font-semibold">返回</Text>
        </TouchableOpacity>
        <Text className="text-foreground font-bold text-lg">课程详情</Text>
        <View className="w-12" />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* 课程名称卡片 */}
        <View
          className="rounded-2xl p-6 mb-6"
          style={{ backgroundColor: course.color + "15", borderLeftWidth: 4, borderLeftColor: course.color }}
        >
          <Text className="text-3xl font-bold text-foreground">{course.name}</Text>
          <Text className="text-muted mt-2 text-base">课程代码: {course.id}</Text>
        </View>

        {/* 信息卡片 */}
        <View className="gap-4">
          {/* 教师信息 */}
          <View className="bg-surface rounded-xl p-4 flex-row items-center gap-4">
            <View className="w-12 h-12 rounded-full bg-primary/20 justify-center items-center">
              <MaterialIcons name="person" size={24} color="#0a7ea4" />
            </View>
            <View className="flex-1">
              <Text className="text-muted text-sm mb-1">授课教师</Text>
              <Text className="text-foreground font-semibold text-base">{course.teacher}</Text>
            </View>
          </View>

          {/* 教室信息 */}
          <View className="bg-surface rounded-xl p-4 flex-row items-center gap-4">
            <View className="w-12 h-12 rounded-full bg-primary/20 justify-center items-center">
              <MaterialIcons name="location-on" size={24} color="#0a7ea4" />
            </View>
            <View className="flex-1">
              <Text className="text-muted text-sm mb-1">教室位置</Text>
              <Text className="text-foreground font-semibold text-base">{course.classroom}</Text>
            </View>
          </View>

          {/* 上课时间 */}
          <View className="bg-surface rounded-xl p-4 flex-row items-center gap-4">
            <View className="w-12 h-12 rounded-full bg-primary/20 justify-center items-center">
              <MaterialIcons name="schedule" size={24} color="#0a7ea4" />
            </View>
            <View className="flex-1">
              <Text className="text-muted text-sm mb-1">上课时间</Text>
              <Text className="text-foreground font-semibold text-base">
                {dayName} {periodRange}
              </Text>
            </View>
          </View>

          {/* 上课周次 */}
          <View className="bg-surface rounded-xl p-4 flex-row items-center gap-4">
            <View className="w-12 h-12 rounded-full bg-primary/20 justify-center items-center">
              <MaterialIcons name="calendar-today" size={24} color="#0a7ea4" />
            </View>
            <View className="flex-1">
              <Text className="text-muted text-sm mb-1">上课周次</Text>
              <Text className="text-foreground font-semibold text-base">{weekRange}</Text>
            </View>
          </View>
        </View>

        {/* 操作按钮 */}
        <View className="gap-3 mt-8">
          <TouchableOpacity className="bg-primary rounded-lg py-4 items-center">
            <Text className="text-white font-semibold text-base">添加提醒</Text>
          </TouchableOpacity>
          <TouchableOpacity className="bg-surface border border-border rounded-lg py-4 items-center">
            <Text className="text-foreground font-semibold text-base">分享课程</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
