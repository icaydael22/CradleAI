import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Character, User } from '@/shared/types';
import { createUserGroup, getUserGroups, Group } from '@/src/group';
import { theme } from '@/constants/theme';

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser: User;
  characters: Character[];
  onGroupCreated?: (group: Group) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onClose,
  currentUser,
  characters,
  onGroupCreated,
}) => {
  const [groupName, setGroupName] = useState('');
  const [groupTopic, setGroupTopic] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = () => {
    setGroupName('');
    setGroupTopic('');
    setSelectedCharacters([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
        console.log('[CreateGroupModal] Successfully created group:', newGroup.groupId);
        
        // 通知父组件群聊已创建
        if (onGroupCreated) {
          onGroupCreated(newGroup);
        }
        
        // 关闭模态框并重置表单
        handleClose();
      }
    } catch (error) {
      console.error('[CreateGroupModal] Failed to create group:', error);
      alert('创建群聊失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>创建群聊</Text>
            <TouchableOpacity onPress={handleClose}>
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
            {characters.map(character => (
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
  );
};

const styles = StyleSheet.create({
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

export default CreateGroupModal;
