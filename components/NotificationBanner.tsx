import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Easing,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationBannerProps {
  message: string;
  type?: NotificationType;
  duration?: number;
  onDismiss?: () => void;
  autoHide?: boolean;
  style?: ViewStyle;
}

const NotificationBanner: React.FC<NotificationBannerProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onDismiss,
  autoHide = true,
  style,
}) => {
  const [visible, setVisible] = useState(true);
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Auto-hide after duration
      if (autoHide) {
        const hideTimer = setTimeout(hide, duration);
        return () => clearTimeout(hideTimer);
      }
    }
  }, [visible]);
  
  const hide = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    });
  };
  
  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { 
          icon: 'checkmark-circle',
          color: theme.colors.success,
          bgColor: 'rgba(80, 200, 120, 0.15)'
        };
      case 'error':
        return { 
          icon: 'alert-circle', 
          color: theme.colors.danger,
          bgColor: 'rgba(255, 68, 68, 0.15)'
        };
      case 'warning':
        return { 
          icon: 'warning', 
          color: theme.colors.warning,
          bgColor: 'rgba(255, 165, 0, 0.15)'
        };
      case 'info':
      default:
        return { 
          icon: 'information-circle',
          color: theme.colors.info,
          bgColor: 'rgba(100, 210, 255, 0.15)'
        };
    }
  };
  
  const { icon, color, bgColor } = getIconAndColor();
  
  if (!visible) return null;
  
  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: bgColor
        },
        style,
      ]}
    >
      <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
        <View style={styles.content}>
          <Ionicons name={icon as any} size={24} color={color} style={styles.icon} />
          <Text style={styles.message}>{message}</Text>
          
          <TouchableOpacity style={styles.closeButton} onPress={hide}>
            <Ionicons name="close" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    margin: 16,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 1000,
  },
  blurContainer: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
});

export default NotificationBanner;
