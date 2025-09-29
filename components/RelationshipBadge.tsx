import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

// Define relationship types
export type RelationshipType = 
  | 'friend' 
  | 'close_friend'
  | 'best_friend'
  | 'rival'
  | 'enemy'
  | 'acquaintance'
  | 'partner'
  | 'family'
  | 'mentor'
  | 'student'
  | 'stranger'
  | 'significant_other'
  | 'colleague'
  | 'unknown';

interface RelationshipBadgeProps {
  type: RelationshipType;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  highlighted?: boolean;
}

const RelationshipBadge: React.FC<RelationshipBadgeProps> = ({
  type,
  showLabel = true,
  size = 'medium',
  style,
  highlighted = false,
}) => {
  const getRelationshipConfig = (type: RelationshipType) => {
    switch (type) {
      case 'friend':
        return {
          icon: 'people',
          label: '朋友',
          color: '#4A90E2',
        };
      case 'close_friend':
        return {
          icon: 'heart',
          label: '好友',
          color: '#50C878',
        };
      case 'best_friend':
        return {
          icon: 'heart-circle',
          label: '挚友',
          color: '#FF9ECD',
        };
      case 'rival':
        return {
          icon: 'flash',
          label: '对手',
          color: '#FF9500',
        };
      case 'enemy':
        return {
          icon: 'warning',
          label: '敌人',
          color: '#FF4444',
        };
      case 'acquaintance':
        return {
          icon: 'person',
          label: '熟人',
          color: '#9B9B9B',
        };
      case 'partner':
        return {
          icon: 'briefcase',
          label: '伙伴',
          color: '#5856D6',
        };
      case 'family':
        return {
          icon: 'home',
          label: '家人',
          color: '#50C878',
        };
      case 'mentor':
        return {
          icon: 'school',
          label: '导师',
          color: '#FF9500',
        };
      case 'student':
        return {
          icon: 'book',
          label: '学生',
          color: '#4A90E2',
        };
      case 'significant_other':
        return {
          icon: 'heart-circle',
          label: '恋人',
          color: '#FF2D55',
        };
      case 'colleague':
        return {
          icon: 'business',
          label: '同事',
          color: '#5856D6',
        };
      case 'stranger':
      case 'unknown':
      default:
        return {
          icon: 'help-circle',
          label: '陌生人',
          color: '#8E8E93',
        };
    }
  };

  const config = getRelationshipConfig(type);
  
  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return {
          iconSize: 12,
          fontSize: 10,
          padding: 4,
          paddingHorizontal: showLabel ? 6 : 4,
          height: 20,
        };
      case 'large':
        return {
          iconSize: 20,
          fontSize: 15,
          padding: 8,
          paddingHorizontal: showLabel ? 12 : 8,
          height: 36,
        };
      case 'medium':
      default:
        return {
          iconSize: 16,
          fontSize: 12,
          padding: 6,
          paddingHorizontal: showLabel ? 8 : 6,
          height: 28,
        };
    }
  };

  const sizeConfig = getSizeConfig();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: highlighted ? config.color : `${config.color}20`,
          padding: sizeConfig.padding,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          height: sizeConfig.height,
        },
        style,
      ]}
    >
      <Ionicons
        name={config.icon as any}
        size={sizeConfig.iconSize}
        color={highlighted ? '#fff' : config.color}
        style={showLabel ? styles.icon : undefined}
      />
      {showLabel && (
        <Text
          style={[
            styles.label,
            {
              fontSize: sizeConfig.fontSize,
              color: highlighted ? '#fff' : config.color,
            },
          ]}
        >
          {config.label}
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
    borderRadius: 100,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontWeight: '500',
  },
});

export default RelationshipBadge;
