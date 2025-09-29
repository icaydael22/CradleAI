import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Modal,
  Easing,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface LoadingIndicatorProps {
  visible: boolean;
  text?: string;
  type?: 'spinner' | 'dots' | 'animated' | 'progress';
  progress?: number;  // 0 to 100
  overlay?: boolean;  // 是否显示半透明背景
  useModal?: boolean; // 是否使用Modal
  color?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  visible,
  text = '加载中...',
  type = 'spinner',
  progress = 0,
  overlay = false,
  useModal = false,
  color = theme.colors.primary,
  size = 'large',
  style,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // For animated spinner
      if (type === 'animated') {
        Animated.loop(
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ).start();
      }
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      rotateAnim.setValue(0);
    };
  }, [visible, fadeAnim, rotateAnim, type]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderLoadingIndicator = () => {
    switch (type) {
      case 'dots':
        return (
          <View style={styles.dotsContainer}>
            <Animated.View style={[styles.dot, { backgroundColor: color }]} />
            <Animated.View
              style={[
                styles.dot,
                { backgroundColor: color, marginHorizontal: 6 },
              ]}
            />
            <Animated.View style={[styles.dot, { backgroundColor: color }]} />
          </View>
        );
      case 'animated':
        return (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="sync-outline" size={40} color={color} />
          </Animated.View>
        );
      case 'progress':
        return (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { 
                    width: `${progress}%`,
                    backgroundColor: color
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{`${Math.round(progress)}%`}</Text>
          </View>
        );
      case 'spinner':
      default:
        return <ActivityIndicator size={size} color={color} />;
    }
  };

  const content = (
    <Animated.View
      style={[
        styles.container,
        overlay && styles.overlay,
        { opacity: fadeAnim },
        style,
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {overlay && (
        <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.loadingWrapper}>
        {renderLoadingIndicator()}
        {text && <Text style={styles.text}>{text}</Text>}
      </View>
    </Animated.View>
  );

  if (!visible) {
    return null;
  }

  if (useModal) {
    return (
      <Modal transparent visible={visible} animationType="fade">
        {content}
      </Modal>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 999,
  },
  loadingWrapper: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(40, 40, 40, 0.85)',
    minWidth: 120,
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 20,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.7,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    marginVertical: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default LoadingIndicator;
