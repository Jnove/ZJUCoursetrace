/**
 * 诊断日志查看器，从 设置 → 诊断日志 进入。
 * 支持按等级/标签筛选，可导出/清除。
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTheme } from "@/lib/theme-provider";
import { useRouter } from "expo-router";
import {
  readLogs,
  clearLogs,
  serializeLogs,
  LogEntry,
  LogLevel,
  LogTag,
} from "@/lib/diagnostic-log";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

const TAG_LABELS: Record<LogTag, string> = {
  SCHEDULE: "课表",
  ACADEMIC: "学业",
  SESSION:  "会话",
  CONTEXT:  "上下文",
  NETWORK:  "网络",
};

type LevelStyle = { label: string; bg: string; text: string };
const LEVEL_CONFIG: Record<LogLevel, LevelStyle> = {
  info:  { label: "INFO",  bg: "rgba(107,114,128,0.13)", text: "#6b7280" },
  warn:  { label: "WARN",  bg: "rgba(245,158,11,0.15)",  text: "#d97706" },
  error: { label: "ERROR", bg: "rgba(239,68,68,0.15)",   text: "#ef4444" },
};

type Filter = "all" | "anomaly" | LogTag;
const FILTER_DEFS: { key: Filter; label: string }[] = [
  { key: "all",      label: "全部"    },
  { key: "anomaly",  label: "⚠ 异常"  },
  { key: "SCHEDULE", label: "课表"    },
  { key: "ACADEMIC", label: "学业"    },
  { key: "SESSION",  label: "会话"    },
  { key: "CONTEXT",  label: "上下文"  },
];

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function fmtTime(ts: string): string {
  // "2026-03-30T12:34:56.789Z" → "03-30 12:34:56"
  return ts.slice(5, 19).replace("T", " ");
}

function hexToRgba(hex: string, a: number) {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${a})`;
}

// ─── 日志条目组件 ──────────────────────────────────────────────────────────────

function LogItem({ entry }: { entry: LogEntry }) {
  const colors  = useColors();
  const [open, setOpen] = useState(false);
  const lvl     = LEVEL_CONFIG[entry.level];
  const hasData = !!entry.data && Object.keys(entry.data).length > 0;

  const rowBg =
    entry.level === "error" ? hexToRgba("#ef4444", 0.04) :
    entry.level === "warn"  ? hexToRgba("#f59e0b", 0.04) :
    "transparent";

  return (
    <TouchableOpacity
      onPress={() => hasData && setOpen(v => !v)}
      activeOpacity={hasData ? 0.65 : 1}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        backgroundColor: rowBg,
      }}
    >
      {/* 元信息行 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 }}>
        <Text style={{
          fontSize: 10,
          color: colors.muted,
          fontVariant: ["tabular-nums"],
          letterSpacing: 0.2,
        }}>
          {fmtTime(entry.ts)}
        </Text>

        <View style={{
          paddingHorizontal: 5, paddingVertical: 1,
          borderRadius: 4, backgroundColor: lvl.bg,
        }}>
          <Text style={{ fontSize: 9, fontWeight: "700", color: lvl.text }}>
            {lvl.label}
          </Text>
        </View>

        <View style={{
          paddingHorizontal: 5, paddingVertical: 1,
          borderRadius: 4, backgroundColor: colors.surface,
          borderWidth: 0.5, borderColor: colors.border,
        }}>
          <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>
            {TAG_LABELS[entry.tag] ?? entry.tag}
          </Text>
        </View>

        {hasData && (
          <Text style={{ fontSize: 10, color: colors.muted, marginLeft: "auto" }}>
            {open ? "▲" : "▼"}
          </Text>
        )}
      </View>

      {/* 消息 */}
      <Text style={{
        fontSize: 12,
        color: entry.level === "info" ? colors.foreground : lvl.text,
        lineHeight: 17,
      }}>
        {entry.msg}
      </Text>

      {/* 展开的 data */}
      {open && entry.data && (
        <Text style={{
          fontSize: 10,
          color: colors.muted,
          fontFamily: "monospace",
          marginTop: 6,
          padding: 7,
          borderRadius: 5,
          backgroundColor: colors.surface,
          lineHeight: 15,
        }}>
          {JSON.stringify(entry.data, null, 2)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── 主屏幕 ────────────────────────────────────────────────────────────────────

export default function DiagnosticLogsScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const { primaryColor } = useTheme();

  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLogs(await readLogs());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── 操作 ──────────────────────────────────────────────────────────────────

  const handleClear = () => {
    Alert.alert("清除日志", "确定要清除所有诊断日志吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "清除", style: "destructive",
        onPress: async () => { await clearLogs(); setLogs([]); },
      },
    ]);
  };

  const handleExport = async () => {
    if (logs.length === 0) { Alert.alert("提示", "没有日志可以导出"); return; }
    try {
      await Share.share({
        message: serializeLogs(logs),
        title: "ZJU课迹诊断日志",
      });
    } catch {}
  };

  // ── 过滤 ──────────────────────────────────────────────────────────────────

  const filtered = logs.filter(e => {
    if (filter === "all")     return true;
    if (filter === "anomaly") return e.level !== "info";
    return e.tag === (filter as LogTag);
  });

  const anomalyCount = logs.filter(e => e.level !== "info").length;
  const warnCount    = logs.filter(e => e.level === "warn").length;
  const errorCount   = logs.filter(e => e.level === "error").length;

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="flex-1 bg-surface">

      {/* ── 导航栏 */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <IconSymbol name="chevron.left" size={22} color={primaryColor} />
        </TouchableOpacity>

        <Text style={{
          flex: 1, textAlign: "center",
          fontSize: 17, fontWeight: "600", color: colors.foreground,
        }}>
          诊断日志
        </Text>

        <View style={{ flexDirection: "row", gap: 16 }}>
          <TouchableOpacity
            onPress={handleExport}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: primaryColor }}>
              导出
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.error }}>
              清除
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 统计条 */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: colors.background,
        borderBottomWidth: 0.5, borderBottomColor: colors.border,
        gap: 8,
      }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          共 {logs.length} 条
        </Text>

        {warnCount > 0 && (
          <View style={{
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
            backgroundColor: "rgba(245,158,11,0.14)",
          }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#d97706" }}>
              ⚠ {warnCount} 警告
            </Text>
          </View>
        )}

        {errorCount > 0 && (
          <View style={{
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
            backgroundColor: "rgba(239,68,68,0.13)",
          }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#ef4444" }}>
              ✕ {errorCount} 错误
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={load}
          style={{ marginLeft: "auto" }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 12, color: primaryColor }}>刷新</Text>
        </TouchableOpacity>
      </View>

      {/* ── 筛选标签 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, backgroundColor: colors.background, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 7, gap: 7, flexDirection: "row" }}
      >
        {FILTER_DEFS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
                backgroundColor: active ? primaryColor : colors.surface,
                borderWidth: active ? 0 : 0.5, borderColor: colors.border,
              }}
            >
              <Text style={{
                fontSize: 12, fontWeight: "500",
                color: active ? "#fff" : colors.foreground,
              }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── 内容区 */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{
          flex: 1, justifyContent: "center", alignItems: "center",
          gap: 10, paddingHorizontal: 32,
        }}>
          <Text style={{ fontSize: 14, color: colors.muted }}>
            {logs.length === 0 ? "暂无日志记录" : "当前筛选下无记录"}
          </Text>
          {logs.length === 0 && (
            <Text style={{
              fontSize: 12, color: colors.muted,
              textAlign: "center", lineHeight: 18,
            }}>
              当课表、学期列表、成绩或考试数据加载为空时，将自动记录诊断日志。
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => e.id}
          renderItem={({ item }) => <LogItem entry={item} />}
          style={{ backgroundColor: colors.background }}
          showsVerticalScrollIndicator={false}
          // 条目较多时保持性能
          removeClippedSubviews
          windowSize={10}
          initialNumToRender={30}
        />
      )}
    </ScreenContainer>
  );
}