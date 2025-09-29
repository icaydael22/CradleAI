import React, { useState, useEffect } from 'react';
import {
  View,
  ViewStyle,
  Text,
  StyleSheet,
  StyleProp,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Memo,MemoSheetProps } from '@/constants/types';
import { MaterialIcons } from '@expo/vector-icons';

const MemoSheet: React.FC<MemoSheetProps> = ({ isVisible, onClose }) => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [currentMemo, setCurrentMemo] = useState<Memo | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // 加载备忘录数据
  useEffect(() => {
    loadMemos();
  }, []);

  const loadMemos = async () => {
    try {
      const memosString = await AsyncStorage.getItem('memos');
      if (memosString) {
        setMemos(JSON.parse(memosString));
      }
    } catch (error) {
      console.error('Failed to load memos:', error);
    }
  };

  const saveMemos = async (newMemos: Memo[]) => {
    try {
      await AsyncStorage.setItem('memos', JSON.stringify(newMemos));
      setMemos(newMemos);
    } catch (error) {
      console.error('Failed to save memos:', error);
    }
  };

  const handleNewMemo = () => {
    setCurrentMemo(null);
    setTitle('');
    setContent('');
    setShowEditor(true);
  };

  const handleEditMemo = (memo: Memo) => {
    setCurrentMemo(memo);
    setTitle(memo.title);
    setContent(memo.content);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('提示', '请输入标题');
      return;
    }

    const timestamp = new Date().toISOString();
    const newMemo: Memo = {
      id: currentMemo?.id || String(Date.now()),
      title: title.trim(),
      content: content.trim(),
      createdAt: currentMemo?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    const newMemos = currentMemo
      ? memos.map(m => (m.id === currentMemo.id ? newMemo : m))
      : [...memos, newMemo];

    await saveMemos(newMemos);
    setShowEditor(false);
  };

  const handleDelete = async (memoId: string) => {
    Alert.alert(
      '删除确认',
      '确定要删除这个备忘录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const newMemos = memos.filter(m => m.id !== memoId);
            await saveMemos(newMemos);
          },
        },
      ]
    );
  };

  const renderMemoItem = ({ item }: { item: Memo }) => (
    <TouchableOpacity
      style={styles.memoItem}
      onPress={() => handleEditMemo(item)}
    >
      <View style={styles.memoContent}>
        <Text style={styles.memoTitle}>{item.title}</Text>
        <Text style={styles.memoDate}>
          {new Date(item.updatedAt).toLocaleString()}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id)}
      >
        <MaterialIcons name="delete" size={24} color="#FF4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <Modal
      animationType="fade"  // 改为 fade 效果
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
      supportedOrientations={['portrait', 'landscape']}  // 添加方向支持
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {!showEditor ? (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>备忘录</Text>
                <TouchableOpacity onPress={handleNewMemo}>
                  <MaterialIcons name="add" size={24} color="#FF9ECD" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={memos}
                renderItem={renderMemoItem}
                keyExtractor={item => item.id}
                style={styles.list}
              />
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>关闭</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.editorHeader}>
                <TouchableOpacity onPress={() => setShowEditor(false)}>
                  <MaterialIcons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave}>
                  <Text style={styles.saveButtonText}>保存</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.titleInput}
                placeholder="输入标题"
                value={title}
                onChangeText={setTitle}
              />
              <TextInput
                style={styles.contentInput}
                multiline
                placeholder="输入内容..."
                value={content}
                onChangeText={setContent}
                textAlignVertical="top"
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,  // 使用绝对定位填充整个屏幕
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 9999,  // Android 最高层级
    zIndex: 9999,  // iOS 最高层级
  },
  container: {
    width: '90%',
    height: '80%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    elevation: 9999,  // Android 最高层级
    zIndex: 9999,  // iOS 最高层级
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  memoItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  memoContent: {
    flex: 1,
  },
  memoTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  memoDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  closeButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#FF9ECD',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#FF9ECD',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MemoSheet;