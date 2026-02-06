import React from "react";
import { View, Text, ScrollView, Pressable, Dimensions } from "react-native";
import { Course } from "@/lib/schedule-context";
import { cn } from "@/lib/utils";

const PERIODS = [
  { number: 1, startTime: "08:00" },
  { number: 2, startTime: "08:50" },
  { number: 3, startTime: "10:00" },
  { number: 4, startTime: "10:50" },
  { number: 5, startTime: "11:40" },
  { number: 6, startTime: "13:25" },
  { number: 7, startTime: "14:15" },
  { number: 8, startTime: "15:05" },
  { number: 9, startTime: "16:15" },
  { number: 10, startTime: "17:05" },
  { number: 11, startTime: "18:50" },
  { number: 12, startTime: "19:40" },
  { number: 13, startTime: "20:30" },
];

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface ScheduleTableProps {
  courses: Course[];
  onCoursePress?: (course: Course) => void;
}

export function ScheduleTable({ courses, onCoursePress }: ScheduleTableProps) {
  const screenWidth = Dimensions.get("window").width;
  const cellWidth = (screenWidth - 80) / 7; // 7 days, minus padding and time column

  // 构建课程网格
  const getCourseAtSlot = (dayOfWeek: number, period: number): Course | undefined => {
    return courses.find(
      (course) =>
        course.dayOfWeek === dayOfWeek &&
        course.startPeriod <= period &&
        period <= course.endPeriod
    );
  };

  const isFirstPeriodOfCourse = (course: Course, period: number): boolean => {
    return course.startPeriod === period;
  };

  const getCourseSpan = (course: Course): number => {
    return course.endPeriod - course.startPeriod + 1;
  };

  // Get week type indicator
  const getWeekTypeLabel = (isSingleWeek?: string): string => {
    if (isSingleWeek === "single") return "单";
    if (isSingleWeek === "double") return "双";
    return "";
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="flex-1"
      contentContainerStyle={{ paddingRight: 16 }}
    >
      <View className="flex-row">
        {/* 时间列 */}
        <View className="w-16 pr-2">
          {/* 标题占位符 */}
          <View className="h-12" />

          {/* 时间段 */}
          {PERIODS.map((period) => (
            <View key={period.number} className="h-20 justify-center items-center border-b border-border">
              <Text className="text-xs text-muted font-semibold text-center">
                {period.startTime}
              </Text>
            </View>
          ))}
        </View>

        {/* 课程网格 */}
        {DAYS.map((day, dayIndex) => {
          const dayOfWeek = dayIndex + 1; // 1-7
          const renderedPeriods = new Set<number>();

          return (
            <View key={dayIndex} style={{ width: cellWidth }} className="border-l border-border">
              {/* 日期标题 */}
              <View className="h-12 justify-center items-center border-b border-border bg-surface">
                <Text className="text-xs font-bold text-foreground">{day}</Text>
              </View>

              {/* 课程单元格 */}
              {PERIODS.map((period) => {
                if (renderedPeriods.has(period.number)) {
                  return null; // 已被跨行课程占用
                }

                const course = getCourseAtSlot(dayOfWeek, period.number);

                if (course && isFirstPeriodOfCourse(course, period.number)) {
                  const span = getCourseSpan(course);
                  renderedPeriods.add(period.number);
                  for (let i = 1; i < span; i++) {
                    renderedPeriods.add(period.number + i);
                  }

                  const weekTypeLabel = getWeekTypeLabel(course.isSingleWeek);

                  return (
                    <Pressable
                      key={`${dayIndex}-${period.number}`}
                      onPress={() => onCoursePress?.(course)}
                      style={{ height: 80 * span }}
                      className="border-b border-border justify-center items-center p-1"
                    >
                      {({ pressed }) => (
                        <View
                          className={cn(
                            "flex-1 w-full rounded-lg p-2 justify-center items-center",
                            pressed ? "opacity-80" : "opacity-100"
                          )}
                          style={{
                            backgroundColor: course.color + "20", // 20% opacity
                            borderLeftWidth: 3,
                            borderLeftColor: course.color,
                          }}
                        >
                          <Text
                            className="text-sm font-bold text-foreground text-center"
                            numberOfLines={2}
                          >
                            {course.name}
                          </Text>
                          <Text className="text-xs text-muted mt-1 text-center" numberOfLines={1}>
                            {course.classroom}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                }

                if (!course) {
                  return (
                    <View
                      key={`${dayIndex}-${period.number}`}
                      className="h-20 border-b border-border bg-background"
                    />
                  );
                }

                return null;
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
