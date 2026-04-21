import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Course } from "@/lib/schedule-context";
import { useColors } from "@/hooks/use-colors";
import { RefreshControl } from "react-native-gesture-handler";
import { useTheme, CARD_RADIUS_VALUES, DEFAULT_PRIMARY, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";

const HEADER_H   = 38;
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

export interface ScheduleTableProps {
  courses: Course[];
  onCoursePress?: (course: Course) => void;
  onMultipleCoursesPress?: (courses: Course[]) => void;
  availableHeight?: number;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  radius?: number;
  mode?: "grid";
}

export function ScheduleTable({
  courses,
  onCoursePress,
  onMultipleCoursesPress,
  availableHeight = 0,
  radius = 5,
}: ScheduleTableProps) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  const CELL_H = availableHeight > 200
    ? Math.max(44, Math.floor((availableHeight - HEADER_H) / PERIODS.length))
    : 52;
  const TOTAL_COL_H = HEADER_H + PERIODS.length * CELL_H;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row" }}>

        {/* Time column */}
        <View style={{ width: TIME_COL_W, height: TOTAL_COL_H }}>
          <View style={{ height: HEADER_H }} />
          {PERIODS.map(p => (
            <View key={p.number} style={{ height: CELL_H, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 8, color: colors.muted, opacity: 0.6, marginTop: 1, fontFamily: ff }}>
                {p.startTime}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600", fontFamily: ff }}>
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
              width: 50,
              height: TOTAL_COL_H,
              position: "relative",
              borderLeftWidth: 0.5,
              borderLeftColor: colors.border,
            }}>
              {/* Header */}
              <View style={{
                height: HEADER_H,
                alignItems: "center", justifyContent: "center",
                borderBottomWidth: 0.5, borderBottomColor: colors.border,
                backgroundColor: colors.surface,
              }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
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
                const top    = HEADER_H + pIdx * CELL_H + 2;
                const height = maxSpan * CELL_H - 4;
                const depth  = Math.min(cs.length - 1, 2);

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
                      /* Single course */
                      <View style={{
                        flex: 1,
                        backgroundColor: addAlpha(cs[0].color, pressed ? 0.3 : 0.2),
                        borderLeftWidth: 3, borderLeftColor: cs[0].color,
                        borderRadius: 5,
                        paddingHorizontal: 4, paddingVertical: 4,
                        overflow: "hidden",
                      }}>
                        <Text style={{
                          fontSize: 11, fontWeight: "700", fontFamily: ff,
                          color: colors.foreground, lineHeight: 14,
                        }} numberOfLines={maxSpan >= 2 ? 4 : 2}>
                          {cs[0].name}
                        </Text>
                        {maxSpan >= 2 && (
                          <Text style={{
                            fontSize: 10, color: colors.muted, fontFamily: ff,
                            marginTop: 2, lineHeight: 13,
                          }} numberOfLines={2}>
                            {cs[0].classroom}
                          </Text>
                        )}
                        {getWeekLabel(cs[0].isSingleWeek) ? (
                          <View style={{
                            position: "absolute", top: 2, right: 2,
                            backgroundColor: cs[0].color,
                            borderRadius: radius, paddingHorizontal: 2.5, paddingVertical: 1,
                          }}>
                            <Text style={{ fontSize: 8, color: "#fff", fontWeight: "800", fontFamily: ff }}>
                              {getWeekLabel(cs[0].isSingleWeek)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      /* Stacked courses */
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
                            fontSize: 11, fontWeight: "700", fontFamily: ff,
                            color: colors.foreground, lineHeight: 14,
                          }} numberOfLines={maxSpan >= 2 ? 3 : 2}>
                            {cs[0].name}
                          </Text>
                          <View style={{
                            position: "absolute", bottom: 2, right: 2,
                            backgroundColor: cs[0].color,
                            borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1,
                          }}>
                            <Text style={{ fontSize: 9, color: "#fff", fontWeight: "800", fontFamily: ff }}>
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
}