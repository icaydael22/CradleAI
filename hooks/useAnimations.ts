import { useMemo, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

interface UseAnimationsProps {
  isSidebarVisible: boolean;
  isSettingsSidebarVisible: boolean;
  groupSettingsSidebarVisible: boolean;
}

const SIDEBAR_WIDTH = 280;
const ANIMATION_DURATION = 300;
const ANIMATION_EASING = Easing.inOut(Easing.ease);

export const useAnimations = ({ 
  isSidebarVisible, 
  isSettingsSidebarVisible, 
  groupSettingsSidebarVisible 
}: UseAnimationsProps) => {
  // Animation values
  const contentSlideAnim = useMemo(() => new Animated.Value(0), []);
  const settingsSlideAnim = useMemo(() => new Animated.Value(0), []);
  const groupSettingsSidebarAnim = useMemo(() => new Animated.Value(0), []);

  // Left sidebar animation (main sidebar)
  useEffect(() => {
    Animated.timing(contentSlideAnim, {
      toValue: isSidebarVisible ? SIDEBAR_WIDTH : 0,
      duration: ANIMATION_DURATION,
      easing: ANIMATION_EASING,
      useNativeDriver: true,
    }).start();
  }, [isSidebarVisible, contentSlideAnim]);

  // Right sidebar animation (settings sidebar)
  useEffect(() => {
    Animated.timing(settingsSlideAnim, {
      toValue: isSettingsSidebarVisible ? SIDEBAR_WIDTH : 0,
      duration: ANIMATION_DURATION,
      easing: ANIMATION_EASING,
      useNativeDriver: true,
    }).start();
  }, [isSettingsSidebarVisible, settingsSlideAnim]);

  // Group settings sidebar animation
  useEffect(() => {
    Animated.timing(groupSettingsSidebarAnim, {
      toValue: groupSettingsSidebarVisible ? SIDEBAR_WIDTH : 0,
      duration: ANIMATION_DURATION,
      easing: ANIMATION_EASING,
      useNativeDriver: true,
    }).start();
  }, [groupSettingsSidebarVisible, groupSettingsSidebarAnim]);

  // Combined main content animation
  const mainContentTransform = useMemo(() => {
    return Animated.add(
      contentSlideAnim,
      settingsSlideAnim.interpolate({
        inputRange: [0, SIDEBAR_WIDTH],
        outputRange: [0, -SIDEBAR_WIDTH], // Move left when settings sidebar opens
      })
    );
  }, [contentSlideAnim, settingsSlideAnim]);

  return {
    contentSlideAnim,
    settingsSlideAnim,
    groupSettingsSidebarAnim,
    mainContentTransform,
  };
};
