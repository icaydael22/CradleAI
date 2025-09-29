import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Animated, {
  FadeIn,
} from 'react-native-reanimated';
import { Message, User, Character } from '@/shared/types';
import { Ionicons } from '@expo/vector-icons';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';
import { enhanceHtmlWithMarkdown, extractHtmlFromCodeBlock, isWebViewContent } from '@/utils/visualNovelUtils';

interface GeneratedImage {
  id: string;
  prompt: string;
  timestamp: number;
}

interface VisualNovelModeProps {
  messages: Message[];
  selectedCharacter: Character | null;
  user?: User | null;
  regeneratingMessageId?: string | null;
  generatedImages?: GeneratedImage[];
  onRegenerateMessage?: (messageId: string, messageIndex: number) => void;
  onEditMessage?: (message: Message, aiIndex: number) => void;
  onDeleteMessage?: (message: Message, aiIndex: number) => void;
  onCopyMessage?: (text: string) => void;
  onTTSPress?: (message: Message) => void;
  onOpenFullscreenImage?: (imageId: string) => void;
  onSaveGeneratedImage?: (imageId: string) => void;
  onShareGeneratedImage?: (imageId: string) => void;
  onDeleteGeneratedImage?: (imageId: string) => void;
  onRouterPush?: (path: string) => void;
  processMessageContent?: (messageId: string, text: string, isUser: boolean) => React.ReactNode;
  renderTTSButtons?: (message: Message) => any;
  uiSettings: ChatUISettings;
  keyboardVisible: boolean;
  keyboardHeight: number;
}

const { width, height } = Dimensions.get('window');
const BUTTON_SIZE = width < 360 ? 28 : 32;
const BUTTON_ICON_SIZE = width < 360 ? 16 : 18;
const BUTTON_MARGIN = width < 360 ? 3 : 6;

