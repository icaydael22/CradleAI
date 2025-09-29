import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableHighlight,
  Image,
  ViewStyle,
  TextStyle,
  Animated,
  ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import Badge from './Badge';

interface ListItemProps {
  title: string;
  subtitle?: string;
  leftIcon?: string;
  leftIconColor?: string;
  leftImage?: ImageSourcePropType | string;
  rightIcon?: string;
  rightIconColor?: string;
  rightComponent?: React.ReactNode;
  badge?: {
    text: string;
    type?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  };
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
  showSeparator?: boolean;
  chevron?: boolean;
  leftIconBackground?: string;
  highlight?: boolean;
  testID?: string;
  rightText?: string;
  accessibilityLabel?: string;
}

const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  leftIcon,
  leftIconColor = theme.colors.primary,
  leftImage,
  rightIcon,
  rightIconColor = theme.colors.textSecondary,
  rightComponent,
  badge,
  onPress,
  onLongPress,
  disabled = false,
  style,
  titleStyle,
  subtitleStyle,
  showSeparator = true,
  chevron = false,
  leftIconBackground = 'rgba(255, 224, 195, 0.15)',
  highlight = false,
  testID,
  rightText,
  accessibilityLabel,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!disabled && (onPress || onLongPress)) {
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!disabled && (onPress || onLongPress)) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  };

  const renderLeftElement = () => {
    if (leftImage) {
      return (
        <View style={styles.leftImageContainer}>
          <Image
            source={typeof leftImage === 'string' ? { uri: leftImage } : leftImage}
            style={styles.leftImage}
          />
        </View>
      );
    }

    if (leftIcon) {
      return (
        <View
          style={[
            styles.leftIconContainer,
            { backgroundColor: leftIconBackground },
          ]}
        >
          <Ionicons name={leftIcon as any} size={22} color={leftIconColor} />
        </View>
      );
    }

    return null;
  };

  const renderRightElement = () => {
    if (rightComponent) {
      return rightComponent;
    }

    if (badge) {
      return (
        <Badge
          text={badge.text}
          type={badge.type}
          size="small"
        />
      );
    }

    if (rightText) {
      return <Text style={styles.rightText}>{rightText}</Text>;
    }

    if (rightIcon) {
      return <Ionicons name={rightIcon as any} size={22} color={rightIconColor} />;
    }

    if (chevron) {
      return <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />;
    }

    return null;
  };

  const Container = onPress || onLongPress ? TouchableHighlight : View;
  const containerProps = onPress || onLongPress
    ? {
        onPress,
        onLongPress,
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        underlayColor: theme.colors.backgroundSecondary,
        activeOpacity: 0.7,
        disabled,
      }
    : {};

  return (
    <Animated.View
      style={[
        styles.container,
        highlight && styles.highlightContainer,
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <Container
        style={styles.innerContainer}
        {...containerProps}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.content}>
          {renderLeftElement()}

          <View style={styles.textContainer}>
            <Text 
              style={[
                styles.title, 
                disabled && styles.disabledText,
                titleStyle
              ]}
              numberOfLines={subtitle ? 1 : 2}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={[
                  styles.subtitle,
                  disabled && styles.disabledText,
                  subtitleStyle,
                ]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            )}
          </View>

          <View style={styles.rightContainer}>
            {renderRightElement()}
          </View>
        </View>
      </Container>

      {showSeparator && <View style={styles.separator} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  highlightContainer: {
    backgroundColor: 'rgba(255, 224, 195, 0.05)',
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  leftImageContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 16,
  },
  leftImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  rightContainer: {
    marginLeft: 10,
    alignItems: 'flex-end',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginLeft: 16,
  },
  disabledText: {
    color: theme.colors.disabled,
  },
  rightText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
});

export default ListItem;