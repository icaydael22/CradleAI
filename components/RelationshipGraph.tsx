import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Image
} from 'react-native';
import { Svg, Circle, Line, Text as SvgText, Image as SvgImage } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { Relationship, RelationshipType } from '@/shared/types/relationship-types';
import { RelationshipService } from '@/services/relationship-service';

interface RelationshipNodeProps {
  x: number;
  y: number;
  character: Character;
  relationship: Relationship;
  onPress: () => void;
}

export interface RelationshipGraphProps {
  character: Character;
  allCharacters: Character[];
  onUpdateCharacter: (character: Character) => Promise<void>;
  onSelectRelationship: (relationshipId: string) => void;
  relationshipTypeLabels?: Record<RelationshipType, string>;
}

// Color mapping for relationship types
const COLOR_MAP: Record<RelationshipType, string> = {
  'enemy': '#FF4444',
  'rival': '#FF7744',
  'stranger': '#AAAAAA',
  'acquaintance': '#88AAFF',
  'colleague': '#44AAFF',
  'friend': '#44DDFF',
  'close_friend': '#44FFDD',
  'best_friend': '#44FF88',
  'family': '#DDFF44',
  'crush': '#FF88DD',
  'lover': '#FF44AA',
  'partner': '#FF4488',
  'ex': '#FF8888',
  'mentor': '#DDAA44',
  'student': '#AA88FF',
  'admirer': '#FF88AA',
  'idol': '#FFAA44'
};

// Default Chinese translations if not provided through props
const DEFAULT_RELATIONSHIP_TYPE_CN: Record<RelationshipType, string> = {
  'enemy': '敌人',
  'rival': '对手',
  'stranger': '陌生人',
  'acquaintance': '点头之交',
  'colleague': '同事',
  'friend': '朋友',
  'close_friend': '好友',
  'best_friend': '挚友',
  'family': '家人',
  'crush': '暗恋对象',
  'lover': '情人',
  'partner': '伴侣',
  'ex': '前任',
  'mentor': '导师',
  'student': '学生',
  'admirer': '仰慕者',
  'idol': '偶像'
};

