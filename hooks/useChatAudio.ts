import { useCallback, useEffect, useState, useMemo } from 'react';
import { Alert } from 'react-native';
import { Message, Character, User } from '@/shared/types';
import AudioCacheManager, { AudioState } from '@/utils/AudioCacheManager';
import { unifiedTTSService } from '@/services/unified-tts/unified-tts-service';
import { UnifiedTTSRequest, UnifiedTTSResponse } from '@/services/unified-tts/types';
import { getApiSettings } from '@/utils/settings-helper';

interface UseChatAudioOptions {
  selectedCharacter?: Character | null;
  user?: User | null;
}

export const useChatAudio = ({ selectedCharacter, user }: UseChatAudioOptions = {}) => {
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  
  // Get AudioCacheManager singleton instance
  const audioCacheManager = useMemo(() => AudioCacheManager.getInstance(), []);

  // Initialize audio states when character changes
  useEffect(() => {
    const loadAudioStates = async () => {
      try {
        // Get cached states from AudioCacheManager
        const cachedStates = audioCacheManager.getAllAudioStates();
        setAudioStates(cachedStates);
      } catch (error) {
        console.error('[useChatAudio] Failed to load audio states:', error);
      }
    };

    if (selectedCharacter?.id) {
      loadAudioStates();
    }
  }, [selectedCharacter?.id, audioCacheManager]);

  // Update audio state helper
  const updateAudioState = useCallback((messageId: string, state: Partial<AudioState>) => {
    audioCacheManager.updateAudioState(messageId, state);
    setAudioStates(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId] || {
          isLoading: false,
          hasAudio: false,
          isPlaying: false,
          isComplete: false,
          error: null
        },
        ...state
      }
    }));
  }, [audioCacheManager]);

  // Main TTS handling function with full functionality from old version
  const handleTTSPress = useCallback(async (message: Message) => {
    if (!message.text || !selectedCharacter?.id) return;

    try {
      const conversationId = selectedCharacter.id;
      const messageId = message.id;

      // Check if audio already exists
      const existingPath = audioCacheManager.getAudioFilePath(messageId);
      if (existingPath) {
        // Audio exists, play/pause it
        const sound = await audioCacheManager.getAudioSound(messageId);
        if (!sound) {
          updateAudioState(messageId, { error: 'Failed to load audio' });
          return;
        }

        const currentState = audioStates[messageId];
        if (currentState?.isPlaying) {
          // Pause the audio
          await sound.pauseAsync();
          updateAudioState(messageId, { isPlaying: false });
        } else {
          // Stop all other playing audio first
          await audioCacheManager.stopAllAudio();
          
          // Update all other audio states to not playing
          const updatedStates = { ...audioStates };
          Object.keys(updatedStates).forEach(id => {
            if (id !== messageId && updatedStates[id].isPlaying) {
              updatedStates[id] = { ...updatedStates[id], isPlaying: false };
              audioCacheManager.updateAudioState(id, { isPlaying: false });
            }
          });
          setAudioStates(updatedStates);

          // Set up playback status listener
          sound.setOnPlaybackStatusUpdate(async (status: any) => {
            if (status.isLoaded && status.didJustFinish) {
              updateAudioState(messageId, {
                isPlaying: false,
                isComplete: true
              });
            }
          });

          // Start playing
          await sound.replayAsync();
          updateAudioState(messageId, {
            isPlaying: true,
            isComplete: false
          });
        }
        return;
      }

      // No existing audio, generate new one
      updateAudioState(messageId, {
        isLoading: true,
        error: null
      });

      // Get TTS configuration from character
      const ttsConfig = selectedCharacter.ttsConfig;
      const apiSettings = getApiSettings(); // 获取当前 API 设置
      
      let provider = ttsConfig?.provider || 'doubao';
      let voiceId = '';

      let result: UnifiedTTSResponse | null = null;
      const request: UnifiedTTSRequest = {
        text: message.text,
        provider: provider as any,
      };

      // 关键逻辑：如果提供商是 cradlecloud 且选择了 gemini 声线，则使用 cradlecloud-tts 适配器
      if (apiSettings.apiProvider === 'cradlecloud' && provider === 'gemini') {
        request.provider = 'cradlecloud-tts';
        voiceId = ttsConfig?.gemini?.voiceName || '';
        request.voiceId = voiceId;
      } else if (provider === 'cosyvoice') {
        const templateId = ttsConfig?.cosyvoice?.templateId || '';
        request.providerSpecific = {
          task: 'zero-shot voice clone',
          source_transcript: ttsConfig?.cosyvoice?.instruction || ''
        };
      } else if (provider === 'doubao') {
        request.providerSpecific = {
          enableEmotion: true,
          encoding: 'wav'
        };
        request.voiceId = ttsConfig?.doubao?.voiceType || selectedCharacter.voiceType || '';
        request.emotion = ttsConfig?.doubao?.emotion || '';
      } else if (provider === 'minimax') {
        request.providerSpecific = {
          englishNormalization: true
        };
        request.voiceId = ttsConfig?.minimax?.voiceId || '';
        request.emotion = ttsConfig?.minimax?.emotion || '';
      } else {
        // Fallback to doubao
        request.provider = 'doubao';
        request.providerSpecific = {
          enableEmotion: true,
          encoding: 'wav'
        };
        request.voiceId = selectedCharacter.voiceType || '';
        request.emotion = '';
      }

      // Synthesize speech
      result = await unifiedTTSService.synthesize(request);

      if (result?.success && result.data?.audioPath) {
        try {
          // Cache the audio file using AudioCacheManager
          const cachedPath = await audioCacheManager.cacheAudioFile(
            messageId,
            conversationId,
            result.data.audioPath
          );

          updateAudioState(messageId, {
            isLoading: false,
            hasAudio: true,
            error: null
          });

          console.log(`[useChatAudio] Audio cached for message ${messageId} at ${cachedPath}`);
          
          // Auto-play the generated audio
          try {
            const sound = await audioCacheManager.getAudioSound(messageId);
            if (sound) {
              // Stop all other audio first
              await audioCacheManager.stopAllAudio();
              
              // Update all other audio states to not playing
              const updatedStates = { ...audioStates };
              Object.keys(updatedStates).forEach(id => {
                if (id !== messageId && updatedStates[id].isPlaying) {
                  updatedStates[id] = { ...updatedStates[id], isPlaying: false };
                  audioCacheManager.updateAudioState(id, { isPlaying: false });
                }
              });
              setAudioStates(updatedStates);

              // Set up playback listener
              sound.setOnPlaybackStatusUpdate(async (status: any) => {
                if (status.isLoaded && status.didJustFinish) {
                  updateAudioState(messageId, {
                    isPlaying: false,
                    isComplete: true
                  });
                }
              });

              // Start playing automatically
              await sound.replayAsync();
              updateAudioState(messageId, {
                isPlaying: true,
                isComplete: false
              });
            }
          } catch (playError) {
            console.error('[useChatAudio] Failed to auto-play generated audio:', playError);
            // Don't show an error alert for auto-play failure, just log it
          }
        } catch (cacheError) {
          console.error('[useChatAudio] Failed to cache audio:', cacheError);
          updateAudioState(messageId, {
            isLoading: false,
            hasAudio: false,
            error: 'Failed to cache audio'
          });
        }
      } else {
        updateAudioState(messageId, {
          isLoading: false,
          hasAudio: false,
          error: result?.error || 'Failed to generate speech'
        });
        Alert.alert('语音生成失败', result?.error || '无法生成语音，请稍后再试。');
      }
    } catch (error) {
      console.error('[useChatAudio] TTS Error:', error);
      updateAudioState(message.id, {
        isLoading: false,
        error: error instanceof Error ? error.message : '未知错误'
      });
      Alert.alert('语音生成失败', '无法生成语音，请稍后再试。');
    }
  }, [selectedCharacter, audioStates, audioCacheManager, updateAudioState]);

  // Play specific audio
  const handlePlayAudio = useCallback(async (messageId: string) => {
    try {
      const sound = await audioCacheManager.getAudioSound(messageId);
      if (!sound) {
        throw new Error('No audio available');
      }

      const currentState = audioStates[messageId] || {
        isLoading: false,
        hasAudio: true,
        isPlaying: false,
        isComplete: false,
        error: null
      };

      // Stop all other audio first
      await audioCacheManager.stopAllAudio();
      
      // Update all audio states
      const updatedStates = { ...audioStates };
      Object.keys(updatedStates).forEach(id => {
        if (id !== messageId && updatedStates[id].isPlaying) {
          updatedStates[id] = { ...updatedStates[id], isPlaying: false };
          audioCacheManager.updateAudioState(id, { isPlaying: false });
        }
      });
      setAudioStates(updatedStates);

      if (currentState.isPlaying) {
        await sound.pauseAsync();
        updateAudioState(messageId, { isPlaying: false });
      } else {
        // Set up playback listener
        sound.setOnPlaybackStatusUpdate(async (status: any) => {
          if (status.isLoaded && status.didJustFinish) {
            updateAudioState(messageId, {
              isPlaying: false,
              isComplete: true
            });
          }
        });
        
        await sound.replayAsync();
        updateAudioState(messageId, {
          isPlaying: true,
          isComplete: false
        });
      }
    } catch (error) {
      console.error('[useChatAudio] Failed to play audio:', error);
      updateAudioState(messageId, {
        isPlaying: false,
        error: error instanceof Error ? error.message : '播放失败'
      });
      Alert.alert('播放失败', '无法播放语音，请稍后再试。');
    }
  }, [audioStates, audioCacheManager, updateAudioState]);

  // Stop all audio
  const stopAllAudio = useCallback(async () => {
    try {
      await audioCacheManager.stopAllAudio();
      
      // Update all states to not playing
      const updatedStates = { ...audioStates };
      Object.keys(updatedStates).forEach(id => {
        if (updatedStates[id].isPlaying) {
          updatedStates[id] = { ...updatedStates[id], isPlaying: false };
        }
      });
      setAudioStates(updatedStates);
    } catch (error) {
      console.error('[useChatAudio] Failed to stop all audio:', error);
    }
  }, [audioStates, audioCacheManager]);

  // Get audio state for a specific message
  const getAudioState = useCallback((messageId: string): AudioState => {
    return audioStates[messageId] || {
      isLoading: false,
      hasAudio: false,
      isPlaying: false,
      isComplete: false,
      error: null
    };
  }, [audioStates]);

  // Check if any audio is playing
  const isAnyAudioPlaying = useCallback(() => {
    return Object.values(audioStates).some(state => state.isPlaying);
  }, [audioStates]);

  // Initialize audio states for messages
  const initializeAudioStatesForMessages = useCallback(async (messageIds: string[]) => {
    try {
      await audioCacheManager.initializeAudioStatesForMessages(messageIds);
      const updatedStates = audioCacheManager.getAllAudioStates();
      setAudioStates(updatedStates);
    } catch (error) {
      console.error('[useChatAudio] Failed to initialize audio states:', error);
    }
  }, [audioCacheManager]);

  return {
    handleTTSPress,
    handlePlayAudio,
    stopAllAudio,
    getAudioState,
    isAnyAudioPlaying,
    audioStates,
    initializeAudioStatesForMessages,
  };
};
