/**
 * lib/course-notification.ts
 *
 * 前台：每秒由 index.tsx 调用 updateCourseNotification，实时刷新倒计时。
 * 后台：expo-background-task（Android → WorkManager，iOS → BGTaskScheduler）定期唤醒，
 *       从 AsyncStorage 读取课程截止时间戳，自行计算剩余时间并刷新通知，
 *       不依赖 JS setInterval（后台 setInterval 会被系统挂起）。
 *
 * ⚠ 平台限制：后台唤醒最短间隔约 15 分钟，且由系统调度（iOS 尤甚），
 *   无法做到后台每秒刷新——这是系统能力上限。因此后台通知的倒计时是「粗粒度」的，
 *   回到前台后立即恢复每秒精确刷新。
 *
 * 里程碑预排（缓解两次唤醒之间倒计时冻结）：
 *   每次进入后台 / 后台唤醒时，用 scheduleNotificationAsync 预排「下一个里程碑」
 *   定时通知（距上课 60/30/10/5 分钟、上课了；距下课 30/10/5 分钟、已下课）。
 *   内容在排的时候写死，由系统闹钟准点投递，不需要唤醒 App。
 *   同一 identifier 只保留一枚 pending：窗口内（下次唤醒前 ~16 分钟）优先排最贴近
 *   deadline 的一枚，窗口外兜底排最近的一枚（防 Doze 拖延唤醒时完全断更）。
 *   回到前台 / 清除通知时必须取消 pending，否则过期里程碑会覆盖前台实时通知。
 */

import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Course } from './schedule-context';
import { checkNewGradesIfDue } from './grade-watcher';
import { setupReminderChannel } from './reminder-service';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const NOTIFICATION_ID = 'course-status';
const CHANNEL_ID      = 'course-status';
const BG_TASK_NAME    = 'COURSE_NOTIFICATION_BG';
const BG_STATE_KEY    = 'course_bg_state_v1';

// ─── 后台状态结构 ─────────────────────────────────────────────────────────────

interface BgState {
  type: 'ongoing' | 'next';
  name: string;
  classroom: string;
  /** 时间戳（ms）：ongoing → 下课时刻，next → 上课时刻 */
  deadlineMs: number;
}

// ─── 模块级前台状态 ───────────────────────────────────────────────────────────

let _isBg      = false;
let _lastTitle = '';
let _lastBody  = '';

/** 由 AppState 监听器调用 */
export function setAppInBackground(bg: boolean) {
  _isBg = bg;
  // 回到前台：取消 pending 的里程碑通知，否则它稍后触发会覆盖前台的实时倒计时
  if (!bg && Platform.OS !== 'web') {
    Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  }
}

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function fmtCountdown(sec: number): string {
  const h  = Math.floor(sec / 3600);
  const m  = Math.floor((sec % 3600) / 60);
  const s  = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 从 periodTime "HH:MM—HH:MM" 解析今天的开始或结束 ms 时间戳 */
function parseTimeToMs(periodTime: string, part: 'start' | 'end'): number | null {
  const m = part === 'start'
    ? periodTime.match(/^(\d{2}):(\d{2})/)
    : periodTime.match(/[—\-](\d{2}):(\d{2})$/);
  if (!m) return null;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime() + (parseInt(m[1]) * 3600 + parseInt(m[2]) * 60) * 1000;
}

/** 统一的通知发布：Android 走低优先级 course-status 渠道（不弹横幅、不震动） */
async function postNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title, body, sticky: true, autoDismiss: false },
    // Android 需通过 trigger.channelId 指定渠道；iOS 用 null 立即展示
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

// ─── 里程碑预排 ───────────────────────────────────────────────────────────────

/** 提前量（分钟），降序排列 → fireAt 升序 */
const MILESTONES_NEXT    = [60, 30, 10, 5, 0];
const MILESTONES_ONGOING = [30, 10, 5, 0];
/** 下次后台唤醒大约在 15 分钟后，窗口略放宽 */
const WAKEUP_WINDOW_MS = 16 * 60 * 1000;

function milestoneText(state: BgState, minutesLeft: number): { title: string; body: string } {
  if (state.type === 'ongoing') {
    return minutesLeft <= 0
      ? { title: state.name, body: `${state.classroom} · 已下课` }
      : { title: state.name, body: `${state.classroom} · 距下课 ${minutesLeft} 分钟` };
  }
  return minutesLeft <= 0
    ? { title: state.name, body: `${state.classroom} · 上课了` }
    : { title: `下节课：${state.name}`, body: `${state.classroom} · 距上课 ${minutesLeft} 分钟` };
}

/**
 * 预排下一枚里程碑通知（同 identifier，fire 时替换当前常驻通知，不堆叠）。
 * 同一时刻最多一枚 pending：优先排唤醒窗口内最贴近 deadline 的一枚
 * （比如 T-10/T-5/T-0 都在窗口内时排 T-0），窗口外则兜底排最近的一枚。
 */
async function scheduleNextMilestone(state: BgState) {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID); } catch {}

  const now = Date.now();
  const offsets = state.type === 'ongoing' ? MILESTONES_ONGOING : MILESTONES_NEXT;
  const future = offsets
    .map(min => ({ min, fireAt: state.deadlineMs - min * 60_000 }))
    .filter(m => m.fireAt > now + 5_000); // 5 秒余量：马上要到的时刻由立即通知覆盖
  if (future.length === 0) return;

  const inWindow = future.filter(m => m.fireAt <= now + WAKEUP_WINDOW_MS);
  const target = inWindow.length > 0 ? inWindow[inWindow.length - 1] : future[0];

  const { title, body } = milestoneText(state, target.min);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: { title, body, sticky: true, autoDismiss: false },
      trigger: Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(target.fireAt), channelId: CHANNEL_ID }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(target.fireAt) },
    });
  } catch { /* 排失败不致命，下次唤醒会重试 */ }
}

