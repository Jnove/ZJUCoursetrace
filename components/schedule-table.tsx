import React from "react";
import { View, Text, ScrollView, Pressable, Dimensions } from "react-native";
import { Course } from "@/lib/schedule-context";
import { cn } from "@/lib/utils";

const PERIODS = [
  { number: 1, time: "08:30-09:15" },
  { number: 2, time: "09:25-10:10" },
  { number: 3, time: "10:20-11:05" },
  { number: 4, time: "11:15-12:00" },
  { number: 5, time: "13:00-13:45" },
  { number: 6, time: "13:55-14:40" },
  { number: 7, time: "14:50-15:35" },
  { number: 8, time: "15:45-16:30" },
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
                {period.number}
              </Text>
              <Text className="text-xs text-muted mt-1">{period.time}</Text>
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
                            className="text-xs font-bold text-foreground text-center"
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
