import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface TestImageProps {
  onSendTestImage: () => void;
}

const TestImage: React.FC<TestImageProps> = ({ onSendTestImage }) => (
  <TouchableOpacity style={styles.button} onPress={onSendTestImage}>
    <Text style={styles.text}>发送图片测试消息</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 100,
    right: 24,
    zIndex: 99999,
    backgroundColor: '#4a6fa5',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 18,
    elevation: 8,
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default TestImage;
