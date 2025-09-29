export { unifiedTTSService, UnifiedTTSService } from './unified-tts-service';
export * from './types';
export * from './adapters';

import { unifiedTTSService } from './unified-tts-service';
import { UnifiedTTSRequest, UnifiedTTSResponse, TTSProvider } from './types';

/**
 * Convenience function to synthesize text with the best available provider
 */
export async function synthesizeText(
  text: string,
  options?: {
    preferredProvider?: TTSProvider;
    voiceId?: string;
    emotion?: string;
    speed?: number;
    providerSpecific?: UnifiedTTSRequest['providerSpecific'];
  }
): Promise<UnifiedTTSResponse> {
  const availableProviders = unifiedTTSService.getAvailableProviders();
  
  console.log('[synthesizeText] Available providers:', availableProviders);
  console.log('[synthesizeText] Preferred provider:', options?.preferredProvider);
  
  if (availableProviders.length === 0) {
    return {
      success: false,
      provider: 'cosyvoice',
      error: 'No TTS providers are available'
    };
  }

  // Use preferred provider if available, otherwise use the first available
  const preferredAvailable = options?.preferredProvider && 
    unifiedTTSService.isProviderAvailable(options.preferredProvider);
  const provider = preferredAvailable
    ? options.preferredProvider!
    : availableProviders[0];

  console.log('[synthesizeText] Selected provider:', provider);
  console.log('[synthesizeText] Preferred provider available:', preferredAvailable);

  const request: UnifiedTTSRequest = {
    text,
    provider,
    voiceId: options?.voiceId,
    emotion: options?.emotion,
    speed: options?.speed,
    providerSpecific: options?.providerSpecific
  };

  return await unifiedTTSService.synthesize(request);
}

/**
 * 获取 CosyVoice 模板音频 URL
 */
function getCosyVoiceTemplateAudioUrl(templateId: string): string {
  return `https://cradleintro.top/${templateId}/source_audio.mp3`;
}

/**
 * 获取 CosyVoice 模板 transcript 文本 URL
 */
function getCosyVoiceTemplateTranscriptUrl(templateId: string): string {
  return `https://cradleintro.top/${templateId}/source_transcript.txt`;
}

/**
 * 拉取 transcript 文本内容
 */
async function fetchTranscriptText(url: string): Promise<string | undefined> {
  try {
    console.log('[fetchTranscriptText] Fetching from URL:', url);
    const res = await fetch(url);
    console.log('[fetchTranscriptText] Response status:', res.status, res.statusText);
    
    if (!res.ok) {
      console.warn('[fetchTranscriptText] Failed to fetch transcript:', res.status, res.statusText);
      return undefined;
    }
    
    const text = await res.text();
    console.log('[fetchTranscriptText] Successfully fetched transcript length:', text.length);
    console.log('[fetchTranscriptText] Transcript content preview:', text.substring(0, 100) + '...');
    return text;
  } catch (error) {
    console.error('[fetchTranscriptText] Error fetching transcript:', error);
    return undefined;
  }
}

/**
 * Convenience function to synthesize with CosyVoice
 * 支持自动根据 ttsConfig.cosyvoice.templateId 推导 source_audio/source_transcript
 */
export async function synthesizeWithCosyVoice(
  text: string,
  task?: 'zero-shot voice clone' | 'cross-lingual voice clone' | 'Instructed Voice Generation',
  templateIdOrSourceAudio?: string,
  options?: {
    source_audio?: string;
    source_transcript?: string;
  }
): Promise<UnifiedTTSResponse> {
  let source_audio = options?.source_audio;
  let source_transcript = options?.source_transcript;

  console.log('[synthesizeWithCosyVoice] Input parameters:', {
    text,
    task,
    templateIdOrSourceAudio,
    options,
    initialSourceAudio: source_audio,
    initialSourceTranscript: source_transcript
  });

  // 如果传入 templateIdOrSourceAudio，优先作为 templateId 处理
  if (templateIdOrSourceAudio && !/^https?:\/\//.test(templateIdOrSourceAudio)) {
    const templateId = templateIdOrSourceAudio;
    source_audio = getCosyVoiceTemplateAudioUrl(templateId);
    console.log('[synthesizeWithCosyVoice] Generated source_audio URL:', source_audio);
    
    // 如果未显式传入 source_transcript，则自动拉取
    if (!source_transcript) {
      const transcriptUrl = getCosyVoiceTemplateTranscriptUrl(templateId);
      console.log('[synthesizeWithCosyVoice] Fetching transcript from:', transcriptUrl);
      source_transcript = await fetchTranscriptText(transcriptUrl);
      console.log('[synthesizeWithCosyVoice] Fetched transcript:', source_transcript);
    }
  } else if (templateIdOrSourceAudio && /^https?:\/\//.test(templateIdOrSourceAudio)) {
    // 直接传入了 source_audio url
    source_audio = templateIdOrSourceAudio;
    console.log('[synthesizeWithCosyVoice] Using direct URL as source_audio:', source_audio);
  }

  console.log('[synthesizeWithCosyVoice] Final parameters before request:', {
    source_audio,
    source_transcript,
    hasSourceAudio: !!source_audio,
    hasSourceTranscript: !!source_transcript
  });

  // 日志：最终发给 unifiedTTSService 的请求体
  const req = {
    text,
    preferredProvider: 'cosyvoice' as TTSProvider,
    providerSpecific: {
      task,
      source_audio,
      source_transcript
    }
  };
  console.log('[synthesizeWithCosyVoice] 最终请求数据:', req);

  return await synthesizeText(text, {
    preferredProvider: 'cosyvoice',
    providerSpecific: {
      task,
      source_audio,
      source_transcript
    }
  });
}

/**
 * Convenience function to synthesize with Doubao
 */
export async function synthesizeWithDoubao(
  text: string,
  voiceType?: string,
  emotion?: string
): Promise<UnifiedTTSResponse> {
  return await synthesizeText(text, {
    preferredProvider: 'doubao',
    voiceId: voiceType,
    emotion
  });
}

/**
 * Convenience function to synthesize with Minimax
 */
export async function synthesizeWithMinimax(
  text: string,
  voiceId?: string,
  emotion?: string
): Promise<UnifiedTTSResponse> {
  return await synthesizeText(text, {
    preferredProvider: 'minimax',
    voiceId,
    emotion
  });
}

/**
 * Get available providers
 */
export function getAvailableProviders(): TTSProvider[] {
  return unifiedTTSService.getAvailableProviders();
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(provider: TTSProvider): boolean {
  return unifiedTTSService.isProviderAvailable(provider);
}
