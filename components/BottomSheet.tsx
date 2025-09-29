import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  PanResponder,
  TouchableOpacity,
  Text,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/theme';

const { height } = Dimensions.get('window');

interface BottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  snapPoints?: number[]; // Heights in percentages (0-100)
  children: React.ReactNode;
  blurBackground?: boolean;
  closeOnBackdropPress?: boolean;
  showHandle?: boolean;
  disableGesture?: boolean;
  backgroundOpacity?: number;
  title?: string;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  isVisible,
  onClose,
  snapPoints = [50], // Default to 50% height
  children,
  blurBackground = true,
  closeOnBackdropPress = true,
  showHandle = true,
  disableGesture = false,
  backgroundOpacity = 0.5,
  title,
}) => {
  // Animation values
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  
  // Current snap point
  const currentSnapPoint = useRef(snapPoints[0]).current;
  
  // Calculate sheet height based on snap points
  const sheetHeight = height * (currentSnapPoint / 100);
  
  // Define pan responder for drag gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disableGesture,
      onMoveShouldSetPanResponder: () => !disableGesture,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          // Only allow dragging down
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If dragged down past 20% of the height, close the sheet
        if (gestureState.dy > sheetHeight * 0.2) {
          closeSheet();
        } else {
          // Otherwise snap back to the current snap point
          Animated.spring(translateY, {
            toValue: 0,
            tension: 50,
            friction: 12,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Open and close animations
  useEffect(() => {
    if (isVisible) {
      openSheet();
    } else {
      closeSheet();
    }
  }, [isVisible]);

  const openSheet = () => {
    // Reset translateY to bottom of screen before animation
    translateY.setValue(height);
    
    // Animate backdrop opacity and sheet position
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: backgroundOpacity,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        tension: 50,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={closeSheet}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={closeOnBackdropPress ? closeSheet : undefined}>
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropOpacity },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.container,
          {
            height: sheetHeight,
            transform: [{ translateY }],
          },
        ]}
        {...(disableGesture ? {} : panResponder.panHandlers)}
      >
        {blurBackground ? (
          <BlurView intensity={20} tint="dark" style={styles.blur}>
            <SheetContent 
              showHandle={showHandle} 
              onClose={closeSheet} 
              title={title}
            >
              {children}
            </SheetContent>
          </BlurView>
        ) : (
          <SheetContent 
            showHandle={showHandle} 
            onClose={closeSheet} 
            title={title}
          >
            {children}
          </SheetContent>
        )}
      </Animated.View>
    </Modal>
  );
};

// Separate component for the content
const SheetContent = ({ 
  children, 
  showHandle, 
  onClose, 
  title 
}: { 
  children: React.ReactNode; 
  showHandle: boolean; 
  onClose: () => void;
  title?: string;
}) => (
  <View style={styles.content}>
    {showHandle && <View style={styles.handle} />}
    
    {title && (
      <View style={styles.header}>
        <Text style={styles.titleText}>{title}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <View style={styles.closeButtonInner}>
            <Text style={styles.closeButtonText}>×</Text>
          </View>
        </TouchableOpacity>
      </View>
    )}
    
    <View style={styles.childrenContainer}>
      {children}
    </View>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  blur: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 0,
  },
  closeButtonInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  childrenContainer: {
    flex: 1,
  },
});

export default BottomSheet;