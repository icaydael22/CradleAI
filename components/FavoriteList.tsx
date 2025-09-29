import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { CirclePost, CircleComment } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
const AVATAR_SIZE = 40;

interface FavoriteListProps {
  posts: CirclePost[];
  onClose: () => void;
  onUpdatePost?: (updatedPost: CirclePost) => void;
}

const FavoriteList: React.FC<FavoriteListProps> = ({ posts, onClose, onUpdatePost }) => {
  const { characters, toggleFavorite } = useCharacters();
  const [favoritePosts, setFavoritePosts] = useState<CirclePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter favorite posts - update this to respond to props.posts changes
  useEffect(() => {
    // Make sure we're always showing the latest state of posts
    const filtered = posts.filter(post => post.isFavorited === true);
    setFavoritePosts(filtered);
    setIsLoading(false);
  }, [posts]);

  // Handle unfavorite
  const handleUnfavorite = useCallback(async (post: CirclePost) => {
    try {
      // Find the corresponding character
      const character = characters.find(c => c.id === post.characterId);
      if (!character) return;
      
      // Remove from local state immediately for responsive UI
      setFavoritePosts(prevPosts => prevPosts.filter(p => p.id !== post.id));
      
      // Toggle favorite status
      await toggleFavorite(character.id, post.id);
      
      // Update local state
      const updatedPost = { ...post, isFavorited: false };
      
      // Notify parent component
      if (onUpdatePost) {
        onUpdatePost(updatedPost);
      }
    } catch (error) {
      console.error('Failed to unfavorite post:', error);
      
      // Revert the change in case of error
      setFavoritePosts(prevPosts => {
        if (!prevPosts.some(p => p.id === post.id)) {
          return [...prevPosts, post];
        }
        return prevPosts;
      });
    }
  }, [characters, toggleFavorite, onUpdatePost]);

  // Render a comment
  const renderComment = useCallback((comment: CircleComment) => (
    <View key={comment.id} style={styles.comment}>
      <Image
        source={comment.userAvatar ? { uri: comment.userAvatar } : require('@/assets/images/default-avatar.png')}
        style={styles.commentAvatar}
      />
      <View style={styles.commentContent}>
        <Text style={styles.commentAuthor}>{comment.userName}</Text>
        <Text style={styles.commentText}>
          {comment.replyTo && <Text style={styles.replyText}>回复 {comment.replyTo.userName}：</Text>}
          {comment.content}
        </Text>
      </View>
    </View>
  ), []);

  // Render a post
  const renderPost = useCallback(({ item }: { item: CirclePost }) => (
    <View style={styles.card} key={item.id}>
      <View style={styles.cardHeader}>
        <Image
          source={item.characterAvatar ? { uri: item.characterAvatar } : require('@/assets/images/default-avatar.png')}
          style={styles.authorAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{item.characterName}</Text>
          <Text style={styles.timestamp}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.favoriteButton}
          onPress={() => handleUnfavorite(item)}
        >
          <Ionicons name="bookmark" size={24} color="#FFD700" />
        </TouchableOpacity>
      </View>

      <Text style={styles.content}>{item.content}</Text>
      
      {/* Show images if available */}
      {item.images && item.images.length > 0 && (
        <View style={styles.imagesContainer}>
          {item.images.map((image, index) => (
            <Image key={index} source={{ uri: image }} style={styles.contentImage} />
          ))}
        </View>
      )}

      {/* Show likes */}
      {item.likes > 0 && (
        <View style={styles.likesContainer}>
          <Ionicons name="heart" size={16} color="#FF9ECD" style={styles.likeIcon} />
          <Text style={styles.likeCount}>{item.likes} 赞</Text>
        </View>
      )}

      {/* Show comments */}
      {item.comments?.map(renderComment)}
    </View>
  ), [handleUnfavorite, renderComment]);

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>收藏夹</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF9ECD" />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : favoritePosts.length > 0 ? (
          <FlatList
            data={favoritePosts}
            renderItem={renderPost}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="bookmark-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>暂无收藏内容</Text>
            <Text style={styles.emptySubText}>收藏的朋友圈会显示在这里</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    backgroundColor: '#282828',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(51, 51, 51, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubText: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
  },
  listContainer: {
    padding: 16,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(51, 51, 51, 0.95)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginRight: 8,
  },
  authorName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timestamp: {
    color: '#777777',
    fontSize: 12,
  },
  content: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 8,
  },
  favoriteButton: {
    padding: 8,
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  likeIcon: {
    marginRight: 6,
  },
  likeCount: {
    color: '#fff',
    fontSize: 14,
  },
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#444',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  commentText: {
    color: '#FFFFFF',
    flexShrink: 1,
  },
  replyText: {
    color: '#FF9ECD',
    fontWeight: 'bold',
    marginRight: 4,
  },
  imagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 8,
  },
  contentImage: {
    width: (CARD_WIDTH - 32) / 2,
    height: 120,
    borderRadius: 8,
    margin: 4,
  },
});

export default FavoriteList;
