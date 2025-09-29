import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');
const MAX_IMAGE_HEIGHT = Math.min(300, height * 0.4);
const DEFAULT_IMAGE_WIDTH = Math.min(240, width * 0.6);
const DEFAULT_IMAGE_HEIGHT = Math.min(360, height * 0.5);

interface ImageMessageRendererProps {
  text: string;
  onImagePress?: (url: string) => void;
  maxImageHeight?: number;
  getCachedImageInfo?: (imageId: string) => any;
  handleOpenFullscreenImage?: (imageId: string) => void;
}

const getImageDisplayStyle = (imageInfo?: any) => {
  let width = DEFAULT_IMAGE_WIDTH;
  let height = DEFAULT_IMAGE_HEIGHT;
  if (imageInfo && imageInfo.originalPath) {
    if (imageInfo.width && imageInfo.height) {
      const maxW = 260;
      const maxH = MAX_IMAGE_HEIGHT;
      const ratio = imageInfo.width / imageInfo.height;
      if (ratio > 1) {
        width = maxW;
        height = Math.round(maxW / ratio);
      } else {
        height = maxH;
        width = Math.round(maxH * ratio);
      }
    } else {
      width = 208;
      height = 304;
    }
  }
  return {
    width,
    height,
    maxWidth: Math.min(320, width * 0.8),
    maxHeight: MAX_IMAGE_HEIGHT,
    borderRadius: 8,
    backgroundColor: 'rgba(42, 42, 42, 0.5)',
    alignSelf: 'center' as const,
  };
};

