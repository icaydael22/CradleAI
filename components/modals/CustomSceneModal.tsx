import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

interface CustomSceneModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (customPrompt: string) => void;
  isGenerating?: boolean;
}

export const CustomSceneModal: React.FC<CustomSceneModalProps> = ({
  visible,
  onClose,
  onGenerate,
  isGenerating = false,
}) => {
  const [customImagePrompt, setCustomImagePrompt] = useState<string>('');

  const handleClose = () => {
    setCustomImagePrompt('');
    onClose();
  };

  const handleGenerate = () => {
    if (!customImagePrompt.trim()) {
      return;
    }
    
    onGenerate(customImagePrompt.trim());
    handleClose();
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
          <Text style={styles.modalTitle}>自定义生成提示词</Text>
          
          <TextInput
            style={[styles.promptInput, { height: 100 }]}
            placeholder="输入自定义生成提示词..."
            placeholderTextColor="#999"
            value={customImagePrompt}
            onChangeText={setCustomImagePrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          
          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={handleClose}
            >
              <Text style={styles.modalButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.modalButton, 
                styles.modalButtonPrimary,
                !customImagePrompt.trim() && styles.disabledButton
              ]}
              onPress={handleGenerate}
              disabled={isGenerating || !customImagePrompt.trim()}
            >
              <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                {isGenerating ? '生成中...' : '生成自定义场景图片'}
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
  promptInput: {
    backgroundColor: '#444',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginBottom: 20,
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
  disabledButton: {
    opacity: 0.5,
  },
});

export default CustomSceneModal;