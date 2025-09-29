import React, { memo, useCallback, useMemo } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import GroupDialog from '@/components/group/GroupDialog';
import GroupInput from '@/components/group/GroupInput';
import { GroupMessage } from '@/src/group/group-types';
import { Character, User } from '@/shared/types';

interface GroupInterfaceProps {
  groupId: string;
  messages: GroupMessage[];
  groupMembers: Character[];
  currentUser: User;
  isSendingMessage?: boolean;
  isKeyboardVisible?: boolean;
  onSendMessage: (text: string) => void;
  onScrollPositionChange?: (groupId: string, position: number) => void;
  topBarHeight?: number;
  isGroupDisbanded?: boolean;
  onGroupDisbanded?: (disbandedGroupId: string) => void;
}

const GroupInterface = memo<GroupInterfaceProps>(({
  groupId,
  messages,
  groupMembers,
  currentUser,
  isSendingMessage = false,
  isKeyboardVisible = false,
  onSendMessage,
  onScrollPositionChange,
  topBarHeight = 0,
  isGroupDisbanded = false,
  onGroupDisbanded,
}) => {
  const handleSendMessage = useCallback((text: string) => {
    if (text.trim() && !isSendingMessage && !isGroupDisbanded) {
      onSendMessage(text);
    }
  }, [onSendMessage, isSendingMessage, isGroupDisbanded]);

  const memoizedMessages = useMemo(() => messages, [messages]);
  const memoizedGroupMembers = useMemo(() => groupMembers, [groupMembers]);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: topBarHeight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.chatContainer}>
        <GroupDialog
          groupId={groupId}
          messages={memoizedMessages}
          groupMembers={memoizedGroupMembers}
          currentUser={currentUser}
          onScrollPositionChange={onScrollPositionChange}
          isGroupDisbanded={isGroupDisbanded}
          onGroupDisbanded={onGroupDisbanded}
        />
      </View>
      
      <View style={[
        styles.inputContainer,
        isKeyboardVisible && styles.inputContainerKeyboard
      ]}>
        {!isGroupDisbanded && (
          <GroupInput
            groupId={groupId}
            currentUser={currentUser}
            groupMembers={memoizedGroupMembers}
            onSendMessage={handleSendMessage}
            isLoading={isSendingMessage}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
});

GroupInterface.displayName = 'GroupInterface';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  inputContainerKeyboard: {
    paddingBottom: 8,
  },
});

export default GroupInterface;
