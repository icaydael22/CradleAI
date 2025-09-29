import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { Character } from '@/shared/types';

interface CharacterCardProps {
  character: Character;
  isManaging?: boolean;
  isSelected?: boolean;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  onSelect?: (id: string) => void;
  style?: any;
  animatedStyle?: any;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isManaging = false,
  isSelected = false,
  onPress,
  onLongPress,
  onSelect,
  style,
  animatedStyle
}) => {
  const handlePress = () => {
    onPress(character.id);
  };

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(character.id);
    }
  };

  const handleSelect = () => {
    if (onSelect) {
      onSelect(character.id);
    }
  };

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      <TouchableOpacity
        style={[
          styles.card,
          isSelected && styles.selected
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        {/* Character Image/Avatar */}
        <View style={styles.imageContainer}>
          <Image
            source={
              character.avatar
                ? { uri: character.avatar }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.image}
            resizeMode="cover"
          />
          
          {/* Selection Overlay */}
          {isManaging && (
            <TouchableOpacity
              style={styles.selectButton}
              onPress={handleSelect}
            >
              <View style={[
                styles.checkbox,
                isSelected && styles.checkboxSelected
              ]}>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Character Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {character.name || '未命名角色'}
          </Text>
          
          {character.description && (
            <Text style={styles.description} numberOfLines={2}>
              {character.description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    margin: 8,
  },
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: 12,
    backgroundColor: 'rgba(51, 51, 51, 0.8)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selected: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  imageContainer: {
    width: '100%',
    height: '70%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  selectButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  infoContainer: {
    padding: 12,
    height: '30%',
    justifyContent: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});

export default memo(CharacterCard);