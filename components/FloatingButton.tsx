import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ViewStyle,
  Text,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface FloatingButtonAction {
  icon: string; // Ionicons name
  label?: string;
  color?: string;
  onPress: () => void;
}

interface FloatingButtonProps {
  actions?: FloatingButtonAction[];
  icon?: string; // Ionicons name
  color?: string;
  size?: number;
  position?: 'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft';
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  showLabel?: boolean;
  shadow?: boolean;
  testID?: string;
}

const FloatingButton: React.FC<FloatingButtonProps> = ({
  actions,
  icon = 'add',
  color = theme.colors.primary,
  size = 56,
  position = 'bottomRight',
  onPress,
  style,
  disabled = false,
  showLabel = true,
  shadow = true,
  testID,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(1)).current;

  // Position styles
  const getPositionStyle = () => {
    switch (position) {
      case 'bottomLeft':
        return { bottom: 20, left: 20 };
      case 'topRight':
        return { top: 20, right: 20 };
      case 'topLeft':
        return { top: 20, left: 20 };
      case 'bottomRight':
      default:
        return { bottom: 20, right: 20 };
    }
  };

  // Handle button press
  const handlePress = () => {
    if (actions && actions.length > 0) {
      toggleMenu();
    } else if (onPress) {
      onPress();
      
      // Animate button press
      Animated.sequence([
        Animated.timing(scaleAnimation, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimation, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  // Toggle actions menu
  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;

    Animated.timing(animation, {
      toValue,
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();

    setIsOpen(!isOpen);
  };

  // Rotation animation for the main button icon
  const rotateInterpolate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <View style={[styles.container, getPositionStyle(), style]} testID={testID}>
      {/* Action buttons */}
      {actions && isOpen && (
        <View style={styles.actionsContainer}>
          {actions.map((action, index) => {
            // Animation delay for each action button
            const actionAnimation = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [100, 0],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.actionContainer,
                  {
                    marginBottom: 16,
                    opacity: animation,
                    transform: [
                      { scale: animation },
                      { translateY: actionAnimation },
                    ],
                  },
                ]}
              >
                {showLabel && action.label && (
                  <View style={styles.labelContainer}>
                    <Text style={styles.label}>{action.label}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    {
                      width: size * 0.8,
                      height: size * 0.8,
                      borderRadius: (size * 0.8) / 2,
                      backgroundColor: action.color || color,
                    },
                    shadow && styles.shadow,
                  ]}
                  onPress={() => {
                    action.onPress();
                    toggleMenu();
                  }}
                  disabled={disabled}
                >
                  <Ionicons
                    name={action.icon as any}
                    size={size * 0.4}
                    color="#282828"
                  />
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Main button */}
      <Animated.View
        style={[
          {
            transform: [
              { scale: scaleAnimation },
              ...(actions && actions.length > 0 ? [{ rotate: rotateInterpolate }] : []),
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
            },
            shadow && styles.shadow,
            disabled && styles.disabled,
          ]}
          onPress={handlePress}
          disabled={disabled}
        >
          <Ionicons name={icon as any} size={size * 0.5} color="#282828" />
        </TouchableOpacity>
      </Animated.View>

      {/* Background overlay */}
      {isOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          onPress={toggleMenu}
          activeOpacity={1}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 10,
    alignItems: 'center',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 6,
  },
  disabled: {
    opacity: 0.6,
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 72, // Adjust based on main button size
    alignItems: 'center',
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(50, 50, 50, 0.95)',
    marginRight: 8,
  },
  label: {
    color: '#fff',
    fontSize: 14,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: -1,
  },
});

export default FloatingButton;
