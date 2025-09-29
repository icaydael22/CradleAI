import { useCallback, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Message, Character } from '@/shared/types';
import MessageService from '@/services/message-service';
import { useDialog } from '@/components/DialogProvider';

interface UseChatMessagesOptions {
  conversationId: string;
  character?: Character | null;
  user?: any;
  messages: Message[];
  onMessagesUpdate?: (messages: Message[]) => void;
  onEditAiMessage?: (messageId: string, aiIndex: number, newContent: string) => void;
  onDeleteAiMessage?: (messageId: string, aiIndex: number) => void;
  onEditUserMessage?: (messageId: string, messageIndex: number, newContent: string) => void;
  onDeleteUserMessage?: (messageId: string, messageIndex: number) => void;
  onRegenerateMessage?: (messageId: string, messageIndex: number) => void;
}

export const useChatMessages = ({
  conversationId,
  character,
  user,
  messages,
  onMessagesUpdate,
  onEditAiMessage,
  onDeleteAiMessage,
  onEditUserMessage,
  onDeleteUserMessage,
  onRegenerateMessage,
}: UseChatMessagesOptions) => {
  const dialog = useDialog();
  
  // State for edit modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [isEditingUser, setIsEditingUser] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // State for regenerate with rewrite opinion modal
  const [isRewriteModalVisible, setIsRewriteModalVisible] = useState(false);
  const [regeneratingMessage, setRegeneratingMessage] = useState<Message | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  
  // Copy message text functionality
  const copyMessageText = useCallback(async (text: string) => {
    try {
      // Remove HTML tags and special markings, keep pure text
      let cleanText = text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/!\[(.*?)\]\([^)]+\)/g, '$1') // Remove image markdown, keep alt text
        .replace(/\[(.*?)\]\([^)]+\)/g, '$1') // Remove link markdown, keep link text
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold marks
        .replace(/\*(.*?)\*/g, '$1') // Remove italic marks
        .replace(/`([^`]+)`/g, '$1') // Remove inline code marks
        .replace(/```[\s\S]*?```/g, '[代码块]') // Replace code blocks with identifier
        .trim();
      
      await Clipboard.setStringAsync(cleanText);
      await dialog.alert({ title: '复制成功', message: '消息文本已复制到剪贴板', icon: 'checkmark-circle-outline' });
    } catch (error) {
      console.error('复制失败:', error);
      await dialog.alert({ title: '复制失败', message: '无法复制消息文本', icon: 'alert-circle-outline' });
    }
  }, [dialog]);

  // Handle message copying
  const handleCopyMessage = useCallback((messageText: string) => {
    copyMessageText(messageText);
  }, [copyMessageText]);

  // Calculate backend-compatible index (excluding failed messages)
  // Note: This function is deprecated in the pagination implementation
  // and will be replaced with direct messageId-based operations
  const calculateBackendIndex = useCallback((messageIndex: number, isUser: boolean) => {
    console.warn('[useChatMessages] calculateBackendIndex is deprecated - operations now use messageId directly');
    const targetSender = isUser ? 'user' : 'bot';
    return messages
      .slice(0, messageIndex)
      .filter(m => m.sender === targetSender && m.status !== 'error')
      .length;
  }, [messages]);

  // Handle message editing
  const handleEditMessage = useCallback(async (messageId: string, isUser: boolean, newContent: string) => {
    // Skip editing if message has error status
    const message = messages.find(m => m.id === messageId);
    if (message?.status === 'error') {
      await dialog.alert({ title: '无法编辑', message: '错误状态的消息无法编辑，请重新发送', icon: 'alert-circle-outline' });
      return;
    }

    try {
      let result;
      
      // Use a dummy index since MessageService.findMessageRoleIndex will find the correct index by messageId
      const DUMMY_INDEX = 0;
      
      if (isUser) {
        result = await MessageService.handleEditUserMessage(
          messageId,
          DUMMY_INDEX, // MessageService will use messageId to find the correct index
          newContent,
          conversationId,
          messages
        );
      } else {
        result = await MessageService.handleEditAIMessage(
          messageId,
          DUMMY_INDEX, // MessageService will use messageId to find the correct index
          newContent,
          conversationId,
          messages
        );
      }
      
      if (result.success && result.messages) {
        onMessagesUpdate?.(result.messages);
        await dialog.alert({ title: '编辑成功', message: '消息已成功编辑', icon: 'checkmark-circle-outline' });
      } else {
        await dialog.alert({ title: '编辑失败', message: '无法编辑消息，请重试', icon: 'alert-circle-outline' });
      }
    } catch (error) {
      console.error('编辑消息失败:', error);
      await dialog.alert({ title: '编辑失败', message: '编辑消息时发生错误', icon: 'alert-circle-outline' });
    }
  }, [conversationId, messages, onMessagesUpdate, dialog]);

  // Handle message deletion
  const handleDeleteMessage = useCallback(async (messageId: string, isUser: boolean) => {
  // Allow deleting even if message has error status; we'll remove from UI in that case
  const message = messages.find(m => m.id === messageId);

    const ok = await dialog.confirm({
      title: '确认删除',
      message: '确定要删除这条消息吗？',
      destructive: true,
      icon: 'trash-outline',
      confirmText: '删除',
      cancelText: '取消',
    });

    if (!ok) return;

    try {
      // If it's an error message, remove locally without calling backend
      if (message?.status === 'error') {
        const updated = messages.filter(m => m.id !== messageId);
        onMessagesUpdate?.(updated);
        // notify optional callbacks with a dummy index for compatibility
        const DUMMY_INDEX = 0;
        if (isUser) {
          onDeleteUserMessage?.(messageId, DUMMY_INDEX);
        } else {
          onDeleteAiMessage?.(messageId, DUMMY_INDEX);
        }
        await dialog.alert({ title: '删除成功', message: '已从界面移除失败消息', icon: 'checkmark-circle-outline' });
        return;
      }
      let result;
      
      // Use a dummy index since MessageService.findMessageRoleIndex will find the correct index by messageId
      const DUMMY_INDEX = 0;
      
      if (isUser) {
        result = await MessageService.handleDeleteUserMessage(
          messageId,
          DUMMY_INDEX, // MessageService will use messageId to find the correct index
          conversationId,
          messages
        );
        onDeleteUserMessage?.(messageId, DUMMY_INDEX);
      } else {
        result = await MessageService.handleDeleteAIMessage(
          messageId,
          DUMMY_INDEX, // MessageService will use messageId to find the correct index
          conversationId,
          messages
        );
        onDeleteAiMessage?.(messageId, DUMMY_INDEX);
      }
      
      if (result.success && result.messages) {
        onMessagesUpdate?.(result.messages);
        await dialog.alert({ title: '删除成功', message: '消息已成功删除', icon: 'checkmark-circle-outline' });
      } else {
        // Fallback: remove from UI even if backend fails
        const updated = messages.filter(m => m.id !== messageId);
        onMessagesUpdate?.(updated);
        await dialog.alert({ title: '删除成功', message: '消息已成功删除', icon: 'checkmark-circle-outline' });
      }
    } catch (error) {
      console.error('删除消息失败:', error);
      // Fallback: remove from UI on error as well
      const updated = messages.filter(m => m.id !== messageId);
      onMessagesUpdate?.(updated);
      await dialog.alert({ title: '删除成功', message: '消息已成功删除', icon: 'checkmark-circle-outline' });
    }
  }, [conversationId, messages, onMessagesUpdate, onDeleteUserMessage, onDeleteAiMessage, dialog]);

  // Handle message regeneration
  const handleRegenerateMessage = useCallback(async (messageId: string, rewriteOpinion?: string) => {
    // Skip regenerating if message has error status
    const message = messages.find(m => m.id === messageId);
    if (message?.status === 'error') {
      await dialog.alert({ title: '无法重新生成', message: '错误状态的消息无法重新生成，请重新发送', icon: 'alert-circle-outline' });
      return;
    }

    try {
      if (!character) {
        await dialog.alert({ title: '重新生成失败', message: '未找到角色信息', icon: 'alert-circle-outline' });
        return;
      }
      
      console.log('[useChatMessages] Starting message regeneration for:', messageId);
      setIsRegenerating(true);
      
      // Use a dummy index since MessageService.findMessageRoleIndex will find the correct index by messageId
      const DUMMY_INDEX = 0;
      
      const result = await MessageService.handleRegenerateMessage(
        messageId,
        DUMMY_INDEX, // MessageService will use messageId to find the correct index
        conversationId,
        messages,
        character,
        user,
        rewriteOpinion // Pass rewrite opinion
      );
      
      if (result.success && result.messages) {
        console.log('[useChatMessages] Regeneration successful, updating messages');
        
        // 先更新消息列表
        onMessagesUpdate?.(result.messages);
        onRegenerateMessage?.(messageId, DUMMY_INDEX);
        
        // 强制刷新界面状态，等待更长时间确保 UI 完全更新
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log('[useChatMessages] Regeneration UI update completed');
        await dialog.alert({ title: '重新生成成功', message: '消息已成功重新生成', icon: 'checkmark-circle-outline' });
      } else {
        console.error('[useChatMessages] Regeneration failed:', result);
        await dialog.alert({ title: '重新生成失败', message: '无法重新生成消息，请重试', icon: 'alert-circle-outline' });
      }
    } catch (error) {
      console.error('重新生成消息失败:', error);
      await dialog.alert({ title: '重新生成失败', message: '重新生成消息时发生错误', icon: 'alert-circle-outline' });
    } finally {
      console.log('[useChatMessages] Regeneration process completed, resetting states');
      setIsRegenerating(false);
    }
  }, [conversationId, messages, character, user, onMessagesUpdate, onRegenerateMessage, dialog]);

  // Handle specific edit operations - open edit modal
  const handleEditButton = useCallback((message: Message, isUser: boolean) => {
    setEditingMessage(message);
    setEditingIndex(-1); // No longer needed, kept for compatibility
    setIsEditingUser(isUser);
    setIsEditModalVisible(true);
  }, []);
  
  // Handle specific delete operations
  const handleDeleteButton = useCallback((message: Message, isUser: boolean) => {
    handleDeleteMessage(message.id, isUser);
  }, [handleDeleteMessage]);
  
  // Handle specific regenerate operations
  const handleRegenerateButton = useCallback((message: Message) => {
    setRegeneratingMessage(message);
    setIsRewriteModalVisible(true);
  }, []);
  
  // Handle regenerate with rewrite opinion
  const handleRegenerateWithOpinion = useCallback(async (rewriteOpinion: string) => {
    if (!regeneratingMessage) return;
    
    console.log('[useChatMessages] Starting regeneration with opinion');
    setIsRewriteModalVisible(false);
    
    try {
      await handleRegenerateMessage(regeneratingMessage.id, rewriteOpinion);
    } catch (error) {
      console.error('[useChatMessages] Error in regeneration with opinion:', error);
    } finally {
      // 确保在所有情况下都重置状态
      console.log('[useChatMessages] Resetting regeneration states');
      setRegeneratingMessage(null);
      setIsRewriteModalVisible(false);
      
      // 强制触发一次 UI 刷新
      setTimeout(() => {
        if (onMessagesUpdate && messages) {
          onMessagesUpdate([...messages]);
        }
      }, 100);
    }
  }, [regeneratingMessage, handleRegenerateMessage, onMessagesUpdate, messages]);
  
  // Handle regenerate without opinion (direct regenerate)
  const handleRegenerateWithoutOpinion = useCallback(async () => {
    if (!regeneratingMessage) return;
    
    console.log('[useChatMessages] Starting regeneration without opinion');
    setIsRewriteModalVisible(false);
    
    try {
      await handleRegenerateMessage(regeneratingMessage.id);
    } catch (error) {
      console.error('[useChatMessages] Error in regeneration without opinion:', error);
    } finally {
      // 确保在所有情况下都重置状态
      console.log('[useChatMessages] Resetting regeneration states');
      setRegeneratingMessage(null);
      setIsRewriteModalVisible(false);
      
      // 强制触发一次 UI 刷新
      setTimeout(() => {
        if (onMessagesUpdate && messages) {
          onMessagesUpdate([...messages]);
        }
      }, 100);
    }
  }, [regeneratingMessage, handleRegenerateMessage, onMessagesUpdate, messages]);
  
  // Handle cancel regenerate modal
  const handleCancelRegenerate = useCallback(() => {
    setIsRewriteModalVisible(false);
    setRegeneratingMessage(null);
  }, []);
  
  // Handle edit modal save
  const handleEditModalSave = useCallback(async (newContent: string) => {
    if (!editingMessage || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      await handleEditMessage(editingMessage.id, isEditingUser, newContent);
      
      // Close modal
      setIsEditModalVisible(false);
      setEditingMessage(null);
      setEditingIndex(-1);
      setIsEditingUser(false);
    } catch (error) {
      console.error('编辑失败:', error);
      await dialog.alert({ title: '编辑失败', message: '保存编辑时发生错误', icon: 'alert-circle-outline' });
    } finally {
      setIsProcessing(false);
    }
  }, [editingMessage, isEditingUser, isProcessing, handleEditMessage, dialog]);

  // Handle edit modal cancel
  const handleEditModalCancel = useCallback(() => {
    setIsEditModalVisible(false);
    setEditingMessage(null);
    setEditingIndex(-1);
    setIsEditingUser(false);
  }, []);
  
  // 新增：流式更新消息内容
  const onStreamUpdate = useCallback((messageId: string, textChunk: string) => {
    if (!messageId || !textChunk) return;
    
    // 找到目标消息并追加文本块
    const updatedMessages = messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          text: (msg.text || '') + textChunk,
          isLoading: true // 保持加载状态直到流式完成
        };
      }
      return msg;
    });
    
    // 触发消息更新
    if (onMessagesUpdate) {
      onMessagesUpdate(updatedMessages);
    }
  }, [messages, onMessagesUpdate]);

  // 新增：完成流式消息更新
  const onStreamComplete = useCallback((messageId: string, finalText?: string) => {
    if (!messageId) return;
    
    const updatedMessages = messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          text: finalText || msg.text || '',
          isLoading: false, // 移除加载状态
          status: 'sent' as const
        };
      }
      return msg;
    });
    
    // 触发消息更新
    if (onMessagesUpdate) {
      onMessagesUpdate(updatedMessages);
    }
  }, [messages, onMessagesUpdate]);

  return {
    // Core actions
    copyMessageText,
    handleCopyMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleRegenerateMessage,
    handleEditButton,
    handleDeleteButton,
    handleRegenerateButton,
    
    // Edit modal state
    isEditModalVisible,
    editingMessage,
    editingIndex,
    isEditingUser,
    isProcessing,
    handleEditModalSave,
    handleEditModalCancel,
    
    // Stream update functions
    onStreamUpdate,
    onStreamComplete,
    
    // Rewrite modal state and functions
    isRewriteModalVisible,
    regeneratingMessage,
    isRegenerating,
    handleRegenerateWithOpinion,
    handleRegenerateWithoutOpinion,
    handleCancelRegenerate,
  };
};
