import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { EventRegister } from 'react-native-event-listeners';
import { unifiedGenerateContent } from '@/services/unified-api';
import { getApiSettings } from '@/utils/settings-helper';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { Character } from '@/shared/types';
import { CharacterStorageService } from '@/services/CharacterStorageService';

// Persistent key to track last sent timestamps etc.
const STATE_KEY = 'auto_message_state';
const UTIL_STORAGE_KEY = 'auto_message_prompt_config';

type AutoMessageState = Record<string, {
  lastSentAt: number; // ms timestamp of last successful auto message
}>;

let instance: AutoMessageScheduler | null = null;

export class AutoMessageScheduler {
  private characterCache: Character[] = [];

  static getInstance(): AutoMessageScheduler {
    if (!instance) instance = new AutoMessageScheduler();
    return instance;
  }

  // Background worker entry
  public async runScheduledCheckOnce(): Promise<void> {
    try {
      await this.loadCharacters();
      if (!this.characterCache.length) return;

      const enabledCharacters = this.characterCache.filter(c => c.autoMessage === true);
      if (enabledCharacters.length === 0) return;

      const utilConfig = await this.loadUtilConfig();
      const state = await this.loadState();

      for (const character of enabledCharacters) {
        const conversationId = character.conversationId || character.id;
        const intervalMinutes = this.resolveIntervalMinutes(character, utilConfig);
        if (intervalMinutes <= 0) continue;
        const intervalMs = intervalMinutes * 60 * 1000;

        const lastSentAt = state[conversationId]?.lastSentAt ?? 0;
        let nextDueAt = lastSentAt > 0 ? (lastSentAt + intervalMs) : (Date.now() + intervalMs);
        const now = Date.now();

        // Catch-up loop: send as many as missed while app was closed (cap to avoid flooding)
        let safetyCounter = 0;
        while (nextDueAt <= now && safetyCounter < 5) {
          const sent = await this.sendAutoMessageHeadless(character, conversationId, utilConfig);
          if (!sent) break;
          state[conversationId] = { lastSentAt: nextDueAt };
          nextDueAt += intervalMs;
          safetyCounter += 1;
        }

        // Initialize schedule if never sent yet, set baseline now so next run will be due after interval
        if (!state[conversationId] && lastSentAt === 0) {
          state[conversationId] = { lastSentAt: Date.now() };
        }
      }

      await this.saveState(state);
    } catch (e) {
      // swallow to avoid crashing background task
    }
  }

  public async hasScheduledTasks(): Promise<boolean> {
    await this.loadCharacters();
    return this.characterCache.some(c => c.autoMessage === true);
  }

  private async loadCharacters(): Promise<void> {
    try {
      // Primary: Use new CharacterStorageService
      const storageService = CharacterStorageService.getInstance();
      const characters = await storageService.getAllCharacters();
      if (characters.length > 0) {
        this.characterCache = characters;
        return;
      }
    } catch (storageError) {
      console.error('Auto message scheduler failed to load from CharacterStorageService:', storageError);
    }

    try {
      // Fallback: FileSystem (where CharactersContext persists)
      const charactersStr = await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + 'characters.json',
        { encoding: FileSystem.EncodingType.UTF8 }
      ).catch(() => '[]');
      if (charactersStr && charactersStr !== '[]') {
        this.characterCache = JSON.parse(charactersStr);
        return;
      }
    } catch {}

    try {
      // Fallback: AsyncStorage 'user_characters'
      const charactersString = await AsyncStorage.getItem('user_characters');
      if (charactersString) {
        this.characterCache = JSON.parse(charactersString);
        return;
      }
    } catch {}

    try {
      // Final fallback: AsyncStorage 'characters'
      const plainCharactersString = await AsyncStorage.getItem('characters');
      if (plainCharactersString) {
        this.characterCache = JSON.parse(plainCharactersString);
        return;
      }
    } catch {}

