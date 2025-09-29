import React, { memo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Clipboard, 
  Alert,
  Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';
import { analyzeMessageContent } from '@/utils/contentAnalysis';

// Import existing renderers to handle different content types
import MarkdownRenderer from '@/components/message-renderers/MarkdownRenderer';
import PlainTextRenderer from '@/components/message-renderers/PlainTextRenderer';
import HtmlRenderer from '@/components/message-renderers/HtmlRenderer';

interface ParagraphRendererProps {
  messageId: string;
  paragraphs: string[];
  isUser: boolean;
  uiSettings: ChatUISettings;
  onCopyParagraph?: (messageId: string, paragraphIndex: number, text: string) => void;
  maxImageHeight?: number;
  user?: any; // User for avatar
  selectedCharacter?: any; // Character for avatar
}

const ParagraphRenderer: React.FC<ParagraphRendererProps> = memo(({
  messageId,
  paragraphs,
  isUser,
  uiSettings,
  onCopyParagraph,
  maxImageHeight = 300,
  user,
  selectedCharacter,
}) => {
  
  // 只在开发模式下偶尔打印调试信息
  if (__DEV__ && Math.random() < 0.05) { // 只有5%的概率打印
    console.log('[ParagraphRenderer] Rendering:', {
      messageId: messageId.substring(0, 8),
      paragraphsCount: paragraphs.length,
      isUser
    });
  }
  
  // Get avatar for the message
  const getAvatar = useCallback(() => {
    if (isUser) {
      return user?.avatar || null;
    } else {
      return selectedCharacter?.avatar || null;
    }
  }, [isUser, user, selectedCharacter]);

  // Render avatar component with memory optimization
  const renderAvatar = useCallback(() => {
    const avatarSource = getAvatar();
    
    if (avatarSource) {
      // Optimize image loading to prevent memory leaks
      const imageSource = typeof avatarSource === 'string' 
        ? { uri: avatarSource, cache: 'force-cache' } 
        : avatarSource;
        
      return (
        <Image 
          source={imageSource}
          style={styles.avatar}
          resizeMode="cover"
          // Add memory optimization props
          fadeDuration={0} // Disable fade animation for performance
        />
      );
    } else {
      // Show default icon when no avatar is available
      return (
        <View style={[styles.avatar, styles.defaultAvatar]}>
          <Ionicons 
            name={isUser ? "person" : "chatbubble"} 
            size={16} 
            color="#fff" 
          />
        </View>
      );
    }
  }, [getAvatar, isUser]);
  
  // 辅助函数：将颜色转换为带透明度的RGBA格式
  const convertColorToRGBA = useCallback((color: string, alpha: number): string => {
    if (color.startsWith('rgba(')) return color;
    
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    console.warn(`Unsupported color format: ${color}, using default`);
    return `rgba(255, 255, 255, ${alpha})`;
  }, []);

  // 获取段落气泡样式
  const getParagraphBubbleStyle = useCallback(() => {
    const baseStyle = [
      styles.paragraphBubble,
      {
        paddingHorizontal: 12 * uiSettings.bubblePaddingMultiplier,
        paddingVertical: 8 * uiSettings.bubblePaddingMultiplier,
      }
    ];

    if (isUser) {
      return [
        ...baseStyle,
        {
          alignSelf: 'flex-end' as const,
          backgroundColor: convertColorToRGBA(
            uiSettings.regularUserBubbleColor, 
            uiSettings.regularUserBubbleAlpha
          ),
        }
      ];
    } else {
      return [
        ...baseStyle,
        {
          alignSelf: 'flex-start' as const,
          backgroundColor: convertColorToRGBA(
            uiSettings.regularBotBubbleColor, 
            uiSettings.regularBotBubbleAlpha
          ),
        }
      ];
    }
  }, [isUser, uiSettings, convertColorToRGBA]);

  // 复制段落文本到剪贴板
  const handleCopyParagraph = useCallback(async (paragraphIndex: number, text: string) => {
    try {
      await Clipboard.setString(text);
      
      // 调用外部回调（如果提供）
      if (onCopyParagraph) {
        onCopyParagraph(messageId, paragraphIndex, text);
      }
      
      // 显示复制成功的提示（可选）
      // Alert.alert('已复制', '段落内容已复制到剪贴板');
    } catch (error) {
      console.error('Failed to copy paragraph:', error);
      Alert.alert('复制失败', '无法复制到剪贴板');
    }
  }, [messageId, onCopyParagraph]);

  // 渲染段落内容
  const renderParagraphContent = useCallback((paragraph: string, index: number) => {
    const contentAnalysis = analyzeMessageContent(paragraph);

    // 处理不同类型的内容
    if (contentAnalysis.hasMarkdown) {
      return (
        <MarkdownRenderer
          text={paragraph}
          isUser={isUser}
          uiSettings={uiSettings}
          onImagePress={() => {}} // 在段落模式中暂时禁用图片点击
        />
      );
    }

    if (contentAnalysis.hasCustomTags || contentAnalysis.hasHtmlTags) {
      return (
        <HtmlRenderer
          text={paragraph}
          isUser={isUser}
          uiSettings={uiSettings}
          onImagePress={() => {}} // 在段落模式中暂时禁用图片点击
          hasMarkdown={contentAnalysis.hasMarkdown}
          maxImageHeight={maxImageHeight}
        />
      );
    }

    // 默认纯文本渲染
    return (
      <PlainTextRenderer
        text={paragraph}
        isUser={isUser}
        uiSettings={uiSettings}
      />
    );
  }, [isUser, uiSettings, maxImageHeight]);

  // 如果没有段落或只有一个段落，返回 null（由父组件处理）
  if (!paragraphs || paragraphs.length <= 1) {
    return null;
  }

  return (
    <View style={styles.container}>
      {paragraphs.map((paragraph, index) => (
        <View key={`${messageId}-paragraph-${index}`} style={styles.paragraphContainer}>
          <View style={[
            styles.paragraphRow, 
            isUser ? styles.userParagraphRow : styles.botParagraphRow
          ]}>
            {!isUser && renderAvatar()}
            <View style={getParagraphBubbleStyle()}>
              {renderParagraphContent(paragraph, index)}
              
              {/* 复制按钮 */}
              <TouchableOpacity
                style={[
                  styles.copyButton,
                  isUser ? styles.copyButtonUser : styles.copyButtonBot
                ]}
                onPress={() => handleCopyParagraph(index, paragraph)}
                accessibilityRole="button"
                accessibilityLabel={`复制第 ${index + 1} 段内容`}
              >
                <Ionicons 
                  name="copy-outline" 
                  size={14} 
                  color={isUser ? '#666' : '#ccc'} 
                />
              </TouchableOpacity>
            </View>
            {isUser && renderAvatar()}
          </View>
        </View>
      ))}
    </View>
  );
});

ParagraphRenderer.displayName = 'ParagraphRenderer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  paragraphContainer: {
    marginVertical: 2, // 段落间的紧凑间距
  },
  paragraphRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  userParagraphRow: {
    justifyContent: 'flex-end',
  },
  botParagraphRow: {
    justifyContent: 'flex-start',
  },
  paragraphBubble: {
    borderRadius: 12,
    maxWidth: '85%',
    position: 'relative',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  defaultAvatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
    borderRadius: 6,
    opacity: 0.7,
  },
  copyButtonUser: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  copyButtonBot: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});

// Custom comparison function for React.memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps: ParagraphRendererProps, nextProps: ParagraphRendererProps) => {
  // Check if essential props have changed
  if (
    prevProps.messageId !== nextProps.messageId ||
    prevProps.isUser !== nextProps.isUser ||
    prevProps.paragraphs.length !== nextProps.paragraphs.length ||
    prevProps.maxImageHeight !== nextProps.maxImageHeight
  ) {
    return false;
  }

  // Deep compare paragraphs array
  for (let i = 0; i < prevProps.paragraphs.length; i++) {
    if (prevProps.paragraphs[i] !== nextProps.paragraphs[i]) {
      return false;
    }
  }

  // Compare user/character avatars
  const prevAvatar = prevProps.isUser ? prevProps.user?.avatar : prevProps.selectedCharacter?.avatar;
  const nextAvatar = nextProps.isUser ? nextProps.user?.avatar : nextProps.selectedCharacter?.avatar;
  if (prevAvatar !== nextAvatar) {
    return false;
  }

  // Props are equal, no need to re-render
  return true;
};

export default memo(ParagraphRenderer, arePropsEqual);