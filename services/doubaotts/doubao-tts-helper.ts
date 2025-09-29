import { DoubaoTTSService } from './doubaotts-service';
import type { TTSOptions } from './doubaotts-types';
import { getTTSSettings, getTTSSettingsAsync } from '@/utils/settings-helper';

export class DoubaoTTSHelper {
  private static instance: DoubaoTTSHelper | null = null;
  private ttsService: DoubaoTTSService | null = null;
  private lastConfig: string = '';

  private constructor() {}

  static getInstance(): DoubaoTTSHelper {
    if (!DoubaoTTSHelper.instance) {
      DoubaoTTSHelper.instance = new DoubaoTTSHelper();
    }
    return DoubaoTTSHelper.instance;
  }

  /**
   * 获取TTS服务实例，自动从设置中读取配置（不再读取voice_type）
   */
  async getTTSService(): Promise<DoubaoTTSService | null> {
    try {
      const ttsSettings = await getTTSSettingsAsync();
      if (!ttsSettings.enabled || !ttsSettings.appid || !ttsSettings.token) {
        console.log('[DoubaoTTSHelper] TTS未启用或配置不完整');
        return null;
      }

      // 只用appid/token/encoding/speedRatio做实例唯一性判断
      const currentConfig = JSON.stringify({
        appid: ttsSettings.appid,
        token: ttsSettings.token,
        encoding: ttsSettings.encoding,
        speed_ratio: ttsSettings.speedRatio
      });

      if (!this.ttsService || this.lastConfig !== currentConfig) {
        console.log('[DoubaoTTSHelper] 创建新的TTS服务实例');
        const options: TTSOptions = {
          appid: ttsSettings.appid,
          token: ttsSettings.token,
          // voice_type 不在这里设置
          encoding: (ttsSettings.encoding as 'wav' | 'pcm' | 'ogg_opus' | 'mp3') || 'mp3',
          speed_ratio: ttsSettings.speedRatio || 1.0
        };
        this.ttsService = new DoubaoTTSService(options);
        this.lastConfig = currentConfig;
      }

      return this.ttsService;
    } catch (error) {
      console.error('[DoubaoTTSHelper] 获取TTS服务失败:', error);
      return null;
    }
  }

  /**
   * 快速语音合成
   * @param text 合成文本
   * @param audioConfig 可选音频参数（voice_type 必须外部传入）
   */
  async synthesize(
    text: string,
    audioConfig?: {
      voice_type?: string;
      emotion?: string;
      enable_emotion?: boolean;
      emotion_scale?: number;
      loudness_ratio?: number;
      // 允许扩展更多audio参数
    }
  ): Promise<Buffer | null> {
    try {
      const ttsService = await this.getTTSService();
      if (!ttsService) {
        throw new Error('TTS服务未配置或未启用');
      }
      // voice_type 只能通过 audioConfig 传入
      return await ttsService.quickSynthesize(text, audioConfig);
    } catch (error) {
      console.error('[DoubaoTTSHelper] 语音合成失败:', error);
      return null;
    }
  }

  /**
   * 流式语音合成
   * @param text 合成文本
   * @param onChunk 音频分片回调
   * @param audioConfig 可选音频参数（voice_type 必须外部传入）
   */
  async streamSynthesize(
    text: string,
    onChunk?: (chunk: Buffer, sequence: number) => void,
    audioConfig?: {
      voice_type?: string;
      emotion?: string;
      enable_emotion?: boolean;
      emotion_scale?: number;
      loudness_ratio?: number;
      // 允许扩展更多audio参数
    }
  ): Promise<Buffer | null> {
    try {
      const ttsService = await this.getTTSService();
      if (!ttsService) {
        throw new Error('TTS服务未配置或未启用');
      }
      // voice_type 只能通过 audioConfig 传入
      return await ttsService.streamSynthesize(text, onChunk, audioConfig);
    } catch (error) {
      console.error('[DoubaoTTSHelper] 流式语音合成失败:', error);
      return null;
    }
  }

  /**
   * 检查TTS是否可用
   */
  async isAvailable(): Promise<boolean> {
    const ttsSettings = await getTTSSettingsAsync();
    return !!(ttsSettings.enabled && ttsSettings.appid && ttsSettings.token);
  }

  /**
   * 重置服务实例（用于配置更新后）
   */
  reset(): void {
    this.ttsService = null;
    this.lastConfig = '';
  }
}

// 导出单例实例
export const doubaoTTSHelper = DoubaoTTSHelper.getInstance();

// 便捷函数
export async function synthesizeText(
  text: string,
  audioConfig?: {
    emotion?: string;
    enable_emotion?: boolean;
    emotion_scale?: number;
    loudness_ratio?: number;
  }
): Promise<Buffer | null> {
  return await doubaoTTSHelper.synthesize(text, audioConfig);
}

export async function streamSynthesizeText(
  text: string,
  onChunk?: (chunk: Buffer, sequence: number) => void,
  audioConfig?: {
    emotion?: string;
    enable_emotion?: boolean;
    emotion_scale?: number;
    loudness_ratio?: number;
  }
): Promise<Buffer | null> {
  return await doubaoTTSHelper.streamSynthesize(text, onChunk, audioConfig);
}

export async function isTTSAvailable(): Promise<boolean> {
  return await doubaoTTSHelper.isAvailable();
}
