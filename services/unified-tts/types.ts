import { TTSProvider } from '@/shared/types';

// Extended provider type for internal use
export type ExtendedTTSProvider = TTSProvider | 'cradlecloud-tts';

export interface UnifiedTTSRequest {
  text: string;
  provider: ExtendedTTSProvider;
  // Common parameters
  voiceId?: string;
  emotion?: string;
  speed?: number;
  // Provider-specific parameters
  providerSpecific?: {
    // CosyVoice specific
    task?: 'zero-shot voice clone' | 'cross-lingual voice clone' | 'Instructed Voice Generation';
    source_audio?: string;
    source_transcript?: string;
    
    // Doubao specific
    enableEmotion?: boolean;
    emotionScale?: number;
    loudnessRatio?: number;
    encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
    
    // Minimax specific
    languageBoost?: string;
    englishNormalization?: boolean;
  };
}

export interface UnifiedTTSResponse {
  success: boolean;
  provider: ExtendedTTSProvider;
  data?: {
    audioUrl?: string;
    audioPath?: string;
    audioBuffer?: Buffer;
    taskId?: string;
    duration?: number;
  };
  error?: string;
  metadata?: {
    processingTime?: number;
    predictionId?: string;
    reqId?: string;
  };
}

export interface UnifiedTTSStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  audioUrl?: string;
  error?: string;
  provider: ExtendedTTSProvider;
}

export type TTSStatusCallback = (status: UnifiedTTSStatus) => void;

export interface TTSProviderConfig {
  cosyvoice?: {
    replicateApiToken: string;
    replicateModel?: string;
  };
  doubao?: {
    appid: string;
    token: string;
    voiceType?: string;
    encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
    speedRatio?: number;
  };
  minimax?: {
    apiToken: string;
    model?: string;
    voiceId?: string;
  };
}
