import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '@/shared/types';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';
import MarkdownRenderer from './MarkdownRenderer';
import HtmlRenderer from './HtmlRenderer';
import ImageMessageRenderer from './ImageMessageRenderer';
import PlainTextRenderer from './PlainTextRenderer';
import WebViewRenderer from './WebViewRenderer';
import ParagraphRenderer from '../ParagraphRenderer';
import { analyzeMessageContent } from '@/utils/contentAnalysis';
import ImageManager from '@/utils/ImageManager';
import { processMessageText, computeRenderKey, shouldSplitIntoParagraphs } from '@/utils/VariableTagCleaner';
import { getGlobalRenderCache } from '@/utils/RenderCache';

interface MessageItemProps {
  message: Message;
  isUser: boolean;
  index: number;
  uiSettings: ChatUISettings;
  onImagePress?: (url: string) => void;
  onCopyMessage?: (text: string) => void;
  onEditMessage?: (messageId: string, isUser: boolean) => void;
  onDeleteMessage?: (messageId: string, isUser: boolean) => void;
  onRegenerateMessage?: (messageId: string) => void;
  regeneratingMessageId?: string | null;
  maxImageHeight?: number;
  user?: any; // Add user prop for avatar
  selectedCharacter?: any; // Add character prop for avatar
  onUpdateRenderedTime?: (messageId: string, renderedAt: number) => void; // 新增：渲染时间更新回调
  paragraphModeEnabled?: boolean; // 新增：是否启用段落模式
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isUser,
  index,
  uiSettings,
  onImagePress,
  onCopyMessage,
  onEditMessage,
  onDeleteMessage,
  onRegenerateMessage,
  regeneratingMessageId,
  maxImageHeight = 300,
  user,
  selectedCharacter,
  onUpdateRenderedTime,
  paragraphModeEnabled = false,
}) => {
  const hasRenderedRef = useRef(false);
  // Compute a display-only text that strips appended rewrite opinion markers
  // NodeST appends "\n\n【重写要求】..." to the user message when a rewrite opinion is provided.
  // For UI stability we remove that portion from displayed text but keep message.text unchanged
  const displayText = useMemo(() => {
    const stripRewriteOpinion = (text?: string) => {
      if (!text) return '';
      return text.replace(/\n*\s*【重写要求】[\s\S]*$/g, '');
    };
    return stripRewriteOpinion(message.text);
  }, [message.text]);

  const contentAnalysis = useMemo(() => analyzeMessageContent(displayText), [displayText]);

  // 段落模式处理：使用缓存获取清理和分段后的文本
  const { cleanedText, paragraphs } = useMemo(() => {
    if (!paragraphModeEnabled) {
      return { cleanedText: displayText, paragraphs: [displayText] };
    }

    const cache = getGlobalRenderCache();
    const cacheKey = computeRenderKey(message);
    
    return cache.getOrCompute(cacheKey, () => {
      const result = processMessageText(displayText);
      return {
        cleanedText: result.cleanedText,
        paragraphs: result.paragraphs,
        computedAt: Date.now(),
      };
    });
  }, [displayText, paragraphModeEnabled, message]);

  // 检查是否是剧本旁白消息
  const isScriptNarration = message.metadata?.isScriptNarration === true;

  // 判断是否应该使用段落渲染
  const shouldUseParagraphRendering = paragraphModeEnabled && paragraphs.length > 1 && !isScriptNarration;

  // 只在开发模式下打印调试信息，并且减少频率
  if (__DEV__ && Math.random() < 0.1) { // 只有10%的概率打印，减少日志量
    console.log('[MessageItem] Paragraph rendering decision:', {
      messageId: message.id,
      paragraphModeEnabled,
      paragraphsLength: paragraphs.length,
      shouldUseParagraphRendering
    });
  }

  // 在组件首次渲染完成时记录渲染时间戳
  useEffect(() => {
    if (!hasRenderedRef.current && !message.renderedAt && onUpdateRenderedTime) {
      const renderedAt = Date.now();
      hasRenderedRef.current = true;
      onUpdateRenderedTime(message.id, renderedAt);
    }
  }, [message.id, message.renderedAt, onUpdateRenderedTime]);

  // Get avatar for the message
  const getAvatar = () => {
    if (isUser) {
      return user?.avatar || null; // Use null as default, will show default icon
    } else {
      return selectedCharacter?.avatar || null; // Use null as default, will show default icon
    }
  };

  // Render avatar component with memory optimization
  const renderAvatar = () => {
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
          fadeDuration={0} // Disable fade animation for performance
        />
      );
    } else {
      // Show default icon when no avatar is available
      return (
        <View style={[styles.avatar, styles.defaultAvatar]}>
          <Text style={styles.defaultAvatarText}>
            {isUser ? '我' : (selectedCharacter?.name?.[0] || 'AI')}
          </Text>
        </View>
      );
    }
  };

  // 获取要显示的时间
  const getDisplayTime = () => {
    // 优先使用渲染时间，如果没有则使用时间戳，如果都没有则使用当前时间
    const timeToShow = message.renderedAt || message.timestamp || Date.now();
    return new Date(timeToShow).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 辅助函数：将颜色转换为带透明度的RGBA格式
  const convertColorToRGBA = (color: string, alpha: number): string => {
    // 如果已经是rgba格式，直接返回
    if (color.startsWith('rgba(')) {
      return color;
    }
    
    // 如果是rgb格式，转换为rgba
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    
    // 如果是十六进制格式，转换为rgba
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // 如果是颜色名称或其他格式，使用默认颜色
    console.warn(`Unsupported color format: ${color}, using default`);
    return `rgba(255, 255, 255, ${alpha})`;
  };

  // Get dynamic bubble styles based on UI settings
  const getBubbleStyle = () => {
    const baseStyle = [
      styles.messageContainer,
      {
        paddingHorizontal: 12 * uiSettings.bubblePaddingMultiplier,
        paddingVertical: 8 * uiSettings.bubblePaddingMultiplier,
      }
    ];

    if (isUser) {
      const color = message.status === 'error' 
        ? 'rgba(220, 53, 69, 0.8)' // 错误状态使用红色
        : convertColorToRGBA(uiSettings.regularUserBubbleColor, uiSettings.regularUserBubbleAlpha);
      
      return [
        ...baseStyle,
        {
          alignSelf: 'flex-end' as const,
          backgroundColor: color,
        }
      ];
    } else {
      return [
        ...baseStyle,
        {
          alignSelf: 'flex-start' as const,
          backgroundColor: convertColorToRGBA(uiSettings.regularBotBubbleColor, uiSettings.regularBotBubbleAlpha),
        }
      ];
    }
  };

  // Render message with avatar and status indicator
  const renderMessageWithAvatar = (content: React.ReactNode) => {
    return (
      <View>
        <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.botMessageRow]}>
          {!isUser && renderAvatar()}
          <View style={getBubbleStyle()}>
            <View style={styles.messageContent}>
              {content}
              {/* 显示错误状态图标 */}
              {message.status === 'error' && isUser && (
                <View style={styles.errorIndicator}>
                  <Ionicons name="warning" size={16} color="#fff" />
                  {message.error && (
                    <Text style={styles.errorText} numberOfLines={2}>
                      {message.error}
                    </Text>
                  )}
                </View>
              )}
              {/* 显示发送状态图标 */}
              {message.status === 'sending' && isUser && (
                <View style={styles.sendingIndicator}>
                  <Ionicons name="time" size={14} color="rgba(255,255,255,0.7)" />
                </View>
              )}
            </View>
          </View>
          {isUser && renderAvatar()}
        </View>
        {/* 显示渲染时间 */}
        <View style={[styles.timeContainer, isUser ? styles.userTimeContainer : styles.botTimeContainer]}>
          <Text style={styles.timeText}>{getDisplayTime()}</Text>
        </View>
      </View>
    );
  };

  // 渲染旁白消息
  const renderNarrationMessage = (content: React.ReactNode) => {
    return (
      <View style={styles.narrationContainer}>
        <View style={[styles.narrationBubble, {
          backgroundColor: convertColorToRGBA(uiSettings.narrationBubbleColor || 'rgb(255, 215, 0)', uiSettings.narrationBubbleAlpha || 0.8),
          borderRadius: 12 * (uiSettings.narrationBubbleRoundness || 1),
          paddingHorizontal: 16 * (uiSettings.narrationBubblePaddingMultiplier || 1),
          paddingVertical: 12 * (uiSettings.narrationBubblePaddingMultiplier || 1),
        }]}>
          <View style={styles.narrationHeader}>
            <Ionicons name="film-outline" size={16} color={uiSettings.narrationTextColor || '#333'} />
            <Text style={[styles.narrationLabel, { color: uiSettings.narrationTextColor || '#333' }]}>
              旁白
            </Text>
          </View>
          <View style={styles.narrationContent}>
            {content}
          </View>
        </View>
        {/* 显示渲染时间 */}
        <View style={styles.narrationTimeContainer}>
          <Text style={styles.timeText}>{getDisplayTime()}</Text>
        </View>
      </View>
    );
  };

  // 如果启用段落模式且有多个段落，使用段落渲染器（不包装在消息气泡中）
  if (shouldUseParagraphRendering) {
    return (
      <View>
        <ParagraphRenderer
          messageId={message.id}
          paragraphs={paragraphs}
          isUser={isUser}
          uiSettings={uiSettings}
          onCopyParagraph={(messageId, paragraphIndex, text) => {
            // 复制单个段落时，调用原始的复制回调
            if (onCopyMessage) {
              onCopyMessage(text);
            }
          }}
          maxImageHeight={maxImageHeight}
          user={user}
          selectedCharacter={selectedCharacter}
        />
        {/* 显示渲染时间（仅显示一次，在段落组底部） */}
        <View style={[styles.timeContainer, isUser ? styles.userTimeContainer : styles.botTimeContainer]}>
          <Text style={styles.timeText}>{getDisplayTime()}</Text>
        </View>
      </View>
    );
  }

  // 如果是旁白消息，使用旁白样式渲染
  if (isScriptNarration) {
    // Handle empty content for narration
    if (contentAnalysis.isEmpty) {
      return renderNarrationMessage(
        <PlainTextRenderer
          text="(Empty narration)"
          isUser={false} // 旁白总是使用非用户样式
          uiSettings={uiSettings}
        />
      );
    }

    // Handle different content types for narration
    if (contentAnalysis.hasMarkdown) {
      return renderNarrationMessage(
        <MarkdownRenderer
            text={displayText}
            isUser={false}
            uiSettings={uiSettings}
            onImagePress={onImagePress}
          />
      );
    }

    if (contentAnalysis.hasImages || contentAnalysis.hasLinks) {
      return renderNarrationMessage(
      <ImageMessageRenderer
        text={displayText}
          onImagePress={onImagePress}
          maxImageHeight={maxImageHeight}
          getCachedImageInfo={(imageId: string) => {
            return ImageManager.getImageInfo(imageId);
          }}
          handleOpenFullscreenImage={(imageId: string) => {
            const imageInfo = ImageManager.getImageInfo(imageId);
            if (imageInfo && onImagePress) {
              onImagePress(imageInfo.originalPath);
            }
          }}
        />
      );
    }

    if (contentAnalysis.hasCustomTags || contentAnalysis.hasHtmlTags) {
      return renderNarrationMessage(
      <HtmlRenderer
        text={displayText}
          isUser={false}
          uiSettings={uiSettings}
          onImagePress={onImagePress}
          hasMarkdown={contentAnalysis.hasMarkdown}
          maxImageHeight={maxImageHeight}
        />
      );
    }

    // Default narration text rendering
    return renderNarrationMessage(
      <PlainTextRenderer
        text={message.text}
        isUser={false}
        uiSettings={uiSettings}
      />
    );
  }

  // Handle empty content
  if (contentAnalysis.isEmpty) {
    return renderMessageWithAvatar(
      <PlainTextRenderer
        text="(Empty message)"
        isUser={isUser}
        uiSettings={uiSettings}
      />
    );
  }

  // Handle raw image content
  if (contentAnalysis.isRawImage) {
    return renderMessageWithAvatar(
      <ImageMessageRenderer
        text={displayText}
        onImagePress={onImagePress}
        maxImageHeight={maxImageHeight}
        getCachedImageInfo={(imageId: string) => {
          return ImageManager.getImageInfo(imageId);
        }}
        handleOpenFullscreenImage={(imageId: string) => {
          const imageInfo = ImageManager.getImageInfo(imageId);
          if (imageInfo && onImagePress) {
            onImagePress(imageInfo.originalPath);
          }
        }}
      />
    );
  }

  // Handle WebView content (complete HTML documents)
  if (contentAnalysis.isWebViewContent) {
    return (
      <View style={[styles.messageContainer, styles.webviewMessage]}>
        <WebViewRenderer
          htmlContent={displayText}
          maxHeight={400}
          onImagePress={onImagePress}
        />
      </View>
    );
  }

  // Handle HTML content with custom tags
  if (contentAnalysis.hasCustomTags || contentAnalysis.hasHtmlTags) {
    return renderMessageWithAvatar(
      <HtmlRenderer
        text={displayText}
        isUser={isUser}
        uiSettings={uiSettings}
        onImagePress={onImagePress}
        hasMarkdown={contentAnalysis.hasMarkdown}
        maxImageHeight={maxImageHeight}
      />
    );
  }

  // Handle Markdown content
  if (contentAnalysis.hasMarkdown) {
    return renderMessageWithAvatar(
      <MarkdownRenderer
        text={displayText}
        isUser={isUser}
        uiSettings={uiSettings}
        onImagePress={onImagePress}
      />
    );
  }

  // Handle images and links
  if (contentAnalysis.hasImages || contentAnalysis.hasLinks) {
    return renderMessageWithAvatar(
      <ImageMessageRenderer
        text={displayText}
        onImagePress={onImagePress}
        maxImageHeight={maxImageHeight}
        getCachedImageInfo={(imageId: string) => {
          return ImageManager.getImageInfo(imageId);
        }}
        handleOpenFullscreenImage={(imageId: string) => {
          const imageInfo = ImageManager.getImageInfo(imageId);
          if (imageInfo && onImagePress) {
            onImagePress(imageInfo.originalPath);
          }
        }}
      />
    );
  }

  // Default plain text rendering
  return renderMessageWithAvatar(
    <PlainTextRenderer
      text={displayText}
      isUser={isUser}
      uiSettings={uiSettings}
    />
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: '85%',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  botMessageRow: {
    justifyContent: 'flex-start',
  },
  messageContent: {
    flex: 1,
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
  defaultAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  errorText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    flex: 1,
  },
  sendingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    justifyContent: 'flex-end',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 224, 195, 0.95)',
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(68, 68, 68, 0.85)',
  },
  webviewMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    padding: 0,
    maxWidth: '95%',
  },
  timeContainer: {
    marginTop: 2,
    paddingHorizontal: 8,
  },
  userTimeContainer: {
    alignItems: 'flex-end',
    paddingRight: 48, // Account for user avatar space
  },
  botTimeContainer: {
    alignItems: 'flex-start',
    paddingLeft: 48, // Account for bot avatar space
  },
  timeText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },
  // 旁白样式
  narrationContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  narrationBubble: {
    maxWidth: '90%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  narrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  narrationLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
    opacity: 0.8,
  },
  narrationContent: {
    // 内容样式由各个渲染器处理
  },
  narrationTimeContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
});

export default MessageItem;
