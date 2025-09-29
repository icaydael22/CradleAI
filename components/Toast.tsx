import React, { useEffect, useState, useRef } from 'react';
import { Animated, Text, StyleSheet, View, TouchableOpacity, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss?: () => void;
  position?: 'top' | 'bottom';
}

const { width } = Dimensions.get('window');

const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = 'info',
  duration = 3000,
  onDismiss,
  position = 'top',
}) => {
  const [isVisible, setIsVisible] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(position === 'top' ? -100 : 100)).current;
  
  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        })
      ]).start();

      const timer = setTimeout(() => {
        hide();
      }, duration);
      
      return () => clearTimeout(timer);
    } else {
      hide();
    }
  }, [visible]);
  
  const hide = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: position === 'top' ? -100 : 100,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      setIsVisible(false);
      if (onDismiss) onDismiss();
    });
  };
  
  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { 
          iconName: 'checkmark-circle',
          backgroundColor: 'rgba(80, 200, 120, 0.9)',
          textColor: '#fff',
        };
      case 'error':
        return { 
          iconName: 'alert-circle',
          backgroundColor: 'rgba(255, 68, 68, 0.9)',
          textColor: '#fff',
        };
      case 'warning':
        return { 
          iconName: 'warning',
          backgroundColor: 'rgba(255, 165, 0, 0.9)',
          textColor: '#fff',
        };
      case 'info':
      default:
        return { 
          iconName: 'information-circle',
          backgroundColor: 'rgba(64, 150, 255, 0.9)',
          textColor: '#fff',
        };
    }
  };
  
  const { iconName, backgroundColor, textColor } = getIconAndColor();
  
  if (!isVisible) {
    return null;
  }
  
  return (
    <Animated.View
      style={[
        styles.container,
        position === 'top' ? styles.topPosition : styles.bottomPosition,
        { 
          opacity: fadeAnim,
          transform: [{ translateY }],
        }
      ]}
    >
      <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
        <View style={[styles.content, { backgroundColor }]}>
          <Ionicons name={iconName as any} size={24} color={textColor} style={styles.icon} />
          <Text style={[styles.message, { color: textColor }]} numberOfLines={2}>
            {message}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={hide}>
            <Ionicons name="close" size={20} color={textColor} />
          </TouchableOpacity>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
    maxWidth: 500,
    alignSelf: 'center',
    width: width - 32,
  },
  topPosition: {
    top: 50,
  },
  bottomPosition: {
    bottom: 50,
  },
  blurContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    marginLeft: 12,
    padding: 4,
  },
});

export default Toast;
