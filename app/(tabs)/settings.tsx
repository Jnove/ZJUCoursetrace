/**
 * app/(tabs)/settings.tsx
 *
 * iOS-style grouped settings. The old inline "关于" rows are replaced
 * with a single navigation entry that opens app/about.tsx.
 */

import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import type { SFSymbols7_0 } from "sf-symbols-typescript";
import Constants from "expo-constants";

// ─── Primitives ───────────────────────────────────────────────────────────────

function SettingsRow({
  icon, iconBg, label, value, onPress, chevron = true, danger = false, last = false,
}: {
  icon: SFSymbols7_0; iconBg: string; label: string;
  value?: string; onPress?: () => void;
  chevron?: boolean; danger?: boolean; last?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
      style={{
        flexDirection:     "row",
        alignItems:        "center",
        paddingHorizontal: 16,
        paddingVertical:   13,
        gap:               13,
        backgroundColor:   colors.background,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 8,
        backgroundColor: iconBg,
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <IconSymbol name={icon} size={18} color="#fff" />
      </View>
      <Text style={{
        flex: 1, fontSize: 15,
        color:      danger ? colors.error : colors.foreground,
        fontWeight: "400",
      }}>
        {label}
      </Text>
      {value && (
        <Text style={{ fontSize: 14, color: colors.muted, marginRight: chevron ? 2 : 0 }}>
          {value}
        </Text>
      )}
      {chevron && onPress && (
        <IconSymbol name="chevron.right" size={15} color={colors.muted} />
      )}
    </TouchableOpacity>
  );
}

function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const colors = useColors();
  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  return (
    <View style={{ gap: 6 }}>
      {title && (
        <Text style={{
          fontSize: 11, fontWeight: "600", color: colors.muted,
          letterSpacing: 0.6, textTransform: "uppercase",
          paddingHorizontal: 4,
        }}>
          {title}
        </Text>
      )}
      <View style={{
        borderRadius: r, overflow: "hidden",
        borderWidth: 0.5, borderColor: colors.border,
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
      }}>
        {children}
      </View>
    </View>
  );
}

// ─── Theme segmented control ───────────────────────────────────────────────────
function ThemeSegment() {
  const colors = useColors();
  const { themePreference, setThemePreference, primaryColor } = useTheme();
  const opts: { label: string; value: "light" | "dark" | "system"; icon: SFSymbols7_0 }[] = [
    { label: "浅色", value: "light",  icon: "sun.max" },
    { label: "深色", value: "dark",   icon: "moon.fill" },
    { label: "自动", value: "system", icon: "circle.righthalf.fill" },
  ];
  return (
    <View style={{
      flexDirection: "row", backgroundColor: colors.surface,
      borderRadius: 10, padding: 3,
      marginHorizontal: 16, marginBottom: 14,
    }}>
      {opts.map(o => {
        const active = themePreference === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => setThemePreference(o.value)}
            activeOpacity={0.75}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center",
              justifyContent: "center", gap: 5, paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: active ? colors.background : "transparent",
              shadowColor: active ? "#000" : "transparent",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: active ? 0.08 : 0,
              shadowRadius: 3, elevation: active ? 1 : 0,
            }}
          >
            <IconSymbol name={o.icon} size={15} color={active ? primaryColor : colors.muted} />
            <Text style={{
              fontSize: 13, fontWeight: active ? "600" : "400",
              color: active ? colors.foreground : colors.muted,
            }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Profile card ──────────────────────────────────────────────────────────────
function ProfileCard({ username }: { username: string | null }) {
  const colors = useColors();
  const { primaryColor, cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  const initial = username
    ? (username.match(/^\d+$/) ? username.slice(-2) : username.slice(0, 1).toUpperCase())
    : "?";
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 14,
      padding: 18, borderRadius: r,
      backgroundColor: colors.background,
      borderWidth: 0.5, borderColor: colors.border,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
    }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: primaryColor,
        alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: "#fff" }}>{initial}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.foreground }}>
          {username ?? "未登录"}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>浙江大学统一身份认证</Text>
      </View>
      <View style={{
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
        backgroundColor: `${primaryColor}1A`,
      }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: primaryColor }}>已登录</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { state: authState, signOut } = useAuth();
  const { primaryColor, cardRadius }  = useTheme();
  const colors   = useColors();
  const router   = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const r = CARD_RADIUS_VALUES[cardRadius];
  const version = Constants.expoConfig?.version ?? "1.1.0";

  const handleLogout = () => {
    Alert.alert(
      "退出登录",
      "退出后本地缓存将被清除，需重新登录才能查看数据。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "退出", style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              await signOut();
              router.replace("/(tabs)");
            } catch {
              Alert.alert("错误", "退出登录失败，请重试");
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  const handleClearCache = () => {
    Alert.alert("清除缓存", "将删除本地缓存的课表数据，下次打开会重新加载。", [
      { text: "取消", style: "cancel" },
      {
        text: "清除", style: "destructive",
        onPress: async () => {
          const { default: AS } = await import("@react-native-async-storage/async-storage");
          const keys = await AS.getAllKeys();
          const cacheKeys = keys.filter(k =>
            k.startsWith("schedule_") ||
            k.startsWith("raw_schedule_") ||
            k.startsWith("activeSemesters_")
          );
          if (cacheKeys.length > 0) await AS.multiRemove(cacheKeys);
          Alert.alert("完成", `已清除 ${cacheKeys.length} 项缓存`);
        },
      },
    ]);
  };

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={{
          fontSize: 28, fontWeight: "700",
          color: colors.foreground, textAlign: "center", marginBottom: 2,
        }}>
          设置
        </Text>

        {/* Profile */}
        {authState.userToken && <ProfileCard username={authState.username} />}

        {/* Appearance */}
        <SettingsSection title="外观">
          <View style={{ paddingTop: 14 }}>
            <Text style={{
              fontSize: 12, fontWeight: "500", color: colors.muted,
              paddingHorizontal: 16, marginBottom: 10,
            }}>
              主题模式
            </Text>
            <ThemeSegment />
          </View>
          <SettingsRow
            icon="pencil"
            iconBg="#6366f1"
            label="个性化"
            value="颜色与样式"
            onPress={() => router.push("/personalization")}
            last
          />
        </SettingsSection>

        {/* General */}
        <SettingsSection title="通用">
          <SettingsRow
            icon="square.and.arrow.down"
            iconBg="#64748b"
            label="清除课表缓存"
            onPress={handleClearCache}
            last
          />
        </SettingsSection>

        {/* About — now a single navigation row */}
        <SettingsSection title="关于">
          <SettingsRow
            icon="person.fill"
            iconBg="#64748b"
            label="关于 ZJU 课迹"
            value={`v${version}`}
            onPress={() => router.push("/about")}
            last
          />
        </SettingsSection>

        {/* Logout */}
        {authState.userToken && (
          <TouchableOpacity
            onPress={handleLogout}
            disabled={loggingOut}
            activeOpacity={0.72}
            style={{
              flexDirection: "row", alignItems: "center",
              justifyContent: "center", gap: 8,
              paddingVertical: 15, borderRadius: r,
              backgroundColor: `${colors.error}12`,
              borderWidth: 0.5, borderColor: `${colors.error}38`,
            }}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <>
                <IconSymbol
                  name="rectangle.portrait.and.arrow.right"
                  size={18} color={colors.error}
                />
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.error }}>
                  退出登录
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.push("/dev/login-debug")}>
          <Text>🔧 CAS 调试</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}