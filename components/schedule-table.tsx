import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, TouchableOpacity } from "react-native";
import { Course } from "@/lib/schedule-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useTheme } from "@/lib/theme-provider";

const HEADER_H = 38;
const TIME_COL_W = 34;

const PERIODS = [
  { number: 1,  startTime: "08:00", endTime: "08:45" },
  { number: 2,  startTime: "08:50", endTime: "09:35" },
  { number: 3,  startTime: "10:00", endTime: "10:45" },
  { number: 4,  startTime: "10:50", endTime: "11:35" },
  { number: 5,  startTime: "11:40", endTime: "12:25" },
  { number: 6,  startTime: "13:25", endTime: "14:10" },
  { number: 7,  startTime: "14:15", endTime: "15:00" },
  { number: 8,  startTime: "15:05", endTime: "15:50" },
  { number: 9,  startTime: "16:15", endTime: "17:00" },
  { number: 10, startTime: "17:05", endTime: "17:50" },
  { number: 11, startTime: "18:50", endTime: "19:35" },
  { number: 12, startTime: "19:40", endTime: "20:25" },
  { number: 13, startTime: "20:30", endTime: "21:15" },
];

const periodMap = new Map(PERIODS.map(p => [p.number, p]));
const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function addAlpha(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getWeekLabel(v?: string): string {
  if (v === "single") return "单";
  if (v === "double") return "双";
  return "";
}

interface ScheduleTableProps {
  courses: Course[];
  onCoursePress?: (course: Course) => void;
  onMultipleCoursesPress?: (courses: Course[]) => void;
  mode?: "grid" | "list";
  onDayChange?: (day: number) => void;
  availableHeight?: number;
}

export function ScheduleTable({
  courses,
  onCoursePress,
  onMultipleCoursesPress,
  mode = "grid",
  onDayChange,
  availableHeight = 0,
}: ScheduleTableProps) {
  const colors = useColors();
  const [selectedDay, setSelectedDay] = useState(1);
  const primaryColor = useTheme();
  const CELL_H = availableHeight > 200
    ? Math.max(44, Math.floor((availableHeight - HEADER_H) / PERIODS.length))
    : 52;
  const TOTAL_COL_H = HEADER_H + PERIODS.length * CELL_H;

  // ── Grid ──────────────────────────────────────────────────────
  const renderGridMode = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row" }}>

        {/* Time column */}
        <View style={{ width: TIME_COL_W, height: TOTAL_COL_H }}>
          <View style={{ height: HEADER_H }} />
          {PERIODS.map(p => (
            <View key={p.number} style={{
              height: CELL_H, alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontSize: 8, color: colors.muted, opacity: 0.6, marginTop: 1 }}>
                {p.startTime}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>
                {p.number}
              </Text>
              
            </View>
          ))}
        </View>

        {/* Day columns */}
        {DAYS.map((day, di) => {
          const dayOfWeek = di + 1;
          const groups = new Map<number, Course[]>();
          courses
            .filter(c => c.dayOfWeek === dayOfWeek)
            .forEach(c => {
              groups.set(c.startPeriod, [...(groups.get(c.startPeriod) ?? []), c]);
            });

          return (
            <View key={di} style={{
              width: 50, height: TOTAL_COL_H,
              position: "relative",
              borderLeftWidth: 0.5, borderLeftColor: colors.border,
            }}>
              {/* Header */}
              <View style={{
                height: HEADER_H,
                alignItems: "center", justifyContent: "center",
                borderBottomWidth: 0.5, borderBottomColor: colors.border,
                backgroundColor: colors.surface,
              }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
                  {day}
                </Text>
              </View>

              {/* Grid lines */}
              {PERIODS.map((_, i) => (
                <View key={i} style={{
                  position: "absolute",
                  top: HEADER_H + i * CELL_H, left: 0, right: 0, height: CELL_H,
                  borderTopWidth: 0.5, borderTopColor: colors.border,
                }} />
              ))}

              {/* Course blocks */}
              {Array.from(groups.entries()).map(([startPeriod, cs]) => {
                const pIdx = PERIODS.findIndex(p => p.number === startPeriod);
                if (pIdx === -1) return null;

                const maxSpan = Math.max(...cs.map(c => c.endPeriod - c.startPeriod + 1));
                const top = HEADER_H + pIdx * CELL_H + 2;
                const height = maxSpan * CELL_H - 4;
                const depth = Math.min(cs.length - 1, 2);

                return (
                  <Pressable
                    key={startPeriod}
                    style={{ position: "absolute", top, left: 2, right: 2, height }}
                    onPress={() =>
                      cs.length === 1
                        ? onCoursePress?.(cs[0])
                        : onMultipleCoursesPress
                          ? onMultipleCoursesPress(cs)
                          : onCoursePress?.(cs[0])
                    }
                  >
                    {({ pressed }) => cs.length === 1 ? (
                      // Single course
                      <View style={{
                        flex: 1,
                        backgroundColor: addAlpha(cs[0].color, pressed ? 0.3 : 0.2),
                        borderLeftWidth: 3, borderLeftColor: cs[0].color,
                        borderRadius: 5,
                        paddingHorizontal: 4, paddingVertical: 4,
                        overflow: "hidden",
                      }}>
                        <Text style={{
                          fontSize: 11, fontWeight: "700",
                          color: colors.foreground, lineHeight: 14,
                        }} numberOfLines={maxSpan >= 2 ? 4 : 2}>
                          {cs[0].name}
                        </Text>
                        {maxSpan >= 2 && (
                          <Text style={{
                            fontSize: 10, color: colors.muted,
                            marginTop: 2, lineHeight: 13,
                          }} numberOfLines={2}>
                            {cs[0].classroom}
                          </Text>
                        )}
                        {getWeekLabel(cs[0].isSingleWeek) ? (
                          <View style={{
                            position: "absolute", top: 2, right: 2,
                            backgroundColor: cs[0].color,
                            borderRadius: 3, paddingHorizontal: 2.5, paddingVertical: 1,
                          }}>
                            <Text style={{ fontSize: 8, color: "#fff", fontWeight: "800" }}>
                              {getWeekLabel(cs[0].isSingleWeek)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      // Stacked courses
                      <View style={{ flex: 1, position: "relative" }}>
                        {cs.slice(1, 3).reverse().map((c, i) => {
                          const d = depth - i;
                          return (
                            <View key={c.id} style={{
                              position: "absolute",
                              top: d * 3, left: d * 2,
                              right: -d * 2, bottom: -d * 3,
                              backgroundColor: addAlpha(c.color, 0.15),
                              borderLeftWidth: 2, borderLeftColor: c.color,
                              borderRadius: 4,
                            }} />
                          );
                        })}
                        {/* Front card */}
                        <View style={{
                          position: "absolute",
                          top: 0, left: 0,
                          right: depth * 2, bottom: depth * 3,
                          backgroundColor: addAlpha(cs[0].color, pressed ? 0.34 : 0.24),
                          borderLeftWidth: 3, borderLeftColor: cs[0].color,
                          borderRadius: 5,
                          paddingHorizontal: 4, paddingVertical: 4,
                          overflow: "hidden",
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.12, shadowRadius: 2, elevation: 2,
                        }}>
                          <Text style={{
                            fontSize: 11, fontWeight: "700",
                            color: colors.foreground, lineHeight: 14,
                          }} numberOfLines={maxSpan >= 2 ? 3 : 2}>
                            {cs[0].name}
                          </Text>
                          <View style={{
                            position: "absolute", bottom: 2, right: 2,
                            backgroundColor: cs[0].color,
                            borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1,
                          }}>
                            <Text style={{ fontSize: 9, color: "#fff", fontWeight: "800" }}>
                              +{cs.length - 1}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  // ── List ──────────────────────────────────────────────────────
  const dayCourses = courses
    .filter(c => c.dayOfWeek === selectedDay)
    .sort((a, b) => a.startPeriod - b.startPeriod);

  const renderListMode = () => (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", gap: 8 }}
      >
        {DAYS.map((day, i) => {
          const dayNum = i + 1;
          const isSelected = selectedDay === dayNum;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => { setSelectedDay(dayNum); onDayChange?.(dayNum); }}
              style={{
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                backgroundColor: isSelected ? colors.background : colors.surface,
                borderWidth: isSelected ? 0 : 0.5, borderColor: colors.border,
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: "500",
                color: isSelected ? "#fff" : colors.foreground,
              }}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {dayCourses.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Text style={{ fontSize: 14, color: colors.muted }}>当天没有课程</Text>
          </View>
        ) : (
          dayCourses.map(course => (
            <Pressable key={course.id} onPress={() => onCoursePress?.(course)}>
              {({ pressed }) => (
                <View style={{
                  borderRadius: 13, backgroundColor: colors.background,
                  overflow: "hidden", opacity: pressed ? 0.85 : 1,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
                }}>
                  <View style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: 4, backgroundColor: course.color,
                  }} />
                  <View style={{ paddingLeft: 17, paddingRight: 14, paddingVertical: 13, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{
                        flex: 1, fontSize: 15, fontWeight: "500",
                        color: colors.foreground, lineHeight: 20,
                      }} numberOfLines={2}>
                        {course.name}
                      </Text>
                      {getWeekLabel(course.isSingleWeek) ? (
                        <View style={{
                          backgroundColor: addAlpha(course.color, 0.18),
                          paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5,
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: course.color }}>
                            {getWeekLabel(course.isSingleWeek)}周
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <IconSymbol name="clock.fill" size={12} color={course.color} />
                        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>
                          {periodMap.get(course.startPeriod)?.startTime}—
                          {periodMap.get(course.endPeriod)?.endTime}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                        <IconSymbol name="location.fill" size={12} color={colors.muted} />
                        <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
                          {course.classroom}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  return mode === "grid" ? renderGridMode() : renderListMode();
}
