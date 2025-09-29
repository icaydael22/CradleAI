import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';

interface InfoCardProps {
  title: string;
  description?: string;
  icon?: string; // Ionicons name
  iconColor?: string;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  descriptionStyle?: TextStyle;
  onPress?: () => void;
  gradient?: readonly [string, string, ...string[]];
  showRightArrow?: boolean;
  customContent?: React.ReactNode;
  disabled?: boolean;
  testID?: string;
  outlined?: boolean;
}

const InfoCard: React.FC<InfoCardProps> = ({
  title,
  description,
  icon,
  iconColor = theme.colors.primary,
  style,
  titleStyle,
  descriptionStyle,
  onPress,
  gradient = ['rgba(60, 60, 60, 0.8)', 'rgba(50, 50, 50, 0.9)'] as const,
  showRightArrow = false,
  customContent,
  disabled = false,
  testID,
  outlined = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled || !onPress) return;
    
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || !onPress) return;
    
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const containerStyles = [
    styles.container,
    outlined && styles.outlined,
    disabled && styles.disabled,
    style,
  ];

  const content = (
    <>
      <View style={styles.headerRow}>
        {icon && (
          <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
            <Ionicons name={icon as any} size={24} color={iconColor} />
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={[styles.title, titleStyle]} numberOfLines={2}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.description, descriptionStyle]} numberOfLines={3}>
              {description}
            </Text>
          )}
        </View>
        {showRightArrow && (
          <Ionicons 
            name="chevron-forward" 
            size={20} 
            color={theme.colors.textSecondary} 
            style={styles.arrowIcon} 
          />
        )}
      </View>
      {customContent && <View style={styles.customContent}>{customContent}</View>}
    </>
  );

  if (onPress) {
    return (
      <Animated.View
        style={[
          containerStyles, 
          { transform: [{ scale: scaleAnim }] }
        ]}
        testID={testID}
      >
        <TouchableOpacity
          style={styles.touchable}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          activeOpacity={0.8}
        >
          {gradient ? (
            <LinearGradient colors={gradient} style={styles.gradient}>
              {content}
            </LinearGradient>
          ) : (
            content
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={containerStyles} testID={testID}>
      {gradient ? (
        <LinearGradient colors={gradient} style={styles.gradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  outlined: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.6,
  },
  touchable: {
    flex: 1,
  },
  gradient: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  arrowIcon: {
    marginLeft: 12,
  },
  customContent: {
    marginTop: 12,
  },
});

export default InfoCard;
