import { useEffect, useCallback, useMemo, useRef } from 'react';
import { Character, Message } from '@/shared/types';
import AutoMessageService, { AutoMessageConfig } from '@/services/automessage-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import { sendAutoMessageNotification } from '@/services/notification-service';

interface UseAutoMessageProps {
  selectedCharacter: Character | null;
  selectedConversationId: string | null;
  userId: string | null;
  messages: Message[];
  isPageVisible: boolean;
  addMessage: (conversationId: string, message: Message) => Promise<void>;
  updateUnreadMessagesCount: (count: number) => void;
  handleMessagesRefresh?: (conversationId: string) => Promise<void>;
}

export const useAutoMessage = ({
  selectedCharacter,
  selectedConversationId,
  userId,
  messages,
  isPageVisible,
  addMessage,
  updateUnreadMessagesCount,
  handleMessagesRefresh,
}: UseAutoMessageProps) => {
  // Memoize the auto message service instance
  const autoMessageService = useMemo(() => {
    console.log('[Performance] Creating AutoMessageService instance');
    return AutoMessageService.getInstance();
  }, []);

  // Use refs to track previous values and avoid unnecessary re-runs
  const prevMessageLengthRef = useRef(messages.length);
  const prevCharacterIdRef = useRef(selectedCharacter?.id);
  const prevUserIdRef = useRef(userId);

  // Stable callback for auto message configuration
  const configureAutoMessage = useCallback(() => {
    if (!selectedCharacter?.autoMessage || 
        !selectedCharacter.autoMessageInterval || 
        !selectedConversationId || 
        !userId ||
        !isPageVisible) {
      
      // Clear auto message if conditions are not met
      if (selectedCharacter?.id) {
        autoMessageService.clearAutoMessage(selectedCharacter.id);
      }
      return;
    }

    // Only reconfigure if key dependencies have actually changed
    const hasCharacterChanged = prevCharacterIdRef.current !== selectedCharacter.id;
    const hasUserChanged = prevUserIdRef.current !== userId;
    const hasMessageCountChanged = prevMessageLengthRef.current !== messages.length;

    if (hasCharacterChanged || hasUserChanged || hasMessageCountChanged) {
      console.log('[AutoMessage] Configuring auto message service', {
        characterId: selectedCharacter.id,
        messageCount: messages.length,
        hasCharacterChanged,
        hasUserChanged,
        hasMessageCountChanged
      });

      const config: AutoMessageConfig = {
        enabled: true,
        intervalMinutes: selectedCharacter.autoMessageInterval,
        characterId: selectedCharacter.id,
        conversationId: selectedConversationId,
        character: selectedCharacter,
        user: { id: userId },
        messages,
        onMessageAdded: addMessage,
        onUnreadCountUpdate: updateUnreadMessagesCount,
        onMessagesRefresh: handleMessagesRefresh,
      };

      autoMessageService.setupAutoMessage(config);

      // Update refs
      prevMessageLengthRef.current = messages.length;
      prevCharacterIdRef.current = selectedCharacter.id;
      prevUserIdRef.current = userId;
    }
  }, [
    selectedCharacter?.id,
    selectedCharacter?.autoMessage,
    selectedCharacter?.autoMessageInterval,
    selectedConversationId,
    userId,
    messages.length, // Only track length, not full array
    messages, // Still need full array for the service
    addMessage,
    updateUnreadMessagesCount,
    autoMessageService,
    handleMessagesRefresh,
    isPageVisible
  ]);

  // Effect to configure auto message with optimized dependencies
  useEffect(() => {
    configureAutoMessage();
  }, [configureAutoMessage]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (selectedCharacter?.id) {
        autoMessageService.clearAutoMessage(selectedCharacter.id);
      }
    };
  }, [autoMessageService, selectedCharacter?.id]);

  return {
    autoMessageService,
    configureAutoMessage,
  };
};
