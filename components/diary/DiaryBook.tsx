import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Character, DiaryEntry, DiarySettings, } from '@/shared/types';
import { DiaryService } from '@/services/diary-service';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { theme } from '@/constants/theme';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface DiaryBookProps {
  character: Character;
  onClose: () => void;
}

const DiaryBook: React.FC<DiaryBookProps> = ({ character, onClose }) => {
  const [activeTab, setActiveTab] = useState<'entries' | 'settings'>('entries');
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState<DiarySettings>({
    enabled: true, // 默认为开启
    reflectionGoal: "思考如何更好地与用户建立情感连接",
    wordCount: 300,
    contextWeight: 5,
    characterWeight: 4,
    worldInfoWeight: 2,
    strategicWeight: 3,
    confidenceThreshold: 0.7,
    triggerInterval: 'daily',
    triggerTime: '20:00',
    circleMemoryWeight: 2,
    circleMemoryCount: 5,
  });
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [circleMemoryCount, setCircleMemoryCount] = useState<number>(0);
  const [isLoadingCircleMemory, setIsLoadingCircleMemory] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [hasGeneratedTodaysDiary, setHasGeneratedTodaysDiary] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        const entries = await DiaryService.getDiaryEntriesByCharacterId(character.id);
        setDiaryEntries(entries.sort((a, b) => b.createdAt - a.createdAt));
        
        // Check if there's a diary for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysDiary = entries.find(entry => {
          const entryDate = new Date(entry.createdAt);
          entryDate.setHours(0, 0, 0, 0);
          return entryDate.getTime() === today.getTime();
        });
        
        setHasGeneratedTodaysDiary(!!todaysDiary);

        const savedSettings = await DiaryService.getDiarySettings(character.id);
        if (savedSettings) {
          setSettings(prev => ({
            ...prev,
            ...savedSettings,
            enabled: savedSettings.enabled !== undefined ? savedSettings.enabled : true // 保证默认启用
          }));
        } else {
          setSettings(prev => ({
            ...prev,
            enabled: true // 没有保存时也默认启用
          }));
        }

        try {
          setIsLoadingCircleMemory(true);
          const circleMemories = await StorageAdapter.getCircleMemories(character.id);
          setCircleMemoryCount(circleMemories.length);
        } catch (error) {
          console.error('[DiaryBook] Error loading circle memories:', error);
        } finally {
          setIsLoadingCircleMemory(false);
        }
      } catch (error) {
        console.error('[DiaryBook] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [character.id]);

  const handleGenerateDiary = async () => {
    try {
      // Check if a diary has already been generated for today
      if (hasGeneratedTodaysDiary) {
        Alert.alert(
          '已存在今日日记',
          '今天已经生成了日记。你想重新生成今天的日记吗？',
          [
            {
              text: '取消',
              style: 'cancel',
            },
            {
              text: '重新生成',
              onPress: () => regenerateTodaysDiary(),
            },
          ]
        );
        return;
      }

      setIsGenerating(true);

      await DiaryService.saveDiarySettings(character.id, settings);

      const entry = await DiaryService.generateDiaryEntry({
        ...character,
        diarySettings: settings,
      });

      if (entry) {
        await DiaryService.updateLastTriggered(character.id);
        setDiaryEntries([entry, ...diaryEntries]);
        setActiveTab('entries');
        setHasGeneratedTodaysDiary(true);
      } else {
        Alert.alert('生成失败', '无法生成日记条目，请检查API设置后重试');
      }
    } catch (error) {
      console.error('[DiaryBook] Error generating diary:', error);
      Alert.alert('错误', '生成日记时发生错误');
    } finally {
      setIsGenerating(false);
    }
  };

  // Function to regenerate today's diary
  const regenerateTodaysDiary = async () => {
    try {
      // Find and remove today's diary entry
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysDiary = diaryEntries.find(entry => {
        const entryDate = new Date(entry.createdAt);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === today.getTime();
      });
      
      if (todaysDiary) {
        // Delete the existing entry
        await DiaryService.deleteDiaryEntry(character.id, todaysDiary.id);
        
        // Remove from state
        const updatedEntries = diaryEntries.filter(entry => entry.id !== todaysDiary.id);
        setDiaryEntries(updatedEntries);
      }
      
      setHasGeneratedTodaysDiary(false);
      
      // Now generate a new entry
      setIsGenerating(true);

      await DiaryService.saveDiarySettings(character.id, settings);

      const entry = await DiaryService.generateDiaryEntry({
        ...character,
        diarySettings: settings,
      });

      if (entry) {
        await DiaryService.updateLastTriggered(character.id);
        setDiaryEntries([entry, ...diaryEntries.filter(e => e.id !== todaysDiary?.id)]);
        setActiveTab('entries');
        setHasGeneratedTodaysDiary(true);
      } else {
        Alert.alert('生成失败', '无法生成日记条目，请检查API设置后重试');
      }
    } catch (error) {
      console.error('[DiaryBook] Error regenerating diary:', error);
      Alert.alert('错误', '重新生成日记时发生错误');
    } finally {
      setIsGenerating(false);
    }
  };

  // Function to delete a diary entry
  const deleteDiaryEntry = async (entryId: string) => {
    try {
      setIsDeletingEntry(true);
      
      // Call the service to delete the entry
      await DiaryService.deleteDiaryEntry(character.id, entryId);
      
      // Update the state to reflect the deletion
      const updatedEntries = diaryEntries.filter(entry => entry.id !== entryId);
      setDiaryEntries(updatedEntries);
      
      // Check if the deleted entry was today's entry
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const deletedEntry = diaryEntries.find(entry => entry.id === entryId);
      if (deletedEntry) {
        const entryDate = new Date(deletedEntry.createdAt);
        entryDate.setHours(0, 0, 0, 0);
        if (entryDate.getTime() === today.getTime()) {
          setHasGeneratedTodaysDiary(false);
        }
      }
      
      // Close the confirmation dialog
      setSelectedEntry(null);
      
      // Show success message
      Alert.alert('删除成功', '日记条目已成功删除');
    } catch (error) {
      console.error('[DiaryBook] Error deleting diary entry:', error);
      Alert.alert('删除失败', '删除日记条目时发生错误');
    } finally {
      setIsDeletingEntry(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await DiaryService.saveDiarySettings(character.id, settings);
      Alert.alert('成功', '日记设置已保存');
    } catch (error) {
      console.error('[DiaryBook] Error saving settings:', error);
      Alert.alert('错误', '保存设置时发生错误');
    }
  };

  const showTimePicker = () => {
    setTimePickerVisible(true);
  };

  const hideTimePicker = () => {
    setTimePickerVisible(false);
  };

  const handleTimeConfirm = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    setSettings({
      ...settings,
      triggerTime: `${hours}:${minutes}`,
    });
    hideTimePicker();
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  };

  const showDeleteConfirmation = (entry: DiaryEntry) => {
    setSelectedEntry(entry);
    Alert.alert(
      '确认删除',
      '确定要删除这条日记吗？此操作无法撤销。',
      [
        {
          text: '取消',
          style: 'cancel',
          onPress: () => setSelectedEntry(null),
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => entry && deleteDiaryEntry(entry.id),
        },
      ]
    );
  };

  const renderDiaryEntry = (entry: DiaryEntry) => {
    const date = new Date(entry.createdAt);
    const formattedDate = date.toLocaleDateString('zh-CN');
    const formattedTime = date.toLocaleTimeString('zh-CN');
    const timeAgo = formatDistanceToNow(date, { addSuffix: true, locale: zhCN });

    const hasCircleMemoryWeight = (entry.circleMemoryWeight || 0) > 0;

    // Check if this entry is from today
    const isToday = () => {
      const today = new Date();
      return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
    };

    return (
      <View key={entry.id} style={styles.diaryEntryContainer}>
        <View style={styles.diaryEntryHeader}>
          <Text style={styles.diaryEntryDate}>
            {formattedDate} {formattedTime}
            {isToday() && <Text style={styles.todayIndicator}> (今天)</Text>}
          </Text>
          <Text style={styles.diaryEntryTimeAgo}>{timeAgo}</Text>
        </View>

        <View style={styles.diaryEntryGoal}>
          <Ionicons name="flag-outline" size={16} color="#FFD700" />
          <Text style={styles.diaryEntryGoalText}>{entry.reflectionGoal || '日常反思'}</Text>
        </View>

        <View style={styles.reflectionWeights}>
          <View style={styles.weightTag}>
            <Text style={styles.weightTagText}>聊天: {entry.contextWeight}/10</Text>
          </View>
          <View style={styles.weightTag}>
            <Text style={styles.weightTagText}>角色: {entry.characterWeight}/10</Text>
          </View>
          <View style={styles.weightTag}>
            <Text style={styles.weightTagText}>世界: {entry.worldInfoWeight}/10</Text>
          </View>
          <View style={styles.weightTag}>
            <Text style={styles.weightTagText}>策略: {entry.strategicWeight}/10</Text>
          </View>
          {hasCircleMemoryWeight && (
            <View style={[styles.weightTag, styles.circleMemoryTag]}>
              <Text style={styles.weightTagText}>朋友圈: {entry.circleMemoryWeight}/10 ({entry.circleMemoryCount || 0}条)</Text>
            </View>
          )}
        </View>

        <View style={styles.diaryEntryContent}>
          <Text style={styles.diaryEntryText}>{entry.content}</Text>
        </View>
        
        {/* Add Delete Button */}
        <View style={styles.entryActionsContainer}>
          {isToday() && (
            <TouchableOpacity
              style={styles.regenerateButton}
              onPress={() => regenerateTodaysDiary()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.entryActionButtonText}>重新生成</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => showDeleteConfirmation(entry)}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.entryActionButtonText}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEntriesTab = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      );
    }

    if (diaryEntries.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={64} color="#888" />
          <Text style={styles.emptyText}>尚无日记条目</Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={handleGenerateDiary}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="black" />
                <Text style={styles.generateButtonText}>创建新日记</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.entriesContainer}>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={handleGenerateDiary}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={24} color="black" />
          )}
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.entriesScrollContent}>
          {diaryEntries.map(renderDiaryEntry)}
        </ScrollView>
      </View>
    );
  };

  const renderSettingsTab = () => {
    return (
      <ScrollView style={styles.settingsContainer} contentContainerStyle={styles.settingsContent}>
        <View style={styles.settingSection}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>启用日记系统</Text>
            <Switch
              value={settings.enabled}
              onValueChange={(value) => setSettings({ ...settings, enabled: value })}
              trackColor={{ false: '#767577', true: theme.colors.primary }}
              thumbColor={settings.enabled ? theme.colors.primary : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.settingSection}>
          <Text style={styles.settingHeading}>日记内容设置</Text>

          <Text style={styles.settingLabel}>反思目标</Text>
          <TextInput
            style={styles.textInput}
            value={settings.reflectionGoal}
            onChangeText={(text) => setSettings({ ...settings, reflectionGoal: text })}
            placeholder="例如：思考如何更好地与用户建立情感连接"
            placeholderTextColor="#999"
          />

          <Text style={styles.settingLabel}>日记字数 ({settings.wordCount}字)</Text>
          <Slider
            style={styles.slider}
            value={settings.wordCount}
            onValueChange={(value) => setSettings({ ...settings, wordCount: Math.round(value) })}
            minimumValue={100}
            maximumValue={1000}
            step={50}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#ddd"
            thumbTintColor="#ff9f1c" 
          />
        </View>

        <View style={styles.settingSection}>
          <Text style={styles.settingHeading}>反思维度权重</Text>

          <Text style={styles.settingLabel}>聊天上下文权重: {settings.contextWeight}/10</Text>
          <Slider
            style={styles.slider}
            value={settings.contextWeight}
            onValueChange={(value) => setSettings({ ...settings, contextWeight: Math.round(value) })}
            minimumValue={1}
            maximumValue={10}
            step={1}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#ddd"
            thumbTintColor={theme.colors.primary}
          />

          <Text style={styles.settingLabel}>角色设定权重: {settings.characterWeight}/10</Text>
          <Slider
            style={styles.slider}
            value={settings.characterWeight}
            onValueChange={(value) => setSettings({ ...settings, characterWeight: Math.round(value) })}
            minimumValue={1}
            maximumValue={10}
            step={1}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#ddd"
            thumbTintColor={theme.colors.primary}
          />

          <Text style={styles.settingLabel}>世界信息权重: {settings.worldInfoWeight}/10</Text>
          <Slider
            style={styles.slider}
            value={settings.worldInfoWeight}
            onValueChange={(value) => setSettings({ ...settings, worldInfoWeight: Math.round(value) })}
            minimumValue={1}
            maximumValue={10}
            step={1}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#ddd"
            thumbTintColor={theme.colors.primary}
          />

          <Text style={styles.settingLabel}>策略调整权重: {settings.strategicWeight}/10</Text>
          <Slider
            style={styles.slider}
            value={settings.strategicWeight}
            onValueChange={(value) => setSettings({ ...settings, strategicWeight: Math.round(value) })}
            minimumValue={1}
            maximumValue={10}
            step={1}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#ddd"
            thumbTintColor={theme.colors.primary}
          />

          <Text style={styles.settingLabel}>朋友圈记忆权重: {settings.circleMemoryWeight || 2}/10</Text>
          <Slider
            style={styles.slider}
            value={settings.circleMemoryWeight || 2}
            onValueChange={(value) => setSettings({ ...settings, circleMemoryWeight: Math.round(value) })}
            minimumValue={0}
            maximumValue={10}
            step={1}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#ddd"
            thumbTintColor={theme.colors.primary}
          />

          {(settings.circleMemoryWeight || 0) > 0 && (
            <View style={styles.circleMemorySection}>
              <Text style={styles.settingLabel}>
                朋友圈记忆条数: {settings.circleMemoryCount || 5}
                {isLoadingCircleMemory ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 10 }} />
                ) : (
                  <Text style={styles.circleMemoryCount}> (可用: {circleMemoryCount})</Text>
                )}
              </Text>
              <Slider
                style={styles.slider}
                value={settings.circleMemoryCount || 5}
                onValueChange={(value) => setSettings({ ...settings, circleMemoryCount: Math.round(value) })}
                minimumValue={1}
                maximumValue={20}
                step={1}
                minimumTrackTintColor={theme.colors.primary}
                maximumTrackTintColor="#ddd"
                thumbTintColor={theme.colors.primary}
              />
              <Text style={styles.circleMemoryHelp}>
                设置在日记中回顾的最近朋友圈记忆条数，数值越大包含的历史越多
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
          <Ionicons name="save-outline" size={20} color="black" />
          <Text style={styles.saveButtonText}>保存设置</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{character.name}的日记本</Text>
        <View style={styles.rightHeader} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'entries' && styles.activeTab]}
          onPress={() => setActiveTab('entries')}
        >
          <Text style={[styles.tabText, activeTab === 'entries' && styles.activeTabText]}>日记</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.activeTab]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>设置</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'entries' ? renderEntriesTab() : renderSettingsTab()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(30,30,30,0.98)', // MemoOverlay深色
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  rightHeader: {
    width: 40,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#ff9f1c',
    backgroundColor: 'rgba(255, 224, 195, 0.04)',
  },
  tabText: {
    fontSize: 15,
    color: '#ccc',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  activeTabText: {
    color: '#ff9f1c',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#ccc',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    color: '#ccc',
    fontSize: 18,
    textAlign: 'center',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 20,
  },
  generateButtonText: {
    color: 'black',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  entriesContainer: {
    flex: 1,
  },
  entriesScrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  diaryEntryContainer: {
    backgroundColor: 'rgba(60,60,60,0.6)', // 标准MemoOverlay卡片色
    borderRadius: 14,
    marginBottom: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9f1c', // MemoOverlay主色
    // 统一阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  diaryEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  diaryEntryDate: {
    color: '#fff', // 更亮
    fontSize: 14,
  },
  todayIndicator: {
    color: '#ff9f1c',
    fontWeight: 'bold',
  },
  diaryEntryTimeAgo: {
    color: '#ff9f1c',
    fontSize: 12,
  },
  diaryEntryGoal: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 224, 195, 0.12)', // MemoOverlay通知色
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  diaryEntryGoalText: {
    color: '#ff9f1c',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  diaryEntryContent: {
    backgroundColor: 'rgba(30,30,30,0.98)', // MemoOverlay深色
    borderRadius: 8,
    padding: 12,
  },
  diaryEntryText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 24,
  },
  entryActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 10,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff9f1c',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  entryActionButtonText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  reflectionWeights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 6,
  },
  weightTag: {
    backgroundColor: 'rgba(255, 224, 195, 0.12)', // MemoOverlay通知色
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  weightTagText: {
    color: '#ff9f1c',
    fontSize: 12,
    fontWeight: 'bold',
  },
  circleMemoryTag: {
    backgroundColor: 'rgba(138, 43, 226, 0.18)',
  },
  floatingButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 10,
  },
  settingsContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  settingsContent: {
    padding: 16,
    paddingBottom: 40,
  },
  settingSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(60,60,60,0.6)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  settingHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff9f1c',
    marginBottom: 16,
    letterSpacing: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settingLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  settingDescription: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
  textInput: {
    backgroundColor: 'rgba(51,51,51,0.8)',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  intervalOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: '#222',
    marginHorizontal: 4,
    borderRadius: 8,
  },
  intervalOptionSelected: {
    backgroundColor: theme.colors.primaryDark,
  },
  intervalOptionText: {
    color: '#ccc',
    fontSize: 14,
  },
  intervalOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  timePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  timePickerButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9f1c',
    paddingVertical: 14,
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  saveButtonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
    letterSpacing: 1,
  },
  circleMemorySection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  circleMemoryCount: {
    color: '#aaa',
    fontSize: 12,
  },
  circleMemoryHelp: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
    fontStyle: 'italic',
  },
});

export default DiaryBook;
