// // import * as Notifications from 'expo-notifications';
// import * as Device from 'expo-device';
// import { Platform } from 'react-native';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// // import { SchedulableTriggerInputTypes } from 'expo-notifications';

// // Configure notifications to show alerts while app is in foreground
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//   }),
// });

// export async function registerForPushNotificationsAsync(): Promise<string | null> {
//   let token: string | null = null;
  
//   // Only process on physical devices
//   if (Device.isDevice) {
//     const { status: existingStatus } = await Notifications.getPermissionsAsync();
//     let finalStatus = existingStatus;
    
//     // If permission isn't determined yet, request permission
//     if (existingStatus !== 'granted') {
//       const { status } = await Notifications.requestPermissionsAsync();
//       finalStatus = status;
//     }
    
//     // If permission still not granted, return null
//     if (finalStatus !== 'granted') {
//       console.log('未获得通知权限!');
//       return null;
//     }
    
//     // Get the Expo push token
//     try {
//       const expoPushToken = await Notifications.getExpoPushTokenAsync({
//         projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
//       });
//       token = expoPushToken.data;
//       console.log('Expo通知令牌:', token);
//     } catch (error) {
//       console.error('获取推送令牌失败:', error);
//       return null;
//     }
//   } else {
//     console.log('必须使用实体设备来获取通知权限');
//   }

//   // Set up special notification channel for Android
//   if (Platform.OS === 'android') {
//     Notifications.setNotificationChannelAsync('circle-notifications', {
//       name: '朋友圈通知',
//       importance: Notifications.AndroidImportance.HIGH,
//       vibrationPattern: [0, 250, 250, 250],
//       lightColor: '#FF8C00',
//       description: '接收角色发布的朋友圈内容通知',
//     });
//   }

//   return token;
// }

// export async function isNotificationsEnabled(): Promise<boolean> {
//   try {
//     const notificationSetting = await AsyncStorage.getItem('circle_notifications_enabled');
    
//     // If setting exists and is true
//     if (notificationSetting === 'true') {
//       // Also check device permissions
//       const { status } = await Notifications.getPermissionsAsync();
//       return status === 'granted';
//     }
    
//     return false;
//   } catch (error) {
//     console.error('检查通知设置时出错:', error);
//     return false;
//   }
// }

// export async function scheduleCirclePostNotification(
//   characterName: string,
//   characterId: string,
//   content: string,
//   delay: number = 2 // Default delay in seconds
// ): Promise<string | null> {
//   try {
//     // Check if notifications are enabled
//     if (!(await isNotificationsEnabled())) {
//       console.log('朋友圈通知已禁用，跳过通知');
//       return null;
//     }

//     // Trim content for preview
//     const contentPreview = content.length > 80 ? content.substring(0, 80) + '...' : content;

//     // Schedule the notification with the correct trigger type from enum
//     const notificationId = await Notifications.scheduleNotificationAsync({
//       content: {
//         title: `${characterName} 发布了朋友圈`,
//         body: contentPreview,
//         data: {
//           type: 'circle_post',
//           characterId,
//           postContent: content,
//         },
//         sound: 'default',
//       },
//       trigger: {
//         type: SchedulableTriggerInputTypes.TIME_INTERVAL,
//         seconds: delay
//       },
//     });

//     console.log(`为角色 ${characterName} 的朋友圈发布安排了通知，ID: ${notificationId}`);
//     return notificationId;
//   } catch (error) {
//     console.error('安排通知失败:', error);
//     return null;
//   }
// }

// export async function cancelNotification(notificationId: string): Promise<void> {
//   try {
//     await Notifications.cancelScheduledNotificationAsync(notificationId);
//     console.log(`取消了通知 ID: ${notificationId}`);
//   } catch (error) {
//     console.error('取消通知失败:', error);
//   }
// }

// export function listenForNotificationInteractions(
//   handleNotification: (notification: Notifications.Notification) => void
// ): () => void {
//   // Listen for notification received while app is foregrounded
//   const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
//     console.log('前台收到通知:', notification);
//     handleNotification(notification);
//   });

//   // Listen for user tapping on notification
//   const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
//     console.log('用户点击了通知:', response);
//     handleNotification(response.notification);
//   });

//   // Return function to unsubscribe both listeners
//   return () => {
//     Notifications.removeNotificationSubscription(foregroundSubscription);
//     Notifications.removeNotificationSubscription(responseSubscription);
//   };
// }
