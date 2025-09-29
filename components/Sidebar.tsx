import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  StatusBar,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Character, User } from '@/shared/types';
import { useRouter } from 'expo-router';
import SearchBar from '@/components/SearchBar';
import { theme } from '@/constants/theme';
import { 
  createUserGroup, 
  getUserGroups, 
  Group 
} from '@/src/group';
import { GroupAvatar } from '@/components/GroupAvatar';

const SIDEBAR_WIDTH = 280;

export interface SidebarProps {
  isVisible: boolean;
  conversations: Character[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onClose: () => void;
  animationValue?: Animated.Value;
  currentUser: User;
  disbandedGroups?: string[];
  onGroupsUpdated?: (groups: Group[]) => void;
  onGroupDisbanded?: (disbandedGroupId: string) => void; // 新增
}

interface ConversationItem {
  id: string;
  name: string;
  avatar?: string;
  isGroup: boolean;
  members?: Character[];
}

const Sidebar: React.FC<SidebarProps> = ({
  isVisible,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onClose,
  animationValue,
  currentUser,
  disbandedGroups = [],
  onGroupsUpdated,
  onGroupDisbanded, // 新增
}) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [isGroupModalVisible, setGroupModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupTopic, setGroupTopic] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const sidebarTranslateX = animationValue
    ? animationValue.interpolate({
        inputRange: [0, SIDEBAR_WIDTH],
        outputRange: [-SIDEBAR_WIDTH, 0],
      })
    : new Animated.Value(-SIDEBAR_WIDTH);
  
  useEffect(() => {
    if (currentUser) {
      loadUserGroups();
    }
  }, [currentUser, disbandedGroups]);
  
  const loadUserGroups = async () => {
    try {
      const groups = await getUserGroups(currentUser);
      const filteredGroups = groups.filter(group => !disbandedGroups.includes(group.groupId));
      setUserGroups(filteredGroups);
      console.log(`[Sidebar] 加载用户群组: ${filteredGroups.length}个群组`);
    } catch (error) {
      console.error('Failed to load user groups:', error);
    }
  };
  
  const allConversations: ConversationItem[] = [
    ...conversations.map(conv => ({
      id: conv.id,
      name: conv.name,
      avatar: conv.avatar || undefined,
      isGroup: false,
    })),
    ...userGroups.map(group => ({
      id: group.groupId,
      name: group.groupName,
      isGroup: true,
      members: conversations.filter(char => group.groupMemberIds.includes(char.id)),
    }))
  ];
  
  const filteredConversations = searchQuery 
    ? allConversations.filter(conv => 
        conv.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allConversations;
    
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      alert('请输入群聊名称');
      return;
    }
    
    if (!groupTopic.trim()) {
      alert('请输入群聊主题');
      return;
    }
    
    if (selectedCharacters.length === 0) {
      alert('请选择至少一个角色');
      return;
    }
    
