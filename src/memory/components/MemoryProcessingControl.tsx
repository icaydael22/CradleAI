import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  SafeAreaView,
  Dimensions,
  KeyboardAvoidingView,
  Share,
  StatusBar
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons, } from '@expo/vector-icons';
import { useMemoryContext } from '../providers/MemoryProvider';
import Mem0Service from '../services/Mem0Service';
import { Character } from '@/shared/types';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';


const DB_SIZE_WARNING_THRESHOLD = 50; 
const DB_SIZE_ALERT_THRESHOLD = 100;  
const SETTINGS_STORAGE_KEY = 'MemoryProcessingControl:settings';

interface MemoryFact {
  id: string;
  memory: string;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: any;
  agentId?: string;
  userId?: string;
  runId?: string;
}

interface MemoryProcessingControlProps {
  visible?: boolean;
  onClose: () => void;
  characterId?: string;
  conversationId?: string;
  character?: Character;
}

const MemoryProcessingControl: React.FC<MemoryProcessingControlProps> = ({
  visible = false,
  onClose,
  characterId,
  conversationId,
  character,
}) => {
  const { setMemoryProcessingInterval, getMemoryProcessingInterval } = useMemoryContext();
  const [currentInterval, setCurrentInterval] = useState(10);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'memories' | 'stats'>('memories');
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [isLoadingFacts, setIsLoadingFacts] = useState(false);
  const [factSearchQuery, setFactSearchQuery] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>(characterId);
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(conversationId);
  const [editingMemory, setEditingMemory] = useState<MemoryFact | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [dbStats, setDbStats] = useState<{totalCount: number, dbSize: number, dbSizeMB: string}>({
    totalCount: 0,
    dbSize: 0,
    dbSizeMB: '0'
  });
  const [characterMemoryCount, setCharacterMemoryCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const interval = getMemoryProcessingInterval();
    setCurrentInterval(interval);
    const mem0Service = Mem0Service.getInstance();
    const enabled = mem0Service.isMemoryEnabled?.() ?? true;
    setMemoryEnabled(enabled);
    setIsInitialized(true);

    if (character) {
      setSelectedCharacterId(character.id);
    }
  }, [getMemoryProcessingInterval, character]);

  useEffect(() => {
    if (isInitialized) {
      const mem0Service = Mem0Service.getInstance();
      if (mem0Service.setMemoryEnabled) {
        mem0Service.setMemoryEnabled(memoryEnabled);
        console.log(`[MemoryProcessingControl] Memory recording ${memoryEnabled ? 'enabled' : 'disabled'}`);
      }
    }
  }, [memoryEnabled, isInitialized]);

  // 加载本地设置
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.currentInterval === 'number') setCurrentInterval(parsed.currentInterval);
          if (typeof parsed.memoryEnabled === 'boolean') setMemoryEnabled(parsed.memoryEnabled);
        }
      } catch (e) {
        console.warn('[MemoryProcessingControl] 读取本地设置失败', e);
      }
    })();
  }, []);

  // 保存设置到本地
  useEffect(() => {
    if (!isInitialized) return;
    AsyncStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ currentInterval, memoryEnabled })
    ).catch(e => {
      console.warn('[MemoryProcessingControl] 保存本地设置失败', e);
    });
  }, [currentInterval, memoryEnabled, isInitialized]);

  const fetchDbStats = useCallback(async () => {
    const mem0Service = Mem0Service.getInstance();
    
    try {
      const stats = await mem0Service.getVectorDbStats();
      setDbStats(stats);
      
      if (selectedCharacterId) {
        try {
          const memories = await mem0Service.getCharacterMemories(selectedCharacterId);
          setCharacterMemoryCount(memories.length);
          console.log(`[MemoryProcessingControl] 统计面板获取到 ${memories.length} 条记忆，与记忆面板保持一致`);
        } catch (error) {
          console.error('[MemoryProcessingControl] 获取角色记忆统计失败:', error);
          setCharacterMemoryCount(0);
        }
      }
    } catch (error) {
      console.error('[MemoryProcessingControl] Error fetching database stats:', error);
    }
  }, [selectedCharacterId]);

  const dbSizeWarningMessage = useMemo(() => {
    const sizeMB = parseFloat(dbStats.dbSizeMB);
    if (sizeMB >= DB_SIZE_ALERT_THRESHOLD) {
      return `警告: 向量数据库已达到 ${dbStats.dbSizeMB}MB，建议清理不必要的记忆!`;
    } else if (sizeMB >= DB_SIZE_WARNING_THRESHOLD) {
      return `提示: 向量数据库大小为 ${dbStats.dbSizeMB}MB，接近建议上限`;
    }
    return '';
  }, [dbStats.dbSizeMB]);

  useEffect(() => {
    if (visible && (selectedCharacterId || characterId)) {
      fetchMemoryFacts();
      fetchDbStats();
    }
  }, [visible, selectedCharacterId, characterId]);

  const fetchMemoryFacts = useCallback(async () => {
    if (!selectedCharacterId && !characterId) {
      console.warn('[MemoryProcessingControl] No character ID provided for memory facts');
      return;
    }

    const charId = selectedCharacterId || characterId;

    try {
      setIsLoadingFacts(true);
      const mem0Service = Mem0Service.getInstance();

      let memories: MemoryFact[] = [];

      // 只用getCharacterMemories直接读取数据库
      if (mem0Service.getCharacterMemories && charId) {
        try {
          const rawMemories = await mem0Service.getCharacterMemories(charId, 200);
          // 兼容性修正：确保memory字段存在
          memories = (rawMemories || []).map((mem: any) => {
            let memoryContent = mem.memory;
            if (!memoryContent && mem.metadata?.data) memoryContent = mem.metadata.data;
            if (!memoryContent && mem.payload?.data) memoryContent = mem.payload.data;
            if (!memoryContent && mem.payload?.memory) memoryContent = mem.payload.memory;
            return {
              ...mem,
              memory: memoryContent || '',
            };
          }).filter(mem => !!mem.memory);

          setCharacterMemoryCount(memories.length);
          console.log(`[MemoryProcessingControl] 统计面板获取到 ${memories.length} 条记忆，与记忆面板保持一致`);
        } catch (error) {
          console.error('[MemoryProcessingControl] 获取角色记忆统计失败:', error);
          setCharacterMemoryCount(0);
        }
      }

      // 本地搜索过滤
      if (factSearchQuery && memories.length > 0) {
        const query = factSearchQuery.toLowerCase();
        memories = memories.filter((item: MemoryFact) => {
          const content = item?.memory || '';
          return content.toLowerCase().includes(query);
        });
      }

      memories.sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || '';
        const dateB = b.updatedAt || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });

      setMemoryFacts(memories);
    } catch (error) {
      console.error('[MemoryProcessingControl] Error fetching memory facts:', error);
    } finally {
      setIsLoadingFacts(false);
    }
  }, [selectedCharacterId, characterId, factSearchQuery]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchMemoryFacts();
    await fetchDbStats();
    setIsRefreshing(false);
  }, [fetchMemoryFacts, fetchDbStats]);

  const handleIntervalChange = (value: number) => {
    const roundedValue = Math.round(value);
    setCurrentInterval(roundedValue);
    setMemoryProcessingInterval(roundedValue);
    const mem0Service = Mem0Service.getInstance();
    if (mem0Service.setProcessingInterval) {
      mem0Service.setProcessingInterval(roundedValue);
      console.log(`[MemoryProcessingControl] Memory processing interval set to ${roundedValue}`);
    }
  };

  const handleProcessNow = () => {
    try {
      const mem0Service = Mem0Service.getInstance();
      if (mem0Service.processCurrentMemories) {
        const charId = selectedCharacterId || characterId;
        const convId = selectedConversationId || conversationId;
        
        if (!charId) {
          Alert.alert('错误', '未选择角色，无法处理记忆');
          return;
        }
        
        mem0Service.processCurrentMemories(charId, convId);
        Alert.alert('成功', '已手动处理当前记忆缓存');
      }
    } catch (error) {
      console.error('[MemoryProcessingControl] Error processing memories:', error);
      Alert.alert('错误', '处理记忆失败，请稍后再试');
    }
  };

  const handleSearchQueryChange = (text: string) => {
    setFactSearchQuery(text);
  };

  const handleSearchSubmit = () => {
    fetchMemoryFacts();
  };

  const handleAddMemory = () => {
    setIsCreatingNew(true);
    setNewMemoryContent('');
  };

  const handleSaveNewMemory = async () => {
    if (!newMemoryContent.trim()) {
      Alert.alert('错误', '记忆内容不能为空');
      return;
    }

    const charId = selectedCharacterId || characterId;
    if (!charId) {
      Alert.alert('错误', '未选择角色');
      return;
    }

    try {
      setIsCreatingNew(false); 
      Alert.alert('处理中', '正在创建记忆...');
      
      const mem0Service = Mem0Service.getInstance();
      if (!mem0Service.isEmbeddingAvailable) {
        throw new Error('嵌入服务不可用，请确保在设置中配置了有效的智谱API密钥');
      }
      
      const result = await mem0Service.createMemory(
        newMemoryContent, 
        charId, 
        selectedConversationId || conversationId
      );

      if (result) {
        Alert.alert('成功', '成功创建新记忆');
        setNewMemoryContent('');
        await handleRefresh();
      } else {
        throw new Error('创建记忆失败，请检查嵌入服务配置');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MemoryProcessingControl] Error creating memory:', error);
      
      let alertMessage = '创建记忆失败';
      
      if (errorMessage.includes('嵌入服务不可用') || 
          errorMessage.includes('API密钥') || 
          errorMessage.includes('嵌入')) {
        alertMessage = '创建记忆失败：嵌入服务不可用。请在设置中配置有效的智谱API密钥。';
      } else {
        alertMessage = `创建记忆失败：${errorMessage}`;
      }
      
      Alert.alert('错误', alertMessage, [
        { 
          text: '重试', 
          onPress: () => setIsCreatingNew(true) 
        },
        { 
          text: '确定' 
        }
      ]);
    }
  };

  const handleEditMemory = (memory: MemoryFact) => {
    setEditingMemory(memory);
    setEditingContent(memory.memory);
  };

  const handleSaveEditedMemory = async () => {
    if (!editingMemory || !editingContent.trim()) {
      Alert.alert('错误', '记忆内容不能为空');
      return;
    }

    try {
      const mem0Service = Mem0Service.getInstance();
      const result = await mem0Service.updateMemory(
        editingMemory.id,
        editingContent
      );

      if (result) {
        Alert.alert('成功', '记忆更新成功');
        setEditingMemory(null);
        setEditingContent('');
        await handleRefresh();
      } else {
        Alert.alert('错误', '更新记忆失败');
      }
    } catch (error) {
      console.error('[MemoryProcessingControl] Error updating memory:', error);
      Alert.alert('错误', '更新记忆失败');
    }
  };

  const handleDeleteMemory = (memory: MemoryFact) => {
    Alert.alert(
      '确认删除',
      '确定要删除此记忆吗？此操作不可逆。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const mem0Service = Mem0Service.getInstance();
              const result = await mem0Service.deleteMemory(memory.id);
              
              if (result) {
                setMemoryFacts(prev => prev.filter(item => item.id !== memory.id));
                Alert.alert('成功', '记忆已删除');
                await fetchDbStats();
              } else {
                Alert.alert('错误', '删除记忆失败');
              }
            } catch (error) {
              console.error('[MemoryProcessingControl] Error deleting memory:', error);
              Alert.alert('错误', '删除记忆失败');
            }
          }
        }
      ]
    );
  };

  const toggleMemoryExpansion = (id: string) => {
    setExpandedMemoryId(expandedMemoryId === id ? null : id);
  };

  const handleExportMemories = async () => {
    if (!selectedCharacterId && !characterId) {
      Alert.alert('错误', '未选择角色，无法导出记忆');
      return;
    }

    try {
      setIsExporting(true);
      const charId = selectedCharacterId || characterId;
      
      const mem0Service = Mem0Service.getInstance();
      const memories = await mem0Service.getCharacterMemories(charId!, 1000);
      
      if (!memories || memories.length === 0) {
        Alert.alert('提示', '该角色没有可导出的记忆数据');
        setIsExporting(false);
        return;
      }

      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        characterId: charId,
        characterName: character?.name || '未知角色',
        memoryCount: memories.length,
        memories: memories
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `memory_${charId}_${timestamp}.json`;
      
      const tempFilePath = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(tempFilePath, jsonString);
      
      const canShare = await Sharing.isAvailableAsync();
      
      if (canShare) {
        await Sharing.shareAsync(tempFilePath, {
          mimeType: 'application/json',
          dialogTitle: '导出记忆数据',
          UTI: 'public.json'
        });
        console.log(`[MemoryProcessingControl] 成功导出 ${memories.length} 条记忆数据`);
      } else {
        await Share.share({
          title: '记忆数据导出',
          message: `已为角色 ${character?.name || charId} 导出 ${memories.length} 条记忆数据`,
          url: tempFilePath
        });
      }
      
      Alert.alert('成功', `已导出 ${memories.length} 条记忆数据`);
    } catch (error) {
      console.error('[MemoryProcessingControl] 导出记忆失败:', error);
      Alert.alert('导出失败', '无法导出记忆数据，请稍后再试');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportMemories = async () => {
    if (!selectedCharacterId && !characterId) {
      Alert.alert('错误', '未选择角色，无法导入记忆');
      return;
    }

    try {
      setIsImporting(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        console.log('[MemoryProcessingControl] 用户取消了文件选择');
        setIsImporting(false);
        return;
      }
      
      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      
      const importData = JSON.parse(fileContent);
      
      if (!importData.version || !importData.memories || !Array.isArray(importData.memories)) {
        throw new Error('导入文件格式无效');
      }
      
      const charId = selectedCharacterId || characterId;
      const confirmMsg = importData.characterId === charId 
        ? `确定要导入 ${importData.memories.length} 条记忆到当前角色吗？` 
        : `原数据属于角色 ${importData.characterId}，与当前角色 ${charId} 不匹配。是否仍要导入 ${importData.memories.length} 条记忆？`;
      
      Alert.alert(
        '确认导入',
        confirmMsg,
        [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => setIsImporting(false)
          },
          {
            text: '导入',
            onPress: async () => {
              await processImport(importData.memories, charId!);
            }
          }
        ]
      );
      
    } catch (error) {
      console.error('[MemoryProcessingControl] 导入记忆失败:', error);
      Alert.alert('导入失败', '无法导入记忆数据，文件可能已损坏或格式不正确');
      setIsImporting(false);
    }
  };
  
  const processImport = async (memories: MemoryFact[], targetCharId: string) => {
    try {
      const mem0Service = Mem0Service.getInstance();
      let successCount = 0;
      let errorCount = 0;
      
      Alert.alert('导入中', '正在导入记忆数据，请稍候...');
      
      for (const memory of memories) {
        try {
          const content = memory.memory;
          if (content && content.trim()) {
            await mem0Service.createMemory(
              content,
              targetCharId,
              memory.runId || 'imported-memory'
            );
            successCount++;
          }
        } catch (err) {
          console.error('[MemoryProcessingControl] 导入单条记忆失败:', err);
          errorCount++;
        }
      }
      
      await handleRefresh();
      
      Alert.alert(
        '导入完成', 
        `成功导入 ${successCount} 条记忆` + 
        (errorCount > 0 ? `，${errorCount} 条记忆导入失败` : '')
      );
      
    } catch (error) {
      console.error('[MemoryProcessingControl] 批量导入记忆失败:', error);
      Alert.alert('导入失败', '处理导入数据时出错');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
    >
      <View style={styles.overlayBackground}>
        <SafeAreaView style={styles.fullScreenContainer}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>向量记忆</Text>
            </View>
            
            {(character || selectedCharacterId) && (
              <View style={styles.characterInfo}>
                <Text style={styles.characterInfoText}>
                  {character?.name || '角色'} - ID: {selectedCharacterId || characterId}
                </Text>
                {characterMemoryCount > 0 && (
                  <View style={styles.memoryCountBadge}>
                    <Text style={styles.memoryCountText}>{characterMemoryCount} 条记忆</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'memories' && styles.activeTabButton]}
              onPress={() => setActiveTab('memories')}
            >
              <MaterialCommunityIcons
                name="brain"
                size={22}
                color={activeTab === 'memories' ? '#ff9f1c' : '#aaa'}
              />
              <Text style={[styles.tabText, activeTab === 'memories' && styles.activeTabText]}>
                记忆
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'stats' && styles.activeTabButton]}
              onPress={() => setActiveTab('stats')}
            >
              <Ionicons
                name="stats-chart"
                size={22}
                color={activeTab === 'stats' ? '#ff9f1c' : '#aaa'}
              />
              <Text style={[styles.tabText, activeTab === 'stats' && styles.activeTabText]}>
                统计
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'settings' && styles.activeTabButton]}
              onPress={() => setActiveTab('settings')}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={activeTab === 'settings' ? '#ff9f1c' : '#aaa'}
              />
              <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>
                设置
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.contentContainer}>
            {activeTab === 'memories' && (
              <MemoriesPanel
                memories={memoryFacts}
                isLoading={isLoadingFacts}
                isRefreshing={isRefreshing}
                onRefresh={handleRefresh}
                onEditMemory={handleEditMemory}
                onDeleteMemory={handleDeleteMemory}
                onAddMemory={handleAddMemory}
                characterId={selectedCharacterId || characterId}
                searchQuery={factSearchQuery}
                onSearchQueryChange={handleSearchQueryChange}
                onSearchSubmit={handleSearchSubmit}
                expandedMemoryId={expandedMemoryId}
                toggleMemoryExpansion={toggleMemoryExpansion}
              />
            )}
            
            {activeTab === 'settings' && (
              <SettingsPanel
                currentInterval={currentInterval}
                memoryEnabled={memoryEnabled}
                setMemoryEnabled={setMemoryEnabled}
                onIntervalChange={handleIntervalChange}
                onProcessNow={handleProcessNow}
                characterId={selectedCharacterId || characterId}
                conversationId={selectedConversationId || conversationId}
              />
            )}
            
            {activeTab === 'stats' && (
              <StatsPanel
                dbStats={dbStats}
                characterMemoryCount={characterMemoryCount}
                characterName={character?.name || '当前角色'}
                characterId={selectedCharacterId || characterId || ''}
                onRefresh={fetchDbStats}
                onExportMemories={handleExportMemories}
                onImportMemories={handleImportMemories}
                isExporting={isExporting}
                isImporting={isImporting}
              />
            )}
          </View>

          {dbSizeWarningMessage && (
            <View style={[
              styles.dbSizeWarning, 
              parseFloat(dbStats.dbSizeMB) >= DB_SIZE_ALERT_THRESHOLD ? styles.dbSizeAlert : {}
            ]}>
              <Ionicons name="warning" size={18} color="white" />
              <Text style={styles.dbSizeWarningText}>{dbSizeWarningMessage}</Text>
            </View>
          )}

          <Modal
            visible={!!editingMemory}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setEditingMemory(null)}
          >
            <KeyboardAvoidingView 
              style={styles.modalOverlay}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.editModalContainer}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>编辑记忆</Text>
                  <TouchableOpacity onPress={() => setEditingMemory(null)}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
                
                <TextInput
                  style={styles.editModalInput}
                  value={editingContent}
                  onChangeText={setEditingContent}
                  multiline
                  placeholder="编辑记忆内容..."
                  placeholderTextColor="#999"
                />
                
                <View style={styles.editModalButtons}>
                  <TouchableOpacity 
                    style={[styles.editModalButton, styles.cancelButton]}
                    onPress={() => setEditingMemory(null)}
                  >
                    <Text style={styles.editModalButtonText}>取消</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.editModalButton, styles.saveButton]}
                    onPress={handleSaveEditedMemory}
                  >
                    <Text style={styles.editModalButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Modal
            visible={isCreatingNew}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsCreatingNew(false)}
          >
            <KeyboardAvoidingView 
              style={styles.modalOverlay}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.editModalContainer}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>新建记忆</Text>
                  <TouchableOpacity onPress={() => setIsCreatingNew(false)}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
                
                <TextInput
                  style={styles.editModalInput}
                  value={newMemoryContent}
                  onChangeText={setNewMemoryContent}
                  multiline
                  placeholder="输入新记忆内容..."
                  placeholderTextColor="#999"
                />
                
                <View style={styles.editModalButtons}>
                  <TouchableOpacity 
                    style={[styles.editModalButton, styles.cancelButton]}
                    onPress={() => setIsCreatingNew(false)}
                  >
                    <Text style={styles.editModalButtonText}>取消</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.editModalButton, styles.saveButton]}
                    onPress={handleSaveNewMemory}
                  >
                    <Text style={styles.editModalButtonText}>创建</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

