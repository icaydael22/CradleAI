import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { licenseService } from './license-service'; // Import license service
import { CloudServiceProvider } from './cloud-service-provider'; // Import for LLM requests
import { EventRegister } from 'react-native-event-listeners'; // Import for event handling
import { ttsServerAdapter } from './ttsServerAdapter'; // Import for the server adapter

// Configuration
const TTS_API_URL = 'https://tts.cradleintro.top/api/tts';
const TTS_CACHE_PREFIX = 'tts_cache_';
const TTS_CACHE_DIR = FileSystem.cacheDirectory + 'tts/';
const TTS_AUDIO_STATE_KEY = 'tts_audio_states';
const TTS_ENHANCER_SETTINGS_KEY = 'tts_enhancer_settings';

// Interface for TTS request
interface TTSRequest {
  templateId: string;
  tts_text: string;
  instruction?: string; // Optional instruction for voice generation
  task?: string; // Optional task parameter to identify request type
  email?: string; // Optional email parameter
}

// Interface for TTS response
interface TTSResponse {
  success: boolean;
  data?: {
    audio_url: string;
    taskId?: string;
  };
  error?: string;
}

// Define PlaybackStatus type based on Audio.ts
type PlaybackStatus = {
  isLoaded: boolean;
  isPlaying?: boolean;
  durationMillis?: number;
  positionMillis?: number;
  didJustFinish?: boolean;
  error?: string;
  // Extended properties for polling status
  extendedPolling?: boolean;
  pollingStartTime?: number;
  pollingProgress?: number;
  currentAttempt?: number;
  totalAttempts?: number;
  wasExtendedPolling?: boolean;
  pollingAttempts?: number; // Add this missing property
  // Add other properties as needed
};

// Audio state for tracking playback
export interface AudioState {
  isPlaying: boolean;
  isLoading: boolean;
  hasAudio: boolean;
  error: string | null;
  sound?: Audio.Sound;
  status?: PlaybackStatus;
  audioUrl?: string;
  localUri?: string;
  isComplete?: boolean; // Add flag to track if audio has completed playback
  templateId?: string;  // Store template ID for potential regeneration
  statusMessage?: string; // Add human-readable status message
}

// Define a simplified version of AudioState for persistence
interface PersistentAudioState {
  hasAudio: boolean;
  localUri?: string;
  audioUrl?: string;
  isComplete?: boolean;
  templateId?: string;
}

// Interface for TTS enhancer settings
interface TTSEnhancerSettings {
  enabled: boolean;
  model: string;
}

// Interface for TTS enhancer result
interface TTSEnhancerResult {
  tts_text: string;
  instruction: string;
}

class TTSService {
  // Map to keep track of audio states for different messages
  private audioStates: Map<string, AudioState> = new Map();
  // TTS enhancer settings
  private enhancerSettings: TTSEnhancerSettings = {
    enabled: false,
    model: 'anthropic/claude-instant-v1'
  };
  // Flag to use SSE for real-time updates
  private useRealtimeUpdates: boolean = false;
  // Map of message IDs to task IDs
  private messageToTaskMap = new Map<string, string>();

  constructor() {
    this.ensureCacheDirectoryExists();
    this.loadPersistedAudioStates();
    this.loadEnhancerSettings();
    this.loadRealtimeUpdatesSetting();
  }
  
