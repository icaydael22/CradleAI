import React, { useState, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  Text,
  StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface PhotoViewerProps {
  visible: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  onSave?: (imageUri: string) => void;
  onShare?: (imageUri: string) => void;
  allowDelete?: boolean;
  onDelete?: (imageUri: string) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 3;

const PhotoViewer: React.FC<PhotoViewerProps> = ({
  visible,
  onClose,
  images,
  initialIndex = 0,
  onSave,
  onShare,
  allowDelete = false,
  onDelete,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Animation values for pan and zoom
  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  
  // Store current values in refs to avoid the getValue() method
  const lastScale = useRef(1);
  const lastPanX = useRef(0);
  const lastPanY = useRef(0);
  
  // Set up listeners to track current values without getValue()
  useRef(
    React.useEffect(() => {
      const panXListener = pan.x.addListener(({value}) => {
        lastPanX.current = value;
      });
      
      const panYListener = pan.y.addListener(({value}) => {
        lastPanY.current = value; 
      });
      
      const scaleListener = scale.addListener(({value}) => {
        lastScale.current = value;
      });
      
      return () => {
        pan.x.removeListener(panXListener);
        pan.y.removeListener(panYListener);
        scale.removeListener(scaleListener);
      };
    }, [])
  ).current;

  // Fade animation for controls
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setLoading(true);
      setImageError(false);
      setShowControls(true);
      pan.setValue({ x: 0, y: 0 });
      scale.setValue(1);
      lastScale.current = 1;
      lastPanX.current = 0;
      lastPanY.current = 0;
      controlsOpacity.setValue(1);
    }
  }, [visible, initialIndex, pan, scale, controlsOpacity]);

  // Pan and zoom responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to two-finger gestures or significant movement
        return (
          gestureState.numberActiveTouches === 2 ||
          Math.abs(gestureState.dx) > 10 ||
          Math.abs(gestureState.dy) > 10
        );
      },
      onPanResponderGrant: () => {
        // Save the current pan and scale values
        pan.extractOffset();
        // Use the stored refs instead of getValue()
        lastPanX.current = lastPanX.current;
        lastPanY.current = lastPanY.current;
        lastScale.current = lastScale.current;
      },
      onPanResponderMove: (_, gestureState) => {
        // Handle pinch to zoom (two fingers)
        if (gestureState.numberActiveTouches === 2) {
          // Calculate distance between touches
          const dist = Math.sqrt(
            Math.pow(gestureState.dx, 2) + Math.pow(gestureState.dy, 2)
          );
          
          // This is a simple approximation of pinch zoom
          // A more accurate implementation would calculate the actual distance between touches
          const newScale = Math.max(
            MIN_SCALE,
            Math.min(lastScale.current + dist / 200, MAX_SCALE)
          );
          
          scale.setValue(newScale);
        } 
        // Handle pan (one finger)
        else {
          pan.setValue({
            x: gestureState.dx,
            y: gestureState.dy,
          });
        }

        // Hide controls while interacting
        toggleControls(false);
      },
      onPanResponderRelease: (_, gestureState) => {
        // When fingers lift, check if we need to snap back or change image
        
        // If scale is near 1, check for horizontal swipe to change image
        if (lastScale.current < 1.2) {
          // Horizontal swipe threshold
          const swipeThreshold = SCREEN_WIDTH * 0.2;
          
          if (gestureState.dx < -swipeThreshold && currentIndex < images.length - 1) {
            // Swipe left to go to next image
            setCurrentIndex(currentIndex + 1);
            resetView();
          } else if (gestureState.dx > swipeThreshold && currentIndex > 0) {
            // Swipe right to go to previous image
            setCurrentIndex(currentIndex - 1);
            resetView();
          } else {
            // No significant swipe, reset position
            resetView();
          }
        } else {
          // If zoomed in, limit panning to image bounds
          limitPan();
        }
        
        // Show controls after a short delay
        setTimeout(() => toggleControls(true), 300);
      },
    })
  ).current;

  // Reset view to initial state
  const resetView = () => {
    Animated.parallel([
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: false,
      }),
    ]).start();
  };

  // Limit panning to image bounds when zoomed in
  const limitPan = () => {
    const currentScale = lastScale.current;
    const maxPanX = Math.max(0, (currentScale * SCREEN_WIDTH - SCREEN_WIDTH) / 2);
    const maxPanY = Math.max(0, (currentScale * SCREEN_HEIGHT - SCREEN_HEIGHT) / 2);
    
    const limitedX = Math.max(-maxPanX, Math.min(maxPanX, lastPanX.current));
    const limitedY = Math.max(-maxPanY, Math.min(maxPanY, lastPanY.current));
    
    Animated.spring(pan, {
      toValue: { x: limitedX, y: limitedY },
      friction: 5,
      tension: 40,
      useNativeDriver: false,
    }).start();
  };

  // Toggle controls visibility
  const toggleControls = (show: boolean) => {
    setShowControls(show);
    Animated.timing(controlsOpacity, {
      toValue: show ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  // Handle single tap
  const handleSingleTap = () => {
    toggleControls(!showControls);
  };

  // Handle double tap to zoom
  const handleDoubleTap = () => {
    if (lastScale.current > 1.5) {
      // If zoomed in, zoom out
      resetView();
    } else {
      // If zoomed out, zoom in to 2x
      Animated.spring(scale, {
        toValue: 2,
        friction: 5,
        tension: 40,
        useNativeDriver: false,
      }).start();
    }
  };

  // Handle navigation to next/previous image
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setLoading(true);
      setImageError(false);
      resetView();
    }
  };

  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setLoading(true);
      setImageError(false);
      resetView();
    }
  };

  const currentImage = images[currentIndex];

  // Transforms for pan and zoom
  const imageStyles = {
    transform: [
      { translateX: pan.x },
      { translateY: pan.y },
      { scale: scale },
    ],
  };

  // For handling double taps
  let lastTap = 0;
  const handleImagePress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap
      handleDoubleTap();
    } else {
      // Single tap
      handleSingleTap();
    }
    lastTap = now;
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <BlurView intensity={90} tint="dark" style={styles.container}>
        {/* Main image viewer */}
        <Animated.View
          style={[styles.imageContainer, { opacity: loading ? 0 : 1 }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.touchableImage}
            onPress={handleImagePress}
          >
            <Animated.Image
              source={{ uri: currentImage }}
              style={[styles.image, imageStyles]}
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setImageError(true);
              }}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}

        {/* Error message */}
        {imageError && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={50} color={theme.colors.danger} />
            <Text style={styles.errorText}>无法加载图片</Text>
          </View>
        )}

        {/* Controls overlay */}
        <Animated.View style={[styles.controlsContainer, { opacity: controlsOpacity }]}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {/* Image counter */}
          <View style={styles.counterContainer}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {images.length}
            </Text>
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomControls}>
            {/* Action buttons */}
            <View style={styles.actionButtons}>
              {onSave && (
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => onSave(currentImage)}
                >
                  <Ionicons name="download-outline" size={24} color="#fff" />
                </TouchableOpacity>
              )}
              
              {onShare && (
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => onShare(currentImage)}
                >
                  <Ionicons name="share-outline" size={24} color="#fff" />
                </TouchableOpacity>
              )}
              
              {allowDelete && onDelete && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => onDelete(currentImage)}
                >
                  <Ionicons name="trash-outline" size={24} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {/* Navigation buttons */}
            <View style={styles.navigationButtons}>
              <TouchableOpacity 
                style={[styles.navButton, currentIndex === 0 && styles.disabledButton]}
                onPress={goToPrevious}
                disabled={currentIndex === 0}
              >
                <Ionicons name="chevron-back" size={30} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.navButton, currentIndex === images.length - 1 && styles.disabledButton]}
                onPress={goToNext}
                disabled={currentIndex === images.length - 1}
              >
                <Ionicons name="chevron-forward" size={30} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  touchableImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'column',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  actionButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  deleteButton: {
    backgroundColor: 'rgba(255, 70, 70, 0.3)',
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  navButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  counterContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
});

export default PhotoViewer;
