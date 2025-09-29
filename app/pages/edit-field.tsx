// app/pages/edit-field.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

  const EditField: React.FC = () => {
  const { field, value, characterId } = useLocalSearchParams(); // 获取传递的参数
  const router = useRouter();
  const [fieldValue, setFieldValue] = useState(value as string);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // 页面加载后自动聚焦到文本框
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    // TODO: 保存修改后的值，例如发送请求到服务器
    console.log('Saving:', field, fieldValue);

    // 返回上一页
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{field}</Text>
      <TextInput
        style={styles.input}
        value={fieldValue}
        onChangeText={setFieldValue}
        autoFocus={true} // 自动聚焦
        ref={inputRef}
        onSubmitEditing={handleSave}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 10,
    borderRadius: 5,
    fontSize: 16,
  },
});

export default EditField;