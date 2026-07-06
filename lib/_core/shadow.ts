import { StyleSheet, type ViewStyle } from "react-native";
import type { ColorScheme } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * 卡片投影配置。数值语义与 RN 原生阴影属性一致，默认对应一枚轻量卡片。
 * `color` 为浅色模式下的阴影色；传 "#000"（默认）表示中性卡片投影。
 */
export interface ShadowOpts {
  color?: string;
  offsetY?: number;
  opacity?: number;
  radius?: number;
  elevation?: number;
}

function isNeutral(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === "#000" || c === "#000000" || c === "black";
}

/**
 * 随主题自适应的卡片层次（issue #1）。
 *
 * - 浅色模式：常规黑色投影。
 * - 深色模式：黑色投影在深色背景上几乎不可见，会让卡片失去层次。
 *   · 中性（#000）投影 → 替换为一圈极细的白色半透明描边（rim light）恢复层次；
 *   · 彩色发光投影 → 在深色上仍可见，予以保留并略微增强不透明度。
 *   两种情况都保留 Android 的 elevation。
 *
 * 用法：组件顶层取一次 `const scheme = useColorScheme()`，
 * 然后在任意样式里展开 `...cardShadow(scheme, { ... })`（可用于 map 循环内）。
 */
export function cardShadow(scheme: ColorScheme, opts: ShadowOpts = {}): ViewStyle {
  const { color = "#000", offsetY = 1, opacity = 0.06, radius = 5, elevation = 2 } = opts;

  if (scheme === "dark") {
    if (isNeutral(color)) {
      return {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.12)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: offsetY },
        shadowOpacity: 0.4,
        shadowRadius: radius,
        elevation,
      };
    }
    return {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: Math.min(opacity * 1.5, 0.5),
      shadowRadius: radius,
      elevation,
    };
  }

  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

/** Hook 形式，供组件顶层直接取用单一卡片阴影样式。 */
export function useCardShadow(opts?: ShadowOpts): ViewStyle {
  return cardShadow(useColorScheme(), opts);
}
