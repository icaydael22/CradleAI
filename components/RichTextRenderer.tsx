import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { parseHtmlToReactNative } from '@/utils/htmlParser';
import ImageManager from '@/utils/ImageManager';

interface RichTextRendererProps {
  html: string;
  baseStyle?: any;
  onImagePress?: (url: string) => void;
  onLinkPress?: (url: string) => void;
  maxImageHeight?: number;
  uiSettings?: {
    markdownTextColor?: string;
    markdownBoldColor?: string;
    markdownCodeTextColor?: string;
    markdownCodeBackgroundColor?: string;
    markdownCodeScale?: number;
    markdownTextScale?: number;
    markdownHeadingColor?: string;
    markdownQuoteColor?: string;
    markdownQuoteBackgroundColor?: string;
    markdownLinkColor?: string;
  };
}

const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  html,
  baseStyle = {},
  onImagePress,
  onLinkPress,
  maxImageHeight = 300,
  uiSettings = {},
}) => {
  // 只渲染 HTML，不做 markdown 检测和渲染
  if (!html || html.trim() === '') {
    return <Text style={[styles.emptyText, baseStyle]}>(No content)</Text>;
  }

  // SafeURL handler for links
  const handleLinkPress = useCallback((url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
      console.warn('Blocked unsafe URL protocol:', url);
      return;
    }
    if (onLinkPress) {
      onLinkPress(url);
      return;
    }
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          console.warn('Cannot open URL:', url);
        }
      })
      .catch((err) => console.error('Error opening URL:', err));
  }, [onLinkPress]);

  // SafeImage handler with error handling
  const handleImagePress = useCallback((url: string) => {
    if (url.startsWith('image:')) {
      const imageId = url.substring(6);
      const imageInfo = ImageManager.getImageInfo(imageId);
      if (imageInfo) {
        if (onImagePress) {
          onImagePress(imageInfo.originalPath);
        }
        return;
      }
    }
    if (onImagePress) {
      onImagePress(url);
    }
  }, [onImagePress]);

  try {
    return (
      <View style={styles.container}>
        {parseHtmlToReactNative(html, {
          baseStyle,
          handleLinkPress,
          handleImagePress,
          maxImageHeight,
          uiSettings,
        })}
      </View>
    );
  } catch (error) {
    console.error('Error rendering HTML content:', error);
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error rendering content</Text>
        <Text style={[styles.rawText, baseStyle]}>
          {html.length > 300 ? html.substring(0, 300) + '...' : html}
        </Text>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  errorContainer: {
    padding: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 5,
    marginVertical: 5,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    marginBottom: 8,
  },
  rawText: {
    color: '#999',
    fontSize: 12,
    marginTop: 5,
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    fontSize: 14,
    padding: 8,
  },
});

export default RichTextRenderer;
