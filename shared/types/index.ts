import { CirclePost } from '@/shared/types/circle-types';
export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
  provider?: {
    id?: string;
    name?: string;
  };
}

export interface OpenRouterSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  useBackupModels: boolean;
  backupModels: string[];
  autoRoute?: boolean;
  sortingStrategy?: 'price' | 'speed' | 'latency';
  dataCollection?: boolean;
  ignoredProviders?: string[];
}

export interface GlobalSettings {
  app: {
    darkMode: boolean;
    autoSave: boolean;
    notifications: {
      enabled: boolean;
    };
  };
  chat: {
    typingDelay: number;
    serverUrl: string;
    characterApiKey: string;
    memoryApiKey: string;
    xApiKey: string;
    apiProvider: 'gemini' | 'openrouter';
    temperature: number;
    maxTokens: number;
    maxtokens: number;
    useCloudService?: boolean;
    cloudModel?: string; // Add cloud model preference
    openrouter?: OpenRouterSettings;
  };
  self: {
    nickname: string;
    gender: 'female' | 'male' | 'other';
    description: string;
  };
}

export interface User {
  id: string;
  name: string;
  avatar: string | null;
  settings: GlobalSettings;
}

export interface RegexTool {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  target: 'ai' | 'user';
  enabled: boolean;
}

/**
 * Cloud Service Configuration
 */
export interface CloudServiceConfig {
  enabled: boolean;
  licenseKey: string;
  deviceId: string;
  preferredModel?: string; // Model preference for cloud service
}

export interface Character {
  // Add these new properties for circle functionality
  circlePosts?: CirclePost[];
  circleInteraction?: boolean;
  circleInteractionFrequency?: 'low' | 'medium' | 'high';
  circlePostFrequency?: 'low' | 'medium' | 'high';
  circleStats?: {
    repliedToCharacters: Record<string, number>;
    repliedToPostsCount: number;
    repliedToCommentsCount: Record<string, number>;
  };
  favoritedPosts?: string[]; // Add this array to store favorited post IDs
}
