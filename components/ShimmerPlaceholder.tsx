import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface ShimmerPlaceholderProps {
  width?: number;
  height?: number;
  borderRadius?: number;
  shimmerColors?: readonly [string, string, ...string[]];
  shimmerStyle?: ViewStyle;
  style?: ViewStyle;
  visible?: boolean;
  speed?: number;
  shimmerSize?: number;
  children?: React.ReactNode;
  isReversed?: boolean;
  stopAnimation?: boolean;
  backgroundColorBehindShimmer?: string;
}

const ShimmerPlaceholder: React.FC<ShimmerPlaceholderProps> = ({
  width = '100%',
  height = 15,
  borderRadius = 4,
  shimmerColors = ['#333', '#444', '#333'],
  shimmerStyle,
  style,
  visible = false,
  speed = 800,
  shimmerSize = 100,
  children,
  isReversed = false,
  stopAnimation = false,
  backgroundColorBehindShimmer = '#282828',
}) => {
  // Animation controls
  const shimmerAnimation = useRef(new Animated.Value(0)).current;
  
  // Start the animation loop
  useEffect(() => {
    let animationLoop: Animated.CompositeAnimation;
    
    if (!visible && !stopAnimation) {
      // Reset animation value
      shimmerAnimation.setValue(0);
      
      // Create the animation loop
      animationLoop = Animated.loop(
        Animated.timing(shimmerAnimation, {
          toValue: 1,
          duration: speed,
          useNativeDriver: false,
        })
      );
      
      // Start the animation
      animationLoop.start();
    }
    
    // Cleanup animation on unmount
    return () => {
      if (animationLoop) {
        animationLoop.stop();
      }
    };
  }, [shimmerAnimation, speed, visible, stopAnimation]);
  
  // If the content is visible, render the children
  if (visible) {
    return <>{children}</>;
  }
  
  // Calculate the translation distance
  const translateX = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: isReversed ? [width as number, -shimmerSize] : [-shimmerSize, width as number],
  });
  
  return (
    <View
      style={[
            {
              width: typeof width === 'string' ? '100%' : width,
              height,
              borderRadius,
              backgroundColor: backgroundColorBehindShimmer,
              overflow: 'hidden',
            } as ViewStyle,
            style,
          ]}
    >
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={shimmerColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            {
              width: shimmerSize,
              height: '100%',
            },
            shimmerStyle,
          ]}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Additional styles can be added here
});

export default ShimmerPlaceholder;
