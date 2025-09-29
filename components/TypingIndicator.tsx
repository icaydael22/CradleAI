import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { theme } from '@/constants/theme';

interface TypingIndicatorProps {
  isTyping?: boolean;
  bubbleColor?: string;
  dotColor?: string;
  size?: 'small' | 'medium' | 'large';
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  isTyping = true,
  bubbleColor = 'rgba(255, 224, 195, 0.3)',
  dotColor = theme.colors.primary,
  size = 'medium',
}) => {
  // Animation values for each dot
  const dot1Animation = useRef(new Animated.Value(0)).current;
  const dot2Animation = useRef(new Animated.Value(0)).current;
  const dot3Animation = useRef(new Animated.Value(0)).current;

  // Calculate sizes based on the size prop
  const getDimensions = () => {
    switch (size) {
      case 'small':
        return {
          containerWidth: 32,
          containerHeight: 16,
          dotSize: 4,
          spacing: 4,
        };
      case 'large':
        return {
          containerWidth: 70,
          containerHeight: 32,
          dotSize: 8,
          spacing: 8,
        };
      case 'medium':
      default:
        return {
          containerWidth: 50,
          containerHeight: 24,
          dotSize: 6,
          spacing: 6,
        };
    }
  };

  const { containerWidth, containerHeight, dotSize, spacing } = getDimensions();

  // Animation sequence for dots
  useEffect(() => {
    if (!isTyping) {
      // Reset animations when not typing
      dot1Animation.setValue(0);
      dot2Animation.setValue(0);
      dot3Animation.setValue(0);
      return;
    }

    // Staggered animations for each dot
    const createAnimation = (value: Animated.Value, delay: number) => {
      return Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: 300,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 300,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]);
    };

    // Create the animation loop
    const loopAnimation = () => {
      Animated.parallel([
        createAnimation(dot1Animation, 0),
        createAnimation(dot2Animation, 150),
        createAnimation(dot3Animation, 300),
      ]).start(({ finished }) => {
        if (finished) {
          // Only loop if still typing
          if (isTyping) {
            loopAnimation();
          }
        }
      });
    };

    loopAnimation();
  }, [isTyping, dot1Animation, dot2Animation, dot3Animation]);

  if (!isTyping) {
    return null;
  }

  // Translate animated values to styles
  const dot1Style = {
    opacity: 0.5,
    transform: [
      {
        translateY: dot1Animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };

  const dot2Style = {
    opacity: 0.5,
    transform: [
      {
        translateY: dot2Animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };

  const dot3Style = {
    opacity: 0.5,
    transform: [
      {
        translateY: dot3Animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };

  return (
    <View
      style={[
        styles.container,
        {
          width: containerWidth,
          height: containerHeight,
          backgroundColor: bubbleColor,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          dot1Style,
          { width: dotSize, height: dotSize, backgroundColor: dotColor, marginRight: spacing },
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          dot2Style,
          { width: dotSize, height: dotSize, backgroundColor: dotColor, marginRight: spacing },
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          dot3Style,
          { width: dotSize, height: dotSize, backgroundColor: dotColor },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 8,
  },
  dot: {
    borderRadius: 4,
  },
});

export default TypingIndicator;
