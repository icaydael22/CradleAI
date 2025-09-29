import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { theme } from '@/constants/theme';

type BadgeType = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  text: string;
  type?: BadgeType;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  textStyle?: TextStyle;
  count?: number;
  dot?: boolean;
  outlined?: boolean;
}

const Badge: React.FC<BadgeProps> = ({
  text,
  type = 'default',
  size = 'medium',
  style,
  textStyle,
  count,
  dot = false,
  outlined = false,
}) => {
  const getBackgroundColor = () => {
    if (outlined) return 'transparent';
    
    switch (type) {
      case 'primary':
        return theme.colors.primary;
      case 'success':
        return theme.colors.success;
      case 'warning':
        return theme.colors.warning;
      case 'danger':
        return theme.colors.danger;
      default:
        return theme.colors.backgroundSecondary;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'primary':
        return theme.colors.primary;
      case 'success':
        return theme.colors.success;
      case 'warning':
        return theme.colors.warning;
      case 'danger':
        return theme.colors.danger;
      default:
        return theme.colors.textSecondary;
    }
  };

  const getTextColor = () => {
    if (outlined) {
      return getBorderColor();
    }

    switch (type) {
      case 'primary':
      case 'success':
      case 'warning':
      case 'danger':
        return '#282828'; // Dark text for light backgrounds
      default:
        return theme.colors.text;
    }
  };

  const getSizeStyle = (): { container: ViewStyle; text: TextStyle } => {
    switch (size) {
      case 'small':
        return {
          container: {
            paddingVertical: 2,
            paddingHorizontal: dot ? 6 : 6,
            borderRadius: 10,
          },
          text: {
            fontSize: 10,
          },
        };
      case 'large':
        return {
          container: {
            paddingVertical: 6,
            paddingHorizontal: dot ? 10 : 12,
            borderRadius: 16,
          },
          text: {
            fontSize: 14,
          },
        };
      default:
        return {
          container: {
            paddingVertical: 4,
            paddingHorizontal: dot ? 8 : 8,
            borderRadius: 12,
          },
          text: {
            fontSize: 12,
          },
        };
    }
  };

  const sizeStyle = getSizeStyle();

  return (
    <View
      style={[
        styles.container,
        sizeStyle.container,
        {
          backgroundColor: getBackgroundColor(),
          borderWidth: outlined ? 1 : 0,
          borderColor: outlined ? getBorderColor() : undefined,
        },
        style,
      ]}
    >
      {dot ? (
        <View style={[styles.dot, { backgroundColor: getBorderColor() }]} />
      ) : count !== undefined ? (
        <Text
          style={[
            styles.text,
            sizeStyle.text,
            {
              color: getTextColor(),
            },
            textStyle,
          ]}
        >
          {count > 99 ? '99+' : count}
        </Text>
      ) : (
        <Text
          style={[
            styles.text,
            sizeStyle.text,
            {
              color: getTextColor(),
            },
            textStyle,
          ]}
        >
          {text}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default Badge;