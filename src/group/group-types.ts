/**
 * 群组定义
 */
export interface Group {
  groupId: string; // 群组ID (唯一标识符)
  groupName: string; // 群组名称
  groupTopic: string; // 群组主题 (由创建者定义)
  groupDescription?: string; // 群组描述 (可选)
  groupOwnerId: string; // 群组创建者ID
  groupMemberIds: string[]; // 群组成员ID列表 (包含角色和用户ID)
  groupCreatedAt: Date; // 群组创建时间
  groupUpdatedAt: Date; // 群组更新时间
  groupAvatar?: string; // 群组头像 (群内的所有角色头像)
  groupSettings?: GroupSettings; // 群组设置 (例如，是否允许匿名发言等)
  backgroundImage?: string; // 群组背景图 (可选)
}

/**
 * 群组设置
 */
export interface GroupSettings {
  allowAnonymous?: boolean; // 是否允许匿名发言
  requireApproval?: boolean; // 加入群组是否需要审批
  maxMembers?: number; // 群组成员上限
  // 其他群组设置...
}

/**
 * 群聊消息
 */
export interface GroupMessage {
  messageId: string; // 消息ID (唯一标识符)
  groupId: string; // 所属群组ID
  senderId: string; // 发送者ID (角色或用户ID)
  senderName: string; // 发送者名称 (角色名或用户名)
  messageContent: string; // 消息内容
  messageType: 'text' | 'image' | 'video' | 'audio' | 'file'; // 消息类型
  messageCreatedAt: Date; // 消息创建时间
  messageUpdatedAt: Date; // 消息更新时间
  replyToMessageId?: string; // 回复的消息ID (可选)
  mentionedUserIds?: string[]; // @的用户ID列表 (可选)
  reactions?: GroupMessageReaction[]; // 消息反应 (例如，点赞、表情等)
}

/**
 * 群聊消息反应
 */
export interface GroupMessageReaction {
  userId: string; // 做出反应的用户ID
  reactionType: 'like' | 'dislike' | 'emoji1' | 'emoji2' | string; // 反应类型
  reactionCreatedAt: Date; // 反应创建时间
}

/**
 * 角色在群组中的统计数据
 */
export interface GroupCharacterStats {
  characterId: string  ; // 角色ID
  groupId: string; // 群组ID
  dailyMessageCount: number; // 当日消息数量
  lastActiveTime: Date | null; // 最后活跃时间
  lastMessageTime: Date | null; // 最后发消息时间
  mentionedTimes?: number; // 被@的次数
  mentionedOthers?: Record<string, number>; // @其他角色的次数，键为角色ID
}

/**
 * 群聊互动选项
 */
export interface GroupInteractionOptions {
  type: 'newGroup' | 'replyToGroupMessage' | 'mentionResponse';
  groupId: string;
  content: string;
  responderId: string;
  originalMessage?: GroupMessage;
  mentionedUserIds?: string[];
  referenceMessages?: GroupMessage[];
  context?: string;
}

/**
 * 群聊互动响应
 */
export interface GroupInteractionResponse {
  success: boolean;
  content?: string;
  error?: string;
  mentionedUserIds?: string[];
  thoughts?: string;
}
