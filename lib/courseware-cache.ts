/**
 * 已下载课件的本地索引：uploadId → 条目（本地 fileUri + 展示元数据）。
 * v1 只存 fileUri 字符串，读取时兼容（文件名/courseId 从路径反推）。
 * 打开前校验文件仍存在（可能被系统清理）。索引 key = courseware_cache_${username}。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export interface CachedCoursewareEntry {
  uri: string;
  name: string;
  courseId: number;
  courseName?: string;
  size?: number; // bytes
  at?: number;   // 下载时间 epoch ms
}

/** string = v1 旧格式（裸 fileUri） */
type StoredValue = string | CachedCoursewareEntry;

const keyFor = (username: string) => `courseware_cache_${username}`;

async function readIndex(username: string): Promise<Record<string, StoredValue>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(username));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeIndex(username: string, idx: Record<string, StoredValue>): Promise<void> {
  await AsyncStorage.setItem(keyFor(username), JSON.stringify(idx)).catch(() => {});
}

/** v1 裸 URI → 条目：从 .../courseware/{courseId}/{fileName} 反推展示信息 */
function toEntry(v: StoredValue): CachedCoursewareEntry {
  if (typeof v !== "string") return v;
  const parts = v.split("/").filter(Boolean);
  let name = parts[parts.length - 1] ?? "文件";
  try { name = decodeURIComponent(name); } catch {}
  const courseId = Number(parts[parts.length - 2]) || 0;
  return { uri: v, name, courseId };
}

export async function getCachedFile(username: string, uploadId: number): Promise<string | null> {
  const idx = await readIndex(username);
  const v = idx[String(uploadId)];
  if (!v) return null;
  const uri = typeof v === "string" ? v : v.uri;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  if (info?.exists) return uri;
  delete idx[String(uploadId)];
  await writeIndex(username, idx);
  return null;
}

export async function putCachedFile(
  username: string,
  uploadId: number,
  entry: CachedCoursewareEntry
): Promise<void> {
  const idx = await readIndex(username);
  idx[String(uploadId)] = entry;
  await writeIndex(username, idx);
}

/**
 * 列出所有已下载课件（校验文件仍存在，缺失的条目顺手从索引清掉）。
 * 按下载时间倒序（v1 旧条目无时间戳，排在最后）。
 */
export async function listCachedFiles(
  username: string
): Promise<(CachedCoursewareEntry & { uploadId: number })[]> {
  const idx = await readIndex(username);
  const out: (CachedCoursewareEntry & { uploadId: number })[] = [];
  let dirty = false;
  for (const [id, v] of Object.entries(idx)) {
    const entry = toEntry(v);
    const info = await FileSystem.getInfoAsync(entry.uri).catch(() => null);
    if (!info?.exists) {
      delete idx[id];
      dirty = true;
      continue;
    }
    out.push({
      ...entry,
      size: entry.size ?? (info as any).size,
      uploadId: Number(id),
    });
  }
  if (dirty) await writeIndex(username, idx);
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** 删除单个已下载课件（本地文件 + 索引条目）。 */
export async function removeCachedFile(username: string, uploadId: number): Promise<void> {
  const idx = await readIndex(username);
  const v = idx[String(uploadId)];
  if (!v) return;
  const uri = typeof v === "string" ? v : v.uri;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  delete idx[String(uploadId)];
  await writeIndex(username, idx);
}

export async function clearCoursewareCache(username: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(username)).catch(() => {});
  const dir = `${FileSystem.documentDirectory}courseware/`;
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
}
