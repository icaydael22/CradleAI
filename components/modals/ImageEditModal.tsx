import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

interface ImageEditModalProps {
  visible: boolean;
  onClose: () => void;
  onStartEdit: (referenceImage: string, referenceImageType: string, editPrompt: string) => void;
  isGeneratingImage?: boolean;
}

export const ImageEditModal: React.FC<ImageEditModalProps> = ({
  visible,
  onClose,
  onStartEdit,
  isGeneratingImage = false,
}) => {
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImageType, setReferenceImageType] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState<string>('');

  const handleClose = () => {
    setReferenceImage(null);
    setReferenceImageType(null);
    setEditPrompt('');
    onClose();
  };

  const pickReferenceImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('需要权限', '需要照片库访问权限才能选择图片。');
      return;
    }
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        
        const manipResult = await manipulateAsync(
          selectedAsset.uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: SaveFormat.JPEG, base64: true }
        );
        
        setReferenceImage(`data:image/jpeg;base64,${manipResult.base64}`);
        setReferenceImageType('image/jpeg');
      }
    } catch (error) {
      console.error('Error picking reference image:', error);
      Alert.alert('错误', '选择参考图片时出现错误，请重试。');
    }
  };

  const handleStartEdit = () => {
    if (!referenceImage || !editPrompt.trim()) {
      Alert.alert('错误', '请选择参考图片并输入编辑指令');
      return;
    }

    onStartEdit(referenceImage, referenceImageType || 'image/jpeg', editPrompt.trim());
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
        <View style={styles.imageEditModalContent}>
          <Text style={styles.modalTitle}>图片编辑</Text>
          
          <View style={styles.referenceImageSection}>
            <Text style={styles.modalSubtitle}>参考图片:</Text>
            <View style={styles.referenceImageContainer}>
              {referenceImage ? (
                <Image 
                  source={{ uri: referenceImage }} 
                  style={styles.referenceImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.noImagePlaceholder}>
                  <Ionicons name="image-outline" size={40} color="#777" />
                  <Text style={styles.placeholderText}>未选择图片</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.button, styles.selectImageButton]}
              onPress={pickReferenceImage}
            >
              <Ionicons name="add" size={22} color="#fff" />
              <Text style={styles.selectImageButtonText}>
                {referenceImage ? '更换参考图片' : '选择参考图片'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.modalSubtitle}>修改指令:</Text>
          <TextInput
            style={[styles.editPromptInput, { height: 100 }]}
            placeholder="输入编辑指令 (例如：'转换成卡通风格', '改成黄色背景')"
            placeholderTextColor="#999"
            value={editPrompt}
            onChangeText={setEditPrompt}
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
                (!referenceImage || !editPrompt.trim()) && styles.disabledButton
              ]}
              onPress={handleStartEdit}
              disabled={isGeneratingImage || !referenceImage || !editPrompt.trim()}
            >
              <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                {isGeneratingImage ? '处理中...' : '开始编辑'}
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
  imageEditModalContent: {
    backgroundColor: '#333',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#ddd',
    fontSize: 16,
    marginBottom: 8,
  },
  referenceImageSection: {
    marginBottom: 16,
  },
  referenceImageContainer: {
    height: 200,
    backgroundColor: '#222',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  referenceImage: {
    width: '100%',
    height: '100%',
  },
  noImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#777',
    marginTop: 8,
  },
  button: {
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectImageButton: {
    flexDirection: 'row',
    backgroundColor: '#444',
  },
  selectImageButtonText: {
    color: '#fff',
    marginLeft: 8,
  },
  editPromptInput: {
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

export default ImageEditModal;