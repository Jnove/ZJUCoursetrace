/**
 * 轻量级诊断日志工具。
 * 所有写入操作静默失败，绝不影响主流程。
 * 最多保留 500 条，超出后丢弃最旧的。
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const LOG_KEY = "diag_logs_v1";
const MAX_ENTRIES = 500;

export type LogLevel = "info" | "warn" | "error";
export type LogTag = "SCHEDULE" | "ACADEMIC" | "SESSION" | "CONTEXT" | "NETWORK";

export interface LogEntry {
    id: string;
    ts: string; // ISO 8601
    level: LogLevel;
    tag: LogTag;
    msg: string;
    data?: Record<string, unknown>;
}

// ─── 内部读写 ──────────────────────────────────────────────────────────────────

async function _read(): Promise<LogEntry[]> {
    try {
        const raw = await AsyncStorage.getItem(LOG_KEY);
        return raw ? (JSON.parse(raw) as LogEntry[]) : [];
    } catch {
        return [];
    }
}


/**
 * 写入一条日志。
 * 静默失败，不抛出任何异常。
 */
export async function writeLog(
    tag: LogTag,
    msg: string,
    level: LogLevel = "info",
    data?: Record<string, unknown>,
): Promise<void> {
    if (!process.env.EXPO_PUBLIC_ENABLE_DIAG_LOG) return;
    try {
        const entries = await _read();
        const entry: LogEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ts: new Date().toISOString(),
            level,
            tag,
            msg,
            ...(data !== undefined ? { data } : {}),
        };
        const next = [...entries, entry];
        await AsyncStorage.setItem(
            LOG_KEY,
            JSON.stringify(
                next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next,
            ),
        );
    } catch {
        // 日志系统自身的错误不应影响 App
    }
}

/** 读取所有日志，最新的在前。 */
export async function readLogs(): Promise<LogEntry[]> {
    return (await _read()).reverse();
}

/** 清除所有日志。 */
export async function clearLogs(): Promise<void> {
    try {
        await AsyncStorage.removeItem(LOG_KEY);
    } catch { }
}

/**
 * 序列化日志为纯文本，用于分享/复制。
 * 注意：entries 应为 readLogs() 的结果（已倒序），
 * 此函数内部再反转回时间正序输出。
 */
export function serializeLogs(entries: LogEntry[]): string {
    return [...entries]
        .reverse()
        .map((e) => {
            const time = e.ts.replace("T", " ").slice(0, 19);
            const dataStr = e.data ? ` | ${JSON.stringify(e.data)}` : "";
            return `[${time}] [${e.level.toUpperCase()}] [${e.tag}] ${e.msg}${dataStr}`;
        })
        .join("\n");
}