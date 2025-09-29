// Social circle types for interactions between characters

import { ChatMessage, WorldBookEntry, Character } from '../types';

export interface CirclePost {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  content: string;
  images?: string[];
  createdAt: string;
  comments: CircleComment[];
  thoughts?: string;
  likes: number;
  hasLiked: boolean;
  likedBy?: CircleLike[];
  hasTriggeredResponse?: boolean;
  isFavorited?: boolean; // Add new property for favorite status
}

export interface CircleComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  type: 'user' | 'character';
  replyTo?: {
    userId: string;
    userName: string;
  };
  thoughts?: string; // Optional field for character's thoughts on the comment
}

export interface CircleLike {
  userId: string;
  userName: string;
  userAvatar?: string;
  isCharacter: boolean;
  createdAt: string;
  thoughts?: string; // Optional field for character's thoughts on the like
}

export interface CharacterMetadata {
    firstMeetingDate?: number;
    favoriteTopics?: string[];
    notes?: string;
    customTags?: string[];
    location?: string;
    occupation?: string;
    [key: string]: any; // Allow for additional custom metadata
    age?: string;
    gender?: string;
    height?: string;
    weight?: string;
    background?: string;
    personalityTraits?: string[];
    interests?: string[];
    roleInStory?: string;
    appearances?: string;
    clothes?: string;
    speechPattern?: string;
    relationships?: string;
    eyeColor?: string;
    hairColor?: string;
    mbti?: string;
    birthday?: string;
    zodiac?: string;
    specialAbilities?: string;
}


export interface CircleRFramework {
    base: {
        charDescription: string;
        charPersonality: string;
    };
    circle: {
        scenePrompt: string;
        responseFormat: {
            action: {
                like: boolean;
                comment?: string;
            };
            emotion: {
                type: "positive" | "neutral" | "negative";
                intensity: number; // 0-1
            };
        };
    };
}

export interface CirclePostOptions {
    type: 'newPost' | 'replyToComment' | 'replyToPost' | 'forwardedPost' | 'continuedConversation' | 'selfPost'  // Added new types
    content: {
        authorId: string;
        authorName?: string;  
        text: string;
        context?: string;
        images?: string[];  // Add support for images array
        conversationHistory?: string; // NEW: Add support for conversation history
        characterJsonData?: string;   // NEW: Add support for character JSON data
        postComments?: string; // NEW: Add support for post comments
    };
    responderId: string; 
    responderCharacter?: Character;
}

export interface CircleResponse {
    success: boolean;
    error?: string;
    action?: {
        like: boolean;
        comment?: string;
    };
    emotion?: {
        type: "positive" | "neutral" | "negative";
        intensity: number;
    };
    relationshipUpdates?: Array<{
        targetId: string;
        strengthDelta: number;
        newType?: string;
    }>;
    thoughts?: string;
    response?: string;  // Add this field to handle new response content
    reflection?: string;
    expectation?: string;
    post?: string;  // Add this field to handle new post content
}

export interface CircleMemorySystem {
    realtime: ChatMessage[];
    summary: WorldBookEntry & {
        key: ['circle_memory'];
        updateInterval: number;
    };
}

export interface CircleMemory extends ChatMessage {
    timestamp: number;
    type: 'newPost' | 'replyToComment' | 'replyToPost';
}

// Add InteractionResult interface for Circle Service
export interface InteractionResult {
  characterId: string;
  success: boolean;
  error?: string;
  response?: {
    action?: {
      like?: boolean;
      comment?: string;
    },
    emotion?: {
      type: string;
      intensity: number;
    }
  };
}