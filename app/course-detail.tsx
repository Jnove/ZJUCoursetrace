import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { cn } from "@/lib/utils";

export default function CourseDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const courseName = params.courseName as string;
  const teacher = params.teacher as string;
  const classroom = params.classroom as string;
  const weekType = params.weekType as string;
  const examInfo = params.examInfo as string | undefined;

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {/* 返回按钮 */}
        <View className="px-4 py-4">
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-2">
            <Text className="text-primary text-base font-semibold">← 返回</Text>
          </TouchableOpacity>
        </View>

        {/* 课程信息卡片 */}
        <View className="px-4 gap-4">
          {/* 课程名称 */}
          <View className="bg-surface rounded-lg p-6 gap-2">
            <Text className="text-xs text-muted font-semibold">课程名称</Text>
            <Text className="text-2xl font-bold text-foreground">{courseName}</Text>
          </View>

          {/* 基本信息 */}
          <View className="bg-surface rounded-lg p-6 gap-4">
            {/* 教师 */}
            <View className="gap-2">
              <Text className="text-xs text-muted font-semibold">授课教师</Text>
              <Text className="text-base text-foreground">{teacher}</Text>
            </View>

            {/* 教室 */}
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-xs text-muted font-semibold">上课地点</Text>
              <Text className="text-base text-foreground">{classroom}</Text>
            </View>

            {/* 周次类型 */}
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-xs text-muted font-semibold">周次类型</Text>
              <View className="flex-row items-center gap-2">
                <View
                  className={cn(
                    "px-3 py-1 rounded-full",
                    weekType === "single"
                      ? "bg-primary/20"
                      : weekType === "double"
                        ? "bg-warning/20"
                        : "bg-success/20"
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm font-semibold",
                      weekType === "single"
                        ? "text-primary"
                        : weekType === "double"
                          ? "text-warning"
                          : "text-success"
                    )}
                  >
                    {weekType === "single" ? "单周" : weekType === "double" ? "双周" : "单双周"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 考试信息 */}
          {examInfo && (
            <View className="bg-neutral-100 border border-orange-400 rounded-lg p-6 gap-2">
              <Text className="text-sm text-muted font-semibold">📝考试信息</Text>
              <Text className="text-base text-foreground">{examInfo}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
