import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImageManager, ImageInfo } from '@/utils/ImageManager';

interface GeneratedImage {
  id: string;
  prompt: string;
  timestamp: number;
}

interface GeneratedImageItemProps {
  image: GeneratedImage;
  onImagePress: (id: string) => void;
  onDeletePress: (id: string) => void;
  onSavePress: (id: string) => void;
  onSharePress: (id: string) => void;
}

const GeneratedImageItem: React.FC<GeneratedImageItemProps> = ({
  image,
  onImagePress,
  onDeletePress,
  onSavePress,
  onSharePress,
}) => {
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchImageInfo = async () => {
      setIsLoading(true);
      try {
        const manager = ImageManager.getInstance();
        const info = manager.getImageInfo(image.id);
        if (info) {
          setImageInfo(info);
        } else {
          console.warn(`[GeneratedImageItem] No image info found for ID: ${image.id}`);
        }
      } catch (error) {
        console.error(`[GeneratedImageItem] Error fetching image info:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImageInfo();
  }, [image.id]);

  const imageUri = imageInfo?.thumbnailPath || imageInfo?.originalPath;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => onImagePress(image.id)} style={styles.imageContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#888" />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#888" />
            <Text style={styles.errorText}>Image not available</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.infoContainer}>
        <Text style={styles.promptText} numberOfLines={2}>
          {image.prompt}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onSavePress(image.id)}>
            <Ionicons name="download-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => onSharePress(image.id)}>
            <Ionicons name="share-social-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDeletePress(image.id)}>
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 12,
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
    maxWidth: 320,
    width: '100%',
  },
  imageContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.5)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    padding: 12,
  },
  promptText: {
    color: '#e0e0e0',
    fontSize: 14,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 15,
    padding: 6,
    marginLeft: 8,
  },
  deleteButton: {
    backgroundColor: 'rgba(220, 53, 69, 0.7)',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#888',
    marginTop: 8,
  },
});

export default GeneratedImageItem;