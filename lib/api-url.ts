import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDefaultApiBaseUrl } from '@/constants/oauth';

const STORAGE_KEY = ''; // 存储自定义 URL 的键

// 内存变量，保存当前实际使用的 URL
let currentApiBaseUrl: string | null = null;

// 异步加载存储的自定义 URL（在应用启动时调用）
export async function loadCustomApiUrl() {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    currentApiBaseUrl = stored || null;
}

// 同步获取当前 URL（供 getApiBaseUrl 使用）
export function getCurrentApiBaseUrl(): string {
    // 如果有自定义值，直接返回；否则返回默认值
    return currentApiBaseUrl ?? getDefaultApiBaseUrl();
}

// 更新自定义 URL（由设置页面调用）
export async function setCustomApiUrl(url: string) {
    await AsyncStorage.setItem(STORAGE_KEY, url);
    currentApiBaseUrl = url; // 立即更新内存
}

// 重置为默认 URL
export async function resetCustomApiUrl() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    currentApiBaseUrl = null;
}