import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
  TextInput,
  Animated,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { CirclePost, CircleComment } from '@/shared/types';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
const AVATAR_SIZE = 48;

interface CirclePostCardProps {
  post: CirclePost;
  onLike: (post: CirclePost) => void;
  onComment: (post: CirclePost) => void;
  onShare: (post: CirclePost) => void;
  onFavorite: (post: CirclePost) => void;
  onReplyPress?: (comment: CircleComment) => void;
  isActiveForComment?: boolean;
  commentText?: string;
  onCommentTextChange?: (text: string) => void;
  onSendComment?: () => void;
  replyTo?: { userId: string; userName: string } | null;
  onCancelReply?: () => void;
  isProcessing?: boolean;
}

const CirclePostCard: React.FC<CirclePostCardProps> = ({
  post,
  onLike,
  onComment,
  onShare,
  onFavorite,
  onReplyPress,
  isActiveForComment = false,
  commentText = '',
  onCommentTextChange,
  onSendComment,
  replyTo = null,
  onCancelReply,
  isProcessing = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => {
    setIsPressed(true);
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      friction: 5,
      tension: 300,
      useNativeDriver: true
    }).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 400,
      useNativeDriver: true
    }).start();
  };

  // Helper function to render comment
  const renderComment = (comment: CircleComment) => (
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
        {onReplyPress && (
          <TouchableOpacity 
            style={styles.replyButton} 
            onPress={() => onReplyPress(comment)}
          >
            <Text style={styles.replyButtonText}>回复</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <Animated.View 
      style={[
        styles.card, 
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      {/* Card Header with author info */}
      <View style={styles.cardHeader}>
        <Image
          source={post.characterAvatar ? { uri: post.characterAvatar } : require('@/assets/images/default-avatar.png')}
          style={styles.authorAvatar}
        />
        <View>
          <Text style={styles.authorName}>{post.characterName}</Text>
          <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleString()}</Text>
        </View>
        
        {/* Processing indicator */}
        {isProcessing && (
          <View style={styles.processingIndicator}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#FF9ECD" />
          </View>
        )}
      </View>

      {/* Post content */}
      <Text style={styles.content}>{post.content}</Text>
      {post.images && post.images.length > 0 && (
        <View style={styles.imageContainer}>
          {post.images.map((image, index) => (
            <Image key={index} source={{ uri: image }} style={styles.contentImage} />
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => onLike(post)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Ionicons
            name={post.hasLiked ? "heart" : "heart-outline"}
            size={24}
            color={post.hasLiked ? "#FF9ECD" : "#fff"}
          />
          <Text style={styles.actionText}>{post.likes || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => onFavorite(post)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <MaterialCommunityIcons
            name={post.isFavorited ? "bookmark" : "bookmark-outline"}
            size={24}
            color={post.isFavorited ? "#FFD700" : "#fff"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onComment(post)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <MaterialIcons name="comment" size={24} color="#fff" />
          <Text style={styles.actionText}>{post.comments?.length || 0}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onShare(post)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <MaterialIcons name="share" size={24} color="#fff" />
          <Text style={styles.actionText}>转发</Text>
        </TouchableOpacity>
      </View>

      {/* Show likes */}
      {post.likes > 0 && post.likedBy && post.likedBy.length > 0 && (
        <View style={styles.likesContainer}>
          <Ionicons name="heart" size={16} color="#FF9ECD" style={styles.likeIcon} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.likeAvatars}>
            {post.likedBy.map((like, index) => (
              <Image
                key={`${like.userId}-${index}`}
                source={
                  like.userAvatar
                    ? { uri: like.userAvatar }
                    : like.isCharacter
                      ? require('@/assets/images/default-avatar.png')
                      : require('@/assets/images/default-user-avatar.png')
                }
                style={styles.likeAvatar}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Show comments */}
      {post.comments && post.comments.length > 0 && (
        <View style={styles.commentsContainer}>
          {post.comments.map(comment => renderComment(comment))}
        </View>
      )}
      
      {/* Show comment input if active */}
      {isActiveForComment && onCommentTextChange && onSendComment && (
        <View style={styles.commentInput}>
          {replyTo && (
            <View style={styles.replyIndicator}>
              <Text style={styles.replyIndicatorText}>
                回复 {replyTo.userName}
              </Text>
              {onCancelReply && (
                <TouchableOpacity onPress={onCancelReply}>
                  <MaterialIcons name="close" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>
          )}
          <TextInput
            style={styles.commentTextInput}
            value={commentText}
            onChangeText={onCommentTextChange}
            placeholder={replyTo ? `回复 ${replyTo.userName}...` : "写评论..."}
            placeholderTextColor="#666"
            multiline={false}
            autoFocus={true}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={onSendComment}
          >
            <MaterialIcons name="send" size={24} color="#FF9ECD" />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(51, 51, 51, 0.95)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginRight: 12,
  },
  authorName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  timestamp: {
    color: '#777777',
    fontSize: 12,
  },
  content: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  imageContainer: {
    marginBottom: 12,
  },
  contentImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#444',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  actionText: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 14,
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  likeIcon: {
    marginRight: 8,
  },
  likeAvatars: {
    flexDirection: 'row',
    flex: 1,
  },
  likeAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 4,
    backgroundColor: '#444',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentsContainer: {
    marginTop: 8,
  },
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#444',
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginBottom: 2,
    fontSize: 14,
  },
  commentText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  replyText: {
    color: '#FF9ECD',
    fontWeight: 'bold',
    marginRight: 4,
  },
  replyButton: {
    marginTop: 4,
    paddingVertical: 4,
  },
  replyButtonText: {
    color: '#999',
    fontSize: 12,
  },
  commentInput: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 12,
  },
  commentTextInput: {
    backgroundColor: '#444',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  sendButton: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  replyIndicatorText: {
    color: '#ccc',
    fontSize: 13,
  },
  processingIndicator: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default CirclePostCard;
