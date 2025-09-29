import { useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { GroupService } from '@/src/group/group-service';
import { Character } from '@/shared/types';
import { Script } from '@/shared/types/script-types';
import { Group as UserGroup } from '@/src/group';
import { ScriptService } from '@/services/script-service';

export interface ConversationItem {
  id: string;
  name: string;
  avatar?: string;
  isGroup: boolean;
  isScript?: boolean; // 新增：标识是否为剧本
  members?: Character[];
  lastMessage?: string;
  lastMessageTime?: Date | null;
  unreadCount?: number;
}

interface UseConversationListOptions {
  characters: Character[];
  userGroups: UserGroup[];
}

/**
 * 从角色会话和群聊会话中汇总列表项，填充每项的“最后一条消息”与时间。
 * 该 Hook 负责从本地存储读取并组装展示层数据，供首页列表直接使用。
 */
export const useConversationList = ({ characters, userGroups }: UseConversationListOptions) => {
  const [lastMessageTimes, setLastMessageTimes] = useState<Record<string, number | null>>({});
  const [lastMessageTexts, setLastMessageTexts] = useState<Record<string, string>>({});
  const [scripts, setScripts] = useState<Script[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 加载每个角色的最后一条消息
  useEffect(() => {
    const loadLastMessagesForCharacters = async () => {
      const times: Record<string, number | null> = {};
      const texts: Record<string, string> = {};
      for (const character of characters) {
        try {
          const msgs = await StorageAdapter.getCleanChatHistory(character.id);
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            const time = (last as any).renderedAt || last.timestamp || null;
            times[character.id] = typeof time === 'number' ? time : (time ? Number(time) : null);
            texts[character.id] = last.parts?.[0]?.text || '';
          } else {
            times[character.id] = null;
            texts[character.id] = '';
          }
        } catch (error) {
          console.error(`[useConversationList] loadLastMessagesForCharacters error for ${character.id}:`, error);
          times[character.id] = null;
          texts[character.id] = '';
        }
      }
      setLastMessageTimes(prev => ({ ...prev, ...times }));
      setLastMessageTexts(prev => ({ ...prev, ...texts }));
    };
    if (characters.length > 0) loadLastMessagesForCharacters();
  }, [characters]);

  // 加载每个群的最后一条消息
  useEffect(() => {
    const loadLastMessagesForGroups = async () => {
      const times: Record<string, number | null> = {};
      const texts: Record<string, string> = {};
      for (const group of userGroups) {
        try {
          const messages = await GroupService.getGroupMessages(group.groupId);
          if (messages && messages.length > 0) {
            const last = messages[messages.length - 1] as any;
            texts[group.groupId] = last.messageContent || '';
            const t: any = last.messageCreatedAt;
            times[group.groupId] = typeof t === 'number'
              ? t
              : (typeof t === 'string' ? new Date(t).getTime() : (t && t.getTime ? t.getTime() : null));
          } else {
            texts[group.groupId] = '';
            times[group.groupId] = null;
          }
        } catch (error) {
          console.error(`[useConversationList] loadLastMessagesForGroups error for ${group.groupId}:`, error);
          texts[group.groupId] = '';
          times[group.groupId] = null;
        }
      }
      setLastMessageTimes(prev => ({ ...prev, ...times }));
      setLastMessageTexts(prev => ({ ...prev, ...texts }));
    };
    if (userGroups.length > 0) loadLastMessagesForGroups();
  }, [userGroups]);

  // 加载剧本数据
  const loadScripts = useCallback(async () => {
    try {
      const scriptService = ScriptService.getInstance();
      const allScripts = await scriptService.getAllScripts();
      setScripts(allScripts);
      
      // 加载剧本的最后消息
      const times: Record<string, number | null> = {};
      const texts: Record<string, string> = {};
      
      for (const script of allScripts) {
        try {
          const scriptHistory = await scriptService.getScriptHistory(script.id);
          if (scriptHistory.length > 0) {
            const lastMessage = scriptHistory[scriptHistory.length - 1];
            times[script.id] = lastMessage.timestamp;
            texts[script.id] = lastMessage.aiResponse.plotContent || '最新剧情';
          } else {
            times[script.id] = script.createdAt;
            texts[script.id] = '点击开始剧本';
          }
        } catch (error) {
          console.error(`[useConversationList] loadScripts error for ${script.id}:`, error);
          times[script.id] = script.createdAt;
          texts[script.id] = '点击开始剧本';
        }
      }
      
      setLastMessageTimes(prev => ({ ...prev, ...times }));
      setLastMessageTexts(prev => ({ ...prev, ...texts }));
    } catch (error) {
      console.error('[useConversationList] loadScripts error:', error);
    }
  }, []);

  // 加载剧本数据 - 使用useEffect和refreshTrigger
  useEffect(() => {
    loadScripts();
  }, [loadScripts, refreshTrigger]);

  // 监听剧本创建和删除事件
  useEffect(() => {
    const listener = EventRegister.addEventListener('scriptCreated', () => {
      console.log('[useConversationList] Script created, refreshing scripts list');
      setRefreshTrigger(prev => prev + 1);
    });
    
    const deleteListener = EventRegister.addEventListener('scriptDeleted', (payload: any) => {
      console.log('[useConversationList] Script deleted, refreshing scripts list', payload);
      setRefreshTrigger(prev => prev + 1);
    });
    
    const refreshListener = EventRegister.addEventListener('refreshConversationList', () => {
      console.log('[useConversationList] Manual refresh triggered');
      setRefreshTrigger(prev => prev + 1);
    });

    return () => {
      if (listener) EventRegister.removeEventListener(listener as string);
      if (deleteListener) EventRegister.removeEventListener(deleteListener as string);
      if (refreshListener) EventRegister.removeEventListener(refreshListener as string);
    };
  }, []);

  // 汇总会话列表（私聊 + 群聊 + 剧本）
  const conversationItems: ConversationItem[] = useMemo(() => {
    const privateConversations: ConversationItem[] = characters.map((char: Character) => {
      const lastTime = lastMessageTimes[char.id];
      return {
        id: char.id,
        name: char.name,
        avatar: (char.avatar ?? undefined) as string | undefined,
        isGroup: false,
        isScript: false,
        lastMessage: lastMessageTexts[char.id] || '',
        lastMessageTime: lastTime ? new Date(lastTime) : null,
        unreadCount: 0,
      };
    });

    const groupConversations: ConversationItem[] = userGroups.map(group => {
      const t = lastMessageTimes[group.groupId];
      return {
        id: group.groupId,
        name: group.groupName,
        isGroup: true,
        isScript: false,
        members: [], // 列表页如需成员头像，可在外层补齐
        lastMessage: lastMessageTexts[group.groupId] || `${group.groupMemberIds.length}个成员`,
        lastMessageTime: t ? new Date(t) : null,
        unreadCount: 0,
      };
    });

    const scriptConversations: ConversationItem[] = scripts.map(script => {
      const lastTime = lastMessageTimes[script.id];
      return {
        id: script.id,
        name: script.name,
        avatar: script.cover,
        isGroup: false,
        isScript: true,
        // 不在会话列表中显示剧本的最新消息，留空或 undefined
        lastMessage: ``,
        lastMessageTime: lastTime ? new Date(lastTime) : null,
        unreadCount: 0,
      };
    });

    return [...privateConversations, ...groupConversations, ...scriptConversations];
  }, [characters, userGroups, scripts, lastMessageTimes, lastMessageTexts]);

  // 手动刷新方法
  const refreshConversationList = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { conversationItems, refreshConversationList };
};


