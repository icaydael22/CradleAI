import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CharacterPositionProps {
  characters: CharacterPrompt[];
  width: number;
  height: number;
  onPositionChange: (index: number, position: { x: number, y: number }) => void;
}

export interface CharacterPrompt {
  prompt: string;
  position: {
    x: number;
    y: number;
  };
  color?: string;
}

const DEFAULT_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3',
  '#33FFF3', '#FF9933', '#9933FF', '#33FF99', '#FF3366'
];

const CharacterPosition: React.FC<CharacterPositionProps> = ({
  characters,
  width,
  height,
  onPositionChange
}) => {
  const screenWidth = Dimensions.get('window').width;
  const containerPadding = 20;
  const availableWidth = screenWidth - (containerPadding * 2);
  
  // Calculate scale factor to fit the canvas in the screen
  const scaleFactor = availableWidth / width;
  const scaledHeight = height * scaleFactor;
  
  // Pan handlers for each character
  const panHandlers = characters.map((_, index) => {
    const pan = useRef(new Animated.ValueXY({
      x: characters[index].position.x * width * scaleFactor,
      y: characters[index].position.y * height * scaleFactor
    })).current;

    useEffect(() => {
      // Update position when characters change
      pan.setValue({
        x: characters[index].position.x * width * scaleFactor,
        y: characters[index].position.y * height * scaleFactor
      });
    }, [characters[index].position.x, characters[index].position.y]);

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const newX = Math.max(0, Math.min(width * scaleFactor, gesture.moveX - containerPadding));
        const newY = Math.max(0, Math.min(height * scaleFactor, gesture.moveY - 150)); // Offset for header
        
        pan.setValue({
          x: newX,
          y: newY
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const newX = Math.max(0, Math.min(width * scaleFactor, gesture.moveX - containerPadding));
        const newY = Math.max(0, Math.min(height * scaleFactor, gesture.moveY - 150)); // Offset for header
        
        // Convert back to 0-1 range
        const normalizedX = newX / (width * scaleFactor);
        const normalizedY = newY / (height * scaleFactor);
        
        onPositionChange(index, {
          x: Math.round(normalizedX * 100) / 100, // Round to 2 decimal places
          y: Math.round(normalizedY * 100) / 100
        });
      }
    });
    
    return { pan, panResponder };
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>角色位置控制</Text>
      <Text style={styles.subtitle}>拖动点以调整角色在图像中的位置</Text>
      
      <View 
        style={[
          styles.canvas, 
          { 
            width: width * scaleFactor, 
            height: scaledHeight,
            aspectRatio: width / height
          }
        ]}
      >
        {/* Grid lines for better position reference */}
        <View style={[styles.gridLine, styles.horizontalLine, { top: scaledHeight / 3 }]} />
        <View style={[styles.gridLine, styles.horizontalLine, { top: (scaledHeight / 3) * 2 }]} />
        <View style={[styles.gridLine, styles.verticalLine, { left: (width * scaleFactor) / 3 }]} />
        <View style={[styles.gridLine, styles.verticalLine, { left: ((width * scaleFactor) / 3) * 2 }]} />
        
        {/* Character position markers */}
        {characters.map((character, index) => {
          const charColor = character.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
          
          return (
            <Animated.View
              key={`char-${index}`}
              style={[
                styles.characterMarker,
                { 
                  transform: panHandlers[index].pan.getTranslateTransform(),
                  backgroundColor: charColor 
                }
              ]}
              {...panHandlers[index].panResponder.panHandlers}
            >
              <Text style={styles.characterMarkerText}>{index + 1}</Text>
            </Animated.View>
          );
        })}
      </View>
      
      <ScrollView style={styles.positionList}>
        {characters.map((character, index) => {
          const charColor = character.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
          const characterName = character.prompt.split(',')[0] || `角色 ${index + 1}`;
          
          return (
            <View key={`info-${index}`} style={styles.positionItem}>
              <View style={[styles.positionItemMarker, { backgroundColor: charColor }]}>
                <Text style={styles.positionItemMarkerText}>{index + 1}</Text>
              </View>
              <Text style={styles.characterName} numberOfLines={1}>{characterName}</Text>
              <Text style={styles.positionText}>
                X: {character.position.x.toFixed(2)}, Y: {character.position.y.toFixed(2)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      
      <View style={styles.helpContainer}>
        <Text style={styles.helpText}>提示: 坐标 (0,0) 为左上角，(1,1) 为右下角</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 16,
    textAlign: 'center',
  },
  canvas: {
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    position: 'relative',
  },
  characterMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 5,
  },
  characterMarkerText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  positionList: {
    width: '100%',
    marginTop: 16,
    maxHeight: 150,
  },
  positionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    marginBottom: 8,
  },
  positionItemMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  positionItemMarkerText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  characterName: {
    color: '#fff',
    flex: 1,
    marginRight: 10,
  },
  positionText: {
    color: '#ccc',
    fontSize: 12,
  },
  helpContainer: {
    marginTop: 16,
    padding: 10,
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderRadius: 8,
    width: '100%',
  },
  helpText: {
    color: '#70A1FF',
    fontSize: 12,
    textAlign: 'center',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  horizontalLine: {
    left: 0,
    right: 0,
    height: 1,
  },
  verticalLine: {
    top: 0,
    bottom: 0,
    width: 1,
  },
});

export default CharacterPosition;
