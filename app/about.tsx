/**
 * About screen — version, repository, license, and auto-update.
 * Reachable from Settings → 关于.
 */

import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTheme, CARD_RADIUS_VALUES } from "@/lib/theme-provider";
import { useRouter } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import Constants from "expo-constants";
import {
  checkForUpdate,
  downloadAndInstallApk,
  openReleasePage,
  REPO_URL,
  RELEASES_URL,
  UpdateCheckResult,
  DownloadProgress,
} from "@/lib/updater";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Switch } from 'react-native';

// Helpers

function rgba(hex: string, a: number) {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
}

const APP_VERSION = Constants.expoConfig?.version ?? "1.1.0";

// Shared row

function InfoRow({
  label, value, onPress, last = false, valueColor,
}: {
  label: string; value: string;
  onPress?: () => void; last?: boolean; valueColor?: string;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
      style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 13,
        backgroundColor: colors.background,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: colors.border,
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, fontSize: 15, color: colors.foreground }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 14,
        color: valueColor ?? colors.muted,
        fontWeight: valueColor ? "500" : "400",
      }}>
        {value}
      </Text>
      {onPress && (
        <IconSymbol name="chevron.right" size={15} color={valueColor ?? colors.muted} />
      )}
    </TouchableOpacity>
  );
}

//Section

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const colors = useColors();
  const { cardRadius } = useTheme();
  const rv = CARD_RADIUS_VALUES[cardRadius];
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
        borderRadius: rv, overflow: "hidden",
        borderWidth: 0.5, borderColor: colors.border,
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
      }}>
        {children}
      </View>
    </View>
  );
}

// Update card
type UpdatePhase =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date"; version: string }
  | { phase: "available"; result: Extract<UpdateCheckResult, { hasUpdate: true }> }
  | { phase: "downloading"; progress: DownloadProgress }
  | { phase: "error"; message: string };

function UpdateCard() {
  const colors = useColors();
  const { primaryColor, cardRadius } = useTheme();
  const rv = CARD_RADIUS_VALUES[cardRadius];
  const [u, setU] = useState<UpdatePhase>({ phase: "idle" });

  const handleCheck = useCallback(async () => {
    setU({ phase: "checking" });
    try {
      const res = await checkForUpdate();
      if (!res.hasUpdate) {
        setU({ phase: "up-to-date", version: res.latestVersion });
      } else {
        setU({ phase: "available", result: res });
      }
    } catch (e) {
      setU({ phase: "error", message: e instanceof Error ? e.message : "检查更新失败" });
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (u.phase !== "available") return;
    const { result } = u;

    if (Platform.OS === "android" && result.downloadUrl) {
      const notes = result.releaseNotes?.slice(0, 280) ?? null;
      Alert.alert(
        `新版本 ${result.latestVersion}`,
        notes ?? `当前版本 ${result.currentVersion}，是否立即下载安装？`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "下载安装",
            onPress: async () => {
              try {
                setU({ phase: "downloading", progress: { bytesDownloaded: 0, bytesTotal: 0, fraction: 0 } });
                await downloadAndInstallApk(result.downloadUrl!, (p: DownloadProgress) => {
                    setU({ phase: "downloading", progress: p });
                    });
                setU({ phase: "idle" });
              } catch (e) {
                console.error("安装更新失败", e);
                setU({ phase: "error", message: e instanceof Error ? e.message : "安装失败" });
              }
            },
          },
        ],
      );
    } else {
      await openReleasePage(result.releaseUrl);
    }
  }, [u]);

  const accent =
    u.phase === "available"  ? primaryColor :
    u.phase === "error"      ? colors.error :
    u.phase === "up-to-date" ? colors.success :
    primaryColor;

  const showBorder = u.phase !== "idle" && u.phase !== "checking";

  return (
    <View style={{
      borderRadius: rv, overflow: "hidden",
      backgroundColor: colors.background,
      borderWidth: showBorder ? 1 : 0.5,
      borderColor: showBorder ? accent : colors.border,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    }}>

      {/* Idle / checking */}
      {(u.phase === "idle" || u.phase === "checking") && (
        <TouchableOpacity
          onPress={handleCheck}
          disabled={u.phase === "checking"}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}
        >
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: rgba(primaryColor, 0.11),
            alignItems: "center", justifyContent: "center",
          }}>
            {u.phase === "checking"
              ? <ActivityIndicator size="small" color={primaryColor} />
              : <IconSymbol name="square.and.arrow.down" size={18} color={primaryColor} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground }}>
              {u.phase === "checking" ? "正在检查更新…" : "检查更新"}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              当前版本 v{APP_VERSION}
            </Text>
          </View>
          {u.phase === "idle" && (
            <IconSymbol name="chevron.right" size={15} color={colors.muted} />
          )}
        </TouchableOpacity>
      )}

      {/* Up to date */}
      {u.phase === "up-to-date" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: rgba(colors.success, 0.12),
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 20, color: colors.success }}>✓</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground }}>已是最新版本</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>v{u.version}</Text>
          </View>
          <TouchableOpacity onPress={() => setU({ phase: "idle" })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>关闭</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Update available */}
      {u.phase === "available" && (
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingBottom: 12 }}>
            <View style={{
              width: 38, height: 38, borderRadius: 10,
              backgroundColor: rgba(primaryColor, 0.12),
              alignItems: "center", justifyContent: "center",
            }}>
              <IconSymbol name="square.and.arrow.down" size={18} color={primaryColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                新版本 v{u.result.latestVersion}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                当前 v{u.result.currentVersion}
              </Text>
            </View>
          </View>

          {u.result.releaseNotes && (
            <View style={{
              marginHorizontal: 16, marginBottom: 12,
              padding: 11, borderRadius: 8,
              backgroundColor: rgba(primaryColor, 0.06),
            }}>
              <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }} numberOfLines={5}>
                {u.result.releaseNotes}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
            <TouchableOpacity
              onPress={() => openReleasePage(u.result.releaseUrl)}
              activeOpacity={0.7}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                backgroundColor: rgba(primaryColor, 0.1),
                borderWidth: 0.5, borderColor: rgba(primaryColor, 0.3),
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: primaryColor }}>查看详情</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleInstall}
              activeOpacity={0.75}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                backgroundColor: primaryColor,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
                {Platform.OS === "android" && u.result.downloadUrl ? "下载安装" : "前往更新"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Downloading */}
      {u.phase === "downloading" && (
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator size="small" color={primaryColor} />
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground, flex: 1 }}>
              正在下载…
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {Math.round(u.progress.fraction * 100)}%
            </Text>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: rgba(primaryColor, 0.15), overflow: "hidden" }}>
            <View style={{
              height: "100%", width: `${u.progress.fraction * 100}%` as any,
              borderRadius: 2, backgroundColor: primaryColor,
            }} />
          </View>
          {u.progress.bytesTotal > 0 && (
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
              {(u.progress.bytesDownloaded / 1048576).toFixed(1)} / {(u.progress.bytesTotal / 1048576).toFixed(1)} MB
            </Text>
          )}
        </View>
      )}

      {/* Error */}
      {u.phase === "error" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: rgba(colors.error, 0.12),
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 20, color: colors.error }}>!</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 14, color: colors.foreground }}>{u.message}</Text>
          <TouchableOpacity onPress={() => setU({ phase: "idle" })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 13, color: primaryColor }}>重试</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function AboutScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const { primaryColor, cardRadius } = useTheme();
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);

  useEffect(() => {
    const loadAutoUpdateSetting = async () => {
      try {
        const value = await AsyncStorage.getItem('autoUpdateEnabled');
        if (value !== null) {
          setAutoUpdateEnabled(value === 'true');
        }
      } catch (e) {
        console.error('读取自动更新设置失败', e);
      }
    };
    loadAutoUpdateSetting();
  }, []);

