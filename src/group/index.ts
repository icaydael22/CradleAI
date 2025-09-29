// 导出群聊功能模块的所有组件

export * from './group-types';
export * from './group-service';
export * from './group-manager';
export { GroupScheduler } from './group-scheduler'; // Only export GroupScheduler to avoid conflict

// 基础API函数导出，方便直接调用
import { GroupManager } from './group-manager';
import { GroupService } from './group-service';
import { GroupScheduler, GroupSettings } from './group-scheduler';
import { Character, User } from '../../shared/types';
import { Group, GroupMessage } from './group-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
/**
 * 创建一个新的群聊
 * @param user 当前用户
 * @param groupName 群聊名称
 * @param groupTopic 群聊主题
 * @param characters 初始角色列表
 */
export async function createUserGroup(
  user: User,
  groupName: string,
  groupTopic: string,
  characters: Character[] = []
): Promise<Group | null> {
  try {
    console.log(`[createUserGroup] Starting group creation: ${groupName}`);
    const manager = new GroupManager(user);
    const newGroup = await manager.createGroup(groupName, groupTopic, characters);
    
    if (!newGroup) {
      console.error('[createUserGroup] Failed to create group');
      return null;
    }
    
    console.log(`[createUserGroup] Group created with ID: ${newGroup.groupId}`);
    
    // Ensure character data is properly loaded for immediate use
    if (characters.length > 0) {
      console.log(`[createUserGroup] Ensuring data consistency for ${characters.length} characters`);
      
      try {
        // Force an immediate storage update to ensure consistency
        const characterIds = newGroup.groupMemberIds.filter(id => id !== user.id);
        const characterData = await GroupService.getCharactersByIds(characterIds);
        
        if (characterData.length !== characterIds.length) {
          console.warn(`[createUserGroup] Not all character data was loaded properly. Expected ${characterIds.length}, got ${characterData.length}`);
        }
        
        // Initialize group settings explicitly and ensure they're available immediately
        const scheduler = GroupScheduler.getInstance();
        const defaultSettings = {
          dailyMessageLimit: 50,
          replyIntervalMinutes: 1,
          referenceMessageLimit: 5,
          timedMessagesEnabled: false
        };
        
        // Set settings in the scheduler
        scheduler.setGroupSettings(newGroup.groupId, defaultSettings);
        
        // Force save the settings to ensure they're available immediately
        const storageKey = `group_settings_${newGroup.groupId}`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(defaultSettings));
        
        console.log(`[createUserGroup] Explicitly initialized and saved group settings for ${newGroup.groupId}`);
        
        // Explicitly force a refresh of the group data in storage to ensure it's immediately available
        const allGroups = await GroupService.getGroups();
        const thisGroup = allGroups.find(g => g.groupId === newGroup.groupId);
        
        if (thisGroup) {
          // Make sure the group is fully initialized
          thisGroup.groupSettings = thisGroup.groupSettings || {
            allowAnonymous: false,
            requireApproval: false,
            maxMembers: 20
          };
          
          // Save back to ensure it's fully initialized
          await GroupService['saveGroup'](thisGroup);
          console.log(`[createUserGroup] Refreshed group data in storage`);
        }
        
        // Add a small delay to ensure all async operations complete
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('[createUserGroup] Error ensuring data consistency:', error);
      }
    }
    
    return newGroup;
  } catch (error) {
    console.error('[createUserGroup] Unexpected error during group creation:', error);
    return null;
  }
}

/**
 * 向群聊发送消息
 * @param user 当前用户
 * @param groupId 群聊ID
 * @param content 消息内容
 */
export async function sendGroupMessage(
  user: User,
  groupId: string,
  content: string
): Promise<GroupMessage | null> {
  const manager = new GroupManager(user);
  return await manager.sendMessage(groupId, content);
}

/**
 * 获取用户的所有群聊
 * @param user 当前用户
 */
export async function getUserGroups(user: User): Promise<Group[]> {
  const manager = new GroupManager(user);
  return await manager.getUserGroups();
}

/**
 * 获取群聊消息
 * @param groupId 群聊ID
 * @param listener 可选的消息更新监听器
 */
export async function getGroupMessages(
  groupId: string, 
  listener?: (messages: GroupMessage[]) => void
): Promise<GroupMessage[]> {
  if (listener) {
    // 添加监听器
    GroupService.addMessageListener(groupId, listener);
  }
  return await GroupService.getGroupMessages(groupId);
}

/**
 * 添加群聊消息监听器
 * @param groupId 群聊ID
 * @param listener 消息更新监听器
 */
export function addGroupMessageListener(
  groupId: string,
  listener: (messages: GroupMessage[]) => void
): () => void {
  return GroupService.addMessageListener(groupId, listener);
}

/**
 * 移除群聊消息监听器
 * @param groupId 群聊ID
 * @param listener 消息更新监听器
 */
export function removeGroupMessageListener(
  groupId: string,
  listener: (messages: GroupMessage[]) => void
): void {
  GroupService.removeMessageListener(groupId, listener);
}

/**
 * 解散群聊
 * @param user 当前用户
 * @param groupId 群聊ID
 */
export async function disbandGroup(
  user: User,
  groupId: string
): Promise<boolean> {
  const manager = new GroupManager(user);
  return await manager.disbandGroup(groupId);
}

/**
 * 更新群聊设置
 * @param groupId 群聊ID
 * @param settings 群聊设置
 */
export async function updateGroupSettings(
  groupId: string,
  settings: GroupSettings
): Promise<void> {
  try {
    // 获取GroupScheduler实例并更新设置
    const scheduler = GroupScheduler.getInstance();
    scheduler.setGroupSettings(groupId, settings);
    
    // 同时确保设置保存到专用存储键，以便在重启应用后可以持久化
    const storageKey = `group_settings_${groupId}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(settings));
    
    console.log(`[group/index] Group settings updated and persisted for group ${groupId}:`, settings);
    
    return Promise.resolve();
  } catch (error) {
    console.error(`[group/index] Error updating group settings:`, error);
    return Promise.reject(error);
  }
}

/**
 * 获取群聊设置
 * @param groupId 群聊ID
 */
export function getGroupSettings(
  groupId: string
): GroupSettings {
  const scheduler = GroupScheduler.getInstance();
  return scheduler.getGroupSettings(groupId);
}

/**
 * 清空群聊历史消息
 * @param user 当前用户
 * @param groupId 群聊ID
 */
export async function clearGroupMessages(
  user: User,
  groupId: string
): Promise<boolean> {
  try {
    console.log(`[group/index] 清空群组 ${groupId} 的消息历史`);
    return await GroupService.clearGroupMessages(groupId, user.id);
  } catch (error) {
    console.error(`[group/index] 清空群聊消息失败:`, error);
    return false;
  }
}
