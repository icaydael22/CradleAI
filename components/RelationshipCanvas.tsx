import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';
import { Character } from '@/shared/types';
import { Relationship } from '@/shared/types/relationship-types';
import { getCharacterById } from '@/services/character-service';

interface RelationshipCanvasProps {
  character: Character;
  allCharacters: Character[];
  onSelectRelationship: (relationship: Relationship) => void;
}

export const RelationshipCanvas: React.FC<RelationshipCanvasProps> = ({
  character,
  allCharacters,
  onSelectRelationship
}) => {
  const [dimensions, setDimensions] = useState({
    width: Dimensions.get('window').width - 32, // Account for padding
    height: 400
  });

  // Get color based on relationship strength
  const getRelationshipColor = (strength: number) => {
    if (strength <= -50) return '#E53935'; // Very negative
    if (strength <= -20) return '#FF9800'; // Negative
    if (strength <= 20) return '#9E9E9E';  // Neutral
    if (strength <= 60) return '#4CAF50';  // Positive
    return '#3F51B5';                      // Very positive
  };

  // No relationships exist
  if (!character.relationshipMap || 
      !character.relationshipMap.relationships || 
      Object.keys(character.relationshipMap.relationships).length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>还没有关系数据</Text>
        <Text style={styles.emptySubtext}>
          添加关系或与其他角色互动后，关系图谱将显示在这里
        </Text>
      </View>
    );
  }

  // Get relationships
  const relationships = Object.values(character.relationshipMap.relationships) as Relationship[];
  
  // Calculate positions in a circle layout
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const radius = Math.min(centerX, centerY) - 70;
  
  // Position for the central character
  const centralNode = {
    x: centerX,
    y: centerY,
    character
  };
  
  interface RelationshipNode {
    x: number;
    y: number;
    relationship: Relationship;
    character: Character | undefined;
  }

  // Calculate positions for related characters
  const nodes: RelationshipNode[] = relationships.map((relationship, index) => {
    const angle = (2 * Math.PI * index) / relationships.length;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    const targetCharacter = getCharacterById(allCharacters, relationship.targetId);
    
    return {
      x,
      y,
      relationship,
      character: targetCharacter
    };
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Svg height={dimensions.height} width={dimensions.width}>
        {/* Draw relationship lines */}
        {nodes.map((node, index) => (
          <React.Fragment key={`line-${index}`}>
            <Line
              x1={centralNode.x}
              y1={centralNode.y}
              x2={node.x}
              y2={node.y}
              stroke={getRelationshipColor(node.relationship.strength)}
              strokeWidth={Math.abs(node.relationship.strength / 20) + 1}
              opacity={0.7}
            />
          </React.Fragment>
        ))}
        
        {/* Draw central node */}
        <Circle
          cx={centralNode.x}
          cy={centralNode.y}
          r={30}
          fill="#333"
          stroke="rgb(255, 224, 195)"
          strokeWidth={2}
        />
        <SvgText
          x={centralNode.x}
          y={centralNode.y + 5}
          fill="#FFF"
          fontSize={12}
          textAnchor="middle"
          fontWeight="bold"
        >
          {character.name.substring(0, 4)}
        </SvgText>
        
        {/* Draw relationship nodes */}
        {nodes.map((node, index) => (
          <React.Fragment key={`node-${index}`}>
            <Circle
              cx={node.x}
              cy={node.y}
              r={25}
              fill="#444"
              stroke={getRelationshipColor(node.relationship.strength)}
              strokeWidth={2}
              onPress={() => onSelectRelationship(node.relationship)}
            />
            <SvgText
              x={node.x}
              y={node.y + 5}
              fill="#FFF"
              fontSize={10}
              textAnchor="middle"
              fontWeight="bold"
              onPress={() => onSelectRelationship(node.relationship)}
            >
              {node.character?.name.substring(0, 4) || "?"}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
      
      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>图例</Text>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#E53935' }]} />
          <Text style={styles.legendText}>强烈敌对 (≤ -50)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#FF9800' }]} />
          <Text style={styles.legendText}>敌对 (≤ -20)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#9E9E9E' }]} />
          <Text style={styles.legendText}>中立 (≤ 20)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>友善 (≤ 60)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#3F51B5' }]} />
          <Text style={styles.legendText}>亲密 ({'>'}60)</Text>
        </View>
      </View>
      
      <Text style={styles.helpText}>点击节点可编辑关系</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#AAAAAA',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
  legend: {
    marginTop: 20,
    backgroundColor: '#333333',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 10,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  legendText: {
    fontSize: 14,
    color: '#DDDDDD',
  },
  helpText: {
    fontSize: 12,
    color: '#AAAAAA',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  }
});
