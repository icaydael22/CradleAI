import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFonts } from 'expo-font';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// removed unused imports: AsyncStorage, direct ViewModeConfigManager

// Context hooks
import { useUser } from '@/constants/UserContext';
import { useCharacters } from '@/constants/CharactersContext';

// Components
import SearchBar from '@/components/SearchBar';
import { GroupAvatar } from '@/components/group/GroupAvatar';
import CreateGroupModal from '@/components/CreateGroupModal';

// Services
import { getUserGroups, createUserGroup, Group as UserGroup } from '@/src/group';
import { GroupService } from '@/src/group/group-service';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { usePreloadViewModeConfig } from '@/hooks/usePreloadViewModeConfig';
import { useConversationList } from '@/hooks/useConversationList';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';

// Types
import { Character } from '@/shared/types';
import type { ConversationItem } from '@/hooks/useConversationList';

const APP: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { characters, isLoading: charactersLoading } = useCharacters() as any;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [isGroupModalVisible, setGroupModalVisible] = useState(false);
  const [isMenuVisible, setMenuVisible] = useState(false);
  const [isSearchVisible, setSearchVisible] = useState(false);
  // last message data is now provided by useConversationList
  
  useEffect(() => {
    if (user) {
      loadUserGroups();
    }
  }, [user]);
  
  // 新增：预加载视图模式配置（封装为 Hook）
  usePreloadViewModeConfig();

  // 新增：用 Hook 封装对话数据聚合
  const { conversationItems, refreshConversationList } = useConversationList({ characters, userGroups });
  
  const loadUserGroups = async () => {
    if (!user) return;
    
    try {
      // 使用正确的群组服务
      const groups = await getUserGroups(user);
      setUserGroups(groups);
      console.log(`[ConversationList] 加载用户群组: ${groups.length}个群组`);
    } catch (error) {
      console.error('Failed to load user groups:', error);
    }
  };
  
  // 合并私聊和群聊 - 使用 characters 作为对话列表
  const allConversations: ConversationItem[] = useMemo(() => {
    // 将 Hook 的结果与已有角色数组合并（用于群头像成员展示）
    return conversationItems.map(item =>
      item.isGroup
        ? { ...item, members: characters.filter((char: Character) => (userGroups.find(g => g.groupId === item.id)?.groupMemberIds || []).includes(char.id)) }
        : item
    );
  }, [conversationItems, characters, userGroups]);
  
  // 添加调试日志
  useEffect(() => {
    console.log(`[ConversationList] 角色数量: ${characters.length}, 群组数量: ${userGroups.length}, 总对话数: ${allConversations.length}`);
  }, [characters.length, userGroups.length, allConversations.length]);

  // 监听角色更新、剧本创建和删除事件并刷新对话列表
  useEffect(() => {
    const characterUpdatedListener = EventRegister.addEventListener('characterUpdated', () => {
      console.log('[ConversationList] Character updated, refreshing conversation list');
      refreshConversationList();
    });
    
    const scriptCreatedListener = EventRegister.addEventListener('scriptCreated', () => {
      console.log('[ConversationList] Script created, refreshing conversation list');
      refreshConversationList();
    });
    
    const scriptDeletedListener = EventRegister.addEventListener('scriptDeleted', () => {
      console.log('[ConversationList] Script deleted, refreshing conversation list');
      refreshConversationList();
    });
    
    return () => {
      if (characterUpdatedListener) EventRegister.removeEventListener(characterUpdatedListener as string);
      if (scriptCreatedListener) EventRegister.removeEventListener(scriptCreatedListener as string);
      if (scriptDeletedListener) EventRegister.removeEventListener(scriptDeletedListener as string);
    };
  }, [refreshConversationList]);
  
  const filteredConversations = searchQuery 
    ? allConversations.filter(conv => 
        conv.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allConversations;
    
  const isNavigatingRef = useRef(false);
  const handleConversationPress = useCallback((conversation: ConversationItem) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    const navigate = () => {
      try {
        if (conversation.isScript) {
          router.push(`/pages/script/${conversation.id}`);
        } else if (conversation.isGroup) {
          router.push(`/pages/group/${conversation.id}`);
        } else {
          router.push(`/pages/${conversation.id}`);
        }
      } finally {
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 200);
      }
    };
    requestAnimationFrame(() => setTimeout(navigate, 50));
  }, [router]);
  
  const handleGroupCreated = useCallback(async (newGroup: UserGroup) => {
    console.log('[ConversationList] Group created:', newGroup.groupId);
    await loadUserGroups();
    router.push(`/pages/group/${newGroup.groupId}`);
  }, [loadUserGroups, router]);
  
  const renderConversationItem = useCallback(({ item }: { item: ConversationItem }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => handleConversationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        {item.isGroup ? (
          <GroupAvatar
            members={item.members || []}
            size={56}
          />
        ) : (
          <Image
            source={{ uri: item.avatar || 'https://via.placeholder.com/56' }}
            style={styles.avatar}
          />
        )}
        {(item.unreadCount || 0) > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {(item.unreadCount || 0) > 99 ? '99+' : (item.unreadCount || 0)}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {item.name}
            {item.isGroup && <Ionicons name="people" size={16} color="#999" style={styles.groupIcon} />}
            {item.isScript && <Ionicons name="film" size={16} color="#ffd700" style={styles.scriptIcon} />}
          </Text>
          {item.lastMessageTime && (
            <Text style={styles.timeText}>
              {item.lastMessageTime.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </Text>
          )}
        </View>
        
        <Text style={styles.lastMessage} numberOfLines={2}>
          {item.lastMessage || ''}
        </Text>
      </View>
      
      <View style={styles.rightSection}>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </View>
    </TouchableOpacity>
  ), [handleConversationPress]);

  // 清零某会话未读（当进入会话页面后会被执行，这里提供方法在点击时调用也可）
  const clearUnreadForConversation = useCallback(async (conversationId: string) => {
    try {
      const mapStr = await AsyncStorage.getItem('unreadPerConversation');
      const map = mapStr ? JSON.parse(mapStr) as Record<string, number> : {};
      const delta = map[conversationId] || 0;
      if (delta > 0) {
        map[conversationId] = 0;
        await AsyncStorage.setItem('unreadPerConversation', JSON.stringify(map));
        const totalStr = await AsyncStorage.getItem('unreadMessagesCount');
        const total = parseInt(totalStr || '0', 10) || 0;
        const newTotal = Math.max(0, total - delta);
        await AsyncStorage.setItem('unreadMessagesCount', String(newTotal));
        EventRegister.emit('unreadMessagesUpdated', newTotal);
      }
    } catch (e) {}
  }, []);
  
  if (charactersLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="rgb(255, 224, 195)" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" translucent={false} backgroundColor="#1a1a1a" />
      
      {/* Header */}
      <View style={styles.header}> 
        <HeaderTitle />
        <View style={styles.headerButtons}>
          {/* Search Button */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setSearchVisible(!isSearchVisible)}
          >
            <Ionicons name="search" size={24} color="rgb(255, 224, 195)" />
          </TouchableOpacity>
          
          {/* Menu Button */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setMenuVisible(!isMenuVisible)}
          >
            <Ionicons name="add" size={24} color="rgb(255, 224, 195)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar - only show when search is visible */}
      {isSearchVisible && (
        <View style={styles.searchContainer}>
          <SearchBar
            placeholder="搜索会话..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchBar}
          />
        </View>
      )}

      {/* Menu Dropdown */}
      {isMenuVisible && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={styles.menuBackdrop}
            onPress={() => setMenuVisible(false)}
          />
          <View style={styles.menuContent}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setGroupModalVisible(true);
              }}
            >
              <Ionicons name="people" size={20} color="rgb(255, 224, 195)" />
              <Text style={styles.menuItemText}>创建群聊</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      {/* Conversation List */}
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => (item.isGroup ? `group-${item.id}` : item.id)}
        renderItem={renderConversationItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        removeClippedSubviews={false}
        ListEmptyComponent={
          searchQuery ? (
            <View style={styles.emptyResult}>
              <Ionicons name="search" size={48} color="#666" />
              <Text style={styles.emptyResultText}>没有找到相关会话</Text>
            </View>
          ) : (
            <View style={styles.emptyResult}>
              <Ionicons name="chatbubbles-outline" size={48} color="#666" />
              <Text style={styles.emptyResultText}>暂无会话</Text>
              <Text style={styles.emptyResultSubtext}>点击角色开始聊天</Text>
            </View>
          )
        }
      />
      
      {/* Create Group Modal */}
      {user && (
        <CreateGroupModal
          visible={isGroupModalVisible}
          onClose={() => setGroupModalVisible(false)}
          currentUser={user}
          characters={characters}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </SafeAreaView>
  );
};

// 分离标题组件，加载自定义字体
const HeaderTitle: React.FC = () => {
  const [fontsLoaded] = useFonts({ 'SpaceMono-Regular': require('@/assets/fonts/SpaceMono-Regular.ttf') });
  return (
    <Text style={[styles.headerTitle, fontsLoaded && { fontFamily: 'SpaceMono-Regular' }]}>Cradle</Text>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
    paddingTop: 12,
  },
  headerTitle: {
    fontSize: 22,
    alignItems: 'center',
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
    flex: 1,
    textAlign: 'left',
  },
  headerTitleCentered: {
    // 不再使用绝对居中
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    marginLeft: 16,
    padding: 8,
  },
  createGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
  },
  createGroupText: {
    color: 'rgb(255, 224, 195)',
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  listContainer: {
    marginTop: 5,
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#333',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  groupIcon: {
    marginLeft: 6,
  },
  scriptIcon: {
    marginLeft: 6,
  },
  timeText: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#999',
    lineHeight: 18,
  },
  rightSection: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  emptyResult: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyResultText: {
    marginTop: 16,
    color: '#999',
    fontSize: 18,
    fontWeight: '500',
  },
  emptyResultSubtext: {
    marginTop: 8,
    color: '#666',
    fontSize: 14,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  menuContent: {
    position: 'absolute',
    top: 100, // Adjust based on header height
    right: 20,
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 12,
    padding: 8,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  menuItemText: {
    color: 'rgb(255, 224, 195)',
    fontSize: 16,
    marginLeft: 12,
    fontWeight: '500',
  },
});

export default APP;
