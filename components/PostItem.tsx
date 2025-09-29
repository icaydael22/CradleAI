import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons, AntDesign } from '@expo/vector-icons';
import { CirclePost, CircleComment, CircleLike } from '@/shared/types';
import { theme } from '@/constants/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
const AVATAR_SIZE = width > 400 ? 48 : 40;
// Use the same padding logic as the card to derive inner content width
const CARD_PADDING = width > 380 ? theme.spacing.md : theme.spacing.sm;
const INNER_CARD_WIDTH = CARD_WIDTH - 2 * CARD_PADDING;

interface PostItemProps {
  item: CirclePost;
  onLike: (post: CirclePost) => void;
  onComment: (postId: string) => void;
  onForward: (post: CirclePost) => void;
  onImagePress: (images: string[], index: number) => void;
  onShowMenu: (post: CirclePost) => void;
  onToggleThoughts: (id: string) => void;
  onReply: (comment: CircleComment) => void;
  onToggleFavorite?: (post: CirclePost) => void;
  ratingEnabled?: boolean;
  onRate?: (post: CirclePost, rating: number) => void;
  activePostId: string | null;
  expandedThoughts: {[key: string]: boolean};
  expandedComments: {[key: string]: boolean};
  deletingPostId: string | null;
  processingCharacters: string[];
  testModeEnabled: boolean;
  renderCommentInput: (post: CirclePost) => React.ReactNode;
}

