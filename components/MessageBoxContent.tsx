import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Character } from '@/shared/types';
import { MessageBoxItem } from '@/shared/types/relationship-types';

interface MessageBoxContentProps {
  character: Character;
  onUpdateCharacter: (character: Character) => Promise<void>;
}

const MessageBoxContent: React.FC<MessageBoxContentProps> = ({ character, onUpdateCharacter }) => {
  const [isMarking, setIsMarking] = useState(false);
  const messageBox = character.messageBox || [];
  
  // Check if there are any unread messages
  const hasUnreadMessages = messageBox.some(msg => !msg.read);
  
  const handleMarkAllAsRead = async () => {
    if (!character.messageBox || character.messageBox.length === 0) return;
    
    setIsMarking(true);
    
    try {
      const updatedMessages = character.messageBox.map(msg => ({
        ...msg,
        read: true
      }));
      
      await onUpdateCharacter({
        ...character,
        messageBox: updatedMessages
      });
    } catch (error) {
      console.error('标记消息已读失败:', error);
    } finally {
      setIsMarking(false);
    }
  };
  
  const getTypeIndicatorStyle = (type: string) => {
    switch (type) {
      case 'post': return styles.postIndicator;
      case 'comment': return styles.commentIndicator;
      case 'like': return styles.likeIndicator;
      case 'action': return styles.actionIndicator;
      case 'reply': return styles.replyIndicator;
      default: return {};
    }
  };
  
  const getTypeText = (type: string) => {
    switch (type) {
      case 'post': return '帖子';
      case 'comment': return '评论';
      case 'like': return '点赞';
      case 'action': return '行动';
      case 'reply': return '回复';
      case 'relationship_request': return '关系请求';
      case 'invitation': return '邀请';
      case 'alert': return '提醒';
      case 'message': return '消息';
      default: return '消息';
    }
  };
  
  if (messageBox.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="mail-outline" size={48} color="#555" />
        <Text style={styles.emptyText}>暂无消息</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {hasUnreadMessages && (
        <TouchableOpacity 
          style={styles.markAllButton}
          onPress={handleMarkAllAsRead}
          disabled={isMarking}
        >
          {isMarking ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={styles.markAllText}>标记所有为已读</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      
      <FlatList
        data={messageBox.sort((a, b) => b.timestamp - a.timestamp)}
        renderItem={({ item }) => (
          <View style={[
            styles.messageItem,
            !item.read && styles.unreadMessage
          ]}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageSender}>{item.senderName}</Text>
              <Text style={styles.messageTime}>
                {format(new Date(item.timestamp), 'yyyy-MM-dd HH:mm')}
              </Text>
              {!item.read && (
                <View style={styles.unreadIndicator}>
                  <Text style={styles.unreadText}>未读</Text>
                </View>
              )}
            </View>
            
            <View style={styles.messageTypeContainer}>
              <View style={[
                styles.typeIndicator,
                getTypeIndicatorStyle(item.type)
              ]}>
                <Text style={styles.typeText}>
                  {getTypeText(item.type)}
                </Text>
              </View>
            </View>
            
            <Text style={styles.messageContent}>{item.content}</Text>
            
            {item.contextContent && (
              <View style={styles.contextContainer}>
                <Text style={styles.contextLabel}>相关内容：</Text>
                <Text style={styles.contextContent}>{item.contextContent}</Text>
              </View>
            )}
          </View>
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
  },
  list: {
    padding: 16,
    // Add this to ensure list takes full height
    minHeight: '100%',
  },
  messageItem: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  unreadMessage: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF9ECD',
    backgroundColor: 'rgba(255, 156, 205, 0.15)',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageSender: {
    color: '#FF9ECD',
    fontWeight: '600',
    fontSize: 16,
  },
  messageTime: {
    color: '#999',
    fontSize: 12,
  },
  unreadIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FF9ECD',
    borderRadius: 10,
  },
  unreadText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  messageTypeContainer: {
    marginBottom: 12,
  },
  typeIndicator: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#444',
  },
  typeText: {
    color: 'white',
    fontSize: 12,
  },
  postIndicator: {
    backgroundColor: '#2196F3', // Blue
  },
  commentIndicator: {
    backgroundColor: '#4CAF50', // Green
  },
  likeIndicator: {
    backgroundColor: '#E91E63', // Pink
  },
  actionIndicator: {
    backgroundColor: '#FF9800', // Orange
  },
  replyIndicator: {
    backgroundColor: '#9C27B0', // Purple
  },
  messageContent: {
    color: '#fff',
    fontSize: 15,
  },
  contextContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  contextLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  contextContent: {
    color: '#ddd',
    fontSize: 14,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
    padding: 10,
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
  },
  markAllText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
});

export default MessageBoxContent;