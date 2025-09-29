import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import RegexToolModal from '@/components/RegexToolModal';
import { useRouter } from 'expo-router';
import { EventRegister } from 'react-native-event-listeners';

import { Group } from '@/src/group/group-types';
import { GroupAvatar } from './group/GroupAvatar';
import { CharacterLoader } from '@/src/utils/character-loader';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface GroupChatSettings {
  dailyMessageLimit: number;
  replyIntervalMinutes: number;
  referenceMessageLimit: number;
  timedMessagesEnabled: boolean;
}

interface TopBarWithBackgroundProps {
  selectedCharacter: Character | undefined | null;
  selectedGroup?: Group | null;
  onAvatarPress: () => void;
  onMemoPress: () => void;
  onSettingsPress: () => void;
  onMenuPress: () => void;
  onSaveManagerPress?: () => void;
  showBackground?: boolean;
  isGroupMode?: boolean;
  onGroupSettingsChange?: (settings: GroupChatSettings) => void;
  currentUser?: any;
  onGroupDisbanded?: (groupId: string) => void;
  isEmpty?: boolean; // Add new prop to indicate empty state
  onGroupSettingsPress?: () => void; // Add this for group settings sidebar
  unreadBadgeCount?: number; // 新增：未读消息角标
    onHeightChange?: (height: number) => void; // 新增：将计算后的高度暴露给父组件
}

const { width } = Dimensions.get('window');
const BUTTON_SIZE = 22; // Match ChatInput button size
const AVATAR_SIZE = Math.max(Math.min(width * 0.09, 36), 32); // Smaller avatar between 32-36dp
const ACTION_BUTTON_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 }; // Keep larger touch area

