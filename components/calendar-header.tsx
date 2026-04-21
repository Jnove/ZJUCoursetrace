/**
 * components/calendar-header.tsx
 *
 * 可折叠日历头部，用于课表列表视图。
 *
 * Bug 1 fix: 收起时同时做 translateY 动画，让选中行始终锚定顶部，
 *            而不是被容器高度裁掉——无论选中行在第几行都丝滑。
 *
 * Bug 2 fix: 用 useRef 追踪收起状态，手势回调读 ref 而非闭包里的
 *            stale state，保证收起时横滑切星期，展开时切月份。
 */

import React, { useRef, useState, useMemo, useEffect } from "react";
import {
  View, Text, TouchableOpacity, Animated, PanResponder,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTheme } from "@/lib/theme-provider";
import { IconSymbol } from "@/components/ui/icon-symbol";

const ROW_H    = 44;
const HEADER_H = 44;
const DOW_H    = 28;
const DOW_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function buildGrid(year: number, month: number): (Date | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const numDays  = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= numDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export interface CalendarHeaderProps {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  courseDays?: number[];
}

export function CalendarHeader({
  selectedDate,
  onDateSelect,
  courseDays = [],
}: CalendarHeaderProps) {
  const colors = useColors();
  const { primaryColor } = useTheme();
  const today = useMemo(() => new Date(), []);

  const [displayMonth, setDisplayMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  const grid    = useMemo(
    () => buildGrid(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );
  const numRows = grid.length;

  const selectedRowIdx = useMemo(() => {
    const idx = grid.findIndex(row =>
      row.some(d => d !== null && isSameDay(d, selectedDate))
    );
    return idx >= 0 ? idx : 0;
  }, [grid, selectedDate]);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const isCollapsedRef  = useRef(false);
  const selectedDateRef = useRef(selectedDate);
  const displayMonthRef = useRef(displayMonth);
  const onSelectRef     = useRef(onDateSelect);

  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { displayMonthRef.current = displayMonth; }, [displayMonth]);
  useEffect(() => { onSelectRef.current     = onDateSelect; }, [onDateSelect]);

  // ── 动画：0 = 展开，1 = 折叠 ─────────────────────────────────────────────────
  const anim = useRef(new Animated.Value(0)).current;

  /**
   * Bug 1 fix:
   * gridHeight  : expandedH → collapsedH   （外层裁切高度）
   * gridTranslateY : 0 → -(selectedRowIdx * ROW_H)  （内层上移）
   *
   * 两者由同一 anim 驱动，选中行在折叠过程中始终保持在可见区顶部。
   * useMemo 依赖 selectedRowIdx，切换选中日期后插值区间自动更新。
   */
  const gridHeight = useMemo(
    () => anim.interpolate({
      inputRange:  [0, 1],
      outputRange: [numRows * ROW_H, ROW_H],
      extrapolate: "clamp",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numRows]
  );

  const gridTranslateY = useMemo(
    () => anim.interpolate({
      inputRange:  [0, 1],
      outputRange: [0, -(selectedRowIdx * ROW_H)],
      extrapolate: "clamp",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRowIdx]
  );

  const chevronRotate = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const doToggle = (collapse: boolean) => {
    isCollapsedRef.current = collapse;
    Animated.spring(anim, {
      toValue:         collapse ? 1 : 0,
      useNativeDriver: false,
      tension:         55,
      friction:        10,
    }).start();
  };

  /**
   * Bug 2 fix:
   * 读 isCollapsedRef.current 而非闭包里的旧 state，
   * 保证收起时横滑切星期，展开时横滑切月份。
   */
  const doNavigate = (dir: 1 | -1) => {
    if (isCollapsedRef.current) {
      const next = addDays(selectedDateRef.current, dir * 7);
      onSelectRef.current(next);
      const nextMonth = new Date(next.getFullYear(), next.getMonth(), 1);
      if (nextMonth.getTime() !== displayMonthRef.current.getTime()) {
        setDisplayMonth(nextMonth);
      }
    } else {
      setDisplayMonth(
        prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
      );
    }
  };

  // ── 手势 ─────────────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 8,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, { dx, dy }) => {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (ay > ax && ay > 20) {
          doToggle(dy < 0);
        } else if (ax > ay * 1.5 && ax > 30) {
          doNavigate(dx < 0 ? 1 : -1);
        }
      },
    })
  ).current;

  const courseDaySet = useMemo(() => new Set(courseDays), [courseDays]);

  return (
    <View style={{
      backgroundColor: colors.background,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    }}>

      {/* 月份导航栏 */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        height: HEADER_H, paddingHorizontal: 8,
      }}>
        <TouchableOpacity
          onPress={() => doNavigate(-1)}
          style={{ padding: 8 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="chevron.left" size={16} color={colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: "center" }}
          onPress={() => {
            setDisplayMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            if (isCollapsedRef.current) doToggle(false);
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
            {displayMonth.getFullYear()}年{displayMonth.getMonth() + 1}月
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => doNavigate(1)}
          style={{ padding: 8 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => doToggle(!isCollapsedRef.current)}
          style={{ padding: 8 }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <IconSymbol name="chevron.right" size={14} color={colors.muted} />
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* 星期标签行 */}
      <View style={{ flexDirection: "row", height: DOW_H, paddingHorizontal: 4 }}>
        {DOW_LABELS.map((lbl, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{
              fontSize: 11, fontWeight: "500",
              color: i >= 5 ? primaryColor : colors.muted,
            }}>
              {lbl}
            </Text>
          </View>
        ))}
      </View>

      {/* 日期格子（可折叠）*/}
      <Animated.View
        style={{ height: gridHeight, overflow: "hidden" }}
        {...panResponder.panHandlers}
      >
        {/*
          内层：translateY 让选中行在折叠时滑到顶部（Bug 1 fix 核心）
        */}
        <Animated.View style={{ transform: [{ translateY: gridTranslateY }] }}>
          {grid.map((row, ri) => (
            <View
              key={ri}
              style={{ flexDirection: "row", height: ROW_H, paddingHorizontal: 4 }}
            >
              {row.map((date, ci) => {
                if (!date) return <View key={ci} style={{ flex: 1 }} />;

                const isSelected   = isSameDay(date, selectedDate);
                const isToday      = isSameDay(date, today);
                const isOtherMonth = date.getMonth() !== displayMonth.getMonth();
                const dow          = date.getDay() === 0 ? 7 : date.getDay();
                const hasCourse    = courseDaySet.has(dow);

                return (
                  <TouchableOpacity
                    key={ci}
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                    onPress={() => {
                      onSelectRef.current(date);
                      if (isOtherMonth) {
                        setDisplayMonth(
                          new Date(date.getFullYear(), date.getMonth(), 1)
                        );
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{
                      width: 34, height: 34, borderRadius: 17,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: isSelected
                        ? primaryColor
                        : isToday
                          ? `${primaryColor}22`
                          : "transparent",
                    }}>
                      <Text style={{
                        fontSize: 14,
                        fontWeight: isSelected || isToday ? "600" : "400",
                        color: isSelected
                          ? "#fff"
                          : isOtherMonth
                            ? colors.border
                            : isToday
                              ? primaryColor
                              : ci >= 5
                                ? primaryColor
                                : colors.foreground,
                      }}>
                        {date.getDate()}
                      </Text>
                    </View>

                    {hasCourse && (
                      <View style={{
                        position: "absolute", bottom: 3,
                        width: 4, height: 4, borderRadius: 2,
                        backgroundColor: isSelected
                          ? "#fff"
                          : isOtherMonth
                            ? colors.border
                            : primaryColor,
                      }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </Animated.View>

    </View>
  );
}