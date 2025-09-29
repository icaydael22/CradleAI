import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  isVisible: boolean;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

const ImageViewer: React.FC<ImageViewerProps> = ({
  images,
  initialIndex,
  isVisible,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar hidden />
        
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: images[currentIndex] }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>
        
        {images.length > 1 && (
          <View style={styles.navigation}>
            {currentIndex > 0 && (
              <TouchableOpacity style={styles.navButton} onPress={handlePrev}>
                <Ionicons name="chevron-back" size={36} color="#fff" />
              </TouchableOpacity>
            )}
            
            {currentIndex < images.length - 1 && (
              <TouchableOpacity style={styles.navButton} onPress={handleNext}>
                <Ionicons name="chevron-forward" size={36} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* Image counter */}
        {images.length > 1 && (
          <View style={styles.counter}>
            <View style={styles.counterContainer}>
              <Ionicons name="images-outline" size={16} color="#fff" />
              <View style={styles.counterText}>
                {`${currentIndex + 1} / ${images.length}`}
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  imageContainer: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height * 0.8,
  },
  navigation: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 10,
  },
  navButton: {
    padding: 10,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  counter: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  counterText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
  },
});

export default ImageViewer;
