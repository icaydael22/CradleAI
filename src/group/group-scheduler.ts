import { Character, GlobalSettings } from '../../shared/types';
import { Group, GroupMessage } from './group-types';
import { GroupService } from './group-service';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 群聊调度器 - 负责管理角色回复的调度和速率限制
 */
export class GroupScheduler {
  private static instance: GroupScheduler;
  private queue: Array<ScheduleItem> = [];
  private isProcessing: boolean = false;
  private processingInterval: number = 5000; // 默认5秒处理一个回复

  // 新增：定时消息相关状态
  private timedMessageIntervals: Record<string, NodeJS.Timeout> = {}; // 存储定时器
  private lastReplyTimes: Record<string, number> = {}; // 存储上次回复时间
  private groupSettings: Record<string, GroupSettings> = {}; // 存储群组设置
  private timedMessagesActive: boolean = true; // 控制是否启用定时消息
  private checkingTimedMessages: boolean = false; // 防止并发检查
  private lastReplyTimesLoaded: boolean = false; // 标记是否已加载上次回复时间

  // 使用单例模式
  public static getInstance(): GroupScheduler {
    if (!GroupScheduler.instance) {
      GroupScheduler.instance = new GroupScheduler();
    }
    return GroupScheduler.instance;
  }

  /**
   * 构造函数 - 初始化并启动定时检查
   */
  private constructor() {
    console.log(`【群聊调度器】初始化群聊调度器实例`);
    // 加载持久化的设置和上次回复时间
    this.loadPersistedData();
    // 启动定时消息检查
    this.startTimedMessageCheck();
  }

  /**
   * 从AsyncStorage加载持久化数据
   */
  private async loadPersistedData(): Promise<void> {
    try {
      // 先尝试加载从group_scheduler_settings键中的设置
      const settingsStr = await AsyncStorage.getItem('group_scheduler_settings');
      if (settingsStr) {
        this.groupSettings = JSON.parse(settingsStr);
        console.log(`【群聊调度器】从存储加载群组设置，共 ${Object.keys(this.groupSettings).length} 个群组`);
      }

      // 然后检查并加载每个群组的个别设置，这些会覆盖默认设置
      try {
        // Get all AsyncStorage keys
        const keys = await AsyncStorage.getAllKeys();
        const groupSettingsKeys = keys.filter(key => key.startsWith('group_settings_'));
        
        if (groupSettingsKeys.length > 0) {
          console.log(`【群聊调度器】发现 ${groupSettingsKeys.length} 个群组单独设置`);
          
          // Get all values for the group settings keys
          const groupSettingsPairs = await AsyncStorage.multiGet(groupSettingsKeys);
          
          // Process each group's settings
          for (const [key, value] of groupSettingsPairs) {
            if (value) {
              const groupId = key.replace('group_settings_', '');
              const settings = JSON.parse(value);
              
              // Update the settings in memory
              this.groupSettings[groupId] = settings;
              
              console.log(`【群聊调度器】从单独存储加载群组 ${groupId} 设置:`, 
                JSON.stringify({
                  replyInterval: settings.replyIntervalMinutes,
                  messageLimit: settings.dailyMessageLimit,
                  refMsgLimit: settings.referenceMessageLimit,
                  timedMessagesEnabled: settings.timedMessagesEnabled
                })
              );
            }
          }
        }
      } catch (error) {
        console.error('【群聊调度器】加载个别群组设置失败:', error);
      }

      // 加载上次回复时间
      const lastReplyTimesStr = await AsyncStorage.getItem('group_scheduler_reply_times');
      if (lastReplyTimesStr) {
        this.lastReplyTimes = JSON.parse(lastReplyTimesStr);
        console.log(`【群聊调度器】从存储加载回复时间记录，共 ${Object.keys(this.lastReplyTimes).length} 条记录`);
      }
      
      this.lastReplyTimesLoaded = true;
    } catch (error) {
      console.error(`【群聊调度器】加载持久化数据失败:`, error);
    }
  }

  /**
   * 持久化保存重要数据
   */
  private async persistData(): Promise<void> {
    try {
      // 保存群组设置
      await AsyncStorage.setItem('group_scheduler_settings', JSON.stringify(this.groupSettings));
      
      // 保存上次回复时间
      await AsyncStorage.setItem('group_scheduler_reply_times', JSON.stringify(this.lastReplyTimes));
      
      console.log(`【群聊调度器】已持久化保存调度器数据`);
    } catch (error) {
      console.error(`【群聊调度器】保存持久化数据失败:`, error);
    }
  }

