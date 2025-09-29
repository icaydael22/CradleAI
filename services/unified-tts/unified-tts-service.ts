import { getTTSSettingsAsync } from '@/utils/settings-helper';
import { 
  TTSProvider, 
  TTSProviderConfig, 
  UnifiedTTSRequest, 
  UnifiedTTSResponse, 
  UnifiedTTSStatus,
  TTSStatusCallback 
} from './types';
import { 
  TTSProviderAdapter, 
  CosyVoiceAdapter, 
  DoubaoAdapter, 
  MinimaxAdapter 
} from './adapters';

export class UnifiedTTSService {
  private adapters: Map<TTSProvider, TTSProviderAdapter> = new Map();
  private statusCallbacks: Map<string, TTSStatusCallback> = new Map();
  private config: TTSProviderConfig = {};

  constructor(config?: TTSProviderConfig) {
    if (config) {
      this.config = config;
    }
    this.initializeAdapters();
  }

  private async loadConfigFromSettings() {
    try {
      const ttsSettings = await getTTSSettingsAsync();
      
      // Load Doubao config
      if (ttsSettings.enabled && ttsSettings.appid && ttsSettings.token) {
        this.config.doubao = {
          appid: ttsSettings.appid,
          token: ttsSettings.token,
          voiceType: ttsSettings.voiceType,
          encoding: ttsSettings.encoding as any,
          speedRatio: ttsSettings.speedRatio
        };
      }

      // Load Minimax config
      if (ttsSettings.minimaxApiToken) {
        this.config.minimax = {
          apiToken: ttsSettings.minimaxApiToken,
          model: ttsSettings.minimaxModel,
          voiceId: ttsSettings.voiceType
        };
      }

      // Load CosyVoice config (using same Replicate token as Minimax)
      const cosyvoiceToken = ttsSettings.replicateApiToken || ttsSettings.minimaxApiToken;
      if (cosyvoiceToken) {
        this.config.cosyvoice = {
          // 移除旧的服务器端配置，改为 Replicate 配置
          replicateApiToken: cosyvoiceToken,
          replicateModel: ttsSettings.cosyvoiceReplicateModel || 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d'
        };
      }
    } catch (error) {
      console.error('[UnifiedTTSService] Failed to load config from settings:', error);
    }
  }

  private async initializeAdapters() {
    try {
      // Load settings if no config provided
      if (Object.keys(this.config).length === 0) {
        await this.loadConfigFromSettings();
      }

      console.log('[UnifiedTTSService] Initializing adapters with config:', this.config);

      // Initialize CosyVoice adapter (基于 Replicate)
      if (this.config.cosyvoice?.replicateApiToken) {
        this.adapters.set('cosyvoice', new CosyVoiceAdapter());
        console.log('[UnifiedTTSService] CosyVoice adapter initialized');
      } else {
        console.log('[UnifiedTTSService] CosyVoice adapter NOT initialized - missing replicateApiToken');
      }

      // Initialize Doubao adapter if configured
      if (this.config.doubao?.appid && this.config.doubao?.token) {
        this.adapters.set('doubao', new DoubaoAdapter());
        console.log('[UnifiedTTSService] Doubao adapter initialized');
      } else {
        console.log('[UnifiedTTSService] Doubao adapter NOT initialized - missing appid/token');
      }

      // Initialize Minimax adapter if configured
      if (this.config.minimax?.apiToken) {
        this.adapters.set('minimax', new MinimaxAdapter(
          this.config.minimax.apiToken,
          this.config.minimax.model
        ));
        console.log('[UnifiedTTSService] Minimax adapter initialized');
      } else {
        console.log('[UnifiedTTSService] Minimax adapter NOT initialized - missing apiToken');
      }

      console.log('[UnifiedTTSService] Available providers:', this.getAvailableProviders());
    } catch (error) {
      console.error('[UnifiedTTSService] Failed to initialize adapters:', error);
    }
  }

  /**
   * Get available TTS providers
   */
  getAvailableProviders(): TTSProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: TTSProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    const adapter = this.adapters.get(request.provider);
    if (!adapter) {
      return {
        success: false,
        provider: request.provider,
        error: `Provider ${request.provider} is not available or not configured`
      };
    }

    try {
      return await adapter.synthesize(request);
    } catch (error) {
      return {
        success: false,
        provider: request.provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get status of a TTS task (for providers that support async operations)
   */
  async getTaskStatus(taskId: string, provider: TTSProvider): Promise<UnifiedTTSStatus | null> {
    const adapter = this.adapters.get(provider);
    if (!adapter || !adapter.getStatus) {
      return null;
    }

    try {
      return await adapter.getStatus(taskId);
    } catch (error) {
      return {
        taskId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        provider
      };
    }
  }

  /**
   * Subscribe to task status updates
   */
  subscribeToTaskStatus(taskId: string, callback: TTSStatusCallback): void {
    this.statusCallbacks.set(taskId, callback);
  }

  /**
   * Unsubscribe from task status updates
   */
  unsubscribeFromTaskStatus(taskId: string): void {
    this.statusCallbacks.delete(taskId);
  }

  /**
   * Clean up resources
   */
  async cleanup(taskId?: string, provider?: TTSProvider): Promise<void> {
    if (provider && taskId) {
      const adapter = this.adapters.get(provider);
      if (adapter && adapter.cleanup) {
        await adapter.cleanup(taskId);
      }
      this.statusCallbacks.delete(taskId);
    } else {
      // Clean up all
      for (const adapter of this.adapters.values()) {
        if (adapter.cleanup) {
          await adapter.cleanup();
        }
      }
      this.statusCallbacks.clear();
    }
  }

  /**
   * Update configuration and reinitialize adapters
   */
  async updateConfig(config: TTSProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    await this.initializeAdapters();
  }

  /**
   * Get current configuration
   */
  getConfig(): TTSProviderConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const unifiedTTSService = new UnifiedTTSService();
