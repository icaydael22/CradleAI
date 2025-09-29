import { Character, User, GlobalSettings } from '../../shared/types';
import { Group, GroupMessage } from './group-types';
import { GroupService } from './group-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NodeST } from '@/NodeST/nodest';
import { GroupScheduler } from './group-scheduler';
/**
 * 群聊管理器 - 负责管理群聊状态和提供API接口
 */
export class GroupManager {
  private user: User;
  private apiKey?: string;
  private apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
  private nodeST: NodeST | null = null;

  /**
   * 构造函数
   */
  constructor(
    user: User,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ) {
    this.user = user;
    this.apiKey = apiKey;
    this.apiSettings = apiSettings;
    
    // Initialize NodeST if apiKey is provided
    if (apiKey) {
      this.nodeST = new NodeST(apiKey);
      
      // Update API settings if provided
      if (apiSettings) {
        this.nodeST.updateApiSettings(apiKey, apiSettings);
      }
    }
  }

  /**
   * 获取NodeST实例，用于生成内容
   */
  private getNodeST(): NodeST {
    if (!this.nodeST) {
      // No need to validate apiKey anymore since NodeST can handle cases without it
      this.nodeST = new NodeST(this.apiKey);
      
      // Only update API settings if provided and apiKey exists
      if (this.apiSettings && this.apiKey) {
        this.nodeST.updateApiSettings(this.apiKey, this.apiSettings);
      }
    }
    return this.nodeST;
  }

  /**
   * 生成群聊回复内容
   */
  async generateGroupResponse(prompt: string): Promise<string> {
    try {
      const nodeST = this.getNodeST();
      return await nodeST.generateContent(prompt);
    } catch (error) {
      console.error('【群聊管理器】生成回复内容失败:', error);
      throw error;
    }
  }

  /**
   * 创建新群聊
   */
  async createGroup(
    groupName: string,
    groupTopic: string,
    initialCharacters: Character[]
  ): Promise<Group | null> {
    try {
      console.log(`【群聊管理器】创建新群聊: ${groupName}, 主题: ${groupTopic}`);
      
      // Ensure all character data is complete before creating the group
      if (initialCharacters.length > 0) {
        // Validate all characters have the necessary data
        const validCharacters = initialCharacters.filter(char => 
          char && char.id && char.name
        );
        
        // Log validation results
        console.log(`【群聊管理器】初始化角色验证: ${validCharacters.length}/${initialCharacters.length} 个有效`);
        
        // If we have invalid characters, only use valid ones
        if (validCharacters.length < initialCharacters.length) {
          console.warn(`【群聊管理器】移除 ${initialCharacters.length - validCharacters.length} 个无效角色`);
          initialCharacters = validCharacters;
        }
      }
      
      const newGroup = await GroupService.createUserGroup(
        groupName,
        groupTopic,
        this.user,
        initialCharacters,
        this.apiKey,
        this.apiSettings
      );
      
      if (newGroup) {
        // Explicitly force a refresh of character data
        const characterIds = newGroup.groupMemberIds.filter(id => id !== this.user.id);
        if (characterIds.length > 0) {
          try {
            const loadedCharacters = await GroupService.getCharactersByIds(characterIds);
            console.log(`【群聊管理器】已加载并验证 ${loadedCharacters.length}/${characterIds.length} 个角色数据`);
            
            // Add a small delay to ensure all async operations complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Ensure group settings are initialized
            const scheduler = GroupScheduler.getInstance();
            const currentSettings = scheduler.getGroupSettings(newGroup.groupId);
            console.log(`【群聊管理器】群组设置已初始化: ${JSON.stringify({
              replyInterval: currentSettings.replyIntervalMinutes,
              enabled: currentSettings.timedMessagesEnabled
            })}`);
          } catch (charError) {
            console.error('【群聊管理器】验证角色数据时出错:', charError);
          }
        }
      }
      
      return newGroup;
    } catch (error) {
      console.error(`【群聊管理器】创建群聊失败:`, error);
      return null;
    }
  }

