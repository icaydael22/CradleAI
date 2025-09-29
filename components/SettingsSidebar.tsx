import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ScrollView,
  PanResponder,
} from 'react-native';
import { Character } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { theme } from '@/constants/theme';
import { useDialogMode } from '@/constants/DialogModeContext';
import { useRouter } from 'expo-router';
import { EventRegister } from 'react-native-event-listeners';
import { Ionicons } from '@expo/vector-icons';

// Import optimized settings components
import DialogModeSetting from './settings/DialogModeSetting';
import CustomUserSetting from './settings/CustomUserSetting';
import BasicSettings from './settings/BasicSettings';
import VisualSettings from './settings/VisualSettings';
import NotificationSettings from './settings/NotificationSettings';
import SettingToggle from './settings/SettingToggle';

const SIDEBAR_WIDTH_EXPANDED = 280;
const SWIPE_THRESHOLD = 50;

interface SettingsSideBarProps {
  isVisible: boolean;
  onClose: () => void;
  selectedCharacter: Character | undefined | null;
  animationValue?: Animated.Value;
}

// TopBarVisibility component - lightweight toggle for UI visibility
const TopBarVisibility: React.FC = React.memo(() => {
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);

  useEffect(() => {
    // 监听其他组件发送的顶部栏可见性变化事件
    const listener = EventRegister.addEventListener('topBarVisibilityChanged', (visible: boolean) => {
      console.log('[TopBarVisibility] Received topBarVisibilityChanged event:', visible);
      setIsTopBarVisible(visible);
    });
    
    return () => {
      EventRegister.removeEventListener(listener as string);
    };
  }, []);

  const handleToggleTopBar = useCallback(() => {
    const newVisible = !isTopBarVisible;
    console.log('[TopBarVisibility] Toggling top bar visibility to:', newVisible);
    
    // 更新本地状态
    setIsTopBarVisible(newVisible);
    
    // 发送事件通知其他组件
    EventRegister.emit('toggleTopBarVisibility', newVisible);
    
    // 同时发送状态变化事件，保持一致性
    EventRegister.emit('topBarVisibilityChanged', newVisible);
  }, [isTopBarVisible]);

  return (
    <SettingToggle
      label="显示顶部栏"
      value={isTopBarVisible}
      onValueChange={handleToggleTopBar}
      description="隐藏顶部栏可以为聊天界面提供更多空间"
    />
  );
});

export default function SettingsSidebar({
  isVisible,
  onClose,
  selectedCharacter,
  animationValue,
}: SettingsSideBarProps) {
  const slideYAnim = useRef(new Animated.Value(0)).current;
  const { updateCharacter } = useCharacters();
  const { mode, setMode } = useDialogMode();
  const router = useRouter();



  // Dialog mode change handler
  const handleModeChange = useCallback((newMode: any) => {
    console.log('[SettingsSidebar] Changing dialog mode to:', newMode);
    setMode(newMode);
  }, [setMode]);

  // Calculate the translateX value based on the provided animation value or fallback
  const sidebarTranslateX = animationValue
    ? animationValue.interpolate({
        inputRange: [0, SIDEBAR_WIDTH_EXPANDED],
        outputRange: [SIDEBAR_WIDTH_EXPANDED, 0],
      })
    : new Animated.Value(isVisible ? 0 : SIDEBAR_WIDTH_EXPANDED);

  // Early return after all hooks have been called
  if (!selectedCharacter) {
    return null;
  }

  return (
    <View
      style={[
        styles.sidebarContainer,
        {
          pointerEvents: isVisible ? 'auto' : 'none',
        }
      ]}
    >
      {/* Overlay touchable */}
      {isVisible && (
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      )}
      
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
        {/* Swipe handle */}
        <View style={styles.swipeHandle}>
          <View style={styles.handleBar} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.settingsContainer}
          showsVerticalScrollIndicator={false}
        >

          {/* API Settings quick link */}
          <View style={styles.apiSection}>
            <View style={styles.apiRow}>
              <Text style={styles.apiTitle}>API 设置</Text>
              <TouchableOpacity
                style={styles.apiIconButton}
                onPress={() => {
                  try {
                    router.push('/pages/api-settings');
                  } catch (e) {
                    console.warn('[SettingsSidebar] Failed to navigate to API settings', e);
                  }
                }}
              >
                <Ionicons name="settings-outline" size={20} color="rgb(255, 224, 195)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Dialog Mode Settings */}
          <DialogModeSetting 
            mode={mode} 
            onModeChange={handleModeChange} 
          />

          {/* Custom User Settings */}
          <CustomUserSetting 
            character={selectedCharacter} 
            updateCharacter={updateCharacter} 
          />

          {/* Basic Settings */}
          <BasicSettings 
            character={selectedCharacter} 
            updateCharacter={updateCharacter} 
          />

          {/* Visual Settings */}
          <VisualSettings 
            character={selectedCharacter} 
            updateCharacter={updateCharacter} 
          />

          {/* Notification & Memory Settings */}
          <NotificationSettings 
            character={selectedCharacter} 
            updateCharacter={updateCharacter} 
          />

          {/* Top Bar Visibility */}
          <TopBarVisibility />

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3000,
  },
  sidebar: {
    width: SIDEBAR_WIDTH_EXPANDED,
    height: '100%',
    backgroundColor: "rgba(40, 40, 40, 0.9)",
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
    paddingTop: 10,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 20,
  },
  swipeHandle: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  handleBar: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 5,
  },
  bottomPadding: {
    height: 30,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: Dimensions.get('window').width - SIDEBAR_WIDTH_EXPANDED,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)",
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    marginTop: 10,
  },
  apiSection: {
    marginBottom: theme.spacing.md,
    alignItems: 'flex-start',
  },
  apiRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  apiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
    marginBottom: theme.spacing.sm,
    textAlign: 'left',
  },
  apiIconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 224, 195, 0.06)',
  },
});
