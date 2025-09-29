import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, ActivityIndicator, TextInput, Keyboard, } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { CirclePost, CircleComment, CircleLike, Character } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PostItem from '@/components/PostItem';
import ForwardSheet from '@/components/ForwardSheet';
import ImageViewer from '@/components/ImageViewer';
import { CircleService } from '@/services/circle-service';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { ImageManager } from '@/utils/ImageManager';
import { getApiSettings } from '@/utils/settings-helper';
import { theme } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface FavoriteListProps {
  posts: CirclePost[];
  onClose: () => void;
  onUpdatePost?: (updatedPost: CirclePost) => void;
}

const FavoriteList: React.FC<FavoriteListProps> = ({ posts, onClose, onUpdatePost }) => {
  const { characters, toggleFavorite, updateCharacter, addMessage } = useCharacters();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [favoritePosts, setFavoritePosts] = useState<CirclePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // comment states
  const [commentText, setCommentText] = useState('');
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{userId: string, userName: string} | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{[key: string]: boolean}>({});
  const [expandedComments, setExpandedComments] = useState<{[key: string]: boolean}>({});
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isForwardSheetVisible, setIsForwardSheetVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CirclePost | null>(null);

  // 初始化和外部变更的合并更新：尽量复用原对象，避免整表刷新
  useEffect(() => {
    const filtered = posts.filter(post => post.isFavorited === true);
    setFavoritePosts(prev => {
      const prevMap = new Map(prev.map(p => [p.id, p]));
      const next: CirclePost[] = filtered.map(p => {
        const existed = prevMap.get(p.id);
        // 仅在内容真实变化时替换引用，避免 FlatList 全量重渲染
        if (!existed) return p;
        const needReplace = (
          existed.isFavorited !== p.isFavorited ||
          existed.likes !== p.likes ||
          (existed.comments?.length || 0) !== (p.comments?.length || 0)
        );
        return needReplace ? p : existed;
      });
      return next;
    });
    setIsLoading(false);
  }, [posts]);

  const updateAndPersistPosts = useCallback(async (updatedPost: CirclePost) => {
    // update local fav list
    setFavoritePosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    // bubble up
    onUpdatePost?.(updatedPost);
    // persist to circle_posts
    try {
      const allPostsStr = await AsyncStorage.getItem('circle_posts');
      const allPosts: CirclePost[] = allPostsStr ? JSON.parse(allPostsStr) : [];
      const newAll = allPosts.map(p => p.id === updatedPost.id ? updatedPost : p);
      await AsyncStorage.setItem('circle_posts', JSON.stringify(newAll));
    } catch {}
  }, [onUpdatePost]);

  const handleToggleFavorite = useCallback(async (post: CirclePost) => {
    try {
      if (post.characterId === 'user-1') {
        const stored = await AsyncStorage.getItem('user_favorited_posts');
        let favs: string[] = stored ? JSON.parse(stored) : [];
        const isFav = favs.includes(post.id);
        favs = isFav ? favs.filter(id => id !== post.id) : [...favs, post.id];
        await AsyncStorage.setItem('user_favorited_posts', JSON.stringify(favs));
        await updateAndPersistPosts({ ...post, isFavorited: !isFav });
        setFavoritePosts(prev => prev.filter(p => p.id !== post.id));
      } else {
        const character = characters.find(c => c.id === post.characterId);
        if (!character) return;
        await toggleFavorite(character.id, post.id);
        // 直接乐观更新本地，避免由外部 props 回流触发整表刷新
        setFavoritePosts(prev => prev.filter(p => p.id !== post.id));
        const updated = { ...post, isFavorited: false } as CirclePost;
        await updateAndPersistPosts(updated);
      }
    } catch (e) {
      console.error('收藏切换失败:', e);
    }
  }, [characters, toggleFavorite, updateAndPersistPosts]);

  const toggleThoughtExpansion = useCallback((id: string) => {
    if (id.startsWith('expand-')) {
      const postId = id.replace('expand-', '');
      setExpandedComments(prev => ({ ...prev, [postId]: !prev[postId] }));
    } else {
      setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));
    }
  }, []);

  const handleImagePress = useCallback((images: string[], index: number) => {
    setSelectedImages(images);
    setCurrentImageIndex(index);
    setIsImageViewerVisible(true);
  }, []);

  const resetCommentState = useCallback(() => {
    setCommentText('');
    setActivePostId(null);
    setReplyTo(null);
  }, []);

  const handleCommentPress = useCallback((postId: string) => {
    if (activePostId === postId) {
      resetCommentState();
      Keyboard.dismiss();
    } else {
      setActivePostId(postId);
    }
  }, [activePostId, resetCommentState]);

  const handleReplyPress = useCallback((comment: CircleComment) => {
    setReplyTo({ userId: comment.userId, userName: comment.userName });
    // set active post based on where this comment belongs
    const postId = favoritePosts.find(p => p.comments?.some(c => c.id === comment.id))?.id;
    if (postId) setActivePostId(postId);
  }, [favoritePosts]);

  const renderCommentInput = useCallback((post: CirclePost) => (
    <View style={styles.commentInput}> 
      {replyTo && (
        <View style={styles.replyIndicator}>
          <Text style={styles.replyIndicatorText}>回复 {replyTo.userName}</Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <MaterialIcons name="close" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      <TextInput
        style={styles.commentTextInput}
        value={commentText}
        onChangeText={setCommentText}
        placeholder={replyTo ? `回复 ${replyTo.userName}...` : '写评论...'}
        placeholderTextColor={theme.colors.textSecondary}
      />
      <TouchableOpacity style={styles.sendButton} onPress={() => handleComment(post)}>
        <MaterialIcons name="send" size={24} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  ), [commentText, replyTo]);

  const handleLike = useCallback(async (post: CirclePost) => {
    try {
      const hasUserLiked = post.likedBy?.some(like => !like.isCharacter && like.userId === 'user-1');
      let updated: CirclePost;
      if (hasUserLiked) {
        updated = { ...post, likes: post.likes - 1, hasLiked: false, likedBy: post.likedBy?.filter(l => l.isCharacter || l.userId !== 'user-1') };
      } else {
        const newLike: CircleLike = { userId: 'user-1', userName: user?.settings?.self.nickname || '我', userAvatar: user?.avatar, isCharacter: false, createdAt: new Date().toISOString() };
        updated = { ...post, likes: post.likes + 1, hasLiked: true, likedBy: [...(post.likedBy || []), newLike] };
      }
      await updateAndPersistPosts(updated);

      if (post.characterId !== 'user-1') {
        const character = characters.find(c => c.id === post.characterId);
        if (character?.circlePosts) {
          const updatedCharacterPosts = character.circlePosts.map(p => p.id === post.id ? updated : p);
          await updateCharacter({ ...character, circlePosts: updatedCharacterPosts });
        }
      }
    } catch (e) {
      console.error('点赞失败:', e);
    }
  }, [characters, updateCharacter, updateAndPersistPosts, user]);

  const handleComment = useCallback(async (post: CirclePost) => {
    if (!commentText.trim() || !activePostId) return;
    try {
      const newComment: CircleComment = { id: String(Date.now()), userId: 'user-1', userName: user?.settings?.self.nickname || '我', content: commentText.trim(), createdAt: new Date().toISOString(), type: 'user', replyTo: replyTo || undefined, userAvatar: user?.avatar || undefined };
      let updatedPost: CirclePost = { ...post, comments: [...(post.comments || []), newComment] };
      await updateAndPersistPosts(updatedPost);
      setCommentText('');
      setReplyTo(null);
      setActivePostId(null);

      try {
        const allPosts = await CircleService.loadSavedPosts();
        const updated = allPosts.map(p => p.id === post.id ? updatedPost : p);
        await CircleService.savePosts(updated);
      } catch {}

      if (post.characterId !== 'user-1') {
        const character = characters.find(c => c.id === post.characterId);
        if (character) {
          const response = await CircleService.processCommentInteraction(
            character,
            post,
            commentText.trim(),
            user?.settings?.chat?.characterApiKey,
            replyTo || undefined,
            { apiProvider: user?.settings?.chat?.apiProvider || 'gemini', openrouter: user?.settings?.chat?.openrouter }
          );
          if (response.success && response.action?.comment) {
            const characterReply: CircleComment = { id: String(Date.now() + 1), userId: character.id, userName: character.name, userAvatar: character.avatar as string, content: response.action.comment, createdAt: new Date().toISOString(), type: 'character', replyTo: { userId: 'user-1', userName: user?.settings?.self.nickname || '我' }, thoughts: response.thoughts };
            updatedPost = { ...updatedPost, comments: [...(updatedPost.comments || []), characterReply] };
            await updateAndPersistPosts(updatedPost);
            try {
              const allPosts = await CircleService.loadSavedPosts();
              const updated = allPosts.map(p => p.id === post.id ? updatedPost : p);
              await CircleService.savePosts(updated);
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error('评论失败:', e);
    }
  }, [commentText, activePostId, replyTo, characters, user, updateAndPersistPosts]);

  const handleForward = useCallback(async (characterId: string, message: string) => {
    if (!selectedPost) return;
    try {
      const character = characters.find(c => c.id === characterId);
      if (!character) return;
      const postAuthor = selectedPost.characterName || '某人';
      const prefix = message ? `转发自${postAuthor}的朋友圈，附言：${message}\n\n` : `转发自${postAuthor}的朋友圈：\n\n`;
      const forwardedContent = prefix + selectedPost.content;
      await handleForwardTextOnly(character, forwardedContent);
      if (selectedPost.images && selectedPost.images.length > 0) {
        await handleForwardWithImages(character, forwardedContent, selectedPost.images);
      }
      setIsForwardSheetVisible(false);
      setSelectedPost(null);
    } catch (e) {
      console.error('转发失败:', e);
    }
  }, [selectedPost, characters]);

  const handleForwardTextOnly = async (character: Character, forwardedContent: string) => {
    const apiSettings = getApiSettings();
    const result = await NodeSTManager.processChatMessage({ userMessage: forwardedContent, status: '同一角色继续对话', conversationId: character.id, character });
    if (result.success && result.text) {
      await addMessage(character.id, { id: `forward-response-${Date.now()}`, text: result.text, sender: 'bot', timestamp: Date.now() });
    }
  };

  const handleForwardWithImages = async (character: Character, forwardedContent: string, images: string[]) => {
    const apiSettings = getApiSettings();
    const apiKey = apiSettings.apiKey || '';
    const result = await NodeSTManager.processChatMessage({ userMessage: forwardedContent, status: '同一角色继续对话', conversationId: character.id, character });
    if (result.success && result.text) {
      await addMessage(character.id, { id: `forward-response-${Date.now()}`, text: result.text, sender: 'bot', timestamp: Date.now() });
    }
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      try {
        if (!apiKey) throw new Error('API密钥未设置');
        const geminiAdapter = new GeminiAdapter(apiKey);
        const imageData = await geminiAdapter.fetchImageAsBase64(imageUrl);
        const cacheResult = await ImageManager.cacheImage(imageData.data, imageData.mimeType);
        await addMessage(character.id, { id: `forward-image-${Date.now()}-${i}`, text: `![转发的图片](image:${cacheResult.id})`, sender: 'user', timestamp: Date.now() });
        const response = await geminiAdapter.analyzeImage({ url: imageUrl }, `这是用户转发的朋友圈图片。请分析这张图片并作出回应。注意保持${character.name}的人设口吻。`);
        if (response) {
          await addMessage(character.id, { id: `forward-image-response-${Date.now()}-${i}`, text: response, sender: 'bot', timestamp: Date.now() });
        }
      } catch (e) {
        console.error('处理转发图片失败:', e);
      }
    }
  };

  const handleRate = useCallback(async (post: CirclePost, rating: number) => {
    try {
      const clamped = Math.max(1, Math.min(5, rating));
      const updated = { ...post, rating: clamped };
      await updateAndPersistPosts(updated);
      if (post.characterId !== 'user-1') {
        const character = characters.find(c => c.id === post.characterId);
        if (character?.circlePosts) {
          const updatedCharacterPosts = character.circlePosts.map(p => p.id === post.id ? updated : p);
          await updateCharacter({ ...character, circlePosts: updatedCharacterPosts });
        }
      }
    } catch (e) {
      console.error('评分失败:', e);
    }
  }, [characters, updateCharacter, updateAndPersistPosts]);

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}> 
          <Text style={styles.headerTitle}>收藏夹</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : favoritePosts.length > 0 ? (
          <FlatList
            data={favoritePosts}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            removeClippedSubviews={false}
            initialNumToRender={8}
            windowSize={5}
            renderItem={({ item }) => (
              <PostItem
                item={item}
                onLike={handleLike}
                onComment={handleCommentPress}
                onForward={(post) => { setSelectedPost(post); setIsForwardSheetVisible(true); }}
                onImagePress={handleImagePress}
                onShowMenu={() => { /* 可根据需要增加删除等功能 */ }}
                onToggleThoughts={toggleThoughtExpansion}
                onReply={handleReplyPress}
                onToggleFavorite={handleToggleFavorite}
                ratingEnabled
                onRate={handleRate}
                activePostId={activePostId}
                expandedThoughts={expandedThoughts}
                expandedComments={expandedComments}
                deletingPostId={null}
                processingCharacters={[]}
                testModeEnabled={false}
                renderCommentInput={renderCommentInput}
              />
            )}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="bookmark-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>暂无收藏内容</Text>
            <Text style={styles.emptySubText}>收藏的朋友圈会显示在这里</Text>
          </View>
        )}

        {/* Forward Sheet */}
        {isForwardSheetVisible && selectedPost && (
          <ForwardSheet
            isVisible={isForwardSheetVisible}
            onClose={() => { setIsForwardSheetVisible(false); setSelectedPost(null); }}
            characters={characters}
            post={selectedPost}
            onForward={handleForward}
          />
        )}

        {/* Image Viewer */}
        {isImageViewerVisible && (
          <ImageViewer
            images={selectedImages}
            initialIndex={currentImageIndex}
            isVisible={isImageViewerVisible}
            onClose={() => setIsImageViewerVisible(false)}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '100%', height: '100%', backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: theme.colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.white },
  closeButton: { padding: 4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: theme.colors.text, marginTop: 12, fontSize: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: theme.colors.text, fontSize: 18, marginTop: 16 },
  emptySubText: { color: theme.colors.textSecondary, fontSize: 14, marginTop: 8 },
  listContainer: { padding: 16 },
  commentInput: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  commentTextInput: { flex: 1, backgroundColor: theme.colors.input, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, color: theme.colors.text, marginRight: theme.spacing.sm },
  sendButton: { padding: theme.spacing.sm },
  replyIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.backgroundSecondary, padding: theme.spacing.sm, borderRadius: theme.borderRadius.sm, marginBottom: theme.spacing.sm },
  replyIndicatorText: { color: theme.colors.text, fontSize: theme.fontSizes.sm },
});

export default FavoriteList;
