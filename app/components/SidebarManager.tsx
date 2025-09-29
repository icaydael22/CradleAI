import React, { memo, useEffect, useCallback } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Character, User } from '@/shared/types';
import { Group } from '@/src/group';
import Sidebar from '@/components/Sidebar';

const SIDEBAR_WIDTH = 280;

interface SidebarManagerProps {
  isSidebarVisible: boolean;
  isSettingsSidebarVisible: boolean;
  isGroupSettingsSidebarVisible: boolean;
  selectedCharacter: Character | null;
  selectedConversationId: string | null;
  conversations: Character[];
  currentUser: User;
  disbandedGroups: string[];
  sidebarAnimation: Animated.Value;
  settingsAnimation: Animated.Value;
  groupSettingsAnimation: Animated.Value;
  onSelectConversation: (id: string) => void;
  onCloseSidebar: () => void;
  onCloseSettingsSidebar: () => void;
  onCloseGroupSettingsSidebar: () => void;
  onGroupsUpdated?: (groups: Group[]) => void;
  onGroupDisbanded?: (disbandedGroupId: string) => void;
  children: React.ReactNode;
}

const SidebarManager = memo<SidebarManagerProps>(({
  isSidebarVisible,
  isSettingsSidebarVisible,
  isGroupSettingsSidebarVisible,
  selectedCharacter,
  selectedConversationId,
  conversations,
  currentUser,
  disbandedGroups,
  sidebarAnimation,
  settingsAnimation,
  groupSettingsAnimation,
  onSelectConversation,
  onCloseSidebar,
  onCloseSettingsSidebar,
  onCloseGroupSettingsSidebar,
  onGroupsUpdated,
  onGroupDisbanded,
  children,
}) => {
  // Animate sidebar in/out
  useEffect(() => {
    Animated.timing(sidebarAnimation, {
      toValue: isSidebarVisible ? SIDEBAR_WIDTH : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSidebarVisible, sidebarAnimation]);

  // Animate settings sidebar in/out
  useEffect(() => {
    Animated.timing(settingsAnimation, {
      toValue: isSettingsSidebarVisible ? -300 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSettingsSidebarVisible, settingsAnimation]);

  // Animate group settings sidebar in/out
  useEffect(() => {
    Animated.timing(groupSettingsAnimation, {
      toValue: isGroupSettingsSidebarVisible ? -300 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isGroupSettingsSidebarVisible, groupSettingsAnimation]);

  // Create animated styles for content shifting
  const contentTransform = sidebarAnimation.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0, SIDEBAR_WIDTH],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Main content with sidebar animation */}
      <Animated.View 
        style={[
          styles.mainContent,
          {
            transform: [{ translateX: contentTransform }],
          },
        ]}
      >
        {children}
      </Animated.View>
      
      {/* Main Sidebar */}
      {isSidebarVisible && (
        <Sidebar
          isVisible={isSidebarVisible}
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={onSelectConversation}
          onClose={onCloseSidebar}
          animationValue={sidebarAnimation}
          currentUser={currentUser}
          disbandedGroups={disbandedGroups}
          onGroupsUpdated={onGroupsUpdated}
          onGroupDisbanded={onGroupDisbanded}
        />
      )}

      {/* Settings Sidebar */}
      {isSettingsSidebarVisible && (
        <Animated.View 
          style={[
            styles.settingsOverlay,
            {
              transform: [{ translateX: settingsAnimation }],
            },
          ]}
        >
          {/* Settings sidebar content will be added here */}
        </Animated.View>
      )}

      {/* Group Settings Sidebar */}
      {isGroupSettingsSidebarVisible && (
        <Animated.View 
          style={[
            styles.groupSettingsOverlay,
            {
              transform: [{ translateX: groupSettingsAnimation }],
            },
          ]}
        >
          {/* Group settings sidebar content will be added here */}
        </Animated.View>
      )}
    </View>
  );
});

SidebarManager.displayName = 'SidebarManager';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  settingsOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 300,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  groupSettingsOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 300,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

export default SidebarManager;