  /**
   * 设置群组设置
   * @param groupId 群组ID
   * @param settings 群组设置
   */
  public setGroupSettings(groupId: string, settings: GroupSettings): void {
    this.groupSettings[groupId] = settings;
    console.log(`【群聊调度器】更新群组 ${groupId} 设置:`, 
      JSON.stringify({
        replyInterval: settings.replyIntervalMinutes,
        messageLimit: settings.dailyMessageLimit,
        refMsgLimit: settings.referenceMessageLimit,
        timedMessagesEnabled: settings.timedMessagesEnabled
      })
    );
    
    // 持久化保存设置
    this.persistData();
    
    // 同时保存到群组专用的存储键
    try {
      const storageKey = `group_settings_${groupId}`;
      AsyncStorage.setItem(storageKey, JSON.stringify(settings))
        .then(() => {
          console.log(`【群聊调度器】已将设置单独保存到 ${storageKey}`);
        })
        .catch(error => {
          console.error(`【群聊调度器】保存设置到 ${storageKey} 失败:`, error);
        });
    } catch (error) {
      console.error(`【群聊调度器】准备保存到单独存储键时出错:`, error);
    }
  }

  /**
   * 获取群组设置
   * @param groupId 群组ID
   * @returns 群组设置，如果不存在则返回默认设置
   */
  public getGroupSettings(groupId: string): GroupSettings {
    return this.groupSettings[groupId] || {
      dailyMessageLimit: 50,
      replyIntervalMinutes: 1,
      referenceMessageLimit: 5,
      timedMessagesEnabled: false // 默认禁用定时消息
    };
  }

  /**
   * 启动定时消息检查
   */
  private startTimedMessageCheck(): void {
    // 每分钟检查一次是否有角色需要发送定时消息
    const checkInterval = 60 * 1000; // 1分钟
    
    console.log(`【群聊调度器】启动定时消息检查，间隔: ${checkInterval}ms`);
    
    setInterval(() => {
      if (this.timedMessagesActive && !this.checkingTimedMessages) {
        this.checkForTimedMessages();
      }
    }, checkInterval);
  }

