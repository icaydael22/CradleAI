import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';

interface TextEditorModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
  initialText: string;
  placeholder?: string;
  title?: string;
}

const { width, height } = Dimensions.get('window');

const TextEditorModal: React.FC<TextEditorModalProps> = ({
  isVisible,
  onClose,
  onSave,
  initialText,
  placeholder = '在此输入文本...',
  title = '编辑文本'
}) => {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (isVisible) {
      setText(initialText);
    }
  }, [isVisible, initialText]);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <BlurView intensity={20} tint="dark" style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={styles.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              placeholder={placeholder}
              placeholderTextColor="#666"
              textAlignVertical="top"
            />
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
  cancelText: {
    fontSize: 17,
    color: '#666',
  },
  saveText: {
    fontSize: 17,
    color: 'rgb(255, 224, 195)',
    fontWeight: 'bold',
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
});

export default TextEditorModal;
