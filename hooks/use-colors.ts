import { AmoledColors, Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useTheme } from "@/lib/theme-provider";

/**
 * Returns the current theme's color palette.
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { resolvedTheme, amoledDark } = useTheme();
  const scheme = (colorSchemeOverride ?? resolvedTheme ?? "light") as ColorScheme;
  if (scheme === "dark" && amoledDark) return AmoledColors;
  return Colors[scheme];
}
