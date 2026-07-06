/**
 * app/(tabs)/settings.tsx
 *
 * has a navigation entry that opens app/about.tsx.
 */

import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Switch, Modal,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { useTheme, CARD_RADIUS_VALUES, DEFAULT_PRIMARY, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cardShadow } from "@/lib/_core/shadow";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { SFSymbols7_0 } from "sf-symbols-typescript";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { exportScheduleIcs, listExportableSemesters, type ExportSemester } from "@/lib/ics-export";
import { cancelAllReminders, REMINDER_PREF_KEY } from "@/lib/reminder-service";
import { GRADE_NOTIFY_PREF_KEY } from "@/lib/grade-watcher";
const isDiagEnabled = !!process.env.EXPO_PUBLIC_ENABLE_DIAG_LOG;

// ─── Primitives ───────────────────────────────────────────────────────────────
function SettingsRow({
  icon, iconBg, label, value, onPress, chevron = true, danger = false, last = false,
}: {
  icon: SFSymbols7_0; iconBg: string; label: string;
  value?: string; onPress?: () => void;
  chevron?: boolean; danger?: boolean; last?: boolean;
}) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

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
        flex: 1, fontSize: 15, fontFamily: ff,
        color: danger ? colors.error : colors.foreground,
        fontWeight: "400",
      }}>
        {label}
      </Text>
      {value && (
        <Text style={{ fontSize: 14, color: colors.muted, marginRight: chevron ? 2 : 0, fontFamily: ff }}>
          {value}
        </Text>
      )}
      {chevron && onPress && (
        <IconSymbol name="chevron.right" size={15} color={colors.muted} />
      )}
    </TouchableOpacity>
  );
}

function SettingsToggleRow({
  icon, iconBg, label, sub, value, onValueChange, last = false,
}: {
  icon: SFSymbols7_0; iconBg: string; label: string; sub?: string;
  value: boolean; onValueChange: (v: boolean) => void; last?: boolean;
}) {
  const colors = useColors();
  const { primaryColor } = useTheme();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View style={{
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 10, gap: 13,
      backgroundColor: colors.background,
      borderBottomWidth: last ? 0 : 0.5,
      borderBottomColor: colors.border,
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: 8, backgroundColor: iconBg,
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <IconSymbol name={icon} size={18} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: ff }}>{label}</Text>
        {sub && <Text style={{ fontSize: 11, color: colors.muted, fontFamily: ff }}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: primaryColor }}
        thumbColor="#fff"
      />
    </View>
  );
}

function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const { cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View style={{ gap: 6 }}>
      {title && (
        <Text style={{
          fontSize: 11, fontWeight: "600", color: colors.muted, fontFamily: ff,
          letterSpacing: 0.6, textTransform: "uppercase",
          paddingHorizontal: 4,
        }}>
          {title}
        </Text>
      )}
      <View style={{
        borderRadius: r, overflow: "hidden",
        borderWidth: 0.5, borderColor: colors.border,
        backgroundColor: colors.background,
        ...cardShadow(scheme, { offsetY: 1, opacity: 0.05, radius: 1, elevation: 0 }),
      }}>
        {children}
      </View>
    </View>
  );
}

