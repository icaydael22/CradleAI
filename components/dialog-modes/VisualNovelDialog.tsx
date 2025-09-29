import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '@/shared/types';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';
import RichTextRenderer from '@/components/RichTextRenderer';
import WebViewRenderer from '@/components/message-renderers/WebViewRenderer';
import { isCompleteHtmlContent } from '@/utils/contentAnalysis';
import { analyzeMessageContent } from '@/utils/contentAnalysis';
import MarkdownRenderer from '@/components/message-renderers/MarkdownRenderer';

const { width, height } = Dimensions.get('window');
const MAX_WIDTH = Math.min(width * 0.88, 500);
const DEFAULT_IMAGE_WIDTH = Math.min(240, width * 0.6);
const DEFAULT_IMAGE_HEIGHT = Math.min(360, height * 0.5);
interface VisualNovelDialogProps {
  messages: Message[];
  selectedCharacter?: any;
  user?: any;
  uiSettings: ChatUISettings;
  onImagePress?: (url: string) => void;
  style?: any;
  topBarHeight?: number;
  inputHeight?: number;
  onExpandedChange?: (expanded: boolean) => void; // 新增：展开状态变化回调
}

interface GeneratedImage {
  id: string;
  prompt: string;
  timestamp: number;
}

const VisualNovelDialog: React.FC<VisualNovelDialogProps> = ({
  messages,
  selectedCharacter,
  user,
  uiSettings,
  onImagePress,
  style,
  topBarHeight = 0,
  inputHeight = 80,
  onExpandedChange, // 新增：展开状态变化回调
}) => {
  const [vnExpanded, setVnExpanded] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // 监听展开状态变化，通知父组件
  useEffect(() => {
    onExpandedChange?.(vnExpanded);
  }, [vnExpanded, onExpandedChange]);
  
  // Helper function to extract RGB values from color string
  const extractRgbValues = (colorString: string) => {
    // Handle formats like "rgb(255, 255, 255)" or "#ffffff" or named colors
    if (colorString.startsWith('rgba(')) {
      // Extract RGB values from rgba() format
      const rgbaMatch = colorString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
      if (rgbaMatch) {
        return `${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}`;
      }
    } else if (colorString.startsWith('rgb(')) {
      // Extract RGB values from rgb() format
      const rgbMatch = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
      }
    } else if (colorString.startsWith('#')) {
      // Convert hex to RGB
      const hex = colorString.slice(1);
      if (hex.length === 3) {
        // Handle 3-digit hex
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return `${r}, ${g}, ${b}`;
      } else if (hex.length === 6) {
        // Handle 6-digit hex
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return `${r}, ${g}, ${b}`;
      }
    }
    // Fallback to black
    console.warn(`Unsupported color format: ${colorString}, using black`);
    return '0, 0, 0';
  };

  // Get the latest message for visual novel display
  const latestMessage = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    return messages[messages.length - 1];
  }, [messages]);

  // Calculate visual novel text max height
  const getVNTextMaxHeight = () => {
    // 减小按钮空间，因为按钮变小了
    const buttonSpace = 16 + 8; // 新的小按钮高度+间距
    const availableHeight = height - topBarHeight - inputHeight - 40 - buttonSpace; // 减少保留空间
    // 增加基础高度
    const baseHeight = Math.min(height * 0.8, 700); // 原来是500，这里改为700
    const expandedHeight = Math.max(availableHeight, 200);
    return vnExpanded ? expandedHeight : baseHeight;
  };

  // Process message content for visual novel display (plain text fallback)
  const processVNContentPlain = (text: string) => {
    if (!text) return '';
    // For plain text only: strip HTML tags and basic markdown markers
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .trim();
    return cleanText;
  };

  if (!latestMessage) {
    return (
      <View style={[styles.container, style]}>
      </View>
    );
  }

  const isUserMessage = latestMessage.sender === 'user';
  const displayName = isUserMessage 
    ? (user?.name || 'You') 
    : (selectedCharacter?.name || 'Assistant');
  
  const contentAnalysis = analyzeMessageContent(latestMessage.text || '');
  const shouldUseWebView = isCompleteHtmlContent(latestMessage.text || '');

  // If this is complete HTML content, render with WebView
  if (shouldUseWebView) {
    // 强制WebView在内容变化时重新挂载
    const webKey = (latestMessage.text || '').length + ':' + String((latestMessage.text || '').charCodeAt(0) || 0);
    return (
      <View style={[styles.container, style, {
        paddingTop: vnExpanded ? 0 : 16,
        paddingBottom: vnExpanded ? 0 : 8, // 减少底部边距，让对话框更贴近输入框
        paddingHorizontal: vnExpanded ? 0 : 16,
      }]}> 
        <View 
          style={[
            styles.vnContainer,
            vnExpanded && styles.vnContainerExpanded,
            {
              backgroundColor: `rgba(${extractRgbValues(uiSettings.vnDialogColor)}, ${uiSettings.vnDialogAlpha})`,
              maxWidth: vnExpanded ? width : MAX_WIDTH,
              marginHorizontal: vnExpanded ? 0 : 8,
              marginBottom: vnExpanded ? 0 : 8, // 减少底部边距
              borderRadius: vnExpanded ? 0 : 16,
              paddingBottom: 24, // 减少按钮预留空间
            }
          ]}
        >


          {/* WebView Content */}
          <View style={[
            styles.webViewContainer,
            { maxHeight: getVNTextMaxHeight() }
          ]}>
            <WebViewRenderer
              key={webKey}
              htmlContent={latestMessage.text}
              maxHeight={getVNTextMaxHeight()}
              onImagePress={onImagePress}
              style={{ backgroundColor: 'transparent' }}
            />
          </View>

          {/* Message Info */}
          <View style={styles.infoContainer}>
            <Text style={[styles.messageInfo, { color: uiSettings.vnTextColor }]}>
              {latestMessage.timestamp ? new Date(latestMessage.timestamp).toLocaleTimeString() : 'Unknown time'}
            </Text>
          </View>

          {/* Expand/Collapse Button 绝对定位到右下角 */}        <TouchableOpacity
          style={styles.expandButtonFixed}
          onPress={() => setVnExpanded(!vnExpanded)}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }} // 减小触摸区域
        >
          <Ionicons
            name={vnExpanded ? 'chevron-up' : 'chevron-down'}
            size={12} // 减小图标尺寸
            color={uiSettings.vnTextColor}
          />
        </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style, {
      paddingTop: vnExpanded ? 0 : 16,
      paddingBottom: vnExpanded ? 0 : 8, // 减少底部边距，让对话框更贴近输入框
      paddingHorizontal: vnExpanded ? 0 : 16,
    }]}> 
      <View 
        style={[
          styles.vnContainer,
          vnExpanded && styles.vnContainerExpanded,
          {
            backgroundColor: `rgba(${extractRgbValues(uiSettings.vnDialogColor)}, ${uiSettings.vnDialogAlpha})`,
            maxWidth: vnExpanded ? width : MAX_WIDTH,
            marginHorizontal: vnExpanded ? 0 : 8,
            marginBottom: vnExpanded ? 0 : 8, // 减少底部边距
            borderRadius: vnExpanded ? 0 : 16,
            paddingBottom: 24, // 减少按钮预留空间
          }
        ]}
      >

        {/* Message Content */}
        <ScrollView
          ref={scrollViewRef}
          style={[
            styles.textContainer,
            { maxHeight: getVNTextMaxHeight() }
          ]}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {(() => {
            // Priority: Markdown -> Plain text fallback
            if (contentAnalysis.hasMarkdown) {
              return (
                <MarkdownRenderer
                  text={latestMessage.text}
                  isUser={isUserMessage}
                  uiSettings={uiSettings}
                  onImagePress={onImagePress}
                />
              );
            }
            const processedContent = processVNContentPlain(latestMessage.text);
            return processedContent ? (
              <Text
                style={{
                  color: uiSettings.vnTextColor,
                  fontSize: 16 * uiSettings.textSizeMultiplier,
                  lineHeight: 24 * uiSettings.textSizeMultiplier,
                }}
              >
                {processedContent}
              </Text>
            ) : (
              <Text style={[styles.emptyText, { color: uiSettings.vnTextColor }]}>
                (Empty message)
              </Text>
            );
          })()}
        </ScrollView>

        {/* Expand/Collapse Button 绝对定位到右下角 */}
        <TouchableOpacity
          style={styles.expandButtonFixed}
          onPress={() => setVnExpanded(!vnExpanded)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={vnExpanded ? 'chevron-up' : 'chevron-down'}
            size={12} // 减小图标尺寸
            color={uiSettings.vnTextColor}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 8, // 减少容器内边距
  },
  vnContainer: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 8,
    marginBottom: 20,
    minHeight: 220,
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  vnContainerExpanded: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 0,
    margin: 0,
    maxWidth: '100%',
    alignSelf: 'stretch',
    minHeight: '100%',
  },
  nameContainer: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
  },
  characterName: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  textContainer: {
    flex: 1,
    marginBottom: 12,
  },
  webViewContainer: {
    flex: 1,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  expandButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  expandButtonFixed: {
    position: 'absolute',
    right: 8, // 更靠近右边缘
    bottom: 8, // 更靠近底部边缘
    width: 16, // 减小到原来的1/3
    height: 16, // 减小到原来的1/3
    borderRadius: 8, // 相应调整圆角
    backgroundColor: 'rgba(0,0,0,0.4)', // 增加背景透明度以便更好看见
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
  },
  infoContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  messageInfo: {
    fontSize: 12,
    opacity: 0.7,
  },
  emptyText: {
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: 0.7,
  },
});

export default VisualNovelDialog;
