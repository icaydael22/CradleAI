import { ttsService as cosyVoiceService } from '../ttsService';
import { doubaoTTSHelper } from '../doubaotts/doubao-tts-helper';
import { MinimaxTTS } from '../minimax-tts/MinimaxTTS';
import { UnifiedTTSRequest, UnifiedTTSResponse, UnifiedTTSStatus } from './types';
import * as FileSystem from 'expo-file-system';
import Replicate from 'replicate';
import { getTTSSettings } from '@/utils/settings-helper';
import { Platform } from 'react-native';

export abstract class TTSProviderAdapter {
  abstract synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse>;
  abstract getStatus?(taskId: string): Promise<UnifiedTTSStatus>;
  abstract cleanup?(taskId?: string): Promise<void>;
}

// 工具函数：将 Buffer 保存为本地文件，返回路径
async function saveBufferToFile(buffer: Buffer, ext: string = 'mp3'): Promise<string> {
  const fileName = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  // expo-file-system 只支持 base64，需要转换
  const base64 = buffer.toString('base64');
  await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
  return filePath;
}

export class CosyVoiceAdapter extends TTSProviderAdapter {
  private replicate: Replicate;
  private modelId: `${string}/${string}` | `${string}/${string}:${string}`;
  private apiToken: string | undefined;

