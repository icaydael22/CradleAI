import React from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { Character } from '@/shared/types';

interface GroupAvatarProps {
  members: Character[];
  size: number;
  maxDisplayed?: number;
}

export const GroupAvatar: React.FC<GroupAvatarProps> = ({ 
  members, 
  size = 48,
  maxDisplayed = 4
}) => {
  // Calculate dimensions based on main size
  const smallSize = size * 0.5;
  const offset = size * 0.25;
  
  // Limit the number of avatars shown
  const displayedMembers = members.slice(0, maxDisplayed);
  const remainingCount = Math.max(0, members.length - maxDisplayed);
  
  // Determine layout based on number of members
  const getPositionStyle = (index: number) => {
    if (displayedMembers.length === 1) {
      // Single member - center
      return {
        position: 'absolute' as 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
      };
    } else if (displayedMembers.length === 2) {
      // Two members - split diagonally
      return {
        position: 'absolute' as 'absolute',
        width: smallSize,
        height: smallSize,
        borderRadius: smallSize / 2,
        top: index === 0 ? 0 : offset,
        left: index === 0 ? 0 : offset,
      };
    } else {
      // 3+ members - grid layout
      const row = Math.floor(index / 2);
      const col = index % 2;
      return {
        position: 'absolute' as 'absolute',
        width: smallSize,
        height: smallSize,
        borderRadius: smallSize / 2,
        top: row * offset,
        left: col * offset,
      };
    }
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {displayedMembers.map((member, index) => (
        <Image
          key={member.id}
          source={
            member.avatar
              ? { uri: member.avatar }
              : require('@/assets/images/default-avatar.png')
          }
          style={[styles.avatar, getPositionStyle(index)]}
        />
      ))}
      
      {remainingCount > 0 && (
        <View style={[styles.counter, { 
          width: smallSize, 
          height: smallSize, 
          borderRadius: smallSize / 2,
          right: 0,
          bottom: 0,
        }]}>
          <Text style={styles.counterText}>+{remainingCount}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  avatar: {
    borderWidth: 1,
    borderColor: 'rgba(40, 40, 40, 0.9)', // Match sidebar background
  },
  counter: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 224, 195, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(40, 40, 40, 0.9)',
  },
  counterText: {
    color: '#333',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
