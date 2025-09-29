import { Character, User, GlobalSettings } from '../../shared/types';
import { NodeST } from '../../NodeST/nodest';
import { StorageAdapter } from '../../NodeST/nodest/utils/storage-adapter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserSettingsGlobally, getApiSettings, getCloudServiceStatus } from '@/utils/settings-helper';
import { GroupMessage, Group, GroupSettings } from './group-types';
import { GroupScheduler } from './group-scheduler';
import { OpenAIAdapter } from '../../NodeST/nodest/utils/openai-adapter'; // 新增导入

// 创建具有apiKey的单例实例
let nodeST: NodeST | null = null;

export class GroupService {
  // 添加消息监听相关属性
  private static messageListeners: Record<string, ((messages: GroupMessage[]) => void)[]> = {};

  // 获取NodeST方法，从全局设置获取API设置
  private static getNodeST(
    apiKey?: string, 
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'> // 修改类型
  ): NodeST {
    // Get global settings if not provided
    if (!apiKey || !apiSettings) {
      const globalSettings = getUserSettingsGlobally();
      const cloudEnabled = getCloudServiceStatus();
      
      if (globalSettings && globalSettings.chat) {
        // Use global settings if available
        if (!apiKey) {
          apiKey = globalSettings.chat.characterApiKey || '';
        }
        
        if (!apiSettings) {
          apiSettings = {
            apiProvider: globalSettings.chat.apiProvider,
            openrouter: globalSettings.chat.openrouter,
            OpenAIcompatible: globalSettings.chat.OpenAIcompatible // 新增
          };
        }
        
        // Log that we're using global settings
        console.log(`【群聊服务】从全局设置获取API配置:`, {
          provider: globalSettings.chat.apiProvider,
          hasGeminiKey: !!globalSettings.chat.characterApiKey,
          hasOpenRouterKey: !!globalSettings.chat.openrouter?.apiKey,
          cloudEnabled
        });
      }
    }
    
    // Prepare OpenRouter config if needed
    const openRouterConfig = apiSettings?.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled
        ? {
            apiKey: apiSettings.openrouter.apiKey,
            model: apiSettings.openrouter.model
          }
        : undefined;
          
    // Log the configuration
    console.log(`【群聊服务】获取NodeST实例，apiKey存在: ${!!apiKey}，provider: ${apiSettings?.apiProvider || 'gemini'}`, 
      openRouterConfig ? {
        hasOpenRouterKey: !!openRouterConfig.apiKey,
        model: openRouterConfig.model
      } : 'no openrouter config'
    );
    
    if (!nodeST) {
      nodeST = new NodeST(apiKey);
      // If initialized with apiKey and we have OpenRouter config, update it immediately
      if (apiKey && (openRouterConfig || apiSettings?.OpenAIcompatible)) {
        nodeST.updateApiSettings(apiKey, apiSettings);
      }
    } else if (apiKey) {
      // Update existing instance with API key and settings
      if (apiSettings) {
        nodeST.updateApiSettings(apiKey, apiSettings);
      } else {
        // Only update API key without changing existing OpenRouter config
        nodeST.setApiKey(apiKey);
      }
    }
    
    return nodeST;
  }

  /**
   * 创建一个新群聊
* @param groupName 群聊名称
   * @param groupTopic 群聊主题
   * @param owner 群主（用户）
   * @param characters 初始角色列表
   * @param apiKey API密钥（可选）
   * @param apiSettings API设置（可选）
   */
  static async createUserGroup(
    groupName: string,
    groupTopic: string,
    owner: User,
    characters: Character[] = [],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'> // 修改类型
  ): Promise<Group | null> {
    try {
      console.log(`【群聊服务】创建群聊: ${groupName}, 主题: ${groupTopic}`);
      
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter,
          OpenAIcompatible: settings.OpenAIcompatible // 新增
        };
      }
      
      // 创建新群组对象
      const newGroup: Group = {
        groupId: `group-${Date.now()}`,
        groupName,
        groupTopic,
        groupOwnerId: owner.id,
        groupMemberIds: [owner.id, ...characters.map(c => c.id)],
        groupCreatedAt: new Date(),
        groupUpdatedAt: new Date(),
        groupSettings: {
          allowAnonymous: false,
          requireApproval: false,
          maxMembers: 20
        }
      };

      // 保存群组到存储
      await this.saveGroup(newGroup);
      
      // 确保立即获取所有群组，以确认新群组已经保存
      const allGroups = await this.getGroups();
      const savedGroup = allGroups.find(g => g.groupId === newGroup.groupId);
      
