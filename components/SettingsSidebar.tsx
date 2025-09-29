import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Switch,
  Alert,
  ScrollView,
  PanResponder,
  TextInput,
} from 'react-native';
import { Character, UserCustomSetting } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { memoryService } from '@/services/memory-service';
import Slider from '@react-native-community/slider';
import { EventRegister } from 'react-native-event-listeners';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Mem0Service from '@/src/memory/services/Mem0Service';
import { useDialogMode, DialogMode } from '@/constants/DialogModeContext';
import * as Font from 'expo-font';
import * as DocumentPicker from 'expo-document-picker';
import { NodeSTManager } from '@/utils/NodeSTManager'; // 新增导入
import { getApiSettings } from '@/utils/settings-helper'; // 新增导入
import { NodeSTCore}  from '@/NodeST/nodest/core/node-st-core'; // 新增导入

const SIDEBAR_WIDTH_EXPANDED = 280;
const SWIPE_THRESHOLD = 50; // 向下滑动超过这个距离时关闭侧边栏

interface SettingsSideBarProps {
  isVisible: boolean;
  onClose: () => void;
  selectedCharacter: Character | undefined | null;
  animationValue?: Animated.Value; // Add animation value prop
}

// Add this interface for CustomUserSettingProps
interface CustomUserSettingProps {
  character: Character;
  updateCharacter: (character: Character) => Promise<void>;
}

