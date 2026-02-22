import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Dimensions, TouchableOpacity, Platform } from "react-native";
import { Course } from "@/lib/schedule-context";
import { cn } from "@/lib/utils";

const PERIODS = [
  { number: 1, startTime: "08:00", endTime: "08:45" },
  { number: 2, startTime: "08:50", endTime: "09:35" },
  { number: 3, startTime: "10:00", endTime: "10:45" },
  { number: 4, startTime: "10:50", endTime: "11:35" },
  { number: 5, startTime: "11:40", endTime: "12:25" },
  { number: 6, startTime: "13:25", endTime: "14:10" },
  { number: 7, startTime: "14:15", endTime: "15:00" },
  { number: 8, startTime: "15:05", endTime: "15:50" },
  { number: 9, startTime: "16:15", endTime: "17:00" },
  { number: 10, startTime: "17:05", endTime: "17:50" },
  { number: 11, startTime: "18:50", endTime: "19:35" },
  { number: 12, startTime: "19:40", endTime: "20:25" },
  { number: 13, startTime: "20:30", endTime: "21:15" },
];
const periodMap = new Map(
  PERIODS.map(p => [p.number, { startTime: p.startTime, endTime: p.endTime }])
);
const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface ScheduleTableProps {
  courses: Course[];
  onCoursePress?: (course: Course) => void;
  mode?: 'grid' | 'list';           // 新增模式属性
  onDayChange?: (dayIndex: number) => void; // 可选：当列表模式下切换日期时通知父组件
}

function addAlpha(hex: string | number, alpha = 0.2): string {
  if (typeof hex !== 'string') hex = String(hex);
  let clean: string = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length === 8) {
    clean = clean.slice(0, 6);
  }
  while (clean.length < 6) clean += '0';
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `#${clean}${alphaHex}`;
}

export function ScheduleTable({ courses, onCoursePress, mode = 'grid', onDayChange }: ScheduleTableProps) {
  const screenWidth = Dimensions.get("window").width;
  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
  const cellWidth = (screenWidth - 80) / 7; // 仅用于网格模式

  // 列表模式下内部选中日期状态
  const [selectedDay, setSelectedDay] = useState<number>(1); // 默认周一

  const handleDayPress = (day: number) => {
    setSelectedDay(day);
    onDayChange?.(day);
  };

  // 过滤出当天的课程并按开始节次排序
  const filteredCourses = mode === 'list'
    ? courses
        .filter(c => c.dayOfWeek === selectedDay)
        .sort((a, b) => a.startPeriod - b.startPeriod)
    : [];

  // 网格模式原有逻辑：构建课程网格
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

  const getWeekTypeLabel = (isSingleWeek?: string): string => {
    if (isSingleWeek === "single") return "单";
    if (isSingleWeek === "double") return "双";
    return "";
  };

  // 网格模式渲染
  const renderGridMode = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="flex-1"
      contentContainerStyle={{ paddingRight: 20 }}
    >
      <View className="flex-row">
        {/* 时间列 */}
        <View className="w-9 pr-2">
          <View className="h-12" />
          {PERIODS.map((period) => (
            <View key={period.number} style={{ width: cellWidth / 1.44 }} className="h-20 justify-center items-center border-b border-border">
              <Text className="text-xs text-muted font-semibold text-center">
                {period.startTime}
              </Text>
            </View>
          ))}
        </View>

        {/* 课程网格 */}
        {DAYS.map((day, dayIndex) => {
          const dayOfWeek = dayIndex + 1;
          const renderedPeriods = new Set<number>();

          return (
            <View key={dayIndex} style={{ width: cellWidth*1.05 }} className="border-l border-border">
              <View className="h-12 justify-center items-center border-b border-border bg-surface">
                <Text className="text-xs font-bold text-foreground">{day}</Text>
              </View>

              {PERIODS.map((period) => {
                if (renderedPeriods.has(period.number)) return null;

                const course = getCourseAtSlot(dayOfWeek, period.number);

                if (course && isFirstPeriodOfCourse(course, period.number)) {
                  const span = getCourseSpan(course);
                  renderedPeriods.add(period.number);
                  for (let i = 1; i < span; i++) {
                    renderedPeriods.add(period.number + i);
                  }
                  const line = span > 1 ? 3 : 2;
                  const size = span > 1 ? 10 : 8;
                  return (
                    <Pressable
                      key={`${dayIndex}-${period.number}`}
                      onPress={() => onCoursePress?.(course)}
                      style={{ height: 70 * span }}
                      className="border-b border-border justify-center items-center p-0"
                    >
                      {({ pressed }) => (
                        <View
                          className={cn(
                            "flex-1 w-full rounded-lg p-10 justify-center items-center p-1",
                            pressed ? "opacity-80" : "opacity-100"
                          )}
                          style={{
                            backgroundColor: addAlpha(course.color, 0.2),
                            borderLeftWidth: 2.5,
                            borderLeftColor: course.color,
                          }}
                        >
                          <Text
                            className={cn(
                              isMobile ? "text-xs" : "text-base",
                              "font-bold text-foreground text-center leading-tight"
                            )}style={{ fontSize: 12 }}
                            numberOfLines={line}
                            
                          >
                            {course.name}
                          </Text>
                          <Text className="text-[9] text-muted mt-1 text-center" numberOfLines={4} style={{ flexShrink: 1, fontSize: size }}>
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

  // 列表模式渲染
  const renderListMode = () => (
    <View className="flex-1">
      {/* 星期选择器 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border">
        <View className="flex-row px-2 py-2">
          {DAYS.map((day, index) => {
            const dayNumber = index + 1;
            const isSelected = selectedDay === dayNumber;
            return (
              <TouchableOpacity
                key={day}
                onPress={() => handleDayPress(dayNumber)}
                className={cn(
                  "px-4 py-2 mx-1 rounded-full",
                  isSelected ? "bg-primary" : "bg-surface"
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-white" : "text-foreground"
                  )}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* 课程列表 */}
      <ScrollView className="flex-1 px-4 py-2">
        {filteredCourses.length === 0 ? (
          <Text className="text-center text-muted py-8">当天没有课程</Text>
        ) : (
          filteredCourses.map((course) => (
            <Pressable
              key={course.id}
              onPress={() => onCoursePress?.(course)}
              className="mb-3"
            >
              {({ pressed }) => (
                <View
                  className={cn(
                    "flex-row rounded-lg p-3",
                    pressed && "opacity-80"
                  )}
                  style={{
                    backgroundColor: addAlpha(course.color, 0.2),
                    borderLeftWidth: 4,
                    borderLeftColor: course.color,
                  }}
                >
                  <View className="flex-1">
                    <Text
                      className={cn(
                        isMobile ? "text-base" : "text-base",
                        "font-bold text-foreground"
                      )}
                    >
                      {course.name}
                    </Text>
                    <Text className="text-sm text-muted mt-1">
                      {course.teacher && `${course.teacher} · `}{course.classroom}
                    </Text>
                    <Text className="text-sm text-muted mt-1">
                      {periodMap.get(course.startPeriod)?.startTime}-{periodMap.get(course.endPeriod)?.endTime}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  return mode === 'grid' ? renderGridMode() : renderListMode();
}