import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Character, User } from '@/shared/types';
import { Group } from '@/src/group/group-types';
import { GroupManager } from '@/src/group/group-manager';
import { theme } from '@/constants/theme';
import { GroupAvatar } from './GroupAvatar';
import { CharacterLoader } from '@/src/utils/character-loader';

interface GroupManagementModalProps {
  visible: boolean;
  onClose: () => void;
  group: Group;
  groupMembers: Character[];
  allCharacters: Character[];
  currentUser: User;
  onGroupUpdated: () => void;
}

const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
  visible,
  onClose,
  group,
  groupMembers,
  allCharacters,
  currentUser,
  onGroupUpdated,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'add'>('members');
  const [loadingMemberIds, setLoadingMemberIds] = useState<string[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [needsToLoadMissingCharacters, setNeedsToLoadMissingCharacters] = useState(false);

  // Initialize available characters (characters not in the group)
  useEffect(() => {
    const initializeAvailableCharacters = async () => {
      try {
        setIsInitializing(true);
        console.log(`[GroupManagementModal] Initializing with ${allCharacters.length} characters and ${groupMembers.length} group members`);
        console.log(`[GroupManagementModal] Group member IDs: ${group.groupMemberIds.join(', ')}`);
        
        // Create a set of current member IDs including the user ID
        const memberIds = new Set(group.groupMemberIds || []);
        
        // Filter characters that are not already in the group
        let available = allCharacters.filter((char: Character) => !memberIds.has(char.id));
        
        // If no available characters, try loading from storage
        if (available.length === 0 || allCharacters.length < 5) {
          console.log('[GroupManagementModal] Trying to load more characters from storage...');
          const loadedCharacters = await CharacterLoader.loadAllCharacters();
          
          if (loadedCharacters && loadedCharacters.length > 0) {
            console.log(`[GroupManagementModal] Successfully loaded ${loadedCharacters.length} characters from storage`);
            // Only include characters not already in the group
            available = loadedCharacters.filter((char: Character) => !memberIds.has(char.id));
          }
        }
        
        console.log(`[GroupManagementModal] Found ${available.length} available characters for adding to group`);
        setAvailableCharacters(available);
        
        // Additional check: if any group members are missing from our current
        // groupMembers prop, set the flag to load them
        if (group.groupMemberIds) {
          const characterMemberIds = group.groupMemberIds.filter(id => id !== currentUser.id);
          if (characterMemberIds.length > groupMembers.length) {
            console.log(`[GroupManagementModal] Missing characters: expected ${characterMemberIds.length}, got ${groupMembers.length}`);
            setNeedsToLoadMissingCharacters(true);
          }
        }
      } catch (error) {
        console.error('[GroupManagementModal] Error initializing available characters:', error);
        Alert.alert('Error', 'Failed to load available characters');
      } finally {
        setIsInitializing(false);
      }
    };

    if (visible) {
      initializeAvailableCharacters();
    }
  }, [group, allCharacters, visible, currentUser.id, groupMembers.length]);

  useEffect(() => {
    if (visible && group.groupMemberIds) {
      // Filter out the current user ID to check if any character members are missing
      const characterMemberIds = group.groupMemberIds.filter(id => id !== currentUser.id);
      if (characterMemberIds.length > groupMembers.length) {
        console.log(`[GroupManagementModal] Missing characters: expected ${characterMemberIds.length}, got ${groupMembers.length}`);
        setNeedsToLoadMissingCharacters(true);
      } else {
        setNeedsToLoadMissingCharacters(false);
      }
    }
  }, [visible, group.groupMemberIds, groupMembers, currentUser.id]);

  useEffect(() => {
    if (visible) {
      console.log(`[GroupManagementModal] Rendering with:
        - ${groupMembers.length} group members
        - ${availableCharacters.length} available characters
        - Active tab: ${activeTab}
        - Group member IDs: ${JSON.stringify(group.groupMemberIds)}
        - Loading state: ${isLoading}
        - Initializing state: ${isInitializing}
      `);
      
      if (groupMembers.length > 0) {
        console.log('[GroupManagementModal] Group members:');
        groupMembers.forEach((member, idx) => {
          console.log(`  ${idx+1}. ${member.id} - ${member.name}`);
        });
      } else {
        console.log('[GroupManagementModal] No group members available to render');
      }
      
      const memberIds = new Set(group.groupMemberIds || []);
      if (memberIds.size !== (groupMembers.length + 1)) { // +1 for the user who isn't in groupMembers
        console.log(`[GroupManagementModal] Mismatch: ${memberIds.size} member IDs vs ${groupMembers.length} member objects`);
        const missingIds = [...memberIds].filter(id => !groupMembers.some(member => member.id === id) && id !== currentUser.id);
        console.log(`[GroupManagementModal] Missing member IDs: ${JSON.stringify(missingIds)}`);
        if (memberIds.has(currentUser.id)) {
          console.log(`[GroupManagementModal] User ID ${currentUser.id} is among the missing IDs, which is expected`);
        }
      }
    }
  }, [visible, groupMembers, availableCharacters, activeTab, group.groupMemberIds, isLoading, isInitializing, currentUser.id]);

  const handleAddMembers = async () => {
    if (selectedCharacters.length === 0) {
      Alert.alert('Please select at least one character');
      return;
    }

    setIsLoading(true);
    try {
      const groupManager = new GroupManager(currentUser);
      const success = await groupManager.addMembersToGroup(group.groupId, selectedCharacters);

      if (success) {
        setSelectedCharacters([]);
        setActiveTab('members');
        onGroupUpdated();
        Alert.alert('Success', 'Characters added to the group successfully');
      } else {
        Alert.alert('Error', 'Failed to add characters to the group');
      }
    } catch (error) {
      console.error('[GroupManagementModal] Error adding members:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (characterId: string) => {
    if (characterId === currentUser.id || characterId === group.groupOwnerId) {
      Alert.alert('Cannot Remove', characterId === currentUser.id ? 
        'You cannot remove yourself from the group.' : 
        'You cannot remove the group owner.');
      return;
    }

    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this character from the group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setLoadingMemberIds(prev => [...prev, characterId]);
            try {
              const groupManager = new GroupManager(currentUser);
              const success = await groupManager.removeGroupMember(group.groupId, characterId);

              if (success) {
                onGroupUpdated();
              } else {
                Alert.alert('Error', 'Failed to remove character from the group');
              }
            } catch (error) {
              console.error('[GroupManagementModal] Error removing member:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setLoadingMemberIds(prev => prev.filter(id => id !== characterId));
            }
          }
        }
      ]
    );
  };

  const toggleCharacterSelection = (characterId: string) => {
    setSelectedCharacters(prev => {
      if (prev.includes(characterId)) {
        return prev.filter(id => id !== characterId);
      } else {
        return [...prev, characterId];
      }
    });
  };

  const renderFallbackMember = () => (
    <View style={styles.memberItem}>
      <View style={[styles.memberAvatar, {backgroundColor: '#555'}]}>
        <Ionicons name="person" size={20} color="#ddd" />
      </View>
      <View style={styles.memberInfoContainer}>
        <Text style={styles.memberName}>Loading member...</Text>
      </View>
    </View>
  );

  const renderCurrentUserItem = () => (
    <View style={styles.memberItem}>
      <Image
        source={
          currentUser.avatar
            ? { uri: currentUser.avatar }
            : require('@/assets/images/default-avatar.png')
        }
        style={styles.memberAvatar}
      />
      <View style={styles.memberInfoContainer}>
        <Text style={styles.memberName}>{currentUser.name || '我'}</Text>
      </View>
      
      <View style={styles.userBadge}>
        <Text style={styles.userBadgeText}>我</Text>
      </View>
      
      {currentUser.id === group.groupOwnerId && (
        <View style={styles.ownerBadge}>
          <Text style={styles.ownerBadgeText}>群主</Text>
        </View>
      )}
    </View>
  );

  const renderAvailableCharacterItem = ({ item }: { item: Character }) => (
    <TouchableOpacity
      style={[
        styles.availableCharacterItem,
        selectedCharacters.includes(item.id) && styles.selectedCharacter
      ]}
      onPress={() => toggleCharacterSelection(item.id)}
      disabled={isLoading}
    >
      <Image
        source={
          item.avatar
            ? { uri: item.avatar }
            : require('@/assets/images/default-avatar.png')
        }
        style={styles.characterAvatar}
      />
      <View style={styles.characterInfoContainer}>
        <Text style={styles.characterName}>{item.name}</Text>
        {item.personality && (
          <Text style={styles.characterDescription} numberOfLines={1}>
            {item.personality.length > 60 
              ? item.personality.substring(0, 57) + '...' 
              : item.personality}
          </Text>
        )}
      </View>

      {selectedCharacters.includes(item.id) && (
        <Ionicons name="checkmark-circle" size={24} color="#52c41a" style={styles.checkIcon} />
      )}
    </TouchableOpacity>
  );

  const renderEmptyAvailableMessage = () => (
    <View style={styles.emptyContainer}>
      {isInitializing ? (
        <>
          <ActivityIndicator size="large" color="rgb(255, 224, 195)" />
          <Text style={styles.emptyText}>Loading characters...</Text>
        </>
      ) : (
        <>
          <Ionicons name="search" size={40} color="#666" />
          <Text style={styles.emptyText}>没有可加入的角色</Text>
          <Text style={styles.emptySubText}>
            创建更多角色以加入此群组
          </Text>
        </>
      )}
    </View>
  );

  const renderGroupMembers = () => {
    if (isInitializing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="rgb(255, 224, 195)" />
          <Text style={styles.loadingText}>Loading group members...</Text>
        </View>
      );
    }

    const hasMembers = (groupMembers && groupMembers.length > 0) || shouldRenderCurrentUser;

    if (!hasMembers) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="people" size={40} color="#666" />
          <Text style={styles.emptyText}>No members in this group yet</Text>
          <TouchableOpacity 
            style={styles.emptyActionButton} 
            onPress={() => setActiveTab('add')}
          >
            <Text style={styles.emptyActionButtonText}>Add Characters</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.memberList}>
        {shouldRenderCurrentUser && renderCurrentUserItem()}
        
        {groupMembers.map(member => {
          if (!member || !member.id) {
            console.error('[GroupManagementModal] Invalid member object:', member);
            return renderFallbackMember();
          }
          
          return (
            <View key={member.id} style={styles.memberItem}>
              <Image
                source={
                  member.avatar
                    ? { uri: member.avatar }
                    : require('@/assets/images/default-avatar.png')
                }
                style={styles.memberAvatar}
              />
              <View style={styles.memberInfoContainer}>
                <Text style={styles.memberName}>{member.name}</Text>
                {member.personality && (
                  <Text style={styles.memberDescription} numberOfLines={1}>
                    {member.personality.length > 60 
                      ? member.personality.substring(0, 57) + '...' 
                      : member.personality}
                  </Text>
                )}
              </View>

              {loadingMemberIds.includes(member.id) ? (
                <ActivityIndicator size="small" color="rgb(255, 224, 195)" style={styles.removeButton} />
              ) : (
                member.id !== currentUser.id && member.id !== group.groupOwnerId && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveMember(member.id)}
                    disabled={isLoading}
                  >
                    <Ionicons name="close-circle" size={24} color="#ff4d4f" />
                  </TouchableOpacity>
                )
              )}

              {member.id === group.groupOwnerId && (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>Owner</Text>
                </View>
              )}
            </View>
          );
        })}
        
      </ScrollView>
    );
  };

  useEffect(() => {
    if (visible && needsToLoadMissingCharacters) {
      const loadMissingMembers = async () => {
        console.log(`[GroupManagementModal] Attempting to load missing group members`);
        
        try {
          setIsInitializing(true);
          const characterMemberIds = group.groupMemberIds?.filter(id => id !== currentUser.id) || [];
          
          if (characterMemberIds.length === 0) {
            console.log(`[GroupManagementModal] No character members to load`);
            return;
          }
          
          console.log(`[GroupManagementModal] Loading ${characterMemberIds.length} character members`);
          const members = await CharacterLoader.loadCharactersByIds(characterMemberIds);
          
          if (members && members.length > 0) {
            console.log(`[GroupManagementModal] Successfully loaded ${members.length} group members`);
            
            if (members.length < characterMemberIds.length) {
              console.warn(`[GroupManagementModal] Only loaded ${members.length} of ${characterMemberIds.length} members`);
              const loadedIds = new Set(members.map(m => m.id));
              const stillMissing = characterMemberIds.filter(id => !loadedIds.has(id));
              console.log(`[GroupManagementModal] Still missing member IDs: ${JSON.stringify(stillMissing)}`);
            }
            
            onGroupUpdated();
          } else {
            console.error('[GroupManagementModal] Failed to load any members');
            
            // Fallback: try to use the original allCharacters prop to find the missing members
            const membersFromAllCharacters = allCharacters.filter(char => 
              characterMemberIds.includes(char.id)
            );
            
            if (membersFromAllCharacters.length > 0) {
              console.log(`[GroupManagementModal] Found ${membersFromAllCharacters.length} members in original allCharacters prop`);
              onGroupUpdated();
            }
          }
        } catch (error) {
          console.error('[GroupManagementModal] Error loading missing members:', error);
        } finally {
          setIsInitializing(false);
          setNeedsToLoadMissingCharacters(false);
        }
      };
      
      loadMissingMembers();
    }
  }, [visible, needsToLoadMissingCharacters, group.groupMemberIds, currentUser.id, onGroupUpdated, allCharacters]);

  const shouldRenderCurrentUser = group.groupMemberIds?.includes(currentUser.id) || false;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <GroupAvatar members={groupMembers} size={40} maxDisplayed={4} />
              <View style={styles.headerTextContainer}>
                <Text style={styles.headerTitle}>{group.groupName}</Text>
                <Text style={styles.headerSubtitle}>{group.groupTopic}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'members' && styles.activeTab]}
              onPress={() => setActiveTab('members')}
            >
              <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>
                群成员 ({(group.groupMemberIds?.length || 0)})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'add' && styles.activeTab]}
              onPress={() => setActiveTab('add')}
            >
              <Text style={[styles.tabText, activeTab === 'add' && styles.activeTabText]}>
                新增群成员
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'members' ? (
            renderGroupMembers()
          ) : (
            <>
              <FlatList
                data={availableCharacters}
                keyExtractor={item => item.id}
                renderItem={renderAvailableCharacterItem}
                style={styles.list}
                ListEmptyComponent={renderEmptyAvailableMessage}
              />

              {availableCharacters.length > 0 && (
                <TouchableOpacity
                  style={[styles.addButton, selectedCharacters.length === 0 && styles.disabledButton]}
                  onPress={handleAddMembers}
                  disabled={selectedCharacters.length === 0 || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.addButtonText}>
                      Add Selected ({selectedCharacters.length})
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    width: '90%',
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 12,
    ...theme.shadows.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#bbbbbb',
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: 'rgb(255, 224, 195)',
  },
  tabText: {
    color: '#bbbbbb',
    fontWeight: '500',
  },
  activeTabText: {
    color: 'rgb(255, 224, 195)',
  },
  list: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  memberInfoContainer: {
    flex: 1,
    marginRight: 8,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  memberName: {
    color: '#ffffff',
    fontSize: 16,
  },
  memberDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
  ownerBadge: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginLeft: 4,
  },
  ownerBadgeText: {
    color: 'rgb(255, 224, 195)',
    fontSize: 12,
  },
  userBadge: {
    backgroundColor: 'rgba(100, 149, 237, 0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginLeft: 4,
  },
  userBadgeText: {
    color: 'rgb(100, 149, 237)',
    fontSize: 12,
  },
  availableCharacterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  characterInfoContainer: {
    flex: 1,
    marginRight: 8,
  },
  selectedCharacter: {
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
  },
  characterAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  characterName: {
    color: '#ffffff',
    fontSize: 16,
  },
  characterDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  checkIcon: {
    marginLeft: 8,
  },
  addButton: {
    backgroundColor: 'rgb(255, 224, 195)',
    borderRadius: 8,
    padding: 12,
    margin: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#333333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.5)',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptyText: {
    color: '#bbbbbb',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubText: {
    color: '#999999',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyActionButton: {
    marginTop: 16,
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  emptyActionButtonText: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#bbbbbb',
    fontSize: 16,
    marginTop: 12,
  },
  memberList: {
    flex: 1,
    width: '100%',
  },
  debugInfo: {
    padding: 10,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 5,
  },
  debugText: {
    color: '#aaa',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});

export default GroupManagementModal;
