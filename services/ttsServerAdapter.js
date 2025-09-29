import { API_CONFIG } from '@/constants/api-config';
import { TTSEventClient } from './ttsEventClient';

class TTSServerAdapter {
  constructor() {
    this.isInitialized = false;
    this.client = null;
    this.baseUrl = API_CONFIG.TTS_API_URL || 'https://tts.cradleintro.top';
  }
  
  async connect() {
    if (this.client && this.client.isConnected()) {
      return;
    }
    
    try {
      this.client = new TTSEventClient({
        baseUrl: this.baseUrl,
        reconnectDelay: 3000,
        maxReconnectAttempts: 5
      });
      
      await this.client.connect();
      this.isInitialized = true;
      console.log('[TTSServerAdapter] Connected to TTS server');
    } catch (error) {
      console.error('[TTSServerAdapter] Failed to connect to TTS server:', error);
      throw error;
    }
  }
  
  async disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.isInitialized = false;
    }
  }
  
  isConnected() {
    return this.client && this.client.isConnected();
  }
  
  addGlobalCallback(callback) {
    if (!this.client) {
      throw new Error('Client not initialized. Call connect() first.');
    }
    
    this.client.addEventListener('task_update', callback);
  }
  
  subscribeToTask(taskId, callback) {
    if (!this.client) {
      throw new Error('Client not initialized. Call connect() first.');
    }
    
    return this.client.subscribeToTask(taskId, callback);
  }
  
  unsubscribeFromTask(taskId) {
    if (!this.client) {
      return;
    }
    
    this.client.unsubscribeFromTask(taskId);
  }
  
  async generateAudio(params) {
    if (!this.client) {
      await this.connect();
    }
    
    try {
      const result = await this.client.generateAudio(params);
      return result;
    } catch (error) {
      console.error('[TTSServerAdapter] Error generating audio:', error);
      throw error;
    }
  }
  
  async retryAudio(taskId, params) {
    if (!this.client) {
      await this.connect();
    }
    
    try {
      const result = await this.client.retryAudio({ taskId, ...params });
      return result;
    } catch (error) {
      console.error('[TTSServerAdapter] Error retrying audio:', error);
      throw error;
    }
  }
}

export const ttsServerAdapter = new TTSServerAdapter();