const TopBarWithBackground: React.FC<TopBarWithBackgroundProps> = ({
  selectedCharacter,
  selectedGroup,
  onAvatarPress,
  onMemoPress,
  onSettingsPress,
  onMenuPress,
  onSaveManagerPress,
  showBackground = true,
  isGroupMode = false,
  isEmpty = false, // Default to false for backward compatibility
  onGroupSettingsPress, // New prop for group settings sidebar
    unreadBadgeCount = 0,
    onHeightChange,
}) => {
  const [scrollY] = useState(new Animated.Value(0));
    const insets = useSafeAreaInsets();

    // 响应式顶部安全区/内边距：确保同时考虑安全区与屏幕宽度
    const baseTopPadding = Math.max(12, Math.min(24, width * 0.05)); // 12-24 自适应
    const navbarPaddingTop = Math.max(baseTopPadding, insets.top || 0);
  const [isRegexModalVisible, setIsRegexModalVisible] = useState(false);
  const [isMemoryControlVisible, setIsMemoryControlVisible] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const router = useRouter();
  
  // 添加顶部栏可见性状态
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);
  
  // 视觉小说模式展开状态
  const [vnExpanded, setVnExpanded] = useState(false);

  // 监听顶部栏可见性变化事件
  useEffect(() => {
    const toggleListener = EventRegister.addEventListener('toggleTopBarVisibility', (visible: boolean) => {
      console.log('[TopBarWithBackground] TopBar visibility changed to:', visible);
      setIsTopBarVisible(visible);
    });

    const visibilityListener = EventRegister.addEventListener('topBarVisibilityChanged', (visible: boolean) => {
      console.log('[TopBarWithBackground] TopBar visibility state changed to:', visible);
      setIsTopBarVisible(visible);
    });

    return () => {
      EventRegister.removeEventListener(toggleListener as string);
      EventRegister.removeEventListener(visibilityListener as string);
    };
  }, []);
  
  // 监听视觉小说展开状态变化
  useEffect(() => {
    const vnExpandedListener = EventRegister.addEventListener('visualNovelExpandedChanged', (expanded: boolean) => {
      console.log('[TopBarWithBackground] Visual novel expanded state changed:', expanded);
      setVnExpanded(expanded);
    });

    return () => {
      EventRegister.removeEventListener(vnExpandedListener as string);
    };
  }, []);

  useEffect(() => {
    if (isGroupMode && selectedGroup) {
      const loadGroupMembers = async () => {
        try {
          const characterIds = selectedGroup.groupMemberIds.filter(
            id => id !== selectedGroup.groupOwnerId
          );

          if (characterIds.length > 0) {
            const characters = await CharacterLoader.loadCharactersByIds(characterIds);
            setGroupMembers(characters);
            console.log(`【TopBar】已加载${characters.length}个群组成员`);
          } else {
            setGroupMembers([]);
          }
        } catch (error) {
          console.error('【TopBar】加载群组成员信息失败:', error);
          setGroupMembers([]);
        }
      };

      loadGroupMembers();
    }
  }, [isGroupMode, selectedGroup]);

  // 新增：检查角色是否是剧本角色
  const isScriptCharacter = useMemo(() => {
    if (!selectedCharacter || isGroupMode) return false;
    
    try {
      const jsonData = selectedCharacter.jsonData ? JSON.parse(selectedCharacter.jsonData) : {};
      const isScript = jsonData.data?.isScriptCharacter === true;
      
      if (isScript) {
        console.log(`🎭 [TopBar] 检测到剧本角色: ${selectedCharacter.name} (剧本ID: ${jsonData.data?.scriptId})`);
        console.log('🎭 [TopBar] 将隐藏除设置按钮外的所有功能按钮');
      }
      
      return isScript;
    } catch (error) {
      console.warn('[TopBarWithBackground] 解析角色JSON数据失败:', error);
      return false;
    }
  }, [selectedCharacter, isGroupMode]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [0.85, 1],
    extrapolate: 'clamp',
  });
    const verticalPadding = Math.max(8, Math.min(16, Math.round(width * 0.04)));
    // 优化内容高度计算（自适应垂直内边距）
    const topBarContentHeight = AVATAR_SIZE + verticalPadding * 1.2;;
    // 根据可见性状态计算总高度
    const totalHeight = isTopBarVisible ? topBarContentHeight : 0;

    // 将动态高度回传给父组件
    useEffect(() => {
      onHeightChange?.(totalHeight);
    }, [totalHeight, onHeightChange]);

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: headerOpacity,
            height: totalHeight,
            paddingTop: navbarPaddingTop,
            // 当隐藏时，设置overflow为hidden，确保完全隐藏
            overflow: isTopBarVisible ? 'visible' : 'hidden',
          },
        ]}
      >
        {/* 只有当顶部栏可见时才渲染内容 */}
        {isTopBarVisible && (
          <View style={[styles.content, { height: topBarContentHeight }]}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={onMenuPress}
              hitSlop={ACTION_BUTTON_HIT_SLOP}
            >
              <Ionicons name="menu" size={BUTTON_SIZE} color="#fff" />
            </TouchableOpacity>

            {/* Only show character info when not in empty state or in group mode */}
            {(!isEmpty || isGroupMode) && (
              <View style={styles.characterInfo}>
                <TouchableOpacity
                  style={styles.avatarContainer}
                  onPress={onAvatarPress}
                >
                  {isGroupMode && selectedGroup ? (
                    <View style={styles.groupAvatarWrapper}>
                      <GroupAvatar
                        members={groupMembers}
                        size={AVATAR_SIZE}
                        maxDisplayed={4}
                      />
                    </View>
                  ) : (
                    <Image
                      source={
                        selectedCharacter?.avatar
                          ? { uri: String(selectedCharacter.avatar) }
                          : require('@/assets/images/default-avatar.png')
                      }
                      style={[styles.avatar, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }]}
                    />
                  )}
                  {!isGroupMode && unreadBadgeCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {unreadBadgeCount > 99 ? '99+' : unreadBadgeCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.nameContainer}
                  onPress={onAvatarPress}
                >
                  <Text style={styles.characterName} numberOfLines={1}>
                    {isGroupMode
                      ? (selectedGroup?.groupName || '群聊')
                      : (selectedCharacter?.name || '选择角色')}
                  </Text>

                  {isGroupMode && selectedGroup?.groupTopic && (
                    <Text style={styles.groupTopic} numberOfLines={1}>
                      {selectedGroup.groupTopic}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 当为空状态且非群聊时，不再插入额外占位，避免多余空白 */}

            <View style={styles.actions}>

              {/* Only show memo button if not script character, not in empty state and not in group mode */}
              {!isEmpty && !isGroupMode && !isScriptCharacter && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={onMemoPress}
                  hitSlop={ACTION_BUTTON_HIT_SLOP}
                >
                  <MaterialCommunityIcons name="notebook-outline" size={BUTTON_SIZE} color="#fff" />
                </TouchableOpacity>
              )}

              {/* Only show save manager button if not script character, not in empty state and not in group mode */}
              {!isEmpty && !isGroupMode && !isScriptCharacter && onSaveManagerPress && (
                <TouchableOpacity 
                  onPress={onSaveManagerPress} 
                  style={styles.actionButton}
                  hitSlop={ACTION_BUTTON_HIT_SLOP}
                >
                  <Ionicons name="bookmark-outline" size={BUTTON_SIZE} color="#fff" />
                </TouchableOpacity>
              )}

              {/* Always show group manage button in group mode, even when empty */}
              {isGroupMode && (
                <TouchableOpacity
                  onPress={onAvatarPress}
                  style={[styles.actionButton, styles.groupManageButton]}
                  hitSlop={ACTION_BUTTON_HIT_SLOP}
                >
                  <Ionicons name="people" size={BUTTON_SIZE} color="#fff" />
                </TouchableOpacity>
              )}

              {/* 全局设置按钮，在群聊模式下不显示，剧本角色也不显示 */}
              {!isEmpty && !isGroupMode && !isScriptCharacter && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    // 打印 TopBarWithBackground 传递给 global-settings 页面的 characterId
                    console.log('[TopBarWithBackground] global-settings characterId:', selectedCharacter?.id);
                    router.push({ pathname: '/pages/global-settings', params: { characterId: selectedCharacter?.id,charactername:selectedCharacter?.name } });
                  }}
                  hitSlop={ACTION_BUTTON_HIT_SLOP}
                >
                  <Ionicons name="earth-outline" size={BUTTON_SIZE} color="#fff" />
                </TouchableOpacity>
              )}

               {/* 设置按钮：对所有类型的角色都显示，包括剧本角色 */}
               {(isGroupMode || !isEmpty) && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={isGroupMode ? onGroupSettingsPress : onSettingsPress}
                  hitSlop={ACTION_BUTTON_HIT_SLOP}
                >
                  <Ionicons name="settings-outline" size={BUTTON_SIZE} color="#fff" />
                </TouchableOpacity>
              )}

            </View>
          </View>
        )}
      </Animated.View>

      {/* 恢复顶部栏按钮 - 当顶部栏隐藏时显示，但在视觉小说模式展开时不显示 */}
      {!isTopBarVisible && !vnExpanded && (
        <View style={[styles.restoreButtonContainer, { top: navbarPaddingTop + 10 }]}>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={() => {
              console.log('[TopBarWithBackground] Restoring top bar visibility');
              setIsTopBarVisible(true);
              EventRegister.emit('toggleTopBarVisibility', true);
              EventRegister.emit('topBarVisibilityChanged', true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <RegexToolModal
        visible={isRegexModalVisible}
        onClose={() => setIsRegexModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  groupAvatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTopic: {
    color: '#ccc',
    fontSize: 11, // Smaller font size
    marginTop: 1, // Reduced margin
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  backgroundGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  blurView: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8, // 添加垂直内边距，确保内容不贴边
  },
  menuButton: {
    padding: Math.max(4, width * 0.012), // 进一步减少padding
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: Math.max(4, width * 0.01), // 进一步减少水平padding
  },
  avatarContainer: {
    marginRight: Math.max(6, width * 0.02), // 进一步减少右边距
  },
  avatar: {
    borderWidth: 1.5, // Thinner border
    borderColor: 'rgb(255, 224, 195)',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ff3b30',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  nameContainer: {
    flex: 1,
    paddingRight: Math.max(4, width * 0.01), // Add padding to prevent text from touching buttons
  },
  characterName: {
    color: '#fff',
    fontSize: Math.min(Math.max(15, width * 0.04), 17), // Reduced font size between 15-17
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Math.max(2, width * 0.005), // Add some right margin
  },
  actionButton: {
    padding: Math.max(2, width * 0.008), // 进一步减少padding
    marginLeft: Math.max(1, width * 0.005), // 进一步减少左边距
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: BUTTON_SIZE + 6, // 减少最小触摸目标大小
    minHeight: BUTTON_SIZE + 6, // 减少最小触摸目标大小
  },
  groupManageButton: {
    borderRadius: 16, // Smaller radius
    padding: Math.max(2, width * 0.008), // 进一步减少padding
    marginLeft: Math.max(2, width * 0.008), // 进一步减少左边距
    zIndex: 5,
  },
  emptySpace: {
    flex: 1, // Take up the same space as characterInfo would
  },
  restoreButtonContainer: {
    position: 'absolute',
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  restoreButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
});

export default TopBarWithBackground;