interface SettingsPanelProps {
  currentInterval: number;
  memoryEnabled: boolean;
  setMemoryEnabled: (enabled: boolean) => void;
  onIntervalChange: (value: number) => void;
  onProcessNow: () => void;
  characterId?: string;
  conversationId?: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentInterval,
  memoryEnabled,
  setMemoryEnabled,
  onIntervalChange,
  onProcessNow,
  characterId,
  conversationId
}) => {
  return (
    <ScrollView style={styles.statsScrollView}>
      <View style={styles.settingsContainer}>
        {/* {characterId && conversationId && (
          <View style={styles.settingsInfoSection}>
            <Text style={styles.settingsInfoTitle}>当前会话信息</Text>
            <Text style={styles.settingsInfoText}>角色ID: {characterId}</Text>
            <Text style={styles.settingsInfoText}>会话ID: {conversationId}</Text>
          </View>
        )} */}
        
        <View style={styles.settingSection}>
          <Text style={styles.settingSectionTitle}>记忆系统</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>启用记忆功能</Text>
            <Switch
              value={memoryEnabled}
              onValueChange={setMemoryEnabled}
              trackColor={{ false: '#767577', true: 'rgba(255, 159, 28, 0.7)' }}
              thumbColor={memoryEnabled ? '#ff9f1c' : '#f4f3f4'}
            />
          </View>
          <Text style={styles.settingDescription}>
            {memoryEnabled ? '记忆系统已启用，将自动记录对话内容' : '记忆系统已禁用，不会记录新的对话'}
          </Text>
        </View>
        
        <View style={styles.settingSection}>
          <Text style={styles.settingSectionTitle}>记忆处理间隔</Text>
          <Text style={styles.settingDescription}>
            每隔多少轮用户消息处理一次记忆（1-20轮）
          </Text>
          
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderValue}>1</Text>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={20}
              step={1}
              value={currentInterval}
              onValueChange={onIntervalChange}
              minimumTrackTintColor="#ff9f1c"
              maximumTrackTintColor="#767577"
              thumbTintColor="#ff9f1c"
            />
            <Text style={styles.sliderValue}>20</Text>
          </View>
          
          <View style={styles.currentValueContainer}>
            <Text style={styles.currentValueLabel}>当前设置:</Text>
            <Text style={styles.currentValue}>{currentInterval} 轮</Text>        
          </View>
        </View>
        
        <View style={styles.settingSection}>
          <Text style={styles.settingSectionTitle}>手动处理记忆</Text>
          <Text style={styles.settingDescription}>
            立即处理记忆缓存，无需等待轮次计数
          </Text>
          
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#ff9f1c' }]} 
            onPress={onProcessNow}
          >
            <MaterialCommunityIcons name="brain" size={18} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>处理当前角色记忆</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

interface MemoriesPanelProps {
  memories: MemoryFact[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onEditMemory: (memory: MemoryFact) => void;
  onDeleteMemory: (memory: MemoryFact) => void;
  onAddMemory: () => void;
  characterId?: string;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: () => void;
  expandedMemoryId: string | null;
  toggleMemoryExpansion: (id: string) => void;
}

const MemoriesPanel: React.FC<MemoriesPanelProps> = ({
  memories,
  isLoading,
  isRefreshing,
  onRefresh,
  onEditMemory,
  onDeleteMemory,
  onAddMemory,
  characterId,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  expandedMemoryId,
  toggleMemoryExpansion
}) => {
  const renderMemoryItem = (memory: MemoryFact) => {
    if (!memory || !memory.id) {
      console.warn('[MemoryProcessingControl] Invalid memory object:', memory);
      return null;
    }
    
    const isExpanded = expandedMemoryId === memory.id;
    const memoryContent = memory.memory || 
                          memory.metadata?.data || 
                          '(内容为空或格式错误)';
    
    return (
      <View 
        style={[
          styles.memoryItem, 
          isExpanded && styles.expandedMemoryItem
        ]}
        key={memory.id}
      >
        <TouchableOpacity 
          style={styles.memoryHeader}
          onPress={() => toggleMemoryExpansion(memory.id)}
        >
          <View style={styles.memoryIconContainer}>
            <MaterialCommunityIcons 
              name="brain" 
              size={18} 
              color="#ff9f1c" 
            />
          </View>
          
          <View style={styles.memoryContent}>
            <Text 
              style={styles.memoryText}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {memoryContent}
            </Text>
          </View>
          
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#aaa" 
          />
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.memoryDetails}>
            <View style={styles.memoryMetadata}>
              <Text style={styles.metadataLabel}>创建时间:</Text>
              <Text style={styles.metadataValue}>
                {formatTimestamp(memory.createdAt)}
              </Text>
            </View>
            
            {memory.updatedAt && (
              <View style={styles.memoryMetadata}>
                <Text style={styles.metadataLabel}>更新时间:</Text>
                <Text style={styles.metadataValue}>
                  {formatTimestamp(memory.updatedAt)}
                </Text>
              </View>
            )}
            
            {memory.agentId && (
              <View style={styles.memoryMetadata}>
                <Text style={styles.metadataLabel}>角色ID:</Text>
                <Text style={styles.metadataValue}>{memory.agentId}</Text>
              </View>
            )}
            
            {memory.runId && (
              <View style={styles.memoryMetadata}>
                <Text style={styles.metadataLabel}>会话ID:</Text>
                <Text style={styles.metadataValue}>{memory.runId}</Text>
              </View>
            )}
            
            {memory.metadata?.aiResponse && (
              <View style={styles.memoryMetadata}>
                <Text style={styles.metadataLabel}>AI响应:</Text>
                <Text style={styles.metadataValue}>{memory.metadata.aiResponse}</Text>
              </View>
            )}
            
            <View style={styles.memoryActions}>
              <TouchableOpacity 
                style={[styles.memoryAction, styles.editAction]} 
                onPress={() => onEditMemory(memory)}
              >
                <Ionicons name="pencil" size={16} color="#fff" />
                <Text style={styles.actionText}>编辑</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.memoryAction, styles.deleteAction]} 
                onPress={() => onDeleteMemory(memory)}
              >
                <Ionicons name="trash" size={16} color="#fff" />
                <Text style={styles.actionText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.memoriesContainer}>
      <View style={styles.memoriesHeader}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索记忆内容..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            onSubmitEditing={onSearchSubmit}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={onSearchSubmit}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.memoryActionsHeader}>
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={onRefresh}
            disabled={isRefreshing || isLoading}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#ff9f1c" />
            ) : (
              <Ionicons name="refresh" size={24} color="#fff" />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={onAddMemory}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff9f1c" />
          <Text style={styles.loadingText}>加载记忆中...</Text>
        </View>
      ) : memories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {characterId ? `未找到该角色的记忆` : '请选择角色查看记忆'}
          </Text>
          <TouchableOpacity 
            style={styles.createMemoryButton}
            onPress={onAddMemory}
          >
            <Text style={styles.createMemoryButtonText}>创建新记忆</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.memoriesList}>
          {memories.map(renderMemoryItem)}
        </ScrollView>
      )}
    </View>
  );
};

