import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  Text,
} from 'react-native';
import { theme } from '@/constants/theme';

interface Avatar {
  id: string;
  uri?: string;
  placeholder?: string; // First letter or initials for placeholder
}

interface AvatarGroupProps {
  avatars: Avatar[];
  size?: number;
  max?: number; // Maximum number of avatars to display
  stackOffset?: number; // How much to overlap avatars
  style?: ViewStyle;
  onAvatarPress?: (avatar: Avatar, index: number) => void;
}

const AvatarGroup: React.FC<AvatarGroupProps> = ({
  avatars,
  size = 40,
  max = 5,
  stackOffset = 0.7, // 0.7 means 70% of avatar is visible
  style,
  onAvatarPress,
}) => {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;
  
  // Calculate the width needed for overlapping avatars
  const offsetAmount = size * stackOffset;
  const totalWidth = visibleAvatars.length > 0 
    ? offsetAmount * (visibleAvatars.length - 1) + size + (remainingCount > 0 ? size : 0) 
    : 0;

  const renderAvatar = (avatar: Avatar, index: number) => {
    const translateX = index * offsetAmount;
    
    return (
      <TouchableOpacity
        key={avatar.id}
        style={[
          styles.avatarContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            zIndex: visibleAvatars.length - index, // Higher index = lower z-index
            transform: [{ translateX }],
          },
        ]}
        onPress={onAvatarPress ? () => onAvatarPress(avatar, index) : undefined}
        disabled={!onAvatarPress}
      >
        {avatar.uri ? (
          <Image
            source={{ uri: avatar.uri }}
            style={[
              styles.avatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
              },
            ]}
          />
        ) : (
          <View
            style={[
              styles.placeholderAvatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: getRandomColor(avatar.id),
              },
            ]}
          >
            <Text style={styles.placeholderText}>
              {avatar.placeholder || '?'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { width: totalWidth }, style]}>
      {visibleAvatars.map((avatar, index) => renderAvatar(avatar, index))}
      
      {remainingCount > 0 && (
        <View
          style={[
            styles.countContainer,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              transform: [{ translateX: visibleAvatars.length * offsetAmount }],
            },
          ]}
        >
          <Text style={styles.countText}>+{remainingCount}</Text>
        </View>
      )}
    </View>
  );
};

// Helper function to get a random color based on ID
const getRandomColor = (id: string) => {
  const colors = [
    '#FF9ECD', // Primary color variation
    '#5D9CEC',
    '#48CFAD',
    '#AC92EB',
    '#FFCE54',
    '#FC6E51',
    '#ED5565'
  ];
  
  // Simple hash function to generate a number from string
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use the hash to select a color
  const colorIndex = Math.abs(hash % colors.length);
  return colors[colorIndex];
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    position: 'relative',
  },
  avatarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 2,
    borderColor: theme.colors.background,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  placeholderAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  countContainer: {
    position: 'absolute',
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  countText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
});

export default AvatarGroup;
