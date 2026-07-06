/**
 * 已下载课件的本地索引：uploadId → 本地 fileUri。
 * 打开前校验文件仍存在（可能被系统清理）。索引 key = courseware_cache_${username}。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const keyFor = (username: string) => `courseware_cache_${username}`;

async function readIndex(username: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(username));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getCachedFile(username: string, uploadId: number): Promise<string | null> {
  const idx = await readIndex(username);
  const uri = idx[String(uploadId)];
  if (!uri) return null;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  if (info?.exists) return uri;
  delete idx[String(uploadId)];
  await AsyncStorage.setItem(keyFor(username), JSON.stringify(idx)).catch(() => {});
  return null;
}

export async function putCachedFile(username: string, uploadId: number, fileUri: string): Promise<void> {
  const idx = await readIndex(username);
  idx[String(uploadId)] = fileUri;
  await AsyncStorage.setItem(keyFor(username), JSON.stringify(idx)).catch(() => {});
}

export async function clearCoursewareCache(username: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(username)).catch(() => {});
  const dir = `${FileSystem.documentDirectory}courseware/`;
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
}
