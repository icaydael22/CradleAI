// // import * as Notifications from 'expo-notifications';
// import { Platform } from 'react-native';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// // import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
// // Request permission for notifications
// export async function requestNotificationsPermission() {
//   try {
//     const { status: existingStatus } = await Notifications.getPermissionsAsync();
//     let finalStatus = existingStatus;
    
//     if (existingStatus !== 'granted') {
//       const { status } = await Notifications.requestPermissionsAsync();
//       finalStatus = status;
//     }
    
//     if (finalStatus !== 'granted') {
//       console.log('未获得通知权限');
//       return false;
//     }
    
//     return true;
//   } catch (error) {
//     console.error('请求通知权限失败:', error);
//     return false;
//   }
// }

// // Configure notification behavior
// export function configureNotifications() {
//   Notifications.setNotificationHandler({
//     handleNotification: async () => ({
//       shouldShowAlert: true,
//       shouldPlaySound: true,
//       shouldSetBadge: false,
//     }),
//   });
// }

// // Schedule a notification for a circle post
// export async function scheduleCirclePostNotification(
//   characterName: string,
//   characterId: string,
//   postContent: string
// ): Promise<boolean> {
//   try {
//     // Request permission if needed
//     const hasPermission = await requestNotificationsPermission();
//     if (!hasPermission) {
//       console.log('没有通知权限，无法发送朋友圈通知');
//       return false;
//     }
    
//     // Configure notifications
//     configureNotifications();
    
//     // Create notification content
//     const notificationContent = postContent.length > 80 
//       ? `${postContent.substring(0, 80)}...` 
//       : postContent;
    
//     // Schedule the notification - Fix: Add required 'type' property to trigger
//     await Notifications.scheduleNotificationAsync({
//       content: {
//         title: `${characterName}发布了朋友圈`,
//         body: notificationContent,
//         data: {
//           type: 'circle_post',
//           characterId,
//           postContent
//         },
//       },
//       trigger: { 
//         seconds: 5, // Schedule for 5 seconds later for testing
//         type: SchedulableTriggerInputTypes.TIME_INTERVAL, // Fix: Add 'type' property to trigger
//       },
//     });
    
//     console.log(`已为角色 ${characterName} 的朋友圈安排通知`);
//     return true;
//   } catch (error) {
//     console.error('安排朋友圈通知失败:', error);
//     return false;
//   }
// }

// // Handle notification interaction
// export function setupNotificationListener(
//   onNotificationReceived: (notification: Notifications.Notification) => void
// ) {
//   // Set up notification received listener
//   const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
//     onNotificationReceived(notification);
//   });
  
//   // Set up notification response listener
//   const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
//     // Handle notification interaction here
//     const data = response.notification.request.content.data;
//     console.log('用户点击了通知:', data);
    
//     // You can navigate to the post or perform other actions here
//   });
  
//   // Return unsubscribe function
//   return () => {
//     receivedSubscription.remove();
//     responseSubscription.remove();
//   };
// }
