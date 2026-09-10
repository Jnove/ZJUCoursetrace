import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { useTheme, FONT_FAMILY_META } from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface CourseDetailContentProps {
  courseName: string;
  teacher: string;
  classroom: string;
  weekType: string; // 期望 "single", "double" 或其他（例如空字符串表示单双周）
  examInfo?: string;
  onOpenCourseware?: () => void;
}

export default function CourseDetailContent({
  courseName,
  teacher,
  classroom,
  weekType,
  examInfo,
  onOpenCourseware,
}: CourseDetailContentProps) {
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  const colors = useColors();

  return (
    <View className="gap-4">
      {/* 课程名称 */}
      <View className="bg-surface rounded-lg p-6 gap-2">
        <Text className="text-xs text-muted " style={{ fontFamily: ff}}>课程名称</Text>
        <Text className="text-2xl font-bold text-foreground" style={{ fontFamily: ff}}>{courseName}</Text>
      </View>

      {/* 基本信息 */}
      <View className="bg-surface rounded-lg p-6 gap-4">
        {/* 教师 */}
        <View className="gap-2">
          <Text className="text-xs text-muted " style={{ fontFamily: ff}}>授课教师</Text>
          <Text className="text-base text-foreground" style={{ fontFamily: ff}}>{teacher}</Text>
        </View>

        {/* 教室 */}
        <View className="gap-2 border-t border-border pt-4">
          <Text className="text-xs text-muted " style={{ fontFamily: ff}}>上课地点</Text>
          <Text className="text-base text-foreground" style={{ fontFamily: ff}}>{classroom}</Text>
        </View>

        {/* 周次类型 */}
        {/* <View className="gap-2 border-t border-border pt-4">
          <Text className="text-xs text-muted font-semibold">周次类型</Text>
          <View className="flex-row items-center gap-2">
            <View className={cn("px-3 py-1 rounded-full", weekTypeStyles.container)}>
              <Text className={cn("text-sm font-semibold", weekTypeStyles.text)}>
                {getWeekTypeDisplay()}
              </Text>
            </View>
          </View>
        </View> */}
      </View>

      {/* 课件入口 */}
      {onOpenCourseware && Platform.OS !== "web" && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenCourseware}
          className="bg-surface rounded-lg p-6 flex-row items-center justify-between"
        >
          <View className="flex-row items-center gap-3">
            <IconSymbol name="list.bullet" size={20} color={colors.primary} />
            <Text className="text-base text-foreground" style={{ fontFamily: ff }}>
              课件
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}

      {/* 考试信息 */}
      {examInfo && (
        <View className="bg-surface border border-orange-400 rounded-lg p-6 gap-2">
          <Text className="text-sm text-muted " style={{ fontFamily: ff}}>考试信息</Text>
          <Text className="text-base text-foreground" style={{ fontFamily: ff}}>{examInfo}</Text>
        </View>
      )}
    </View>
  );
}