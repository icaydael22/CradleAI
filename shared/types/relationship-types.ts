import { Character } from '../types';

// Define relationship types
export type RelationshipType = 
  'enemy' | 'rival' | 'stranger' | 'acquaintance' | 'colleague' | 
  'friend' | 'close_friend' | 'best_friend' | 'family' | 'crush' | 
  'lover' | 'partner' | 'ex' | 'mentor' | 'student' | 'admirer' | 'idol';
export interface PromptTemplate {
    id: string;
    content: string;
    parameters?: {
      temperature?: number;
      maxTokens?: number;
      presencePenalty?: number;
    };
  }
// Define relationship structure
export interface Relationship {
  targetId: string;         // Target character ID
  strength: number;         // Relationship strength (-100 to 100)
  type: RelationshipType;   // Relationship type
  description: string;      // Relationship description
  lastUpdated: number;      // Last update timestamp
  interactions: number;     // Interaction count
  lastActionCheck?: number; // Last action check timestamp - add optional property
}

// Define relationship map data structure
export interface RelationshipMapData {
  relationships: Record<string, Relationship>;  // Relationship mapping
  lastReviewed: number;                        // Last review timestamp
  lastUpdated: number;                         // Last update timestamp
}

// Define message box item structure - exported for use in character.ts
export interface MessageBoxItem {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  type: 'relationship_request' | 'invitation' | 'alert' | 'message' | 'like' | 'comment' | 'reply' | 'post';
  timestamp: number;
  read?: boolean;
  metadata?: {
    type?: string;
    senderId?: string;
    // ... other metadata fields
  };
  text?: string;
  contextContent?: string;
  contextId?: string;
}

// This interface should be removed to avoid type conflicts
// But to minimize changes, I'll just make it match the Relationship interface
export interface RelationshipData extends Relationship {
  // All fields from Relationship are included
}

/**
 * Create a default relationship for a character
 */
export function createDefaultRelationship(
  targetId: string,
  targetName: string
): Relationship {
  return {
    targetId,
    strength: 0,
    type: 'stranger',
    description: `${targetName}是一个陌生人`,
    lastUpdated: Date.now(),
    interactions: 0
  };
}

/**
 * Get a relationship between two characters
 */
export function getRelationship(
  character: Character,
  targetId: string
): Relationship | undefined {
  if (!character.relationshipMap) {
    return undefined;
  }
  return character.relationshipMap.relationships[targetId];
}

/**
 * Types of actions that can be triggered by relationships
 */
export type ActionType = 'gift' | 'invitation' | 'challenge' | 'support' | 'confession';

/**
 * Status of a relationship action
 */
export type ActionStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

/**
 * Represents an action triggered by a relationship between characters
 */
export interface RelationshipAction {
  id: string;
  type: ActionType;
  sourceCharacterId: string;  // Character initiating the action
  targetCharacterId: string;  // Character receiving the action
  content: string;            // Description of the action
  createdAt: number;          // Creation timestamp
  expiresAt: number;          // Expiry timestamp
  status: ActionStatus;
  respondedAt?: number;       // When the action was responded to
  responseContent?: string;   // Optional response message
}

/**
 * Update Character type to include relationship actions
 */
declare module '../../shared/types' {
  interface Character {
    relationshipActions?: RelationshipAction[];

  }
}