  // Initialize the cache directory
  private async ensureCacheDirectoryExists() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(TTS_CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TTS_CACHE_DIR, { intermediates: true });
        console.log('Created TTS cache directory');
      }
    } catch (error) {
      console.error('Failed to create TTS cache directory:', error);
    }
  }
  
  // New method to persist audio states to AsyncStorage
  private async persistAudioStates() {
    try {
      const states: Record<string, PersistentAudioState> = {};
      
      // Only persist essential information - not sound objects or full status
      for (const [messageId, state] of this.audioStates.entries()) {
        if (state.hasAudio && state.localUri) {
          states[messageId] = {
            hasAudio: state.hasAudio,
            localUri: state.localUri,
            audioUrl: state.audioUrl,
            isComplete: state.isComplete,
            templateId: state.templateId
          };
        }
      }
      
      await AsyncStorage.setItem(TTS_AUDIO_STATE_KEY, JSON.stringify(states));
      console.log(`[TTSService] Persisted ${Object.keys(states).length} audio states`);
    } catch (error) {
      console.error('[TTSService] Failed to persist audio states:', error);
    }
  }
  
  // Load persisted audio states from AsyncStorage
  private async loadPersistedAudioStates() {
    try {
      const statesJson = await AsyncStorage.getItem(TTS_AUDIO_STATE_KEY);
      if (!statesJson) return;
      
      const states: Record<string, PersistentAudioState> = JSON.parse(statesJson);
      console.log(`[TTSService] Loading ${Object.keys(states).length} persisted audio states`);
      
      // Verify each audio file exists before restoring state
      for (const messageId in states) {
        const state = states[messageId];
        
        if (state.localUri) {
          const fileInfo = await FileSystem.getInfoAsync(state.localUri);
          
          if (fileInfo.exists) {
            // File exists, restore the audio state
            this.audioStates.set(messageId, {
              hasAudio: true,
              isPlaying: false,
              isLoading: false,
              error: null,
              localUri: state.localUri,
              audioUrl: state.audioUrl,
              isComplete: state.isComplete || false,
              templateId: state.templateId
            });
            console.log(`[TTSService] Restored audio state for message: ${messageId}`);
          } else {
            console.log(`[TTSService] Audio file not found: ${state.localUri}`);
          }
        }
      }
    } catch (error) {
      console.error('[TTSService] Failed to load persisted audio states:', error);
    }
  }
  
  // Load TTS enhancer settings
  private async loadEnhancerSettings() {
    try {
      const settingsJson = await AsyncStorage.getItem(TTS_ENHANCER_SETTINGS_KEY);
      if (settingsJson) {
        this.enhancerSettings = JSON.parse(settingsJson);
        console.log(`[TTSService] Loaded enhancer settings: ${JSON.stringify(this.enhancerSettings)}`);
      }
    } catch (error) {
      console.error('[TTSService] Failed to load enhancer settings:', error);
    }
  }
  
  // Save TTS enhancer settings
  async saveEnhancerSettings(settings: TTSEnhancerSettings) {
    try {
      this.enhancerSettings = settings;
      await AsyncStorage.setItem(TTS_ENHANCER_SETTINGS_KEY, JSON.stringify(settings));
      console.log(`[TTSService] Saved enhancer settings: ${JSON.stringify(settings)}`);
      
      // Emit event to notify components about settings change
      EventRegister.emit('ttsEnhancerSettingsChanged', settings);
    } catch (error) {
      console.error('[TTSService] Failed to save enhancer settings:', error);
    }
  }
  
  // Get current TTS enhancer settings
  getEnhancerSettings(): TTSEnhancerSettings {
    return { ...this.enhancerSettings };
  }
  
  // Load real-time updates setting
  private async loadRealtimeUpdatesSetting() {
    try {
      const setting = await AsyncStorage.getItem('tts_realtime_updates');
      this.useRealtimeUpdates = setting === 'true';
      
      if (this.useRealtimeUpdates) {
        // Connect to SSE if real-time updates are enabled
        this.connectToRealtimeUpdates();
      }
    } catch (error) {
      console.error('[TTSService] Failed to load real-time updates setting:', error);
    }
  }
  
  // Connect to real-time updates via SSE
  private async connectToRealtimeUpdates() {
    try {
      await ttsServerAdapter.connect();
      
      // Add global callback for all task updates
      ttsServerAdapter.addGlobalCallback((status) => {
        // Only process updates if we have the message in our audio states
        if (status.taskId && this.findMessageIdByTaskId(status.taskId)) {
          this.handleTaskStatusUpdate(status);
        }
      });
      
      console.log('[TTSService] Connected to real-time updates');
    } catch (error) {
      console.error('[TTSService] Failed to connect to real-time updates:', error);
    }
  }
  
  // Handle task status updates from SSE
  private handleTaskStatusUpdate(status: any) {
    const messageId = this.findMessageIdByTaskId(status.taskId);
    if (!messageId) return;
    
    switch (status.status) {
      case 'processing':
        // Update state to show progress
        this.updateAudioState(messageId, {
          isLoading: true,
          hasAudio: false,
          error: null
        });
        break;
        
      case 'succeeded':
        // Audio is ready
        if (status.output || status.audioUrl) {
          const audioUrl = status.output || status.audioUrl;
          
          // Download and update the state
          this.downloadAndCacheAudio(messageId, audioUrl).then(localUri => {
            this.updateAudioState(messageId, {
              isLoading: false,
              hasAudio: true,
              audioUrl,
              localUri,
              error: null,
              isPlaying: false,
              isComplete: false
            });
            
            this.persistAudioStates();
          });
        }
        break;
        
      case 'failed':
        // Update audio state with error
        this.updateAudioState(messageId, {
          isLoading: false,
          hasAudio: false,
          error: status.error || 'Failed to generate audio',
          isPlaying: false
        });
        break;
    }
  }
  
  // Find message ID by task ID
  private findMessageIdByTaskId(taskId: string): string | null {
    for (const [messageId, tId] of this.messageToTaskMap.entries()) {
      if (tId === taskId) {
        return messageId;
      }
    }
    return null;
  }
  
  // Enable real-time updates
  async enableRealtimeUpdates(enable: boolean): Promise<void> {
    this.useRealtimeUpdates = enable;
    await AsyncStorage.setItem('tts_realtime_updates', enable ? 'true' : 'false');
    
    if (enable && !ttsServerAdapter.isConnected()) { // Fix: use the public method isConnected()
      this.connectToRealtimeUpdates();
    } else if (!enable && ttsServerAdapter.isConnected()) { // Fix: use the public method isConnected()
      ttsServerAdapter.disconnect();
    }
  }
  
  // Verify license before proceeding with API calls
  private async verifyLicense(): Promise<boolean> {
    console.log(`[TTSService] 验证许可证...`);

    // 确保许可证服务已初始化
    if (!licenseService.isInitialized()) {
      console.log(`[TTSService] 初始化许可证服务...`);
      await licenseService.initialize();
    }

    // 检查许可证是否有效
    const isLicenseValid = await licenseService.hasValidLicense();
    if (!isLicenseValid) {
      console.error(`[TTSService] 许可证验证失败: 无效的许可证`);
      return false;
    }

    console.log(`[TTSService] 许可证验证成功`);
    return true;
  }

  // Get license headers for API requests
  private async getLicenseHeaders(): Promise<Record<string, string>> {
    try {
      const licenseHeaders = await licenseService.getLicenseHeaders();
      
      // 检查许可证头是否完整
      if (!licenseHeaders || !licenseHeaders['X-License-Key'] || !licenseHeaders['X-Device-ID']) {
        console.error(`[TTSService] 许可证头信息不完整`);
        return {};
      }

      // 获取许可证信息以获取用户邮箱
      const licenseInfo = await licenseService.getLicenseInfo();
      if (licenseInfo && (licenseInfo.email || licenseInfo.customerEmail)) {
        // 添加用户邮箱到请求头
        const userEmail = licenseInfo.email || licenseInfo.customerEmail;
        if (userEmail) {
          licenseHeaders['X-User-Email'] = userEmail;
        }      
      }
      
      return licenseHeaders;
    } catch (error) {
      console.error(`[TTSService] 获取许可证头信息失败:`, error);
      return {};
    }
  }
  
  // Generate TTS for a message
  async generateTTS(messageId: string, text: string, templateId: string): Promise<AudioState> {
    // Check if we already have this audio
    const existingState = this.getAudioState(messageId);
    if (existingState.hasAudio && existingState.localUri) {
      return existingState;
    }
    
    // Update state to loading
    this.updateAudioState(messageId, {
      isLoading: true,
      hasAudio: false,
      error: null,
      isPlaying: false,
      templateId: templateId // Store template ID for potential regeneration
    });

    try {
      // Verify license before making the API call
      const isLicenseValid = await this.verifyLicense();
      if (!isLicenseValid) {
        throw new Error('生成失败');
      }

      // Get license headers
      const licenseHeaders = await this.getLicenseHeaders();
      if (!licenseHeaders['X-License-Key']) {
        throw new Error('许可证信息不完整，请在API设置中重新激活您的许可证');
      }

      if (this.useRealtimeUpdates) {
        // Use server adapter for real-time updates
        let enhancedText = null;
        let enhancedInstruction = null;
        let requestTask: string | undefined = undefined;

        // Apply TTS enhancer if enabled
        if (this.enhancerSettings.enabled) {
          try {
            console.log(`[TTSService] TTS enhancer enabled, using model: ${this.enhancerSettings.model}`);
            const enhancedTTS = await this.enhanceText(text);
            enhancedText = enhancedTTS.tts_text;
            enhancedInstruction = enhancedTTS.instruction;
            
            // Only set task if we have a valid instruction
            if (enhancedInstruction && enhancedInstruction.trim()) {
              requestTask = "Instructed Voice Generation";
              console.log(`[TTSService] Enhanced text: ${enhancedTTS.tts_text.substring(0, 50)}...`);
              console.log(`[TTSService] Instruction: ${enhancedTTS.instruction}`);
              console.log(`[TTSService] Task: ${requestTask}`);
            } else {
              console.log('[TTSService] Instruction is empty, not using task parameter');
            }
          } catch (enhancerError) {
            console.error('[TTSService] Error in TTS enhancer:', enhancerError);
            // Fallback to original text if enhancement fails
            console.log('[TTSService] Falling back to original text without instruction');
            enhancedText = text;
            enhancedInstruction = null;
            requestTask = undefined; // Change null to undefined to match expected type
          }
        }
        
        const result = await ttsServerAdapter.generateAudio({
          templateId,
          tts_text: enhancedText || text,
          instruction: enhancedInstruction && enhancedInstruction.trim() ? enhancedInstruction : undefined,
          task: enhancedInstruction && enhancedInstruction.trim() ? requestTask : undefined,
          email: licenseHeaders['X-User-Email'] // Add email from license headers
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to generate audio');
        }
        
        // If we got a task ID, store the mapping and wait for updates via SSE
        if (result.data?.taskId) {
          this.messageToTaskMap.set(messageId, result.data.taskId);
          
          // Subscribe to specific task updates
          ttsServerAdapter.subscribeToTask(result.data.taskId, (status) => {
            this.handleTaskStatusUpdate(status);
          });
        }
        
        // If we got an audio URL immediately, use it
        if (result.data?.audio_url) {
          const audioUrl = result.data.audio_url;
          const localUri = await this.downloadAndCacheAudio(messageId, audioUrl);
          
          this.updateAudioState(messageId, {
            isLoading: false,
            hasAudio: true,
            audioUrl,
            localUri,
            error: null,
            isPlaying: false,
            isComplete: false,
            templateId: templateId
          });
          
          await this.persistAudioStates();
          
          return this.getAudioState(messageId);
        }
        
        // Return current state, which should be loading
        return this.getAudioState(messageId);
      } else {
        // Use original implementation for backward compatibility
        let requestData: TTSRequest;
        
        // Apply TTS enhancer if enabled
        if (this.enhancerSettings.enabled) {
          try {
            console.log(`[TTSService] TTS enhancer enabled, using model: ${this.enhancerSettings.model}`);
            const enhancedTTS = await this.enhanceText(text);
            
            // Only add task parameter if we have a valid instruction
            if (enhancedTTS.instruction && enhancedTTS.instruction.trim()) {
              requestData = {
                templateId,
                tts_text: enhancedTTS.tts_text,
                instruction: enhancedTTS.instruction,
                task: "Instructed Voice Generation", // Add task parameter for enhanced TTS
                email: licenseHeaders['X-User-Email'] // Add email from license headers
              };
              
              console.log(`[TTSService] Enhanced text: ${enhancedTTS.tts_text.substring(0, 50)}...`);
              console.log(`[TTSService] Instruction: ${enhancedTTS.instruction}`);
              console.log(`[TTSService] Task: Instructed Voice Generation`);
            } else {
              // If we don't have a valid instruction, don't set the task parameter
              console.log('[TTSService] No valid instruction from enhancer, using standard TTS');
              requestData = {
                templateId,
                tts_text: enhancedTTS.tts_text,
                email: licenseHeaders['X-User-Email'] // Add email from license headers
              };
            }
          } catch (enhancerError) {
            console.error('[TTSService] Error in TTS enhancer:', enhancerError);
            // Fallback to original text if enhancement fails
            console.log('[TTSService] Falling back to original text');
            requestData = {
              templateId,
              tts_text: text,
              email: licenseHeaders['X-User-Email'] // Add email from license headers
            };
          }
        } else {
          // Use original text if enhancer is disabled
          requestData = {
            templateId,
            tts_text: text,
            email: licenseHeaders['X-User-Email'] // Add email from license headers
          };
        }
        
        console.log(`[TTSService] Generating TTS for message ${messageId} with template ${templateId}`);
        
        // Make the API request with license headers
        const response = await fetch(TTS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...licenseHeaders  // Add license headers
          },
          body: JSON.stringify(requestData)
        });
        
        // Get raw response for better error handling
        const responseText = await response.text();
        let responseData: TTSResponse;
        
        try {
          // Parse the response
          responseData = JSON.parse(responseText);
        } catch (error) {
          console.error(`[TTSService] Failed to parse response: ${responseText}`);
          throw new Error(`服务器返回的不是有效的JSON: ${responseText.substring(0, 100)}...`);
        }
        
        if (!response.ok) {
          console.error(`[TTSService] Server returned error: HTTP ${response.status}`);
          let errorDetail = responseData.error || responseText;
          throw new Error(`服务器响应错误: ${response.status} - ${errorDetail}`);
        }
        
        if (!responseData.success) {
          throw new Error(responseData.error || 'Failed to generate audio');
        }
        
        if (!responseData.data?.audio_url) {
          // If no audio URL is returned but the request was successful,
          // the server might still be processing - set up polling
          console.log(`[TTSService] No immediate audio URL returned, starting polling for message ${messageId}`);
          return this.pollForAudioCompletion(messageId, templateId, text);
        }
        
        const audioUrl = responseData.data.audio_url;
        console.log(`[TTSService] Audio generated immediately: ${audioUrl}`);
        
        // Download and cache the audio file
        const localUri = await this.downloadAndCacheAudio(messageId, audioUrl);
        
        // Update audio state with success
        this.updateAudioState(messageId, {
          isLoading: false,
          hasAudio: true,
          audioUrl,
          localUri,
          error: null,
          isPlaying: false,
          isComplete: false,
          templateId: templateId
        });
        
        // Persist audio states after successful generation
        await this.persistAudioStates();
        
        return this.getAudioState(messageId);
      }
    } catch (error) {
      console.error(`[TTSService] Error generating TTS:`, error);
      
      // Update audio state with error
      this.updateAudioState(messageId, {
        isLoading: false,
        hasAudio: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        isPlaying: false
      });
      
      return this.getAudioState(messageId);
    }
  }
  
  // Poll for audio completion when the server is still processing
  private async pollForAudioCompletion(messageId: string, templateId: string, text: string, attempts: number = 0, extendedPolling: boolean = false): Promise<AudioState> {
    // Maximum number of retry attempts
    const INITIAL_MAX_ATTEMPTS = 10; // 10 attempts × 3 seconds = 30 seconds initial polling
    const EXTENDED_MAX_ATTEMPTS = 30; // 30 additional attempts × 5 seconds = 150 seconds extended polling
    const INITIAL_RETRY_DELAY = 3000; // 3 seconds between initial attempts
    const EXTENDED_RETRY_DELAY = 5000; // 5 seconds between extended attempts
    
    const MAX_ATTEMPTS = extendedPolling ? EXTENDED_MAX_ATTEMPTS : INITIAL_MAX_ATTEMPTS;
    const RETRY_DELAY = extendedPolling ? EXTENDED_RETRY_DELAY : INITIAL_RETRY_DELAY;
    
    if (attempts >= MAX_ATTEMPTS) {
      if (!extendedPolling) {
        // If we've reached the end of initial polling, start extended polling
        console.log(`[TTSService] Initial max polling attempts (${INITIAL_MAX_ATTEMPTS}) reached for message ${messageId}. Switching to extended polling.`);
        
        // Update audio state to show extended processing
        this.updateAudioState(messageId, {
          isLoading: true,
          hasAudio: false,
          error: null,
          isPlaying: false,
          // Add a hint that we're in extended polling mode
          status: {
            isLoaded: false,
            extendedPolling: true,
            pollingStartTime: Date.now()
          }
        });
        
        // Start extended polling
        return this.pollForAudioCompletion(messageId, templateId, text, 0, true);
      } else {
        // We've reached the end of extended polling too - now we can consider it a failure
        console.log(`[TTSService] Extended max polling attempts (${EXTENDED_MAX_ATTEMPTS}) reached for message ${messageId}. Polling failed.`);
        this.updateAudioState(messageId, {
          isLoading: false,
          hasAudio: false,
          error: `Audio generation took too long (${Math.round((INITIAL_MAX_ATTEMPTS * INITIAL_RETRY_DELAY + EXTENDED_MAX_ATTEMPTS * EXTENDED_RETRY_DELAY) / 1000)} seconds). Please try again or retry manually.`,
          isPlaying: false
        });
        return this.getAudioState(messageId);
      }
    }
    
    // Wait before trying again
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    
    try {
      const pollingMode = extendedPolling ? 'Extended' : 'Initial';
      const totalAttempts = extendedPolling ? EXTENDED_MAX_ATTEMPTS : INITIAL_MAX_ATTEMPTS;
      
      console.log(`[TTSService] ${pollingMode} polling for audio completion (attempt ${attempts + 1}/${totalAttempts})`);
      
      // Update audio state with progress information
      const progressPercentage = Math.min(95, Math.round((attempts / totalAttempts) * 100));
      this.updateAudioState(messageId, {
        status: {
          isLoaded: false, // Explicitly set isLoaded to false to match required type
          pollingProgress: progressPercentage,
          currentAttempt: attempts + 1,
          totalAttempts: totalAttempts,
          extendedPolling: extendedPolling
        }
      });
      
      // Get license headers for polling request
      const licenseHeaders = await this.getLicenseHeaders();
      
      // Determine if we need to include task parameter for enhanced TTS
      let requestBody: TTSRequest = {
        templateId,
        tts_text: text,
        email: licenseHeaders['X-User-Email'] // Add email from license headers
      };
      
      // Add task parameter if enhancer is enabled and we have instruction
      if (this.enhancerSettings.enabled) {
        try {
          const enhancedTTS = await this.enhanceText(text);
          
          // Only add task if we have a valid instruction
          if (enhancedTTS.instruction && enhancedTTS.instruction.trim()) {
            requestBody = {
              templateId,
              tts_text: enhancedTTS.tts_text,
              instruction: enhancedTTS.instruction,
              task: "Instructed Voice Generation",
              email: licenseHeaders['X-User-Email'] // Add email from license headers
            };
          } else {
            requestBody = {
              templateId,
              tts_text: enhancedTTS.tts_text,
              email: licenseHeaders['X-User-Email'] // Add email from license headers
            };
          }
        } catch (error) {
          console.error('[TTSService] Error enhancing text during polling:', error);
          // Keep using original text without task parameter
        }
      }
      
      // Make a new request to check if audio is ready
      const response = await fetch(TTS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...licenseHeaders // Include license headers
        },
        body: JSON.stringify(requestBody)
      });
      
      // Get raw response for better error handling
      const responseText = await response.text();
      let responseData: TTSResponse;
      
      try {
        // Parse the response
        responseData = JSON.parse(responseText);
      } catch (error) {
        console.error(`[TTSService] Failed to parse response during polling: ${responseText}`);
        // Continue polling instead of failing immediately
        return this.pollForAudioCompletion(messageId, templateId, text, attempts + 1, extendedPolling);
      }
      
      if (responseData.success && responseData.data?.audio_url) {
        // Audio is ready!
        const audioUrl = responseData.data.audio_url;
        console.log(`[TTSService] Audio ready after ${pollingMode.toLowerCase()} polling (attempt ${attempts + 1}): ${audioUrl}`);
        
        // Download and cache the audio file
        const localUri = await this.downloadAndCacheAudio(messageId, audioUrl);
        
        // Update audio state with success
        this.updateAudioState(messageId, {
          isLoading: false,
          hasAudio: true,
          audioUrl,
          localUri,
          error: null,
          isPlaying: false,
          isComplete: false,
          templateId: templateId,
          status: {
            isLoaded: true,
            extendedPolling: false,
            pollingAttempts: attempts + 1, // This property now exists in the type
            wasExtendedPolling: extendedPolling
          }
        });
        
        // Persist audio states after successful generation
        await this.persistAudioStates();
        
        return this.getAudioState(messageId);
      } else if (!response.ok || !responseData.success) {
        // If we get an error response but we're still in polling phase, 
        // log it but continue polling instead of failing
        const errorDetail = responseData.error || 
          (response.status ? `HTTP ${response.status}` : 'Unknown error');
        
        console.warn(`[TTSService] Error during ${pollingMode.toLowerCase()} polling (attempt ${attempts + 1}): ${errorDetail}. Continuing to poll...`);
        return this.pollForAudioCompletion(messageId, templateId, text, attempts + 1, extendedPolling);
      } else {
        // Audio still not ready, continue polling
        console.log(`[TTSService] Audio not ready yet in ${pollingMode.toLowerCase()} polling, continuing to poll...`);
        return this.pollForAudioCompletion(messageId, templateId, text, attempts + 1, extendedPolling);
      }
    } catch (error) {
      console.error(`[TTSService] Error while ${extendedPolling ? 'extended' : 'initial'} polling for audio:`, error);
      
      // Try again instead of failing immediately
      return this.pollForAudioCompletion(messageId, templateId, text, attempts + 1, extendedPolling);
    }
  }
  
  // Enhance text with LLM for better TTS expression
  private async enhanceText(text: string): Promise<TTSEnhancerResult> {
    console.log('[TTSService] Enhancing text with LLM');
    
    try {
      // Skip enhancement for very short texts
      if (text.length < 10) {
        console.log('[TTSService] Text too short for enhancement, returning original');
        return {
          tts_text: text,
          instruction: "natural"
        };
      }
      
      // Create the prompt for the TTS enhancer
      const messages = [
        {
          role: "user",
          content: `你是一个专业的语音表现力增强器。你的任务是分析文本，并添加适当的语气标记，使语音生成更加生动自然。
          
语气标记规则:
- <laughter></laughter>: 包裹一段文本，表示这段文本中包含笑声。如果原文本中已有"哈哈"等笑声，应替换为适当的<laughter>标记
- <strong></strong>: 包裹需要强调的词语
- [breath]: 插入在适当位置，表示换气声，通常在句子末尾

同时你需要生成一个简短的指导语（instruction），用于指导语音生成的情感和风格。指导语可以是：
- 情感描述词: 如"神秘"、"好奇"、"优雅"、"嘲讽"等
- 模仿指导: 如"模仿机器人风格"、"模仿小猪佩奇的语气"等
- 身份描述: 如"一个天真烂漫的小孩，总是充满幻想和无尽的好奇心"

注意：
1. 保留原文本的意思，仅添加语气标记和生成指导语
2. 不要过度添加标记，保持自然
3. 分析文本中隐含的情感，选择合适的指导语
4. 回复必须是有效的JSON格式，包含tts_text和instruction两个字段`
        },
        {
          role: "user",
          content: `请增强以下文本的表现力，添加适当的语气标记，并生成指导语。以JSON格式返回结果：

原文本: "${text}"`
        }
      ];

      // Use CloudServiceProvider to make the LLM request
      console.log(`[TTSService] Making LLM request with model: ${this.enhancerSettings.model}`);
      
      const response = await CloudServiceProvider.generateChatCompletion(messages, {
        model: this.enhancerSettings.model,
        temperature: 0.7,
        max_tokens: 1024
      });
      
      if (!response.ok) {
        throw new Error(`LLM request failed with status: ${response.status}`);
      }

      const responseData = await response.json();
      const llmResponse = responseData.choices[0].message.content;
      
      // Extract JSON object from response (considering LLM might add text before/after JSON)
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from LLM response');
      }
      
      let enhancerResult: TTSEnhancerResult;
      try {
        enhancerResult = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('[TTSService] Failed to parse JSON from LLM response:', parseError);
        throw new Error('Invalid JSON format in LLM response');
      }
      
      // Validate the result has the required fields
      if (!enhancerResult.tts_text || !enhancerResult.instruction) {
        throw new Error('LLM response missing required fields');
      }
      
      return {
        tts_text: enhancerResult.tts_text,
        instruction: enhancerResult.instruction
      };
    } catch (error) {
      console.error('[TTSService] Error enhancing text:', error);
      // Fallback to original text with default instruction
      return {
        tts_text: text,
        instruction: "natural"
      };
    }
  }
  
  // Download and cache the audio file
  private async downloadAndCacheAudio(messageId: string, audioUrl: string): Promise<string> {
    // Generate a cache key based on the message ID
    const cacheKey = `${TTS_CACHE_PREFIX}${messageId}`;
    
    // Check if we have the URL cached
    const cachedUri = await AsyncStorage.getItem(cacheKey);
    if (cachedUri) {
      // Verify the file still exists
      const fileInfo = await FileSystem.getInfoAsync(cachedUri);
      if (fileInfo.exists) {
        console.log(`[TTSService] Using cached audio file: ${cachedUri}`);
        return cachedUri;
      }
    }
    
    // Download the file
    const fileName = `${messageId}.wav`;
    const fileUri = `${TTS_CACHE_DIR}${fileName}`;
    
    console.log(`[TTSService] Downloading audio from ${audioUrl} to ${fileUri}`);
    
    const downloadResult = await FileSystem.downloadAsync(audioUrl, fileUri);
    
    if (downloadResult.status !== 200) {
      throw new Error(`Failed to download audio file (status ${downloadResult.status})`);
    }
    
    // Save the cache entry
    await AsyncStorage.setItem(cacheKey, fileUri);
    
    return fileUri;
  }
  
  // Play audio for a message
  async playAudio(messageId: string): Promise<void> {
    const state = this.getAudioState(messageId);
    
    // Check if we have audio to play
    if (!state.hasAudio || !state.localUri) {
      throw new Error('No audio available to play');
    }
    
    try {
      // If sound already exists, check if it's already playing
      if (state.sound) {
        const status = await state.sound.getStatusAsync();
        
        if (status.isLoaded) {
          // If it's already playing, pause it
          if (status.isPlaying) {
            await state.sound.pauseAsync();
            this.updateAudioState(messageId, { isPlaying: false });
            return;
          }
          
          // If it's paused, check if it's at the end
          if (status.didJustFinish || 
              (status.positionMillis !== undefined && 
               status.durationMillis !== undefined && 
               status.positionMillis >= status.durationMillis - 100)) {
            // Reset to beginning before playing
            await state.sound.setPositionAsync(0);
            // Also reset the isComplete flag when replaying
            this.updateAudioState(messageId, { isComplete: false });
          }
          
          // Resume or play from reset position
          await state.sound.playAsync();
          this.updateAudioState(messageId, { isPlaying: true });
          return;
        } else {
          // Unload the sound if it's not properly loaded
          await state.sound.unloadAsync();
        }
      }
      
      // Create and load a new sound object
      const { sound } = await Audio.Sound.createAsync(
        { uri: state.localUri },
        { shouldPlay: true },
        this.createPlaybackStatusCallback(messageId)
      );
      
      // Update state with the sound object
      this.updateAudioState(messageId, { sound, isPlaying: true, isComplete: false });
      
      // Set up audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch (error) {
      console.error(`[TTSService] Error playing audio:`, error);
      this.updateAudioState(messageId, {
        isPlaying: false,
        error: error instanceof Error ? error.message : 'Failed to play audio'
      });
      throw error;
    }
  }
  
  // Stop audio playback
  async stopAudio(messageId: string): Promise<void> {
    const state = this.getAudioState(messageId);
    
    if (state.sound) {
      try {
        const status = await state.sound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await state.sound.pauseAsync();
          this.updateAudioState(messageId, { isPlaying: false });
        }
      } catch (error) {
        console.error(`[TTSService] Error stopping audio:`, error);
      }
    }
  }
  
  // Create a callback for audio playback status updates
  private createPlaybackStatusCallback(messageId: string) {
    return (status: PlaybackStatus) => {
      if (status.isLoaded) {
        // Update playing state
        this.updateAudioState(messageId, {
          isPlaying: status.isPlaying,
          status
        });
        
        // When playback finishes
        if (status.didJustFinish) {
          // Mark as not playing AND completed playback
          this.updateAudioState(messageId, { 
            isPlaying: false,
            isComplete: true 
          });
          // Persist updated state after completion
          this.persistAudioStates();
        }
      } else if (status.error) {
        console.error(`[TTSService] Playback error:`, status.error);
        this.updateAudioState(messageId, {
          isPlaying: false,
          error: `Playback error: ${status.error}`
        });
      }
    };
  }
  
  // Get the current audio state for a message
  getAudioState(messageId: string): AudioState {
    const state = this.audioStates.get(messageId) || {
      isPlaying: false,
      isLoading: false,
      hasAudio: false,
      error: null,
      isComplete: false
    };
    
    // Add some human-readable status messages based on the polling state
    if (state.isLoading && state.status?.extendedPolling) {
      const elapsedSeconds = Math.floor((Date.now() - (state.status.pollingStartTime || Date.now())) / 1000);
      
      // Calculate and append a human-readable status message
      state.statusMessage = `Still generating audio... (${elapsedSeconds}s, ${state.status.pollingProgress || 0}%)`;
    }
    
    return state;
  }
  
  // Update the audio state for a message
  private updateAudioState(messageId: string, updates: Partial<AudioState>) {
    const currentState = this.getAudioState(messageId);
    const newState = { ...currentState, ...updates };
    this.audioStates.set(messageId, newState);
    return newState;
  }
  
  // Add method to retry failed TTS generation
  async retryTTSGeneration(messageId: string): Promise<AudioState> {
    const state = this.getAudioState(messageId);
    
    if (!state.templateId) {
      throw new Error('Cannot retry: missing template ID');
    }
    
    // Get the text from the message
    // In a real app, you would retrieve this based on your message storage
    const text = ""; // Fill this based on your application's data structure
    
    // Clear error state and set to loading
    this.updateAudioState(messageId, {
      isLoading: true,
      error: null
    });
    
    // If we have a task ID, use the retry API
    const taskId = this.findTaskIdByMessageId(messageId);
    if (this.useRealtimeUpdates && taskId) {
      try {
        // Apply TTS enhancer if enabled
        let enhancedText = null;
        let enhancedInstruction = null;
        let requestTask: string | undefined = undefined;

        if (this.enhancerSettings.enabled) {
          try {
            const enhancedTTS = await this.enhanceText(text);
            enhancedText = enhancedTTS.tts_text;
            enhancedInstruction = enhancedTTS.instruction;
            
            // Only set task if we have a valid instruction
            if (enhancedInstruction && enhancedInstruction.trim()) {
              requestTask = "Instructed Voice Generation";
            }
          } catch (enhancerError) {
            console.error('[TTSService] Error in TTS enhancer during retry:', enhancerError);
            // Fallback to original text without instruction or task
            enhancedText = text;
            enhancedInstruction = undefined;
            requestTask = undefined; // Change null to undefined to match expected type
          }
        }
        
        // Get license headers
        const licenseHeaders = await this.getLicenseHeaders();
        
        const result = await ttsServerAdapter.retryAudio(taskId, {
          templateId: state.templateId,
          tts_text: enhancedText || text,
          instruction: enhancedInstruction && enhancedInstruction.trim() ? enhancedInstruction : undefined,
          task: enhancedInstruction && enhancedInstruction.trim() ? requestTask : undefined,
          email: licenseHeaders['X-User-Email'] // Add email from license headers
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to retry audio generation');
        }
        
        // Return current state, which should be loading
        return this.getAudioState(messageId);
      } catch (error) {
        this.updateAudioState(messageId, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to retry'
        });
        return this.getAudioState(messageId);
      }
    } else {
      // Fall back to generating from scratch
      return this.generateTTS(messageId, text, state.templateId);
    }
  }
  
  // Find task ID by message ID
  private findTaskIdByMessageId(messageId: string): string | undefined {
    return this.messageToTaskMap.get(messageId);
  }
  
  // Clean up resources when component unmounts
  async cleanup(messageId?: string) {
    if (messageId) {
      // Clean up specific message
      const state = this.getAudioState(messageId);
      if (state.sound) {
        await state.sound.unloadAsync();
        // Don't delete from audioStates to preserve the audio file reference
        // Just update its state
        this.updateAudioState(messageId, {
          isPlaying: false,
          sound: undefined,
          status: undefined
        });
      }
      
      // Clean up task subscriptions
      const taskId = this.findTaskIdByMessageId(messageId);
      if (taskId) {
        ttsServerAdapter.unsubscribeFromTask(taskId);
        this.messageToTaskMap.delete(messageId);
      }
    } else {
      // Clean up all sounds but preserve the state references
      for (const [id, state] of this.audioStates.entries()) {
        if (state.sound) {
          await state.sound.unloadAsync();
          this.updateAudioState(id, {
            isPlaying: false,
            sound: undefined,
            status: undefined
          });
        }
      }
      
      // Clean up all subscriptions
      this.messageToTaskMap.clear();
    }
    
    // Persist states before cleanup completes
    await this.persistAudioStates();
  }
}

// Export a singleton instance
export const ttsService = new TTSService();
