import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system';
import ColorPicker from './common/ColorPicker';
import { theme } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ChatUISettings {
  // Regular mode
  regularUserBubbleColor: string;
  regularUserBubbleAlpha: number;
  regularBotBubbleColor: string;
  regularBotBubbleAlpha: number;
  regularUserTextColor: string;
  regularBotTextColor: string;
  
  // Background focus mode
  bgUserBubbleColor: string;
  bgUserBubbleAlpha: number;
  bgBotBubbleColor: string;
  bgBotBubbleAlpha: number;
  bgUserTextColor: string;
  bgBotTextColor: string;
  
  // Visual novel mode
  vnDialogColor: string;
  vnDialogAlpha: number;
  vnTextColor: string;
  
  // Global sizes
  bubblePaddingMultiplier: number;
  textSizeMultiplier: number;
}

const DEFAULT_SETTINGS: ChatUISettings = {
  // Regular mode
  regularUserBubbleColor: 'rgb(255, 224, 195)',
  regularUserBubbleAlpha: 0.95,
  regularBotBubbleColor: 'rgb(68, 68, 68)',
  regularBotBubbleAlpha: 0.85,
  regularUserTextColor: '#333333',
  regularBotTextColor: '#ffffff',
  
  // Background focus mode
  bgUserBubbleColor: 'rgb(255, 224, 195)',
  bgUserBubbleAlpha: 0.95,
  bgBotBubbleColor: 'rgb(68, 68, 68)',
  bgBotBubbleAlpha: 0.9,
  bgUserTextColor: '#333333',
  bgBotTextColor: '#ffffff',
  
  // Visual novel mode
  vnDialogColor: 'rgb(0, 0, 0)',
  vnDialogAlpha: 0.7,
  vnTextColor: '#ffffff',
  
  // Global sizes
  bubblePaddingMultiplier: 1.0,
  textSizeMultiplier: 1.0
};

const SETTINGS_FILE = `${FileSystem.documentDirectory}chat_ui_settings.json`;

export const useChatUISettings = () => {
  const [settings, setSettings] = useState<ChatUISettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  
  // Load settings from file system
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(SETTINGS_FILE);
        
        if (fileInfo.exists) {
          const fileContent = await FileSystem.readAsStringAsync(SETTINGS_FILE);
          setSettings(JSON.parse(fileContent));
        }
        setLoaded(true);
      } catch (error) {
        console.error('Error loading UI settings:', error);
        setLoaded(true);
      }
    };
    
    loadSettings();
  }, []);
  
  // Save settings to file system
  const saveSettings = async (newSettings: ChatUISettings) => {
    try {
      await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(newSettings));
      setSettings(newSettings);
      return true;
    } catch (error) {
      console.error('Error saving UI settings:', error);
      return false;
    }
  };
  
  const updateSettings = async (updatedSettings: Partial<ChatUISettings>) => {
    const newSettings = { ...settings, ...updatedSettings };
    return saveSettings(newSettings);
  };
  
  const resetToDefaults = async () => {
    return saveSettings(DEFAULT_SETTINGS);
  };
  
  return { settings, loaded, updateSettings, resetToDefaults };
};

// Create a context for the UI settings
export const ChatUISettingsContext = React.createContext<{
  settings: ChatUISettings;
  loaded: boolean;
  updateSettings: (settings: Partial<ChatUISettings>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
}>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  updateSettings: async () => false,
  resetToDefaults: async () => false,
});

interface ChatUISettingsModalProps {
  visible: boolean;
  onClose: () => void;
  activeMode: 'regular' | 'background-focus' | 'visual-novel';
}

