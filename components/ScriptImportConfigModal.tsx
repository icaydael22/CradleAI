import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { Script, ScriptStyleConfigFile } from '@/shared/types/script-types';
import { VariableSystemConfig } from '@/services/variables/variable-types';

interface ScriptImportConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (config: {
    selectedCharacters: string[];
    userName: string;
  }) => void;
  scriptConfig: ScriptStyleConfigFile;
  variableConfig?: VariableSystemConfig;
  characters: Character[];
}

export const ScriptImportConfigModal: React.FC<ScriptImportConfigModalProps> = ({
  visible,
  onClose,
  onConfirm,
  scriptConfig,
  variableConfig,
  characters,
}) => {
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 重置状态
  useEffect(() => {
    if (visible) {
      setSelectedCharacters([]);
      setUserName('');
    }
  }, [visible]);

  // 切换角色选择
  const toggleCharacterSelection = (characterId: string) => {
    setSelectedCharacters(prev => 
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  // 确认导入
  const handleConfirm = async () => {
    if (selectedCharacters.length === 0) {
      Alert.alert('提示', '请至少选择一个角色参与剧本');
      return;
    }

    if (!userName.trim()) {
      Alert.alert('提示', '请输入您在剧本中的名称');
      return;
    }

    setIsLoading(true);
    try {
      await onConfirm({
        selectedCharacters,
        userName: userName.trim(),
      });
    } catch (error) {
      console.error('导入配置失败:', error);
      Alert.alert('错误', '导入失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>配置剧本导入</Text>
          <TouchableOpacity 
            onPress={handleConfirm} 
            style={[styles.confirmButton, (!selectedCharacters.length || !userName.trim()) && styles.confirmButtonDisabled]}
            disabled={!selectedCharacters.length || !userName.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmButtonText}>完成</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 剧本信息 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>剧本信息</Text>
            <View style={styles.scriptInfo}>
              <Text style={styles.scriptName}>{scriptConfig.name}</Text>
              {scriptConfig.description && (
                <Text style={styles.scriptDescription}>{scriptConfig.description}</Text>
              )}
              {scriptConfig.version && (
                <Text style={styles.scriptVersion}>版本: {scriptConfig.version}</Text>
              )}
            </View>
          </View>

          {/* 用户名称设置 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>您在剧本中的名称</Text>
            <Text style={styles.sectionDescription}>
              此名称将用于替换剧本中的 {'{'}{'{'} user {'}'}{'}'}
            </Text>
            <TextInput
              style={styles.userNameInput}
              value={userName}
              onChangeText={setUserName}
              placeholder="请输入您的名称"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* 角色选择 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              选择参与角色 ({selectedCharacters.length}/{characters.length})
            </Text>
            <Text style={styles.sectionDescription}>
              选择参与此剧本的角色，他们的信息和聊天记录将被包含在剧本上下文中
            </Text>
            
            <View style={styles.charactersGrid}>
              {characters.map((character) => (
                <TouchableOpacity
                  key={character.id}
                  style={[
                    styles.characterCard,
                    selectedCharacters.includes(character.id) && styles.characterCardSelected
                  ]}
                  onPress={() => toggleCharacterSelection(character.id)}
                >
                  <View style={styles.characterAvatar}>
                    {character.avatar ? (
                      <Image source={{ uri: character.avatar }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person" size={24} color="#666" />
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.characterName} numberOfLines={2}>
                    {character.name}
                  </Text>
                  
                  {selectedCharacters.includes(character.id) && (
                    <View style={styles.selectionIndicator}>
                      <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            
            {characters.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#666" />
                <Text style={styles.emptyStateText}>没有可用的角色</Text>
                <Text style={styles.emptyStateSubtext}>请先创建一些角色</Text>
              </View>
            )}
          </View>

          {/* 配置摘要 */}
          {variableConfig && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>包含的配置</Text>
              <View style={styles.configSummary}>
                <View style={styles.configItem}>
                  <Ionicons name="document-text" size={16} color="#4CAF50" />
                  <Text style={styles.configItemText}>剧本样式配置</Text>
                </View>
                <View style={styles.configItem}>
                  <Ionicons name="settings" size={16} color="#4CAF50" />
                  <Text style={styles.configItemText}>变量系统配置</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  confirmButton: {
    backgroundColor: 'rgb(255, 224, 195)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#666',
  },
  confirmButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
    lineHeight: 20,
  },
  scriptInfo: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
  },
  scriptName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgb(255, 224, 195)',
    marginBottom: 8,
  },
  scriptDescription: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
    lineHeight: 18,
  },
  scriptVersion: {
    fontSize: 12,
    color: '#999',
  },
  userNameInput: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
  },
  charactersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  characterCard: {
    width: '47%',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  characterCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  characterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'center',
    minHeight: 32,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  configSummary: {
    gap: 8,
  },
  configItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  configItemText: {
    fontSize: 14,
    color: '#ccc',
  },
});