// Node component for each relationship - now using avatars
const RelationshipNode: React.FC<RelationshipNodeProps> = ({ x, y, character, relationship, onPress }) => {
  const color = COLOR_MAP[relationship.type] || '#AAAAAA';
  const radius = 25; // Fixed size for avatar circle
  const borderWidth = 3 + (Math.abs(relationship.strength) / 50); // Border width based on relationship strength
  
  return (
    <TouchableOpacity
      style={{
        position: 'absolute',
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        borderColor: color,
        borderWidth: borderWidth,
        backgroundColor: 'rgba(51, 51, 51, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      onPress={onPress}
    >
      {character.avatar ? (
        <Image 
          source={{ uri: character.avatar }} 
          style={{ 
            width: radius * 2 - borderWidth * 2, 
            height: radius * 2 - borderWidth * 2, 
            borderRadius: radius 
          }} 
        />
      ) : (
        <View style={{ 
          width: radius * 2 - borderWidth * 2, 
          height: radius * 2 - borderWidth * 2, 
          borderRadius: radius,
          backgroundColor: '#666',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ 
            color: '#fff', 
            fontSize: 18, 
            fontWeight: 'bold' 
          }}>
            {character.name.substring(0, 1)}
          </Text>
        </View>
      )}
      
      {/* Character name label below avatar */}
      <View style={{
        position: 'absolute',
        top: radius * 2 + 2,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: radius * 2,
      }}>
        <Text style={{
          color: '#fff',
          fontSize: 10,
          textAlign: 'center',
        }}>
          {character.name.length > 8 ? character.name.substring(0, 6) + '...' : character.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const RelationshipGraph: React.FC<RelationshipGraphProps> = ({ 
  character, 
  allCharacters, 
  onUpdateCharacter,
  onSelectRelationship,
  relationshipTypeLabels = DEFAULT_RELATIONSHIP_TYPE_CN
}) => {
  const [relationships, setRelationships] = useState<Record<string, { 
    relationship: Relationship, 
    character: Character,
    x: number,
    y: number
  }>>({});
  const [selectedRelationship, setSelectedRelationship] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedStrength, setEditedStrength] = useState('0');
  const [editedDescription, setEditedDescription] = useState('');
  const svgWidth = Dimensions.get('window').width;
  const svgHeight = 400;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  
  // Position calculation for nodes
  const calculatePositions = (relationshipMap: Record<string, Relationship>) => {
    const relationshipCount = Object.keys(relationshipMap).length;
    const result: Record<string, { 
      relationship: Relationship, 
      character: Character,
      x: number,
      y: number
    }> = {};
    
    // Calculate positions in a circle around the center
    Object.entries(relationshipMap).forEach(([targetId, rel], index) => {
      const targetCharacter = allCharacters.find(c => c.id === targetId);
      if (!targetCharacter) return;
      
      // Calculate angle, radius based on relationship strength
      const angle = (2 * Math.PI * index) / relationshipCount;
      const radius = 120 + (rel.strength / 2); // Stronger relationships are closer
      
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      result[targetId] = {
        relationship: rel,
        character: targetCharacter,
        x,
        y
      };
    });
    
    return result;
  };
  
  // Initialize relationships
  useEffect(() => {
    if (character.relationshipMap?.relationships) {
      const positions = calculatePositions(character.relationshipMap.relationships);
      setRelationships(positions);
    }
  }, [character, allCharacters]);
  
  // Handle relationship node press
  const handleNodePress = (targetId: string) => {
    setSelectedRelationship(targetId);
    const rel = relationships[targetId]?.relationship;
    if (rel) {
      setEditedStrength(rel.strength.toString());
      setEditedDescription(rel.description);
    }
    onSelectRelationship(targetId);
  };
  
  // Save edited relationship
  const handleSaveRelationship = () => {
    if (!selectedRelationship || !character.relationshipMap) return;
    
    const strength = Math.max(-100, Math.min(100, parseInt(editedStrength) || 0));
    const updatedRelationship = {
      ...character.relationshipMap.relationships[selectedRelationship],
      strength,
      description: editedDescription,
      lastUpdated: Date.now(),
      // Update the relationship type based on strength
      type: RelationshipService.getRelationshipTypeFromStrength(strength)
    };
    
    // Update character's relationship map
    const updatedRelationships = {
      ...character.relationshipMap.relationships,
      [selectedRelationship]: updatedRelationship
    };
    
    const updatedCharacter = {
      ...character,
      relationshipMap: {
        ...character.relationshipMap,
        relationships: updatedRelationships,
        lastUpdated: Date.now()
      }
    };
    
    // Save changes
    onUpdateCharacter(updatedCharacter);
    
    // Update local state
    setRelationships(calculatePositions(updatedRelationships));
    setEditMode(false);
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{character.name} 的关系图谱</Text>
      
      {/* Display number of relationships */}
      <Text style={styles.subtitle}>
        共有 {Object.keys(relationships).length} 个角色关系
      </Text>
      
      {/* Relationship Graph Visualization */}
      <View style={styles.graphContainer}>
        {/* Central character avatar */}
        <View style={styles.centralCharacter}>
          {character.avatar ? (
            <Image 
              source={{ uri: character.avatar }} 
              style={styles.centralAvatar}
            />
          ) : (
            <View style={styles.centralAvatarPlaceholder}>
              <Text style={styles.centralAvatarText}>
                {character.name.substring(0, 1)}
              </Text>
            </View>
          )}
          <View style={styles.centralNameContainer}>
            <Text style={styles.centralName}>{character.name}</Text>
          </View>
        </View>

        {/* Relationship lines */}
        <Svg width={svgWidth} height={svgHeight} style={styles.svgContainer}>
          {Object.entries(relationships).map(([targetId, data]) => (
            <Line
              key={`line-${targetId}`}
              x1={centerX}
              y1={centerY}
              x2={data.x}
              y2={data.y}
              stroke={COLOR_MAP[data.relationship.type]}
              strokeWidth={Math.abs(data.relationship.strength) / 20 + 2}
              opacity={0.6}
            />
          ))}
          
          {/* Relationship type labels on lines */}
          {Object.entries(relationships).map(([targetId, data]) => {
            const midX = (centerX + data.x) / 2;
            const midY = (centerY + data.y) / 2;
            
            return (
              <SvgText
                key={`label-${targetId}`}
                x={midX}
                y={midY}
                fontSize="10"
                fontWeight="bold"
                fill="#ffffff"
                stroke="#000000"
                strokeWidth="0.5"
                textAnchor="middle"
              >
                {relationshipTypeLabels[data.relationship.type]}
              </SvgText>
            );
          })}
        </Svg>
        
        {/* Relationship nodes (character avatars) */}
        {Object.entries(relationships).map(([targetId, data]) => (
          <RelationshipNode
            key={`node-${targetId}`}
            x={data.x}
            y={data.y}
            character={data.character}
            relationship={data.relationship}
            onPress={() => handleNodePress(targetId)}
          />
        ))}
      </View>
      
      {/* Selected Relationship Details */}
      {selectedRelationship && relationships[selectedRelationship] && (
        <View style={styles.detailsContainer}>
          <View style={styles.detailsHeader}>
            <View style={styles.detailsTitleContainer}>
              <Image 
                source={
                  relationships[selectedRelationship].character.avatar 
                    ? { uri: relationships[selectedRelationship].character.avatar } 
                    : require('@/assets/images/default-avatar.png')
                } 
                style={styles.detailsAvatar} 
              />
              <Text style={styles.detailsTitle}>
                与 {relationships[selectedRelationship].character.name} 的关系
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditMode(!editMode)}
            >
              <Ionicons 
                name={editMode ? "close-outline" : "create-outline"} 
                size={20} 
                color="#fff" 
              />
            </TouchableOpacity>
          </View>
          
          {editMode ? (
            <View style={styles.editContainer}>
              <Text style={styles.editLabel}>关系强度 (-100 到 100):</Text>
              <TextInput
                style={styles.editInput}
                value={editedStrength}
                onChangeText={setEditedStrength}
                keyboardType="number-pad"
                maxLength={4}
              />
              
              <Text style={styles.editLabel}>关系描述:</Text>
              <TextInput
                style={[styles.editInput, styles.editTextArea]}
                value={editedDescription}
                onChangeText={setEditedDescription}
                multiline={true}
                numberOfLines={3}
              />
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveRelationship}
              >
                <Text style={styles.saveButtonText}>保存</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.relationshipInfo}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>类型: </Text>
                <Text style={{
                  color: COLOR_MAP[relationships[selectedRelationship].relationship.type]
                }}>
                  {relationshipTypeLabels[relationships[selectedRelationship].relationship.type]}
                </Text>
              </Text>
              
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>强度: </Text>
                {relationships[selectedRelationship].relationship.strength}
              </Text>
              
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>互动次数: </Text>
                {relationships[selectedRelationship].relationship.interactions}
              </Text>
              
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>描述: </Text>
                {relationships[selectedRelationship].relationship.description}
              </Text>
              
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>上次更新: </Text>
                {new Date(relationships[selectedRelationship].relationship.lastUpdated).toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      )}
      
      {/* No Relationships Message */}
      {Object.keys(relationships).length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color="#888" />
          <Text style={styles.emptyStateText}>
            {character.name} 还没有建立任何关系
          </Text>
          <Text style={styles.emptyStateSubtext}>
            通过朋友圈互动或聊天来建立关系
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282828',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 16,
  },
  graphContainer: {
    height: 400,
    position: 'relative',
  },
  svgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  centralCharacter: {
    position: 'absolute',
    top: Dimensions.get('window').height / 2 - 200,
    left: Dimensions.get('window').width / 2 - 35,
    zIndex: 10,
    alignItems: 'center',
  },
  centralAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: '#FF9ECD',
  },
  centralAvatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: '#FF9ECD',
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centralAvatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  centralNameContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 5,
  },
  centralName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  detailsContainer: {
    padding: 16,
    backgroundColor: '#333',
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailsTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  editButton: {
    padding: 8,
    backgroundColor: '#444',
    borderRadius: 16,
  },
  relationshipInfo: {
    padding: 8,
  },
  infoText: {
    color: '#fff',
    marginBottom: 4,
  },
  infoLabel: {
    fontWeight: 'bold',
    color: '#aaa',
  },
  editContainer: {
    padding: 8,
  },
  editLabel: {
    color: '#aaa',
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: '#444',
    borderRadius: 4,
    padding: 8,
    color: '#fff',
    marginBottom: 12,
  },
  editTextArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#FF9ECD',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#282828',
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyStateText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 4,
  },
  legendText: {
    color: '#eee',
    fontSize: 12,
  },
});

export default RelationshipGraph;