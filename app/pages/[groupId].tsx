import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Group page variant uses static background, no direct video import

// Context hooks
import { useUser } from '@/constants/UserContext';
import { useDialogMode } from '@/constants/DialogModeContext';
import { useCharacters } from '@/constants/CharactersContext';

// Custom hooks
import { useUIState } from '@/hooks/useUIState';
import { useChatState } from '@/hooks/useChatState';
import { useGroupState } from '@/hooks/useGroupState';
import { usePerformanceManager } from '@/hooks/usePerformanceManager';
import { useBackgroundState } from '@/hooks/useBackgroundState';
import { useAnimations } from '@/hooks/useAnimations';

// Components
import TopBarWithBackground from '@/components/TopBarWithBackground';
import GroupInterface from '@/app/components/GroupInterface';
import SettingsSidebar from '@/components/SettingsSidebar';
import GroupSettingsSidebar from '@/components/group/GroupSettingsSidebar';
import GroupManagementModal from '@/components/group/GroupManagementModal';
import SaveManager from '@/app/pages/SaveManager';
import MemoOverlay from '@/app/pages/MemoOverlay';

// Types and Services
import { Character, User } from '@/shared/types';
import { Group, GroupMessage } from '@/src/group/group-types';
import { sendGroupMessage, getGroupMessages, getUserGroups, addGroupMessageListener } from '@/src/group';

