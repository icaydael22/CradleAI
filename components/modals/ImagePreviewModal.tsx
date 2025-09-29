import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';

interface ImagePreviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSendImage: () => void;
  imageUri: string | null;
  isLoading?: boolean;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  onClose,
  onSendImage,
  imageUri,
  isLoading = false,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.imagePreviewContent}>
          <Text style={styles.modalTitle}>预览图片</Text>
          <View style={styles.imagePreviewWrapper}>
            {imageUri && (
              <Image 
                source={{ uri: imageUri }} 
                style={styles.imagePreview}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={onClose}
            >
              <Text style={styles.modalButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, styles.modalButtonPrimary]}
              onPress={onSendImage}
              disabled={isLoading}
            >
              <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                {isLoading ? '处理中...' : '发送图片'}
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
  imagePreviewContent: {
    backgroundColor: '#333',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  imagePreviewWrapper: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
    marginBottom: 20,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
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

export default ImagePreviewModal;