const ChatUISettingsModal: React.FC<ChatUISettingsModalProps> = ({
  visible,
  onClose,
  activeMode
}) => {
  // 解决“fail to save setting”问题：不要在每次render时都setChanged(true)
  // 只在设置实际变更且保存成功时才setChanged(true)，并在关闭时重置
  const { settings, updateSettings, resetToDefaults } = React.useContext(ChatUISettingsContext);
  const [activeTab, setActiveTab] = useState<'regular' | 'bg-focus' | 'visual-novel' | 'global'>('regular');
  const [changed, setChanged] = useState(false);
  const insets = useSafeAreaInsets();

  // Set initial active tab based on the current active mode
  useEffect(() => {
    if (activeMode === 'regular') setActiveTab('regular');
    else if (activeMode === 'background-focus') setActiveTab('bg-focus');
    else if (activeMode === 'visual-novel') setActiveTab('visual-novel');
  }, [activeMode]);

  // 关闭弹窗时重置changed提示
  useEffect(() => {
    if (!visible) setChanged(false);
  }, [visible]);

  const handleSave = async (updatedValues: Partial<ChatUISettings>) => {
    // 检查是否真的有变更，避免无意义的保存
    let hasDiff = false;
    for (const k in updatedValues) {
      const key = k as keyof ChatUISettings;
      if (settings[key] !== updatedValues[key]) {
        hasDiff = true;
        break;
      }
    }
    
    if (!hasDiff) return;

    const success = await updateSettings(updatedValues);
    if (success) {
      setChanged(true);
    } else {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const handleResetConfirm = () => {
    Alert.alert(
      '重置设置',
      '确定要将所有UI设置恢复为默认值吗？',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '重置', 
          style: 'destructive',
          onPress: async () => {
            const success = await resetToDefaults();
            if (success) {
              setChanged(true);
            } else {
              Alert.alert('Error', 'Failed to reset settings');
            }
          }
        }
      ]
    );
  };

  const renderColorWithAlpha = (label: string, color: string, alpha: number, onColorChange: (color: string) => void, onAlphaChange: (alpha: number) => void) => (
    <View style={styles.settingItem}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingRow}>
        <ColorPicker
          color={color}
          onColorChange={onColorChange}
          style={styles.colorPicker}
        />
        <View style={styles.alphaSliderContainer}>
          <Text style={styles.alphaLabel}>透明度: {Math.round(alpha * 100)}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={alpha}
            onValueChange={onAlphaChange}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#777"
            thumbTintColor={theme.colors.primary}
          />
        </View>
      </View>
      <View style={[styles.colorPreview, { 
        backgroundColor: color.replace('rgb', 'rgba').replace(')', `,${alpha})`) 
      }]} />
    </View>
  );
  
  const renderTextColorSetting = (label: string, color: string, onColorChange: (color: string) => void) => (
    <View style={styles.settingItem}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingRow}>
        <ColorPicker
          color={color}
          onColorChange={onColorChange}
          style={styles.colorPicker}
        />
      </View>
      <View style={[styles.colorPreview, { backgroundColor: color }]}>
        <Text style={{ color: '#fff', fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 2 }}>示例文本</Text>
      </View>
    </View>
  );

  const renderSizeSlider = (label: string, value: number, onValueChange: (value: number) => void, min: number = 0.7, max: number = 1.5) => (
    <View style={styles.settingItem}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.sliderContainer}>
        <Text style={styles.sliderValue}>{Math.round(value * 100)}%</Text>
        <Slider
          style={[styles.slider, { width: '80%' }]}
          minimumValue={min}
          maximumValue={max}
          step={0.05}
          value={value}
          onValueChange={onValueChange}
          minimumTrackTintColor={theme.colors.primary}
          maximumTrackTintColor="#777"
          thumbTintColor={theme.colors.primary}
        />
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={30} style={[styles.container, {paddingTop: insets.top}]} tint="dark">
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>界面设置</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'regular' && styles.activeTab]} 
              onPress={() => setActiveTab('regular')}
            >
              <Text style={[styles.tabText, activeTab === 'regular' && styles.activeTabText]}>常规模式</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'bg-focus' && styles.activeTab]} 
              onPress={() => setActiveTab('bg-focus')}
            >
              <Text style={[styles.tabText, activeTab === 'bg-focus' && styles.activeTabText]}>背景强调</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'visual-novel' && styles.activeTab]} 
              onPress={() => setActiveTab('visual-novel')}
            >
              <Text style={[styles.tabText, activeTab === 'visual-novel' && styles.activeTabText]}>视觉小说</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'global' && styles.activeTab]} 
              onPress={() => setActiveTab('global')}
            >
              <Text style={[styles.tabText, activeTab === 'global' && styles.activeTabText]}>全局</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {activeTab === 'regular' && (
              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>常规模式设置</Text>
                
                {/* User Bubble Color */}
                {renderColorWithAlpha(
                  '用户气泡颜色',
                  settings.regularUserBubbleColor,
                  settings.regularUserBubbleAlpha,
                  (color) => handleSave({ regularUserBubbleColor: color }),
                  (alpha) => handleSave({ regularUserBubbleAlpha: alpha })
                )}
                
                {/* Bot Bubble Color */}
                {renderColorWithAlpha(
                  'AI气泡颜色',
                  settings.regularBotBubbleColor,
                  settings.regularBotBubbleAlpha,
                  (color) => handleSave({ regularBotBubbleColor: color }),
                  (alpha) => handleSave({ regularBotBubbleAlpha: alpha })
                )}
                
                {/* User Text Color */}
                {renderTextColorSetting(
                  '用户文本颜色',
                  settings.regularUserTextColor,
                  (color) => handleSave({ regularUserTextColor: color })
                )}
                
                {/* Bot Text Color */}
                {renderTextColorSetting(
                  'AI文本颜色',
                  settings.regularBotTextColor,
                  (color) => handleSave({ regularBotTextColor: color })
                )}
              </View>
            )}
            
            {activeTab === 'bg-focus' && (
              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>背景强调模式设置</Text>
                
                {/* User Bubble Color */}
                {renderColorWithAlpha(
                  '用户气泡颜色',
                  settings.bgUserBubbleColor,
                  settings.bgUserBubbleAlpha,
                  (color) => handleSave({ bgUserBubbleColor: color }),
                  (alpha) => handleSave({ bgUserBubbleAlpha: alpha })
                )}
                
                {/* Bot Bubble Color */}
                {renderColorWithAlpha(
                  'AI气泡颜色',
                  settings.bgBotBubbleColor,
                  settings.bgBotBubbleAlpha,
                  (color) => handleSave({ bgBotBubbleColor: color }),
                  (alpha) => handleSave({ bgBotBubbleAlpha: alpha })
                )}
                
                {/* User Text Color */}
                {renderTextColorSetting(
                  '用户文本颜色',
                  settings.bgUserTextColor,
                  (color) => handleSave({ bgUserTextColor: color })
                )}
                
                {/* Bot Text Color */}
                {renderTextColorSetting(
                  'AI文本颜色',
                  settings.bgBotTextColor,
                  (color) => handleSave({ bgBotTextColor: color })
                )}
              </View>
            )}
            
            {activeTab === 'visual-novel' && (
              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>视觉小说模式设置</Text>
                
                {/* VN Dialog Color */}
                {renderColorWithAlpha(
                  '对话框背景颜色',
                  settings.vnDialogColor,
                  settings.vnDialogAlpha,
                  (color) => handleSave({ vnDialogColor: color }),
                  (alpha) => handleSave({ vnDialogAlpha: alpha })
                )}
                
                {/* VN Text Color */}
                {renderTextColorSetting(
                  '文本颜色',
                  settings.vnTextColor,
                  (color) => handleSave({ vnTextColor: color })
                )}
              </View>
            )}
            
            {activeTab === 'global' && (
              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>全局设置</Text>
                
                {/* Bubble Padding Size */}
                {renderSizeSlider(
                  '气泡内边距',
                  settings.bubblePaddingMultiplier,
                  (value) => handleSave({ bubblePaddingMultiplier: value })
                )}
                
                {/* Text Size */}
                {renderSizeSlider(
                  '文本大小',
                  settings.textSizeMultiplier,
                  (value) => handleSave({ textSizeMultiplier: value })
                )}
                
                {/* Reset to Default */}
                <TouchableOpacity 
                  style={styles.resetButton}
                  onPress={handleResetConfirm}
                >
                  <Ionicons name="refresh-circle" size={20} color="#fff" />
                  <Text style={styles.resetButtonText}>重置为默认值</Text>
                </TouchableOpacity>
              </View>
            )}

            {changed && (
              <View style={styles.changedBanner}>
                <Text style={styles.changedText}>设置已保存</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  },
  modal: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#222',
    borderRadius: 12,
    maxHeight: '80%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444'
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  closeButton: {
    padding: 4
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#444'
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center'
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary
  },
  tabText: {
    fontSize: 14,
    color: '#aaa'
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: 'bold'
  },
  content: {
    padding: 16
  },
  settingsSection: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  settingItem: {
    marginBottom: 16
  },
  settingLabel: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 8
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  colorPicker: {
    width: 100,
    height: 40
  },
  alphaSliderContainer: {
    flex: 1,
    marginLeft: 16
  },
  alphaLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4
  },
  slider: {
    width: '100%',
    height: 40
  },
  colorPreview: {
    height: 40,
    borderRadius: 8,
    marginTop: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sliderValue: {
    color: '#aaa',
    width: 45,
    textAlign: 'center'
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16
  },
  resetButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8
  },
  changedBanner: {
    backgroundColor: '#2ecc71',
    padding: 12,
    borderRadius: 8,
    marginVertical: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  changedText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});

export default ChatUISettingsModal;
export const ChatUISettingsProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const settings = useChatUISettings();
  
  return (
    <ChatUISettingsContext.Provider value={settings}>
      {children}
    </ChatUISettingsContext.Provider>
  );
};
