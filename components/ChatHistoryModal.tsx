import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message, Character, User } from '@/shared/types';
import MessageItem from '@/components/message-renderers/MessageItem';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';

const { width, height } = Dimensions.get('window');

interface ChatHistoryModalProps {
  visible: boolean;
  messages: Message[];
  onClose: () => void;
  selectedCharacter?: Character | null;
  user?: User | null;
  uiSettings?: ChatUISettings;
}

const DEFAULT_UI_SETTINGS: ChatUISettings = {
  regularUserBubbleColor: 'rgb(255, 224, 195)',
  regularUserBubbleAlpha: 0.95,
  regularBotBubbleColor: 'rgb(30, 20, 20)',
  regularBotBubbleAlpha: 0.85,
  regularUserTextColor: '#333333',
  regularBotTextColor: '#ffffff',
  bgUserBubbleColor: 'rgb(255, 224, 195)',
  bgUserBubbleAlpha: 0.95,
  bgBotBubbleColor: 'rgb(68, 68, 68)',
  bgBotBubbleAlpha: 0.9,
  bgUserTextColor: '#333333',
  bgBotTextColor: '#ffffff',
  vnDialogColor: 'rgb(0, 0, 0)',
  vnDialogAlpha: 0.7,
  vnTextColor: '#ffffff',
  bubblePaddingMultiplier: 1.0,
  textSizeMultiplier: 1.0,
  markdownHeadingColor: '#ff79c6',
  markdownCodeBackgroundColor: '#111',
  markdownCodeTextColor: '#fff',
  markdownQuoteColor: '#d0d0d0',
  markdownQuoteBackgroundColor: '#111',
  markdownLinkColor: '#3498db',
  markdownBoldColor: '#ff79c6',
  markdownTextColor: '#fff',
  markdownTextScale: 1.0,
  markdownCodeScale: 1.0,
  // narration-related settings required by ChatUISettings
  narrationBubbleColor: 'rgb(230, 230, 230)',
  narrationBubbleAlpha: 0.9,
  narrationTextColor: '#222222',
  narrationBubbleRoundness: 8,
  narrationBubblePaddingMultiplier: 1.0,
};

const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({
  visible,
  messages,
  onClose,
  selectedCharacter,
  user,
  uiSettings = DEFAULT_UI_SETTINGS,
}) => {
  const insets = useSafeAreaInsets();

  const renderHistoryItem = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.sender === 'user';
    
    return (
      <MessageItem
        message={item}
        isUser={isUser}
        index={index}
        uiSettings={uiSettings}
        maxImageHeight={200}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>聊天历史</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Messages List */}
        <FlatList
          data={messages}
          renderItem={renderHistoryItem}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={true}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});

export default ChatHistoryModal;
