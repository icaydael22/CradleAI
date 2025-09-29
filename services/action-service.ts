import { Character } from '../shared/types';
import { generateUniqueId } from '../utils/id-utils';
import { Relationship } from '../shared/types/relationship-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Define action types
export type ActionType = 'gift' | 'invitation' | 'challenge' | 'support' | 'confession';

// Define action status
export type ActionStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

// Define relationship action structure
export interface RelationshipAction {
  id: string;               // Action ID
  type: ActionType;         // Action type
  sourceCharacterId: string;// Source character ID
  targetCharacterId: string;// Target character ID
  content: string;          // Action description
  createdAt: number;        // Creation time
  expiresAt: number;        // Expiration time
  status: ActionStatus;     // Action status
  respondedAt?: number;     // Response time
  responseContent?: string; // Response content
}

/**
 * Service for managing relationship-triggered actions
 */
export class ActionService {
  /**
   * Checks for potential relationship-triggered actions
   * @param character The character to check for potential actions
   * @returns A list of generated relationship actions
   */
  static checkForPotentialActions(character: Character): RelationshipAction[] {
    console.log(`【行动服务】检查角色 ${character.name} 的潜在关系行动`);
    
    if (!character.relationshipMap || !character.relationshipEnabled) {
      console.log(`【行动服务】角色 ${character.name} 未启用关系系统或没有关系图谱`);
      return [];
    }
    
    const actions: RelationshipAction[] = [];
    const relationships = character.relationshipMap.relationships;
    
    // Get API settings without using localStorage
    // Instead, we'll use the character's own context or a more reliable method
    let apiProvider = 'gemini'; // Default provider
    
    // Try to get settings through AsyncStorage for React Native environment
    // This won't block the main thread
    (async () => {
      try {
        const settingsStr = await AsyncStorage.getItem('user');
        if (settingsStr) {
          const userData = JSON.parse(settingsStr);
          if (userData?.settings?.chat?.apiProvider) {
            apiProvider = userData.settings.chat.apiProvider;
            console.log(`【行动服务】从 AsyncStorage 获取 API 提供商: ${apiProvider}`);
          }
        }
      } catch (error) {
        console.warn('无法从 AsyncStorage 获取用户设置', error);
      }
    })();
    
    console.log(`【行动服务】使用 API 提供商: ${apiProvider}`);
    
    // Check each relationship for potential action triggers
    Object.entries(relationships).forEach(([targetId, relationship]: [string, Relationship]) => {
      // 移除过滤条件或减少限制，让更多行动有机会被触发
      // 如果有上次检查时间则判断是否过了24小时，否则允许触发
      const lastActionCheck = relationship.lastActionCheck || 0;
      const hasRecentCheck = Date.now() - lastActionCheck < 24 * 60 * 60 * 1000;
      
      if (hasRecentCheck) {
        return; // 如果最近检查过，跳过此关系
      }
      
      console.log(`【行动服务】检查 ${character.name} 与 ${targetId} 的关系，类型=${relationship.type}，强度=${relationship.strength}`);
      
      // 更新最后检查时间
      relationships[targetId].lastActionCheck = Date.now();
      
      // 放宽生成行动的条件，让好友关系也能触发
      // 礼物行动
      if ((relationship.type === 'close_friend' || relationship.type === 'best_friend') && 
          relationship.strength >= 70) {
        console.log(`【行动服务】触发礼物行动: ${character.name} -> ${targetId}`);
        actions.push({
          id: generateUniqueId(),
          type: 'gift' as ActionType,
          sourceCharacterId: character.id,
          targetCharacterId: targetId,
          content: `${character.name}想要送你一件礼物，表达友谊。`,
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days expiry
          status: 'pending' as ActionStatus
        });
      }
      
      // 邀请行动 - 降低触发门槛
      if (relationship.type !== 'enemy' && relationship.type !== 'rival' &&
          relationship.strength >= 40 && relationship.interactions >= 3) {
        actions.push({
          id: generateUniqueId(),
          type: 'invitation' as ActionType,
          sourceCharacterId: character.id,
          targetCharacterId: targetId,
          content: `${character.name}想邀请你一起参加活动。`,
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days expiry
          status: 'pending' as ActionStatus
        });
      }
      
      // 简化的邀请行动，几乎都可以触发
      if (relationship.interactions >= 5) {
        actions.push({
          id: generateUniqueId(),
          type: 'support' as ActionType,
          sourceCharacterId: character.id,
          targetCharacterId: targetId,
          content: `${character.name}想要表达对你的支持。`,
          createdAt: Date.now(),
          expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days expiry
          status: 'pending' as ActionStatus
        });
      }
      
      // 其他行动条件...
    });
    
    if (actions.length > 0) {
      console.log(`【行动服务】为角色 ${character.name} 生成了 ${actions.length} 个行动`);
      actions.forEach(action => {
        console.log(`【行动服务】行动详情: 类型=${action.type}, 目标=${action.targetCharacterId}, 内容=${action.content}`);
      });
    } else {
      console.log(`【行动服务】未能为角色 ${character.name} 生成任何行动`);
    }
    
    return actions;
  }
  
