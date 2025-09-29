import { UnifiedTTSRequest, UnifiedTTSResponse, UnifiedTTSStatus } from '../types';

export interface TTSProviderAdapter {
  synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse>;
  getStatus?(taskId: string): Promise<UnifiedTTSStatus | null>;
  cleanup?(taskId?: string): Promise<void>;
}
