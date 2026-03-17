import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { Course } from './schedule-context';

const TASK_NAME = 'COURSE_NOTIFICATION_TASK';
const NOTIFICATION_ID = 'course-status';

// Android 通知渠道
export async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('course', {
    name: '课程提醒',
    importance: Notifications.AndroidImportance.LOW, // LOW = 不响铃，静默常驻
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

// 更新通知内容
export async function updateCourseNotification(
  ongoing: Course | null,
  next: Course | null,
  countdown: string,
) {
  if (Platform.OS === 'web') return; // web 不支持

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  // 没有当前课也没有下节课，清除通知
  if (!ongoing && !next) {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
    return;
  }

  const title = ongoing
    ? `${ongoing.name}`
    : `下节课：${next!.name}`;

  const body = ongoing
    ? `${ongoing.classroom} · 距下课 ${countdown}`
    : `${next!.classroom} · 距上课 ${countdown}`;

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        data: { channelId: 'course' },
    },
    trigger: null,
  });
}

// 清除通知（退出登录或无课时调用）
export async function clearCourseNotification() {
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
}