  /**
   * 检查是否有角色需要发送定时消息
   */
  private async checkForTimedMessages(): Promise<void> {
    if (this.checkingTimedMessages) return;
    
    this.checkingTimedMessages = true;
    try {
      console.log(`【群聊调度器】检查定时消息...`);
      
      // 确保上次回复时间已加载
      if (!this.lastReplyTimesLoaded) {
        await this.loadPersistedData();
      }
      
      // 获取当前时间
      const now = Date.now();
      
      // 遍历所有群组设置
      for (const groupId in this.groupSettings) {
        // 获取群组
        const group = await GroupService.getGroupById(groupId);
        if (!group) {
          console.log(`【群聊调度器】群组 ${groupId} 不存在，跳过`);
          continue;
        }
        
        // 获取群组设置
        const settings = this.groupSettings[groupId];
        
        // 如果定时消息功能被禁用，则跳过这个群组
        if (settings.timedMessagesEnabled === false) {
          console.log(`【群聊调度器】群组 ${group.groupName} (${groupId}) 的定时消息功能已禁用，跳过检查`);
          continue;
        }
        
        const replyIntervalMs = settings.replyIntervalMinutes * 60 * 1000;
        
        // 获取群组中的角色ID
        const characterIds = group.groupMemberIds.filter(id => id !== group.groupOwnerId);
        
        // 获取角色对象
        const characters = await GroupService.getCharactersByIds(characterIds);
        
        console.log(`【群聊调度器】群组 ${groupId} 中有 ${characters.length} 个角色，检查定时消息`);
        
        // 检查每个角色是否需要发送定时消息
        for (const character of characters) {
          // 构建角色-群组标识符
          const charGroupKey = `${character.id}-${groupId}`;
          
          // 获取上次回复时间
          const lastReplyTime = this.lastReplyTimes[charGroupKey] || 0;
          
          // 如果角色从未回复过，记录当前时间并跳过
          if (lastReplyTime === 0) {
            console.log(`【群聊调度器】角色 ${character.name} (${character.id}) 在群组 ${group.groupName} 中没有回复记录，初始化时间`);
            this.lastReplyTimes[charGroupKey] = now;
            this.persistData(); // 保存更新
            continue;
          }
          
          // 计算时间差
          const timeSinceLastReply = now - lastReplyTime;
          
          // 详细日志
          console.log(
            `【群聊调度器】角色 ${character.name} (${character.id}) 距上次回复: ` +
            `${(timeSinceLastReply/60000).toFixed(1)}分钟, ` +
            `设定间隔: ${settings.replyIntervalMinutes}分钟, ` +
            `上次回复时间: ${new Date(lastReplyTime).toLocaleTimeString()}, ` +
            `当前时间: ${new Date(now).toLocaleTimeString()}`
          );
          
          // 检查是否达到发送间隔
          if (timeSinceLastReply >= replyIntervalMs) {
            console.log(`【群聊调度器】角色 ${character.name} 在群组 ${group.groupName} 中达到定时发送条件`);
            
            // 如果进行中的队列太长，则跳过此次调度
            if (this.queue.length > 10) {
              console.log(`【群聊调度器】当前队列积压(${this.queue.length}条)，跳过此次定时发送`);
              continue;
            }
            
            try {
              // 调度定时消息任务
              await this.scheduleTimedMessage(group, character);
              
              // 更新上次回复时间
              this.lastReplyTimes[charGroupKey] = now;
              console.log(`【群聊调度器】已更新角色 ${character.name} 的上次回复时间: ${new Date(now).toLocaleTimeString()}`);
              
              // 持久化保存更新后的回复时间
              this.persistData();
            } catch (error) {
              console.error(`【群聊调度器】安排 ${character.name} 的定时消息失败:`, error);
            }
          } else {
            console.log(`【群聊调度器】角色 ${character.name} 尚未达到定时发送条件，还需 ${
              ((replyIntervalMs - timeSinceLastReply)/60000).toFixed(1)
            } 分钟`);
          }
        }
      }
    } catch (error) {
      console.error(`【群聊调度器】检查定时消息失败:`, error);
    } finally {
      this.checkingTimedMessages = false;
    }
  }

  /**
   * 安排一个定时消息任务
   * @param group 群组
   * @param character 角色
   */
  private async scheduleTimedMessage(group: Group, character: Character): Promise<void> {
    try {
      // 获取最近的群聊消息
      const recentMessages = await GroupService.getGroupMessages(group.groupId);
      if (recentMessages.length === 0) {
        console.log(`【群聊调度器】群组 ${group.groupName} 没有消息，无法发送定时消息`);
        return;
      }

      console.log(`【群聊调度器】开始为角色 ${character.name} 安排定时消息任务，群组: ${group.groupName}`);

      // 获取最近的几条消息作为上下文
      const contextMessages = recentMessages.slice(-5);
      console.log(`【群聊调度器】已获取 ${contextMessages.length} 条上下文消息`);
      
      // 创建一个虚拟的"系统"消息，表示这是一个定时触发
      const timedTriggerMessage: GroupMessage = {
        messageId: `timed-${Date.now()}`,
        groupId: group.groupId,
        senderId: "system",
        senderName: "系统",
        messageContent: "[TIMED_MESSAGE] 此消息由系统自动触发，表示一段时间内没有新消息。请根据聊天情况生成自然的发言。",
        messageType: "text",
        messageCreatedAt: new Date(),
        messageUpdatedAt: new Date()
      };

      // 调度一个高优先级的任务
      this.queue.push({
        group,
        character,
        originalMessage: timedTriggerMessage,
        referenceMessages: contextMessages,
        type: 'timed', // 新增类型：定时消息
        position: 0, // 作为第一个回复者
        priority: 2, // 高优先级
        isTimerTriggered: true
      });

      console.log(`【群聊调度器】已添加角色 ${character.name} 的定时消息任务到队列，队列长度: ${this.queue.length}`);

      // 开始处理队列
      if (!this.isProcessing) {
        console.log(`【群聊调度器】队列未在处理中，启动队列处理`);
        this.processQueue();
      } else {
        console.log(`【群聊调度器】队列已在处理中，定时消息将在当前处理完成后处理`);
      }
    } catch (error) {
      console.error(`【群聊调度器】安排定时消息失败:`, error);
    }
  }