  /**
   * 发送群聊消息
   */
  async sendMessage(groupId: string, content: string): Promise<GroupMessage | null> {
    try {
      console.log(`【群聊管理器】发送群聊消息，群组ID: ${groupId}`);

      // 获取群组信息进行日志记录
      const group = await GroupService.getGroupById(groupId);
      if (group) {
        console.log(`【群聊管理器】群组信息: ${group.groupName}, 成员数: ${group.groupMemberIds.length}`);
        console.log(`【群聊管理器】群组成员: ${group.groupMemberIds.join(', ')}`);
      } else {
        console.warn(`【群聊管理器】未找到群组: ${groupId}`);
      }
      
      return await GroupService.sendUserGroupMessage(
        groupId,
        this.user,
        content,
        this.apiKey,
        this.apiSettings
      );
    } catch (error) {
      console.error(`【群聊管理器】发送群聊消息失败:`, error);
      return null;
    }
  }

  /**
   * 获取用户的所有群聊
   */
  async getUserGroups(): Promise<Group[]> {
    try {
      const allGroups = await GroupService.getGroups();
      
      // 过滤出用户参与的群聊
      const userGroups = allGroups.filter(group => 
        group.groupMemberIds.includes(this.user.id)
      );
      
      return userGroups;
    } catch (error) {
      console.error(`【群聊管理器】获取用户群聊失败:`, error);
      return [];
    }
  }

  /**
   * 获取群聊消息，支持附加监听器
   */
  async getGroupMessages(groupId: string, listener?: (messages: GroupMessage[]) => void): Promise<GroupMessage[]> {
    try {
      const messages = await GroupService.getGroupMessages(groupId);
      
      // 如果提供了监听器，则添加它
      if (listener) {
        GroupService.addMessageListener(groupId, listener);
      }
      
      return messages;
    } catch (error) {
      console.error(`【群聊管理器】获取群聊消息失败:`, error);
      return [];
    }
  }

