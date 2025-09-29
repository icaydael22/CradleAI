import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  FlatList,
  Text,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Character, User } from '@/shared/types';
import { theme } from '@/constants/theme';

interface GroupInputProps {
  onSendMessage: (text: string) => void;
  groupId: string;
  currentUser: User;
  groupMembers: Character[];
  isLoading?: boolean;
}

const GroupInput: React.FC<GroupInputProps> = ({
  onSendMessage,
  groupId,
  currentUser,
  groupMembers,
  isLoading = false,
}) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [filteredMembers, setFilteredMembers] = useState<Character[]>([]);
  
  const inputRef = useRef<TextInput>(null);

  // Process text changes to detect @ mentions
  const handleTextChange = (newText: string) => {
    setText(newText);
    
    // Check if there's an @ character in the text
    const lastAtIndex = newText.lastIndexOf('@');
    
    if (lastAtIndex >= 0) {
      // Find any spaces after the @ character
      const textAfterAt = newText.substring(lastAtIndex + 1);
      const spaceAfterAt = textAfterAt.indexOf(' ');
      
      // If there's no space after @, or we're still typing the name
      if (spaceAfterAt === -1) {
        setMentionStart(lastAtIndex);
        setMentionQuery(textAfterAt);
        setShowMentionSuggestions(true);
        
        // Filter group members based on the query
        const filtered = groupMembers.filter(member => 
          member.id !== currentUser.id && 
          member.name.toLowerCase().includes(textAfterAt.toLowerCase())
        );
        setFilteredMembers(filtered);
        return;
      }
    }
    
    // If we reach here, there's no active @ mention
    setShowMentionSuggestions(false);
  };

  // Insert a member mention into the text
  const insertMention = (member: Character) => {
    if (mentionStart >= 0) {
      const beforeMention = text.substring(0, mentionStart);
      const afterMention = text.substring(mentionStart + mentionQuery.length + 1);
      
      // Replace the partial @mention with the full name
      const newText = `${beforeMention}@${member.name} ${afterMention}`;
      setText(newText);
    }
    
    setShowMentionSuggestions(false);
    setMentionQuery('');
    setMentionStart(-1);
    
    // Focus the input again
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // Send message handler
  const handleSendPress = () => {
    if (text.trim() === '') return;
    if (isLoading) return;

    const messageToSend = text.trim();
    setText('');
    setInputHeight(40);
    setShowMentionSuggestions(false);
    onSendMessage(messageToSend);
  };

  // Handle content size change for multi-line input
  const handleContentSizeChange = (event: any) => {
    const { height } = event.nativeEvent.contentSize;
    const newHeight = Math.min(Math.max(40, height), 120);
    setInputHeight(newHeight);
  };

  // Hide mention suggestions when keyboard is hidden
  useEffect(() => {
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setShowMentionSuggestions(false);
      }
    );

    return () => {
      keyboardDidHideListener.remove();
    };
  }, []);

  // Render a member suggestion item
  const renderMemberItem = ({ item }: { item: Character }) => (
    <TouchableOpacity
      style={styles.mentionItem}
      onPress={() => insertMention(item)}
    >
      <Image 
        source={
          item.avatar
            ? { uri: item.avatar }
            : require('@/assets/images/default-avatar.png')
        }
        style={styles.mentionAvatar}
      />
      <Text style={styles.mentionName}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Mention suggestions */}
      {showMentionSuggestions && filteredMembers.length > 0 && (
        <View style={styles.mentionContainer}>
          <FlatList
            data={filteredMembers}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.id}
            horizontal={false}
            style={styles.mentionList}
            keyboardShouldPersistTaps="always"
          />
        </View>
      )}
      
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input, 
            { height: inputHeight }
          ]}
          placeholder="输入消息..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={handleTextChange}
          multiline
          maxLength={1000}
          onContentSizeChange={handleContentSizeChange}
        />

        <TouchableOpacity
          style={[styles.button, styles.sendButton]}
          onPress={handleSendPress}
          disabled={isLoading || text.trim() === ''}
        >
          {isLoading ? (
            <MaterialIcons name="hourglass-empty" size={24} color="#777" />
          ) : (
            <MaterialIcons
              name="send"
              size={24}
              color={text.trim() === '' ? '#777' : theme.colors.primary}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 'auto',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    textAlignVertical: 'center',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  mentionContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 8,
    marginBottom: 4,
    maxHeight: 200,
    ...theme.shadows.medium,
  },
  mentionList: {
    maxHeight: 200,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  mentionName: {
    color: '#fff',
    fontSize: 14,
  },
});

export default GroupInput;
