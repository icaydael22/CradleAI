import { Character } from '@/shared/types';
import { CircleResponse } from '@/shared/types/circle-types';
import { RelationshipService } from '@/services/relationship-service';

/**
 * Apply relationship updates from NodeST circle response
 * @param character Character to update
 * @param response CircleResponse containing relationship updates
 * @returns Updated character
 */
export const applyRelationshipUpdates = (
  character: Character, 
  response: CircleResponse
): Character => {
  if (!response.relationshipUpdates || response.relationshipUpdates.length === 0) {
    return character;
  }
  
  let updatedCharacter = character;
  
  for (const update of response.relationshipUpdates) {
    updatedCharacter = RelationshipService.processRelationshipUpdate(
      updatedCharacter,
      update.targetId,
      update.strengthDelta,
      update.newType as any
    );
  }
  
  return updatedCharacter;
};

/**
 * Calculate relationship strength modifier based on interaction type
 * @param interactionType Type of interaction
 * @param content Content of interaction (for sentiment analysis)
 * @returns Strength modifier value
 */
export const getStrengthModifier = (
  interactionType: string, 
  content?: string
): number => {
  // Base modifiers by interaction type
  const baseModifiers = {
    'like': 2,
    'comment': 3,
    'reply': 4,
    'share': 5
  };
  
  // Get base modifier or default to 1
  const baseModifier = baseModifiers[interactionType as keyof typeof baseModifiers] || 1;
  
  // If no content, return base modifier
  if (!content) return baseModifier;
  
  // Very simple sentiment analysis (would be more sophisticated in production)
  const positive = ['thanks', 'good', 'great', 'love', 'awesome', 'happy', 'nice', 'like'].some(
    word => content.toLowerCase().includes(word)
  );
  
  const negative = ['bad', 'hate', 'awful', 'terrible', 'poor', 'dislike'].some(
    word => content.toLowerCase().includes(word)
  );
  
  // Apply sentiment multiplier
  if (positive) return baseModifier * 1.5;
  if (negative) return baseModifier * -1;
  
  return baseModifier;
};

/**
 * Calculate relationship depth based on interaction count
 * @param interactions Number of interactions
 * @returns Relationship depth level (1-5)
 */
export const getRelationshipDepth = (interactions: number): number => {
  if (interactions < 5) return 1;
  if (interactions < 15) return 2;
  if (interactions < 30) return 3;
  if (interactions < 50) return 4;
  return 5;
};

// Process relationship updates for multiple characters
export const processRelationshipUpdates = (
  characters: Character[],
  interactorId: string,
  targetId: string,
  interactionType: 'like' | 'comment' | 'reply',
  strengthDelta: number = 1
): Character[] => {
  return characters.map(character => {
    // Skip if the character is not the target or doesn't have relationships enabled
    if (character.id !== targetId || !character.relationshipEnabled) {
      return character;
    }

    // Update relationship with the interactor
    return RelationshipService.updateRelationship(
      character,
      interactorId,
      strengthDelta,
      `通过${interactionType === 'like' ? '点赞' : 
              interactionType === 'comment' ? '评论' : '回复'}产生互动`
    );
  });
};

// Check if a character needs relationship review
export const needsRelationshipReview = (character: Character): boolean => {
  return RelationshipService.needsRelationshipReview(character);
};

// Generate relationship state review prompt
export const generateRelationshipReviewPrompt = (character: Character): string => {
  if (!character.relationshipEnabled || !character.messageBox?.length) {
    return '';
  }

  const unreadMessages = character.messageBox.filter(msg => !msg.read);
  if (!unreadMessages.length) return '';

  // Create a structured prompt for AI to review relationships
  return `
现在你需要作为角色"${character.name}"检查最近收到的消息，并评估它们对你对其他角色关系的影响。

检查以下消息:
${unreadMessages.map(msg => `
- 来自: ${msg.senderName} (ID: ${msg.senderId})
- 内容: ${msg.content}
- 类型: ${msg.type}
${msg.contextContent ? `- 上下文: ${msg.contextContent}` : ''}
- 时间: ${new Date(msg.timestamp).toLocaleString()}
`).join('\n')}

根据这些消息，请分析并调整你对其他角色的关系。考虑以下因素:
1. 积极互动(点赞、友好评论)应该增加关系强度
2. 消极互动(批评、争论)应该减少关系强度
3. 互动的频率和强度应该考虑在内
4. 考虑你自己的性格和价值观如何解读这些互动

请输出以JSON格式的关系更新:
\`\`\`json
{
  "relationshipUpdates": [
    {
      "targetId": "角色ID",
      "strengthDelta": 数值变化(-10到+10),
      "reason": "变化原因的简短描述"
    },
    // 可以有多条更新
  ]
}
\`\`\`
`;
};

// Parse relationship update response from AI
export const parseRelationshipUpdates = (response: string) => {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                      response.match(/{[\s\S]*"relationshipUpdates"[\s\S]*}/);
    
    if (!jsonMatch) {
      console.error("No JSON found in response:", response);
      return null;
    }
    
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const data = JSON.parse(jsonStr);
    
    if (!data.relationshipUpdates || !Array.isArray(data.relationshipUpdates)) {
      console.error("Invalid relationshipUpdates format:", data);
      return null;
    }
    
    return data.relationshipUpdates;
  } catch (error) {
    console.error("Error parsing relationship updates:", error);
    return null;
  }
};