    this.characterCache = [];
  }

  private async loadUtilConfig(): Promise<any | null> {
    try {
      const saved = await AsyncStorage.getItem(UTIL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Fallback to UtilSettings defaults when not saved
    try {
      const { defaultAutoMessagePromptConfig } = require('@/constants/utilDefaults');
      return defaultAutoMessagePromptConfig;
    } catch {}
    return null;
  }

  private resolveIntervalMinutes(character: Character, utilConfig: any | null): number {
    // Priority: UtilSettings saved interval > character.autoMessageInterval > default 5
    if (utilConfig && typeof utilConfig.autoMessageInterval === 'number' && utilConfig.autoMessageInterval > 0) {
      return utilConfig.autoMessageInterval;
    }
    if (typeof (character as any).autoMessageInterval === 'number' && (character as any).autoMessageInterval > 0) {
      return (character as any).autoMessageInterval as number;
    }
    // Fall back to UtilSettings default interval if available
    try {
      const { defaultAutoMessagePromptConfig } = require('@/constants/utilDefaults');
      if (
        defaultAutoMessagePromptConfig &&
        typeof defaultAutoMessagePromptConfig.autoMessageInterval === 'number' &&
        defaultAutoMessagePromptConfig.autoMessageInterval > 0
      ) {
        return defaultAutoMessagePromptConfig.autoMessageInterval;
      }
    } catch {}
    return 5;
  }

  private async loadState(): Promise<AutoMessageState> {
    try {
      const raw = await AsyncStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  private async saveState(state: AutoMessageState): Promise<void> {
    try {
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  }

  // Headless send without component callbacks
  private async sendAutoMessageHeadless(
    character: Character,
    conversationId: string,
    utilConfig: any | null
  ): Promise<boolean> {
    try {
      // Load prompt config built in UtilSettings
      let savedConfig = utilConfig || (await this.loadUtilConfig());
      if (!savedConfig || !savedConfig.messageArray || savedConfig.messageArray.length === 0) {
        // Attempt to use defaults
        try {
          const { defaultAutoMessagePromptConfig } = require('@/constants/utilDefaults');
          savedConfig = defaultAutoMessagePromptConfig;
        } catch {}
        if (!savedConfig || !savedConfig.messageArray || savedConfig.messageArray.length === 0) {
          return false;
        }
      }

      // Persist the inputText as a hidden user message (optional)
      if (savedConfig.inputText) {
        try {
          await StorageAdapter.addUserMessage(conversationId, savedConfig.inputText);
        } catch {}
      }

      // Build API options from app settings
      const chatSettings = getApiSettings();
      const adapterType = this.getAdapterType(chatSettings?.apiProvider);
      const apiKey = chatSettings?.apiKey || '';
      const apiOptions = {
        adapter: adapterType,
        apiKey,
        characterId: character.id,
        modelId: this.getModelId(adapterType, chatSettings),
        openrouterConfig: chatSettings?.openrouter,
        geminiConfig: {
          additionalKeys: chatSettings?.additionalGeminiKeys,
          useKeyRotation: chatSettings?.useGeminiKeyRotation,
          useModelLoadBalancing: chatSettings?.useGeminiModelLoadBalancing,
        },
      } as any;

      const responseText = await unifiedGenerateContent(savedConfig.messageArray, apiOptions);
      if (!responseText) return false;

      // Save AI message to storage
      try {
        await StorageAdapter.addAiMessage(conversationId, responseText);
      } catch {}

      // Update unread messages badge for chats
      try {
        const current = await AsyncStorage.getItem('unreadMessagesCount');
        const next = (parseInt(current || '0', 10) || 0) + 1;
        await AsyncStorage.setItem('unreadMessagesCount', String(next));
        EventRegister.emit('unreadMessagesUpdated', next);
      } catch {}

      return true;
    } catch (e) {
      return false;
    }
  }

  private getAdapterType(apiProvider?: string): 'gemini' | 'openrouter' | 'openai-compatible' | 'cradlecloud' {
    if (!apiProvider) return 'gemini';
    const provider = apiProvider.toLowerCase();
    if (provider.includes('gemini')) return 'gemini';
    if (provider.includes('openrouter')) return 'openrouter';
    if (provider.includes('openai')) return 'openai-compatible';
    if (provider.includes('cradlecloud') || provider === 'cradlecloud') return 'cradlecloud';
    return 'gemini';
  }

  private getModelId(adapterType: string, chatSettings: any): string | undefined {
    switch (adapterType) {
      case 'gemini':
        return chatSettings?.geminiPrimaryModel || 'gemini-2.0-flash';
      case 'openrouter':
        return chatSettings?.openrouter?.model || 'openai/gpt-3.5-turbo';
      case 'openai-compatible':
        return chatSettings?.OpenAIcompatible?.model || 'gpt-3.5-turbo';
      case 'cradlecloud':
        return chatSettings?.cradlecloud?.model || 'gemini-2.0-flash-exp';
      default:
        return undefined;
    }
  }
}


