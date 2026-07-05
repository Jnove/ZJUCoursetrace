/**
 * 自定义课程：用户手动添加的实验课/社团/补课等，仅存本地。
 *
 * 存储键带 pref_ 前缀 —— 设置页「清除缓存」会保留 pref_ 开头的 key，
 * 自定义课程属于用户数据而非可重新拉取的缓存，必须幸免。
 *
 * 合并策略：schedule-context 每次 SET_COURSES 前 merge；首页 fetchDayCourses
 * 读缓存后 merge。增删后通过 notifyCustomCoursesChanged() 通知 context 重载。
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Course } from "@/lib/schedule-context";

export interface CustomCourse extends Course {
  custom: true;
}

const keyFor = (username: string) => `pref_custom_courses_${username}`;

export async function loadCustomCourses(username: string | null): Promise<CustomCourse[]> {
  if (!username) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(username));
    return raw ? (JSON.parse(raw) as CustomCourse[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomCourses(username: string, list: CustomCourse[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(username), JSON.stringify(list));
  notifyCustomCoursesChanged();
}

export async function addCustomCourse(username: string, course: Omit<CustomCourse, "id" | "custom">): Promise<void> {
  const list = await loadCustomCourses(username);
  list.push({ ...course, id: `custom_${Date.now()}`, custom: true });
  await saveCustomCourses(username, list);
}

export async function removeCustomCourse(username: string, id: string): Promise<void> {
  const list = await loadCustomCourses(username);
  await saveCustomCourses(username, list.filter(c => c.id !== id));
}

/** 把自定义课程并入课表（自定义课程带自己的颜色，不参与图着色） */
export function mergeCustomCourses<T extends Course>(courses: T[], custom: CustomCourse[]): (T | CustomCourse)[] {
  if (custom.length === 0) return courses;
  return [...courses, ...custom];
}

// ─── 变更通知（schedule-context 订阅后重载课表）──────────────────────────────

const listeners = new Set<() => void>();

export function subscribeCustomCourses(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyCustomCoursesChanged() {
  listeners.forEach(fn => fn());
}