// ─── 后台任务定义（必须在模块顶层，组件之外）────────────────────────────────

TaskManager.defineTask(BG_TASK_NAME, async () => {
  // 顺路检查是否有新成绩（内部自带 4 小时节流 + 开关判断，异常静默）
  await checkNewGradesIfDue();

  try {
    const raw = await AsyncStorage.getItem(BG_STATE_KEY);
    if (!raw) return BackgroundTask.BackgroundTaskResult.Success;

    const state: BgState = JSON.parse(raw);
    const remaining = Math.floor((state.deadlineMs - Date.now()) / 1000);

    if (remaining <= 0) {
      await AsyncStorage.removeItem(BG_STATE_KEY);
      try { await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID); } catch {}
      try { await Notifications.dismissNotificationAsync(NOTIFICATION_ID); } catch {}
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const countdown = fmtCountdown(remaining);
    const title = state.type === 'ongoing' ? state.name : `下节课：${state.name}`;
    const body  = state.type === 'ongoing'
      ? `${state.classroom} · 距下课 ${countdown}`
      : `${state.classroom} · 距上课 ${countdown}`;

    await postNotification(title, body);
    // 预排下一枚里程碑，覆盖到下次唤醒之前的关键时刻
    await scheduleNextMilestone(state);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/** App 启动时调用一次：建立通知渠道 + 注册后台任务 */
export async function setupNotificationChannel() {
  if (Platform.OS === 'web') return;

  // 作业/考试/出分提醒共用的普通优先级渠道
  await setupReminderChannel();

  if (Platform.OS === 'android') {
    // LOW 级别：静默常驻，不弹横幅、不震动
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '课程提醒',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      sound: null,
      vibrationPattern: null,
      enableLights: false,
    });
  }

  // 注册后台任务（已注册则跳过）。minimumInterval 单位为「分钟」，系统下限约 15 分钟。
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(BG_TASK_NAME, { minimumInterval: 15 });
    }
  } catch (e) {
    // 模拟器或不支持的平台静默忽略
    console.warn('[notification] 后台任务注册失败:', e);
  }
}

/**
 * 前台每秒调用。
 * _isBg = true 时直接 return，防止 Android 将 scheduleNotificationAsync
 * 误判为前台操作，从而触发 App 闪回前台。
 */
export async function updateCourseNotification(
  ongoing: Course | null,
  next: Course | null,
  countdown: string,
) {
  if (Platform.OS === 'web') return;
  if (_isBg) return;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  if (!ongoing && !next) {
    _lastTitle = '';
    _lastBody  = '';
    await clearCourseNotification();
    return;
  }

  const title = ongoing ? ongoing.name : `下节课：${next!.name}`;
  const body  = ongoing
    ? `${ongoing.classroom} · 距下课 ${countdown}`
    : `${next!.classroom} · 距上课 ${countdown}`;

  if (title === _lastTitle && body === _lastBody) return;
  _lastTitle = title;
  _lastBody  = body;

  await postNotification(title, body);
}

/**
 * App 切换到后台时调用（在 setAppInBackground(true) 之后立即调用）：
 * 1. 把课程结束/开始时间戳写入 AsyncStorage，供后台任务读取
 * 2. 立即发布一次带精确倒计时的通知，弥补后台任务首次唤醒前的空白
 */
export async function saveBgStateAndNotify(
  ongoing: Course | null,
  next: Course | null,
  nowMs: number,
) {
  if (Platform.OS === 'web') return;

  if (!ongoing && !next) {
    await AsyncStorage.removeItem(BG_STATE_KEY).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
    return;
  }

  let state: BgState | null = null;

  if (ongoing?.periodTime) {
    const deadlineMs = parseTimeToMs(ongoing.periodTime, 'end');
    if (deadlineMs) {
      state = { type: 'ongoing', name: ongoing.name, classroom: ongoing.classroom, deadlineMs };
    }
  } else if (next?.periodTime) {
    const deadlineMs = parseTimeToMs(next.periodTime, 'start');
    if (deadlineMs) {
      state = { type: 'next', name: next.name, classroom: next.classroom, deadlineMs };
    }
  }

  if (!state) {
    await AsyncStorage.removeItem(BG_STATE_KEY).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
    return;
  }

  await AsyncStorage.setItem(BG_STATE_KEY, JSON.stringify(state));

  // 立即发一次通知（此时 _isBg 已为 true，绕过前台去重逻辑）
  const remaining = Math.floor((state.deadlineMs - nowMs) / 1000);
  if (remaining > 0) {
    const countdown = fmtCountdown(remaining);
    const title = state.type === 'ongoing' ? state.name : `下节课：${state.name}`;
    const body  = state.type === 'ongoing'
      ? `${state.classroom} · 距下课 ${countdown}`
      : `${state.classroom} · 距上课 ${countdown}`;
    _lastTitle = title;
    _lastBody  = body;
    await postNotification(title, body);
    // 预排里程碑：立即通知发完后再排，避免顺序问题
    await scheduleNextMilestone(state);
  }
}

/** 退出登录 / 无课时调用 */
export async function clearCourseNotification() {
  _lastTitle = '';
  _lastBody  = '';
  await AsyncStorage.removeItem(BG_STATE_KEY).catch(() => {});
  try { await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID); } catch {}
  try { await Notifications.dismissNotificationAsync(NOTIFICATION_ID); } catch {}
}
