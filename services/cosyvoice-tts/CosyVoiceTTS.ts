import Replicate from 'replicate';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { getTTSSettings } from '@/utils/settings-helper';

// Interfaces for type safety
export interface CosyVoiceTTSInput {
  task?: 'zero-shot voice clone' | 'cross-lingual voice clone' | 'Instructed Voice Generation';
  tts_text: string;
  source_audio?: string;
  source_transcript?: string;
}

export interface CosyVoiceTTSResponse {
  audioPath: string;
  predictionId?: string;
}

export interface CosyVoiceTTSPrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string;
  error?: string;
}

export class CosyVoiceTTS {
  private replicate: Replicate;
  private modelId: `${string}/${string}` | `${string}/${string}:${string}`;
  private apiToken: string | undefined;

  constructor(apiToken?: string) {
    // 从 settings-helper 获取 TTS 配置（与 MinimaxTTS 共用 Replicate token）
    const ttsSettings = getTTSSettings();
    this.apiToken = apiToken || ttsSettings.minimaxApiToken || process.env.REPLICATE_API_TOKEN;
    // CosyVoice 模型 ID
    this.modelId = 'chenxwh/cosyvoice2-0.5b:669b1cd618f2747d2237350e868f5c313f3b548fc803ca4e57adfaba778b042d' as `${string}/${string}:${string}`;
    this.replicate = new Replicate({
      auth: this.apiToken,
    });
  }

  /**
   * Convert text to speech using CosyVoice TTS
   * @param input The input parameters for text-to-speech
   * @returns Promise with the path to the saved audio file
   */
  async textToSpeech(input: CosyVoiceTTSInput): Promise<CosyVoiceTTSResponse> {
    try {
      // 从 settings-helper 获取最新的 TTS 配置
      const ttsSettings = getTTSSettings();
      const apiToken = this.apiToken || ttsSettings.minimaxApiToken || process.env.REPLICATE_API_TOKEN;

      // Set default values if not provided
      const params: CosyVoiceTTSInput = {
        task: input.task || 'zero-shot voice clone',
        tts_text: input.tts_text,
        source_audio: input.source_audio,
        source_transcript: input.source_transcript,
      };

      // 用最新的token实例化 Replicate
      const replicate = new Replicate({ auth: apiToken });

      // 日志：最终发给 Replicate 的请求体
      console.log('[CosyVoiceTTS] 发给 Replicate 的请求数据:', {
        model: this.modelId,
        input: params
      });

      // 调用 CosyVoice 模型
      const output = await replicate.run(this.modelId, { input: params });

      // 兼容新版 Replicate SDK 的 output（流对象）和旧版（string/array/object）
      let audioUrl: string | undefined;
      // 检查是否为 Replicate File-like 对象（有 .url 方法）
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

      // Save the audio file
      const fileName = `cosyvoice_${Date.now()}.wav`;
      const filePath = await this.saveAudioFile(audioUrl, fileName);
      
      return {
        audioPath: filePath
      };
    } catch (error) {
      console.error('CosyVoiceTTS error:', error);
      throw error;
    }
  }

  /**
   * Create a prediction with more control and access to the prediction object
   * @param input The input parameters for text-to-speech
   * @returns Promise with the prediction object
   */
  async createPrediction(input: CosyVoiceTTSInput): Promise<CosyVoiceTTSPrediction> {
    try {
      const prediction = await this.replicate.predictions.create({
        model: this.modelId,
        input: input
      });
      
      return prediction as CosyVoiceTTSPrediction;
    } catch (error) {
      console.error('CosyVoiceTTS createPrediction error:', error);
      throw error;
    }
  }

  /**
   * Get the status of a prediction
   * @param predictionId The ID of the prediction to check
   * @returns Promise with the updated prediction object
   */
  async getPrediction(predictionId: string): Promise<CosyVoiceTTSPrediction> {
    try {
      const prediction = await this.replicate.predictions.get(predictionId);
      return prediction as CosyVoiceTTSPrediction;
    } catch (error) {
      console.error('CosyVoiceTTS getPrediction error:', error);
      throw error;
    }
  }

  /**
   * Cancel an ongoing prediction
   * @param predictionId The ID of the prediction to cancel
   * @returns Promise indicating success or failure
   */
  async cancelPrediction(predictionId: string): Promise<boolean> {
    try {
      await this.replicate.predictions.cancel(predictionId);
      return true;
    } catch (error) {
      console.error('CosyVoiceTTS cancelPrediction error:', error);
      return false;
    }
  }

  /**
   * Save audio file from a remote URL to local storage using expo-file-system
   * @param audioUrl The URL of the audio file to download
   * @param fileName The name of the file to save
   * @returns Promise with the path to the saved file
   */
  private async saveAudioFile(audioUrl: string, fileName: string): Promise<string> {
    if (Platform.OS === 'web') {
      // For web, return the audio URL directly
      return audioUrl;
    }

    try {
      // Validate URL format
      if (!audioUrl || (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://'))) {
        throw new Error('Invalid audio URL format');
      }

      // For Android, try to download with proper encoding and headers
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      // Clean and encode the URL properly
      const cleanUrl = encodeURI(decodeURI(audioUrl));
      
      console.log('Attempting to download CosyVoice audio from:', cleanUrl);
      console.log('Saving to:', fileUri);

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
        console.log('CosyVoice audio file downloaded successfully to:', downloadResult.uri);
        return downloadResult.uri;
      } else {
        throw new Error(`Download failed with status: ${downloadResult.status}`);
      }
    } catch (error) {
      console.error('Error downloading CosyVoice audio file:', error);
      
      // Try alternative approach: create a local file from fetch
      try {
        console.log('Trying alternative download method for CosyVoice...');
        
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
        
        console.log('CosyVoice audio file saved via alternative method to:', fileUri);
        return fileUri;
      } catch (fetchError) {
        console.error('Alternative download method also failed:', fetchError);
        
        // Final fallback: return the original URL for direct streaming
        console.log('Falling back to direct URL streaming for CosyVoice');
        return audioUrl;
      }
    }
  }
}