  constructor() {
    super();
    const ttsSettings = getTTSSettings();
    this.apiToken = ttsSettings.replicateApiToken || ttsSettings.minimaxApiToken || process.env.REPLICATE_API_TOKEN;
    // 强类型断言，确保 modelId 格式正确
    this.modelId = (ttsSettings.cosyvoiceReplicateModel || 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d') as `${string}/${string}` | `${string}/${string}:${string}`;
    this.replicate = new Replicate({ auth: this.apiToken });
  }

  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    try {
      // 每次synthesize时重新获取最新的TTS设置，确保token同步
      const ttsSettings = getTTSSettings();
      const currentToken = ttsSettings.replicateApiToken || ttsSettings.minimaxApiToken || process.env.REPLICATE_API_TOKEN;
      
      console.log('[CosyVoiceAdapter] Synthesize - Current token available:', !!currentToken);
      console.log('[CosyVoiceAdapter] Synthesize - Token sources:', {
        replicateApiToken: !!ttsSettings.replicateApiToken,
        minimaxApiToken: !!ttsSettings.minimaxApiToken,
        envToken: !!process.env.REPLICATE_API_TOKEN
      });
      
      if (!currentToken) {
        throw new Error('No Replicate API token available. Please configure it in TTS settings.');
      }

      // 使用最新的token创建Replicate实例
      const replicate = new Replicate({ auth: currentToken });

      // 验证必需参数
      const sourceAudio = request.providerSpecific?.source_audio;
      const sourceTranscript = request.providerSpecific?.source_transcript;
      
      console.log('[CosyVoiceAdapter] Input parameters:', {
        text: request.text,
        task: request.providerSpecific?.task,
        source_audio: sourceAudio,
        source_transcript: sourceTranscript,
        hasSourceAudio: !!sourceAudio,
        hasSourceTranscript: !!sourceTranscript
      });

      // 对于 zero-shot voice clone 任务，source_audio 和 source_transcript 是必需的
      if (request.providerSpecific?.task === 'zero-shot voice clone') {
        if (!sourceAudio) {
          throw new Error('source_audio is required for zero-shot voice clone task');
        }
        if (!sourceTranscript) {
          throw new Error('source_transcript is required for zero-shot voice clone task');
        }
      }

      // 参数映射
      const input: any = {
        tts_text: request.text,
        task: request.providerSpecific?.task || 'zero-shot voice clone',
        source_audio: sourceAudio,
        source_transcript: sourceTranscript
      };

      console.log('[CosyVoiceAdapter] Final request to Replicate:', {
        model: this.modelId,
        input,
        hasToken: !!currentToken
      });

      const startTime = Date.now();
      const output = await replicate.run(this.modelId, { input });

      // 兼容新版/旧版 Replicate SDK 的 output
      let audioUrl: string | undefined;
      if (output && typeof output === 'object' && 'url' in output && typeof (output as any).url === 'function') {
        audioUrl = (output as any).url();
      } else if (typeof output === 'string') {
        audioUrl = output;
      } else if (Array.isArray(output) && typeof output[0] === 'string') {
        audioUrl = output[0];
      } else if (output && typeof output === 'object') {
        if (typeof (output as any).uri === 'string') {
          audioUrl = (output as any).uri;
        } else if (typeof (output as any).format === 'string') {
          audioUrl = (output as any).format;
        }
      }
      if (!audioUrl) {
        throw new Error('Unexpected output type from CosyVoice Replicate API');
      }

      console.log('[CosyVoiceAdapter] Received audio URL:', audioUrl);

      // 保存音频文件 - 复用MinimaxTTS的可靠保存逻辑
      const fileName = `cosyvoice_${Date.now()}.wav`;
      let audioPath: string;
      
      // 使用与MinimaxTTS相同的保存逻辑
      audioPath = await this.saveAudioFile(audioUrl, fileName);

      // 验证audioPath不为空
      if (!audioPath) {
        throw new Error('Failed to save audio file - audioPath is null or undefined');
      }
      
      console.log('[CosyVoiceAdapter] Final audioPath:', audioPath);

      const processingTime = Date.now() - startTime;
      return {
        success: true,
        provider: 'cosyvoice',
        data: {
          audioPath
        },
        metadata: {
          processingTime
        }
      };
    } catch (error) {
      console.error('[CosyVoiceAdapter] Synthesize error:', error);
      return {
        success: false,
        provider: 'cosyvoice',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Save audio file from a remote URL to local storage using expo-file-system
   * 复用MinimaxTTS的可靠保存逻辑，支持多层fallback机制
   * @param audioUrl The URL of the audio file to download
   * @param fileName The name of the file to save
   * @returns Promise with the path to the saved file
   */
  private async saveAudioFile(audioUrl: string, fileName: string): Promise<string> {
    console.log('[CosyVoiceAdapter] saveAudioFile - Input audioUrl:', audioUrl);
    
    if (Platform.OS === 'web') {
      // For web, return the audio URL directly
      console.log('[CosyVoiceAdapter] Web platform, returning URL directly');
      return audioUrl;
    }

    try {
      // Validate URL format
      if (!audioUrl || (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://'))) {
        throw new Error('Invalid audio URL format');
      }

      // For Android/iOS, try to download with proper encoding and headers
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      // Clean and encode the URL properly
      const cleanUrl = encodeURI(decodeURI(audioUrl));
      
      console.log('[CosyVoiceAdapter] Attempting to download audio from:', cleanUrl);
      console.log('[CosyVoiceAdapter] Saving to:', fileUri);

      // Try downloading with explicit headers
      const downloadResult = await FileSystem.downloadAsync(
        cleanUrl,
        fileUri,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Expo FileSystem)',
            'Accept': 'audio/wav, audio/*, */*',
          },
        }
      );

      if (downloadResult.status === 200) {
        console.log('[CosyVoiceAdapter] Audio file downloaded successfully to:', downloadResult.uri);
        return downloadResult.uri;
      } else {
        throw new Error(`Download failed with status: ${downloadResult.status}`);
      }
    } catch (error) {
      console.error('[CosyVoiceAdapter] Error downloading audio file:', error);
      
      // Try alternative approach: create a local file from fetch
      try {
        console.log('[CosyVoiceAdapter] Trying alternative download method...');
        
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error(`Fetch failed with status: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        console.log('[CosyVoiceAdapter] Audio file saved via alternative method to:', fileUri);
        return fileUri;
      } catch (fetchError) {
        console.error('[CosyVoiceAdapter] Alternative download method also failed:', fetchError);
        
        // Final fallback: return the original URL for direct streaming
        console.log('[CosyVoiceAdapter] Falling back to direct URL streaming');
        return audioUrl;
      }
    }
  }

  async getStatus(taskId: string): Promise<UnifiedTTSStatus> {
    // Replicate API 可实现异步任务查询，这里简单返回 completed
    return {
      taskId,
      status: 'completed',
      provider: 'cosyvoice'
    };
  }

  async cleanup(taskId?: string): Promise<void> {
    // no-op
  }
}

export class DoubaoAdapter extends TTSProviderAdapter {
  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    try {
      const audioConfig: any = {};
      
      // Map common parameters to Doubao specific
      if (request.voiceId) {
        audioConfig.voice_type = request.voiceId;
      }
      if (request.emotion) {
        audioConfig.emotion = request.emotion;
        audioConfig.enable_emotion = true;
      }
      
      // Add provider-specific parameters
      if (request.providerSpecific) {
        if (request.providerSpecific.enableEmotion !== undefined) {
          audioConfig.enable_emotion = request.providerSpecific.enableEmotion;
        }
        if (request.providerSpecific.emotionScale !== undefined) {
          audioConfig.emotion_scale = request.providerSpecific.emotionScale;
        }
        if (request.providerSpecific.loudnessRatio !== undefined) {
          audioConfig.loudness_ratio = request.providerSpecific.loudnessRatio;
        }
      }
      
      const startTime = Date.now();
      const audioBuffer = await doubaoTTSHelper.synthesize(request.text, audioConfig);
      const processingTime = Date.now() - startTime;
      if (!audioBuffer) {
        return {
          success: false,
          provider: 'doubao',
          error: 'Failed to generate audio'
        };
      }
      // 保存 Buffer 到本地文件，返回 audioPath
      const audioPath = await saveBufferToFile(audioBuffer, audioConfig.encoding || 'mp3');
      return {
        success: true,
        provider: 'doubao',
        data: {
          audioPath
        },
        metadata: {
          processingTime
        }
      };
    } catch (error) {
      return {
        success: false,
        provider: 'doubao',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getStatus(taskId: string): Promise<UnifiedTTSStatus> {
    return {
      taskId,
      status: 'completed',
      provider: 'doubao'
    };
  }

  async cleanup(taskId?: string): Promise<void> {
    // no-op
  }
}

export class MinimaxAdapter extends TTSProviderAdapter {
  private minimaxTTS: MinimaxTTS;
  
  constructor(apiToken?: string, model?: string) {
    super();
    this.minimaxTTS = new MinimaxTTS(apiToken, model);
  }
  
  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    try {
      const input: any = {
        text: request.text
      };
      
      // Map common parameters to Minimax specific
      if (request.voiceId) {
        input.voice_id = request.voiceId;
      }
      if (request.emotion) {
        input.emotion = request.emotion as any;
      }
      
      // Add provider-specific parameters
      if (request.providerSpecific) {
        if (request.providerSpecific.languageBoost) {
          input.language_boost = request.providerSpecific.languageBoost;
        }
        if (request.providerSpecific.englishNormalization !== undefined) {
          input.english_normalization = request.providerSpecific.englishNormalization;
        }
      }
      
      const startTime = Date.now();
      const result = await this.minimaxTTS.textToSpeech(input);
      const processingTime = Date.now() - startTime;
      
      // Minimax 已返回 audioPath
      return {
        success: true,
        provider: 'minimax',
        data: {
          audioPath: result.audioPath
        },
        metadata: {
          processingTime,
          predictionId: result.predictionId
        }
      };
    } catch (error) {
      return {
        success: false,
        provider: 'minimax',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getStatus(taskId: string): Promise<UnifiedTTSStatus> {
    // Minimax目前未实现异步任务查询，直接返回completed
    return {
      taskId,
      status: 'completed',
      provider: 'minimax'
    };
  }

  async cleanup(taskId?: string): Promise<void> {
    // no-op
  }
}
