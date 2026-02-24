import { createContext, useContext, useEffect, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { SchemeColors, type ColorScheme } from "@/constants/theme";

type ThemePreference = 'light' | 'dark' | 'system';
type ThemeContextValue = {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  resolvedTheme: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  // 加载保存的偏好
  useEffect(() => {
    const loadPreference = async () => {
      const saved = await AsyncStorage.getItem('theme-preference');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemePreferenceState(saved);
      }
    };
    loadPreference();
  }, []);

  // 计算实际主题
  const resolvedTheme: 'light' | 'dark' =
    themePreference === 'system' ? systemScheme : themePreference;

  // 应用主题到 NativeWind 和系统 Appearance
  useEffect(() => {
    // --- 设置 NativeWind 主题 ---
    // 兼容不同版本：优先使用 .set()，降级使用 .setColorScheme()
    if (nativewindColorScheme) {
      if (typeof nativewindColorScheme.set === 'function') {
        nativewindColorScheme.set(resolvedTheme);
      } else if (typeof nativewindColorScheme.setColorScheme === 'function') {
        nativewindColorScheme.setColorScheme(resolvedTheme);
      }
    }

    // --- 控制移动端系统 Appearance ---
    if (Platform.OS !== 'web') {
      if (themePreference === 'system') {
        // 系统模式：清除应用覆盖，让系统自动控制
        Appearance.setColorScheme(null);
      } else {
        // 用户明确选择亮/暗：强制设置应用主题
        Appearance.setColorScheme(resolvedTheme);
      }
    }

    // --- Web 端 CSS 变量设置 ---
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.dataset.theme = resolvedTheme;
      root.classList.toggle("dark", resolvedTheme === "dark");
      const palette = SchemeColors[resolvedTheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, [resolvedTheme, themePreference]); // 注意依赖项包含 themePreference

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    await AsyncStorage.setItem('theme-preference', pref);
  };

  const themeVariables = vars({
    "color-primary": SchemeColors[resolvedTheme].primary,
    "color-background": SchemeColors[resolvedTheme].background,
    "color-surface": SchemeColors[resolvedTheme].surface,
    "color-foreground": SchemeColors[resolvedTheme].foreground,
    "color-muted": SchemeColors[resolvedTheme].muted,
    "color-border": SchemeColors[resolvedTheme].border,
    "color-success": SchemeColors[resolvedTheme].success,
    "color-warning": SchemeColors[resolvedTheme].warning,
    "color-error": SchemeColors[resolvedTheme].error,
  });

  return (
    <ThemeContext.Provider value={{ themePreference, setThemePreference, resolvedTheme }}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}