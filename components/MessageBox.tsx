import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { MessageBoxItem } from '@/shared/types/relationship-types';

interface MessageBoxProps {
  character: Character;
  onUpdateCharacter: (character: Character) => void;
}

const MessageBox: React.FC<MessageBoxProps> = ({ character, onUpdateCharacter }) => {
  const [messages, setMessages] = useState<MessageBoxItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load messages when component mounts
  useEffect(() => {
    setMessages(character.messageBox || []);
  }, [character]);

  // Mark message as read
  const handleMarkAsRead = (messageId: string) => {
    const updatedMessages = messages.map(msg => 
      msg.id === messageId ? { ...msg, read: true } : msg
    );
    
    setMessages(updatedMessages);
    
    const updatedCharacter = {
      ...character,
      messageBox: updatedMessages
    };
    
    onUpdateCharacter(updatedCharacter);
  };

  // Mark all messages as read
  const handleMarkAllAsRead = () => {
    if (!messages.length) return;
    
    const updatedMessages = messages.map(msg => ({ ...msg, read: true }));
    setMessages(updatedMessages);
    
    const updatedCharacter = {
      ...character,
      messageBox: updatedMessages
    };
    
    onUpdateCharacter(updatedCharacter);
    Alert.alert('成功', '已将所有消息标记为已读');
  };

  // Clear all messages
  const handleClearAll = () => {
    if (!messages.length) return;
    
    Alert.alert(
      '清空消息',
      '确定要清空所有消息吗？此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '确定', 
          style: 'destructive',
          onPress: () => {
            setMessages([]);
            const updatedCharacter = {
              ...character,
              messageBox: []
            };
            onUpdateCharacter(updatedCharacter);
          }
        }
      ]
    );
  };

  // Get message icon based on type
  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Ionicons name="heart" size={24} color="#FF4488" />;
      case 'comment':
        return <Ionicons name="chatbubble" size={24} color="#44AAFF" />;
      case 'reply':
        return <Ionicons name="return-up-back" size={24} color="#44DDFF" />;
      case 'relationship_request':
        return <Ionicons name="people" size={24} color="#FF9ECD" />;
      case 'invitation':
        return <Ionicons name="mail" size={24} color="#FFAA44" />;
      case 'alert':
        return <Ionicons name="alert-circle" size={24} color="#FF4444" />;
      default:
        return <Ionicons name="chatbox" size={24} color="#AAAAAA" />;
    }
  };

  // Get formatted date
  const getFormattedDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Render a message item
  const renderMessageItem = ({ item }: { item: MessageBoxItem }) => (
    <TouchableOpacity
      style={[styles.messageItem, !item.read && styles.unreadMessage]}
      onPress={() => handleMarkAsRead(item.id)}
    >
      <View style={styles.messageIconContainer}>
        {getMessageIcon(item.type)}
      </View>
      
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <Text style={styles.senderName}>{item.senderName}</Text>
          <Text style={styles.timestamp}>{getFormattedDate(item.timestamp)}</Text>
        </View>
        
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>消息盒子</Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearAll}>
          <Text style={styles.clearButtonText}>清空</Text>
        </TouchableOpacity>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282828', // Changed to dark background
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444', // Darker border for dark mode
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF', // White text for dark mode
  },
  clearButton: {
    padding: 8,
  },
  clearButtonText: {
    color: '#FF4444', // Keep red for danger
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888',
  },
  messageList: {
    padding: 16,
  },
  messageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444', // Darker border
    backgroundColor: '#333', // Darker background
    borderRadius: 8,
    marginBottom: 8,
  },
  unreadMessage: {
    backgroundColor: '#424242', // Slightly different background for unread
  },
  messageIconContainer: {
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF', // White text
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
  },
  messageText: {
    fontSize: 14,
    color: '#DADADA', // Light gray text
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default MessageBox;
