import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Text,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring 
} from 'react-native-reanimated';

export interface Photo {
  id: string;
  uri: string;
  thumbnail?: string; // Optional smaller version for thumbnails
  width?: number;
  height?: number;
  caption?: string;
}

interface PhotoGalleryProps {
  photos: Photo[];
  numColumns?: number;
  onPhotoSelect?: (photo: Photo) => void;
  showViewButton?: boolean;
  allowLightbox?: boolean;
  emptyMessage?: string;
}

const { width, height } = Dimensions.get('window');
const SPACING = 2;

const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  photos,
  numColumns = 3,
  onPhotoSelect,
  showViewButton = true,
  allowLightbox = true,
  emptyMessage = "No photos to display",
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Animation values for lightbox
  const scale = useSharedValue(1);
  
  // Calculate the width of each item based on the number of columns
  const itemSize = (width - (numColumns + 1) * SPACING) / numColumns;
  
  const handlePhotoPress = (photo: Photo) => {
    if (onPhotoSelect) {
      onPhotoSelect(photo);
    } else if (allowLightbox) {
      setSelectedPhoto(photo);
      // Reset scale when opening
      scale.value = 1;
    }
  };
  
  const handleClose = () => {
    setSelectedPhoto(null);
  };

  // Pinch-to-zoom animation style
  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });
  
  const renderItem = ({ item, index }: { item: Photo; index: number }) => (
    <TouchableOpacity
      style={[styles.photoContainer, { width: itemSize, height: itemSize }]}
      onPress={() => handlePhotoPress(item)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.thumbnail || item.uri }}
        style={styles.photo}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
      />
      
      {showViewButton && (
        <View style={styles.viewButton}>
          <BlurView intensity={30} tint="dark" style={styles.blurButton}>
            <Ionicons name="eye" size={16} color="#fff" />
          </BlurView>
        </View>
      )}
      
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
  
  // If no photos available
  if (photos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="images-outline" size={60} color="#666" />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        contentContainerStyle={styles.photosContainer}
        showsVerticalScrollIndicator={false}
      />
      
      {/* Lightbox Modal */}
      <Modal
        visible={selectedPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={handleClose}
          >
            {selectedPhoto && (
              <Animated.Image
                source={{ uri: selectedPhoto.uri }}
                style={[styles.fullImage, animatedImageStyle]}
                resizeMode="contain"
              />
            )}
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
            >
              <BlurView intensity={30} tint="dark" style={styles.blurCloseButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  photosContainer: {
    padding: SPACING,
  },
  photoContainer: {
    margin: SPACING,
    overflow: 'hidden',
    borderRadius: theme.borderRadius.sm,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  viewButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  blurButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackground: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: width,
    height: width,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  blurCloseButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
});

export default PhotoGallery;