      if (!savedGroup) {
        console.error(`【群聊服务】创建群聊失败: 群组未保存到存储`);
        return null;
      }
      
      console.log(`【群聊服务】成功保存群组: ${newGroup.groupId}, 当前共有 ${allGroups.length} 个群组`);
      
      // 创建默认群组设置 - 默认禁用定时消息功能
      const scheduler = GroupScheduler.getInstance();
      const defaultSettings = {
        dailyMessageLimit: 50,
        replyIntervalMinutes: 1,
        referenceMessageLimit: 5,
        timedMessagesEnabled: false // 默认禁用定时消息
      };
      
      scheduler.setGroupSettings(newGroup.groupId, defaultSettings);
      console.log(`【群聊服务】为新群组 ${newGroup.groupId} 设置默认配置，定时消息功能已禁用`);
      
      // 额外确保设置被保存到AsyncStorage
      const settingsKey = `group_settings_${newGroup.groupId}`;
      await AsyncStorage.setItem(settingsKey, JSON.stringify(defaultSettings));
      
      // 发送群组创建消息
      const creationMessage: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId: newGroup.groupId,
        senderId: 'system',
        senderName: '系统',
        messageContent: `群组 "${groupName}" 已创建，主题："${groupTopic}"`,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };
      
      // 存储群消息
      await this.saveGroupMessage(newGroup.groupId, creationMessage);
      console.log(`【群聊服务】已添加群组创建消息`);

      // 为每个角色初始化
      for (const character of characters) {
        await this.initCharacterForGroup(character.id, newGroup.groupId, apiKey, apiSettings);
      }
      
      // 添加小延迟确保所有异步操作完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`【群聊服务】成功创建群聊: ${groupName}, ID: ${newGroup.groupId}`);
      return newGroup;
    } catch (error) {
      console.error(`【群聊服务】创建群聊失败:`, error);
      return null;
    }
  }

  /**
   * 根据ID获取群组
   */
  static async getGroupById(groupId: string): Promise<Group | null> {
    try {
      console.log(`【群聊服务】获取群组, ID: ${groupId}`);
      const groups = await this.getGroups();
      const group = groups.find(g => g.groupId === groupId) || null;
      
      if (!group) {
        console.warn(`【群聊服务】未找到群组: ${groupId}`);
        return null;
      }
      
      // 确保群组有必要的字段
      group.groupSettings = group.groupSettings || {
        allowAnonymous: false,
        requireApproval: false,
        maxMembers: 20
      };
      
      return group;
    } catch (error) {
      console.error(`【群聊服务】获取群组失败:`, error);
      return null;
    }
  }

  /**
   * 保存群组到存储
   */
  private static async saveGroup(group: Group): Promise<void> {
    try {
      console.log(`【群聊服务】保存群组, ID: ${group.groupId}, 名称: ${group.groupName}`);
      
      // 获取现有群组列表
      const groups = await this.getGroups();
      
      // 查找是否已存在相同ID的群组
      const existingIndex = groups.findIndex(g => g.groupId === group.groupId);
      
      if (existingIndex >= 0) {
        // 更新现有群组
        console.log(`【群聊服务】更新现有群组: ${group.groupId}`);
        groups[existingIndex] = group;
      } else {
        // 添加新群组
        console.log(`【群聊服务】添加新群组: ${group.groupId}`);
        groups.push(group);
      }
      
      // 保存更新后的群组列表
      await AsyncStorage.setItem('user_groups', JSON.stringify(groups));
      console.log(`【群聊服务】保存群组成功, 当前共有 ${groups.length} 个群组`);
      
      // Double-check that the group was saved correctly
      const updatedGroups = await this.getGroups();
      const savedGroup = updatedGroups.find(g => g.groupId === group.groupId);
      
      if (!savedGroup) {
        console.error(`【群聊服务】保存群组失败: 保存后无法找到群组 ${group.groupId}`);
      } else {
        console.log(`【群聊服务】验证群组保存成功: ${group.groupId}`);
      }
    } catch (error) {
      console.error(`【群聊服务】保存群组失败:`, error);
      throw error;
    }
  }

  /**
   * 初始化角色的群聊功能
   */
  private static async initCharacterForGroup(
    characterId: string,
    groupId: string,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'> // 修改类型
  ): Promise<boolean> {
    try {
      console.log(`【群聊服务】初始化角色 ${characterId} 的群聊框架，群组ID: ${groupId}`);
      
      // 使用NodeST初始化角色
      const instance = this.getNodeST(apiKey, apiSettings);
      
      // 获取群组信息
      const group = await this.getGroupById(groupId);
      if (!group) {
        console.error(`【群聊服务】初始化角色群聊失败: 找不到群组 ${groupId}`);
        return false;
      }
      
      // 创建角色在群内的初始数据
      const characterGroupData = {
        characterId,
        groupId,
        lastActiveTime: new Date(),
        dailyMessageCount: 0,
        lastMessageTime: null
      };
      
      // 保存角色群聊数据
      const storageKey = `group_character_${groupId}_${characterId}`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(characterGroupData));
      
      // Initialize group settings if they don't exist
      const settingsKey = `group_settings_${groupId}`;
      const existingSettings = await AsyncStorage.getItem(settingsKey);
      
      if (!existingSettings) {
        // Create default settings
        const defaultSettings = {
          dailyMessageLimit: 50,
          replyIntervalMinutes: 1,
          referenceMessageLimit: 5,
          timedMessagesEnabled: false
        };
        
        // Save settings
        await AsyncStorage.setItem(settingsKey, JSON.stringify(defaultSettings));
        console.log(`【群聊服务】为群组 ${groupId} 创建默认设置`);
      }
      
      console.log(`【群聊服务】成功初始化角色 ${characterId} 的群聊框架`);
      return true;
    } catch (error) {
      console.error(`【群聊服务】初始化角色群聊框架失败:`, error);
      return false;
    }
  }

  /**
   * 用户发送群聊消息
   */
  static async sendUserGroupMessage(
    groupId: string,
    user: User,
    content: string,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'> // 修改类型
  ): Promise<GroupMessage | null> {
    try {
      console.log(`【群聊服务】用户发送群聊消息，群组ID: ${groupId}`);
      
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter,
          OpenAIcompatible: settings.OpenAIcompatible // 新增
        };
      }
      
      // 检查群组是否存在
      const group = await this.getGroupById(groupId);
      if (!group) {
        console.error(`【群聊服务】发送消息失败: 找不到群组 ${groupId}`);
        return null;
      }
      
      // 创建消息对象
      const message: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId,
        senderId: user.id,
        senderName: user.name || '用户',
        messageContent: content,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };
      
      // 保存消息
      await this.saveGroupMessage(groupId, message);
      
      // 触发角色回复
      this.triggerCharacterResponses(group, message, apiKey, apiSettings);
      
      return message;
    } catch (error) {
      console.error(`【群聊服务】发送群聊消息失败:`, error);
      return null;
    }
  }

  /**
   * 触发角色回复群聊消息
   */
  private static async triggerCharacterResponses(
    group: Group,
    userMessage: GroupMessage,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'> // 修改类型
  ): Promise<void> {
    try {
      console.log(`【群聊服务】触发角色回复，群组ID: ${group.groupId}`);
      
      // 获取群组中的所有角色
      const characterIds = group.groupMemberIds.filter(id => id !== group.groupOwnerId);
      
      // 如果没有角色，则直接返回
      if (characterIds.length === 0) {
        console.log(`【群聊服务】群组中没有角色，无需触发回复`);
        return;
      }
      
      // 获取角色对象列表
      const characters = await this.getCharactersByIds(characterIds);
      
      // 使用调度器处理角色回复
      const scheduler = GroupScheduler.getInstance();
      scheduler.scheduleGroupResponses(group, userMessage, characters, apiKey, apiSettings);
    } catch (error) {
      console.error(`【群聊服务】触发角色回复失败:`, error);
    }
  }

  /**
   * 角色回复群聊消息
   */
  static async replyToGroupMessage(
    groupId: string,
    character: Character,
    originalMessage: GroupMessage,
    groupMessages: GroupMessage[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'>, // 增加OpenAIcompatible类型
    extraPrompt?: string // 新增：额外提示词参数
  ): Promise<GroupMessage | null> {
    try {
      console.log(`【群聊服务】角色 ${character.name} 回复群聊消息`);
      
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter,
          OpenAIcompatible: settings.OpenAIcompatible // 新增
        };
      }
      
      // 检查群组是否存在
      const group = await this.getGroupById(groupId);
      if (!group) {
        console.error(`【群聊服务】回复消息失败: 找不到群组 ${groupId}`);
        return null;
      }
      
      // 检查限制条件
      if (!await this.checkReplyCriteria(character.id, groupId)) {
        console.log(`【群聊服务】角色 ${character.name} 已达到回复限制，跳过回复`);
        return null;
      }
      
      // 构建提示词
      const prompt = await this.buildGroupReplyPrompt(group, character, originalMessage, groupMessages, extraPrompt);

      // ==== 新增 openai-compatible 支持 ====
      const openaiCompatibleEnabled = apiSettings?.apiProvider === 'openai-compatible' && apiSettings?.OpenAIcompatible?.enabled;
      let response: string;
      if (openaiCompatibleEnabled) {
        // 构造OpenAIAdapter实例
        const oaConfig = apiSettings.OpenAIcompatible!;
        const oaAdapter = new OpenAIAdapter({
          endpoint: oaConfig.endpoint || '',
          apiKey: oaConfig.apiKey || '',
          model: oaConfig.model || 'gpt-3.5-turbo'
        });
        // 直接调用chatCompletion
        const messages = [
          { role: "user", content: prompt }
        ];
        const completion = await oaAdapter.chatCompletion(messages, { temperature: 0.7, max_tokens: 2048 });
        response = completion?.choices?.[0]?.message?.content || '';
        if (!response || response.trim().length === 0) {
          console.error(`【群聊服务】获取角色回复失败: 空响应`);
          return null;
        }
      } else {
        // 原有逻辑
        const instance = this.getNodeST(apiKey, apiSettings);
        try {
          // 传递 character.id 以便表格记忆等功能生效
          response = await instance.generateContent(prompt, character.id);
          if (!response || response.trim().length === 0) {
            console.error(`【群聊服务】获取角色回复失败: 空响应`);
            return null;
          }
        } catch (error) {
          console.error(`【群聊服务】生成内容失败:`, error);
          return null;
        }
      }
      // ==== end 新增 openai-compatible 支持 ====

      // 处理@提及
      const processedResponse = this.processAtMentions(response, group);
      
      // 过滤系统消息ID，如果是定时触发的系统消息，不设置回复ID
      const replyToMessageId = originalMessage.senderId === "system" && 
        originalMessage.messageId.startsWith("timed-") ? 
        undefined : originalMessage.messageId;
      
      // 创建回复消息对象
      const replyMessage: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId,
        senderId: character.id,
        senderName: character.name,
        messageContent: processedResponse,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date(),
        replyToMessageId
      };
      
      // 更新角色最后回复时间和计数
      await this.updateCharacterReplyStats(character.id, groupId);
      
      // 保存消息
      await this.saveGroupMessage(groupId, replyMessage);
      
      // 检查是否有@提及其他角色，如果有则触发他们的回复
      const mentionedCharacterIds = this.extractMentionedCharacterIds(processedResponse, group);
      if (mentionedCharacterIds.length > 0) {
        console.log(`【群聊服务】角色回复中提及了其他角色: ${mentionedCharacterIds.join(', ')}`);
        this.handleMentionedCharacters(group, replyMessage, mentionedCharacterIds, apiKey, apiSettings);
      }
      
      return replyMessage;
    } catch (error) {
      console.error(`【群聊服务】角色回复群聊消息失败:`, error);
      return null;
    }
  }

  /**
   * 处理被@提及的角色
   */
  private static async handleMentionedCharacters(
    group: Group,
    originalMessage: GroupMessage,
    mentionedCharacterIds: string[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter' | 'OpenAIcompatible'> // 修改类型
  ): Promise<void> {
    try {
      // 获取所有群组消息，作为上下文
      const groupMessages = await this.getGroupMessages(group.groupId);
      
      // 获取被@提及的角色
      const characters = await this.getCharactersByIds(mentionedCharacterIds);
      
      // 使用调度器处理角色回复
      const scheduler = GroupScheduler.getInstance();
      scheduler.scheduleMentionedResponses(group, originalMessage, characters, groupMessages, apiKey, apiSettings);
    } catch (error) {
      console.error(`【群聊服务】处理被@提及的角色失败:`, error);
    }
  }

  /**
   * 提取消息中@提及的角色ID
   */
  private static extractMentionedCharacterIds(message: string, group: Group): string[] {
    try {
      const mentionedIds: string[] = [];
      
      // 正则表达式匹配@用户名格式
      const mentionRegex = /@([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
      let match;
      
      while ((match = mentionRegex.exec(message)) !== null) {
        const mentionedName = match[1];
        
        // 根据名称查找角色ID
        // 这里需要实际获取角色信息
        const characterId = this.findCharacterIdByName(mentionedName, group);
        if (characterId && !mentionedIds.includes(characterId)) {
          mentionedIds.push(characterId);
        }
      }
      
      return mentionedIds;
    } catch (error) {
      console.error(`【群聊服务】提取@提及的角色失败:`, error);
      return [];
    }
  }

  /**
   * 根据名称查找角色ID
   */
  private static async findCharacterIdByName(name: string, group: Group): Promise<string | null> {
    try {
      // 获取群组中的所有角色
      const characterIds = group.groupMemberIds.filter(id => id !== group.groupOwnerId);
      
      // 获取角色对象列表
      const characters = await this.getCharactersByIds(characterIds);
      
      // 查找匹配名称的角色
      const character = characters.find(c => c.name === name);
      return character ? character.id : null;
    } catch (error) {
      console.error(`【群聊服务】根据名称查找角色ID失败:`, error);
      return null;
    }
  }

  /**
   * 处理文本中的@提及
   */
  private static processAtMentions(text: string, group: Group): string {
    // 简单实现，在实际应用中可能需要更复杂的处理
    return text;
  }

  /**
   * 检查角色是否满足回复条件
   */
  private static async checkReplyCriteria(characterId: string, groupId: string): Promise<boolean> {
    try {
      const storageKey = `group_character_${groupId}_${characterId}`;
      const storedData = await AsyncStorage.getItem(storageKey);
      
      if (!storedData) {
        // 未初始化，默认可以回复
        return true;
      }
      
      const characterData = JSON.parse(storedData);
      const now = new Date();
      const lastMessageTime = characterData.lastMessageTime ? new Date(characterData.lastMessageTime) : null;
      
      // 检查每日限制
      if (characterData.dailyMessageCount >= 50) { // 示例限制：每日50条
        console.log(`【群聊服务】角色 ${characterId} 已达到每日消息限制`);
        return false;
      }
      
      // 检查时间间隔
      if (lastMessageTime) {
        const timeDiffInMinutes = (now.getTime() - lastMessageTime.getTime()) / (60 * 1000);
        if (timeDiffInMinutes < 1) { // 示例限制：至少1分钟间隔
          console.log(`【群聊服务】角色 ${characterId} 回复太频繁，需要等待时间间隔`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error(`【群聊服务】检查角色回复条件失败:`, error);
      return true; // 错误时默认允许回复
    }
  }

  /**
   * 更新角色回复统计信息
   */
  private static async updateCharacterReplyStats(characterId: string, groupId: string): Promise<void> {
    try {
      const storageKey = `group_character_${groupId}_${characterId}`;
      const storedData = await AsyncStorage.getItem(storageKey);
      
      let characterData = storedData ? JSON.parse(storedData) : {
        characterId,
        groupId,
        dailyMessageCount: 0,
        lastActiveTime: null,
        lastMessageTime: null
      };
      
      const now = new Date();
      
      // 检查是否需要重置每日计数
      if (characterData.lastActiveTime) {
        const lastActiveDate = new Date(characterData.lastActiveTime).setHours(0, 0, 0, 0);
        const currentDate = now.setHours(0, 0, 0, 0);
        
        if (lastActiveDate < currentDate) {
          // 新的一天，重置计数
          characterData.dailyMessageCount = 0;
        }
      }
      
      // 更新统计信息
      characterData.dailyMessageCount += 1;
      characterData.lastActiveTime = now;
      characterData.lastMessageTime = now;
      
      // 保存更新
      await AsyncStorage.setItem(storageKey, JSON.stringify(characterData));
    } catch (error) {
      console.error(`【群聊服务】更新角色回复统计信息失败:`, error);
    }
  }

  /**
   * 构建群聊回复提示词
   */
  private static async buildGroupReplyPrompt(
    group: Group,
    character: Character,
    originalMessage: GroupMessage,
    groupMessages: GroupMessage[],
    extraPrompt?: string // 新增：额外提示词参数
  ): Promise<string> {
    try {
      // 获取最近的聊天历史
      const recentMessages = groupMessages
        .sort((a, b) => 
          new Date(a.messageCreatedAt).getTime() - new Date(b.messageCreatedAt).getTime()
        )
        .slice(-10); // 最近10条消息
      
      // 格式化聊天记录
      const formattedMessages = recentMessages.map((msg, idx) => {
        return `${msg.senderName}: ${msg.messageContent}`;
      }).join('\n');
      
      // 获取角色与用户的私聊记录
      const privateChatHistory = await this.getPrivateChatHistory(character.id, originalMessage.senderId);
      
      // 确定用户的称呼（使用角色中的自定义用户名）
      // 如果角色设置了customUserName，则使用该名称来称呼用户，否则使用默认名称
      const userNameForCharacter = character.customUserName || originalMessage.senderName || '用户';
      
      // 是否是系统触发的消息（如定时消息）
      const isSystemMessage = originalMessage.senderId === 'system';
      
      // 针对不同类型的消息调整提示词
      let userMessagePart = isSystemMessage 
        ? `系统提示: "${originalMessage.messageContent}"`
        : `用户 ${userNameForCharacter} 发送: "${originalMessage.messageContent}"`;
      
      // 构建提示词
      const prompt = `你是${character.name}. 你正在参与一个主题为 "${group.groupTopic}" 的群聊。

你的角色数据: ${character.personality}

你和用户的私聊记录:
${privateChatHistory}

${userMessagePart}

当前群聊消息记录：
${formattedMessages}

你的任务是根据当前群聊的上下文，生成一条新的群聊消息。

规则：

1. 检查你是否被其他角色 @ 了。如果被 @ 了，你需要评估以下因素：
    * 被 @ 的消息内容是否需要回复 (例如，提问、请求帮助、表达观点等)。
    * 当前群聊的整体上下文。
    * 你的角色个性。

2. 如果经过评估后，你认为需要回复，请 @ 回 @ 你的角色，并回复其消息。

3. 如果你没有被 @，你可以选择：
    * 直接发送新的消息，对群聊进行补充，或者对其他角色的消息进行评论 (不需要 @ 任何角色)。
    *  @ 某个或多个其他角色，对他们的消息进行回复或提问。

4. 你的回复应该符合你的角色设定，并且与群聊主题相关。${extraPrompt || ''}`;
      
      return prompt;
    } catch (error) {
      console.error(`【群聊服务】构建群聊回复提示词失败:`, error);
      return "";
    }
  }

  /**
   * 获取角色与用户的私聊历史
   */
  private static async getPrivateChatHistory(characterId: string, userId: string): Promise<string> {
    try {
      // 使用 StorageAdapter 获取最近的消息（限制为10条）
      const messages = await StorageAdapter.getRecentMessages(characterId, 10);
      
      if (!messages || messages.length === 0) {
        return '暂无私聊记录';
      }
      
      // 格式化消息为可读文本
      const formattedHistory = messages.map((msg, idx) => {
        const role = msg.role === 'user' ? '用户' : '角色';
        return `${idx + 1}. ${role}: ${msg.parts?.[0]?.text || ''}`;
      }).join('\n');
      
      return formattedHistory;
    } catch (error) {
      console.error(`【群聊服务】获取私聊历史失败:`, error);
      return '获取聊天记录失败';
    }
  }



  /**
   * 保存群聊消息
   */
  private static async saveGroupMessage(groupId: string, message: GroupMessage): Promise<void> {
    try {
      // 获取群组的现有消息列表
      const messages = await this.getGroupMessages(groupId);
      
      // 添加新消息
      messages.push(message);
      
      // 保存更新后的消息列表
      await AsyncStorage.setItem(`group_messages_${groupId}`, JSON.stringify(messages));
      
      // 通知所有监听此群组消息的监听器
      this.notifyMessageListeners(groupId, messages);
    } catch (error) {
      console.error(`【群聊服务】保存群聊消息失败:`, error);
      throw error;
    }
  }

  /**
   * 清空群聊消息历史
   * @param groupId 群组ID
   * @param userId 执行清空操作的用户ID（必须是群主）
   */
  static async clearGroupMessages(groupId: string, userId: string): Promise<boolean> {
    try {
      console.log(`【群聊服务】尝试清空群组消息历史，ID: ${groupId}, 用户ID: ${userId}`);
      
      // 获取群组信息
      const group = await this.getGroupById(groupId);
      
      if (!group) {
        console.error(`【群聊服务】清空群聊消息失败: 找不到群组 ${groupId}`);
        return false;
      }
      
      // 验证执行操作的用户是否是群主
      if (group.groupOwnerId !== userId) {
        console.error(`【群聊服务】清空群聊消息失败: 用户 ${userId} 不是群主`);
        return false;
      }
      
      // 清空群组消息 - 存入一条系统消息表示历史已清空
      const systemMessage: GroupMessage = {
        messageId: `msg-${Date.now()}`,
        groupId,
        senderId: 'system',
        senderName: '系统',
        messageContent: `群聊历史记录已被群主清空`,
        messageType: 'text',
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };
      
      // 保存这条系统消息作为唯一消息
      await AsyncStorage.setItem(`group_messages_${groupId}`, JSON.stringify([systemMessage]));
      
      // 通知所有监听器
      this.notifyMessageListeners(groupId, [systemMessage]);
      
      console.log(`【群聊服务】成功清空群组 ${groupId} 的消息历史`);
      return true;
    } catch (error) {
      console.error(`【群聊服务】清空群聊消息失败:`, error);
      return false;
    }
  }

  /**
   * 解散群组
   * @param groupId 群组ID
   * @param userId 执行解散操作的用户ID（必须是群主）
   */
  static async disbandGroup(groupId: string, userId: string): Promise<boolean> {
    try {
      console.log(`【群聊服务】尝试解散群组，ID: ${groupId}, 用户ID: ${userId}`);
      
      // 获取群组信息
      const group = await this.getGroupById(groupId);
      
      if (!group) {
        console.error(`【群聊服务】解散群组失败: 找不到群组 ${groupId}`);
        return false;
      }
      
      // 验证执行操作的用户是否是群主
      if (group.groupOwnerId !== userId) {
        console.error(`【群聊服务】解散群组失败: 用户 ${userId} 不是群主`);
        return false;
      }
      
      // 获取所有群组
      const groups = await this.getGroups();
      
      // 过滤掉要解散的群组
      const updatedGroups = groups.filter(g => g.groupId !== groupId);
      
      // 保存更新后的群组列表
      await AsyncStorage.setItem('user_groups', JSON.stringify(updatedGroups));
      
      // 清理群组消息
      await AsyncStorage.removeItem(`group_messages_${groupId}`);
      
      // 清理群组成员角色数据
      for (const memberId of group.groupMemberIds) {
        await AsyncStorage.removeItem(`group_character_${groupId}_${memberId}`);
      }
      
      console.log(`【群聊服务】成功解散群组, ID: ${groupId}`);
      return true;
    } catch (error) {
      console.error(`【群聊服务】解散群组失败:`, error);
      return false;
    }
  }

  /**
   * 添加群聊消息监听器
   */
  static addMessageListener(groupId: string, listener: (messages: GroupMessage[]) => void): () => void {
    if (!this.messageListeners[groupId]) {
      this.messageListeners[groupId] = [];
    }
    
    this.messageListeners[groupId].push(listener);
    console.log(`【群聊服务】已添加群组 ${groupId} 的消息监听器，当前监听器数: ${this.messageListeners[groupId].length}`);
    
    // 返回用于移除监听器的函数
    return () => this.removeMessageListener(groupId, listener);
  }

  /**
   * 移除群聊消息监听器
   */
  static removeMessageListener(groupId: string, listener: (messages: GroupMessage[]) => void): void {
    if (!this.messageListeners[groupId]) {
      return;
    }
    
    const index = this.messageListeners[groupId].indexOf(listener);
    if (index !== -1) {
      this.messageListeners[groupId].splice(index, 1);
      console.log(`【群聊服务】已移除群组 ${groupId} 的消息监听器，剩余监听器数: ${this.messageListeners[groupId].length}`);
    }
  }

  /**
   * 通知群聊消息监听器
   */
  private static notifyMessageListeners(groupId: string, messages: GroupMessage[]): void {
    if (!this.messageListeners[groupId]) {
      return;
    }
    
    console.log(`【群聊服务】通知群组 ${groupId} 的 ${this.messageListeners[groupId].length} 个监听器，消息数: ${messages.length}`);
    
    // Ensure we're copying the messages to avoid reference issues
    const messagesCopy = JSON.parse(JSON.stringify(messages));
    
    // Use setTimeout to ensure notification happens in an async manner
    setTimeout(() => {
      // Notify all listeners
      this.messageListeners[groupId].forEach(listener => {
        try {
          listener(messagesCopy);
        } catch (error) {
          console.error(`【群聊服务】通知消息监听器时出错:`, error);
        }
      });
    }, 0);
  }

  /**
   * 获取所有群组
   */
  static async getGroups(): Promise<Group[]> {
    try {
      const storedGroups = await AsyncStorage.getItem('user_groups');
      return storedGroups ? JSON.parse(storedGroups) : [];
    } catch (error) {
      console.error(`【群聊服务】获取群组列表失败:`, error);
      return [];
    }
  }



  /**
   * 获取群组的消息列表
   */
  static async getGroupMessages(groupId: string): Promise<GroupMessage[]> {
    try {
      console.log(`【群聊服务】获取群组消息，ID: ${groupId}`);
      const storedMessages = await AsyncStorage.getItem(`group_messages_${groupId}`);
      const messages = storedMessages ? JSON.parse(storedMessages) : [];
      
      // Debug log to track if messages are being successfully retrieved
      console.log(`【群聊服务】成功获取到 ${messages.length} 条群组消息`);
      
      return messages;
    } catch (error) {
      console.error(`【群聊服务】获取群组消息失败:`, error);
      return [];
    }
  }

  /**
   * 根据ID列表获取角色列表
   */
  public static async getCharactersByIds(characterIds: string[]): Promise<Character[]> {
    try {
      console.log(`【群聊服务】尝试获取角色信息，ID数量: ${characterIds.length}`);
      const characters: Character[] = [];
      
      // 首先尝试从FileSystem加载，这是CharactersContext存储角色的主要位置
      try {
        const FileSystem = require('expo-file-system');
        const charactersStr = await FileSystem.readAsStringAsync(
          FileSystem.documentDirectory + 'characters.json',
          { encoding: FileSystem.EncodingType.UTF8 }
        ).catch(() => '[]');
        
        if (charactersStr && charactersStr !== '[]') {
          const allCharacters: Character[] = JSON.parse(charactersStr);
          console.log(`【群聊服务】从FileSystem加载了${allCharacters.length}个角色`);
          
          // 过滤出需要的角色
          const foundCharacters = allCharacters.filter(c => characterIds.includes(c.id));
          if (foundCharacters.length > 0) {
            console.log(`【群聊服务】从FileSystem找到了${foundCharacters.length}个所需角色`);
            return foundCharacters;
          }
        }
      } catch (fsError) {
        console.error('【群聊服务】从FileSystem加载角色失败:', fsError);
      }
      
      // 如果从FileSystem加载失败，尝试从AsyncStorage加载
      console.log('【群聊服务】从FileSystem未找到角色，尝试AsyncStorage');
      
      // 尝试从user_characters键加载
      try {
        const charactersString = await AsyncStorage.getItem('user_characters');
        if (charactersString) {
          const allCharacters: Character[] = JSON.parse(charactersString);
          console.log(`【群聊服务】从AsyncStorage 'user_characters'键加载了${allCharacters.length}个角色`);
          
          // 过滤出需要的角色
          const foundCharacters = allCharacters.filter(c => characterIds.includes(c.id));
          if (foundCharacters.length > 0) {
            console.log(`【群聊服务】从AsyncStorage找到了${foundCharacters.length}个所需角色`);
            return foundCharacters;
          }
        }
      } catch (asyncError) {
        console.error('【群聊服务】从AsyncStorage "user_characters"键加载角色失败:', asyncError);
      }
      
      // 最后尝试使用plain 'characters'键
      try {
        const plainCharactersString = await AsyncStorage.getItem('characters');
        if (plainCharactersString) {
          const allCharacters: Character[] = JSON.parse(plainCharactersString);
          console.log(`【群聊服务】从AsyncStorage 'characters'键加载了${allCharacters.length}个角色`);
          
          // 过滤出需要的角色
          const foundCharacters = allCharacters.filter(c => characterIds.includes(c.id));
          if (foundCharacters.length > 0) {
            console.log(`【群聊服务】从'characters'键找到了${foundCharacters.length}个所需角色`);
            return foundCharacters;
          }
        }
      } catch (plainError) {
        console.error('【群聊服务】从AsyncStorage "characters"键加载角色失败:', plainError);
      }
      
      // 如果还未找到，尝试逐个从character_id键中获取
      console.log(`【群聊服务】未找到批量角色，尝试逐个加载角色，总共${characterIds.length}个`);
      for (const id of characterIds) {
        try {
          const characterData = await AsyncStorage.getItem(`character_${id}`);
          if (characterData) {
            const character = JSON.parse(characterData);
            characters.push(character);
            console.log(`【群聊服务】成功加载角色 ${id} - ${character.name}`);
          } else {
            console.warn(`【群聊服务】未找到角色数据: ${id}`);
          }
        } catch (characterError) {
          console.error(`【群聊服务】加载角色 ${id} 失败:`, characterError);
        }
      }
      
      console.log(`【群聊服务】最终获取到 ${characters.length}/${characterIds.length} 个角色`);
      return characters;
    } catch (error) {
      console.error(`【群聊服务】获取角色列表失败:`, error);
      return [];
    }
  }
}
