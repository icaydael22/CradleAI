import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type MoodType = 
  | 'happy' 
  | 'sad' 
  | 'angry' 
  | 'excited' 
  | 'nervous' 
  | 'neutral' 
  | 'confused' 
  | 'worried' 
  | 'surprised' 
  | 'disappointed' 
  | 'proud' 
  | 'loving' 
  | 'playful' 
  | 'relaxed';

interface CharacterMoodIndicatorProps {
  mood: MoodType;
  intensity?: number; // 0-100
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const CharacterMoodIndicator: React.FC<CharacterMoodIndicatorProps> = ({
  mood,
  intensity = 50,
  showLabel = true,
  size = 'medium',
  style,
}) => {
  // Configure mood icons and colors
  const getMoodConfig = (mood: MoodType) => {
    switch (mood) {
      case 'happy':
        return { 
          icon: 'happy',
          label: '开心',
          color: '#64DD17',
          bgColor: 'rgba(100, 221, 23, 0.1)'
        };
      case 'sad':
        return { 
          icon: 'sad',
          label: '难过',
          color: '#2196F3',
          bgColor: 'rgba(33, 150, 243, 0.1)'
        };
      case 'angry':
        return { 
          icon: 'flame',
          label: '生气',
          color: '#FF5252',
          bgColor: 'rgba(255, 82, 82, 0.1)'
        };
      case 'excited':
        return { 
          icon: 'star',
          label: '兴奋',
          color: '#FF9ECD',
          bgColor: 'rgba(255, 158, 205, 0.1)'
        };
      case 'nervous':
        return { 
          icon: 'pulse',
          label: '紧张',
          color: '#FFC107',
          bgColor: 'rgba(255, 193, 7, 0.1)'
        };
      case 'neutral':
        return { 
          icon: 'remove',
          label: '平静',
          color: '#B0BEC5',
          bgColor: 'rgba(176, 190, 197, 0.1)'
        };
      case 'confused':
        return { 
          icon: 'help',
          label: '困惑',
          color: '#9C27B0',
          bgColor: 'rgba(156, 39, 176, 0.1)'
        };
      case 'worried':
        return { 
          icon: 'alert',
          label: '担忧',
          color: '#FFA726',
          bgColor: 'rgba(255, 167, 38, 0.1)'
        };
      case 'surprised':
        return { 
          icon: 'alert-circle',
          label: '惊讶',
          color: '#29B6F6',
          bgColor: 'rgba(41, 182, 246, 0.1)'
        };
      case 'disappointed':
        return { 
          icon: 'thumbs-down',
          label: '失望',
          color: '#757575',
          bgColor: 'rgba(117, 117, 117, 0.1)'
        };
      case 'proud':
        return { 
          icon: 'ribbon',
          label: '自豪',
          color: '#673AB7',
          bgColor: 'rgba(103, 58, 183, 0.1)'
        };
      case 'loving':
        return { 
          icon: 'heart',
          label: '喜爱',
          color: '#E91E63',
          bgColor: 'rgba(233, 30, 99, 0.1)'
        };
      case 'playful':
        return { 
          icon: 'game-controller',
          label: '俏皮',
          color: '#4CAF50',
          bgColor: 'rgba(76, 175, 80, 0.1)'
        };
      case 'relaxed':
        return { 
          icon: 'cafe',
          label: '放松',
          color: '#7CB342',
          bgColor: 'rgba(124, 179, 66, 0.1)'
        };
      default:
        return { 
          icon: 'help-circle', 
          label: '未知',
          color: '#9E9E9E',
          bgColor: 'rgba(158, 158, 158, 0.1)'
        };
    }
  };

  const config = getMoodConfig(mood);
  
  // Calculate color opacity based on intensity
  const intensityFactor = intensity / 100;
  const colorOpacity = 0.3 + intensityFactor * 0.7;
  const iconSize = size === 'small' ? 16 : size === 'large' ? 28 : 20;
  
  const getIntensityText = (intensity: number) => {
    if (intensity >= 90) return '极度';
    if (intensity >= 70) return '非常';
    if (intensity >= 50) return '比较';
    if (intensity >= 30) return '有点';
    return '轻微';
  };
  
  const fullMoodText = `${getIntensityText(intensity)}${config.label}`;

  return (
    <View style={[
      styles.container,
      { backgroundColor: config.bgColor },
      style
    ]}>
      <View style={[
        styles.iconContainer,
        {
          backgroundColor: `${config.color}${Math.round(colorOpacity * 255).toString(16).padStart(2, '0')}`,
        }
      ]}>
        <Ionicons 
          name={config.icon as any} 
          size={iconSize} 
          color={config.color}
        />
      </View>
      
      {showLabel && (
        <Text style={[
          styles.label,
          { color: config.color }
        ]}>
          {fullMoodText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 20,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  }
});

export default CharacterMoodIndicator;
