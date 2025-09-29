import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import { discordAuthService } from '@/services/discordAuthService';
import { getApiSettings } from '@/utils/settings-helper';
import { convertBase64PcmToWavFile } from '@/utils/audioUtils';
import { TTSProviderAdapter } from '../adapters';
import { UnifiedTTSRequest, UnifiedTTSResponse } from '../types';

const BASE_URL = 'https://api.cradleintro.top';
const MODEL = 'gemini-2.5-flash-preview-tts';

export class CradleCloudTtsAdapter extends TTSProviderAdapter {
  private async getAuthHeader(): Promise<{ Authorization: string } | null> {
    const apiSettings = getApiSettings();
    const manualJwtToken = apiSettings.cradlecloud?.jwtToken;

    if (manualJwtToken && manualJwtToken.trim()) {
      return { Authorization: `Bearer ${manualJwtToken}` };
    }
    return discordAuthService.getAuthHeader();
  }

  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    const authHeader = await this.getAuthHeader();
    console.log('[CradleCloudTtsAdapter] Auth header:', authHeader);
    if (!authHeader) {
      return { 
        success: false, 
        provider: 'gemini', 
        error: 'JWT token not available.' 
      };
    }

    const requestBody = {
      contents: [{
        parts: [{
          text: request.text,
        }],
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: request.voiceId, // voiceId will be the Gemini voice name
            },
          },
        },
      },
      model: MODEL,
    };

    try {
      console.log('[CradleCloudTtsAdapter] Making TTS request to:', `${BASE_URL}/jwt/tts/v1beta/models/${MODEL}/generateContent`);
      console.log('[CradleCloudTtsAdapter] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        `${BASE_URL}/jwt/tts/v1beta/models/${MODEL}/generateContent`,
        requestBody,
        { 
          headers: { 
            ...authHeader, 
            'Content-Type': 'application/json' 
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log('[CradleCloudTtsAdapter] Response status:', response.status);
      console.log('[CradleCloudTtsAdapter] Response data structure:', Object.keys(response.data || {}));

      const inlineData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const audioBase64 = inlineData?.data;
      const mimeType = inlineData?.mimeType;
      
      if (!audioBase64) {
        console.error('[CradleCloudTtsAdapter] Invalid response format:', response.data);
        throw new Error('Invalid response format from CradleCloud TTS API');
      }

      console.log('[CradleCloudTtsAdapter] Received audio data:');
      console.log('  - MIME Type:', mimeType);
      console.log('  - Data size:', audioBase64.length);
      console.log('[CradleCloudTtsAdapter] Converting PCM to WAV format...');

      // 验证返回的是PCM格式 (支持多种PCM MIME类型)
      const isPcmFormat = mimeType === 'audio/pcm' || 
                         mimeType?.startsWith('audio/L16') || 
                         mimeType?.includes('codec=pcm');
      
      if (!isPcmFormat) {
        console.warn('[CradleCloudTtsAdapter] Unexpected MIME type:', mimeType, 'Expected: audio/pcm or audio/L16');
      } else {
        console.log('[CradleCloudTtsAdapter] Confirmed PCM format, proceeding with conversion');
      }

      // 从MIME类型中提取采样率（如果可用）
      let sampleRate = 24000; // 默认值
      if (mimeType?.includes('rate=')) {
        const rateMatch = mimeType.match(/rate=(\d+)/);
        if (rateMatch) {
          sampleRate = parseInt(rateMatch[1], 10);
          console.log('[CradleCloudTtsAdapter] Extracted sample rate:', sampleRate);
        }
      }

      // 将Base64编码的PCM数据转换为WAV格式
      const wavPath = await convertBase64PcmToWavFile(
        audioBase64,
        `${FileSystem.cacheDirectory}tts_cradlecloud_${Date.now()}.wav`,
        sampleRate, // 使用从MIME类型提取的采样率
        1,          // 单声道
        16          // 16位深度
      );

      console.log('[CradleCloudTtsAdapter] Audio converted and saved to:', wavPath);

      return {
        success: true,
        provider: 'gemini',
        data: { audioPath: wavPath },
      };
    } catch (error) {
      console.error('[CradleCloudTtsAdapter] Error during synthesis:', error);
      
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.message
        : (error as Error).message;
      
      return { 
        success: false, 
        provider: 'gemini', 
        error: errorMessage 
      };
    }
  }

  async getStatus?(taskId: string): Promise<any> {
    // CradleCloud TTS doesn't use async status checking, 
    // it returns audio directly in the synthesis call
    throw new Error('Status checking not supported for CradleCloud TTS');
  }

  async cleanup?(taskId?: string): Promise<void> {
    // No cleanup needed for CradleCloud TTS
    console.log('[CradleCloudTtsAdapter] Cleanup called, no action needed');
  }
}
