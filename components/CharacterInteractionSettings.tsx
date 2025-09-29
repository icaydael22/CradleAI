import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  Switch,
  ActivityIndicator,
  Platform,
  ScrollView,
  Dimensions,
  TextInput,
  StatusBar
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Character } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { theme } from '@/constants/theme';
import { 
  Ionicons, 
  MaterialIcons, 
  MaterialCommunityIcons, 
  AntDesign,
  Feather,
  FontAwesome
} from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system'; // 新增
import { CircleScheduler } from '@/services/circle-scheduler'; // Add import

const { height, width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

interface CharacterInteractionSettingsProps {
  isVisible: boolean;
  onClose: () => void;
}

// Helper to get bytes size of a string
const getStringByteSize = (str: string): number => {
  return new Blob([str]).size;
};

// Format bytes to readable format
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
};

// Format timestamp to readable date
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

// Tab enum for better type safety
enum TabType {
  GENERAL = 'general',
  MEMORY = 'memory',
  SCHEDULE = 'schedule'
}

const CharacterInteractionSettings: React.FC<CharacterInteractionSettingsProps> = ({
  isVisible,
  onClose
}) => {
  // State management
  const { characters, updateCharacter } = useCharacters();
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(TabType.GENERAL);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Memory management states
  const [isMemoryModalVisible, setIsMemoryModalVisible] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [circleMemories, setCircleMemories] = useState<any[]>([]);
  const [memoryStats, setMemoryStats] = useState<{
    count: number;
    totalSize: number;
    oldestDate: number | null;
    newestDate: number | null;
  }>({
    count: 0,
    totalSize: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [memoryDeleteLoading, setMemoryDeleteLoading] = useState<string | null>(null);

  // Post scheduling states
  const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
  const [selectedCharacterForSchedule, setSelectedCharacterForSchedule] = useState<Character | null>(null);
  const [scheduledTimes, setScheduledTimes] = useState<Record<string, string[]>>({});
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  // Filter characters based on search query
  const filteredCharacters = searchQuery.trim() 
    ? characters.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : characters;

  // Load scheduled times and notification settings when component mounts
  useEffect(() => {
    loadScheduledTimes();
    checkNotificationSettings();
    
    // Initialize scheduler state when component mounts
    initializeScheduler();
  }, []);

  // Add method to initialize scheduler
  const initializeScheduler = async () => {
    try {
      const scheduler = CircleScheduler.getInstance();
      await scheduler.refreshSchedulerState();
    } catch (error) {
      console.error('初始化调度器失败:', error);
    }
  };

  // Check if notifications are already enabled
  const checkNotificationSettings = async () => {
    try {
      const notificationSettings = await AsyncStorage.getItem('circle_notifications_enabled');
      setNotificationsEnabled(notificationSettings === 'true');
    } catch (error) {
      console.error('获取通知设置失败:', error);
    }
  };

  // Load scheduled times from characters
  const loadScheduledTimes = async () => {
    try {
      const scheduledTimes: Record<string, string[]> = {};
      
      // Load times from character objects
      characters.forEach(character => {
        if (character.circleScheduledTimes?.length) {
          scheduledTimes[character.id] = character.circleScheduledTimes;
        }
      });
      
      // If no times found in characters, try loading from legacy storage
      if (Object.keys(scheduledTimes).length === 0) {
        const storedTimes = await AsyncStorage.getItem('character_scheduled_times');
        if (storedTimes) {
          const legacyTimes = JSON.parse(storedTimes);
          setScheduledTimes(legacyTimes);
          
          // Migrate legacy times to character objects
          for (const [characterId, times] of Object.entries(legacyTimes)) {
            const character = characters.find(c => c.id === characterId);
            if (character) {
              const updatedCharacter = {
                ...character,
                circleScheduledTimes: times as string[]
              };
              updateCharacter(updatedCharacter);
            }
          }
          
          // Remove legacy storage after migration
          await AsyncStorage.removeItem('character_scheduled_times');
          return;
        }
      }
      
      setScheduledTimes(scheduledTimes);
    } catch (error) {
      console.error('加载角色发布时间设置失败:', error);
    }
  };

  // Save scheduled times to character object
  const saveScheduledTimes = async (newScheduledTimes: Record<string, string[]>) => {
    try {
      setScheduledTimes(newScheduledTimes);
      
      // Update times in character objects
      for (const [idKey, times] of Object.entries(newScheduledTimes)) {
        // Find character by id or conversationId
        const character = characters.find(c => c.id === idKey || c.conversationId === idKey);
        if (character) {
          const updatedCharacter = {
            ...character,
            circleScheduledTimes: times
          };
          await updateCharacter(updatedCharacter);
        }
      }
      
      // For backward compatibility, still save to AsyncStorage
      await AsyncStorage.setItem('character_scheduled_times', JSON.stringify(newScheduledTimes));
      
      // Refresh scheduler state after saving
      try {
        const scheduler = CircleScheduler.getInstance();
        await scheduler.refreshSchedulerState();
        console.log('已更新调度器状态');
      } catch (error) {
        console.error('更新调度器状态失败:', error);
      }
    } catch (error) {
      console.error('保存角色发布时间设置失败:', error);
      Alert.alert('错误', '无法保存时间设置');
    }
  };

  // Request notification permissions
  const handleNotificationToggle = async () => {
    try {
      const newStatus = !notificationsEnabled;
      if (newStatus) {
        setNotificationsEnabled(true);
        await AsyncStorage.setItem('circle_notifications_enabled', 'true');
        Alert.alert('通知已启用', '你将收到角色发布朋友圈的通知（通知功能已被临时禁用）');
      } else {
        setNotificationsEnabled(false);
        await AsyncStorage.setItem('circle_notifications_enabled', 'false');
      }
    } catch (error) {
      console.error('切换通知状态失败:', error);
      Alert.alert('错误', '无法更新通知设置');
    }
  };

  // Handle circle interaction toggle
  const handleCircleInteractionToggle = async (character: Character) => {
    try {
      setLoading(character.id);
      
      const updatedCharacter = {
        ...character,
        circleInteraction: !character.circleInteraction
      };
      
      // If enabling, set default values if they don't exist
      if (!character.circleInteraction) {
        updatedCharacter.circlePostFrequency = character.circlePostFrequency || 'medium';
        updatedCharacter.circleInteractionFrequency = character.circleInteractionFrequency || 'medium';
        updatedCharacter.circleStats = character.circleStats || {
          repliedToCharacters: {},
          repliedToPostsCount: 0,
          repliedToCommentsCount: {}
        };
      } else {
        // If disabling, clear scheduled times for this character
        const newScheduledTimes = { ...scheduledTimes };
        delete newScheduledTimes[character.id];
        if (character.conversationId) {
          delete newScheduledTimes[character.conversationId];
        }
        
        // Clear scheduled times from character
        updatedCharacter.circleScheduledTimes = [];
        
        // Save updated scheduled times
        await saveScheduledTimes(newScheduledTimes);
      }
      
      await updateCharacter(updatedCharacter);
      
      // Automatically expand settings when enabling circle interaction
      if (!character.circleInteraction) {
        setExpandedCharacterId(character.id);
      }
      // If disabling and this character's settings were expanded, collapse them
      else if (expandedCharacterId === character.id) {
        setExpandedCharacterId(null);
      }
    } catch (error) {
      console.error('更新角色朋友圈设置失败:', error);
      Alert.alert('错误', '无法更新朋友圈设置');
    } finally {
      setLoading(null);
    }
  };
  
  // Handle relationship toggle
  const handleRelationshipToggle = async (character: Character) => {
    try {
      setLoading(character.id);
      
      const updatedCharacter = {
        ...character,
        relationshipEnabled: !character.relationshipEnabled
      };
      
      await updateCharacter(updatedCharacter);
    } catch (error) {
      console.error('更新角色关系设置失败:', error);
      Alert.alert('错误', '无法更新关系设置');
    } finally {
      setLoading(null);
    }
  };

  // Handle frequency changes for circle posts and interactions
  const handleFrequencyChange = async (
    character: Character, 
    type: 'circlePostFrequency' | 'circleInteractionFrequency', 
    value: 'low' | 'medium' | 'high'
  ) => {
    try {
      setLoading(character.id);
      
      const updatedCharacter = {
        ...character,
        [type]: value
      };
      
      await updateCharacter(updatedCharacter);
    } catch (error) {
      console.error('更新角色频率设置失败:', error);
      Alert.alert('错误', '无法更新频率设置');
    } finally {
      setLoading(null);
    }
  };

  // Get frequency description text
  const getFrequencyDescription = (type: 'circlePostFrequency' | 'circleInteractionFrequency', value: string | undefined) => {
    switch (value) {
      case 'low': return type === 'circlePostFrequency' ? '低 (1次/天)' : '低 (有限互动)';
      case 'medium': return type === 'circlePostFrequency' ? '中 (3次/天)' : '中 (标准互动)';
      case 'high': return type === 'circlePostFrequency' ? '高 (5次/天)' : '高 (频繁互动)';
      default: return '中 (标准)';
    }
  };

  // Function to load circle memory for a character
  const loadCircleMemory = async (character: Character) => {
    try {
      setIsLoadingMemory(true);
      setSelectedCharacter(character);
  
      const storageKey = `nodest_${character.id}_circle_memory`;
  
      // 优先尝试通过 FileSystem 读取
      let memoryData: string | null = null;
      const fsDir = FileSystem.documentDirectory + 'nodest_characters/';
      const fsPath = fsDir + storageKey + '.json';
      try {
        const fileInfo = await FileSystem.getInfoAsync(fsPath);
        if (fileInfo.exists) {
          memoryData = await FileSystem.readAsStringAsync(fsPath, { encoding: FileSystem.EncodingType.UTF8 });
        }
      } catch (e) {
        // ignore, fallback to AsyncStorage
      }
  
      // 如果 FileSystem 没有，降级用 AsyncStorage
      if (!memoryData) {
        memoryData = await AsyncStorage.getItem(storageKey);
      }
  
      if (memoryData) {
        const memories = JSON.parse(memoryData);
        setCircleMemories(memories);
  
        // Calculate memory stats
        let totalSize = getStringByteSize(memoryData);
        let oldestDate = null;
        let newestDate = null;
  
        if (memories.length > 0) {
          // Find oldest and newest entries
          oldestDate = Math.min(...memories.map((m: any) => m.timestamp));
          newestDate = Math.max(...memories.map((m: any) => m.timestamp));
        }
  
        setMemoryStats({
          count: memories.length,
          totalSize,
          oldestDate,
          newestDate
        });
      } else {
        setCircleMemories([]);
        setMemoryStats({
          count: 0,
          totalSize: 0,
          oldestDate: null,
          newestDate: null
        });
      }
  
      setIsMemoryModalVisible(true);
    } catch (error) {
      console.error('加载角色朋友圈记忆失败:', error);
      Alert.alert('错误', '无法加载朋友圈记忆');
    } finally {
      setIsLoadingMemory(false);
    }
  };
  
  // Delete a specific memory entry
  const deleteMemoryEntry = async (index: number) => {
    if (!selectedCharacter) return;
    
    try {
      setMemoryDeleteLoading(`entry-${index}`);
      
      // Prepare storage key
      const storageKey = `nodest_${selectedCharacter.id}_circle_memory`;

      // Create a new array without the deleted entry
      const updatedMemories = [...circleMemories];
      updatedMemories.splice(index, 1);

      // Save updated memories to AsyncStorage
      await AsyncStorage.setItem(storageKey, JSON.stringify(updatedMemories));

      // Also save to FileSystem if file exists
      const fsDir = FileSystem.documentDirectory + 'nodest_characters/';
      const fsPath = fsDir + storageKey + '.json';
      try {
        const fileInfo = await FileSystem.getInfoAsync(fsPath);
        if (fileInfo.exists) {
          await FileSystem.writeAsStringAsync(fsPath, JSON.stringify(updatedMemories), { encoding: FileSystem.EncodingType.UTF8 });
        }
      } catch (e) {
        // ignore
      }

      // Update state
      setCircleMemories(updatedMemories);

      // Update stats
      const memoriesJson = JSON.stringify(updatedMemories);
      setMemoryStats({
        count: updatedMemories.length,
        totalSize: getStringByteSize(memoriesJson),
        oldestDate: updatedMemories.length > 0 ? Math.min(...updatedMemories.map(m => m.timestamp)) : null,
        newestDate: updatedMemories.length > 0 ? Math.max(...updatedMemories.map(m => m.timestamp)) : null
      });
    } catch (error) {
      console.error('删除记忆条目失败:', error);
      Alert.alert('错误', '无法删除记忆条目');
    } finally {
      setMemoryDeleteLoading(null);
    }
  };

  // Delete all memory entries for a character
  const clearAllMemories = async () => {
    if (!selectedCharacter) return;
    
    Alert.alert(
      '确认清除',
      `确定要清除 ${selectedCharacter.name} 的所有朋友圈记忆吗？此操作不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            try {
              setMemoryDeleteLoading('all');
              
              // Prepare storage key
              const storageKey = `nodest_${selectedCharacter.id}_circle_memory`;
              
              // Clear memory by setting empty array
              await AsyncStorage.setItem(storageKey, JSON.stringify([]));

              // Also clear FileSystem file if it exists (bugfix)
              const fsDir = FileSystem.documentDirectory + 'nodest_characters/';
              const fsPath = fsDir + storageKey + '.json';
              try {
                const fileInfo = await FileSystem.getInfoAsync(fsPath);
                if (fileInfo.exists) {
                  await FileSystem.writeAsStringAsync(fsPath, JSON.stringify([]), { encoding: FileSystem.EncodingType.UTF8 });
                }
              } catch (e) {
                // ignore
              }
              
              // Update state
              setCircleMemories([]);
              
              // Update stats
              setMemoryStats({
                count: 0,
                totalSize: 0,
                oldestDate: null,
                newestDate: null
              });
            } catch (error) {
              console.error('清除所有记忆失败:', error);
              Alert.alert('错误', '无法清除所有记忆');
            } finally {
              setMemoryDeleteLoading(null);
            }
          }
        }
      ]
    );
  };

  // Check memory size for a character
  const checkMemorySize = async (character: Character) => {
    try {
      setLoading(character.id);
      
      const storageKey = `nodest_${character.id}_circle_memory`;
      const memoryData = await AsyncStorage.getItem(storageKey);
      
      if (memoryData) {
        const memories = JSON.parse(memoryData);
        const size = getStringByteSize(memoryData);
        
        Alert.alert(
          '朋友圈记忆状态',
          `${character.name} 的朋友圈记忆:\n条目数量: ${memories.length}\n存储大小: ${formatBytes(size)}\n\n点击"管理"按钮可查看详情和清理记忆。`
        );
      } else {
        Alert.alert('朋友圈记忆状态', `${character.name} 没有朋友圈记忆记录。`);
      }
    } catch (error) {
      console.error('检查记忆大小失败:', error);
      Alert.alert('错误', '无法检查记忆大小');
    } finally {
      setLoading(null);
    }
  };

  // Open schedule modal for a character
  const openScheduleModal = (character: Character) => {
    setSelectedCharacterForSchedule(character);
    setIsScheduleModalVisible(true);
  };

  // Handle adding a new scheduled time
  const addScheduledTime = () => {
    if (!selectedCharacterForSchedule) return;
    
    setShowTimePicker(true);
  };

  // Handle time selection
  const handleTimeChange = (event: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    
    if (selectedDate && selectedCharacterForSchedule) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      // Check if this time already exists for the character
      const characterTimes = scheduledTimes[selectedCharacterForSchedule.id] || [];
      if (characterTimes.includes(timeString)) {
        Alert.alert('时间已存在', '该角色已有此发布时间');
        return;
      }
      
      // Add the new time to the character's schedule
      const newScheduledTimes = { 
        ...scheduledTimes,
        [selectedCharacterForSchedule.id]: [...characterTimes, timeString].sort()
      };
      
      saveScheduledTimes(newScheduledTimes);
      
      // Update the character directly
      const updatedCharacter = {
        ...selectedCharacterForSchedule,
        circleScheduledTimes: newScheduledTimes[selectedCharacterForSchedule.id]
      };
      updateCharacter(updatedCharacter);
    }
  };

  // Remove a scheduled time - updating this function to improve UX
  const removeScheduledTime = (characterId: string, timeToRemove: string) => {
    // Show confirmation dialog before removing
    Alert.alert(
      '确认取消定时发布',
      `确定要取消 ${formatTimeForDisplay(timeToRemove)} 的定时发布任务吗？`,
      [
        {
          text: '取消',
          style: 'cancel'
        },
        {
          text: '确定删除',
          style: 'destructive',
          onPress: async () => {
            try {
              // Set loading state (optional - you could add a loading indicator)
              setLoading(characterId);
              
              const characterTimes = scheduledTimes[characterId] || [];
              const newTimes = characterTimes.filter(time => time !== timeToRemove);
              
              const newScheduledTimes = {
                ...scheduledTimes,
                [characterId]: newTimes
              };
              
              await saveScheduledTimes(newScheduledTimes);
              
              // Update the character directly
              const character = characters.find(c => c.id === characterId);
              if (character) {
                const updatedCharacter = {
                  ...character,
                  circleScheduledTimes: newTimes
                };
                await updateCharacter(updatedCharacter);

                Alert.alert('已删除', `已成功取消 ${formatTimeForDisplay(timeToRemove)} 的定时发布任务`);
              }
            } catch (error) {
              console.error('删除定时发布任务失败:', error);
              Alert.alert('错误', '无法删除定时发布任务，请稍后再试');
            } finally {
              setLoading(null);
            }
          }
        }
      ]
    );
  };

  // Render each time item with delete button
  const renderTimeItem = (time: string, index: number, characterId: string) => {
    return (
      <Animated.View 
        key={`${time}-${index}`} 
        style={styles.timeItem}
        entering={FadeInDown.delay(index * 100).duration(300)}
      >
        <View style={styles.timeDisplay}>
          <MaterialCommunityIcons 
            name="clock-time-four-outline" 
            size={18} 
            color={theme.colors.accent} 
          />
          <Text style={styles.timeText}>{formatTimeForDisplay(time)}</Text>
        </View>
        <TouchableOpacity 
          style={styles.removeTimeButton}
          onPress={() => removeScheduledTime(characterId, time)}
        >
          <Ionicons name="close-circle" size={20} color={theme.colors.danger} />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Format time for display
  const formatTimeForDisplay = (timeString: string): string => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    
    if (Platform.OS === 'ios') {
      // Use 12-hour format with AM/PM for iOS
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      return `${displayHour}:${minutes} ${period}`;
    } else {
      // Use 24-hour format for Android
      return timeString;
    }
  };

  // Render scheduled times modal - improving the UI for better user experience
  const renderScheduleModal = () => {
    if (!selectedCharacterForSchedule) return null;
    
    const characterTimes = scheduledTimes[selectedCharacterForSchedule.id] || [];
    const isLoading = loading === selectedCharacterForSchedule.id;
    
    return (
      <Modal
        visible={isScheduleModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsScheduleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.scheduleModalTitle}>
                {selectedCharacterForSchedule.name} 的发布时间
              </Text>
              <TouchableOpacity 
                onPress={() => setIsScheduleModalVisible(false)} 
                style={styles.closeButton}
                disabled={isLoading}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.scheduleDescription}>
              设置角色每天自动发布朋友圈的固定时间。每天到达设定时间点，角色将自动发布朋友圈内容。
              点击时间右侧的删除按钮可取消定时发布。
            </Text>
            
            {isLoading && (
              <View style={styles.scheduleLoading}>
                <ActivityIndicator size="small" color="#ff9f1c" />
                <Text style={styles.scheduleLoadingText}>处理中...</Text>
              </View>
            )}
            
            <ScrollView style={styles.timesList}>
              {characterTimes.length > 0 ? (
                characterTimes.map((time, index) => 
                  renderTimeItem(time, index, selectedCharacterForSchedule.id)
                )
              ) : (
                <View style={styles.noTimesContainer}>
                  <MaterialCommunityIcons 
                    name="clock-outline" 
                    size={48} 
                    color="#999" 
                  />
                  <Text style={styles.noTimesText}>没有设置定时发布</Text>
                  <Text style={styles.noTimesSubText}>
                    点击下方按钮添加发布时间
                  </Text>
                </View>
              )}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.addTimeButton}
              onPress={addScheduledTime}
              disabled={isLoading}
            >
              <AntDesign name="plus" size={18} color="#000" />
              <Text style={styles.addTimeText}>添加新时间</Text>
            </TouchableOpacity>
            
            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                is24Hour={Platform.OS === 'android'}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleTimeChange}
              />
            )}
          </BlurView>
        </View>
      </Modal>
    );
  };

  // Render each memory item
  const renderMemoryItem = (memory: any, index: number) => {
    // Extract content from memory
    const content = memory.parts?.[0]?.text || 'Unknown memory content';
    const timestamp = memory.timestamp || Date.now();
    const date = new Date(timestamp).toLocaleString();
    
    // Calculate memory size
    const memorySize = getStringByteSize(JSON.stringify(memory));
    
    // Parse interaction type and content from text if possible
    let interactionType = '';
    let memoryContent = '';
    
    try {
      // Try to extract type and content
      if (content.includes('newPost:') || content.includes('replyToComment:') || content.includes('replyToPost:')) {
        const parts = content.split('\n');
        interactionType = parts[0].split(':')[0]; // Get type before colon
        memoryContent = parts[0].split(':').slice(1).join(':').trim(); // Get content after colon
      } else {
        memoryContent = content;
      }
    } catch (error) {
      memoryContent = content;
    }
    
    return (
      <Animated.View 
        style={styles.memoryItem}
        entering={FadeInDown.delay(index * 100).duration(300)}
      >
        <View style={styles.memoryHeader}>
          <View style={styles.memoryInfo}>
            <Text style={styles.memoryDate}>{date}</Text>
            <View style={styles.memoryTypeContainer}>
              <Text style={styles.memoryType}>{interactionType || '朋友圈互动'}</Text>
              <Text style={styles.memorySize}>{formatBytes(memorySize)}</Text>
            </View>
          </View>
          
          <TouchableOpacity
            style={styles.deleteMemoryButton}
            onPress={() => deleteMemoryEntry(index)}
            disabled={memoryDeleteLoading === `entry-${index}`}
          >
            {memoryDeleteLoading === `entry-${index}` ? (
              <ActivityIndicator size="small" color="#ff6b6b" />
            ) : (
              <MaterialIcons name="delete" size={20} color="#ff6b6b" />
            )}
          </TouchableOpacity>
        </View>
        
        <View style={styles.memoryContent}>
          <ScrollView style={styles.memoryContentScroll}>
            <Text style={styles.memoryContentText} numberOfLines={3} ellipsizeMode="tail">
              {memoryContent}
            </Text>
            
            {/* Show response data if available */}
            {content.includes('Response:') && (
              <View style={styles.memoryResponse}>
                <Text style={styles.memoryResponseLabel}>回应:</Text>
                <Text style={styles.memoryResponseText} numberOfLines={3} ellipsizeMode="tail">
                  {content.split('Response:')[1].trim()}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    );
  };

  // Render character memory modal
  const renderMemoryModal = () => {
    if (!selectedCharacter) return null;
    
    return (
      <Modal
        visible={isMemoryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsMemoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Image 
                  source={selectedCharacter.avatar ? { uri: selectedCharacter.avatar } : require('@/assets/images/default-avatar.png')}
                  style={styles.modalCharacterAvatar} 
                />
                <Text style={styles.modalTitle}>{`${selectedCharacter.name} 的朋友圈记忆`}</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setIsMemoryModalVisible(false)} 
                style={styles.closeButton}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {/* Memory stats section */}
            <View style={styles.memoryStatsSection}>
              <Text style={styles.memoryStatsTitle}>记忆统计</Text>
              <View style={styles.memoryStatsGrid}>
                <View style={styles.memoryStatItem}>
                  <MaterialIcons name="memory" size={20} color="#ff9f1c" />
                  <Text style={styles.memoryStatLabel}>记忆条目</Text>
                  <Text style={styles.memoryStatValue}>{memoryStats.count}</Text>
                </View>
                <View style={styles.memoryStatItem}>
                  <FontAwesome name="database" size={18} color="#ff9f1c" />
                  <Text style={styles.memoryStatLabel}>存储大小</Text>
                  <Text style={styles.memoryStatValue}>{formatBytes(memoryStats.totalSize)}</Text>
                </View>
                <View style={styles.memoryStatItem}>
                  <MaterialCommunityIcons name="calendar-start" size={18} color="#ff9f1c" />
                  <Text style={styles.memoryStatLabel}>最早记忆</Text>
                  <Text style={styles.memoryStatValue}>
                    {memoryStats.oldestDate ? formatDate(memoryStats.oldestDate) : '无记忆'}
                  </Text>
                </View>
                <View style={styles.memoryStatItem}>
                  <MaterialCommunityIcons name="calendar-end" size={18} color="#ff9f1c" />
                  <Text style={styles.memoryStatLabel}>最新记忆</Text>
                  <Text style={styles.memoryStatValue}>
                    {memoryStats.newestDate ? formatDate(memoryStats.newestDate) : '无记忆'}
                  </Text>
                </View>
              </View>
              
              {/* Clear all memories button */}
              {circleMemories.length > 0 && (
                <TouchableOpacity
                  style={styles.clearAllButton}
                  onPress={clearAllMemories}
                  disabled={memoryDeleteLoading === 'all'}
                >
                  {memoryDeleteLoading === 'all' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="delete-sweep" size={18} color="#fff" />
                      <Text style={styles.clearAllButtonText}>清除所有记忆</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            {/* Memory entries list */}
            {isLoadingMemory ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ff9f1c" />
                <Text style={styles.loadingText}>加载记忆中...</Text>
              </View>
            ) : circleMemories.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons 
                  name="thought-bubble-outline" 
                  size={48} 
                  color="#999" 
                />
                <Text style={styles.emptyText}>没有朋友圈记忆</Text>
                <Text style={styles.emptySubtext}>
                  当角色参与朋友圈互动时会自动创建记忆
                </Text>
              </View>
            ) : (
              <FlatList
                data={circleMemories}
                renderItem={({ item, index }) => renderMemoryItem(item, index)}
                keyExtractor={(_, index) => `memory-${index}`}
                contentContainerStyle={styles.memoryListContainer}
              />
            )}
          </BlurView>
        </View>
      </Modal>
    );
  };

  // Render expanded settings for a character
  const renderExpandedSettings = (character: Character) => {
    if (expandedCharacterId !== character.id) return null;
    
    const characterTimes = scheduledTimes[character.id] || [];
    
    return (
      <Animated.View 
        style={styles.expandedSettings}
        entering={FadeInDown.duration(300)}
        exiting={FadeOut.duration(200)}
      >
        <Text style={styles.settingsLabel}>朋友圈互动设置</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>发布频率</Text>
          {Platform.OS === 'ios' ? (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={character.circlePostFrequency || 'medium'}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                onValueChange={(value) => handleFrequencyChange(character, 'circlePostFrequency', value as 'low' | 'medium' | 'high')}
              >
                <Picker.Item label="低" value="low" />
                <Picker.Item label="中" value="medium" />
                <Picker.Item label="高" value="high" />
              </Picker>
            </View>
          ) : (
            <View style={styles.pickerContainerAndroid}>
              <Picker
                selectedValue={character.circlePostFrequency || 'medium'}
                style={styles.pickerAndroid}
                dropdownIconColor="#fff"
                onValueChange={(value) => handleFrequencyChange(character, 'circlePostFrequency', value as 'low' | 'medium' | 'high')}
              >
                <Picker.Item label="低" value="low" color="#000"  />
                <Picker.Item label="中" value="medium" color="#000" />
                <Picker.Item label="高" value="high" color="#000" />
              </Picker>
            </View>
          )}
        </View>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>互动频率</Text>
          {Platform.OS === 'ios' ? (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={character.circleInteractionFrequency || 'medium'}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                onValueChange={(value) => handleFrequencyChange(character, 'circleInteractionFrequency', value as 'low' | 'medium' | 'high')}
              >
                <Picker.Item label="低" value="low" />
                <Picker.Item label="中" value="medium" />
                <Picker.Item label="高" value="high" />
              </Picker>
            </View>
          ) : (
            <View style={styles.pickerContainerAndroid}>
              <Picker
                selectedValue={character.circleInteractionFrequency || 'medium'}
                style={styles.pickerAndroid}
                dropdownIconColor="#fff"
                onValueChange={(value) => handleFrequencyChange(character, 'circleInteractionFrequency', value as 'low' | 'medium' | 'high')}
              >
                <Picker.Item label="低" value="low" color="#000" />
                <Picker.Item label="中" value="medium" color="#000" />
                <Picker.Item label="高" value="high" color="#000" />
              </Picker>
            </View>
          )}
        </View>
        
        {/* Scheduled Posts Section */}
        <View style={styles.scheduledPostsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialCommunityIcons name="clock-outline" size={20} color="#ff9f1c" />
              <Text style={styles.sectionTitle}>定时发布</Text>
            </View>
            <Text style={styles.timesCount}>
              {characterTimes.length > 0 
                ? `已设置 ${characterTimes.length} 个时间点` 
                : '未设置'}
            </Text>
          </View>
          
          {characterTimes.length > 0 && (
            <View style={styles.schedulePreview}>
              {characterTimes.slice(0, 2).map((time, index) => (
                <View key={`preview-${time}-${index}`} style={styles.previewTime}>
                  <MaterialCommunityIcons 
                    name="clock-outline" 
                    size={14} 
                    color="#ff9f1c" 
                  />
                  <Text style={styles.previewTimeText}>{formatTimeForDisplay(time)}</Text>
                </View>
              ))}
              {characterTimes.length > 2 && (
                <View style={styles.previewMoreTimes}>
                  <Text style={styles.previewMoreTimesText}>+{characterTimes.length - 2}个时间</Text>
                </View>
              )}
            </View>
          )}
          
          <TouchableOpacity
            style={styles.scheduleButton}
            onPress={() => openScheduleModal(character)}
          >
            <MaterialCommunityIcons name="calendar-clock" size={16} color="#000" />
            <Text style={styles.scheduleButtonText}>
              {characterTimes.length > 0 ? '管理时间' : '设置时间'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Memory management section */}
        <View style={styles.memorySection}>
          <View style={styles.memorySectionHeader}>
            <MaterialCommunityIcons name="memory" size={20} color="#ff9f1c" />
            <Text style={styles.memoryTitle}>朋友圈社交记忆管理</Text>
          </View>
          
          <View style={styles.memoryActions}>
            <TouchableOpacity
              style={styles.memoryButton}
              onPress={() => checkMemorySize(character)}
              disabled={loading === character.id}
            >
              <MaterialCommunityIcons name="memory" size={18} color="#000" />
              <Text style={styles.memoryButtonText}>检查大小</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.memoryButton, styles.manageButton]}
              onPress={() => loadCircleMemory(character)}
              disabled={loading === character.id || isLoadingMemory}
            >
              <MaterialIcons name="settings" size={18} color="#000" />
              <Text style={styles.memoryButtonText}>管理记忆</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  // Render notification settings section
  const renderNotificationSettings = () => {
    return (
      <Animated.View 
        style={styles.notificationSection}
        entering={FadeInDown.duration(300)}
      >
        <View style={styles.notificationSectionHeader}>
          <MaterialCommunityIcons name="bell-outline" size={20} color="#ff9f1c" />
          <Text style={styles.sectionTitle}>通知设置</Text>
        </View>
        
        <View style={styles.notificationRow}>
          <View style={styles.notificationInfo}>
            <Text style={styles.notificationLabel}>朋友圈更新通知</Text>
            <Text style={styles.notificationDescription}>
              当角色发布朋友圈时接收通知
            </Text>
          </View>
          
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationToggle}
            trackColor={{ false: '#767577', true: 'rgba(255, 159, 28, 0.7)' }}
            thumbColor={notificationsEnabled ? '#ff9f1c' : '#f4f3f4'}
          />
        </View>
      </Animated.View>
    );
  };

  // Render each character item
  const renderCharacterItem = useCallback(({ item }: { item: Character }) => {
    const isExpanded = expandedCharacterId === item.id;
    const isLoading = loading === item.id;
    
    return (
      <Animated.View 
        style={styles.characterCard}
        entering={FadeInDown.duration(300)}
      >
        <View style={styles.characterHeader}>
          <View style={styles.characterInfo}>
            <Image 
              source={item.avatar ? { uri: item.avatar } : require('@/assets/images/default-avatar.png')} 
              style={styles.avatar} 
            />
            <View style={styles.characterNameContainer}>
              <Text style={styles.characterName}>{item.name}</Text>
            </View>
          </View>
          
          <View style={styles.togglesContainer}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#ff9f1c" />
            ) : (
              <>
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleLabel}>朋友圈</Text>
                  <Switch
                    value={item.circleInteraction === true}
                    onValueChange={() => handleCircleInteractionToggle(item)}
                    trackColor={{ false: '#767577', true: 'rgba(255, 159, 28, 0.7)' }}
                    thumbColor={item.circleInteraction ? '#ff9f1c' : '#f4f3f4'}
                  />
                </View>
                
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleLabel}>关系</Text>
                  <Switch
                    value={item.relationshipEnabled === true}
                    onValueChange={() => handleRelationshipToggle(item)}
                    trackColor={{ false: '#767577', true: 'rgba(255, 159, 28, 0.7)' }}
                    thumbColor={item.relationshipEnabled ? '#ff9f1c' : '#f4f3f4'}
                  />
                </View>
                
                {item.circleInteraction && (
                  <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => setExpandedCharacterId(isExpanded ? null : item.id)}
                  >
                    <MaterialIcons 
                      name={isExpanded ? "expand-less" : "expand-more"} 
                      size={24} 
                      color="#fff" 
                    />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
        
        {renderExpandedSettings(item)}
      </Animated.View>
    );
  }, [expandedCharacterId, loading]);

  // Render memory management tab
  const renderMemoryTab = () => {
    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.memoryTabContent}>
        <View style={styles.memoryOverview}>
          <Text style={styles.memoryOverviewTitle}>朋友圈记忆管理</Text>
          <Text style={styles.memoryOverviewDescription}>
            角色在朋友圈互动时会创建记忆，以便在后续互动中保持一致性。这些记忆会占用设备存储空间，定期清理可以优化应用性能。
          </Text>
        </View>
        
        {characters.filter(c => c.circleInteraction).length > 0 ? (
          <View style={styles.memoryCharactersList}>
            <Text style={styles.memoryCharactersTitle}>已启用朋友圈的角色</Text>
            {characters.filter(c => c.circleInteraction).map((character) => (
              <TouchableOpacity
                key={character.id}
                style={styles.memoryCharacterItem}
                onPress={() => loadCircleMemory(character)}
              >
                <Image 
                  source={character.avatar ? { uri: character.avatar } : require('@/assets/images/default-avatar.png')} 
                  style={styles.memoryCharacterAvatar} 
                />
                <View style={styles.memoryCharacterInfo}>
                  <Text style={styles.memoryCharacterName}>{character.name}</Text>
                  <TouchableOpacity 
                    style={styles.memoryCharacterButton}
                    onPress={() => loadCircleMemory(character)}
                  >
                    <MaterialIcons name="settings" size={16} color="#000" />
                    <Text style={styles.memoryCharacterButtonText}>管理记忆</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noMemoryCharacters}>
            <MaterialCommunityIcons 
              name="account-alert-outline" 
              size={48} 
              color="#999" 
            />
            <Text style={styles.emptyText}>没有启用朋友圈的角色</Text>
            <Text style={styles.emptySubtext}>
              请在"角色设置"中启用朋友圈功能
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };
  
  // Render schedule management tab
  const renderScheduleTab = () => {
    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.scheduleTabContent}>
        <View style={styles.scheduleOverview}>
          <Text style={styles.scheduleOverviewTitle}>发布计划管理</Text>
          <Text style={styles.scheduleOverviewDescription}>
            为角色设置固定的发布时间，让朋友圈内容更丰富。每个角色可以设置多个发布时间点，系统会在这些时间自动触发发布。
          </Text>
        </View>

        <View style={styles.scheduleGlobalSection}>
          <View style={styles.scheduleGlobalHeader}>
            <MaterialCommunityIcons name="bell-ring-outline" size={20} color="#ff9f1c" />
            <Text style={styles.scheduleGlobalTitle}>通知设置</Text>
          </View>
          
          <View style={styles.notificationRow}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationLabel}>朋友圈发布通知</Text>
              <Text style={styles.notificationDescription}>
                当角色按计划发布朋友圈时接收通知
              </Text>
            </View>
            
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: '#767577', true: 'rgba(255, 159, 28, 0.7)' }}
              thumbColor={notificationsEnabled ? '#ff9f1c' : '#f4f3f4'}
            />
          </View>
        </View>
        
        {characters.filter(c => c.circleInteraction).length > 0 ? (
          <View style={styles.scheduleCharactersList}>
            <Text style={styles.scheduleCharactersTitle}>角色定时发布设置</Text>
            {characters.filter(c => c.circleInteraction).map((character) => {
              const characterTimes = scheduledTimes[character.id] || [];
              return (
                <View key={character.id} style={styles.scheduleCharacterItem}>
                  <View style={styles.scheduleCharacterHeader}>
                    <Image 
                      source={character.avatar ? { uri: character.avatar } : require('@/assets/images/default-avatar.png')} 
                      style={styles.scheduleCharacterAvatar} 
                    />
                    <View style={styles.scheduleCharacterInfo}>
                      <Text style={styles.scheduleCharacterName}>{character.name}</Text>
                      <Text style={styles.scheduleCharacterFrequency}>
                        发布频率: {getFrequencyDescription('circlePostFrequency', character.circlePostFrequency)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.scheduleCharacterTimes}>
                    {characterTimes.length > 0 ? (
                      <>
                        <Text style={styles.scheduleCharacterTimesTitle}>已设置的发布时间:</Text>
                        <View style={styles.scheduleTimeChips}>
                          {characterTimes.map((time, index) => (
                            <View key={`${time}-${index}`} style={styles.scheduleTimeChipContainer}>
                              <View style={styles.scheduleTimeChip}>
                                <MaterialCommunityIcons 
                                  name="clock-outline" 
                                  size={14} 
                                  color="#ff9f1c" 
                                />
                                <Text style={styles.scheduleTimeChipText}>{formatTimeForDisplay(time)}</Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => removeScheduledTime(character.id, time)}
                                style={styles.scheduleTimeDeleteButton}
                              >
                                <Ionicons name="close-circle" size={16} color="#ff6b6b" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : (
                      <Text style={styles.scheduleNoTimesText}>未设置发布时间</Text>
                    )}
                    
                    <TouchableOpacity
                      style={styles.scheduleManageButton}
                      onPress={() => openScheduleModal(character)}
                    >
                      <MaterialCommunityIcons name="clock-edit-outline" size={16} color="#000" />
                      <Text style={styles.scheduleManageButtonText}>
                        {characterTimes.length > 0 ? '管理时间' : '设置时间'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noScheduleCharacters}>
            <MaterialCommunityIcons 
              name="clock-alert-outline" 
              size={48} 
              color="#999" 
            />
            <Text style={styles.emptyText}>没有启用朋友圈的角色</Text>
            <Text style={styles.emptySubtext}>
              请在"角色设置"中启用朋友圈功能
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  // Search box for filtering characters
  const renderSearchBox = () => (
    <View style={styles.searchContainer}>
      <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        placeholder="搜索角色..."
        placeholderTextColor="#999"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity style={styles.clearSearch} onPress={() => setSearchQuery('')}>
          <Ionicons name="close-circle" size={20} color="#999" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.fullScreenContainer}>
        <BlurView intensity={30} tint="dark" style={styles.fullScreenBlurView}>
          <View style={styles.header}>
            <Text style={styles.title}>角色互动设置</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.GENERAL && styles.activeTab]}
              onPress={() => setActiveTab(TabType.GENERAL)}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                color={activeTab === TabType.GENERAL ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.GENERAL && styles.activeTabText]}>
                角色设置
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.MEMORY && styles.activeTab]}
              onPress={() => setActiveTab(TabType.MEMORY)}
            >
              <MaterialCommunityIcons
                name="brain"
                size={20}
                color={activeTab === TabType.MEMORY ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.MEMORY && styles.activeTabText]}>
                记忆管理
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.SCHEDULE && styles.activeTab]}
              onPress={() => setActiveTab(TabType.SCHEDULE)}
            >
              <MaterialCommunityIcons
                name="calendar-clock"
                size={20}
                color={activeTab === TabType.SCHEDULE ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.SCHEDULE && styles.activeTabText]}>
                计划发布
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            {/* General settings tab */}
            {activeTab === TabType.GENERAL && (
              <>
                {renderSearchBox()}
                
                {/* Notifications section */}
                {renderNotificationSettings()}

                <FlatList
                  data={filteredCharacters}
                  renderItem={renderCharacterItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContainer}
                  ListEmptyComponent={
                    searchQuery.length > 0 ? (
                      <View style={styles.emptyContainer}>
                        <Feather name="search" size={48} color="#999" />
                        <Text style={styles.emptyText}>没有找到匹配的角色</Text>
                        <Text style={styles.emptySubtext}>尝试使用不同的搜索词</Text>
                      </View>
                    ) : (
                      <View style={styles.emptyContainer}>
                        <MaterialCommunityIcons name="account-off-outline" size={48} color="#999" />
                        <Text style={styles.emptyText}>暂无角色</Text>
                        <Text style={styles.emptySubtext}>请添加角色以启用互动功能</Text>
                      </View>
                    )
                  }
                />
              </>
            )}
            
            {/* Memory management tab */}
            {activeTab === TabType.MEMORY && renderMemoryTab()}
            
            {/* Schedule management tab */}
            {activeTab === TabType.SCHEDULE && renderScheduleTab()}
          </View>
        </BlurView>
      </View>
      
      {/* Circle Memory Management Modal */}
      {renderMemoryModal()}
      
      {/* Post Schedule Management Modal */}
      {renderScheduleModal()}
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  fullScreenBlurView: {
    flex: 1,
    borderRadius: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  blurContainer: {
    width: '90%',
    maxHeight: '85%',
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Top safe area padding
    paddingTop: Platform.select({
      ios: 44,
      android: StatusBar.currentHeight || 24,
      default: 24,
    }),
    paddingBottom: 8,
    paddingHorizontal: 16,
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
  
  // Tab bar styles aligned with MemoOverlay
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#ff9f1c',
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
  content: {
    flex: 1,
  },
  
  // Search container
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    margin: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: 44,
  },
  clearSearch: {
    padding: 4,
  },
  
  // List container style
  listContainer: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 40,
  },
  
  // Character card styles
  characterCard: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  characterHeader: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  characterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  characterNameContainer: {
    flex: 1,
  },
  characterName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  togglesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleItem: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  toggleLabel: {
    fontSize: 12,
    color: '#ccc',
    marginBottom: 4,
  },
  settingsButton: {
    padding: 4,
    marginLeft: 8,
  },
  
  // Expanded settings styles
  expandedSettings: {
    padding: 16,
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  pickerContainer: {
    width: 150,
    backgroundColor: 'rgba(60, 60, 70, 0.5)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    width: 150,
    color: '#000',
  },
  pickerItem: {
    color: '#000',
    fontSize: 14,
  },
  pickerContainerAndroid: {
    backgroundColor: 'rgba(60, 60, 70, 0.5)',
    borderRadius: 8,
    overflow: 'hidden',
    width: 150,
    height: 40,
    justifyContent: 'center',
  },
  pickerAndroid: {
    width: 150,
    color: '#fff',
    fontSize: 2,
    height: 80,
  },
  
  // Scheduled posts section styles
  scheduledPostsSection: {
    backgroundColor: 'rgba(50, 50, 60, 0.4)',
    borderRadius: 10,
    padding: 12,
    marginVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginLeft: 6,
  },
  timesCount: {
    fontSize: 12,
    color: '#ccc',
  },
  schedulePreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  previewTime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 6,
  },
  previewTimeText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  },
  previewMoreTimes: {
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 8,
  },
  previewMoreTimesText: {
    color: '#ccc',
    fontSize: 12,
  },
  scheduleButton: {
    backgroundColor: '#ff9f1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  scheduleButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  
  // Memory management styles
  memorySection: {
    backgroundColor: 'rgba(50, 50, 60, 0.4)',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  memorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  memoryTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  memoryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  memoryButton: {
    backgroundColor: '#ff9f1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  manageButton: {
    backgroundColor: '#3c9aff',
    marginRight: 0,
  },
  memoryButtonText: {
    color: '#000',
    fontSize: 14,
    marginLeft: 6,
  },
  
  // Notification section styles
  notificationSection: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  notificationSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  notificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationInfo: {
    flex: 1,
    marginRight: 12,
  },
  notificationLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  notificationDescription: {
    fontSize: 13,
    color: '#ccc',
  },
  
  // Memory modal styles
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalCharacterAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  memoryStatsSection: {
    padding: 16,
    backgroundColor: 'rgba(50, 50, 60, 0.6)',
    marginBottom: 12,
  },
  memoryStatsTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 12,
  },
  memoryStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  memoryStatItem: {
    width: '50%',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 16,
  },
  memoryStatLabel: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
    marginBottom: 4,
  },
  memoryStatValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'center',
  },
  clearAllButton: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  clearAllButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  memoryItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(50, 50, 60, 0.5)',
    padding: 10,
  },
  memoryInfo: {
    flex: 1,
  },
  memoryDate: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 2,
  },
  memoryTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memoryType: {
    color: '#ff9f1c',
    fontSize: 12,
    fontWeight: '500',
  },
  memorySize: {
    color: '#ccc',
    fontSize: 11,
  },
  deleteMemoryButton: {
    padding: 6,
  },
  memoryContent: {
    padding: 12,
  },
  memoryContentScroll: {
    maxHeight: 100,
  },
  memoryContentText: {
    color: '#fff',
    fontSize: 13,
  },
  memoryResponse: {
    marginTop: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#ff9f1c',
    paddingLeft: 8,
  },
  memoryResponseLabel: {
    color: '#ff9f1c',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  memoryResponseText: {
    color: '#ccc',
    fontSize: 12,
    fontStyle: 'italic',
  },
  memoryListContainer: {
    padding: 16,
  },
  
  // Schedule modal styles
  scheduleModalContent: {
    width: '90%',
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 10,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  scheduleModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  scheduleDescription: {
    color: '#ccc',
    fontSize: 14,
    padding: 16,
    paddingTop: 0,
    lineHeight: 20,
  },
  timesList: {
    maxHeight: 300,
  },
  timeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timeText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
  removeTimeButton: {
    padding: 8,
    marginLeft: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 20,
  },
  scheduleLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  scheduleLoadingText: {
    color: '#ccc',
    marginLeft: 8,
    fontSize: 14,
  },
  addTimeButton: {
    backgroundColor: '#ff9f1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    margin: 16,
    marginTop: 0,
  },
  addTimeText: {
    color: '#000',
    marginLeft: 8,
    fontSize: 16,
  },
  noTimesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  noTimesText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  noTimesSubText: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  
  // Memory tab content styles
  tabContent: {
    flex: 1,
  },
  memoryTabContent: {
    padding: 16,
  },
  memoryOverview: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  memoryOverviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  memoryOverviewDescription: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  memoryCharactersList: {
    marginTop: 16,
  },
  memoryCharactersTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 12,
  },
  memoryCharacterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  memoryCharacterAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  memoryCharacterInfo: {
    flex: 1,
  },
  memoryCharacterName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 6,
  },
  memoryCharacterButton: {
    backgroundColor: '#ff9f1c',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  memoryCharacterButtonText: {
    color: '#000',
    fontSize: 12,
    marginLeft: 4,
  },
  noMemoryCharacters: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  
  // Schedule tab content styles
  scheduleTabContent: {
    padding: 16,
  },
  scheduleOverview: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  scheduleOverviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  scheduleOverviewDescription: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
   scheduleGlobalSection: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  scheduleGlobalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleGlobalTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginLeft: 8,
  },
  scheduleCharactersList: {
    marginTop: 16,
  },
  scheduleCharactersTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 12,
  },
  scheduleCharacterItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  scheduleCharacterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleCharacterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  scheduleCharacterInfo: {
    flex: 1,
  },
  scheduleCharacterName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  scheduleCharacterFrequency: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 2,
  },
  scheduleCharacterTimes: {
    padding: 12,
    backgroundColor: 'rgba(40, 40, 50, 0.6)',
    borderRadius: 8,
  },
  scheduleCharacterTimesTitle: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  scheduleTimeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  scheduleTimeChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  scheduleTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 70, 0.8)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  scheduleTimeChipText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  },
  scheduleTimeDeleteButton: {
    marginLeft: 4,
    padding: 2,
  },
  scheduleNoTimesText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  scheduleManageButton: {
    backgroundColor: '#ff9f1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  scheduleManageButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  noScheduleCharacters: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  
  // General empty state styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  }
});

export default CharacterInteractionSettings;