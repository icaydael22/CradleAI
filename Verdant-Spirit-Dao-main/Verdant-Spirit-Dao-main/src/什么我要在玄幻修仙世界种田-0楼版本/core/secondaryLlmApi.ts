import { useGenerationStore } from '../stores/app/generationStore';
import { useApiProfileStore } from '../stores/app/apiProfileStore';
import { useConfirmStore } from '../stores/ui/confirmStore';
import { useSettingsStore } from '../stores/ui/settingsStore';
import { ChatHistoryManager, MessagePage } from './history';
import { logger } from './logger';

// In-memory state for tracking failures
const failureCounts = new Map<string, number>();

type ChatCompletionSource = 'openai' | 'claude' | 'makersuite' | 'deepseek';

interface SecondaryApiConfigOverride {
  // All parameters are optional, used to override settings from the store for a single call
  apiUrl?: string;
  key?: string;
  model?: string;
  source?: ChatCompletionSource;
}

export interface SecondaryLlmPayload {
  method: 'generate' | 'generateRaw';
  config: GenerateConfig | GenerateRawConfig;
  secondaryApiConfig?: SecondaryApiConfigOverride;
  profileId?: string; // Optional profile ID to override the active one
  generationId?: string; // Optional custom generation ID for event tracking
}

class SecondaryLlmGenerator {
  private payload: SecondaryLlmPayload;
  private generationId: string;
  private readonly MAX_RETRIES = 3;
  private readonly END_OF_RESPONSE_MARKER = '<!-- END_OF_RESPONSE -->';

  constructor(payload: SecondaryLlmPayload) {
    this.payload = payload;
    this.generationId = payload.generationId || `secondary-llm-${crypto.randomUUID()}`;
  }

