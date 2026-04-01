import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { Course } from './schedule-context';

const TASK_NAME = 'COURSE_NOTIFICATION_TASK';
const NOTIFICATION_ID = 'course-status';

export async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: '课程提醒',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

export async function updateCourseNotification(
  ongoing: Course | null,
  next: Course | null,
  countdown: string,
) {
  if (Platform.OS === 'web') return;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  if (!ongoing && !next) {
    await clearCourseNotification();
    return;
  }

  const title = ongoing ? `${ongoing.name}` : `下节课：${next!.name}`;
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
    },
    trigger: null,
  });
}

// 清除通知（退出登录或无课时调用）
export async function clearCourseNotification() {
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch { }
}