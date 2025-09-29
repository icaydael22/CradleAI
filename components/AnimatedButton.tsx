import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  Animated,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface AnimatedButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: string; // Ionicons name
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  testID?: string;
}

const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  testID,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Animation functions
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      friction: 8,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 400,
      useNativeDriver: true,
    }).start();
  };

  // Generate style based on variant
  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryButton;
      case 'danger':
        return styles.dangerButton;
      case 'outline':
        return styles.outlineButton;
      case 'ghost':
        return styles.ghostButton;
      default:
        return styles.primaryButton;
    }
  };

  // Generate text style based on variant
  const getTextVariantStyle = () => {
    switch (variant) {
      case 'outline':
      case 'ghost':
        return { color: theme.colors.primary };
      case 'danger':
        return { color: '#fff' };
      case 'secondary':
        return { color: '#282828' };
      default:
        return { color: '#282828' };
    }
  };

  // Generate size style
  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.smallButton;
      case 'large':
        return styles.largeButton;
      default:
        return {};
    }
  };

  // Generate disabled style
  const getDisabledStyle = () => {
    if (variant === 'outline' || variant === 'ghost') {
      return { opacity: 0.5 };
    }
    return styles.disabledButton;
  };

  return (
    <Animated.View
      style={[
        styles.container,
        fullWidth && styles.fullWidth,
        { transform: [{ scale: disabled ? 1 : scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.button,
          getVariantStyle(),
          getSizeStyle(),
          fullWidth && styles.fullWidth,
          disabled && getDisabledStyle(),
          style,
        ]}
        onPress={onPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled || loading}
        testID={testID}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={variant === 'outline' || variant === 'ghost' 
              ? theme.colors.primary 
              : (variant === 'primary' ? '#282828' : '#fff')
            } 
          />
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <Ionicons
                name={icon as any}
                size={size === 'small' ? 16 : 20}
                color={
                  variant === 'outline' || variant === 'ghost'
                    ? theme.colors.primary
                    : variant === 'primary' 
                      ? '#282828' 
                      : '#fff'
                }
                style={styles.leftIcon}
              />
            )}
            <Text
              style={[
                styles.text,
                size === 'small' ? styles.smallText : size === 'large' ? styles.largeText : {},
                getTextVariantStyle(),
                textStyle,
              ]}
            >
              {title}
            </Text>
            {icon && iconPosition === 'right' && (
              <Ionicons
                name={icon as any}
                size={size === 'small' ? 16 : 20}
                color={
                  variant === 'outline' || variant === 'ghost'
                    ? theme.colors.primary
                    : variant === 'primary' 
                      ? '#282828' 
                      : '#fff'
                }
                style={styles.rightIcon}
              />
            )}
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Just a wrapper for animation
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: theme.colors.info,
  },
  dangerButton: {
    backgroundColor: theme.colors.danger,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  largeButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  smallText: {
    fontSize: 14,
  },
  largeText: {
    fontSize: 18,
  },
  fullWidth: {
    width: '100%',
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
});

export default AnimatedButton;
