import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Message, Character, ChatSave } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { ChatMessage } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper function to convert ChatMessage to Message
const convertChatMessageToMessage = (chatMessage: ChatMessage): Message => {
  return {
    id: chatMessage.id || `msg_${Date.now()}_${Math.random()}`,
    text: chatMessage.parts?.[0]?.text || '',
    sender: chatMessage.role === 'user' ? 'user' : 'bot',
    timestamp: chatMessage.timestamp || Date.now(),
    status: 'sent',
    metadata: {
      messageIndex: chatMessage.messageIndex,
      role: chatMessage.role,
      is_first_mes: chatMessage.is_first_mes,
      is_d_entry: chatMessage.is_d_entry,
    }
  };
};

export interface ChatState {
  selectedConversationId: string | null;
  messages: Message[];
  fallbackCharacter: Character | null;
  regeneratingMessageId: string | null;
  isSendingMessage: boolean;
  
  // Preview state
  previewMessages: Message[] | null;
  currentPreviewSave: ChatSave | null;
  
  // Auto message
  autoMessageInputText: string | null;
  
  // Scroll positions
  chatScrollPositions: Record<string, number>;
  
  // Processing state
  processedImageUrls: Set<string>;
  
  // Pagination state
  currentPage: number;
  isLoadingMore: boolean;
  hasMoreMessages: boolean;
  totalPages: number;
  totalMessages: number;
}

interface ChatActions {
  setSelectedConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  setFallbackCharacter: (character: Character | null) => void;
  setRegeneratingMessageId: (id: string | null) => void;
  setIsSendingMessage: (sending: boolean) => void;
  setPreviewMessages: (messages: Message[] | null) => void;
  setCurrentPreviewSave: (save: ChatSave | null) => void;
  setAutoMessageInputText: (text: string | null) => void;
  updateScrollPosition: (conversationId: string, position: number) => void;
  addProcessedImageUrl: (url: string) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  addMessageOptimistically: (message: Message) => void;
  removeMessageOptimistically: (messageId: string) => void;
  updateMessageStatus: (messageId: string, status: 'sending' | 'sent' | 'error', error?: string) => void;
  
  // Pagination actions
  loadMoreMessages: () => Promise<void>;
  resetPagination: () => void;
}

const initialChatState: ChatState = {
  selectedConversationId: null,
  messages: [],
  fallbackCharacter: null,
  regeneratingMessageId: null,
  isSendingMessage: false,
  previewMessages: null,
  currentPreviewSave: null,
  autoMessageInputText: null,
  chatScrollPositions: {},
  processedImageUrls: new Set(),
  // Pagination state
  currentPage: 1,
  isLoadingMore: false,
  hasMoreMessages: true,
  totalPages: 0,
  totalMessages: 0,
};

