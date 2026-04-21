import { createContext, useContext, useEffect, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { COURSE_PALETTES, DEFAULT_PALETTE_KEY, PaletteKey } from "@/lib/course-palette";
import { updateActivePalette } from "@/lib/course-palette";
import { 
  loadCoursePalette, 
  saveCoursePalette,
  getActivePaletteKey 
} from "@/lib/course-palette";

// 字体类型定义
export type FontFamily = "system" | "rounded" | "serif" | "mono";

export const FONT_FAMILY_META: Record<FontFamily, {
  label: string; sub: string; value: string | undefined
}> = {
  system:  { label: "系统",   sub: "默认",          value: undefined },
  rounded: { label: "圆润",   sub: Platform.OS === "ios" ? "SF Rounded" : "Medium", 
             value: Platform.select({ ios: "ui-rounded", android: "sans-serif-medium" }) },
  serif:   { label: "衬线",   sub: "Georgia",        
             value: Platform.select({ ios: "Georgia", android: "serif" }) ?? "serif" },
  mono:    { label: "等宽",   sub: "Menlo",          
             value: Platform.select({ ios: "Menlo", android: "monospace" }) ?? "monospace" },
};

// 圆角半径预设
export const CARD_RADIUS_VALUES = {
  small: 6,
  medium: 14,
  large: 22,
  very_large: 32,
} as const;

export const DEFAULT_PRIMARY = SchemeColors.light.primary; // 默认使用亮色主题的主色

type CardRadius = keyof typeof CARD_RADIUS_VALUES;
type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  resolvedTheme: 'light' | 'dark';
  primaryColor: string;
  setPrimaryColor: (color: string | null) => Promise<void>;
  cardRadius: CardRadius;
  setCardRadius: (radius: CardRadius) => Promise<void>;
  coursePaletteKey: PaletteKey;
  setCoursePaletteKey: (key: PaletteKey) => Promise<void>;
  fontFamily: FontFamily;
  setFontFamily: (f: FontFamily) => Promise<void>;
};



const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string | null>(null);
  const [cardRadius, setCardRadiusState] = useState<CardRadius>('medium');
  const [coursePaletteKey, setCoursePaletteKeyState] = useState<PaletteKey>(DEFAULT_PALETTE_KEY);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>("system");

  // 加载保存的偏好
  useEffect(() => {
    const loadPreferences = async () => {
      // 1. 加载课程配色到模块变量，并获取当前 key
      await loadCoursePalette();
      const paletteKey = getActivePaletteKey();
      setCoursePaletteKeyState(paletteKey);  // 直接同步 state

      // 2. 其他偏好...
      const savedTheme = await AsyncStorage.getItem('theme-preference');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setThemePreferenceState(savedTheme);
      }
      const savedRadius = await AsyncStorage.getItem('card-radius');
      if (savedRadius === 'small' || savedRadius === 'medium' || savedRadius === 'large' || savedRadius === 'very_large') {
        setCardRadiusState(savedRadius);
      }
      const savedPrimary = await AsyncStorage.getItem('primary-color');
      if (savedPrimary && typeof savedPrimary === 'string') {
        setCustomPrimaryColor(savedPrimary);
      }

      const savedFont = await AsyncStorage.getItem("font-family");
      if (savedFont && savedFont in FONT_FAMILY_META) {
        setFontFamilyState(savedFont as FontFamily);
      }
      
    };
    loadPreferences();
  }, []);

  // 计算实际主题
  const resolvedTheme: 'light' | 'dark' =
    themePreference === 'system' ? systemScheme : themePreference;

  // 主色逻辑：有自定义用自定义，否则使用当前主题的默认主色
  const primaryColor = customPrimaryColor ?? SchemeColors[resolvedTheme].primary;

  // 应用主题到 NativeWind 和系统 Appearance
  useEffect(() => {
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

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.dataset.theme = resolvedTheme;
      root.classList.toggle("dark", resolvedTheme === "dark");
      const palette = SchemeColors[resolvedTheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, [resolvedTheme, themePreference]);

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    await AsyncStorage.setItem('theme-preference', pref);
  };

  const setPrimaryColor = async (color: string | null) => {
    setCustomPrimaryColor(color);
    if (color === null) {
      await AsyncStorage.removeItem('primary-color');
    } else {
      await AsyncStorage.setItem('primary-color', color);
    }
  };

  const setCardRadius = async (radius: CardRadius) => {
    setCardRadiusState(radius);
    await AsyncStorage.setItem('card-radius', radius);
  };

  const setCoursePaletteKey = async (key: PaletteKey) => {
    setCoursePaletteKeyState(key);
    await saveCoursePalette(key);  // 更新模块变量并存储
  };
  
  const setFontFamily = async (f: FontFamily) => {
    setFontFamilyState(f);
    await AsyncStorage.setItem("font-family", f);
  };

  const themeVariables = vars({
    "color-primary": primaryColor,
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
    <ThemeContext.Provider
      value={{
        themePreference,
        setThemePreference,
        resolvedTheme,
        primaryColor,
        setPrimaryColor,
        cardRadius,
        setCardRadius,
        coursePaletteKey,
        setCoursePaletteKey,
        fontFamily,
        setFontFamily,
      }}
    >
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