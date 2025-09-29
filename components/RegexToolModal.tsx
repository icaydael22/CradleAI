import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Switch,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RegexTool } from '@/shared/types';
import { useRegex } from '@/constants/RegexContext';
import { BlurView } from 'expo-blur';

interface RegexToolModalProps {
  visible: boolean;
  onClose: () => void;
}

const RegexToolModal: React.FC<RegexToolModalProps> = ({ visible, onClose }) => {
  const { regexTools, addRegexTool, updateRegexTool, deleteRegexTool, toggleRegexTool } = useRegex();
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentTool, setCurrentTool] = useState<Partial<RegexTool>>({
    name: '',
    pattern: '',
    replacement: '',
    target: 'ai',
    enabled: true
  });

  // 重置编辑状态和当前工具
  const resetEditing = () => {
    setIsEditing(false);
    setCurrentTool({
      name: '',
      pattern: '',
      replacement: '',
      target: 'ai',
      enabled: true
    });
  };

  // 处理保存操作
  const handleSave = async () => {
    // 验证输入
    if (!currentTool.name?.trim()) {
      Alert.alert('错误', '请输入名称');
      return;
    }
    
    if (!currentTool.pattern?.trim()) {
      Alert.alert('错误', '请输入正则表达式');
      return;
    }
    
    // 验证正则表达式
    try {
      new RegExp(currentTool.pattern);
    } catch (error) {
      Alert.alert('错误', '无效的正则表达式');
      return;
    }
    
    if (currentTool.id) {
      // 更新现有工具
      await updateRegexTool(currentTool.id, currentTool);
    } else {
      // 添加新工具
      await addRegexTool({
        name: currentTool.name,
        pattern: currentTool.pattern || '',
        replacement: currentTool.replacement || '',
        target: currentTool.target || 'ai',
        enabled: true
      });
    }
    
    resetEditing();
  };

  // 处理删除操作
  const handleDelete = (id: string) => {
    Alert.alert(
      '删除确认',
      '确定要删除此正则工具吗？',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '删除', 
          style: 'destructive',
          onPress: async () => {
            await deleteRegexTool(id);
            resetEditing();
          }
        },
      ]
    );
  };

  // 处理编辑操作
  const handleEdit = (tool: RegexTool) => {
    setCurrentTool({ ...tool });
    setIsEditing(true);
  };

  // 渲染工具列表项
  const renderItem = ({ item }: { item: RegexTool }) => (
    <View style={styles.toolItem}>
      <View style={styles.toolHeader}>
        <Text style={styles.toolName}>{item.name}</Text>
        <Switch
          value={item.enabled}
          onValueChange={() => toggleRegexTool(item.id)}
          trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }} // 更新为米黄色
          thumbColor={item.enabled ? 'rgb(255, 224, 195)' : '#f4f3f4'} // 更新为米黄色
        />
      </View>
      
      <Text style={styles.toolDetail}>正则: {item.pattern}</Text>
      <Text style={styles.toolDetail}>替换: {item.replacement}</Text>
      <Text style={styles.toolDetail}>应用于: {item.target === 'ai' ? 'AI回复' : '用户消息'}</Text>
      
      <View style={styles.toolActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleEdit(item)}>
          <Ionicons name="create-outline" size={22} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={22} color="#ff6b6b" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <BlurView intensity={30} tint="dark" style={styles.blurView}>
          <View style={styles.header}>
            <Text style={styles.title}>正则替换工具</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {isEditing ? (
            <ScrollView style={styles.editorContainer}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>名称</Text>
                <TextInput
                  style={styles.input}
                  value={currentTool.name}
                  onChangeText={text => setCurrentTool(prev => ({ ...prev, name: text }))}
                  placeholder="工具名称"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>正则表达式</Text>
                <TextInput
                  style={styles.input}
                  value={currentTool.pattern}
                  onChangeText={text => setCurrentTool(prev => ({ ...prev, pattern: text }))}
                  placeholder="正则表达式模式"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>替换为</Text>
                <TextInput
                  style={styles.input}
                  value={currentTool.replacement}
                  onChangeText={text => setCurrentTool(prev => ({ ...prev, replacement: text }))}
                  placeholder="替换文本 (可使用 $1, $2 等捕获组)"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>应用范围</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity 
                    style={[
                      styles.radioButton, 
                      currentTool.target === 'ai' && styles.radioButtonSelected
                    ]}
                    onPress={() => setCurrentTool(prev => ({ ...prev, target: 'ai' }))}
                  >
                    <Text style={styles.radioText}>AI回复</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[
                      styles.radioButton, 
                      currentTool.target === 'user' && styles.radioButtonSelected
                    ]}
                    onPress={() => setCurrentTool(prev => ({ ...prev, target: 'user' }))}
                  >
                    <Text style={styles.radioText}>用户消息</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.cancelButton} onPress={resetEditing}>
                  <Text style={styles.buttonText}>取消</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.buttonText}>保存</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <FlatList
                data={regexTools}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={() => (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>暂无正则工具</Text>
                    <Text style={styles.emptySubtext}>点击下方按钮添加新工具</Text>
                  </View>
                )}
              />
              
              <TouchableOpacity 
                style={styles.addButton} 
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="add" size={24} color="#fff" />
                <Text style={styles.addButtonText}>添加正则工具</Text>
              </TouchableOpacity>
            </>
          )}
        </BlurView>
      </View>
    </Modal>
  );
};

const { height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  blurView: {
    width: '90%',
    height: height * 0.75, // 修改：使用屏幕高度的75%
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 5,
  },
  listContent: {
    padding: 16,
  },
  toolItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'rgb(255, 224, 195)', // 更新为米黄色
  },
  toolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  toolName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  toolDetail: {
    color: '#ccc',
    marginBottom: 5,
    fontSize: 14,
  },
  toolActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    padding: 6,
    marginLeft: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#ccc',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: 'rgb(255, 224, 195)', // 修改：使用米黄色而不是粉色
    borderRadius: 10,
    margin: 16,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 16,
  },
  editorContainer: {
    padding: 16,
    flex: 1,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(70, 70, 70, 0.8)',
    padding: 12,
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  radioGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  radioButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: 'rgba(70, 70, 70, 0.8)',
  },
  radioButtonSelected: {
    backgroundColor: 'rgb(255, 224, 195)', // 修改：使用米黄色而不是粉色
  },
  radioText: {
    color: '#fff',
    fontSize: 14,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'rgba(100, 100, 100, 0.8)',
    borderRadius: 10,
    marginRight: 10,
  },
  saveButton: {
    flex: 2,
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'rgb(255, 224, 195)', // 修改：使用米黄色而不是粉色
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default RegexToolModal;