export const useChatState = (): [ChatState, ChatActions] => {
  const [state, setState] = useState<ChatState>(initialChatState);
  const { getMessages } = useCharacters();
  
  // Scroll position update timeout ref
  const scrollPositionUpdateTimeoutRef = useRef<any>(null);

  const setSelectedConversationId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedConversationId: id }));
  }, []);

  const setMessages = useCallback((messages: Message[]) => {
    setState(prev => ({ ...prev, messages }));
  }, []);

  const setFallbackCharacter = useCallback((character: Character | null) => {
    setState(prev => ({ ...prev, fallbackCharacter: character }));
  }, []);

  const setRegeneratingMessageId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, regeneratingMessageId: id }));
  }, []);

  const setIsSendingMessage = useCallback((sending: boolean) => {
    setState(prev => ({ ...prev, isSendingMessage: sending }));
  }, []);

  const setPreviewMessages = useCallback((messages: Message[] | null) => {
    setState(prev => ({ ...prev, previewMessages: messages }));
  }, []);

  const setCurrentPreviewSave = useCallback((save: ChatSave | null) => {
    setState(prev => ({ ...prev, currentPreviewSave: save }));
  }, []);

  const setAutoMessageInputText = useCallback((text: string | null) => {
    setState(prev => ({ ...prev, autoMessageInputText: text }));
  }, []);

  const updateScrollPosition = useCallback((conversationId: string, position: number) => {
    // Debounce scroll position updates
    if (scrollPositionUpdateTimeoutRef.current) {
      clearTimeout(scrollPositionUpdateTimeoutRef.current);
    }
    
    scrollPositionUpdateTimeoutRef.current = setTimeout(() => {
      setState(prev => ({
        ...prev,
        chatScrollPositions: {
          ...prev.chatScrollPositions,
          [conversationId]: position
        }
      }));
    }, 100);
  }, []);

  const addProcessedImageUrl = useCallback((url: string) => {
    setState(prev => ({
      ...prev,
      processedImageUrls: new Set([...prev.processedImageUrls, url])
    }));
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    
    try {
      // Reset pagination and load first page
      setState(prev => ({ 
        ...prev, 
        currentPage: 1, 
        isLoadingMore: false, 
        hasMoreMessages: true,
        totalPages: 0,
        totalMessages: 0
      }));
      
      const { messages: chatMessages, totalMessages, totalPages, currentPage } = await StorageAdapter.getPaginatedCleanChatHistory(conversationId, 1, 15);
      
      // Convert ChatMessage[] to Message[]
      const messages = chatMessages.map(convertChatMessageToMessage);
      
      setState(prev => ({ 
        ...prev, 
        messages,
        currentPage,
        totalPages,
        totalMessages,
        hasMoreMessages: currentPage < totalPages
      }));
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!state.selectedConversationId || state.isLoadingMore || !state.hasMoreMessages) return;

    setState(prev => ({ ...prev, isLoadingMore: true }));
    
    try {
      const nextPage = state.currentPage + 1;
      const { messages: newChatMessages, totalPages } = await StorageAdapter.getPaginatedCleanChatHistory(
        state.selectedConversationId, 
        nextPage, 
        15
      );

      if (newChatMessages.length > 0) {
        // Convert ChatMessage[] to Message[]
        const newMessages = newChatMessages.map(convertChatMessageToMessage);
        
        // 将旧消息预置到列表的顶部
        setState(prev => ({
          ...prev,
          messages: [...newMessages, ...prev.messages],
          currentPage: nextPage,
          hasMoreMessages: nextPage < totalPages,
          isLoadingMore: false
        }));
      } else {
        setState(prev => ({ 
          ...prev, 
          hasMoreMessages: false, 
          isLoadingMore: false 
        }));
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
      setState(prev => ({ ...prev, isLoadingMore: false }));
    }
  }, [state.selectedConversationId, state.currentPage, state.isLoadingMore, state.hasMoreMessages]);

  const resetPagination = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentPage: 1,
      isLoadingMore: false,
      hasMoreMessages: true,
      totalPages: 0,
      totalMessages: 0
    }));
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!state.selectedConversationId) return;
    await loadMessages(state.selectedConversationId);
  }, [state.selectedConversationId, loadMessages]);

  const addMessageOptimistically = useCallback((message: Message) => {
    setState(prev => ({ 
      ...prev, 
      messages: [...prev.messages, message]
    }));
  }, []);

  const removeMessageOptimistically = useCallback((messageId: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(msg => msg.id !== messageId)
    }));
  }, []);

  const updateMessageStatus = useCallback((messageId: string, status: 'sending' | 'sent' | 'error', error?: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(msg => 
        msg.id === messageId 
          ? { ...msg, status, error } 
          : msg
      )
    }));
  }, []);

  // Load auto message input text on mount
  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      try {
        const configStr = await AsyncStorage.getItem('auto_message_prompt_config');
        if (isMounted) {
          if (configStr) {
            const config = JSON.parse(configStr);
            setAutoMessageInputText(config.inputText || null);
          } else {
            // Fallback to UtilSettings defaults
            try {
              const { defaultAutoMessagePromptConfig } = require('@/constants/utilDefaults');
              setAutoMessageInputText(defaultAutoMessagePromptConfig.inputText || null);
            } catch {
              setAutoMessageInputText(null);
            }
          }
        }
      } catch {
        if (isMounted) {
          try {
            const { defaultAutoMessagePromptConfig } = require('@/constants/utilDefaults');
            setAutoMessageInputText(defaultAutoMessagePromptConfig.inputText || null);
          } catch {
            setAutoMessageInputText(null);
          }
        }
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const actions: ChatActions = {
    setSelectedConversationId,
    setMessages,
    setFallbackCharacter,
    setRegeneratingMessageId,
    setIsSendingMessage,
    setPreviewMessages,
    setCurrentPreviewSave,
    setAutoMessageInputText,
    updateScrollPosition,
    addProcessedImageUrl,
    loadMessages,
    refreshMessages,
    addMessageOptimistically,
    removeMessageOptimistically,
    updateMessageStatus,
    loadMoreMessages,
    resetPagination,
  };

  return [state, actions];
};
