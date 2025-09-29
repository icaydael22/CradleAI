import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Character } from '@/shared/types';
import { useUser } from '@/constants/UserContext';
import { useRegex } from '@/constants/RegexContext';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { cradleCloudAdapter } from '@/NodeST/nodest/utils/cradlecloud-adapter';
import Mem0Service from '@/src/memory/services/Mem0Service';
import ImageManager from '@/utils/ImageManager';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { getApiSettings } from '@/utils/settings-helper';
import { TableMemoryService } from '@/services/table-memory-service';
import { TableMemory } from '@/src/memory';
import MemoOverlay from '@/app/pages/MemoOverlay';
import AutoImageService from '@/services/AutoImageService';

export interface ChatActionsState {
  isLoading: boolean;
  isContinuing: boolean;
  isAbortAvailable: boolean;
}

export interface ChatActionsOptions {
  selectedConversationId: string | null;
  conversationId: string;
  selectedCharacter: Character;
  onSendMessage: (text: string, sender: 'user' | 'bot', isLoading?: boolean, metadata?: Record<string, any>) => Promise<string> | void;
  onMessageSendFailed?: (messageId: string, error: string) => void;
  onGenerateImage?: (imageId: string, prompt: string) => void;
}

export const useChatActions = ({
  selectedConversationId,
  conversationId,
  selectedCharacter,
  onSendMessage,
  onMessageSendFailed,
  onGenerateImage
}: ChatActionsOptions) => {
  const { user } = useUser();
  const { applyRegexTools } = useRegex();
  const autoImageService = AutoImageService.getInstance();

  const [state, setState] = useState<ChatActionsState>({
    isLoading: false,
    isContinuing: false,
    isAbortAvailable: false,
  });

  const updateState = useCallback((updates: Partial<ChatActionsState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const resetLoadingState = useCallback(() => {
    updateState({
      isLoading: false,
      isContinuing: false,
      isAbortAvailable: false,
    });
  }, [updateState]);

  const handleAbortRequest = useCallback(() => {
    try {
      console.log('[useChatActions] User requested abort');
      const result = (global as any).NodeSTManager?.abortCurrentRequest?.();
      
      if (result?.success) {
        if (result.wasActive) {
          console.log('[useChatActions] Successfully aborted active request');
          onSendMessage('', 'user', false, { aborted: true });
        } else {
          console.log('[useChatActions] No active request to abort');
        }
      } else {
        console.warn('[useChatActions] Failed to abort request');
      }
      
      resetLoadingState();
    } catch (error) {
      console.error('[useChatActions] Error during abort:', error);
      resetLoadingState();
    }
  }, [onSendMessage, resetLoadingState]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (text.trim() === '') return;
    if (!selectedConversationId) {
      Alert.alert('错误', '请先选择一个角色');
      return;
    }

    const messageToSend = text.trim();
    updateState({ 
      isLoading: true,
      isAbortAvailable: true 
    });

    const processedMessage = applyRegexTools(messageToSend, 'user');
    
  let userMessageId: string | null = null;
  let botMessageId: string | null = null; // 新增：跟踪流式AI消息ID
  let botPlaceholderCreated = false; // only create placeholder when streaming starts
    
    try {
      // Send user message immediately with 'sending' status
      console.log('[useChatActions] 发送用户消息:', processedMessage);
      const messageResult = await onSendMessage(processedMessage, 'user', false, { status: 'sending' });
      
      // Extract message ID if onSendMessage returns it
      if (typeof messageResult === 'string') {
        userMessageId = messageResult;
      }

  // Do NOT create a bot placeholder yet. Create it on first streaming delta to avoid leaving empty placeholders on failure.

      // Get memory system settings
      let tableMemoryEnabled = false;
      let vectorMemoryEnabled = false;
      try {
        const settings = await (MemoOverlay as any).getSettings?.();
        if (settings) {
          tableMemoryEnabled = !!settings.tableMemoryEnabled;
          vectorMemoryEnabled = !!settings.vectorMemoryEnabled;
        }
      } catch (e) {
        // Default to disabled
      }

      const apiSettings = getApiSettings();
      const useZhipuEmbedding = !!apiSettings.useZhipuEmbedding;
      const useCradleCloudEmbedding = apiSettings.apiProvider === 'cradlecloud' && !!apiSettings.cradlecloud?.enabled;

      const isImageRelated = processedMessage.includes('![') && processedMessage.includes(')');
      let userMemoryAdded = false;

      // Vector memory operations
      if (
        selectedCharacter?.id &&
        !isImageRelated &&
        vectorMemoryEnabled &&
        (useZhipuEmbedding || useCradleCloudEmbedding)
      ) {
        try {
          const mem0Service = Mem0Service.getInstance();
          const memoryResults = await mem0Service.searchMemories(
            processedMessage,
            selectedCharacter.id,
            selectedConversationId,
            5
          );
          
          const resultCount = memoryResults?.results?.length || 0;
          if (resultCount > 0) {
            console.log(`[useChatActions] 为用户消息找到 ${resultCount} 条相关记忆`);
          }

          await mem0Service.addChatMemory(
            processedMessage,
            'user',
            selectedCharacter.id,
            selectedConversationId
          );
          userMemoryAdded = true;
          console.log('[useChatActions] 用户消息已成功添加到记忆系统的消息缓存');
        } catch (memoryError) {
          console.error('[useChatActions] 记忆系统操作失败:', memoryError);
        }
      }
      
      // Process chat message with NodeST，透传流式回调
      console.log('[useChatActions] 开始同一角色继续对话处理...');
      const result = await NodeSTManager.processChatMessage({
        userMessage: messageToSend,
        status: '同一角色继续对话',
        conversationId: conversationId,
        character: selectedCharacter,
        characterId: selectedCharacter?.id,
        onStream: (delta: string) => {
          if (!delta) return;
          (async () => {
            try {
              if (!botPlaceholderCreated) {
                const initialBotId = await onSendMessage('', 'bot', true, { status: 'sending', isStreaming: true });
                if (typeof initialBotId === 'string' && initialBotId) {
                  botMessageId = initialBotId;
                  botPlaceholderCreated = true;
                }
              }

              if (botMessageId) {
                await onSendMessage(delta, 'bot', true, { updateExisting: true, targetMessageId: botMessageId, isStreaming: true });
              }
            } catch (e) {
              console.error('[useChatActions] Stream update error:', e);
            }
          })();
        }
      });

      updateState({ isLoading: false });

      if (result.success) {
        const text = result.text || '';
        if (text && text.trim() !== '') {
          const processedResponse = applyRegexTools(text, 'ai');
          console.log('[useChatActions] NodeST处理成功，完成AI回复');
          // 完成流式消息（去掉loading状态，若平台不支持“更新”，则追加一次完整文本）
          if (botMessageId) {
            await onSendMessage(processedResponse, 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'sent', isStreaming: false });
          } else {
            await onSendMessage(processedResponse, 'bot');
          }

        // Trigger auto image generation
        if (
          selectedCharacter &&
          (selectedCharacter.autoImageEnabled || selectedCharacter.customImageEnabled) &&
          typeof onGenerateImage === 'function'
        ) {
          const messages = [
            { id: `user-${Date.now()}`, text: processedMessage, sender: 'user', isLoading: false, timestamp: Date.now() },
            { id: `bot-${Date.now()}`, text: processedResponse, sender: 'bot', isLoading: false, timestamp: Date.now() }
          ];
          await autoImageService.triggerAutoImageGeneration(
            selectedCharacter,
            messages,
            onGenerateImage
          );
        }

        // Table memory service
        if (
          selectedCharacter?.id &&
          !isImageRelated &&
          tableMemoryEnabled
        ) {
          (async () => {
            try {
              const recentMessages = await StorageAdapter.getRecentMessages(selectedConversationId, 10);
              const messages = recentMessages
                .map(msg => {
                  let role: 'user' | 'assistant' | undefined;
                  if (msg.role === 'user') role = 'user';
                  else if (msg.role === 'model' || msg.role === 'assistant') role = 'assistant';
                  else return undefined;
                  return {
                    role,
                    content: msg.parts?.[0]?.text || ''
                  };
                })
                .filter(Boolean) as { role: 'user' | 'assistant'; content: string }[];

              const tableDataResult = await TableMemory.getCharacterTablesData(selectedCharacter.id, selectedConversationId);
              const tableNameToId: Record<string, string> = {};
              if (tableDataResult?.tables?.length) {
                tableDataResult.tables.forEach(tbl => {
                  tableNameToId[tbl.name] = tbl.id;
                });
              }

              await TableMemoryService.process({
                characterId: selectedCharacter.id,
                conversationId: selectedConversationId,
                messages,
                tableNameToId
              });
              console.log('[useChatActions] 表格记忆服务已异步处理完成');
            } catch (e) {
              console.warn('[useChatActions] 表格记忆服务处理失败:', e);
            }
          })();
        }

        // Add AI response to vector memory
        if (
          userMemoryAdded &&
          selectedCharacter?.id &&
          !isImageRelated &&
          vectorMemoryEnabled &&
          (useZhipuEmbedding || useCradleCloudEmbedding)
        ) {
          try {
            const mem0Service = Mem0Service.getInstance();
            
            if (processedResponse && processedResponse.trim() !== '') {
              await mem0Service.addChatMemory(
                processedResponse,
                'bot',
                selectedCharacter.id,
                selectedConversationId
              );
              console.log('[useChatActions] 成功将AI回复添加到记忆系统缓存');
            }
          } catch (memoryError) {
            console.error('[useChatActions] 添加AI回复到记忆系统失败:', memoryError);
          }
        }
        } else {
          // Empty AI response: treat as failure. Do NOT send any "抱歉" or bot messages.
          const errorDetail = 'Empty AI response';
          console.error('NodeST empty response:', errorDetail);
          if (userMessageId && onMessageSendFailed) {
            onMessageSendFailed(userMessageId, errorDetail);
          }
          if (botPlaceholderCreated && botMessageId) {
            try {
              if (typeof onMessageSendFailed === 'function') onMessageSendFailed(botMessageId, errorDetail);
              await onSendMessage('', 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'failed', isStreaming: false });
            } catch (e) {
              // noop
            }
          }
        }
      } else {
        // 处理 NodeST 错误 - 不发送AI错误消息，而是更新用户消息状态
        const errorDetail = result.error || 'Unknown NodeST error';
        console.error('NodeST error:', errorDetail);

        if (userMessageId && onMessageSendFailed) {
          onMessageSendFailed(userMessageId, errorDetail);
        }
        // If a bot placeholder was created, mark it failed without adding any text
        if (botPlaceholderCreated && botMessageId) {
          try {
            if (typeof onMessageSendFailed === 'function') onMessageSendFailed(botMessageId, errorDetail);
            await onSendMessage('', 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'failed', isStreaming: false });
          } catch (e) {
            // noop
          }
        }
      }
    } catch (error) {
      console.error('[useChatActions] Error sending message:', error);

      // 处理网络或其他异常 - 不发送AI错误消息，而是更新用户消息状态
      const errorDetail = error instanceof Error ? error.message : 'Unknown error';

      if (userMessageId && onMessageSendFailed) {
        onMessageSendFailed(userMessageId, errorDetail);
      }
      // If a bot placeholder was created, mark it failed without adding any text
      if (botPlaceholderCreated && botMessageId) {
        try {
          if (typeof onMessageSendFailed === 'function') onMessageSendFailed(botMessageId, errorDetail);
          await onSendMessage('', 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'failed', isStreaming: false });
        } catch (e) {
          // noop
        }
      }
    } finally {
      resetLoadingState();
    }
  }, [
    selectedConversationId,
    selectedCharacter,
    conversationId,
    updateState,
    applyRegexTools,
    onSendMessage,
    onMessageSendFailed,
    onGenerateImage,
    autoImageService,
    resetLoadingState
  ]);

  const continueConversation = useCallback(async () => {
    if (!selectedConversationId) {
      Alert.alert('错误', '请先选择一个角色');
      return;
    }
    
    updateState({ 
      isContinuing: true,
      isAbortAvailable: true 
    });
    
  let continueMessageId: string | null = null;
  let botMessageId: string | null = null; // 新增：跟踪流式AI消息ID
  let botPlaceholderCreated = false;
    
    try {
      const messageResult = await onSendMessage('继续', 'user', false, { isContinue: true, status: 'sending' });
      
      // Extract message ID if onSendMessage returns it
      if (typeof messageResult === 'string') {
        continueMessageId = messageResult;
      }
      
  // Do not create placeholder yet; create on first stream delta.
      
      const result = await NodeSTManager.processChatMessage({
        userMessage: '继续',
        status: '同一角色继续对话',
        conversationId: conversationId,
        character: selectedCharacter,
        characterId: selectedCharacter?.id,
        onStream: (delta: string) => {
          if (!delta) return;
          (async () => {
            try {
              if (!botPlaceholderCreated) {
                const initialBotId = await onSendMessage('', 'bot', true, { status: 'sending', isStreaming: true });
                if (typeof initialBotId === 'string' && initialBotId) {
                  botMessageId = initialBotId;
                  botPlaceholderCreated = true;
                }
              }

              if (botMessageId) {
                await onSendMessage(delta, 'bot', true, { updateExisting: true, targetMessageId: botMessageId });
              }
            } catch (e) {
              // noop
            }
          })();
        }
      });
      
      if (result.success) {
        const text = result.text || '';
        if (text && text.trim() !== '') {
          const processedResponse = applyRegexTools(text, 'ai');
          // 完成流式消息
          if (botMessageId) {
            await onSendMessage(processedResponse, 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'sent', isStreaming: false });
          } else {
            onSendMessage(processedResponse, 'bot');
          }
        } else {
          // Empty response: mark continue user message as failed, do not send any bot text
          const errorDetail = 'Empty AI response';
          console.error('NodeST empty response in continueConversation:', errorDetail);
          if (continueMessageId && onMessageSendFailed) onMessageSendFailed(continueMessageId, errorDetail);
          if (botPlaceholderCreated && botMessageId) {
            try {
              if (typeof onMessageSendFailed === 'function') onMessageSendFailed(botMessageId, errorDetail);
              await onSendMessage('', 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'failed', isStreaming: false });
            } catch (e) {
              // noop
            }
          }
        }
      } else {
        // 处理 NodeST 错误 - 不发送AI错误消息，而是更新用户消息状态
        const errorDetail = result.error || 'Unknown NodeST error';
        console.error('NodeST error in continueConversation:', errorDetail);
        
        if (continueMessageId && onMessageSendFailed) {
          onMessageSendFailed(continueMessageId, errorDetail);
        }
      }
      } catch (error) {
      console.error('[useChatActions] Error in continueConversation:', error);

      // 处理网络或其他异常 - 不发送AI错误消息，而是更新用户消息状态
      const errorDetail = error instanceof Error ? error.message : 'Unknown error';

      if (continueMessageId && onMessageSendFailed) {
        onMessageSendFailed(continueMessageId, errorDetail);
      }
      if (botPlaceholderCreated && botMessageId) {
        try {
          if (typeof onMessageSendFailed === 'function') onMessageSendFailed(botMessageId, errorDetail);
          await onSendMessage('', 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'failed', isStreaming: false });
        } catch (e) {
          // noop
        }
      }
    } finally {
      updateState({ 
        isContinuing: false,
        isAbortAvailable: false 
      });
    }
  }, [
    selectedConversationId,
    conversationId,
    selectedCharacter,
    updateState,
    applyRegexTools,
    onSendMessage,
    onMessageSendFailed
  ]);

  const sendImage = useCallback(async (imageData: string, imageType: string) => {
    if (!selectedConversationId || !imageData) {
      return;
    }
  // allow signalling failures for the bot message id from catch blocks
  let botMessageId: string | null = null;

  try {
      updateState({ isLoading: true });
      
  const apiKey = user?.settings?.chat.characterApiKey || '';
  const geminiAdapter = new GeminiAdapter(apiKey);
  const apiSettings = getApiSettings();
  const useCradleCloudProvider = apiSettings.apiProvider === 'cradlecloud' && !!apiSettings.cradlecloud?.enabled;
      
      // Extract character personality and description
      let characterPersonality = '';
      let characterDescription = '';
      
      if (selectedCharacter?.jsonData) {
        try {
          const characterData = JSON.parse(selectedCharacter.jsonData);
          characterPersonality = characterData.roleCard?.personality || '';
          characterDescription = characterData.roleCard?.description || '';
        } catch (e) {
          console.error('[useChatActions] Error parsing character JSON data:', e);
        }
      }
      
      // Get recent messages context
      let recentMessagesContext = '';
      try {
        if (conversationId) {
          const recentMessages = await StorageAdapter.getRecentMessages(conversationId, 5);
          
          if (recentMessages && recentMessages.length > 0) {
            recentMessagesContext = recentMessages.map(msg => {
              const role = msg.role === 'user' ? '用户' : selectedCharacter.name;
              return `${role}: ${msg.parts?.[0]?.text || ''}`;
            }).join('\n');
          }
        }
      } catch (e) {
        console.error('[useChatActions] Error getting recent messages:', e);
      }
      
      const enhancedPrompt = `
这是用户发送的一张图片。请以${selectedCharacter.name}的身份分析并回应这张图片。

角色信息:
姓名: ${selectedCharacter.name}
性格: ${characterPersonality}
简介: ${characterDescription}

${recentMessagesContext ? `最近的对话记录:\n${recentMessagesContext}\n` : ''}

根据以上角色设定和对话历史，分析这张图片并保持角色的语气、性格特点做出回应。
如果图片内容涉及到与角色背景、关系或对话历史相关的内容，请基于角色视角做出更具针对性的回应。
回应应该展现角色的独特风格，就像角色真的在看到并评论这张图片一样。`;
      
  let response: string = '';
  let imageCacheId: string = '';
      
      if (useCradleCloudProvider) {
        // Use CradleCloud generateMultiModalContent for image analysis
        try {
          if (imageType === 'url') {
            // Try to cache the URL image by fetching it as base64 (reuse Gemini helper if available)
            try {
              const imageDataResult = await geminiAdapter.fetchImageAsBase64(imageData);
              const cacheResult = await ImageManager.cacheImage(imageDataResult.data, imageDataResult.mimeType);
              imageCacheId = cacheResult.id;
            } catch (err) {
              console.warn('[useChatActions] Could not cache URL image, falling back to URL as id:', err);
              imageCacheId = imageData;
            }

            const gen = await cradleCloudAdapter.generateMultiModalContent(enhancedPrompt, {
              images: [{ url: imageData }]
            });
            response = (gen && gen.text) ? gen.text : '';
          } else {
            let base64Data = imageData;
            let mimeType = imageType || 'image/jpeg';

            if (imageData.includes('base64,')) {
              base64Data = imageData.split('base64,')[1];
              mimeType = imageData.split(';')[0].replace('data:', '');
            }

            const cacheResult = await ImageManager.cacheImage(base64Data, mimeType);
            imageCacheId = cacheResult.id;

            const gen = await cradleCloudAdapter.generateMultiModalContent(enhancedPrompt, {
              images: [{ data: base64Data, mimeType }]
            });
            response = (gen && gen.text) ? gen.text : '';
          }
        } catch (err) {
          console.error('[useChatActions] CradleCloud image analysis failed:', err);
          response = '';
        }
      } else {
        if (imageType === 'url') {
          response = await geminiAdapter.analyzeImage(
            { url: imageData },
            enhancedPrompt
          );
          
          try {
            const imageDataResult = await geminiAdapter.fetchImageAsBase64(imageData);
            const cacheResult = await ImageManager.cacheImage(imageDataResult.data, imageDataResult.mimeType);
            imageCacheId = cacheResult.id;
          } catch (error) {
            console.error('[useChatActions] Error caching URL image:', error);
            imageCacheId = imageData;
          }
        } else {
          let base64Data = imageData;
          let mimeType = imageType || 'image/jpeg';
          
          if (imageData.includes('base64,')) {
            base64Data = imageData.split('base64,')[1];
            mimeType = imageData.split(';')[0].replace('data:', '');
          }
          
          const cacheResult = await ImageManager.cacheImage(base64Data, mimeType);
          imageCacheId = cacheResult.id;
          
          response = await geminiAdapter.analyzeImage(
            { 
              data: base64Data,
              mimeType: mimeType
            },
            enhancedPrompt
          );
        }
      }
      
      const imageMessage = `![用户图片](image:${imageCacheId})`;
      
      console.log(`[useChatActions] Sending image message with ID: ${imageCacheId}`);
      await onSendMessage(imageMessage, "user");
      
      try {
        await StorageAdapter.addUserMessage(selectedConversationId, imageMessage);
        console.log(`[useChatActions] Image message saved to NodeST storage`);
      } catch (error) {
        console.error('[useChatActions] Failed to save image message to NodeST:', error);
      }
      
      // Send AI response directly when available. Do NOT create a bot placeholder beforehand.
      await new Promise(resolve => setTimeout(resolve, 300));

      if (response) {
        const processedResponse = applyRegexTools(response, 'ai');
        // Send the AI response directly (no placeholder/updateExisting)
        try {
          await onSendMessage(processedResponse, 'bot');
        } catch (e) {
          // onSendMessage may be sync or async; ignore send errors here but log
          console.error('[useChatActions] onSendMessage error sending AI response:', e);
        }

        try {
          await StorageAdapter.addAiMessage(selectedConversationId, processedResponse);
          console.log(`[useChatActions] AI response saved to NodeST storage`);
        } catch (error) {
          console.error('[useChatActions] Failed to save AI response to NodeST:', error);
        }
      } else {
        // No response: do not send any bot messages or placeholders. Just log.
        console.warn('[useChatActions] No AI response for image analysis; skipping bot message.');
      }
      
    } catch (error) {
      console.error('Error sending image:', error);


      try {
        if (botMessageId) {
          await onSendMessage('', 'bot', false, { updateExisting: true, targetMessageId: botMessageId, status: 'failed', isStreaming: false });
        }
      } catch (e) {
        // noop
      }
      // Intentionally do NOT save the human-readable error into NodeST storage to avoid it appearing in dialogs
    } finally {
      resetLoadingState();
    }
  }, [
    selectedConversationId,
    conversationId,
    selectedCharacter,
    user,
    updateState,
    applyRegexTools,
    onSendMessage,
    resetLoadingState
  ]);

  return {
    state,
    actions: {
      sendTextMessage,
      continueConversation,
      sendImage,
      handleAbortRequest,
      updateState,
      resetLoadingState,
    }
  };
};