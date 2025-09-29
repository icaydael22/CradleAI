import React, { useState, useRef, useEffect } from 'react';
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
import { EventRegister } from 'react-native-event-listeners';

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
    const listener = EventRegister.addEventListener('topBarVisibilityChanged', (visible: boolean) => {
      setIsTopBarVisible(visible);
    });
    return () => {
      EventRegister.removeEventListener(listener as string);
    };
  }, []);

  const handleToggleTopBar = () => {
    const newVisible = !isTopBarVisible;
    setIsTopBarVisible(newVisible);
    EventRegister.emit('toggleTopBarVisibility', newVisible);
  };

  return (
    <SettingToggle
      label="显示顶部栏"
      value={isTopBarVisible}
      onValueChange={handleToggleTopBar}
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

  // Handle swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          slideYAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          Animated.timing(slideYAnim, {
            toValue: 300,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onClose();
            slideYAnim.setValue(0);
          });
        } else {
          Animated.spring(slideYAnim, {
            toValue: 0,
            friction: 5,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Reset Y position when visibility changes
  useEffect(() => {
    if (isVisible) {
      slideYAnim.setValue(0);
    }
  }, [isVisible]);

  // Dialog mode change handler
  const handleModeChange = (newMode: any) => {
    setMode(newMode);
  };

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
        {...panResponder.panHandlers}
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
          <Text style={styles.title}>角色设置</Text>

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
});
