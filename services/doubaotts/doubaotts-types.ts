export interface TTSAppConfig {
  appid: string;
  token: string;
  cluster: 'volcano_tts';
}

export interface TTSUserConfig {
  uid: string;
}

export interface TTSAudioConfig {
  voice_type: string;
  emotion?: string;
  enable_emotion?: boolean;
  emotion_scale?: number;
  encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
  speed_ratio?: number;
  rate?: number;
  bitrate?: number;
  explicit_language?: string;
  context_language?: string;
  loudness_ratio?: number;
}

export interface TTSRequestConfig {
  reqid: string;
  text: string;
  text_type?: 'ssml';
  silence_duration?: number;
  with_timestamp?: number | string;
  operation: 'submit' | 'query';
  extra_param?: string;
}

export interface TTSRequest {
  app: TTSAppConfig;
  user: TTSUserConfig;
  audio: TTSAudioConfig;
  request: TTSRequestConfig;
}

export interface TTSResponse {
  reqid: string;
  code: number;
  message: string;
  sequence?: number;
  data?: string;
  addition?: {
    duration?: string;
  };
}

export interface TTSOptions {
  appid: string;
  token: string;
  voice_type?: string;
  encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
  speed_ratio?: number;
  uid?: string;
}

export interface TTSError extends Error {
  code: number;
  reqid?: string;
}

export const TTS_ERROR_CODES = {
  SUCCESS: 3000,
  INVALID_REQUEST: 3001,
  CONCURRENT_LIMIT: 3003,
  BACKEND_BUSY: 3005,
  TEXT_TOO_LONG: 3010,
  INVALID_TEXT: 3011,
  VOICE_NOT_EXISTS: 3050,
} as const;
