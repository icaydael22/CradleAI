import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Character } from '@/shared/types';
import RelationshipBadge, { RelationshipType } from './RelationshipBadge';

interface CharacterRelationshipCardProps {
  character: Character;
  relationshipType: RelationshipType;
  relationshipStrength: number;
  interactions: number;
  onPress?: () => void;
  onDelete?: () => void;
  showDeleteButton?: boolean;
}

const CharacterRelationshipCard: React.FC<CharacterRelationshipCardProps> = ({
  character,
  relationshipType,
  relationshipStrength,
  interactions,
  onPress,
  onDelete,
  showDeleteButton = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const rotationAnim = useState(new Animated.Value(0))[0];
  const heightAnim = useState(new Animated.Value(0))[0];
  
  const toggleExpanded = () => {
    const newExpanded = !expanded;
    
    // Rotate arrow animation
    Animated.timing(rotationAnim, {
      toValue: newExpanded ? 1 : 0,
      duration: 300,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
    
    // Expand/collapse animation
    Animated.timing(heightAnim, {
      toValue: newExpanded ? 1 : 0,
      duration: 300,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    setExpanded(newExpanded);
  };
  
  // Calculate rotate interpolation
  const rotate = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  
  // Calculate height interpolation
  const expandHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120], // Adjust based on content
  });
  
  // Calculate color for strength indicator
  const getStrengthColor = (strength: number) => {
    if (strength >= 80) return '#50C878'; // Green for high positive
    if (strength >= 40) return '#4A90E2'; // Blue for moderate positive
    if (strength > 0) return '#5856D6'; // Purple for slight positive
    if (strength === 0) return '#9B9B9B'; // Gray for neutral
    if (strength > -40) return '#FFA500'; // Orange for slight negative
    if (strength > -80) return '#FF9500'; // Darker orange for moderate negative
    return '#FF4444'; // Red for high negative
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.cardHeader}
        onPress={onPress || toggleExpanded}
        activeOpacity={0.7}
      >
        <Image
          source={
            character.avatar
              ? { uri: character.avatar }
              : require('@/assets/images/default-avatar.png')
          }
          style={styles.avatar}
        />
        
        <View style={styles.characterInfo}>
          <Text style={styles.name}>{character.name}</Text>
          <View style={styles.relationshipRow}>
            <RelationshipBadge
              type={relationshipType}
              size="small"
              highlighted={relationshipStrength >= 60}
            />
            <View 
              style={[
                styles.strengthIndicator, 
                { backgroundColor: getStrengthColor(relationshipStrength) }
              ]}
            >
              <Text style={styles.strengthText}>{relationshipStrength}</Text>
            </View>
          </View>
        </View>
        
        {(onDelete && showDeleteButton) ? (
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        ) : (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="chevron-down" size={18} color="#ccc" />
          </Animated.View>
        )}
      </TouchableOpacity>
      
      {/* Expandable details section */}
      <Animated.View style={[
        styles.details,
        { height: expanded ? expandHeight : 0 }
      ]}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>互动次数</Text>
            <Text style={styles.statValue}>{interactions}</Text>
          </View>
          
          <View style={styles.stat}>
            <Text style={styles.statLabel}>好感度</Text>
            <Text style={[
              styles.statValue, 
              {color: getStrengthColor(relationshipStrength)}
            ]}>
              {relationshipStrength > 0 ? `+${relationshipStrength}` : relationshipStrength}
            </Text>
          </View>
          
          <View style={styles.stat}>
            <Text style={styles.statLabel}>关系类型</Text>
            <RelationshipBadge 
              type={relationshipType}
              size="small"
            />
          </View>
        </View>
        
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionLabel}>关系描述</Text>
          <Text style={styles.description}>
            {getRelationshipDescription(relationshipType, relationshipStrength)}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
};

// Helper function to generate a relationship description
const getRelationshipDescription = (type: RelationshipType, strength: number) => {
  switch (type) {
    case 'friend':
      return strength > 70 ? 
        "这是一段亲密的友谊，双方彼此信任和支持。" : 
        "他们是朋友，但友谊可能还有进一步发展的空间。";
    case 'best_friend':
      return "这是一段深厚的友谊，他们彼此了解，无话不谈。";
    case 'rival':
      return "他们之间存在竞争关系，但也相互尊重对方的能力。";
    case 'enemy':
      return "他们之间存在明显的敌意，经常发生冲突。";
    case 'family':
      return "他们有亲密的家庭关系，相互扶持和照顾。";
    case 'mentor':
      return "他扮演着导师角色，提供指导和支持。";
    case 'student':
      return "他将另一方视为老师，从对方那里学习知识和技能。";
    case 'significant_other':
      return "他们有着浪漫关系，彼此深爱对方。";
    default:
      return strength > 50 ? 
        "他们之间的关系积极向上，互相尊重。" : 
        strength < -50 ? 
        "他们之间存在明显的紧张关系，互不信任。" : 
        "他们之间的关系相对中立，没有特别亲近或疏远。";
  }
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  characterInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  relationshipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  strengthIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    marginLeft: 8,
  },
  strengthText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  details: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  descriptionContainer: {
    padding: 16,
  },
  descriptionLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});

export default CharacterRelationshipCard;
