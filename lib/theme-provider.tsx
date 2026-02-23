import { createContext, useContext, useEffect, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

type ThemePreference = 'light' | 'dark' | 'system';
type ThemeContextValue = {
  themePreference: ThemePreference;        // 用户选择的模式
  setThemePreference: (pref: ThemePreference) => void;
  resolvedTheme: 'light' | 'dark';          // 实际应用的主题（跟随系统时解析后的值）
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

  // 应用主题到 NativeWind 和 CSS 变量
  useEffect(() => {
    // NativeWind 3.0+ 使用 setColorScheme
    if (nativewindColorScheme.setColorScheme) {
      nativewindColorScheme.setColorScheme(resolvedTheme);
    } else {
      nativewindColorScheme.set(resolvedTheme);
    }

    // 在移动端，Appearance.setColorScheme 也会影响系统 UI
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(resolvedTheme);
    }

    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = resolvedTheme;
      root.classList.toggle("dark", resolvedTheme === "dark");
      const palette = SchemeColors[resolvedTheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, [resolvedTheme]);

  // 监听系统主题变化
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (themePreference === 'system') {
        // 当偏好为系统时，Appearance 变化会自动触发重新渲染
        // 因为 systemScheme 是通过 useSystemColorScheme() 获取的
      }
    });
    return () => subscription.remove();
  }, [themePreference]);

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