import React from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Message, MessageItemProps } from '@/shared/types';
import { useUser } from '@/constants/UserContext';
import { Ionicons } from '@expo/vector-icons';

const MessageItem: React.FC<MessageItemProps> = ({ message, selectedCharacter }) => {
  const { user } = useUser();
  const isBotMessage = message.sender !== 'user';
  const showAvatar = isBotMessage ? selectedCharacter?.avatar : user?.avatar;

  return (
    <View
      style={[
        styles.messageContainer,
        isBotMessage ? styles.botMessage : styles.userMessage,
      ]}
    >
      {isBotMessage && (
        showAvatar ? (
          <Image
            source={typeof showAvatar === 'string' ? { uri: showAvatar } : showAvatar}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.iconContainer]}>
            <Ionicons name="person-circle" size={30} color="#777777" />
          </View>
        )
      )}
      {message.isLoading ? (
        <ActivityIndicator size="small" color="#0000ff" />
      ) : (
        <Text style={styles.messageText}>{message.text}</Text>
      )}
      {!isBotMessage && (
        showAvatar ? (
          <Image
            source={typeof showAvatar === 'string' ? { uri: showAvatar } : showAvatar}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.iconContainer]}>
            <Ionicons name="person-circle" size={30} color="#777777" />
          </View>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 5,
    maxWidth: '80%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
    flexDirection: 'row-reverse', // Reverse direction for user messages
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECECEC',
  },
  messageText: {
    fontSize: 16,
    flexShrink: 1,
    marginHorizontal: 10, // Add margin on both sides for avatar spacing
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
});

export default MessageItem;