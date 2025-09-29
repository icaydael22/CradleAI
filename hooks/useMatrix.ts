// // 导入 polyfills，确保兼容性 - 统一在polyfills.ts中处理
// import '@/lib/polyfills';
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { Room, MatrixEvent, ClientEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
// import { matrixClient, MatrixCredentials } from '@/lib/matrix/client';

// export interface MatrixRoom {
//   id: string;
//   name: string;
//   topic?: string;
//   numJoinedMembers: number;
//   isDirect?: boolean;
//   unreadCount?: number;
//   highlightCount?: number;
// }

// export interface MatrixMessage {
//   id: string;
//   sender: string;
//   content: string;
//   timestamp: string;
//   messageType?: string;
//   localImageUri?: string;
//   replyTo?: {
//     eventId: string;
//     senderName: string;
//     content: string;
//   };
//   reactions?: Array<{
//     key: string;
//     count: number;
//     reacted: boolean;
//     users: string[];
//   }>;
//   edited?: boolean;
//   deleted?: boolean;
// }

// export interface MatrixUser {
//   id: string;
//   displayName?: string;
//   avatarUrl?: string;
//   presence?: 'online' | 'offline' | 'unavailable';
//   statusMsg?: string;
// }

// export interface UseMatrixReturn {
//   isConnected: boolean;
//   isLoading: boolean;
//   error: string | null;
//   rooms: MatrixRoom[];
//   currentUserId: string | null;
  
//   // 基础功能
//   login: (username: string, password: string) => Promise<void>;
//   createRoom: (name: string, topic?: string) => Promise<string>;
//   sendMessage: (roomId: string, message: string) => Promise<void>;
//   getRoomMessages: (roomId: string) => MatrixMessage[];
//   disconnect: () => void;
  
//   // 新增消息功能
//   sendImageMessage: (roomId: string, file: File) => Promise<void>;
//   sendFileMessage: (roomId: string, file: File) => Promise<void>;
//   sendVoiceMessage: (roomId: string, audioBlob: Blob, duration?: number) => Promise<void>;
//   sendVideoMessage: (roomId: string, videoFile: File) => Promise<void>;
//   editMessage: (roomId: string, originalEventId: string, newMessage: string) => Promise<void>;
//   replyToMessage: (roomId: string, originalEventId: string, originalSender: string, originalContent: string, replyMessage: string) => Promise<void>;
//   sendThreadReply: (roomId: string, threadRootEventId: string, message: string) => Promise<void>;
//   sendReaction: (roomId: string, targetEventId: string, emoji: string) => Promise<void>;
//   sendMessageWithMentions: (roomId: string, message: string, mentionUserIds: string[]) => Promise<void>;
//   deleteMessage: (roomId: string, eventId: string, reason?: string) => Promise<void>;
//   forwardMessage: (sourceRoomId: string, targetRoomId: string, eventId: string) => Promise<void>;
//   setTyping: (roomId: string, isTyping: boolean, timeout?: number) => Promise<void>;
  
//   // 房间管理功能
//   createPrivateRoom: (name: string, topic?: string, inviteUserIds?: string[]) => Promise<string>;
//   createDirectMessage: (targetUserId: string) => Promise<string>;
//   joinRoom: (roomIdOrAlias: string) => Promise<void>;
//   leaveRoom: (roomId: string) => Promise<void>;
//   inviteUser: (roomId: string, userId: string) => Promise<void>;
//   kickUser: (roomId: string, userId: string, reason?: string) => Promise<void>;
//   banUser: (roomId: string, userId: string, reason?: string) => Promise<void>;
//   unbanUser: (roomId: string, userId: string) => Promise<void>;
//   setRoomName: (roomId: string, name: string) => Promise<void>;
//   setRoomTopic: (roomId: string, topic: string) => Promise<void>;
//   setRoomAvatar: (roomId: string, avatarFile: File) => Promise<void>;
//   enableRoomEncryption: (roomId: string) => Promise<void>;
//   pinMessage: (roomId: string, eventId: string) => Promise<void>;
//   unpinMessage: (roomId: string, eventId: string) => Promise<void>;
//   getPublicRooms: (limit?: number, since?: string) => Promise<any>;
  
//   // 已读回执功能
//   sendReadReceipt: (roomId: string, eventId: string) => Promise<void>;
//   setRoomReadMarker: (roomId: string, eventId: string) => Promise<void>;
//   getRoomUnreadCount: (roomId: string) => number;
//   getRoomHighlightCount: (roomId: string) => number;
  
//   // 用户状态功能
//   setPresence: (state: 'online' | 'offline' | 'unavailable', statusMsg?: string) => Promise<void>;
//   getUserPresence: (userId: string) => any;
  
//   // 通知设置功能
//   setRoomNotificationLevel: (roomId: string, level: 'all' | 'mentions' | 'none') => Promise<void>;
//   muteRoom: (roomId: string) => Promise<void>;
//   unmuteRoom: (roomId: string) => Promise<void>;
  
//   // 搜索功能
//   searchMessages: (query: string, options?: any) => Promise<any>;
//   searchInRoom: (roomId: string, query: string, limit?: number) => Promise<any>;
//   searchUsers: (query: string, limit?: number) => Promise<any>;
// }

// export function useMatrix(): UseMatrixReturn {
//   const [isConnected, setIsConnected] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [rooms, setRooms] = useState<MatrixRoom[]>([]);
//   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
//   // 本地图片缓存
//   const [localImageCache, setLocalImageCache] = useState<Map<string, string>>(new Map());
  
//   // 使用 ref 来跟踪事件监听器
//   const eventListenersRef = useRef<{ [key: string]: Function }>({});

//   // 转换 Matrix Room 到我们的接口
//   const convertRoom = (room: Room): MatrixRoom => ({
//     id: room.roomId,
//     name: room.name || `房间 ${room.roomId.slice(-8)}`,
//     topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic || undefined,
//     numJoinedMembers: room.getJoinedMemberCount(),
//     isDirect: room.guessDMUserId() !== null,
//     unreadCount: matrixClient.getRoomUnreadNotificationCount(room.roomId),
//     highlightCount: matrixClient.getRoomHighlightCount(room.roomId)
//   });

//   // 转换 Matrix Event 到我们的消息接口
//   const convertMessage = (event: MatrixEvent): MatrixMessage => {
//     const content = event.getContent();
//     const relations = event.getRelation();
    
//     // 处理不同类型的消息内容
//     let messageContent = '';
//     let messageType = content.msgtype || 'm.text';
    
//     switch (content.msgtype) {
//       case 'm.image':
//         // 对于图片消息，返回MXC URL而不是文件名
//         messageContent = content.url || content.body || '';
//         messageType = 'm.image';
//         break;
//       case 'm.file':
//         // 对于文件消息，返回文件信息
//         messageContent = content.body || '';
//         messageType = 'm.file';
//         break;
//       case 'm.video':
//         messageContent = content.url || content.body || '';
//         messageType = 'm.video';
//         break;
//       case 'm.audio':
//         messageContent = content.url || content.body || '';
//         messageType = 'm.audio';
//         break;
//       default:
//         messageContent = content.body || '';
//         messageType = 'm.text';
//         break;
//     }

//     // 获取表情反应数据
//     const getReactions = () => {
//       const client = matrixClient.getClient();
//       if (!client) return [];
      
//       try {
//         const room = client.getRoom(event.getRoomId());
//         if (!room) return [];
        
//         // 获取该事件的所有反应
//         const reactions = room.getUnfilteredTimelineSet().findEventById(event.getId()!)?.getServerAggregatedRelation('m.annotation');
//         if (!reactions) return [];
        
//         return Object.entries(reactions).map(([key, data]: [string, any]) => ({
//           key,
//           count: data.count || 0,
//           reacted: false, // TODO: 检查当前用户是否已反应
//           users: data.users || []
//         }));
//       } catch (error) {
//         console.warn('获取反应失败:', error);
//         return [];
//       }
//     };
    
//     return {
//       id: event.getId() || '',
//       sender: event.getSender() || '',
//       content: messageContent,
//       timestamp: new Date(event.getTs()).toLocaleTimeString(),
//       messageType: messageType,
//       localImageUri: undefined, // 将在发送时设置
//       replyTo: relations?.['m.in_reply_to']?.event_id ? {
//         eventId: relations['m.in_reply_to'].event_id,
//         senderName: 'Unknown',
//         content: 'Unknown'
//       } : undefined,
//       reactions: getReactions(),
//       edited: !!content['m.new_content'],
//       deleted: event.isRedacted()
//     };
//   };

//   // 更新房间列表
//   const updateRooms = useCallback(() => {
//     const client = matrixClient.getClient();
//     if (client) {
//       const matrixRooms = matrixClient.getRooms();
//       const convertedRooms = matrixRooms.map(convertRoom);
//       setRooms(convertedRooms);
//       setCurrentUserId(client.getUserId());
//     }
//   }, []);

//   // 清理事件监听器
//   const cleanupEventListeners = useCallback(() => {
//     const client = matrixClient.getClient();
//     if (client && eventListenersRef.current) {
//       Object.entries(eventListenersRef.current).forEach(([event, listener]) => {
//         try {
//           client.removeListener(event as any, listener as any);
//         } catch (e) {
//           console.warn('移除监听器失败:', e);
//         }
//       });
//       eventListenersRef.current = {};
//     }
//   }, []);

//   // 设置事件监听器
//   const setupEventListeners = useCallback((client: any) => {
//     // 清理旧的监听器
//     cleanupEventListeners();

//     // 同步状态监听器
//     const onSync = (state: SyncState) => {
//       console.log('同步状态变化:', state);
//       switch (state) {
//         case SyncState.Prepared:
//           setIsConnected(true);
//           updateRooms();
//           break;
//         case SyncState.Error:
//           setError('同步错误');
//           setIsConnected(false);
//           break;
//         case SyncState.Stopped:
//           setIsConnected(false);
//           break;
//       }
//     };

//     // 房间时间线监听器
//     const onTimeline = () => {
//       updateRooms();
//     };

//     // 成员关系监听器
//     const onMembership = () => {
//       updateRooms();
//     };

//     // 房间名称监听器
//     const onRoomName = () => {
//       updateRooms();
//     };

//     // 添加监听器并保存引用
//     try {
//       client.on(ClientEvent.Sync, onSync);
//       client.on(RoomEvent.Timeline, onTimeline);
//       client.on(RoomEvent.MyMembership, onMembership);
//       client.on(RoomEvent.Name, onRoomName);

//       eventListenersRef.current = {
//         [ClientEvent.Sync]: onSync,
//         [RoomEvent.Timeline]: onTimeline,
//         [RoomEvent.MyMembership]: onMembership,
//         [RoomEvent.Name]: onRoomName,
//       };
//     } catch (e) {
//       console.error('设置事件监听器失败:', e);
//     }
//   }, [updateRooms, cleanupEventListeners]);

//   // 登录
//   const login = useCallback(async (username: string, password: string) => {
//     setIsLoading(true);
//     setError(null);
    
//     try {
//       await matrixClient.login(username, password);
      
//       const client = matrixClient.getClient();
//       if (client) {
//         // 设置事件监听器
//         setupEventListeners(client);
        
//         // 等待同步完成的Promise
//         const waitForSync = () => new Promise<void>((resolve, reject) => {
//           const timeout = setTimeout(() => {
//             reject(new Error('同步超时'));
//           }, 30000); // 30秒超时

//           const onSyncComplete = (state: SyncState) => {
//             if (state === SyncState.Prepared) {
//               clearTimeout(timeout);
//               client.removeListener(ClientEvent.Sync, onSyncComplete);
//               resolve();
//             } else if (state === SyncState.Error) {
//               clearTimeout(timeout);
//               client.removeListener(ClientEvent.Sync, onSyncComplete);
//               reject(new Error('同步失败'));
//             }
//           };

//           client.on(ClientEvent.Sync, onSyncComplete);
//         });

//         // 等待同步完成
//         await waitForSync();
//       }
//     } catch (err: any) {
//       console.error('登录错误:', err);
//       setError(err.message || '登录失败');
//       cleanupEventListeners();
//     } finally {
//       setIsLoading(false);
//     }
//   }, [setupEventListeners, cleanupEventListeners]);

//   // 基础功能实现
//   const createRoom = useCallback(async (name: string, topic?: string): Promise<string> => {
//     try {
//       const roomId = await matrixClient.createRoom(name, topic);
//       updateRooms();
//       return roomId;
//     } catch (err: any) {
//       setError(err.message || '创建房间失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const sendMessage = useCallback(async (roomId: string, message: string): Promise<void> => {
//     try {
//       await matrixClient.sendMessage(roomId, message);
//     } catch (err: any) {
//       setError(err.message || '发送消息失败');
//       throw err;
//     }
//   }, []);

//   const getRoomMessages = useCallback((roomId: string): MatrixMessage[] => {
//     try {
//       const events = matrixClient.getRoomMessages(roomId);
//       return events
//         .filter(event => event.getType() === 'm.room.message')
//         .map(event => {
//           const message = convertMessage(event);
          
//           // 如果是图片消息，尝试从缓存获取本地URI
//           if (message.messageType === 'm.image' && message.id) {
//             const localUri = localImageCache.get(message.id);
//             if (localUri) {
//               message.localImageUri = localUri;
//             }
//           }
          
//           return message;
//         });
//     } catch (err: any) {
//       setError(err.message || '获取消息失败');
//       return [];
//     }
//   }, [localImageCache]);

//   // 新增消息功能实现
//   const sendImageMessage = useCallback(async (roomId: string, file: File): Promise<void> => {
//     try {
//       // 创建本地预览URL
//       const localUri = URL.createObjectURL(file);
      
//       // 发送图片到Matrix服务器
//       const eventId = await matrixClient.sendImageMessage(roomId, file);
      
//       // 保存本地URI到缓存，使用eventId作为key
//       setLocalImageCache(prev => new Map(prev.set(eventId, localUri)));
      
//       // 触发刷新以更新UI
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '发送图片失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const sendFileMessage = useCallback(async (roomId: string, file: File): Promise<void> => {
//     try {
//       await matrixClient.sendFileMessage(roomId, file);
//     } catch (err: any) {
//       setError(err.message || '发送文件失败');
//       throw err;
//     }
//   }, []);

//   const sendVoiceMessage = useCallback(async (roomId: string, audioBlob: Blob, duration?: number): Promise<void> => {
//     try {
//       await matrixClient.sendVoiceMessage(roomId, audioBlob, duration);
//     } catch (err: any) {
//       setError(err.message || '发送语音消息失败');
//       throw err;
//     }
//   }, []);

//   const sendVideoMessage = useCallback(async (roomId: string, videoFile: File): Promise<void> => {
//     try {
//       await matrixClient.sendVideoMessage(roomId, videoFile);
//     } catch (err: any) {
//       setError(err.message || '发送视频失败');
//       throw err;
//     }
//   }, []);

//   const editMessage = useCallback(async (roomId: string, originalEventId: string, newMessage: string): Promise<void> => {
//     try {
//       await matrixClient.editMessage(roomId, originalEventId, newMessage);
//     } catch (err: any) {
//       setError(err.message || '编辑消息失败');
//       throw err;
//     }
//   }, []);

//   const replyToMessage = useCallback(async (roomId: string, originalEventId: string, originalSender: string, originalContent: string, replyMessage: string): Promise<void> => {
//     try {
//       await matrixClient.replyToMessage(roomId, originalEventId, originalSender, originalContent, replyMessage);
//     } catch (err: any) {
//       setError(err.message || '回复消息失败');
//       throw err;
//     }
//   }, []);

//   const sendThreadReply = useCallback(async (roomId: string, threadRootEventId: string, message: string): Promise<void> => {
//     try {
//       await matrixClient.sendThreadReply(roomId, threadRootEventId, message);
//     } catch (err: any) {
//       setError(err.message || '发送线程回复失败');
//       throw err;
//     }
//   }, []);

//   const sendReaction = useCallback(async (roomId: string, targetEventId: string, emoji: string): Promise<void> => {
//     try {
//       await matrixClient.sendReaction(roomId, targetEventId, emoji);
//     } catch (err: any) {
//       setError(err.message || '发送表情反应失败');
//       throw err;
//     }
//   }, []);

//   const sendMessageWithMentions = useCallback(async (roomId: string, message: string, mentionUserIds: string[]): Promise<void> => {
//     try {
//       await matrixClient.sendMessageWithMentions(roomId, message, mentionUserIds);
//     } catch (err: any) {
//       setError(err.message || '发送提及消息失败');
//       throw err;
//     }
//   }, []);

//   const deleteMessage = useCallback(async (roomId: string, eventId: string, reason?: string): Promise<void> => {
//     try {
//       await matrixClient.deleteMessage(roomId, eventId, reason);
//     } catch (err: any) {
//       setError(err.message || '删除消息失败');
//       throw err;
//     }
//   }, []);

//   const forwardMessage = useCallback(async (sourceRoomId: string, targetRoomId: string, eventId: string): Promise<void> => {
//     try {
//       await matrixClient.forwardMessage(sourceRoomId, targetRoomId, eventId);
//     } catch (err: any) {
//       setError(err.message || '转发消息失败');
//       throw err;
//     }
//   }, []);

//   const setTyping = useCallback(async (roomId: string, isTyping: boolean, timeout?: number): Promise<void> => {
//     try {
//       await matrixClient.setTyping(roomId, isTyping, timeout);
//     } catch (err: any) {
//       console.warn('设置输入状态失败:', err);
//     }
//   }, []);

//   // 房间管理功能实现
//   const createPrivateRoom = useCallback(async (name: string, topic?: string, inviteUserIds?: string[]): Promise<string> => {
//     try {
//       const roomId = await matrixClient.createPrivateRoom(name, topic, inviteUserIds);
//       updateRooms();
//       return roomId;
//     } catch (err: any) {
//       setError(err.message || '创建私人房间失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const createDirectMessage = useCallback(async (targetUserId: string): Promise<string> => {
//     try {
//       const roomId = await matrixClient.createDirectMessage(targetUserId);
//       updateRooms();
//       return roomId;
//     } catch (err: any) {
//       setError(err.message || '创建私聊失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const joinRoom = useCallback(async (roomIdOrAlias: string): Promise<void> => {
//     try {
//       await matrixClient.joinRoom(roomIdOrAlias);
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '加入房间失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const leaveRoom = useCallback(async (roomId: string): Promise<void> => {
//     try {
//       await matrixClient.leaveRoom(roomId);
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '离开房间失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const inviteUser = useCallback(async (roomId: string, userId: string): Promise<void> => {
//     try {
//       await matrixClient.inviteUser(roomId, userId);
//     } catch (err: any) {
//       setError(err.message || '邀请用户失败');
//       throw err;
//     }
//   }, []);

//   const kickUser = useCallback(async (roomId: string, userId: string, reason?: string): Promise<void> => {
//     try {
//       await matrixClient.kickUser(roomId, userId, reason);
//     } catch (err: any) {
//       setError(err.message || '踢出用户失败');
//       throw err;
//     }
//   }, []);

//   const banUser = useCallback(async (roomId: string, userId: string, reason?: string): Promise<void> => {
//     try {
//       await matrixClient.banUser(roomId, userId, reason);
//     } catch (err: any) {
//       setError(err.message || '封禁用户失败');
//       throw err;
//     }
//   }, []);

//   const unbanUser = useCallback(async (roomId: string, userId: string): Promise<void> => {
//     try {
//       await matrixClient.unbanUser(roomId, userId);
//     } catch (err: any) {
//       setError(err.message || '解封用户失败');
//       throw err;
//     }
//   }, []);

//   const setRoomName = useCallback(async (roomId: string, name: string): Promise<void> => {
//     try {
//       await matrixClient.setRoomName(roomId, name);
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '设置房间名称失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const setRoomTopic = useCallback(async (roomId: string, topic: string): Promise<void> => {
//     try {
//       await matrixClient.setRoomTopic(roomId, topic);
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '设置房间主题失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const setRoomAvatar = useCallback(async (roomId: string, avatarFile: File): Promise<void> => {
//     try {
//       await matrixClient.setRoomAvatar(roomId, avatarFile);
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '设置房间头像失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const enableRoomEncryption = useCallback(async (roomId: string): Promise<void> => {
//     try {
//       await matrixClient.enableRoomEncryption(roomId);
//     } catch (err: any) {
//       setError(err.message || '启用房间加密失败');
//       throw err;
//     }
//   }, []);

//   const pinMessage = useCallback(async (roomId: string, eventId: string): Promise<void> => {
//     try {
//       await matrixClient.pinMessage(roomId, eventId);
//     } catch (err: any) {
//       setError(err.message || '固定消息失败');
//       throw err;
//     }
//   }, []);

//   const unpinMessage = useCallback(async (roomId: string, eventId: string): Promise<void> => {
//     try {
//       await matrixClient.unpinMessage(roomId, eventId);
//     } catch (err: any) {
//       setError(err.message || '取消固定消息失败');
//       throw err;
//     }
//   }, []);

//   const getPublicRooms = useCallback(async (limit = 20, since?: string): Promise<any> => {
//     try {
//       return await matrixClient.getPublicRooms(limit, since);
//     } catch (err: any) {
//       setError(err.message || '获取公开房间失败');
//       throw err;
//     }
//   }, []);

//   // 已读回执功能实现
//   const sendReadReceipt = useCallback(async (roomId: string, eventId: string): Promise<void> => {
//     try {
//       await matrixClient.sendReadReceipt(roomId, eventId);
//     } catch (err: any) {
//       setError(err.message || '发送已读回执失败');
//       throw err;
//     }
//   }, []);

//   const setRoomReadMarker = useCallback(async (roomId: string, eventId: string): Promise<void> => {
//     try {
//       await matrixClient.setRoomReadMarker(roomId, eventId);
//       updateRooms();
//     } catch (err: any) {
//       setError(err.message || '设置已读标记失败');
//       throw err;
//     }
//   }, [updateRooms]);

//   const getRoomUnreadCount = useCallback((roomId: string): number => {
//     return matrixClient.getRoomUnreadNotificationCount(roomId);
//   }, []);

//   const getRoomHighlightCount = useCallback((roomId: string): number => {
//     return matrixClient.getRoomHighlightCount(roomId);
//   }, []);

//   // 用户状态功能实现
//   const setPresence = useCallback(async (state: 'online' | 'offline' | 'unavailable', statusMsg?: string): Promise<void> => {
//     try {
//       await matrixClient.setPresence(state, statusMsg);
//     } catch (err: any) {
//       setError(err.message || '设置用户状态失败');
//       throw err;
//     }
//   }, []);

//   const getUserPresence = useCallback((userId: string): any => {
//     return matrixClient.getUserPresence(userId);
//   }, []);

//   // 通知设置功能实现
//   const setRoomNotificationLevel = useCallback(async (roomId: string, level: 'all' | 'mentions' | 'none'): Promise<void> => {
//     try {
//       await matrixClient.setRoomNotificationLevel(roomId, level);
//     } catch (err: any) {
//       setError(err.message || '设置通知级别失败');
//       throw err;
//     }
//   }, []);

//   const muteRoom = useCallback(async (roomId: string): Promise<void> => {
//     try {
//       await matrixClient.muteRoom(roomId);
//     } catch (err: any) {
//       setError(err.message || '静音房间失败');
//       throw err;
//     }
//   }, []);

//   const unmuteRoom = useCallback(async (roomId: string): Promise<void> => {
//     try {
//       await matrixClient.unmuteRoom(roomId);
//     } catch (err: any) {
//       setError(err.message || '取消静音失败');
//       throw err;
//     }
//   }, []);

//   // 搜索功能实现
//   const searchMessages = useCallback(async (query: string, options?: any): Promise<any> => {
//     try {
//       return await matrixClient.searchMessages(query, options);
//     } catch (err: any) {
//       setError(err.message || '搜索消息失败');
//       throw err;
//     }
//   }, []);

//   const searchInRoom = useCallback(async (roomId: string, query: string, limit = 20): Promise<any> => {
//     try {
//       return await matrixClient.searchInRoom(roomId, query, limit);
//     } catch (err: any) {
//       setError(err.message || '房间内搜索失败');
//       throw err;
//     }
//   }, []);

//   const searchUsers = useCallback(async (query: string, limit = 10): Promise<any> => {
//     try {
//       return await matrixClient.searchUsers(query, limit);
//     } catch (err: any) {
//       setError(err.message || '搜索用户失败');
//       throw err;
//     }
//   }, []);

//   // 断开连接
//   const disconnect = useCallback(() => {
//     cleanupEventListeners();
//     matrixClient.disconnect();
//     setIsConnected(false);
//     setRooms([]);
//     setCurrentUserId(null);
//     setError(null);
//   }, [cleanupEventListeners]);

//   // 组件卸载时清理
//   useEffect(() => {
//     return () => {
//       cleanupEventListeners();
//     };
//   }, [cleanupEventListeners]);

//   return {
//     isConnected,
//     isLoading,
//     error,
//     rooms,
//     currentUserId,
    
//     // 基础功能
//     login,
//     createRoom,
//     sendMessage,
//     getRoomMessages,
//     disconnect,
    
//     // 新增消息功能
//     sendImageMessage,
//     sendFileMessage,
//     sendVoiceMessage,
//     sendVideoMessage,
//     editMessage,
//     replyToMessage,
//     sendThreadReply,
//     sendReaction,
//     sendMessageWithMentions,
//     deleteMessage,
//     forwardMessage,
//     setTyping,
    
//     // 房间管理功能
//     createPrivateRoom,
//     createDirectMessage,
//     joinRoom,
//     leaveRoom,
//     inviteUser,
//     kickUser,
//     banUser,
//     unbanUser,
//     setRoomName,
//     setRoomTopic,
//     setRoomAvatar,
//     enableRoomEncryption,
//     pinMessage,
//     unpinMessage,
//     getPublicRooms,
    
//     // 已读回执功能
//     sendReadReceipt,
//     setRoomReadMarker,
//     getRoomUnreadCount,
//     getRoomHighlightCount,
    
//     // 用户状态功能
//     setPresence,
//     getUserPresence,
    
//     // 通知设置功能
//     setRoomNotificationLevel,
//     muteRoom,
//     unmuteRoom,
    
//     // 搜索功能
//     searchMessages,
//     searchInRoom,
//     searchUsers,
//   };
// } 