  /**
   * 添加成员到群聊
   */
  async addMembersToGroup(groupId: string, memberIds: string[]): Promise<boolean> {
    try {
      // 获取群组
      const group = await GroupService.getGroupById(groupId);
      
      if (!group) {
        console.error(`【群聊管理器】添加成员失败: 找不到群组 ${groupId}`);
        return false;
      }
      
      // 验证当前用户是否是群主
      if (group.groupOwnerId !== this.user.id) {
        console.error(`【群聊管理器】添加成员失败: 当前用户不是群主`);
        return false;
      }
      
      // 过滤掉已经在群里的成员
      const newMemberIds = memberIds.filter(id => !group.groupMemberIds.includes(id));
      
      if (newMemberIds.length === 0) {
        console.log(`【群聊管理器】所有成员已经在群里`);
        return true;
      }
      
      // 添加新成员
      group.groupMemberIds = [...group.groupMemberIds, ...newMemberIds];
      group.groupUpdatedAt = new Date();
      
      // 保存更新后的群组
      await GroupService['saveGroup'](group);
      
      // 发送系统消息
      const systemMessage: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId,
        senderId: 'system',
        senderName: '系统',
        messageContent: `新成员已加入群聊`,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };
      
      await GroupService['saveGroupMessage'](groupId, systemMessage);
      
      // 为新加入的角色初始化群聊
      for (const id of newMemberIds) {
        // 跳过用户ID
        if (id === this.user.id) continue;
        
        await GroupService['initCharacterForGroup'](
          id,
          groupId,
          this.apiKey,
          this.apiSettings
        );
      }
      
      return true;
    } catch (error) {
      console.error(`【群聊管理器】添加成员到群聊失败:`, error);
      return false;
    }
  }

  /**
   * 移除群聊成员
   */
  async removeGroupMember(groupId: string, memberId: string): Promise<boolean> {
    try {
      // 获取群组
      const group = await GroupService.getGroupById(groupId);
      
      if (!group) {
        console.error(`【群聊管理器】移除成员失败: 找不到群组 ${groupId}`);
        return false;
      }
      
      // 验证当前用户是否是群主
      if (group.groupOwnerId !== this.user.id) {
        console.error(`【群聊管理器】移除成员失败: 当前用户不是群主`);
        return false;
      }
      
      // 不能移除群主
      if (memberId === group.groupOwnerId) {
        console.error(`【群聊管理器】移除成员失败: 不能移除群主`);
        return false;
      }
      
      // 检查成员是否在群里
      if (!group.groupMemberIds.includes(memberId)) {
        console.log(`【群聊管理器】成员不在群里`);
        return true;
      }
      
      // 移除成员
      group.groupMemberIds = group.groupMemberIds.filter(id => id !== memberId);
      group.groupUpdatedAt = new Date();
      
      // 保存更新后的群组
      await GroupService['saveGroup'](group);
      
      // 发送系统消息
      const systemMessage: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId,
        senderId: 'system',
        senderName: '系统',
        messageContent: `一名成员已离开群聊`,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };
      
      await GroupService['saveGroupMessage'](groupId, systemMessage);
      
      // 清除角色的群聊数据
      await AsyncStorage.removeItem(`group_character_${groupId}_${memberId}`);
      
      return true;
    } catch (error) {
      console.error(`【群聊管理器】移除群聊成员失败:`, error);
      return false;
    }
  }

  /**
   * 解散群聊
   */
  async disbandGroup(groupId: string): Promise<boolean> {
    try {
      console.log(`【群聊管理器】解散群聊，群组ID: ${groupId}`);
      
      // 获取群组信息进行日志记录
      const group = await GroupService.getGroupById(groupId);
      if (group) {
        console.log(`【群聊管理器】要解散的群组信息: ${group.groupName}, 成员数: ${group.groupMemberIds.length}`);
      } else {
        console.warn(`【群聊管理器】未找到群组: ${groupId}`);
        return false;
      }
      
      // 使用Group Service解散群组
      return await GroupService.disbandGroup(groupId, this.user.id);
    } catch (error) {
      console.error(`【群聊管理器】解散群聊失败:`, error);
      return false;
    }
  }

  /**
   * 更新群聊设置
   */
  async updateGroupSettings(
    groupId: string, 
    settings: Partial<Group>
  ): Promise<boolean> {
    try {
      // 获取群组
      const group = await GroupService.getGroupById(groupId);
      
      if (!group) {
        console.error(`【群聊管理器】更新群聊设置失败: 找不到群组 ${groupId}`);
        return false;
      }
      
      // 验证当前用户是否是群主
      if (group.groupOwnerId !== this.user.id) {
        console.error(`【群聊管理器】更新群聊设置失败: 当前用户不是群主`);
        return false;
      }
      
      // 更新群组设置
      // 只允许更新特定字段
      const allowedFields = [
        'groupName',
        'groupTopic',
        'groupDescription',
        'groupAvatar',
        'groupSettings'
      ];
      
      // 应用允许的更新
      for (const field of allowedFields) {
        if (field in settings) {
          (group as any)[field] = (settings as any)[field];
        }
      }
      
      group.groupUpdatedAt = new Date();
      
      // 保存更新后的群组
      await GroupService['saveGroup'](group);
      
      // 发送系统消息
      const systemMessage: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId,
        senderId: 'system',
        senderName: '系统',
        messageContent: `群聊设置已更新`,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };
      
      await GroupService['saveGroupMessage'](groupId, systemMessage);
      
      return true;
    } catch (error) {
      console.error(`【群聊管理器】更新群聊设置失败:`, error);
      return false;
    }
  }

  /**
   * 清空群聊消息历史
   */
  async clearGroupMessages(groupId: string): Promise<boolean> {
    try {
      console.log(`【群聊管理器】清空群聊消息历史，群组ID: ${groupId}`);
      
      // 获取群组信息进行日志记录
      const group = await GroupService.getGroupById(groupId);
      if (group) {
        console.log(`【群聊管理器】要清空消息的群组信息: ${group.groupName}, 成员数: ${group.groupMemberIds.length}`);
      } else {
        console.warn(`【群聊管理器】未找到群组: ${groupId}`);
        return false;
      }
      
      // 使用Group Service清空群组消息
      return await GroupService.clearGroupMessages(groupId, this.user.id);
    } catch (error) {
      console.error(`【群聊管理器】清空群聊消息历史失败:`, error);
      return false;
    }
  }
}
