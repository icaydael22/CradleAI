import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import FavoriteList from '@/components/FavoriteList';
import { CirclePost, CircleLike } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CircleService } from '@/services/circle-service';

const FavoritesPage: React.FC = () => {
  const router = useRouter();
  const { characters, updateCharacter } = useCharacters();
  const { user } = useUser();

  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load posts from storage
      const storedPosts = await CircleService.loadSavedPosts();

      // Load user favorites
      let userFavorites: string[] = [];
      try {
        const stored = await AsyncStorage.getItem('user_favorited_posts');
        if (stored) userFavorites = JSON.parse(stored);
      } catch {}

      const postsWithStatus = storedPosts.map(post => {
        const character = characters.find(c => c.id === post.characterId);

        let isFavorited = false;
        if (post.characterId === 'user-1') {
          isFavorited = userFavorites.includes(post.id);
        } else if (character) {
          isFavorited = character.favoritedPosts?.includes(post.id) || false;
          // sync avatar
          post.characterAvatar = character.avatar || post.characterAvatar;
        }

        // sync likedBy avatars for characters
        if (post.likedBy) {
          post.likedBy = post.likedBy.map(like => {
            if (like.isCharacter) {
              const likeChar = characters.find(c => c.id === like.userId);
              if (likeChar) {
                return { ...like, userAvatar: likeChar.avatar || like.userAvatar } as CircleLike;
              }
            }
            return like;
          });
        }

        if (post.comments) {
          post.comments = post.comments.map(comment => {
            if (comment.type === 'character') {
              const cc = characters.find(c => c.id === comment.userId);
              if (cc) return { ...comment, userAvatar: cc.avatar || comment.userAvatar };
            }
            return comment;
          });
        }

        return { ...post, isFavorited } as CirclePost;
      });

      // Sort newest first
      postsWithStatus.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPosts(postsWithStatus);
    } catch (e) {
      setError('加载收藏失败');
    } finally {
      setIsLoading(false);
    }
  }, [characters]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: '#fff' }}>加载中...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'tomato' }}>{error}</Text>
      </View>
    );
  }

  return (
    <FavoriteList
      posts={posts}
      onClose={() => router.back()}
      onUpdatePost={async (updated) => {
        // update local list
        setPosts(prev => {
          const next = prev.map(p => p.id === updated.id ? updated : p);
          AsyncStorage.setItem('circle_posts', JSON.stringify(next)).catch(() => {});
          return next;
        });

        // if it's a character post, update character storage
        if (updated.characterId !== 'user-1') {
          const character = characters.find(c => c.id === updated.characterId);
          if (character?.circlePosts) {
            const updatedCharacterPosts = character.circlePosts.map(p => p.id === updated.id ? updated : p);
            await updateCharacter({ ...character, circlePosts: updatedCharacterPosts });
          }
        }
      }}
    />
  );
};

export default FavoritesPage;