  public async generate(): Promise<string> {
    const generationStore = useGenerationStore();
    let lastError: any = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.attemptSingleGeneration(attempt);
        // On success, reset failure count for the profile
        const apiProfileStore = useApiProfileStore();
        const profileIdToUse = this.payload.profileId || apiProfileStore.activeProfileId;
        if (profileIdToUse) {
          failureCounts.set(profileIdToUse, 0);
        }
        return result;
      } catch (error) {
        lastError = error;
        logger('warn', 'SecondaryLLM', `Attempt ${attempt}/${this.MAX_RETRIES} failed.`, error);
        if (attempt < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed, increment the failure count
    const apiProfileStore = useApiProfileStore();
    const profileIdToUse = this.payload.profileId || apiProfileStore.activeProfileId;
    if (profileIdToUse) {
      const newFailureCount = (failureCounts.get(profileIdToUse) || 0) + 1;
      failureCounts.set(profileIdToUse, newFailureCount);
      logger('error', 'SecondaryLLM', `All ${this.MAX_RETRIES} attempts failed. New failure count for profile ${profileIdToUse}: ${newFailureCount}.`, lastError);
      toastr.error(`次级LLM请求连续失败 ${this.MAX_RETRIES} 次，请检查您的API Key或网络连接。`);
    }

    generationStore.isSecondaryLlmRequestActive = false;
    throw lastError;
  }

  private attemptSingleGeneration(attempt: number): Promise<string> {
    const generationStore = useGenerationStore();
    return new Promise((resolve, reject) => {
      const listener = (text: string, id: string) => {
        if (id !== this.generationId) return;

        generationStore.isSecondaryLlmRequestActive = false;
        // TODO: Unregister listener

        if (text.trim().endsWith(this.END_OF_RESPONSE_MARKER)) {
          const cleanedText = text.trim().slice(0, -this.END_OF_RESPONSE_MARKER.length).trim();
          logger('info', 'SecondaryLLM', `Request successful on attempt ${attempt}. Validation passed.`);
          resolve(cleanedText);
        } else {
          reject(new Error('Response validation failed: END_OF_RESPONSE_MARKER not found.'));
        }
      };

      eventOn(iframe_events.GENERATION_ENDED, listener as any);

      this.prepareAndSendRequest(attempt).catch(error => {
        generationStore.isSecondaryLlmRequestActive = false;
        // TODO: Unregister listener on failure as well.
        reject(error);
      });
    });
  }

  private async prepareAndSendRequest(attempt: number): Promise<void> {
    const apiProfileStore = useApiProfileStore();
    const generationStore = useGenerationStore();
    const historyManager = (window as any).chatHistoryManager as ChatHistoryManager;

    if (!historyManager) {
      toastr.error('HistoryManager 实例未找到，无法获取上下文。');
      throw new Error('HistoryManager not found.');
    }

    const { profiles, activeProfileId } = apiProfileStore;

    // Proceed with the active profile. The check is now done in App.vue when the game loads.
    const profileIdToUse = this.payload.profileId || activeProfileId;
    const activeProfile = profiles.find(p => p.id === profileIdToUse);

    // Check if the *active* profile is usable (key and model are required).
    if (!activeProfile || !activeProfile.apiKey || !activeProfile.model) {
      const errorMsg = `Active secondary LLM profile '${activeProfile?.name || 'Unknown'}' is incomplete.`;
      logger('warn', 'SecondaryLLM', errorMsg, { activeProfile: _.cloneDeep(activeProfile) });
      toastr.error(`当前激活的次级LLM配置 [${activeProfile?.name || '未知'}] 不完整，请前往设置选择一个有效配置。`);
      throw new Error(errorMsg);
    }

    const defaultApiConfig = activeProfile;
    const finalApiConfig = { ...defaultApiConfig, ...this.payload.secondaryApiConfig };

    const customApiSettings = {
      source: finalApiConfig.source,
      apiurl: finalApiConfig.apiUrl,
      key: finalApiConfig.apiKey,
      model: finalApiConfig.model,
    };

    let contextMessages: MessagePage[] = [];
    if (finalApiConfig.useSummary) {
      const allMessages = historyManager.getMessagesForPrompt();
      let lastSummary = allMessages.findLast(m => m.role === 'summary');

      // Fallback: if no 'summary' role page exists, use persisted summary in plugin_storage
      if (!lastSummary) {
        try {
          const chatVars = getVariables({ type: 'chat' }) || {};
          const latest = _.get(chatVars, 'plugin_storage.summary.latest');
          if (latest && latest.text) {
            lastSummary = {
              id: latest.id || 'summary_latest',
              role: 'summary',
              content: latest.text,
              timestamp: latest.timestamp || Date.now(),
            } as MessagePage;
          }
        } catch (e) {
          logger('warn', 'SecondaryLLM', 'Failed to read persisted summary from plugin_storage.', e);
        }
      }

      if (lastSummary) contextMessages.push(lastSummary);
    } else if (finalApiConfig.useFullContext) {
      contextMessages = historyManager.getMessagesForPrompt();
    }

    const currentFailureCount = failureCounts.get(activeProfile.id) || 0;
    const isFallbackTriggered =
      finalApiConfig.fallbackEnabled &&
      currentFailureCount >= finalApiConfig.fallbackThreshold &&
      !generationStore.isAiGenerating;

    let finalPayloadConfig: GenerateConfig | GenerateRawConfig;
    let isFallbackActive = false;

    if (isFallbackTriggered) {
      isFallbackActive = true;
      logger('warn', 'SecondaryLLM', `Fallback triggered for profile "${activeProfile.name}". Using main LLM.`);
      toastr.warning(`次级LLM连续失败，已临时切换至主LLM。请勿进行任何操作。`);

      // For fallback, create a clean config with only prompt-related data
      // to avoid overriding main LLM settings with secondary LLM parameters.
      const { user_input, ordered_prompts } = this.payload.config as any;
      const cleanConfig: Partial<GenerateConfig | GenerateRawConfig> = {};
      if (user_input !== undefined) cleanConfig.user_input = user_input;
      if (ordered_prompts !== undefined) (cleanConfig as GenerateRawConfig).ordered_prompts = ordered_prompts;

      finalPayloadConfig = {
        ...(cleanConfig as any),
        should_stream: false,
        generation_id: this.generationId,
      } as any; // Cast to any to allow undocumented 'generation_id'
    } else {
      // For normal operation, include all original config and custom_api settings.
      finalPayloadConfig = {
        ...this.payload.config,
        should_stream: false,
        custom_api: customApiSettings,
        generation_id: this.generationId,
      } as any; // Cast to any to allow undocumented 'generation_id'
    }

    if (contextMessages.length > 0) {
      const historyPrompts = contextMessages.map(m => ({
        role: m.role === 'summary' ? 'system' : m.role,
        content: m.content,
      }));

      if (this.payload.method === 'generate') {
        (finalPayloadConfig as any).overrides = { chat_history: { prompts: historyPrompts } };
      } else if (this.payload.method === 'generateRaw') {
        const existingPrompts = (finalPayloadConfig as GenerateRawConfig).ordered_prompts || [];
        (finalPayloadConfig as GenerateRawConfig).ordered_prompts = [...(historyPrompts as RolePrompt[]), ...existingPrompts];
      }
    }

    // Add the instruction prompt at the end.
    if (this.payload.method === 'generate') {
      const instructionInjection: Omit<InjectionPrompt, 'id'> = {
        role: 'system',
        content: `重要：你的回答必须在最末尾处包含一个特殊的结束标志：${this.END_OF_RESPONSE_MARKER}`,
        position: 'in_chat',
        depth: 9999, // High depth to ensure it's at the end
      };
      const existingInjects = (finalPayloadConfig as GenerateConfig).injects || [];
      (finalPayloadConfig as GenerateConfig).injects = [...existingInjects, instructionInjection];
    } else if (this.payload.method === 'generateRaw') {
      const instructionPrompt: RolePrompt = {
        role: 'system',
        content: `重要：你的回答必须在最末尾处包含一个特殊的结束标志：${this.END_OF_RESPONSE_MARKER}`,
      };
      const existingPrompts = (finalPayloadConfig as GenerateRawConfig).ordered_prompts || [];
      (finalPayloadConfig as GenerateRawConfig).ordered_prompts = [...existingPrompts, instructionPrompt];
    }

    generationStore.isSecondaryLlmRequestActive = true;
    logger('info', 'SecondaryLLM', `Sending request (Attempt ${attempt}/${this.MAX_RETRIES}) to profile "${activeProfile.name}"...`);

    if (this.payload.method === 'generate') {
      await generate(finalPayloadConfig as GenerateConfig);
    } else if (this.payload.method === 'generateRaw') {
      await generateRaw(finalPayloadConfig as GenerateRawConfig);
    } else {
      throw new Error(`Unsupported generation method: ${this.payload.method}`);
    }

    if (isFallbackActive) {
      toastr.info('主LLM保底生成已完成，您可以继续操作。');
    }
  }
}

/**
 * Generates text using a secondary, user-configurable LLM API.
 * It fetches API settings from the settingsStore and allows for temporary overrides.
 * This function is now a wrapper around the SecondaryLlmGenerator class to ensure
 * that concurrent generation requests do not interfere with each other's event listeners.
 * @param payload - The configuration for the generation call.
 * @returns A promise that resolves to the generated string.
 */
export async function generateWithSecondaryApi(payload: SecondaryLlmPayload): Promise<string> {
  const generator = new SecondaryLlmGenerator(payload);
  return generator.generate();
}