// Visual Novel Image Display Component
const VisualNovelImageDisplay: React.FC<{
  images: GeneratedImage[];
  onOpenFullscreen: (imageId: string) => void;
  onSave: (imageId: string) => void;
  onShare: (imageId: string) => void;
  onDelete: (imageId: string) => void;
}> = ({ images, onOpenFullscreen, onSave, onShare, onDelete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const renderImage = ({ item, index }: { item: GeneratedImage; index: number }) => (
    <View style={styles.vnImageItem}>
      <TouchableOpacity 
        style={styles.vnImageTouchable}
        onPress={() => onOpenFullscreen(item.id)}
      >
        <Image
          source={{ uri: `file://${item.id}` }}
          style={styles.vnImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
      <View style={styles.vnImageActions}>
        <TouchableOpacity
          style={styles.vnImageActionButton}
          onPress={() => onSave(item.id)}
        >
          <Ionicons name="download-outline" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.vnImageActionButton}
          onPress={() => onShare(item.id)}
        >
          <Ionicons name="share-outline" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.vnImageActionButton}
          onPress={() => onDelete(item.id)}
        >
          <Ionicons name="trash-outline" size={16} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.vnImageDisplayContainer}>
      <FlatList
        data={images}
        renderItem={renderImage}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / (width * 0.7));
          setCurrentIndex(index);
        }}
        snapToInterval={width * 0.7}
        decelerationRate="fast"
      />
      {images.length > 1 && (
        <View style={styles.vnImagePagination}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.vnImagePaginationDot,
                index === currentIndex && styles.vnImagePaginationDotActive
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const VisualNovelMode: React.FC<VisualNovelModeProps> = ({
  messages,
  selectedCharacter,
  user,
  regeneratingMessageId,
  generatedImages = [],
  onRegenerateMessage,
  onEditMessage,
  onDeleteMessage,
  onCopyMessage,
  onTTSPress,
  onOpenFullscreenImage,
  onSaveGeneratedImage,
  onShareGeneratedImage,
  onDeleteGeneratedImage,
  onRouterPush,
  processMessageContent,
  renderTTSButtons,
  uiSettings,
  keyboardVisible,
  keyboardHeight,
}) => {
  const [vnExpanded, setVnExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  if (!lastMessage || !selectedCharacter) return null;

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

  // UI settings for visual novel mode
  const getVnBgColor = useCallback(() => {
    const { vnDialogColor, vnDialogAlpha } = uiSettings;
    return convertColorToRGBA(vnDialogColor, vnDialogAlpha);
  }, [uiSettings.vnDialogColor, uiSettings.vnDialogAlpha]);

  // Calculate heights for layout
  const getVNTextMaxHeight = useCallback(() => {
    if (vnExpanded) {
      return height * 0.6; // 展开时更大高度
    }
    const hasGeneratedImages = generatedImages && generatedImages.length > 0;
    const VN_IMAGE_AREA_HEIGHT = hasGeneratedImages ? 220 : 0;
    const baseHeight = Math.min(120, height * 0.15);
    const availableHeight = height - (keyboardVisible ? keyboardHeight : 0) - VN_IMAGE_AREA_HEIGHT - 100;
    return Math.min(baseHeight, availableHeight * 0.4);
  }, [vnExpanded, generatedImages, keyboardVisible, keyboardHeight]);

  const getCollapsedAbsTop = useCallback(() => {
    const hasGeneratedImages = generatedImages && generatedImages.length > 0;
    const VN_IMAGE_AREA_HEIGHT = hasGeneratedImages ? 220 : 0;
    return height - getVNTextMaxHeight() - Math.max(80, height * 0.1) - VN_IMAGE_AREA_HEIGHT - (keyboardVisible ? keyboardHeight : 0);
  }, [getVNTextMaxHeight, generatedImages, keyboardVisible, keyboardHeight]);

  // Determine message display logic
  const hasGeneratedImages = generatedImages && generatedImages.length > 0;
  const shouldUseAbsolute = !vnExpanded && hasGeneratedImages;

  const showUserMessage =
    lastMessage.sender === 'user' ||
    (lastMessage.sender === 'bot' && lastMessage.isLoading && messages.length >= 2 && messages[messages.length - 2].sender === 'user');

  let displayName, displayAvatar, displayText;
  if (showUserMessage) {
    const userMsg = lastMessage.sender === 'user' ? lastMessage : messages[messages.length - 2];
    displayName = selectedCharacter?.customUserName;
    displayAvatar = user?.avatar ? { uri: String(user.avatar) } : require('@/assets/images/default-avatar.png');
    displayText = userMsg?.text || '';
  } else {
    displayName = selectedCharacter.name;
    displayAvatar = selectedCharacter.avatar ? { uri: String(selectedCharacter.avatar) } : require('@/assets/images/default-avatar.png');
    displayText = lastMessage.text;
  }

  const aiIndex = lastMessage.metadata?.aiIndex !== undefined
    ? lastMessage.metadata.aiIndex
    : messages.filter(m => m.sender === 'bot' && !m.isLoading).length - 1;

  const isUser = showUserMessage;
  const isRegenerating = regeneratingMessageId === lastMessage.id;

  // Enhanced shouldRenderAsWebView judgment
  const shouldRenderAsWebView = !isUser && !lastMessage.isLoading && (
    isWebViewContent(displayText) || 
    displayText.match(/```(?:html)?\s*<!DOCTYPE\s+html[\s\S]*?```/i) ||
    displayText.match(/```(?:html)?\s*<html[\s\S]*?```/i)
  );

  // Check if first_mes
  let isFirstMes = false;
  if (lastMessage.metadata?.isFirstMes) {
    isFirstMes = true;
  } else if (selectedCharacter && selectedCharacter.jsonData) {
    try {
      const characterData = JSON.parse(selectedCharacter.jsonData);
      if (characterData.roleCard?.first_mes && lastMessage.text === characterData.roleCard.first_mes) {
        isFirstMes = true;
      }
    } catch (e) {
      // ignore
    }
  }

  // Layout styles based on expansion state
  const VN_IMAGE_AREA_HEIGHT = hasGeneratedImages ? 220 : 0;

  const collapsedStackStyle = shouldUseAbsolute
    ? {
        position: 'absolute' as const,
        left: 0,
        right: 0,
        top: getCollapsedAbsTop(),
        bottom: Math.max(
          keyboardVisible ? keyboardHeight + Math.max(40, height * 0.05) : Math.max(60, height * 0.08),
          0
        ),
        zIndex: 1,
        flexDirection: 'column' as const,
        alignItems: 'stretch' as const,
        justifyContent: 'flex-end' as const,
        pointerEvents: 'box-none' as const,
      }
    : [
        styles.visualNovelDialogStack,
        keyboardVisible && { 
          bottom: keyboardHeight + Math.max(20, height * 0.02)
        }
      ];

  const vnContainerStyle = vnExpanded
    ? [
        styles.visualNovelContainer,
        styles.visualNovelContainerExpanded,
        { backgroundColor: getVnBgColor() }
      ]
    : [
        styles.visualNovelContainer,
        !hasGeneratedImages
          ? [
              styles.visualNovelContainerCollapsedAbs, 
              { top: getCollapsedAbsTop() }
            ]
          : styles.visualNovelContainerCollapsed,
        {
          backgroundColor: getVnBgColor(),
          maxHeight: Math.min(
            height * 0.4,
            height - getCollapsedAbsTop() - Math.max(40, height * 0.05) - (hasGeneratedImages ? VN_IMAGE_AREA_HEIGHT + 24 : 0)
          ),
          minHeight: Math.min(140, height * 0.18),
          marginTop: hasGeneratedImages ? 8 : 0,
          marginBottom: !hasGeneratedImages ? Math.max(20, height * 0.02) : 0,
        }
      ];

  // Event handlers
  const handleToggleVnExpanded = useCallback(() => {
    setVnExpanded(v => !v);
  }, []);

  const handleCollapseVnExpanded = useCallback(() => {
    setVnExpanded(false);
  }, []);

  const handleVnCopyMessage = useCallback((text: string) => {
    onCopyMessage?.(text);
  }, [onCopyMessage]);

  const handleVnEditMessage = useCallback((message: Message, aiIndex: number) => {
    onEditMessage?.(message, aiIndex);
  }, [onEditMessage]);

  const handleVnDeleteMessage = useCallback((message: Message, aiIndex: number) => {
    onDeleteMessage?.(message, aiIndex);
  }, [onDeleteMessage]);

  const handleVnRegenerate = useCallback((messageId: string, aiIndex: number) => {
    onRegenerateMessage?.(messageId, aiIndex);
  }, [onRegenerateMessage]);

  const handleVnTTSPress = useCallback((message: Message) => {
    onTTSPress?.(message);
  }, [onTTSPress]);

  return (
    <View style={vnExpanded ? styles.visualNovelExpandedFullContainer : (shouldUseAbsolute ? collapsedStackStyle : styles.visualNovelDialogStack)}>
      {hasGeneratedImages && !vnExpanded && onOpenFullscreenImage && onSaveGeneratedImage && onShareGeneratedImage && onDeleteGeneratedImage && (
        <Animated.View 
          entering={FadeIn.duration(400)} 
          style={styles.vnImageDisplayOuter}
        >
          <VisualNovelImageDisplay
            images={generatedImages}
            onOpenFullscreen={onOpenFullscreenImage}
            onSave={onSaveGeneratedImage}
            onShare={onShareGeneratedImage}
            onDelete={onDeleteGeneratedImage}
          />
        </Animated.View>
      )}

      {/* Main visual novel container */}
      <Animated.View 
        entering={FadeIn.duration(350)}
        style={vnExpanded ? [styles.visualNovelExpandedContainer, { backgroundColor: getVnBgColor() }] : vnContainerStyle}
      >
        {/* Expand button - only show when collapsed */}
        {!vnExpanded && (
          <View style={styles.visualNovelExpandButtonFixed}>
            <TouchableOpacity
              style={[
                styles.visualNovelHeaderButton,
                { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent' }
              ]}
              onPress={handleToggleVnExpanded}
            >
              <Ionicons name="chevron-up" size={BUTTON_ICON_SIZE} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Avatar and name - don't show when expanded */}
        {!vnExpanded && (
          <View style={styles.visualNovelHeader}>
            <Image
              source={displayAvatar}
              style={styles.visualNovelAvatar}
            />
            <Text style={[
              styles.visualNovelCharacterName,
              { color: uiSettings.vnTextColor }
            ]}>
              {displayName}
            </Text>
          </View>
        )}
          
        {/* Content area */}
        {shouldRenderAsWebView ? (
          <View style={[
            styles.visualNovelWebViewContainer,
            { 
              height: getVNTextMaxHeight(),
              marginTop: vnExpanded ? 8 : 0,
              marginBottom: vnExpanded ? Math.max(20, insets.bottom + 10) : 0,
            }
          ]}>
            <WebView
              style={[styles.visualNovelWebView, { width: '100%', height: '100%' }]}
              originWhitelist={['*']}
              source={{ 
                html: enhanceHtmlWithMarkdown(extractHtmlFromCodeBlock(displayText))
              }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              scalesPageToFit={false}
              injectedJavaScript={`
                document.querySelector('meta[name="viewport"]')?.remove();
                var meta = document.createElement('meta');
                meta.name = 'viewport';
                meta.content = 'width=device-width, initial-scale=1, maximum-scale=1';
                document.getElementsByTagName('head')[0].appendChild(meta);
                true;
              `}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.webViewLoadingText}>加载中...</Text>
                </View>
              )}
            />
          </View>
        ) : vnExpanded ? (
          // Expanded mode: redesigned scroll layout
          <View style={styles.visualNovelExpandedTextArea}>
            <ScrollView
              style={styles.visualNovelExpandedScrollView}
              contentContainerStyle={styles.visualNovelExpandedScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.visualNovelTextWrapper}>
                {processMessageContent?.(lastMessage.id, displayText, Boolean(isUser))}
              </View>
            </ScrollView>
          </View>
        ) : (
          // Collapsed mode: fixed height ScrollView to prevent overflow
          <ScrollView
            style={[
              styles.visualNovelTextContainer,
              {
                maxHeight: getVNTextMaxHeight(),
                marginBottom: 0,
                marginTop: 0,
              }
            ]}
            contentContainerStyle={{ 
              flexGrow: 1,
              minHeight: getVNTextMaxHeight(),
            }}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            <View style={styles.visualNovelTextWrapper}>
              {processMessageContent?.(lastMessage.id, displayText, Boolean(isUser))}
            </View>
          </ScrollView>
        )}
        
        {/* Action buttons */}
        <View style={[
          styles.visualNovelActions,
          vnExpanded ? styles.visualNovelExpandedActions : {
            paddingBottom: 20,
            marginBottom: 0,
          }
        ]}>
          {/* Collapse button for expanded mode */}
          {vnExpanded && (
            <TouchableOpacity
              style={[
                styles.actionCircleButton,
                { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginRight: BUTTON_MARGIN }
              ]}
              onPress={handleCollapseVnExpanded}
            >
              <Ionicons
                name="chevron-down"
                size={BUTTON_ICON_SIZE}
                color="#fff"
              />
            </TouchableOpacity>
          )}

          {/* Volume button */}
          {!isUser && !lastMessage.isLoading && (
            <TouchableOpacity
              style={[
                styles.actionCircleButton,
                { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginRight: BUTTON_MARGIN }
              ]}
              onPress={() => handleVnTTSPress(lastMessage)}
              disabled={renderTTSButtons?.(lastMessage)?.props?.disabled}
            >
              <Ionicons
                name="volume-high"
                size={BUTTON_ICON_SIZE}
                color="#fff"
              />
            </TouchableOpacity>
          )}

          {/* Copy button - show for all messages */}
          <TouchableOpacity
            style={[
              styles.actionCircleButton,
              { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginRight: BUTTON_MARGIN }
            ]}
            onPress={() => handleVnCopyMessage(displayText)}
          >
            <Ionicons
              name="copy-outline"
              size={BUTTON_ICON_SIZE}
              color="#fff"
            />
          </TouchableOpacity>

          {/* AI message actions (non-first_mes only) */}
          {!isUser && !lastMessage.isLoading && !isFirstMes && (
            <View style={styles.visualNovelActionRow}>
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                ]}
                onPress={() => handleVnEditMessage(lastMessage, aiIndex)}
                disabled={!!regeneratingMessageId}
              >
                <Ionicons name="create-outline" size={BUTTON_ICON_SIZE} color={regeneratingMessageId ? "#999999" : "#f1c40f"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                ]}
                onPress={() => handleVnDeleteMessage(lastMessage, aiIndex)}
                disabled={!!regeneratingMessageId}
              >
                <Ionicons name="trash-outline" size={BUTTON_ICON_SIZE} color={regeneratingMessageId ? "#999999" : "#e74c3c"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  isRegenerating && styles.actionCircleButtonActive,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                ]}
                disabled={isRegenerating || !!regeneratingMessageId}
                onPress={() => handleVnRegenerate(lastMessage.id, aiIndex)}
              >
                {isRegenerating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="refresh"
                    size={BUTTON_ICON_SIZE}
                    color={regeneratingMessageId ? "#999999" : "#3498db"}
                  />
                )}
              </TouchableOpacity>
              {/* Log jump button */}
              <TouchableOpacity
                style={[
                  styles.actionCircleButton,
                  { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
                ]}
                onPress={() => onRouterPush?.('/pages/log')}
                accessibilityLabel="查看请求日志"
              >
                <Ionicons name="document-text-outline" size={BUTTON_ICON_SIZE} color="#4a6fa5" />
              </TouchableOpacity>
            </View>
          )}

          {/* Log button for user messages */}
          {(isUser || lastMessage.isLoading) && (
            <TouchableOpacity
              style={[
                styles.actionCircleButton,
                { width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'transparent', marginLeft: 8 }
              ]}
              onPress={() => onRouterPush?.('/pages/log')}
              accessibilityLabel="查看请求日志"
            >
              <Ionicons name="document-text-outline" size={BUTTON_ICON_SIZE} color="#4a6fa5" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  visualNovelExpandedFullContainer: {
    flex: 1,
    paddingVertical: 16,
  },
  visualNovelExpandedContainer: {
    flex: 1,
    padding: 15,
    backgroundColor: 'transparent',
    marginHorizontal: 1,
    marginTop: -45,
    borderRadius: 16,
    elevation: 8,
  },
  visualNovelExpandedTextArea: {
    flex: 1,
    marginTop: 5,
  },
  visualNovelExpandedScrollView: {
    flex: 1,
  },
  visualNovelExpandedScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  visualNovelExpandedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 5, 
    paddingBottom: 0, 
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  visualNovelDialogStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Math.max(60, height * 0.08),
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  visualNovelContainer: {
    borderRadius: 16,
    width: '100%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  visualNovelContainerExpanded: {
    flex: 1,
    padding: 15,
    marginHorizontal: 1,
    marginTop: -45,
  },
  visualNovelContainerCollapsed: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  visualNovelContainerCollapsedAbs: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  visualNovelExpandButtonFixed: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 10,
  },
  visualNovelHeaderButton: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visualNovelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  visualNovelAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  visualNovelCharacterName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  visualNovelWebViewContainer: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  visualNovelWebView: {
    backgroundColor: 'transparent',
  },
  visualNovelTextContainer: {
    flex: 1,
  },
  visualNovelTextWrapper: {
    flex: 1,
    paddingHorizontal: 4,
  },
  visualNovelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
  },
  visualNovelActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionCircleButton: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCircleButtonActive: {
    backgroundColor: 'rgba(52, 152, 219, 0.8)',
  },
  webViewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  webViewLoadingText: {
    color: '#fff',
    marginTop: 8,
  },
  // Visual Novel Image Display styles
  vnImageDisplayOuter: {
    marginBottom: 8,
  },
  vnImageDisplayContainer: {
    height: 200,
    marginHorizontal: 16,
  },
  vnImageItem: {
    width: width * 0.7,
    marginRight: 16,
  },
  vnImageTouchable: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  vnImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  vnImageActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 8,
  },
  vnImageActionButton: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  vnImagePagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 8,
  },
  vnImagePaginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 3,
  },
  vnImagePaginationDotActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});

export default VisualNovelMode;