interface StatsPanelProps {
  dbStats: {
    totalCount: number;
    dbSize: number;
    dbSizeMB: string;
  };
  characterMemoryCount: number;
  characterName: string;
  characterId: string;
  onRefresh: () => void;
  onExportMemories: () => void;
  onImportMemories: () => void;
  isExporting: boolean;
  isImporting: boolean;
}

const StatsPanel: React.FC<StatsPanelProps> = ({
  dbStats,
  characterMemoryCount,
  characterName,
  characterId,
  onRefresh,
  onExportMemories,
  onImportMemories,
  isExporting,
  isImporting
}) => {
  return (
    <ScrollView style={styles.statsScrollView}>
      <View style={styles.statsContainer}>
        <TouchableOpacity style={styles.backupButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.backupButtonText}>刷新统计数据</Text>
        </TouchableOpacity>
        
        <View style={styles.settingSection}>
          <View style={styles.statHeader}>
            <Ionicons name="analytics-outline" size={24} color="#ff9f1c" />
            <Text style={styles.settingSectionTitle}>向量数据库统计</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.settingLabel}>总记忆数量</Text>
            <Text style={styles.statValue}>{dbStats.totalCount} 条</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.settingLabel}>数据库大小</Text>
            <Text style={styles.statValue}>{dbStats.dbSizeMB} MB</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.settingLabel}>平均记忆大小</Text>
            <Text style={styles.statValue}>
              {dbStats.totalCount > 0 
                ? (parseFloat(dbStats.dbSizeMB) / dbStats.totalCount * 1024).toFixed(2) + ' KB'
                : '0 KB'}
            </Text>
          </View>
        </View>
        
        {characterId && (
          <View style={styles.settingSection}>
            <View style={styles.statHeader}>
              <MaterialCommunityIcons name="brain" size={24} color="#ff9f1c" />
              <Text style={styles.settingSectionTitle}>{characterName}的记忆统计</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.settingLabel}>记忆数量</Text>
              <Text style={styles.statValue}>{characterMemoryCount} 条</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.settingLabel}>占总记忆比例</Text>
              <Text style={styles.statValue}>
                {dbStats.totalCount > 0 
                  ? ((characterMemoryCount / dbStats.totalCount) * 100).toFixed(1) + '%'
                  : '0%'}
              </Text>
            </View>
            
            <View style={styles.dataBackupSection}>
              <View style={styles.backupButtonsContainer}>
                <TouchableOpacity 
                  style={[styles.backupButton, styles.exportButton]} 
                  onPress={onExportMemories}
                  disabled={isExporting || characterMemoryCount === 0}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                      <Text style={styles.backupButtonText}>导出记忆</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.backupButton, styles.importButton]} 
                  onPress={onImportMemories}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                      <Text style={styles.backupButtonText}>导入记忆</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              
              <Text style={styles.settingDescription}>
                导出记忆数据到JSON文件，或从备份文件导入记忆
              </Text>
            </View>
          </View>
        )}
        
        <View style={styles.settingSection}>
          <View style={styles.statHeader}>
            <Ionicons name="information-circle-outline" size={24} color="#ff9f1c" />
            <Text style={styles.settingSectionTitle}>建议值</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.settingLabel}>最佳数据库大小</Text>
            <Text style={styles.statValue}>&lt; 50 MB</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.settingLabel}>每个角色记忆</Text>
            <Text style={styles.statValue}>50-200 条</Text>
          </View>
          
          {parseFloat(dbStats.dbSizeMB) > DB_SIZE_WARNING_THRESHOLD && (
            <View style={styles.dbSizeWarningBox}>
              <Ionicons name="warning-outline" size={20} color="#f39c12" />
              <Text style={styles.dbSizeWarningBoxText}>
                数据库大小已超过建议阈值，请考虑删除不必要的记忆
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const formatTimestamp = (timestamp?: string) => {
  if (!timestamp) return '未知时间';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch (e) {
    return timestamp;
  }
};

const styles = StyleSheet.create({
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 9999,
    justifyContent: 'flex-start',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.select({
      ios: 44,
      android: StatusBar.currentHeight || 24,
      default: 24,
    }),
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterInfo: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterInfoText: {
    color: '#ddd',
    fontSize: 14,
  },
  memoryCountBadge: {
    backgroundColor: 'rgba(255, 159, 28, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  memoryCountText: {
    color: '#ff9f1c',
    fontSize: 12,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  tabButton: {
    flex: 1,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  activeTabButton: {
    borderBottomColor: '#ff9f1c',
    backgroundColor: 'transparent',
  },
  tabText: {
    color: '#ccc',
    marginLeft: 8,
    fontSize: 14,
  },
  activeTabText: {
    color: '#ff9f1c',
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  settingsContainer: {
    padding: 16,
  },
  settingsInfoSection: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 16,
  },
  settingsInfoTitle: {
    color: '#ff9f1c',
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 8,
  },
  settingsInfoText: {
    color: '#ddd',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  settingSection: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 16,
  },
  settingSectionTitle: {
    color: '#ff9f1c',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 15,
  },
  settingDescription: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 30,
    textAlign: 'center',
    color: '#aaa',
  },
  currentValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  currentValueLabel: {
    fontSize: 15,
    color: '#fff',
  },
  currentValue: {
    fontSize: 20,
    color: '#ff9f1c',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  actionButton: {
    backgroundColor: '#ff9f1c',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  memoriesContainer: {
    flex: 1,
    padding: 16,
  },
  memoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 15,
    backgroundColor: 'transparent',
  },
  searchButton: {
    backgroundColor: 'rgba(255, 159, 28, 0.2)',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memoryActionsHeader: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  refreshButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(255, 159, 28, 0.2)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memoriesList: {
    flex: 1,
  },
  memoryItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  expandedMemoryItem: {
    backgroundColor: 'rgba(70, 70, 70, 0.8)',
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  memoryIconContainer: {
    marginRight: 12,
  },
  memoryContent: {
    flex: 1,
  },
  memoryText: {
    color: '#fff',
    fontSize: 14,
  },
  memoryDetails: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  memoryMetadata: {
    flexDirection: 'row',
    marginTop: 12,
  },
  metadataLabel: {
    width: 80,
    fontSize: 13,
    color: '#aaa',
  },
  metadataValue: {
    flex: 1,
    fontSize: 13,
    color: '#ddd',
  },
  memoryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  memoryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  editAction: {
    backgroundColor: 'rgba(255, 159, 28, 0.2)',
  },
  deleteAction: {
    backgroundColor: '#e74c3c',
  },
  actionText: {
    color: '#fff',
    marginLeft: 5,
    fontSize: 13,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ddd',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
  },
  createMemoryButton: {
    backgroundColor: '#ff9f1c',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createMemoryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  statsScrollView: {
    flex: 1,
  },
  statsContainer: {
    padding: 16,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statTitle: {
    color: '#ff9f1c',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  statValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dbSizeWarningBox: {
    backgroundColor: 'rgba(255, 159, 28, 0.1)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dbSizeWarningBoxText: {
    color: '#ff9f1c',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  dbSizeWarning: {
    backgroundColor: 'rgba(255, 159, 28, 0.9)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dbSizeAlert: {
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
  },
  dbSizeWarningText: {
    color: 'white',
    marginLeft: 8,
    flex: 1,
  },
  dataBackupSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  backupButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    flex: 0.48,
    backgroundColor: '#ff9f1c',
  },
  exportButton: {
    backgroundColor: '#ff9f1c',
  },
  importButton: {
    backgroundColor: 'rgba(255, 159, 28, 0.2)',
  },
  backupButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editModalContainer: {
    backgroundColor: '#333',
    width: '100%',
    maxWidth: 400,
    borderRadius: 10,
    padding: 20,
    borderColor: 'rgba(255, 159, 28, 0.3)',
    borderWidth: 1,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff9f1c',
  },
  editModalInput: {
    backgroundColor: '#444',
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  editModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
  },
  cancelButton: {
    backgroundColor: '#555',
  },
  saveButton: {
    backgroundColor: '#ff9f1c',
  },
  editModalButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default MemoryProcessingControl;