const PostItem: React.FC<PostItemProps> = memo(({
  item,
  onLike,
  onComment,
  onForward,
  onImagePress,
  onShowMenu,
  onToggleThoughts,
  onReply,
  onToggleFavorite,
  ratingEnabled,
  onRate,
  activePostId,
  expandedThoughts,
  expandedComments,
  deletingPostId,
  processingCharacters,
  testModeEnabled,
  renderCommentInput,
}) => {
  const renderComment = useCallback((comment: CircleComment) => {
    const hasThoughts = !!comment.thoughts;
    const isExpanded = expandedThoughts[comment.id] || false;

    return (
      <View key={comment.id} style={styles.comment}>
        <Image
          source={comment.userAvatar ? { uri: comment.userAvatar } : require('@/assets/images/default-avatar.png')}
          style={styles.commentAvatar}
        />
        <View style={styles.commentContent}>
          <Text style={styles.commentAuthor}>{comment.userName}</Text>
          
          {/* Display thoughts if available */}
          {hasThoughts && (
            <View style={styles.thoughtsContainer}>
              <TouchableOpacity 
                style={styles.thoughtsHeader}
                onPress={() => onToggleThoughts(comment.id)}
              >
                <Text style={styles.thoughtsTitle}>
                  {isExpanded ? '收起内心想法' : '查看内心想法'}
                </Text>
                <AntDesign 
                  name={isExpanded ? 'caretup' : 'caretdown'} 
                  size={12} 
                  color={theme.colors.textSecondary} 
                />
              </TouchableOpacity>
              
              {isExpanded && (
                <View style={styles.thoughtsBubble}>
                  <Text style={styles.thoughtsText}>{comment.thoughts}</Text>
                </View>
              )}
            </View>
          )}
          
          <Text style={styles.commentText}>
            {comment.replyTo && <Text style={styles.replyText}>回复 {comment.replyTo.userName}：</Text>}
            {comment.content}
          </Text>
          <TouchableOpacity 
            style={styles.replyButton} 
            onPress={() => onReply(comment)}
          >
            <Text style={styles.replyButtonText}>回复</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [expandedThoughts, onToggleThoughts, onReply]);

  const renderImages = useCallback(() => {
    if (!item.images || item.images.length === 0) return null;

    const areCommentsExpanded = expandedComments[item.id];
    const shouldUseInstagramRatio = item.images.length === 1;

    return (
      <View style={[
        styles.imagesContainer, 
        { flexDirection: item.images.length === 1 ? 'column' : 'row',
          justifyContent: 'center', // 保证图片居中
          alignItems: 'center',     // 保证图片垂直居中
         }
      ]}>
        {item.images.map((image, index) => {
          const images = item.images || [];
          const margin = 4; // TouchableOpacity wrapper margin
          const columnCount = shouldUseInstagramRatio
            ? 1
            : (images.length === 2 ? 2 : Math.min(images.length, 3));
          const availableWidth = INNER_CARD_WIDTH - (margin * 2 * columnCount);
          const itemWidth = shouldUseInstagramRatio
            ? availableWidth
            : availableWidth / columnCount;
          const itemHeight = shouldUseInstagramRatio
            ? INNER_CARD_WIDTH * 1.25 // 4:5 ratio
            : (images.length === 2 ? 180 : 120);
          const imageSize = { width: itemWidth, height: itemHeight };

          return (
            <TouchableOpacity
              key={index}
              onPress={() => onImagePress(item.images!, index)}
              activeOpacity={0.8}
              style={{ margin: 4 }}
            >
              <Image 
                source={{ uri: image }} 
                style={[styles.contentImage, imageSize]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [item.images, item.id, expandedComments, onImagePress]);

  const renderCommentsSection = useCallback(() => {
    if (!item.comments || item.comments.length === 0) return null;

    const areCommentsExpanded = expandedComments[item.id];
    const commentsToShow = areCommentsExpanded ? item.comments : item.comments.slice(0, 3);
    const hasMoreComments = item.comments.length > 3 && !areCommentsExpanded;

    return (
      <>
        {hasMoreComments && (
          <TouchableOpacity 
            onPress={() => onComment(item.id)}
            style={styles.expandCommentsButton}
          >
            <Text style={styles.expandCommentsText}>
              查看所有 {item.comments.length} 条评论
            </Text>
          </TouchableOpacity>
        )}
        {commentsToShow.map(comment => renderComment(comment))}
      </>
    );
  }, [item.comments, item.id, expandedComments, renderComment, onToggleThoughts]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={() => onShowMenu(item)}
      delayLongPress={500}
      style={[styles.card, { width: CARD_WIDTH }]}
    >
      <View style={styles.cardHeader}>
        <Image
          source={item.characterAvatar ? { uri: item.characterAvatar } : require('@/assets/images/default-avatar.png')}
          style={styles.authorAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{item.characterName}</Text>
          <Text style={styles.timestamp}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        
        {deletingPostId === item.id && (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: theme.spacing.sm }} />
        )}
        
        {testModeEnabled && processingCharacters.length > 0 && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.processingText}>处理中 ({processingCharacters.length})</Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.postMenuButton}
          onPress={() => onShowMenu(item)}
        >
          <MaterialIcons name="more-vert" size={20} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      <Text style={styles.content}>{item.content}</Text>
      
      {item.thoughts && (
        <View style={styles.thoughtsContainer}>
          <TouchableOpacity 
            style={styles.thoughtsHeader}
            onPress={() => onToggleThoughts(`post-${item.id}`)}
          >
            <Text style={styles.thoughtsTitle}>
              {expandedThoughts[`post-${item.id}`] ? '收起发布想法' : '查看发布想法'}
            </Text>
            <AntDesign 
              name={expandedThoughts[`post-${item.id}`] ? 'caretup' : 'caretdown'} 
              size={12} 
              color={theme.colors.textSecondary} 
            />
          </TouchableOpacity>
          
          {expandedThoughts[`post-${item.id}`] && (
            <View style={styles.thoughtsBubble}>
              <Text style={styles.thoughtsText}>{item.thoughts}</Text>
            </View>
          )}
        </View>
      )}
      
      {renderImages()}

      {/* Instagram-style action buttons */}
      <View style={styles.cardActions}>
        <View style={styles.leftActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onLike(item)}>
            <Ionicons
              name={item.hasLiked ? "heart" : "heart-outline"}
              size={28}
              color={item.hasLiked ? theme.colors.danger : theme.colors.white}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onComment(item.id)}
          >
            <Ionicons name="chatbubble-outline" size={28} color={theme.colors.white} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onForward(item)}
          >
            <Ionicons name="paper-plane-outline" size={28} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons
            name={item.isFavorited ? 'bookmark' : 'bookmark-outline'}
            size={28}
            color={item.isFavorited ? theme.colors.accent : theme.colors.white}
            onPress={() => onToggleFavorite && onToggleFavorite(item)}
          />
        </TouchableOpacity>
      </View>

      {ratingEnabled && (
        <View style={styles.ratingRow}>
          {[1,2,3,4,5].map(star => (
            <TouchableOpacity
              key={star}
              style={styles.starButton}
              onPress={() => onRate && onRate(item, star)}
            >
              <Ionicons
                name={(item.rating || 0) >= star ? 'star' : 'star-outline'}
                size={22}
                color={(item.rating || 0) >= star ? theme.colors.accent : theme.colors.textSecondary}
              />
            </TouchableOpacity>
          ))}
          {typeof item.rating === 'number' && (
            <Text style={styles.ratingText}>{item.rating}/5</Text>
          )}
        </View>
      )}

      {item.likes > 0 && (
        <View style={styles.likesContainer}>
          <Ionicons name="heart" size={16} color={theme.colors.danger} style={styles.likeIcon} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.likeAvatars}>
            {item.likedBy?.map((like: CircleLike, index: number) => (
              <TouchableOpacity 
                key={`${like.userId}-${index}`}
                onPress={() => {
                  if (like.thoughts) {
                    const likeId = `like-${like.userId}-${index}`;
                    onToggleThoughts(likeId);
                  }
                }}
              >
                <Image
                  source={
                    like.userAvatar
                      ? { uri: like.userAvatar }
                      : like.isCharacter
                        ? require('@/assets/images/default-avatar.png')
                        : require('@/assets/images/default-user-avatar.png')
                  }
                  style={styles.likeAvatar}
                />
                
                {like.thoughts && expandedThoughts[`like-${like.userId}-${index}`] && (
                  <View style={styles.likeThoughtsBubble}>
                    <Text style={styles.thoughtsText}>{like.thoughts}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {renderCommentsSection()}
      
      {/* Hide inline input; comments moved to modal for long threads. Keep fallback for short use if needed */}
      {false && activePostId === item.id && renderCommentInput(item)}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: width > 380 ? theme.spacing.md : theme.spacing.sm,
    marginBottom: theme.spacing.md,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  authorAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginRight: theme.spacing.sm,
  },
  authorName: {
    color: theme.colors.text,
    fontSize: width > 380 ? theme.fontSizes.md : theme.fontSizes.sm,
    fontWeight: 'bold',
  },
  timestamp: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  content: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    marginBottom: theme.spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.md,
  },
  
  // Like section styles
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  starButton: {
    marginRight: 4,
    paddingVertical: 2,
  },
  ratingText: {
    marginLeft: 8,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  likeIcon: {
    marginRight: theme.spacing.sm,
  },
  likeAvatars: {
    flexDirection: 'row',
  },
  likeAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 4,
    backgroundColor: theme.colors.input,
  },
  
  // Comment styles
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: width > 380 ? theme.spacing.sm : theme.spacing.xs,
  },
  commentAvatar: {
    width: width > 380 ? 32 : 28,
    height: width > 380 ? 32 : 28,
    borderRadius: width > 380 ? 16 : 14,
    marginRight: theme.spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: width > 380 ? theme.fontSizes.md : theme.fontSizes.sm,
    marginBottom: 2,
  },
  commentText: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: width > 380 ? theme.fontSizes.md : theme.fontSizes.sm,
  },
  replyText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginRight: 4,
  },
  replyButton: {
    marginTop: 4,
    paddingVertical: 4,
  },
  replyButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
  },
  
  // Images container style
  imagesContainer: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    marginVertical: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',     // 保证图片垂直居中
    width: '100%',            // 容器宽度撑满卡片
  },
  
  contentImage: {
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.input,
     resizeMode: 'cover',
     overflow: 'hidden',
     alignSelf: 'center', // ensure single images center horizontally
  },

  // Thoughts section
  thoughtsContainer: {
    marginVertical: theme.spacing.xs,
  },
  thoughtsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
  },
  thoughtsTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    marginRight: 4,
  },
  thoughtsBubble: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.accent,
  },
  thoughtsText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontStyle: 'italic',
  },
  
  // Like thoughts tooltip
  likeThoughtsBubble: {
    position: 'absolute',
    bottom: 40,
    left: -50,
    width: 150,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 100,
    elevation: 5,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  
  postMenuButton: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  processingText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    marginLeft: 4,
  },

  expandCommentsButton: {
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  expandCommentsText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
});

PostItem.displayName = 'PostItem';

export default PostItem;