// ─── Theme segmented control ───────────────────────────────────────────────────
function ThemeSegment() {
  const colors = useColors();
  const scheme = useColorScheme();
  const { themePreference, setThemePreference, primaryColor } = useTheme();
  const opts: { label: string; value: "light" | "dark" | "system"; icon: SFSymbols7_0 }[] = [
    { label: "浅色", value: "light",  icon: "sun.max" },
    { label: "深色", value: "dark",   icon: "moon.fill" },
    { label: "自动", value: "system", icon: "circle.righthalf.fill" },
  ];
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
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
              ...(active ? cardShadow(scheme, { offsetY: 1, opacity: 0.08, radius: 3, elevation: 1 }) : null),
            }}
          >
            <IconSymbol name={o.icon} size={15} color={active ? primaryColor : colors.muted} />
            <Text style={{
              fontSize: 13, fontWeight: active ? "600" : "400", fontFamily: ff,
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
function ProfileCard({ username, name }: { username: string | null; name: string | null }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const { primaryColor, cardRadius } = useTheme();
  const r = CARD_RADIUS_VALUES[cardRadius];
  // 头像取姓名后两个字；无姓名时回退到学号后两位 / 首字母
  const initial = name
    ? name.slice(-2)
    : username
      ? (username.match(/^\d+$/) ? username.slice(-2) : username.slice(0, 1).toUpperCase())
      : "?";
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 14,
      padding: 18, borderRadius: r,
      backgroundColor: colors.background,
      borderWidth: 0.5, borderColor: colors.border,
      ...cardShadow(scheme, { offsetY: 2, opacity: 0.07, radius: 8, elevation: 2 }),
    }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: primaryColor,
        alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: "#fff", fontFamily: ff }}>{initial}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
          { username ?? "未登录"}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, fontFamily: ff }}>
          {"浙江大学统一身份认证"}
        </Text>
      </View>
      <View style={{
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
        backgroundColor: `${primaryColor}1A`,
      }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: primaryColor, fontFamily: ff }}>已登录</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { state: authState, signOut } = useAuth();
  const { primaryColor, cardRadius, amoledDark, setAmoledDark } = useTheme();
  const colors   = useColors();
  const router   = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPickerVisible, setExportPickerVisible] = useState(false);
  const [exportSemesters, setExportSemesters] = useState<ExportSemester[]>([]);
  const [exportChecked, setExportChecked] = useState<Record<string, boolean>>({});

  // 通知开关（默认开启，"0" 表示关闭）
  const [gradeNotify, setGradeNotify] = useState(true);
  const [reminders, setReminders]     = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(GRADE_NOTIFY_PREF_KEY).then(v => setGradeNotify(v !== "0")).catch(() => {});
    AsyncStorage.getItem(REMINDER_PREF_KEY).then(v => setReminders(v !== "0")).catch(() => {});
  }, []);

  const toggleGradeNotify = async (v: boolean) => {
    setGradeNotify(v);
    await AsyncStorage.setItem(GRADE_NOTIFY_PREF_KEY, v ? "1" : "0").catch(() => {});
  };
  const toggleReminders = async (v: boolean) => {
    setReminders(v);
    await AsyncStorage.setItem(REMINDER_PREF_KEY, v ? "1" : "0").catch(() => {});
    // 关闭时立即清掉已排的本地提醒；开启后下次拉取作业/考试时自动重排
    if (!v) await cancelAllReminders();
  };

  // 点击「导出课表到日历」→ 弹出学期多选；只有一个可导出学期时直接导出
  const handleExportIcs = async () => {
    if (exporting) return;
    try {
      const list = await listExportableSemesters();
      if (list.length === 0) {
        Alert.alert("暂无可导出的课表", "请先在课表页加载一次课表");
        return;
      }
      if (list.length === 1) {
        await doExport([list[0]]);
        return;
      }
      const init: Record<string, boolean> = {};
      const hasCurrent = list.some(s => s.isCurrent);
      list.forEach((s, i) => { init[`${s.yearValue}|${s.termValue}`] = hasCurrent ? s.isCurrent : i === 0; });
      setExportSemesters(list);
      setExportChecked(init);
      setExportPickerVisible(true);
    } catch (e) {
      Alert.alert("导出失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const doExport = async (targets: { yearValue: string; termValue: string }[]) => {
    setExporting(true);
    try {
      await exportScheduleIcs(targets);
    } catch (e) {
      Alert.alert("导出失败", e instanceof Error ? e.message : "未知错误");
    } finally {
      setExporting(false);
    }
  };

  const r = CARD_RADIUS_VALUES[cardRadius];
  const version = Constants.expoConfig?.version ?? "1.1.0";

  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

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
    Alert.alert(
      "清除所有缓存", 
      "将删除本地缓存的课表、成绩、考试等所有业务数据。个性化设置（如主题颜色）将被保留。", 
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定清除", style: "destructive",
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              // 过滤掉个性化设置 (以 pref_ 开头)
              // 保留当前登录用户名 (username)，除非是退出登录触发的清理
              const toRemove = keys.filter(k => 
                !k.startsWith("pref_") && 
                k !== "username"  // 只清数据
              );
              
              if (toRemove.length > 0) {
                if (toRemove.filter(k => k === "zju_session_vs")) console.log("[session cleaned]");
                await AsyncStorage.multiRemove(toRemove);
              }
              Alert.alert("完成", `已清除 ${toRemove.length} 项缓存数据`);
            } catch (e) {
              Alert.alert("错误", "清除缓存失败");
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={{
          fontSize: 28, fontWeight: "700", fontFamily: ff,
          color: colors.foreground, textAlign: "center", marginBottom: 2,
        }}>
          设置
        </Text>

        {/* Profile */}
        {authState.userToken && <ProfileCard username={authState.username} name={authState.name} />}

        {/* Appearance */}
        <SettingsSection title="外观">
          <View style={{ paddingTop: 14 }}>
            <Text style={{
              fontSize: 12, fontWeight: "500", color: colors.muted, fontFamily: ff,
              paddingHorizontal: 16, marginBottom: 10,
              borderRadius: 10,
            }}>
              主题模式
            </Text>
            <ThemeSegment />
          </View>
          <SettingsToggleRow
            icon="moon.fill"
            iconBg="#1c1c1e"
            label="纯黑深色模式"
            sub="深色模式下页面底色改为纯黑，OLED 屏更省电"
            value={amoledDark}
            onValueChange={setAmoledDark}
          />
          <SettingsRow
            icon="pencil"
            iconBg={primaryColor}
            label="个性化"
            value="颜色与样式"
            onPress={() => router.push("/personalization")}
            last
          />
        </SettingsSection>

        {/* Schedule tools */}
        <SettingsSection title="课表">
          <SettingsRow
            icon="plus.circle.fill"
            iconBg="#10b981"
            label="自定义课程"
            value="实验课 / 社团等"
            onPress={() => router.push("/custom-courses")}
          />
          <SettingsRow
            icon="calendar"
            iconBg="#f59e0b"
            label="导出课表到日历"
            value={exporting ? "导出中…" : ".ics"}
            onPress={handleExportIcs}
            last
          />
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection title="通知">
          <SettingsToggleRow
            icon="bell.badge.fill"
            iconBg="#ef4444"
            label="出分提醒"
            sub="后台定期检查，有新成绩时通知（约每 2 小时）"
            value={gradeNotify}
            onValueChange={toggleGradeNotify}
          />
          <SettingsToggleRow
            icon="alarm.fill"
            iconBg="#8b5cf6"
            label="作业与考试提醒"
            sub="截止 / 开考前 24 小时和 2 小时各提醒一次"
            value={reminders}
            onValueChange={toggleReminders}
            last
          />
        </SettingsSection>

        {/* About*/}
        <SettingsSection title="关于">
          <SettingsRow
            icon="person.fill"
            iconBg={primaryColor}
            label="关于 ZJU 课迹"
            value={`v${version}`}
            onPress={() => router.push("/about")}
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
        
        
        {/* 诊断工具 */}
        {isDiagEnabled && (
          <SettingsSection title="诊断">
            <SettingsRow
              icon="list.bullet"
              iconBg="#64748b"
              label="诊断日志"
              value="调试用"
              onPress={() => router.push("/diagnostic-logs")}
              last
            />
          </SettingsSection>
        )}

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
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.error, fontFamily: ff }}>
                  退出登录
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {/*<TouchableOpacity onPress={() => router.push("/dev/login-debug")}>
          <Text>🔧 CAS 调试</Text>
        </TouchableOpacity>*/}
      </ScrollView>

      {/* 导出学期多选弹窗 */}
      <Modal transparent visible={exportPickerVisible} animationType="fade" onRequestClose={() => setExportPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{
            width: "100%", maxWidth: 340, borderRadius: r + 4,
            backgroundColor: colors.background, overflow: "hidden",
            borderWidth: 0.5, borderColor: colors.border,
          }}>
            <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: ff }}>
                选择要导出的学期
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, fontFamily: ff }}>
                可多选，导出为一个 .ics 文件
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {exportSemesters.map(s => {
                const key = `${s.yearValue}|${s.termValue}`;
                const checked = !!exportChecked[key];
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setExportChecked(prev => ({ ...prev, [key]: !prev[key] }))}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 12,
                      paddingHorizontal: 18, paddingVertical: 13,
                      borderTopWidth: 0.5, borderTopColor: colors.border,
                    }}
                  >
                    <View style={{
                      width: 21, height: 21, borderRadius: 11,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: checked ? primaryColor : "transparent",
                      borderWidth: checked ? 0 : 1.5, borderColor: colors.border,
                    }}>
                      {checked && <IconSymbol name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: ff }}>
                      {s.label}
                    </Text>
                    {s.isCurrent && (
                      <Text style={{ fontSize: 11, color: primaryColor, fontWeight: "600", fontFamily: ff }}>当前</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: "row", borderTopWidth: 0.5, borderTopColor: colors.border }}>
              <TouchableOpacity
                onPress={() => setExportPickerVisible(false)}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ fontSize: 15, color: colors.muted, fontFamily: ff }}>取消</Text>
              </TouchableOpacity>
              <View style={{ width: 0.5, backgroundColor: colors.border }} />
              <TouchableOpacity
                disabled={!Object.values(exportChecked).some(Boolean)}
                onPress={() => {
                  const targets = exportSemesters.filter(s => exportChecked[`${s.yearValue}|${s.termValue}`]);
                  setExportPickerVisible(false);
                  doExport(targets);
                }}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center", opacity: Object.values(exportChecked).some(Boolean) ? 1 : 0.4 }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: primaryColor, fontFamily: ff }}>
                  导出（{Object.values(exportChecked).filter(Boolean).length}）
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}