const toggleAutoUpdate = async (value: boolean) => {
  setAutoUpdateEnabled(value);
  await AsyncStorage.setItem('autoUpdateEnabled', value.toString());
  };
  
  return (
    <ScreenContainer className="flex-1 bg-surface">
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <IconSymbol name="chevron.left" size={22} color={primaryColor} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.foreground }}>
          关于
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 52 }} showsVerticalScrollIndicator={false}>

        <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 20,
            backgroundColor: primaryColor,
            alignItems: "center", justifyContent: "center",
            shadowColor: primaryColor, shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
          }}>
            <Text style={{ fontSize: 36, color: "#fff" }}>Z</Text>
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>ZJU 课迹</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>v{APP_VERSION}</Text>
          </View>
        </View>

        {/* 更新 */}
        <View style={{ gap: 6 }}>
          <Text style={{
            fontSize: 11, fontWeight: "600", color: colors.muted,
            letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 4,
          }}>
            更新
          </Text>

          {/* 自动检查更新开关 */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 13,
            backgroundColor: colors.background,
            borderRadius: CARD_RADIUS_VALUES[cardRadius],
            borderWidth: 0.5,
            borderColor: colors.border,
            marginBottom: 8,
          }}>
            <Text style={{ fontSize: 15, color: colors.foreground }}>
              自动检查更新
            </Text>
            <Switch
              value={autoUpdateEnabled}
              onValueChange={toggleAutoUpdate}
              trackColor={{ false: colors.muted, true: primaryColor }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#fff'}
            />
          </View>

          <UpdateCard />
        </View>

        {/* 版本*/}
        <Section title="版本信息">
          <InfoRow label="版本号" value={`v${APP_VERSION}`} />
          <InfoRow
            label="平台"
            value={Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}
          />
          <InfoRow
            label="更新日志"
            value="GitHub Releases ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage(RELEASES_URL)}
            last
          />
        </Section>

        {/* 项目 */}
        <Section title="项目">
          <InfoRow
            label="源代码"
            value="GitHub ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage(REPO_URL)}
          />
          <InfoRow label="许可证" value="MIT License" last />
        </Section>

        {/* Acknowledgements */}
        <Section title="致谢">
          <InfoRow
            label="API逆向参考"
            value="celechron (GPL-v3) ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage("https://github.com/zjuers/celechron")}
          />
          <InfoRow
            label="天气数据"
            value="Open-Meteo ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage("https://open-meteo.com")}
          />
          <InfoRow
            label="每日诗词"
            value="今日诗词 ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage("https://www.jinrishici.com")}
          />
          <InfoRow
            label="IP 获取"
            value="httpbin.org/ip ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage("https://httpbin.org/ip")}
            last
          />
          <InfoRow
            label="IP 定位"
            value="api.iping.cc ↗"
            valueColor={primaryColor}
            onPress={() => openReleasePage("https://api.iping.cc")}
            last
          />
        </Section>

        {/* 底部*/}
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 18 }}>
          本应用使用浙大统一身份认证，数据直连教务系统。{"\n"}
          与浙江大学官方无关。
        </Text>

      </ScrollView>
    </ScreenContainer>
  );
}