  /**
   * 记录角色回复时间
   * @param characterId 角色ID
   * @param groupId 群组ID
   */
  public recordReplyTime(characterId: string, groupId: string): void {
    const charGroupKey = `${characterId}-${groupId}`;
    const previousTime = this.lastReplyTimes[charGroupKey];
    this.lastReplyTimes[charGroupKey] = Date.now();
    
    console.log(`【群聊调度器】记录角色 ${characterId} 在群组 ${groupId} 的回复时间: ${
      new Date(this.lastReplyTimes[charGroupKey]).toLocaleTimeString()
    }, 之前记录: ${
      previousTime ? new Date(previousTime).toLocaleTimeString() : '无'
    }`);
    
    // 持久化保存更新后的回复时间
    this.persistData();
  }

  /**
   * 调度群组角色的回复
   */
  public scheduleGroupResponses(
    group: Group,
    message: GroupMessage,
    characters: Character[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): void {
    console.log(`【群聊调度器】调度群组 ${group.groupName} 的 ${characters.length} 个角色的回复`);

    // 检查角色数组是否有效
    if (!characters || characters.length === 0) {
      console.warn(`【群聊调度器】没有角色可以回复，检查是否正确加载了群组成员`);
      console.log(`【群聊调度器】群组成员ID列表: ${group.groupMemberIds.join(', ')}`);
      return;
    }

    // 记录角色信息以便调试
    console.log(`【群聊调度器】角色列表: ${characters.map(c => `${c.name}(${c.id})`).join(', ')}`);

    // 复制一份角色列表，以避免修改原数组
    const charactersToProcess = [...characters];

    // 打乱角色顺序，以随机化回复顺序
    this.shuffleArray(charactersToProcess);

    // 创建每个角色的调度项
    for (let i = 0; i < charactersToProcess.length; i++) {
      // 初始化当前角色和当前角色之前的所有回复
      const currentCharacter = charactersToProcess[i];
      const previousResponses: GroupMessage[] = [];

      this.queue.push({
        group,
        character: currentCharacter,
        originalMessage: message,
        referenceMessages: previousResponses,
        type: 'normal',
        apiKey,
        apiSettings,
        position: i // 记录位置，用于决定可以引用哪些之前的回复
      });

      console.log(`【群聊调度器】已添加角色 ${currentCharacter.name} 到回复队列，位置 ${i + 1}/${charactersToProcess.length}`);
      
      // 记录角色回复时间
      this.recordReplyTime(currentCharacter.id, group.groupId);
    }

    // 如果当前没有处理队列，则开始处理
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 调度被@提及的角色回复
   */
  public scheduleMentionedResponses(
    group: Group,
    message: GroupMessage,
    mentionedCharacters: Character[],
    groupMessages: GroupMessage[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): void {
    console.log(`【群聊调度器】调度被@提及的 ${mentionedCharacters.length} 个角色的回复`);

    // 为被@提及的每个角色创建调度项
    mentionedCharacters.forEach((character) => {
      this.queue.push({
        group,
        character,
        originalMessage: message,
        referenceMessages: groupMessages,
        type: 'mention',
        apiKey,
        apiSettings,
        priority: 1 // 优先级高于普通回复
      });
      
      console.log(`【群聊调度器】已添加被@提及的角色 ${character.name} 到回复队列`);
      
      // 记录角色回复时间
      this.recordReplyTime(character.id, group.groupId);
    });

    // 如果当前没有处理队列，则开始处理
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      console.log(`【群聊调度器】队列处理完成`);
      return;
    }

    this.isProcessing = true;

    // 按优先级排序队列
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 获取队列中的第一项
    const item = this.queue.shift();

    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      console.log(`【群聊调度器】处理角色 ${item.character.name} 的回复，类型: ${item.type}`);

      // 获取最新的群组消息
      const groupMessages = await GroupService.getGroupMessages(item.group.groupId);

      // 如果是第一个角色，直接回复原始消息
      // 如果是其他角色，还需要参考之前角色的回复
      const processedMessages = this.processReferenceMessages(
        groupMessages, 
        item.originalMessage, 
        item.position || 0,
        item.referMessageLimit || 5
      );

      // 如果是定时触发的消息，添加特殊标记
      let extraPrompt = '';
      if (item.type === 'timed') {
        console.log(`【群聊调度器】处理定时触发的消息，添加特殊提示词`);
        extraPrompt = `\n\n[TIMED_MESSAGE_INSTRUCTION] 作为角色${item.character.name}，你已经有一段时间没有在群聊中发言了。
请根据最近的群聊内容，发起一个新的、自然的话题，或者对之前的讨论进行延续。
你的消息应该看起来自然，不要提及"这里很安静"或"很久没人说话了"之类的内容。
这条消息应该感觉是你自然而然想要发送的，而不是被系统提醒发送的。`;
      }

      console.log(`【群聊调度器】开始调用GroupService.replyToGroupMessage处理回复`);
      
      // 调用服务处理回复
      const replyMessage = await GroupService.replyToGroupMessage(
        item.group.groupId,
        item.character,
        item.originalMessage,
        processedMessages,
        item.apiKey,
        item.apiSettings,
        extraPrompt // 传递额外提示
      );

      console.log(`【群聊调度器】角色 ${item.character.name} 的回复已处理，结果: ${replyMessage ? '成功' : '失败'}`);
      
      // 记录角色回复时间
      if (replyMessage) {
        this.recordReplyTime(item.character.id, item.group.groupId);
      }
      
      // 在完成消息处理后，获取最新消息并通知所有监听器
      if (replyMessage) {
        // 这一步不是必须的，因为GroupService.replyToGroupMessage中已经调用了saveGroupMessage
        // 但为了确保消息更新通知触发，在这里额外获取并通知一次
        const updatedMessages = await GroupService.getGroupMessages(item.group.groupId);
        // 手动调用通知函数，确保监听器收到更新
        if (typeof GroupService['notifyMessageListeners'] === 'function') {
          GroupService['notifyMessageListeners'](item.group.groupId, updatedMessages);
        }
      }
    } catch (error) {
      console.error(`【群聊调度器】处理角色 ${item.character.name} 的回复失败:`, error);
    }

    // 设置延时处理下一项
    console.log(`【群聊调度器】设置${this.processingInterval}ms后处理下一项，当前队列长度: ${this.queue.length}`);
    setTimeout(() => this.processQueue(), this.processingInterval);
  }

  /**
   * 处理参考消息列表
   * 角色可以看到原始消息和之前回复的消息，但数量有限制
   */
  private processReferenceMessages(
    allMessages: GroupMessage[],
    originalMessage: GroupMessage,
    position: number,
    referMessageLimit: number
  ): GroupMessage[] {
    // 过滤出原始消息之后的回复消息
    const responseMessages = allMessages.filter(
      msg => 
        new Date(msg.messageCreatedAt).getTime() > new Date(originalMessage.messageCreatedAt).getTime() &&
        msg.replyToMessageId === originalMessage.messageId
    );

    // 如果当前角色是第一个回复者，直接返回原始消息
    if (position === 0 || responseMessages.length === 0) {
      return [originalMessage];
    }

    // 对于后续角色，他们可以看到之前的回复，但数量有限制
    const availableReplies = responseMessages
      .sort((a, b) => new Date(a.messageCreatedAt).getTime() - new Date(b.messageCreatedAt).getTime())
      .slice(0, Math.min(position, referMessageLimit));

    // 返回原始消息和之前的回复
    return [originalMessage, ...availableReplies];
  }

  /**
   * 打乱数组顺序
   */
  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

/**
 * 调度项接口定义
 */
interface ScheduleItem {
  group: Group;
  character: Character;
  originalMessage: GroupMessage;
  referenceMessages: GroupMessage[];
  type: 'normal' | 'mention' | 'timed'; // 添加timed类型
  apiKey?: string;
  apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
  priority?: number;
  position?: number;
  referMessageLimit?: number;
  isTimerTriggered?: boolean; // 是否由定时器触发
}

/**
 * 群组设置接口定义
 */
export interface GroupSettings {
  dailyMessageLimit: number; // 每日消息限制
  replyIntervalMinutes: number; // 回复间隔(分钟)
  referenceMessageLimit: number; // 参考消息数量限制
  timedMessagesEnabled: boolean; // 是否启用定时消息功能
}
