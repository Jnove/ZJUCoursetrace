import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import CourseDetailContent from "@/app/courseDetailContent"; // 导入共享组件

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
        <View className="px-4">
          <CourseDetailContent
            courseName={courseName}
            teacher={teacher}
            classroom={classroom}
            weekType={weekType}
            examInfo={examInfo}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}