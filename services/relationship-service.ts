import { Character } from '@/shared/types';
import { generateId } from '@/utils/id-utils';
import { Relationship, RelationshipMapData, RelationshipType, MessageBoxItem } from '@/shared/types/relationship-types';
import { ApiSettings } from '@/shared/types/api-types';

// Define social interaction type for explore page
export interface SocialInteraction {
  userId: string;
  userName: string;
  isCharacter: boolean;
  createdAt: string;
  interactionType?: string;
  content?: string;
}

// Define post interaction type for explore page
export interface PostInteraction {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  type: string;
}

// Relationship Service class for managing character relationships
export class RelationshipService {
  // Relationship type thresholds
  private static RELATIONSHIP_TYPE_THRESHOLDS: Record<RelationshipType, number> = {
    'enemy': -80,
    'rival': -40,
    'stranger': -20,
    'acquaintance': 10,
    'colleague': 30,
    'friend': 50,
    'close_friend': 70,
    'best_friend': 90,
    // Add other relationship types with their thresholds
    'family': 85,
    'crush': 60,
    'lover': 80,
    'partner': 90,
    'ex': -30,
    'mentor': 70,
    'student': 60,
    'admirer': 40,
    'idol': 50
  };
  
  static needsRelationshipReview(character: Character): boolean {
    // Add your review logic here
    return character.relationshipEnabled && 
           character.messageBox?.some(msg => !msg.read) || false;
  }
  
  static updateRelationship(character: Character, interactorId: string, strengthDelta: number, reason: string): Character {
      // Implementation logic here
      return character;
    }
  
  /**
   * Initialize a relationship map for a character
   */
  public static initializeRelationshipMap(character: Character): Character {
    // Check if relationship map already exists
    if (character.relationshipMap) {
      console.log(`【关系服务】角色 ${character.name} 已有关系图谱，跳过初始化`);
      return character;
    }

    console.log(`【关系服务】为角色 ${character.name} 初始化新的关系图谱`);

    // Initialize empty relationship map
    const relationshipMap: RelationshipMapData = {
      relationships: {},
      lastReviewed: Date.now(),
      lastUpdated: Date.now() // Add this field to match the interface
    };

    // Initialize empty message box if not exists
    const messageBox = character.messageBox || [];

    // Return updated character
    return {
      ...character,
      relationshipMap,
      messageBox,
      relationshipActions: [],
      relationshipEnabled: true
    };
  }

  /**
   * Add a message to character's message box
   */
  public static addToMessageBox(character: Character, message: Omit<MessageBoxItem, 'id' | 'read'>): Character {
    // Ensure character has a message box
    const messageBox = character.messageBox || [];
    
    // Create new message with ID and unread status
    const newMessage: MessageBoxItem = {
      id: generateId(),
      read: false,
      ...message // Fixed: Move the spread after the fixed properties
    };
    
    // Add to message box (limit size to 50 messages)
    const updatedMessageBox = [newMessage, ...messageBox].slice(0, 50);
    
    return {
      ...character,
      messageBox: updatedMessageBox
    };
  }

  /**
   * Process a post interaction and update relationships
   */
  public static processPostInteraction(
    character: Character,
    interactorId: string,
    interactorName: string,
    interactionType: 'like' | 'comment' | 'reply',
    content: string,
    postId: string,
    postContent: string
  ): Character {
    // Add extensive logging
    console.log(`【关系服务】处理朋友圈互动: ${character.name} <- ${interactorName}(${interactorId}), 类型: ${interactionType}`);
    
    // Ensure character has a relationship map
    if (!character.relationshipMap) {
      console.log(`【关系服务】角色 ${character.name} 缺少关系图谱，进行初始化`);
      character = this.initializeRelationshipMap(character);
    }
    
    // Get existing relationship or create new one
    const relationship = character.relationshipMap?.relationships?.[interactorId] ?? {
      targetId: interactorId,
      strength: 0,
      type: 'stranger',
      description: `${interactorName}是一个陌生人`,
      lastUpdated: Date.now(),
      interactions: 0
    };
    
    // Update relationship based on interaction type
    let strengthDelta = 0;
    switch (interactionType) {
      case 'like':
        strengthDelta = 1;
        break;
      case 'comment':
        strengthDelta = 2;
        break;
      case 'reply':
        strengthDelta = 3;
        break;
    }
    
    // Log relationship changes
    console.log(`【关系服务】${character.name} 与 ${interactorName} 的关系变化: 强度 ${relationship.strength} -> ${relationship.strength + strengthDelta}`);
    
    // Update relationship strength (ensure within -100 to 100 range)
    relationship.strength = Math.min(100, Math.max(-100, relationship.strength + strengthDelta));
    relationship.lastUpdated = Date.now();
    relationship.interactions += 1;
    
    // Update relationship type based on strength
    relationship.type = this.getRelationshipTypeFromStrength(relationship.strength);
    
    // Update relationship map
    const updatedRelationshipMap = {
      ...character.relationshipMap!,
      relationships: {
        ...character.relationshipMap!.relationships,
        [interactorId]: relationship
      },
      lastUpdated: Date.now() // Update the lastUpdated timestamp
    };
    
    // Update character with relationship map
    const updatedCharacter = {
      ...character,
      relationshipMap: updatedRelationshipMap
    };
    
    // Add interaction to message box
    return this.addToMessageBox(updatedCharacter, {
      senderId: interactorId,
      senderName: interactorName,
      recipientId: character.id,
      content: content,
      timestamp: Date.now(),
      type: interactionType,
      contextId: postId,
      contextContent: postContent.substring(0, 50) + (postContent.length > 50 ? '...' : '')
    });
  }