const GroupChatPage = memo(() => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const groupId = params.groupId as string;
  
  // Context hooks
  const { user } = useUser();
  const { mode } = useDialogMode();
  const {
    conversations,
    characters,
    isLoading: charactersLoading,
  } = useCharacters() as any;

  // Custom state management hooks
  const [uiState, uiActions] = useUIState();
  const [chatState, chatActions] = useChatState();
  const [groupState, groupActions] = useGroupState();
  const [performanceState, performanceActions] = usePerformanceManager();
  const [backgroundState, backgroundActions] = useBackgroundState();

  // Group-specific state
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [isGroupDisbanded, setIsGroupDisbanded] = useState(false);

  // Animation hooks
  const { 
    settingsSlideAnim, 
    groupSettingsSidebarAnim, 
  } = useAnimations({
    isSidebarVisible: false, // 群聊页面不需要侧边栏
    isSettingsSidebarVisible: uiState.isSettingsSidebarVisible,
    groupSettingsSidebarVisible: uiState.groupSettingsSidebarVisible,
  });

  // 设置当前群组ID
  useEffect(() => {
    if (groupId && groupId !== groupState.selectedGroupId) {
      groupActions.setSelectedGroupId(groupId);
      groupActions.setIsGroupMode(true);
    }
  }, [groupId, groupState.selectedGroupId, groupActions]);

  // Load group data when groupId changes
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const loadGroupData = async () => {
      if (!groupId || !user) return;

      try {
        setIsLoadingMessages(true);
        
        // Load user groups to find current group
        const userGroups = await getUserGroups(user);
        const group = userGroups.find(g => g.groupId === groupId);
        
        if (!group) {
          console.error(`Group ${groupId} not found or user not a member`);
          setIsGroupDisbanded(true);
          return;
        }

        setCurrentGroup(group);
        setIsGroupDisbanded(false);

        // Load group members (characters)
        const memberCharacters = characters.filter((char: Character) => 
          group.groupMemberIds.includes(char.id)
        );
        setGroupMembers(memberCharacters);

        // Load group messages
        const messages = await getGroupMessages(groupId);
        setGroupMessages(messages);

        // Set up message listener for real-time updates
        unsubscribe = addGroupMessageListener(groupId, (updatedMessages) => {
          console.log(`[GroupChatPage] Received message update for group ${groupId}, count: ${updatedMessages.length}`);
          setGroupMessages(updatedMessages);
        });

      } catch (error) {
        console.error('Failed to load group data:', error);
        performanceActions.showTransientError('Failed to load group data');
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadGroupData();

    // Cleanup function to remove message listener
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [groupId, user, characters, performanceActions]);

  // Memoized selected group and background image
  const selectedGroup = useMemo(() => {
    return currentGroup;
  }, [currentGroup]);

  const groupBackgroundImage = useMemo(() => {
    return backgroundActions.getGroupBackgroundImage(selectedGroup);
  }, [selectedGroup, backgroundState.groupBackgrounds]);

  // TopBar callback handlers
  const handleAvatarPress = useCallback(() => {
    if (currentGroup) {
      uiActions.toggleGroupManagement();
    }
  }, [currentGroup, uiActions]);

  const handleMemoPress = useCallback(() => {
    uiActions.toggleMemoSheet();
  }, [uiActions]);

  const handleSettingsPress = useCallback(() => {
    uiActions.toggleSettingsSidebar();
  }, [uiActions]);

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleSaveManagerPress = useCallback(() => {
    uiActions.toggleSaveManager();
  }, [uiActions]);

  const handleGroupSettingsPress = useCallback(() => {
    uiActions.toggleGroupSettings();
  }, [uiActions]);

  // Message sending handler
  const handleSendMessage = useCallback(async (text: string) => {
    if (!groupId || !user || !text.trim() || isSendingMessage) {
      return;
    }

    try {
      setIsSendingMessage(true);
      
      const message = await sendGroupMessage(user, groupId, text.trim());
      
      if (message) {
        // Refresh messages to get the latest state
        const updatedMessages = await getGroupMessages(groupId);
        setGroupMessages(updatedMessages);
      } else {
        performanceActions.showTransientError('Failed to send message');
      }
      
    } catch (error) {
      console.error('Failed to send group message:', error);
      performanceActions.showTransientError('Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  }, [groupId, user, isSendingMessage, performanceActions]);

  const handleScrollPositionChange = useCallback((groupId: string, position: number) => {
    // Handle scroll position tracking if needed
    console.log(`Group ${groupId} scroll position: ${position}`);
  }, []);

  const handleGroupDisbanded = useCallback((disbandedGroupId: string) => {
    if (disbandedGroupId === groupId) {
      setIsGroupDisbanded(true);
      setGroupMessages([]);
      groupActions.handleGroupDisbanded(disbandedGroupId);
      
      // Show a message and navigate back after a delay
      performanceActions.showTransientError('群聊已解散');
      setTimeout(() => {
        router.push('/');
      }, 2000);
    }
  }, [groupId, groupActions, router, performanceActions]);

  const handleGroupUpdated = useCallback(async () => {
    // Reload group data when group is updated
    if (!groupId || !user) return;

    try {
      const userGroups = await getUserGroups(user);
      const group = userGroups.find(g => g.groupId === groupId);
      
      if (group) {
        setCurrentGroup(group);
        
        // Update group members
        const memberCharacters = characters.filter((char: Character) => 
          group.groupMemberIds.includes(char.id)
        );
        setGroupMembers(memberCharacters);
      }
    } catch (error) {
      console.error('Failed to reload group data:', error);
    }
  }, [groupId, user, characters]);

  // Video playback status handler
  const handlePlaybackStatusUpdate = useCallback((status: any) => {
    if (status.isLoaded && !backgroundState.isVideoReady) {
      backgroundActions.setVideoReady(true);
    }
    if (status.error && !backgroundState.videoError) {
      console.error('Video playback error:', status.error);
      backgroundActions.setVideoError(status.error?.toString() || 'Video playback failed');
    }
  }, [backgroundState.isVideoReady, backgroundState.videoError, backgroundActions]);

  if (charactersLoading || isLoadingMessages) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Dynamic Background Container */}
      <View style={styles.backgroundContainer}>
        <ImageBackground
          source={groupBackgroundImage}
          style={styles.backgroundImage}
          resizeMode="cover"
          key={`group-bg-${selectedGroup?.groupId}-${backgroundState.groupBackgrounds[selectedGroup?.groupId || '']}`}
        >
          <View style={{flex: 1}} />
        </ImageBackground>
      </View>
      
      {user && (
        <>
          {/* Top Bar */}
          <TopBarWithBackground
            selectedCharacter={null}
            selectedGroup={selectedGroup}
            onAvatarPress={handleAvatarPress}
            onMemoPress={handleMemoPress}
            onSettingsPress={handleSettingsPress}
            onMenuPress={handleBackPress}
            onSaveManagerPress={handleSaveManagerPress}
            onGroupSettingsPress={handleGroupSettingsPress}
            currentUser={user}
            isGroupMode={true}
            onGroupDisbanded={handleGroupDisbanded}
          />
          
          {/* Main Content */}
          <View style={styles.mainContent}>
            <GroupInterface
              groupId={groupId}
              messages={groupMessages}
              groupMembers={groupMembers}
              currentUser={user}
              isSendingMessage={isSendingMessage}
              onSendMessage={handleSendMessage}
              onScrollPositionChange={handleScrollPositionChange}
              isGroupDisbanded={isGroupDisbanded}
              onGroupDisbanded={handleGroupDisbanded}
              topBarHeight={88} // iOS平台的TopBar高度约88dp，Android约64dp
            />
          </View>
        </>
      )}

      {/* Error display */}
      {performanceState.transientError && (
        <View style={styles.errorContainer}>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{performanceState.transientError}</Text>
          </View>
        </View>
      )}

      {/* Group Management Modal */}
      {uiState.isGroupManageModalVisible && currentGroup && user && (
        <GroupManagementModal
          visible={uiState.isGroupManageModalVisible}
          onClose={() => uiActions.toggleGroupManagement()}
          group={currentGroup}
          groupMembers={groupMembers}
          allCharacters={characters}
          currentUser={user}
          onGroupUpdated={handleGroupUpdated}
        />
      )}

      {/* Save Manager Modal */}
      <SaveManager
        visible={uiState.isSaveManagerVisible}
        onClose={() => uiActions.toggleSaveManager()}
        conversationId={groupId}
        characterId={currentGroup?.groupId || ''}
        characterName={currentGroup?.groupName || ''}
        characterAvatar={undefined}
        messages={[]}
        onSaveCreated={() => {}}
        onLoadSave={() => {}}
        onPreviewSave={() => {}}
        firstMes={undefined}
      />

      {/* Memo Overlay */}
      <MemoOverlay
        isVisible={uiState.isMemoSheetVisible}
        onClose={uiActions.toggleMemoSheet}
        characterId={undefined}
        conversationId={groupId}
        customUserName={undefined}
      />

      {/* Settings Sidebar */}
      <SettingsSidebar
        isVisible={uiState.isSettingsSidebarVisible}
        onClose={uiActions.toggleSettingsSidebar}
        selectedCharacter={null}
        animationValue={settingsSlideAnim}
      />

      {/* Group Settings Sidebar */}
      <GroupSettingsSidebar
        isVisible={uiState.groupSettingsSidebarVisible}
        onClose={uiActions.toggleGroupSettings}
        animationValue={groupSettingsSidebarAnim}
        selectedGroup={selectedGroup}
        currentUser={user}
        onGroupBackgroundChanged={(groupId: string, newBackground: string | undefined) => {
          backgroundActions.setGroupBackground(groupId, newBackground);
        }}
        onGroupDisbanded={handleGroupDisbanded}
      />
    </SafeAreaView>
  );
});

GroupChatPage.displayName = 'GroupChatPage';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    backgroundColor: '#181818',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoLoadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoLoadingText: {
    color: '#ffffff',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  videoErrorContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  videoErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 50,
  },
  videoErrorText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
    fontSize: 14,
  },
  mainContent: {
    flex: 1,
    zIndex: 10,
  },
  errorContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  errorBox: {
    backgroundColor: 'rgba(220,53,69,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  errorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default GroupChatPage;
