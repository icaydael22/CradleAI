import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string; // Ionicons name
  iconPosition?: 'left' | 'right';
  color?: string;
  textColor?: string;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  rounded?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  loadingColor?: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  color = theme.colors.primary,
  textColor = '#FFF',
  size = 'medium',
  fullWidth = false,
  rounded = false,
  style,
  textStyle,
  loadingColor,
}) => {
  const buttonSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.buttonSmall;
      case 'large':
        return styles.buttonLarge;
      case 'medium':
      default:
        return styles.buttonMedium;
    }
  };

  const textSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.textSmall;
      case 'large':
        return styles.textLarge;
      case 'medium':
      default:
        return styles.textMedium;
    }
  };

  const buttonStyles = [
    styles.button,
    buttonSizeStyle(),
    { backgroundColor: color },
    fullWidth && styles.fullWidth,
    rounded && styles.rounded,
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    textSizeStyle(),
    { color: textColor },
    textStyle,
  ];

  const iconSize = size === 'small' ? 16 : size === 'large' ? 24 : 20;

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={loadingColor || textColor}
          style={styles.loader}
        />
      ) : (
        <View style={styles.contentContainer}>
          {icon && iconPosition === 'left' && (
            <Ionicons
              name={icon as any}
              size={iconSize}
              color={textColor}
              style={styles.iconLeft}
            />
          )}
          <Text style={textStyles}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Ionicons
              name={icon as any}
              size={iconSize}
              color={textColor}
              style={styles.iconRight}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderRadius: 8,
  },
  buttonSmall: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 80,
  },
  buttonMedium: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 120,
  },
  buttonLarge: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    minWidth: 150,
  },
  fullWidth: {
    width: '100%',
  },
  rounded: {
    borderRadius: 50,
  },
  disabled: {
    opacity: 0.6,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  textSmall: {
    fontSize: 14,
  },
  textMedium: {
    fontSize: 16,
  },
  textLarge: {
    fontSize: 18,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  loader: {
    marginHorizontal: 8,
  },
});

export default ActionButton;