  /**
   * Processes a relationship action (accept/reject)
   * @param action The action to process
   * @param response The response (accept/reject)
   * @param characters Map of all relevant characters
   * @returns Updated map of characters
   */
  static processActionResponse(
    action: RelationshipAction, 
    response: 'accept' | 'reject',
    characters: Record<string, Character>
  ): Record<string, Character> {
    const updatedCharacters = { ...characters };
    const sourceCharacter = updatedCharacters[action.sourceCharacterId];
    const targetCharacter = updatedCharacters[action.targetCharacterId];
    
    if (!sourceCharacter || !targetCharacter) {
      console.log(`【行动服务】处理行动响应失败: 找不到源角色或目标角色`);
      return updatedCharacters;
    }
    
    console.log(`【行动服务】处理行动响应: ${sourceCharacter.name} -> ${targetCharacter.name}, 响应=${response}, 类型=${action.type}`);
    
    // Update action status
    const updatedAction: RelationshipAction = {
      ...action,
      status: response === 'accept' ? 'accepted' as ActionStatus : 'rejected' as ActionStatus,
      respondedAt: Date.now()
    };
    
    // Store the action in character histories
    sourceCharacter.relationshipActions = [
      ...(sourceCharacter.relationshipActions || []),
      updatedAction
    ];
    
    targetCharacter.relationshipActions = [
      ...(targetCharacter.relationshipActions || []),
      updatedAction
    ];
    
    // Update relationship based on response
    if (sourceCharacter.relationshipMap && targetCharacter.relationshipMap) {
      const strengthDelta = response === 'accept' ? 10 : -5;
      const reason = response === 'accept' ? 
        `接受了${action.type}行动` : 
        `拒绝了${action.type}行动`;
      
      console.log(`【行动服务】关系强度变化: ${strengthDelta}, 原因: ${reason}`);
      
      // Update source -> target relationship
      if (sourceCharacter.relationshipMap.relationships[targetCharacter.id]) {
        const sourceRel = sourceCharacter.relationshipMap.relationships[targetCharacter.id];
        const oldStrength = sourceRel.strength;
        const newStrength = Math.max(-100, Math.min(100, sourceRel.strength + strengthDelta));
        
        sourceCharacter.relationshipMap.relationships[targetCharacter.id] = {
          ...sourceRel,
          strength: newStrength,
          lastUpdated: Date.now(),
          interactions: sourceRel.interactions + 1
        };
        
        console.log(`【行动服务】${sourceCharacter.name} -> ${targetCharacter.name} 关系强度更新: ${oldStrength} -> ${newStrength}`);
      }
      
      // Update target -> source relationship
      if (targetCharacter.relationshipMap.relationships[sourceCharacter.id]) {
        const targetRel = targetCharacter.relationshipMap.relationships[sourceCharacter.id];
        const oldStrength = targetRel.strength;
        const newStrength = Math.max(-100, Math.min(100, targetRel.strength + strengthDelta));
        
        targetCharacter.relationshipMap.relationships[sourceCharacter.id] = {
          ...targetRel,
          strength: newStrength,
          lastUpdated: Date.now(),
          interactions: targetRel.interactions + 1
        };
        
        console.log(`【行动服务】${targetCharacter.name} -> ${sourceCharacter.name} 关系强度更新: ${oldStrength} -> ${newStrength}`);
      }
    }
    
    // Potential API call with OpenRouter for more dynamic response content
    // This would be an ideal place to integrate with OpenRouter to generate
    // personalized responses based on the relationship and action type
    // But for now we'll leave this as a future enhancement
    
    return updatedCharacters;
  }
  
  /**
   * Expires old pending actions
   * @param character The character to check for expired actions
   * @returns Updated character with expired actions
   */
  static expireOldActions(character: Character): Character {
    if (!character.relationshipActions || character.relationshipActions.length === 0) {
      return character;
    }
    
    const now = Date.now();
    let hasExpired = false;
    
    // Check each action and mark expired ones
    const updatedActions = character.relationshipActions.map(action => {
      if (action.status === 'pending' && action.expiresAt < now) {
        console.log(`【行动服务】标记过期行动: ${action.type}, ID: ${action.id}`);
        hasExpired = true;
        return { ...action, status: 'expired' as ActionStatus };
      }
      return action;
    });
    
    // Only update if something changed
    if (hasExpired) {
      console.log(`【行动服务】已处理角色 ${character.name} 的过期行动`);
      return { ...character, relationshipActions: updatedActions };
    }
    
    return character;
  }
  
  /**
   * Gets pending actions for a character
   * @param character The character to get pending actions for
   * @returns List of pending actions
   */
  static getPendingActions(character: Character): RelationshipAction[] {
    if (!character.relationshipActions) {
      return [];
    }
    
    const now = Date.now();
    return character.relationshipActions.filter(
      action => action.status === 'pending' && action.expiresAt > now
    );
  }
  
  /**
   * Gets action history for a character
   * @param character The character to get action history for
   * @param limit Maximum number of actions to return (optional)
   * @returns List of past actions (accepted, rejected, expired)
   */
  static getActionHistory(character: Character, limit?: number): RelationshipAction[] {
    if (!character.relationshipActions) {
      return [];
    }
    
    const actions = character.relationshipActions
      .filter(action => action.status !== 'pending')
      .sort((a, b) => 
        (b.respondedAt || b.expiresAt) - (a.respondedAt || a.expiresAt)
      );
    
    return limit ? actions.slice(0, limit) : actions;
  }
}
