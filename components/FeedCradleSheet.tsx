import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

interface FeedCradleSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

const FeedCradleSheet: React.FC<FeedCradleSheetProps> = ({ isVisible, onClose }) => {
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState('');

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    // 这里暂时只打印上传的内容
    console.log('Submitted:', { image, text });
    // 重置状态
    setImage(null);
    setText('');
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>投喂摇篮</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.uploadArea} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={styles.previewImage} />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <MaterialIcons name="add-photo-alternate" size={40} color="#666" />
                <Text style={styles.uploadText}>添加图片</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="添加描述..."
            placeholderTextColor="#666"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={4}
          />

          <TouchableOpacity 
            style={[styles.submitButton, (!image && !text) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!image && !text}
          >
            <Text style={styles.submitButtonText}>投喂</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject, // 添加这一行
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000, // 确保在最上层
  },
  sheet: {
    backgroundColor: '#282828',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
    width: '100%', // 确保宽度占满
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  uploadArea: {
    height: 200,
    backgroundColor: '#333',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadText: {
    color: '#666',
    marginTop: 8,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  textInput: {
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    minHeight: 100,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: 'rgb(255, 224, 195)',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default FeedCradleSheet;
