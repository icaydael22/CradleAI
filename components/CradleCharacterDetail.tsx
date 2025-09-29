import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CradleCharacter } from '@/shared/types';
import { theme } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

interface CradleCharacterDetailProps {
  character: CradleCharacter;
  onDelete: () => void;
  onEdit: () => void;
  isEditable?: boolean;
  onRegenerateImage: () => void;
  onShowGallery: () => void;
}

const CradleCharacterDetail: React.FC<CradleCharacterDetailProps> = ({
  character,
  onDelete,
  onEdit,
  isEditable = false,
  onRegenerateImage,
  onShowGallery,
}) => {
  const router = useRouter();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  
  // 检查角色是否正在生成图像
  const isGeneratingImage = character.imageGenerationStatus === 'pending';
  const hasGeneratingImage = character.imageHistory?.some(img => img.generationStatus === 'pending');
  const isLoading = isGeneratingImage || hasGeneratingImage;

  // Check if this character is either generated from cradle or directly editable
  const showEditButton = isEditable || 
                         character.isCradleGenerated === true || 
                         character.isDialogEditable === true;

  // 前往聊天页面
  const navigateToChat = () => {
    if (character.generatedCharacterId) {
      router.push(`/?characterId=${character.generatedCharacterId}`);
    } else {
      // If no generated character ID exists, navigate using the current character ID
      router.push(`/?characterId=${character.id}`);
    }
  };

  // 展开/折叠描述
  const toggleDescription = () => {
    setIsDescriptionExpanded(!isDescriptionExpanded);
  };

  // 显示更多选项菜单
  const toggleOptionsMenu = () => {
    setShowOptionsMenu(!showOptionsMenu);
  };

  // 处理描述文本截断
  const description = character.description || "这是一个AI角色，点击聊天按钮开始对话...";
  const shouldTruncate = description.length > 100;
  const truncatedDescription = shouldTruncate && !isDescriptionExpanded 
    ? description.substring(0, 100) + '...' 
    : description;

  return (
    <View style={styles.characterDetailCard}>
      {/* 角色背景图片 */}
      {character.backgroundImage ? (
        <Image 
          source={{ uri: character.backgroundImage }} 
          style={styles.characterDetailBackground} 
          resizeMode="cover"
        />
      ) : (
        <View style={styles.characterDetailBackgroundPlaceholder}>
          <MaterialCommunityIcons name="image-outline" size={40} color="#666" />
        </View>
      )}
      
      {/* 显示加载状态指示器 */}
      {isLoading && (
        <View style={styles.imageLoadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>图像生成中...</Text>
        </View>
      )}
      
      {/* 渐变叠加层 */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
        style={styles.characterDetailGradient}
      >
        {/* 角色信息 */}
        <View style={styles.characterDetailInfo}>
          {/* 标题区域 - 名称和更多选项按钮 */}
          <View style={styles.headerRow}>
            <Text style={styles.characterDetailName} numberOfLines={1}>{character.name}</Text>
            <TouchableOpacity 
              style={styles.moreOptionsButton}
              onPress={toggleOptionsMenu}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          
          {/* 角色操作按钮 - 只显示主要操作 */}
          <View style={styles.characterActionButtons}>
            {/* 显示聊天按钮 */}
            <TouchableOpacity 
              style={[styles.characterActionButton, styles.primaryButton]}
              onPress={navigateToChat}
            >
              <Ionicons name="chatbubble-outline" size={16} color="black" />
              <Text style={styles.characterActionButtonText}>聊天</Text>
            </TouchableOpacity>
            
            {/* 生成图片按钮 - 作为第二主要操作 */}
            {onRegenerateImage && !isLoading && (
              <TouchableOpacity 
                style={[styles.characterActionButton, styles.secondaryButton]}
                onPress={onRegenerateImage}
              >
                <Ionicons name="image-outline" size={16} color="black" />
                <Text style={styles.characterActionButtonText}>生成图片</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>
      
      {/* 更多选项菜单 */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsMenuContainer}>
            {/* 图库选项 */}
            {onShowGallery && (
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  onShowGallery();
                }}
              >
                <Ionicons name="images-outline" size={22} color="#fff" />
                <Text style={styles.menuItemText}>查看图库</Text>
              </TouchableOpacity>
            )}
            
            {/* 编辑选项 - 只对已生成角色显示 */}
            {showEditButton && (
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  if (onEdit) onEdit();
                }}
              >
                <Ionicons name="create-outline" size={22} color="#fff" />
                <Text style={styles.menuItemText}>对话修改</Text>
              </TouchableOpacity>
            )}
            
            {/* 删除选项 */}
            <TouchableOpacity 
              style={[styles.menuItem, styles.deleteMenuItem]}
              onPress={() => {
                setShowOptionsMenu(false);
                onDelete();
              }}
            >
              <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
              <Text style={[styles.menuItemText, styles.deleteMenuItemText]}>删除角色</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  characterDetailCard: {
    height: 200, // 减小了卡片高度
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
    position: 'relative',
  },
  characterDetailBackground: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover',
  },
  characterDetailBackgroundPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterDetailGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  characterDetailInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    zIndex: 10, // Ensure options button stays on top
  },
  characterDetailName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginRight: 12, // Add margin to prevent overlap with the button
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3,
  },
  moreOptionsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20, // Ensure button stays clickable
  },
  descriptionContainer: {
    marginBottom: 12,
    zIndex: 5, // Lower z-index than header elements
  },
  descriptionContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  characterDetailDescription: {
    color: '#eee',
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3,
  },
  expandButton: {
    marginLeft: 8,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  expandButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  characterActionButtons: {
    flexDirection: 'row',
    color: theme.colors.buttonText,
  },
  characterActionButton: {
    color: theme.colors.buttonText,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: theme.colors.buttonText
  },
  characterActionButtonText: {
    color: 'black',
    marginLeft: 8,
    fontWeight: '500',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  optionsMenuContainer: {
    width: '100%',
    backgroundColor: '#333',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32, // 增加底部空间，适应底部导航栏
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuItemText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 16,
  },
  deleteMenuItem: {
    borderBottomWidth: 0,
  },
  deleteMenuItemText: {
    color: '#FF6B6B',
  },
  // Add new styles for loading overlay
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontWeight: '500',
  },
});

export default CradleCharacterDetail;
