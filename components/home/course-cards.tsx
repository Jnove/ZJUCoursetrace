/**
 * 首页课程卡片：上课中（带进度条倒计时）、即将上课、普通课程条目。
 */

import { Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import type { Course } from "@/lib/schedule-context";
import { useTheme, FONT_FAMILY_META } from "@/lib/theme-provider";
import { formatCountdown, getCourseSeconds, hexToRgba } from "@/lib/course-time";

// ─── Period badge ─────────────────────────────────────────────────────────────
export function PeriodBadge({ course }: { course: Course }) {
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  const colors = useColors();
  const label = course.startPeriod === course.endPeriod
    ? `节 ${course.startPeriod}`
    : `节 ${course.startPeriod}–${course.endPeriod}`;
  return (
    <View style={{
      backgroundColor: colors.surface,
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: 5,
      borderWidth: 0.5, borderColor: colors.border,
    }}>
      <Text style={{ fontSize: 10, fontWeight: "500", color: colors.muted, fontFamily: ff }}>{label}</Text>
    </View>
  );
}

// ─── Ongoing card ─────────────────────────────────────────────────────────────
export function OngoingCard({ course, countdown, nowSec, radius }: {
  course: Course; countdown: number; nowSec: number; radius: number;
}) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = getCourseSeconds(course);
  const progress = t
    ? Math.min(1, Math.max(0, (nowSec - t.start) / (t.end - t.start)))
    : 0;
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View style={{
      borderRadius: radius, backgroundColor: colors.background, overflow: "hidden",
      ...cardShadow(scheme, { color: course.color, offsetY: 4, opacity: 0.22, radius: 12, elevation: 5 }),
    }}>
      <View style={{ height: 3, backgroundColor: course.color }} />
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 14, paddingTop: 11, gap: 10,
      }}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: course.color }} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: course.color, fontFamily: ff }}>上课中</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground, lineHeight: 20, fontFamily: ff }} numberOfLines={2}>
            {course.name}
          </Text>
          <View style={{ gap: 3, marginTop: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="clock.fill" size={12} color={course.color} />
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground, fontFamily: ff }}>
                {course.periodTime ?? ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="location.fill" size={12} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }} numberOfLines={1}>
                {course.classroom}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <Text style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.3, fontFamily: ff }}>距下课</Text>
          <Text style={{
            fontSize: 24, fontWeight: "500", color: course.color, fontFamily: ff,
            fontVariant: ["tabular-nums"], lineHeight: 26,
          }}>
            {formatCountdown(countdown)}
          </Text>
        </View>
      </View>
      <View style={{ height: 3, backgroundColor: hexToRgba(course.color, 0.18), marginTop: 11 }}>
        <View style={{
          height: "100%",
          width: `${progress * 100}%` as any,
          backgroundColor: course.color,
        }} />
      </View>
    </View>
  );
}

// ─── Next card ────────────────────────────────────────────────────────────────
export function NextCard({ course, countdown, radius }: { course: Course; countdown: number; radius: number; }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View style={{
      borderRadius: radius, backgroundColor: colors.background, overflow: "hidden",
      ...cardShadow(scheme, { offsetY: 2, opacity: 0.08, radius: 8, elevation: 3 }),
    }}>
      <View style={{ height: 3, backgroundColor: course.color }} />
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 14, paddingVertical: 11, gap: 10,
      }}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: course.color, opacity: 0.75 }} />
            <Text style={{ fontSize: 11, fontWeight: "500", color: colors.muted, fontFamily: ff }}>即将上课</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground, lineHeight: 20, fontFamily: ff }} numberOfLines={2}>
            {course.name}
          </Text>
          <View style={{ gap: 3, marginTop: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="clock.fill" size={12} color={course.color} />
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground, fontFamily: ff }}>
                {course.periodTime ?? ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconSymbol name="location.fill" size={12} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, fontFamily: ff }} numberOfLines={1}>
                {course.classroom}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <Text style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.3, fontFamily: ff }}>距上课</Text>
          <Text style={{
            fontSize: 22, fontWeight: "500", color: colors.foreground, fontFamily: ff,
            fontVariant: ["tabular-nums"], lineHeight: 24,
          }}>
            {formatCountdown(countdown)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Plain course card ────────────────────────────────────────────────────────
export function CourseCard({ course, radius }: { course: Course; radius: number }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View style={{
      borderRadius: radius, backgroundColor: colors.background, overflow: "hidden",
      ...cardShadow(scheme, { offsetY: 1, opacity: 0.06, radius: 5, elevation: 2 }),
    }}>
      <View style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: 4, backgroundColor: course.color,
      }} />
      <View style={{ paddingLeft: 17, paddingRight: 13, paddingVertical: 11, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={{
            flex: 1, fontSize: 14, fontWeight: "500", fontFamily: ff,
            color: colors.foreground, lineHeight: 18,
          }} numberOfLines={2}>
            {course.name}
          </Text>
          <PeriodBadge course={course} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconSymbol name="clock.fill" size={11} color={course.color} />
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.foreground, fontFamily: ff }}>
              {course.periodTime ?? ""}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
            <IconSymbol name="location.fill" size={11} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }} numberOfLines={1}>
              {course.classroom}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
