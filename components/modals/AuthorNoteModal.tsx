import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Character } from '@/shared/types';
import { useUser } from '@/constants/UserContext';
import { updateAuthorNoteDataForCharacter } from '@/app/pages/character-detail';

interface AuthorNoteModalProps {
  visible: boolean;
  onClose: () => void;
  selectedCharacter: Character | null;
}

export const AuthorNoteModal: React.FC<AuthorNoteModalProps> = ({
  visible,
  onClose,
  selectedCharacter,
}) => {
  const { user } = useUser();
  const [authorNoteInput, setAuthorNoteInput] = useState('');
  const [authorNoteDepth, setAuthorNoteDepth] = useState(0);
  const [isAuthorNoteSaving, setIsAuthorNoteSaving] = useState(false);

  useEffect(() => {
    if (visible && selectedCharacter) {
      // Load current author note content
      let authorNote = '';
      let injectionDepth = 0;
      try {
        if (selectedCharacter?.jsonData) {
          const json = JSON.parse(selectedCharacter.jsonData);
          authorNote = json.authorNote?.content || '';
          injectionDepth = json.authorNote?.injection_depth || 0;
        }
      } catch (error) {
        console.error('[AuthorNoteModal] Error parsing character JSON:', error);
      }
      setAuthorNoteInput(authorNote);
      setAuthorNoteDepth(injectionDepth);
    }
  }, [visible, selectedCharacter]);

  const handleClose = () => {
    setAuthorNoteInput('');
    setAuthorNoteDepth(0);
    onClose();
  };

  const handleSaveAuthorNote = async () => {
    if (!selectedCharacter) return;
    
    setIsAuthorNoteSaving(true);
    try {
      const userNickname = user?.settings?.self.nickname || 'User';
      const result = await updateAuthorNoteDataForCharacter(
        selectedCharacter,
        { content: authorNoteInput, injection_depth: authorNoteDepth },
        userNickname
      );
      
      if (result.success) {
        Alert.alert('成功', '作者注释已更新');
        handleClose();
      } else {
        Alert.alert('失败', result.error || '更新失败');
      }
    } catch (error) {
      console.error('[AuthorNoteModal] Error saving author note:', error);
      Alert.alert('错误', '保存时出现错误');
    } finally {
      setIsAuthorNoteSaving(false);
    }
  };

  const decreaseDepth = () => {
    setAuthorNoteDepth(Math.max(0, authorNoteDepth - 1));
  };

  const increaseDepth = () => {
    setAuthorNoteDepth(authorNoteDepth + 1);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>编辑作者注释</Text>
          
          <TextInput
            style={[styles.authorNoteInput, { height: 100 }]}
            placeholder="输入作者注释..."
            placeholderTextColor="#999"
            value={authorNoteInput}
            onChangeText={setAuthorNoteInput}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          
          {/* Injection depth parameter selection */}
          <View style={styles.injectionDepthContainer}>
            <Text style={styles.injectionDepthLabel}>插入深度:</Text>
            <TouchableOpacity
              style={styles.depthButton}
              onPress={decreaseDepth}
              disabled={isAuthorNoteSaving || authorNoteDepth <= 0}
            >
              <Text style={styles.depthButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.depthValue}>{authorNoteDepth}</Text>
            <TouchableOpacity
              style={styles.depthButton}
              onPress={increaseDepth}
              disabled={isAuthorNoteSaving}
            >
              <Text style={styles.depthButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={handleClose}
              disabled={isAuthorNoteSaving}
            >
              <Text style={styles.modalButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, styles.modalButtonPrimary]}
              onPress={handleSaveAuthorNote}
              disabled={isAuthorNoteSaving}
            >
              <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                {isAuthorNoteSaving ? '保存中...' : '保存'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#333',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  authorNoteInput: {
    backgroundColor: '#444',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginBottom: 20,
  },
  injectionDepthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  injectionDepthLabel: {
    color: '#fff',
    marginRight: 8,
  },
  depthButton: {
    backgroundColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 8,
  },
  depthButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  depthValue: {
    color: '#fff',
    minWidth: 24,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#555',
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    color: '#ddd',
    fontWeight: 'bold',
  },
});

export default AuthorNoteModal;