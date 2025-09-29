/**
 * TTS Server Adapter
 * 
 * This adapter provides connectivity between the React Native app and the 
 * TTS server with SSE capabilities and retry mechanisms.
 */

import { Platform } from 'react-native';
import EventSource from 'react-native-sse';

interface TTSRequestParams {
  templateId: string;
  tts_text: string;
  instruction?: string;
  task?: string;
  email: string;
}

interface TTSResponse {
  success: boolean;
  data?: {
    taskId?: string;
    audio_url?: string;
    status?: string;
    message?: string;
  };
  error?: string;
}

interface TaskStatusUpdate {
  taskId: string;
  status: string;
  message?: string;
  audioUrl?: string;
  output?: string;
  error?: string;
  progress?: number;
  retryCount?: number;
  maxRetries?: number;
  [key: string]: any;
}

type TaskStatusCallback = (status: TaskStatusUpdate) => void;

export class TTSServerAdapter {
  private serverUrl: string;
  private eventSource: any | null = null;
  private clientId: string | null = null;
  private taskCallbacks: Map<string, TaskStatusCallback> = new Map();
  private globalCallbacks: ((status: TaskStatusUpdate) => void)[] = [];
  private _isConnected = false; // Changed to _isConnected to avoid confusion with the getter

  constructor(serverUrl: string = 'https://tts.cradleintro.top') {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to the SSE endpoint to receive real-time updates
   */
  public async connect(): Promise<string> {
    // Close existing connection if any
    this.disconnect();

    return new Promise((resolve, reject) => {
      try {
        // Create event source connection
        this.eventSource = new EventSource(`${this.serverUrl}/events`);

        // Set up connection handler
        this.eventSource.addEventListener('connected', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            this.clientId = data.clientId;
            this._isConnected = true;
            console.log(`[TTSServerAdapter] Connected with client ID: ${this.clientId}`);
            resolve(this.clientId || ''); // Fix: Return empty string if clientId is null
          } catch (error) {
            reject(new Error('Failed to parse connection response'));
          }
        });

        // Set up task update handler
        this.eventSource.addEventListener('task_update', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            
            // Call specific task callback if registered
            if (data.taskId && this.taskCallbacks.has(data.taskId)) {
              this.taskCallbacks.get(data.taskId)!(data);
            }
            
            // Call global callbacks
            this.globalCallbacks.forEach(callback => callback(data));
            
            // Map status to match ttsService expectations
            if (data.status === 'succeeded' && data.output) {
              // Convert 'output' from SSE to 'audio_url' for ttsService compatibility
              data.audioUrl = data.output;
            }
          } catch (error) {
            console.error('[TTSServerAdapter] Error processing task update:', error);
          }
        });

        // Set up error handling
        this.eventSource.addEventListener('error', (error: any) => {
          console.error('[TTSServerAdapter] SSE connection error:', error);
          this._isConnected = false;
          
          // Try to reconnect after a delay
          setTimeout(() => {
            if (!this._isConnected && this.eventSource) {
              console.log('[TTSServerAdapter] Attempting to reconnect...');
              this.connect().catch(e => console.error('[TTSServerAdapter] Reconnect failed:', e));
            }
          }, 3000);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the SSE endpoint
   */
  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this._isConnected = false;
      console.log('[TTSServerAdapter] Disconnected from SSE');
    }
  }

  /**
   * Generate audio through the TTS server
   */
  public async generateAudio(params: TTSRequestParams): Promise<TTSResponse> {
    try {
      // Ensure we're connected for SSE updates
      if (!this._isConnected) {
        await this.connect();
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      // Add client ID if available for SSE subscription
      if (this.clientId) {
        headers['X-Client-ID'] = this.clientId;
      }
      
      // Make API request
      const response = await fetch(`${this.serverUrl}/api/tts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params)
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate audio');
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Retry a failed audio generation
   */
  public async retryAudio(taskId: string, params: TTSRequestParams): Promise<TTSResponse> {
    try {
      const payload = {
        taskId,
        ...params
      };
      
      const response = await fetch(`${this.serverUrl}/api/tts/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to retry audio generation');
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get the status of a specific task
   */
  public async getTaskStatus(taskId: string): Promise<TTSResponse> {
    try {
      const response = await fetch(`${this.serverUrl}/api/tts/task/${taskId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get task status');
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Subscribe to updates for a specific task
   */
  public subscribeToTask(taskId: string, callback: TaskStatusCallback): void {
    this.taskCallbacks.set(taskId, callback);
    
    // If connected and we have a client ID, try to get current status
    if (this._isConnected && this.clientId) {
      this.getTaskStatus(taskId).then(result => {
        if (result.success && result.data) {
          callback({
            taskId,
            status: result.data.status || 'unknown',
            ...result.data
          });
        }
      }).catch(e => console.error('[TTSServerAdapter] Error getting initial task status:', e));
    }
  }

  /**
   * Unsubscribe from a specific task
   */
  public unsubscribeFromTask(taskId: string): void {
    this.taskCallbacks.delete(taskId);
  }

  /**
   * Add a global callback for all task updates
   */
  public addGlobalCallback(callback: (status: TaskStatusUpdate) => void): void {
    this.globalCallbacks.push(callback);
  }

  /**
   * Remove a global callback
   */
  public removeGlobalCallback(callback: (status: TaskStatusUpdate) => void): void {
    const index = this.globalCallbacks.indexOf(callback);
    if (index !== -1) {
      this.globalCallbacks.splice(index, 1);
    }
  }

  /**
   * Get the client ID assigned by the server
   * @returns {string} - Client ID if connected, empty string otherwise
   */
  public getClientId(): string {
    return this.clientId || '';
  }

  /**
   * Check if connected to SSE endpoint
   * @returns {boolean} - True if connected
   */
  public isConnected(): boolean {
    return this._isConnected;
  }
}

// Export singleton instance
export const ttsServerAdapter = new TTSServerAdapter();