    try {
      setIsLoading(true);
      
      const newGroup = await createUserGroup(
        currentUser,
        groupName,
        groupTopic,
        selectedCharacters
      );
      
      if (newGroup) {
        console.log('[Sidebar] Successfully created group:', newGroup.groupId);
        
        // Close the modal first
        setGroupModalVisible(false);
        
        // Clear form fields
        setGroupName('');
        setGroupTopic('');
        setSelectedCharacters([]);
        
        // Explicitly reload all user groups to ensure state is fresh
        const updatedGroups = await getUserGroups(currentUser);
        setUserGroups(updatedGroups);
        console.log(`[Sidebar] Explicitly reloaded ${updatedGroups.length} groups after creation`);
        
        // Add a delay before selecting the conversation to ensure proper rendering
        setTimeout(() => {
          // Select the newly created group
          console.log('[Sidebar] Selecting newly created group:', newGroup.groupId);
          onSelectConversation(newGroup.groupId);
          onClose();
          
          // Notify parent that groups have been updated
          if (onGroupsUpdated) {
            onGroupsUpdated(updatedGroups);
          }
        }, 300);
      }
    } catch (error) {
      console.error('[Sidebar] Failed to create group:', error);
      alert('创建群聊失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };
  
  const toggleCharacterSelection = (character: Character) => {
    setSelectedCharacters(prevSelected => {
      const isSelected = prevSelected.some(c => c.id === character.id);
      if (isSelected) {
        return prevSelected.filter(c => c.id !== character.id);
      } else {
        return [...prevSelected, character];
      }
    });
  };

  // 新增: 处理群聊解散
  const handleGroupDisbanded = async (disbandedGroupId: string) => {
    // 移除该群聊
    setUserGroups(prevGroups => {
      const updated = prevGroups.filter(g => g.groupId !== disbandedGroupId);
      // 自动切换到上一个会话（优先私聊，没有则第一个群聊，没有则null）
      let nextId: string | null = null;
      if (selectedConversationId === disbandedGroupId) {
        // 先找私聊
        if (conversations.length > 0) {
          nextId = conversations[0].id;
        } else if (updated.length > 0) {
          nextId = updated[0].groupId;
        }
        if (nextId) {
          onSelectConversation(nextId);
        }
      }
      // 通知父组件
      if (onGroupsUpdated) onGroupsUpdated(updated);
      return updated;
    });
  };

  return (
    <View
      style={[
        styles.sidebarContainer,
        {
          pointerEvents: isVisible ? 'auto' : 'none',
        }
      ]}
    >
      <Animated.View 
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: sidebarTranslateX }],
          }
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>对话窗口</Text>
          <TouchableOpacity 
            style={styles.createGroupButton}
            onPress={() => setGroupModalVisible(true)}
          >
            <Ionicons name="add-circle-outline" size={24} color="rgb(255, 224, 195)" />
            <Text style={styles.createGroupText}>创建群聊</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <SearchBar
            placeholder="搜索角色或群聊..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClear={() => setSearchQuery('')}
            style={styles.searchBar}
            blurBackground={true}
            blurIntensity={15}
          />
        </View>

        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => (item.isGroup ? `group-${item.id}` : item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.conversationItem,
                selectedConversationId === item.id && styles.selectedConversation,
              ]}
              onPress={() => {
                console.log(`Selecting conversation: ${item.id}, isGroup: ${item.isGroup}`);
                onSelectConversation(item.id);
                onClose();
              }}
            >
              {item.isGroup ? (
                <View style={styles.groupAvatarContainer}>
                  {item.members && item.members.length > 0 ? (
                    <GroupAvatar 
                      members={item.members} 
                      size={48} 
                      maxDisplayed={4} 
                    />
                  ) : (
                    <View style={styles.defaultGroupAvatar}>
                      <Ionicons name="people" size={24} color="#ffffff" />
                    </View>
                  )}
                </View>
              ) : (
                <Image
                  source={
                    item.avatar
                      ? { uri: item.avatar }
                      : require('@/assets/images/default-avatar.png')
                  }
                  style={styles.avatar}
                />
              )}
              <View style={styles.conversationDetails}>
                <Text style={styles.conversationName}>{item.name}</Text>
                <Text style={styles.conversationPreview} numberOfLines={1}>
                  {item.isGroup ? '群聊' : '私聊'}
                </Text>
              </View>
              {item.isGroup && (
                <Ionicons name="people" size={16} color="rgba(255, 224, 195, 0.6)" style={styles.groupIcon} />
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            searchQuery ? (
              <View style={styles.emptyResult}>
                <Ionicons name="search-outline" size={32} color="#9e9e9e" />
                <Text style={styles.emptyResultText}>没有找到匹配的角色或群聊</Text>
              </View>
            ) : null
          }
        />
        
        <Modal
          visible={isGroupModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setGroupModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>创建群聊</Text>
                <TouchableOpacity onPress={() => setGroupModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>群聊名称</Text>
                <TextInput
                  style={styles.textInput}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="输入群聊名称"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>群聊主题</Text>
                <TextInput
                  style={styles.textInput}
                  value={groupTopic}
                  onChangeText={setGroupTopic}
                  placeholder="输入群聊主题"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>
              
              <Text style={styles.sectionTitle}>选择群聊成员</Text>
              
              <ScrollView style={styles.characterList}>
                {conversations.map(character => (
                  <TouchableOpacity
                    key={character.id}
                    style={[
                      styles.characterItem,
                      selectedCharacters.some(c => c.id === character.id) && styles.selectedCharacter
                    ]}
                    onPress={() => toggleCharacterSelection(character)}
                  >
                    <Image
                      source={
                        character.avatar
                          ? { uri: character.avatar }
                          : require('@/assets/images/default-avatar.png')
                      }
                      style={styles.characterAvatar}
                    />
                    <Text style={styles.characterName}>{character.name}</Text>
                    {selectedCharacters.some(c => c.id === character.id) && (
                      <Ionicons name="checkmark-circle" size={24} color="rgb(255, 224, 195)" style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <TouchableOpacity
                style={[styles.createButton, isLoading && styles.disabledButton]}
                onPress={handleCreateGroup}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#333" />
                ) : (
                  <Text style={styles.createButtonText}>创建群聊</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Animated.View>
      
      {isVisible && (
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sidebarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 20,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: "rgba(40, 40, 40, 0.9)",
    paddingTop: StatusBar.currentHeight || 0,
    ...theme.shadows.medium,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: SIDEBAR_WIDTH,
    height: '100%',
    width: Dimensions.get('window').width - SIDEBAR_WIDTH,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)",
  },
  createGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createGroupText: {
    color: "rgb(255, 224, 195)",
    fontSize: 14,
    marginLeft: 4,
  },
  searchContainer: {
    padding: theme.spacing.md,
    marginBottom: 8,
  },
  searchBar: {
    height: 40,
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedConversation: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  conversationDetails: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 4,
  },
  conversationPreview: {
    fontSize: 14,
    color: '#9e9e9e',
  },
  emptyResult: {
    padding: 24,
    alignItems: 'center',
  },
  emptyResultText: {
    marginTop: 8,
    color: '#9e9e9e',
    fontSize: 16,
  },
  groupAvatarContainer: {
    width: 48,
    height: 48,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultGroupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupIcon: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxHeight: '80%',
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 12,
    padding: 20,
    ...theme.shadows.medium,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#ffffff',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 10,
    color: '#ffffff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginVertical: 16,
  },
  characterList: {
    maxHeight: 300,
  },
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  selectedCharacter: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
  },
  characterAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  characterName: {
    color: '#ffffff',
    flex: 1,
  },
  checkIcon: {
    marginLeft: 8,
  },
  createButton: {
    backgroundColor: 'rgb(255, 224, 195)',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.5)',
  },
});

export default Sidebar;