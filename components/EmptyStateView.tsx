import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ViewStyle,
  ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import ShimmerPlaceholder from './ShimmerPlaceholder';

interface EmptyStateViewProps {
  title?: string;
  message: string;
  icon?: string;
  image?: ImageSourcePropType;
  buttonText?: string;
  onButtonPress?: () => void;
  loading?: boolean;
  style?: ViewStyle;
  type?: 'default' | 'error' | 'info' | 'success' | 'warning';
}

const EmptyStateView: React.FC<EmptyStateViewProps> = ({
  title,
  message,
  icon = 'alert-circle-outline',
  image,
  buttonText,
  onButtonPress,
  loading = false,
  style,
  type = 'default',
}) => {
  // Determine colors based on type
  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          color: theme.colors.danger,
          icon: 'alert-circle-outline',
        };
      case 'success':
        return {
          color: theme.colors.success,
          icon: 'checkmark-circle-outline',
        };
      case 'warning':
        return {
          color: theme.colors.warning,
          icon: 'warning-outline',
        };
      case 'info':
        return {
          color: theme.colors.info,
          icon: 'information-circle-outline',
        };
      default:
        return {
          color: theme.colors.textSecondary,
          icon,
        };
    }
  };
  
  const typeStyles = getTypeStyles();
  const displayIcon = typeStyles.icon;
  
  return (
    <View style={[styles.container, style]}>
      <ShimmerPlaceholder 
        visible={!loading} 
        style={styles.imageContainer}
        height={120}
      >
        {image ? (
          <Image source={image} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={[styles.iconContainer, { borderColor: typeStyles.color }]}>
            <Ionicons name={displayIcon as any} size={60} color={typeStyles.color} />
          </View>
        )}
      </ShimmerPlaceholder>
      
      {title && (
        <ShimmerPlaceholder 
          visible={!loading} 
          style={styles.titleContainer}
          width={0.7}
          height={24}
        >
          <Text style={styles.title}>{title}</Text>
        </ShimmerPlaceholder>
      )}
      
      <ShimmerPlaceholder 
        visible={!loading} 
        style={styles.messageContainer}
        width={0.8}
        height={40}
      >
        <Text style={styles.message}>{message}</Text>
      </ShimmerPlaceholder>
      
      {buttonText && onButtonPress && (
        <ShimmerPlaceholder 
          visible={!loading} 
          style={styles.buttonContainer}
          width={150}
          height={44}
        >
          <TouchableOpacity
            style={[styles.button, { backgroundColor: typeStyles.color }]}
            onPress={onButtonPress}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </ShimmerPlaceholder>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  imageContainer: {
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: 150,
    height: 150,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  titleContainer: {
    marginBottom: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 24,
    borderRadius: 4,
  },
  message: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    borderRadius: 22,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EmptyStateView;