// Add this new component for managing custom user settings
const CustomUserSettingsManager: React.FC<CustomUserSettingProps> = ({ character, updateCharacter }) => {
  const [isEnabled, setIsEnabled] = useState(character?.hasCustomUserSetting || false);
  const [isGlobal, setIsGlobal] = useState(character?.customUserSetting?.global || false);
  const [customSetting, setCustomSetting] = useState<UserCustomSetting>(
    character?.customUserSetting || {
      comment: '自设',
      content: '',
      disable: false,
      position: 4,
      constant: true,
      key: [],
      order: 1,
      depth: 1,
      vectorized: false,
      global: false
    }
  );

  // Handle toggling the custom setting feature
  const handleCustomSettingToggle = async () => {
    try {
      const updatedCharacter = {
        ...character,
        hasCustomUserSetting: !isEnabled
      };
      
      if (!isEnabled && !character.customUserSetting) {
        updatedCharacter.customUserSetting = customSetting;
      }
      
      // First update the character in memory/database
      await updateCharacter(updatedCharacter);
      
      // Then explicitly persist to AsyncStorage for NodeST to access
      try {
        const characterKey = `character_${character.id}`;
        
        try {
          // Try standard approach first
          await AsyncStorage.setItem(characterKey, JSON.stringify(updatedCharacter));
          console.log('Custom user setting toggle persisted to AsyncStorage');
        } catch (storageError) {
          // If we encounter an error that might be related to the row size, use an alternative approach
          if (storageError instanceof Error && storageError.message.includes('Row too big')) {
            console.warn('Row too big error encountered while toggling, using alternative storage approach');
            
            // Use separate keys for the flag
            const hasCustomSettingKey = `character_${character.id}_has_custom`;
            
            // Just update the flag - we'll save the complete settings when they save
            await AsyncStorage.setItem(hasCustomSettingKey, !isEnabled ? 'true' : 'false');
            
            // If we're enabling and have default settings, also save them
            if (!isEnabled && customSetting) {
              const customSettingKey = `character_${character.id}_custom_setting`;
              await AsyncStorage.setItem(customSettingKey, JSON.stringify(customSetting));
            }
            
            console.log('Custom user setting toggle saved using alternative approach');
          } else {
            // If it's some other error, re-throw it
            throw storageError;
          }
        }
      } catch (storageError) {
        console.error('Failed to persist custom setting toggle to AsyncStorage:', storageError);
      }
      
      setIsEnabled(!isEnabled);
      
    } catch (error) {
      console.error('Error toggling custom setting:', error);
      Alert.alert('错误', '无法更新自设设置');
    }
  };

  // Handle setting scope toggle (global vs. character-specific)
  const handleGlobalToggle = () => {
    const newGlobal = !isGlobal;
    setIsGlobal(newGlobal);
    setCustomSetting({
      ...customSetting,
      global: newGlobal
    });
  };

  // Save custom setting to character
  const saveCustomSetting = async () => {
    try {
      // Validate content
      if (!customSetting.content.trim()) {
        Alert.alert('错误', '自设内容不能为空');
        return;
      }
      
      const updatedCharacter = {
        ...character,
        hasCustomUserSetting: true,
        customUserSetting: {
          ...customSetting,
          global: isGlobal
        }
      };
      
      // Update character in memory/database
      await updateCharacter(updatedCharacter);
      
      // Then explicitly save to AsyncStorage for NodeST to access
      try {
        // If global setting, save to global key
        if (isGlobal) {
          await AsyncStorage.setItem('global_user_custom_setting', JSON.stringify({
            ...customSetting,
            global: true
          }));
          console.log('Global custom user setting saved to AsyncStorage');
        }
        
        // Always save to character-specific storage too
        const characterKey = `character_${character.id}`;
        
        try {
          // Try standard approach first
          await AsyncStorage.setItem(characterKey, JSON.stringify(updatedCharacter));
          console.log('Character custom user setting saved to AsyncStorage');
        } catch (storageError) {
          // If we encounter an error that might be related to the row size, use an alternative approach
          if (storageError instanceof Error && storageError.message.includes('Row too big')) {
            console.warn('Row too big error encountered, using alternative storage approach');
            
            // Use separate keys for the custom setting data and the flag
            const customSettingKey = `character_${character.id}_custom_setting`;
            const hasCustomSettingKey = `character_${character.id}_has_custom`;
            
            // Save the settings separately
            await AsyncStorage.setItem(customSettingKey, JSON.stringify({
              ...customSetting,
              global: isGlobal
            }));
            await AsyncStorage.setItem(hasCustomSettingKey, 'true');
            
            console.log('Character custom user setting saved using alternative approach');
          } else {
            // If it's some other error, re-throw it
            throw storageError;
          }
        }
      } catch (storageError) {
        console.error('Failed to save custom setting to AsyncStorage:', storageError);
      }
      
      Alert.alert('成功', '自设已保存');
    } catch (error) {
      console.error('Error saving custom setting:', error);
      Alert.alert('错误', '无法保存自设');
    }
  };

  // Render nothing if feature is disabled
  if (!isEnabled) {
    return (
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>自设功能</Text>
        <Switch
          value={isEnabled}
          onValueChange={handleCustomSettingToggle}
          trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
          thumbColor={isEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
        />
      </View>
    );
  }

  return (
    <View style={styles.settingSection}>
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>自设功能</Text>
        <Switch
          value={isEnabled}
          onValueChange={handleCustomSettingToggle}
          trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
          thumbColor={isEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
        />
      </View>
      
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>全局应用</Text>
        <Switch
          value={isGlobal}
          onValueChange={handleGlobalToggle}
          trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
          thumbColor={isGlobal ? 'rgb(255, 224, 195)' : '#f4f3f4'}
        />
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.settingLabel}>自设标题</Text>
        <TextInput
          style={styles.textInput}
          value={customSetting.comment}
          onChangeText={(text) => setCustomSetting({ ...customSetting, comment: text })}
          placeholder="自设标题，默认为'自设'"
          placeholderTextColor="#999"
        />
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.settingLabel}>自设内容</Text>
        <TextInput
          style={[styles.textInput, { height: 100, textAlignVertical: 'top' }]}
          value={customSetting.content}
          onChangeText={(text) => setCustomSetting({ ...customSetting, content: text })}
          placeholder="输入您对自己的描述和设定"
          placeholderTextColor="#999"
          multiline={true}
        />
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.settingLabel}>插入位置</Text>
        <View style={styles.rowContainer}>
          {[0, 1, 2, 3, 4].map((pos) => (
            <TouchableOpacity
              key={pos}
              style={[
                styles.positionButton,
                customSetting.position === pos && styles.positionButtonSelected
              ]}
              onPress={() => setCustomSetting({ ...customSetting, position: pos as 0 | 1 | 2 | 3 | 4 })}
            >
              <Text style={[
                styles.positionButtonText,
                customSetting.position === pos && styles.positionButtonTextSelected
              ]}>
                {pos}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.settingDescription}>
          推荐选择 4，代表在对话内按深度动态插入
        </Text>
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.settingLabel}>插入深度</Text>
        <View style={styles.rowContainer}>
          {[0, 1, 2, 3].map((depth) => (
            <TouchableOpacity
              key={depth}
              style={[
                styles.positionButton,
                customSetting.depth === depth && styles.positionButtonSelected
              ]}
              onPress={() => setCustomSetting({ ...customSetting, depth: depth })}
            >
              <Text style={[
                styles.positionButtonText,
                customSetting.depth === depth && styles.positionButtonTextSelected
              ]}>
                {depth}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.settingDescription}>
          0: 在最新消息后，1: 在上一条用户消息前，2+: 在更早消息前
        </Text>
      </View>
      
      <TouchableOpacity
        style={styles.applyButton}
        onPress={saveCustomSetting}
      >
        <Text style={styles.applyButtonText}>保存自设</Text>
      </TouchableOpacity>
      
      <Text style={styles.settingDescription}>
        自设是您对自己的描述，会作为D类条目插入对话中。全局应用时，所有角色都将接收到您的自设。
      </Text>
    </View>
  );
};

// Modified constructor to set notification state from character
export default function SettingsSidebar({
  isVisible,
  onClose,
  selectedCharacter,
  animationValue, // Add animation value parameter
}: SettingsSideBarProps) {
  // Remove the slideAnim since we'll use the provided animationValue instead
  const slideYAnim = useRef(new Animated.Value(0)).current; // 用于向下滑动动画
  const { updateCharacter } = useCharacters();
  const { mode, setMode, visualNovelSettings, updateVisualNovelSettings } = useDialogMode();
  const [availableFonts, setAvailableFonts] = useState<string[]>([]);

  // Replace isPermanentMemoryEnabled with isMemorySummaryEnabled
  const [isMemorySummaryEnabled, setIsMemorySummaryEnabled] = useState(false);
  const [summaryThreshold, setSummaryThreshold] = useState(12000); // Default: 6000 characters
  const [summaryLength, setSummaryLength] = useState(1000); // Default: 1000 characters
  
  // IMPORTANT: Initialize notification state from character
  const [isAutoMessageEnabled, setIsAutoMessageEnabled] = useState(selectedCharacter?.autoMessage === true);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(selectedCharacter?.notificationEnabled === true);
  const [isCircleInteractionEnabled, setIsCircleInteractionEnabled] = useState(
    selectedCharacter?.circleInteraction === true
  );
  const [isRelationshipEnabled, setIsRelationshipEnabled] = useState(
    selectedCharacter?.relationshipEnabled === true
  );

  // Add new state for dynamic portrait video
  const [isDynamicPortraitEnabled, setIsDynamicPortraitEnabled] = useState(
    selectedCharacter?.dynamicPortraitEnabled === true
  );

  // Add new state for auto message timing
  const [autoMessageInterval, setAutoMessageInterval] = useState<number>(
    selectedCharacter?.autoMessageInterval || 5
  );

  // Add state for custom user name
  const [customUserName, setCustomUserName] = useState(
    selectedCharacter?.customUserName || ''
  );

  // Add new state for auto extra background
  const [isAutoExtraBgEnabled, setIsAutoExtraBgEnabled] = useState(selectedCharacter?.enableAutoExtraBackground === true);

  // 新增：自动生成图片和自定义生成图片状态
  const [isAutoImageEnabled, setIsAutoImageEnabled] = useState(selectedCharacter?.autoImageEnabled === true);
  const [isCustomImageEnabled, setIsCustomImageEnabled] = useState(selectedCharacter?.customImageEnabled === true);

  useEffect(() => {
    setIsAutoExtraBgEnabled(selectedCharacter?.enableAutoExtraBackground === true);
    setIsAutoImageEnabled(selectedCharacter?.autoImageEnabled === true);
    setIsCustomImageEnabled(selectedCharacter?.customImageEnabled === true);
  }, [selectedCharacter]);

  // Handler for auto extra background toggle
  const handleAutoExtraBgToggle = async () => {
    if (selectedCharacter) {
      const updatedCharacter = {
        ...selectedCharacter,
        enableAutoExtraBackground: !isAutoExtraBgEnabled
      };
      await updateCharacter(updatedCharacter);
      setIsAutoExtraBgEnabled(!isAutoExtraBgEnabled);
    }
  };

  // 新增：Modal显示状态
  const [showVisualNovelModal, setShowVisualNovelModal] = useState(false);
  const [showMemorySummaryModal, setShowMemorySummaryModal] = useState(false);

  // 记忆总结设置输入状态提升
  const [memoryThresholdInput, setMemoryThresholdInput] = useState(summaryThreshold.toString());
  const [memoryLengthInput, setMemoryLengthInput] = useState(summaryLength.toString());

  // 保持输入框与实际值同步
  useEffect(() => {
    setMemoryThresholdInput(summaryThreshold.toString());
  }, [summaryThreshold, showMemorySummaryModal]);
  useEffect(() => {
    setMemoryLengthInput(summaryLength.toString());
  }, [summaryLength, showMemorySummaryModal]);

  // 处理滑动手势
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        // 仅处理向下滑动
        if (gestureState.dy > 0) {
          slideYAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        // 如果向下滑动超过阈值，关闭侧边栏
        if (gestureState.dy > SWIPE_THRESHOLD) {
          // 先完成滑动动画
          Animated.timing(slideYAnim, {
            toValue: 300, // 设置一个足够大的值让侧边栏滑出屏幕
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            // 动画完成后调用关闭回调
            onClose();
            // 重置Y轴位置
            slideYAnim.setValue(0);
          });
        } else {
          // 如果没超过阈值，恢复原位
          Animated.spring(slideYAnim, {
            toValue: 0,
            friction: 5,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Load memory settings when character changes
  useEffect(() => {
    if (selectedCharacter?.id) {
      const loadMemorySettings = async () => {
        try {
          const settings = await memoryService.loadSettings(selectedCharacter.id);
          setIsMemorySummaryEnabled(settings.enabled);
          setSummaryThreshold(settings.summaryThreshold);
          setSummaryLength(settings.summaryLength);
        } catch (error) {
          console.error('Error loading memory settings:', error);
        }
      };
      
      loadMemorySettings();
    }
  }, [selectedCharacter?.id]);

  // Sync states with character properties - make sure to sync notifications too
  useEffect(() => {
    setIsAutoMessageEnabled(selectedCharacter?.autoMessage === true);
    setIsNotificationEnabled(selectedCharacter?.notificationEnabled === true);
    setIsCircleInteractionEnabled(selectedCharacter?.circleInteraction === true);
    setIsRelationshipEnabled(selectedCharacter?.relationshipEnabled === true);
    setAutoMessageInterval(selectedCharacter?.autoMessageInterval || 5);
    // Add the custom user name sync
    setCustomUserName(selectedCharacter?.customUserName || '');
    // Add sync for dynamic portrait enabled state
    setIsDynamicPortraitEnabled(selectedCharacter?.dynamicPortraitEnabled === true);
  }, [selectedCharacter]);

  // When user name or character changes, update Mem0Service
  useEffect(() => {
    if (selectedCharacter) {
      try {
        const mem0Service = Mem0Service.getInstance();
        mem0Service.setCharacterNames(
          selectedCharacter.id,
          selectedCharacter.customUserName || '',
          selectedCharacter.name
        );
      } catch (error) {
        console.error('Failed to update memory service with custom names:', error);
      }
    }
  }, [selectedCharacter?.id, selectedCharacter?.customUserName, selectedCharacter?.name]);

  // Reset Y position when visibility changes
  useEffect(() => {
    if (isVisible) {
      slideYAnim.setValue(0);
    }
  }, [isVisible]);

  // Load available fonts on component mount
  useEffect(() => {
    const loadFonts = async () => {
      try {
        // Default system font is always available
        const fonts = ['System'];
        
        // Check if SpaceMono is available
        const spaceMonoLoaded = await Font.isLoaded('SpaceMono-Regular');
        if (spaceMonoLoaded) {
          fonts.push('SpaceMono-Regular');
        } else {
          try {
            await Font.loadAsync({
              'SpaceMono-Regular': require('@/assets/fonts/SpaceMono-Regular.ttf'),
            });
            fonts.push('SpaceMono-Regular');
          } catch (err) {
            console.warn('Could not load SpaceMono font');
          }
        }
        
        setAvailableFonts(fonts);
      } catch (error) {
        console.error('Error loading fonts:', error);
      }
    };

    loadFonts();
  }, []);

  // Replace memory toggle with memory summary toggle
  const handleMemorySummaryToggle = async () => {
    if (selectedCharacter) {
      try {
        // Save memory summary settings
        await memoryService.saveSettings(selectedCharacter.id, {
          enabled: !isMemorySummaryEnabled,
          summaryThreshold,
          summaryLength,
          lastSummarizedAt: 0
        });
        
        setIsMemorySummaryEnabled(!isMemorySummaryEnabled);
        
        if (!isMemorySummaryEnabled) {
        }
      } catch (error) {
        console.error('Error saving memory settings:', error);
        Alert.alert('错误', '无法保存记忆设置');
      }
    }
  };

  // 新增：顶部栏显示状态（本地状态，仅用于UI同步，实际由index控制）
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);

  // 新增：监听外部事件以同步顶部栏显示状态（可选，若index有全局状态）
  useEffect(() => {
    const listener = EventRegister.addEventListener('topBarVisibilityChanged', (visible: boolean) => {
      setIsTopBarVisible(visible);
    });
    return () => {
      EventRegister.removeEventListener(listener as string);
    };
  }, []);

  // 新增：切换顶部栏显示
  const handleToggleTopBar = () => {
    const newVisible = !isTopBarVisible;
    setIsTopBarVisible(newVisible);
    EventRegister.emit('toggleTopBarVisibility', newVisible);
  };

  const handleAutoMessageToggle = async () => {
    if (selectedCharacter) {
      try {
        // Create a copy of the character with the updated setting
        const updatedCharacter = {
          ...selectedCharacter,
          autoMessage: !isAutoMessageEnabled
        };
        
        // Update state first to reflect the new setting immediately in the UI
        setIsAutoMessageEnabled(!isAutoMessageEnabled);
        
        // Then update the character data in the database
        await updateCharacter(updatedCharacter);
        
        // Notify the user about the change
        console.log(`Auto messages ${!isAutoMessageEnabled ? 'enabled' : 'disabled'} for ${selectedCharacter.name}`);
        
      } catch (error) {
        // If there's an error, revert the state change
        setIsAutoMessageEnabled(isAutoMessageEnabled);
        console.error('Failed to update auto message setting:', error);
        Alert.alert('Error', 'Failed to update auto message settings');
      }
    }
  };

  // Add handler for auto message interval
  const handleAutoMessageIntervalChange = async (value: number) => {
    if (selectedCharacter) {
      setAutoMessageInterval(value);
      const updatedCharacter = {
        ...selectedCharacter,
        autoMessageInterval: value
      };
      await updateCharacter(updatedCharacter);
    }
  };

  // Add handler for notification toggle
  const handleNotificationToggle = async () => {
    if (selectedCharacter) {
      const updatedCharacter = {
        ...selectedCharacter,
        notificationEnabled: !isNotificationEnabled
      };
      await updateCharacter(updatedCharacter);
      setIsNotificationEnabled(!isNotificationEnabled);
      
      // If notifications are being turned off, clear any existing notifications
      if (isNotificationEnabled) {
        AsyncStorage.setItem('unreadMessagesCount', '0').catch(err => 
          console.error('Failed to reset unread messages count:', err)
        );
        
        // Emit event to clear badge
        EventRegister.emit('unreadMessagesUpdated', 0);
      }
    }
  };

  const handleBackgroundChange = async () => {
    if (!selectedCharacter) return;

    try {
      // 直接进入选择聊天背景的流程，不再弹出选择对话框
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16], // 竖向聊天背景图
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const updatedCharacter = {
          ...selectedCharacter,
          chatBackground: result.assets[0].uri,
        };
        
        await updateCharacter(updatedCharacter);
        Alert.alert('成功', '聊天背景已更新');
      }
    } catch (error) {
      console.error("Background update error:", error);
      Alert.alert('错误', '无法更新背景图片');
    }
  };
  // 新增：自动生成图片开关处理
  const handleAutoImageToggle = async () => {
    if (selectedCharacter) {
      const updatedCharacter = {
        ...selectedCharacter,
        autoImageEnabled: !isAutoImageEnabled
      };
      await updateCharacter(updatedCharacter);
      setIsAutoImageEnabled(!isAutoImageEnabled);
    }
  };

  // 新增：自定义生成图片开关处理
  const handleCustomImageToggle = async () => {
    if (selectedCharacter) {
      const updatedCharacter = {
        ...selectedCharacter,
        customImageEnabled: !isCustomImageEnabled
      };
      await updateCharacter(updatedCharacter);
      setIsCustomImageEnabled(!isCustomImageEnabled);
    }
  };
  // Add handler for custom user name change
  const handleCustomUserNameChange = async (value: string) => {
    setCustomUserName(value);
  };
  
  // Add handler for saving custom user name
  const saveCustomUserName = async () => {
    if (selectedCharacter) {
      const updatedCharacter = {
        ...selectedCharacter,
        customUserName: customUserName.trim()
      };
      await updateCharacter(updatedCharacter);
      
      // Update the Mem0Service with the custom name
      try {
        const mem0Service = Mem0Service.getInstance();
        mem0Service.setCharacterNames(
          selectedCharacter.id,
          customUserName.trim(),
          selectedCharacter.name
        );
        Alert.alert('成功', '角色对你的称呼已更新');
      } catch (error) {
        console.error('Failed to update memory service with custom names:', error);
      }
    }
  };

  // Add dialog mode toggle function
  const handleModeChange = (newMode: DialogMode) => {
    setMode(newMode);
  };

  // Add handler for dynamic portrait toggle
  const handleDynamicPortraitToggle = async () => {
    if (selectedCharacter) {
      const updatedCharacter = {
        ...selectedCharacter,
        dynamicPortraitEnabled: !isDynamicPortraitEnabled
      };
      
      // If enabling but no video is set, prompt to select a video
      if (!isDynamicPortraitEnabled && !selectedCharacter.dynamicPortraitVideo) {
        handleSelectDynamicPortrait();
      } else {
        await updateCharacter(updatedCharacter);
        setIsDynamicPortraitEnabled(!isDynamicPortraitEnabled);
      }
    }
  };

  // Add handler to select dynamic portrait video
  const handleSelectDynamicPortrait = async () => {
    if (!selectedCharacter) return;

    try {
      // Use DocumentPicker to select video files
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled === false) {
        const videoUri = result.assets[0].uri;
        
        // Update the character with the selected video
        const updatedCharacter = {
          ...selectedCharacter,
          dynamicPortraitVideo: videoUri,
          dynamicPortraitEnabled: true,
        };
        
        await updateCharacter(updatedCharacter);
        setIsDynamicPortraitEnabled(true);
        Alert.alert('成功', '动态立绘视频已设置');
      }
    } catch (error) {
      console.error("Dynamic portrait selection error:", error);
      Alert.alert('错误', '无法选择动态立绘视频');
    }
  };

  // 新增：立即总结记忆按钮的loading状态
  const [isSummarizing, setIsSummarizing] = useState(false);

  // 新增：立即总结记忆的处理函数
  const handleSummarizeMemoryNow = async () => {
    if (!selectedCharacter) return;
    setIsSummarizing(true);
    try {
      // 从settings-helper获取apiKey和apiSettings
      const apiSettingsObj = getApiSettings();
      const apiKey = apiSettingsObj.apiKey || '';
      // 构造apiSettings参数，仅传递node-st-core需要的部分
      const apiSettings = {
        apiProvider: apiSettingsObj.apiProvider as 'gemini' | 'openrouter',
        ...(apiSettingsObj.openrouter ? { openrouter: apiSettingsObj.openrouter } : {})
      };
      const conversationId = selectedCharacter.id;
      // 直接调用 NodeSTCore 的 summarizeMemoryNow
      // summaryRange 可选，这里不传递（如需支持可扩展）
      const result = await NodeSTCore.prototype.summarizeMemoryNow.call(
        NodeSTCore.prototype,
        conversationId,
        selectedCharacter.id,
        apiKey,
        undefined, // summaryRange
        apiSettings
      );
      if (result) {
        Alert.alert('成功', '记忆总结已完成');
      } else {
        Alert.alert('失败', '记忆总结失败');
      }
    } catch (e) {
      Alert.alert('错误', e instanceof Error ? e.message : '记忆总结失败');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Calculate the translateX value based on the provided animation value or fallback
  const sidebarTranslateX = animationValue
    ? animationValue.interpolate({
        inputRange: [0, SIDEBAR_WIDTH_EXPANDED],
        outputRange: [SIDEBAR_WIDTH_EXPANDED, 0], // Reversed for right side positioning
      })
    : new Animated.Value(SIDEBAR_WIDTH_EXPANDED);

  return (
    <View
      style={[
        styles.sidebarContainer,
        {
          pointerEvents: isVisible ? 'auto' : 'none',
        }
      ]}
    >
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [
              { translateX: sidebarTranslateX },
              { translateY: slideYAnim }
            ],
          }
        ]}
      >
        {/* Add swipe handle */}
        <View 
          style={styles.swipeHandle}
          {...panResponder.panHandlers}
        >
          <View style={styles.handleBar} />
        </View>
        
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.settingsContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>角色设置</Text>

          {/* 新增：顶部栏显示开关 */}
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>显示顶部栏</Text>
            <Switch
              value={isTopBarVisible}
              onValueChange={handleToggleTopBar}
              trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
              thumbColor={isTopBarVisible ? 'rgb(255, 224, 195)' : '#f4f3f4'}
            />
          </View>

          {/* Add dialog mode settings section */}
          <View style={styles.settingSection}>
            <Text style={styles.settingSectionTitle}>显示设置</Text>
            
            <TouchableOpacity 
              style={[
                styles.modeButton,
                mode === 'normal' && styles.modeButtonSelected
              ]}
              onPress={() => handleModeChange('normal')}
            >
              <MaterialIcons 
                name="chat" 
                size={24} 
                color={mode === 'normal' ? "rgb(255, 224, 195)" : "#aaa"} 
              />
              <Text style={[
                styles.modeButtonText,
                mode === 'normal' && styles.modeButtonTextSelected
              ]}>
                常规模式
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modeButton,
                mode === 'background-focus' && styles.modeButtonSelected
              ]}
              onPress={() => handleModeChange('background-focus')}
            >
              <MaterialIcons 
                name="image" 
                size={24} 
                color={mode === 'background-focus' ? "rgb(255, 224, 195)" : "#aaa"} 
              />
              <Text style={[
                styles.modeButtonText,
                mode === 'background-focus' && styles.modeButtonTextSelected
              ]}>
                背景强调
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modeButton,
                mode === 'visual-novel' && styles.modeButtonSelected
              ]}
              onPress={() => handleModeChange('visual-novel')}
            >
              <MaterialIcons 
                name="menu-book" 
                size={24} 
                color={mode === 'visual-novel' ? "rgb(255, 224, 195)" : "#aaa"} 
              />
              <Text style={[
                styles.modeButtonText,
                mode === 'visual-novel' && styles.modeButtonTextSelected
              ]}>
                视觉小说
              </Text>
            </TouchableOpacity>
            
            <Text style={styles.settingDescription}>
              更改聊天的显示方式。
            </Text>
          </View>

          {/* Add Custom User Setting Manager - add this before the visual novel settings */}
          {selectedCharacter && (
            <CustomUserSettingsManager 
              character={selectedCharacter} 
              updateCharacter={updateCharacter} 
            />
          )}

          {/* Add custom user name setting */}
          <View style={styles.settingSection}>
            <Text style={styles.settingSectionTitle}>基本设置</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.settingLabel}>角色对我的称呼</Text>
              <TextInput
                style={styles.textInput}
                value={customUserName}
                onChangeText={handleCustomUserNameChange}
                placeholder="设置角色如何称呼你"
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveCustomUserName}
              >
                <Text style={styles.saveButtonText}>保存</Text>
              </TouchableOpacity>
              
              <Text style={styles.settingDescription}>
                设置后，角色将用这个名字称呼你
              </Text>
            </View>
          </View>

          {/* Add dynamic portrait video settings */}
          <View style={styles.settingSection}>
            <Text style={styles.settingSectionTitle}>视觉设置</Text>
            
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>动态立绘</Text>
              <Switch
                value={isDynamicPortraitEnabled}
                onValueChange={handleDynamicPortraitToggle}
                trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
                thumbColor={isDynamicPortraitEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
              />
            </View>

            {/* 新增：自动生成背景开关 */}
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>自动生成背景</Text>
              <Switch
                value={isAutoExtraBgEnabled}
                onValueChange={handleAutoExtraBgToggle}
                trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
                thumbColor={isAutoExtraBgEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
              />
            </View>

            {/* 新增：自动生成图片开关 */}
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>自动生成图片</Text>
              <Switch
                value={isAutoImageEnabled}
                onValueChange={handleAutoImageToggle}
                trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
                thumbColor={isAutoImageEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
              />
            </View>

            {/* 新增：自定义生成图片开关 */}
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>自定义生成图片</Text>
              <Switch
                value={isCustomImageEnabled}
                onValueChange={handleCustomImageToggle}
                trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
                thumbColor={isCustomImageEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
              />
            </View>
            
            {isDynamicPortraitEnabled && (
              <TouchableOpacity
                style={styles.backgroundButton}
                onPress={handleSelectDynamicPortrait}
              >
                <MaterialIcons name="videocam" size={24} color="#fff" />
                <Text style={styles.backgroundButtonText}>
                  {selectedCharacter?.dynamicPortraitVideo ? '更换动态立绘' : '选择动态立绘'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Replace Permanent Memory with Memory Summary */}
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>记忆总结</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Switch
                value={isMemorySummaryEnabled}
                onValueChange={handleMemorySummaryToggle}
                trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
                thumbColor={isMemorySummaryEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
              />
              {/* 新增：立即总结按钮 */}
              <TouchableOpacity
                style={[
                  styles.applyButton,
                  { marginLeft: 10, opacity: isSummarizing ? 0.6 : 1 }
                ]}
                onPress={handleSummarizeMemoryNow}
                disabled={isSummarizing}
              >
                <Text style={styles.applyButtonText}>
                  {isSummarizing ? '总结中...' : '立即总结'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>主动消息</Text>
            <Switch
              value={isAutoMessageEnabled}
              onValueChange={handleAutoMessageToggle}
              trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }} // 修改：使用米黄色
              thumbColor={isAutoMessageEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'} // 修改：使用米黄色
            />
          </View>

          {/* Add auto message timing settings when enabled */}
          {isAutoMessageEnabled && (
            <View style={styles.sliderContainer}>
              <Text style={styles.settingLabel}>主动消息触发时间：{autoMessageInterval} 分钟</Text>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={30}
                step={1}
                value={autoMessageInterval}
                onValueChange={setAutoMessageInterval}
                onSlidingComplete={handleAutoMessageIntervalChange}
                minimumTrackTintColor="rgb(255, 224, 195)"
                maximumTrackTintColor="#767577"
                thumbTintColor="rgb(255, 224, 195)"
              />
              <Text style={styles.sliderRangeText}>
                <Text style={styles.sliderMinText}>较短 (1分钟)</Text>
                <Text style={styles.sliderMaxText}>较长 (30分钟)</Text>
              </Text>
            </View>
          )}

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>消息提醒</Text>
            <Switch
              value={isNotificationEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }} // 修改：使用米黄色
              thumbColor={isNotificationEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'} // 修改：使用米黄色
            />
          </View>

          {/* 添加一些底部间距 */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </Animated.View>

      {isVisible && (
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH_EXPANDED,
    zIndex: 3000, // Keep high z-index to stay above other elements
  },
  sidebar: {
    width: SIDEBAR_WIDTH_EXPANDED,
    height: '100%',
    backgroundColor: "rgba(40, 40, 40, 0.9)", // Darker background to match app theme
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    ...theme.shadows.medium,
  },
  scrollView: {
    flex: 1,
  },
  settingsContainer: {
    paddingTop: 10, // Reduced from previous padding to account for swipe handle
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 20,
  },
  swipeHandle: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40, // 顶部安全区域
  },
  handleBar: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 5,
  },
  bottomPadding: {
    height: 30, // 添加底部额外空间
  },
  settingLabel: {
    fontSize: 16,
    color: "#fff", // White text for better contrast
    fontWeight: '500',
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    right: SIDEBAR_WIDTH_EXPANDED,
    height: '100%',
    width: Dimensions.get('window').width - SIDEBAR_WIDTH_EXPANDED,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)", // 修改：使用米黄色
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    marginTop: 10, // Add some spacing at the top
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(60, 60, 60, 0.8)', // Darker item background
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.small,
    marginBottom: theme.spacing.sm,
  },
  backgroundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)', // Darker button background
    padding: 15,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  backgroundButtonText: {
    fontSize: 16,
    color: '#fff', // White text for better contrast
    fontWeight: '500',
  },
  settingSection: {
    marginTop: 20,
  },
  settingSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)", // Accent color
    marginBottom: theme.spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(60, 60, 60, 0.8)', // Darker row background
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.small,
    marginBottom: theme.spacing.sm,
  },
  pickerContainer: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  picker: {
    height: 40,
    color: "#fff", // White text for better contrast
  },
  settingDescription: {
    color: '#ccc', // Lighter text for better visibility
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  sliderContainer: {
    marginVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: theme.borderRadius.md,
    padding: 15,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderRangeText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  sliderMinText: {
    color: '#ccc',
    fontSize: 12,
  },
  sliderMaxText: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'right',
  },
  applyButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginVertical: 10,
  },
  applyButtonText: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '600',
  },
  inputContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  textInput: {
    backgroundColor: 'rgba(80, 80, 80, 0.8)',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginVertical: 8,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  saveButtonText: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '600',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  modeButtonSelected: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)', // Consistent accent color with transparency
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 1,
  },
  modeButtonText: {
    fontSize: 16,
    color: '#ddd',
    marginLeft: 10,
  },
  modeButtonTextSelected: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '600',
  },
  colorOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  colorOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#555',
  },
  colorOptionSelected: {
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 3,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  positionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  positionButtonSelected: {
    backgroundColor: 'rgba(255, 224, 195, 0.3)',
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 1,
  },
  positionButtonText: {
    color: '#ddd',
    fontSize: 16,
    fontWeight: '500',
  },
  positionButtonTextSelected: {
    color: 'rgb(255, 224, 195)',
  },
  gearButton: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 224, 195, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

