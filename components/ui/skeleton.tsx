/**
 * 骨架屏占位块：脉冲呼吸动画，尺寸由调用方指定。
 * 用于数据首次加载期间占住最终卡片的位置，减少内容弹入时的布局跳动。
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, View, type DimensionValue } from "react-native";

import { useColors } from "@/hooks/use-colors";

function rgba(hex: string, a: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: rgba(colors.muted, 0.18), opacity: pulse },
        style,
      ]}
    />
  );
}

/** 卡片形骨架：背景/圆角与真实卡片一致，内部放几条 Skeleton。 */
export function SkeletonCard({
  radius,
  children,
  style,
}: {
  radius: number;
  children: React.ReactNode;
  style?: object;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        { borderRadius: radius, backgroundColor: colors.background, borderWidth: 0.5, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