  /**
   * Process relationship updates from AI responses
   */
  public static processRelationshipUpdate(
    character: Character,
    targetId: string,
    strengthDelta: number,
    newType?: string
  ): Character {
    console.log(`【关系服务】处理关系更新: ${character.name} -> targetId=${targetId}, 强度变化=${strengthDelta}, 新类型=${newType || '无'}`);
    
    // Ensure we have a relationship map
    if (!character.relationshipMap) {
      character.relationshipMap = {
        lastReviewed: Date.now(),
        lastUpdated: Date.now(), // Add required field
        relationships: {}
      };
      console.log(`【关系服务】为角色 ${character.name} 创建新的关系图谱`);
    }

    // Get or initialize the relationship
    let relationship = character.relationshipMap.relationships[targetId] as Relationship;
    if (!relationship) {
      relationship = {
        targetId: targetId, // Add required field
        type: 'stranger',
        strength: 0,
        lastUpdated: Date.now(),
        description: `Relationship with ${targetId}`,
        interactions: 0
      };
      console.log(`【关系服务】为角色 ${character.name} 创建与 ${targetId} 的新关系`);
    }

    // Apply strength delta
    const oldStrength = relationship.strength;
    relationship.strength = Math.max(-100, Math.min(100, relationship.strength + strengthDelta));
    
    console.log(`【关系服务】关系强度更新: ${oldStrength} -> ${relationship.strength} (${strengthDelta >= 0 ? '+' : ''}${strengthDelta})`);
    
    // Apply new type if provided, otherwise calculate based on strength
    const oldType = relationship.type;
    if (newType) {
      // Safely cast the string to RelationshipType, defaulting to 'stranger' if invalid
      relationship.type = this.isValidRelationshipType(newType) 
        ? (newType as RelationshipType)
        : this.getRelationshipTypeFromStrength(relationship.strength);
    } else {
      relationship.type = this.getRelationshipTypeFromStrength(relationship.strength);
    }
    
    if (oldType !== relationship.type) {
      console.log(`【关系服务】关系类型更新: ${oldType} -> ${relationship.type}`);
    }
    
    relationship.lastUpdated = Date.now();
    
    // Store the updated relationship
    character.relationshipMap.relationships[targetId] = relationship;
    character.relationshipMap.lastUpdated = Date.now(); // Update timestamp
    character.relationshipMap.lastReviewed = Date.now();

    return character;
  }

  /**
   * Determine relationship type for explore page social interactions
   */
  public static determineRelationshipType(interaction: SocialInteraction | PostInteraction): string {
    // This is a simplified version - in a real app would analyze based on past interactions
    if ('type' in interaction) {
      // For posts/comments
      switch (interaction.type) {
        case 'post':
          return 'friend';
        case 'comment':
          return 'close_friend';
        case 'like':
          return 'acquaintance';
        default:
          return 'stranger';
      }
    }
    return 'stranger';
  }

  /**
   * Get relationship type based on strength value
   * Public method to be used from explore.tsx
   */
  public static getRelationshipTypeFromStrength(strength: number): RelationshipType {
    // Sort thresholds in descending order
    const sortedTypes = Object.entries(this.RELATIONSHIP_TYPE_THRESHOLDS)
      .sort(([, a], [, b]) => b - a);
    
    // Find appropriate type based on strength
    for (const [type, threshold] of sortedTypes) {
      if (strength >= threshold) {
        return type as RelationshipType;
      }
    }
    
    // Default to stranger
    return 'stranger';
  }

  /**
   * Helper method to validate if a string is a valid RelationshipType
   */
  private static isValidRelationshipType(type: string): boolean {
    const validTypes: RelationshipType[] = [
      'enemy', 'rival', 'stranger', 'acquaintance', 'colleague', 
      'friend', 'close_friend', 'best_friend', 'family', 'crush', 
      'lover', 'partner', 'ex', 'mentor', 'student', 'admirer', 'idol'
    ];
    return validTypes.includes(type as RelationshipType);
  }
}
