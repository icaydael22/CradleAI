import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useCharacters } from '../hooks/useCharacters';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import { Ionicons } from '@expo/vector-icons';

interface ExploreContentProps {
  selectedCharacterId: string | null;
}

const ExploreContent: React.FC<ExploreContentProps> = ({ selectedCharacterId }) => {
  const { characters, loading } = useCharacters();
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  
  useEffect(() => {
    if (selectedCharacterId) {
      loadPosts(selectedCharacterId);
    }
  }, [selectedCharacterId]);
  
  const loadPosts = async (characterId: string) => {
    setIsLoadingPosts(true);
    
    try {
      // Here you would fetch posts from your API or storage
      // For now, we'll use dummy data
      const dummyPosts = [
        {
          id: '1',
          authorId: characterId,
          authorName: characters[characterId]?.name || 'Unknown',
          content: '今天天气真好，出去走走吧！',
          timestamp: Date.now() - 60000 * 10,
          likes: 5,
          comments: 2
        },
        {
          id: '2',
          authorId: characterId,
          authorName: characters[characterId]?.name || 'Unknown',
          content: '推荐一本我最近在看的书《未来简史》，很有启发性。',
          timestamp: Date.now() - 60000 * 60,
          likes: 3,
          comments: 1
        }
      ];
      
      setPosts(dummyPosts);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setIsLoadingPosts(false);
    }
  };
  
  if (loading) {
    return <LoadingSpinner message="Loading character data..." />;
  }
  
  if (!selectedCharacterId) {
    return (
      <EmptyState 
        message="Please select a character" 
        icon="person-outline"
      />
    );
  }
  
  const character = characters[selectedCharacterId];
  
  if (!character) {
    return (
      <EmptyState 
        message="Character not found" 
        icon="alert-circle-outline"
      />
    );
  }
  
  if (isLoadingPosts) {
    return <LoadingSpinner message="Loading posts..." />;
  }
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Character Social Circle</Text>
        <TouchableOpacity style={styles.newPostButton}>
          <Ionicons name="add-outline" size={20} color="#ffffff" />
          <Text style={styles.newPostText}>New Post</Text>
        </TouchableOpacity>
      </View>
      
      {posts.length > 0 ? (
        posts.map(post => (
          <View key={post.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={styles.authorInfo}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{post.authorName.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.authorName}>{post.authorName}</Text>
                  <Text style={styles.postTime}>
                    {new Date(post.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            </View>
            
            <Text style={styles.postContent}>{post.content}</Text>
            
            <View style={styles.postActions}>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="heart-outline" size={18} color="#757575" />
                <Text style={styles.actionText}>{post.likes}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="chatbubble-outline" size={18} color="#757575" />
                <Text style={styles.actionText}>{post.comments}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyPosts}>
          <Text style={styles.emptyPostsText}>No posts yet</Text>
          <TouchableOpacity style={styles.createFirstPostButton}>
            <Text style={styles.createFirstPostText}>Create First Post</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  newPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  newPostText: {
    color: '#ffffff',
    marginLeft: 4,
    fontWeight: '500',
  },
  postCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C5CAE9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3F51B5',
  },
  authorName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  postTime: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  postContent: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 16,
  },
  postActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    color: '#757575',
    marginLeft: 6,
    fontSize: 14,
  },
  emptyPosts: {
    padding: 20,
    backgroundColor: '#ffffff',
    margin: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyPostsText: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 16,
  },
  createFirstPostButton: {
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  createFirstPostText: {
    color: '#ffffff',
    fontWeight: '500',
  },
});

export default ExploreContent;
