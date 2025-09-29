import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // newer Expo includes these booleans; provide sensible defaults
      shouldShowBanner: true,
      shouldShowList: true,
    } as any),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: '默认',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
  configured = true;
}

export async function requestNotificationsPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (error) {
    console.error('请求通知权限失败:', error);
    return false;
  }
}

export async function sendLocalNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<boolean> {
  try {
    ensureConfigured();
    const granted = await requestNotificationsPermission();
    if (!granted) return false;
    await Notifications.scheduleNotificationAsync({
      content: { title: opts.title, body: opts.body, data: opts.data || {} },
      trigger: null,
    });
    return true;
  } catch (e) {
    console.error('发送本地通知失败:', e);
    return false;
  }
}

export async function sendCirclePostNotification(
  characterName: string,
  characterId: string,
  postContent: string
): Promise<boolean> {
  const preview = postContent.length > 80 ? `${postContent.slice(0, 80)}...` : postContent;
  return sendLocalNotification({
    title: `${characterName} 发布了朋友圈`,
    body: preview,
    data: { type: 'circle_post', characterId },
  });
}

export async function sendAutoMessageNotification(
  characterName: string,
  characterId: string,
  messagePreview: string
): Promise<boolean> {
  const preview = messagePreview.length > 80 ? `${messagePreview.slice(0, 80)}...` : messagePreview;
  return sendLocalNotification({
    title: `${characterName} 发来新消息`,
    body: preview,
    data: { type: 'auto_message', characterId },
  });
}

export function setupNotificationListener(
  onNotificationReceived: (notification: Notifications.Notification) => void
) {
  ensureConfigured();
  const received = Notifications.addNotificationReceivedListener(onNotificationReceived);
  const responded = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log('用户点击了通知:', data);
  });
  return () => {
    received.remove();
    responded.remove();
  };
}