const ImageMessageRenderer: React.FC<ImageMessageRendererProps> = ({
  text,
  onImagePress,
  maxImageHeight = MAX_IMAGE_HEIGHT,
  getCachedImageInfo,
  handleOpenFullscreenImage,
}) => {
  // Handle raw image pattern
  const rawImageMarkdownRegex = /!\[(.*?)\]\(image:([a-zA-Z0-9\-_]+)\)/;
  const rawImageMatch = text.trim().match(rawImageMarkdownRegex);
  
  if (rawImageMatch) {
    const alt = rawImageMatch[1] || "图片";
    const imageId = rawImageMatch[2];

    if (getCachedImageInfo) {
      const imageInfo = getCachedImageInfo(imageId);
      const imageStyle = getImageDisplayStyle(imageInfo);

      if (imageInfo) {
        return (
          <View style={styles.imageWrapper}>
            <TouchableOpacity
              style={styles.imageContainer}
              onPress={() => handleOpenFullscreenImage?.(imageId)}
            >
              <Image
                source={{ uri: imageInfo.originalPath }}
                style={imageStyle}
                resizeMode="contain"
                onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.originalPath)}
              />
            </TouchableOpacity>
            <Text style={styles.imageCaption}>{alt}</Text>
          </View>
        );
      } else {
        console.error(`No image info found for ID: ${imageId}`);
        return (
          <View style={styles.imageError}>
            <Ionicons name="alert-circle" size={36} color="#e74c3c" />
            <Text style={styles.imageErrorText}>图片无法加载 (ID: {imageId.substring(0, 8)}...)</Text>
          </View>
        );
      }
    }
  }

  // Handle multiple images with IDs
  const imageIdRegex = /!\[(.*?)\]\(image:([^\s)]+)\)/g;
  let match: RegExpExecArray | null;
  const matches: { alt: string, id: string }[] = [];

  while ((match = imageIdRegex.exec(text)) !== null) {
    matches.push({
      alt: match[1] || "图片",
      id: match[2]
    });
  }

  if (matches.length > 0 && getCachedImageInfo && handleOpenFullscreenImage) {
    console.log(`[ImageMessageRenderer] Found ${matches.length} image references in message`);
    return (
      <View>
        {matches.map((img, idx) => {
          console.log(`[ImageMessageRenderer] Processing image ${idx+1}/${matches.length}, ID: ${img.id.substring(0, 8)}...`);
          const imageInfo = getCachedImageInfo(img.id);
          const imageStyle = getImageDisplayStyle(imageInfo);
          if (imageInfo) {
            console.log(`[ImageMessageRenderer] Image info found, path: ${imageInfo.originalPath}`);
            return (
              <TouchableOpacity 
                key={img.id + '-' + idx}
                style={styles.imageWrapper}
                onPress={() => handleOpenFullscreenImage(img.id)}
              >
                <Image
                  source={{ uri: imageInfo.originalPath }}
                  style={imageStyle}
                  resizeMode="contain"
                  onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.originalPath)}
                />
                <Text style={styles.imageCaption}>{img.alt}</Text>
              </TouchableOpacity>
            );
          } else {
            console.error(`[ImageMessageRenderer] No image info found for ID: ${img.id}`);
            return (
              <View key={idx} style={styles.imageError}>
                <Ionicons name="alert-circle" size={36} color="#e74c3c" />
                <Text style={styles.imageErrorText}>图片无法加载 (ID: {img.id.substring(0, 8)}...)</Text>
              </View>
            );
          }
        })}
      </View>
    );
  }

  // Handle image URLs
  const imageMarkdownRegex = /!\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+|image:[^\s)]+)\)/g;
  let urlMatches: { alt: string, url: string }[] = [];
  imageMarkdownRegex.lastIndex = 0;

  while ((match = imageMarkdownRegex.exec(text)) !== null) {
    urlMatches.push({
      alt: match[1] || "图片",
      url: match[2]
    });
  }

  if (urlMatches.length > 0) {
    return (
      <View>
        {urlMatches.map((img, idx) => {
          const isImageId = img.url.startsWith('image:');
          const isDataUrl = img.url.startsWith('data:');
          const isLargeDataUrl = isDataUrl && img.url.length > 100000;

          // Handle image: prefix (local image ID)
          if (isImageId && getCachedImageInfo && handleOpenFullscreenImage) {
            const imageId = img.url.substring(6); // Remove 'image:' prefix
            const imageInfo = getCachedImageInfo(imageId);
            const imageStyle = getImageDisplayStyle(imageInfo);
            
            if (imageInfo) {
              return (
                <TouchableOpacity 
                  key={idx}
                  style={styles.imageWrapper}
                  onPress={() => handleOpenFullscreenImage(imageId)}
                >
                  <Image
                    source={{ uri: imageInfo.originalPath }}
                    style={imageStyle}
                    resizeMode="contain"
                    onError={(e) => console.error(`Error loading image: ${e.nativeEvent.error}`, imageInfo.originalPath)}
                  />
                  <Text style={styles.imageCaption}>{img.alt}</Text>
                </TouchableOpacity>
              );
            } else {
              console.error(`No image info found for ID: ${imageId}`);
              return (
                <View key={idx} style={styles.imageError}>
                  <Ionicons name="alert-circle" size={36} color="#e74c3c" />
                  <Text style={styles.imageErrorText}>图片无法加载 (ID: {imageId.substring(0, 8)}...)</Text>
                </View>
              );
            }
          }

          if (isLargeDataUrl) {
            return (
              <View key={idx} style={styles.imageWrapper}>
                <TouchableOpacity
                  style={styles.imageDataUrlWarning}
                  onPress={() => onImagePress?.(img.url)}
                >
                  <Ionicons name="image" size={36} color="#999" />
                  <Text style={styles.imageDataUrlWarningText}>
                    {img.alt} (点击查看)
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }

          return (
            <TouchableOpacity 
              key={idx}
              style={styles.imageWrapper}
              onPress={() => onImagePress?.(img.url)}
            >
              <Image
                source={{ uri: img.url }}
                style={styles.messageImage}
                resizeMode="contain"
                onError={(e) => console.error(`Error loading image URL: ${e.nativeEvent.error}`)}
              />
              <Text style={styles.imageCaption}>{img.alt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Handle regular links
  const linkRegex = /\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
  let linkMatches: { text: string, url: string }[] = [];

  while ((match = linkRegex.exec(text)) !== null) {
    linkMatches.push({
      text: match[1],
      url: match[2]
    });
  }

  if (linkMatches.length > 0) {
    return (
      <View>
        {linkMatches.map((link, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.linkButton}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.open(link.url, '_blank');
              } else {
                onImagePress?.(link.url);
              }
            }}
          >
            <Ionicons name="link" size={16} color="#3498db" style={styles.linkIcon} />
            <Text style={styles.linkText}>{link.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // If no images or links found, return null (will be handled by parent)
  return null;
};

const styles = StyleSheet.create({
  imageWrapper: {
    marginVertical: 8,
    alignItems: 'center',
  },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  messageImage: {
    width: DEFAULT_IMAGE_WIDTH,
    height: DEFAULT_IMAGE_HEIGHT,
    borderRadius: 8,
  },
  imageCaption: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
    textAlign: 'center',
  },
  imageError: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 8,
    marginVertical: 8,
  },
  imageErrorText: {
    color: '#e74c3c',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  imageDataUrlWarning: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(153, 153, 153, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#999',
    borderStyle: 'dashed',
  },
  imageDataUrlWarningText: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginVertical: 4,
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  linkIcon: {
    marginRight: 8,
  },
  linkText: {
    color: '#3498db',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

export default ImageMessageRenderer;
