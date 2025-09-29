import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Character } from '../shared/types';
import { useCharacters } from '../constants/CharactersContext';
import  RelationshipGraph  from './RelationshipGraph';
import  MessageBox  from './MessageBox';
import { Colors } from '../constants/Colors';
import { getAllCharacters } from '../services/character-service';

interface CharacterSettingsProps {
  character: Character;
  onClose: () => void;
  onUpdateCharacter: (updatedCharacter: Character) => void;
}

const CharacterSettings: React.FC<CharacterSettingsProps> = ({ 
  character, 
  onClose,
  onUpdateCharacter: baseOnUpdateCharacter
}) => {
  const onUpdateCharacter = async (character: Character) => {
    await baseOnUpdateCharacter(character);
  };
  // State for components
  const [showRelationshipGraph, setShowRelationshipGraph] = useState(false);
  const [showMessageBox, setShowMessageBox] = useState(false);
  const { updateCharacter } = useCharacters();
  const allCharacters = getAllCharacters();
  
  // Count unread messages
  const unreadMessagesCount = character.messageBox?.filter(msg => !msg.read).length || 0;
  
  // Toggle relationship features
  const handleRelationshipToggle = (value: boolean) => {
    const updatedCharacter = {
      ...character,
      relationshipEnabled: value,
    };
  
    // Initialize relationship map if enabling
    if (value && !character.relationshipMap) {
      updatedCharacter.relationshipMap = {
        relationships: {},
        lastReviewed: Date.now(),
        lastUpdated: Date.now() // Add lastUpdated field
      };
      updatedCharacter.messageBox = [];
    }
  
    onUpdateCharacter(updatedCharacter);
  };
  
  // If showing relationship graph, render that component
  if (showRelationshipGraph) {
    return (
      <RelationshipGraph 
        character={character} 
        onUpdateCharacter={onUpdateCharacter}
        allCharacters={allCharacters}
        onSelectRelationship={() => {}} 
      />
    );
  }
  
  // If showing message box, render that component
  if (showMessageBox) {
    return (
      <MessageBox 
        character={character} 
        onUpdateCharacter={onUpdateCharacter} 
      />
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* ...existing code... */}
      
      {/* Relationship Settings Section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>关系设置</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>启用角色关系系统</Text>
          <Switch
            value={character.relationshipEnabled || false}
            onValueChange={handleRelationshipToggle}
            trackColor={{ false: "#444", true: "#FF9ECD" }}
            thumbColor={character.relationshipEnabled ? "#fff" : "#888"}
          />
        </View>
        
        <View style={styles.relationshipButtons}>
          <TouchableOpacity 
            style={styles.relationshipButton} 
            onPress={() => setShowRelationshipGraph(true)}
            disabled={!character.relationshipEnabled}
          >
            <MaterialCommunityIcons 
              name="graph" 
              size={20} 
              color={character.relationshipEnabled ? "#fff" : "#888"} 
            />
            <Text style={[
              styles.relationshipButtonText,
              !character.relationshipEnabled && styles.disabledText
            ]}>
              关系图谱
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.relationshipButton,
              unreadMessagesCount > 0 && styles.highlightButton
            ]} 
            onPress={() => setShowMessageBox(true)}
            disabled={!character.relationshipEnabled}
          >
            <View style={styles.messageIconContainer}>
              <MaterialCommunityIcons 
                name="message-text" 
                size={20} 
                color={character.relationshipEnabled ? "#fff" : "#888"} 
              />
              {unreadMessagesCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{unreadMessagesCount}</Text>
                </View>
              )}
            </View>
            <Text style={[
              styles.relationshipButtonText,
              !character.relationshipEnabled && styles.disabledText
            ]}>
              消息盒子
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.relationshipSection}>
        <Text style={styles.relationshipTitle}>关系系统</Text>
        <Text style={styles.relationshipDescription}>
          启用关系系统后，该角色会记录与其他角色的关系变化，并通过互动自然发展关系。
        </Text>
  
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>启用关系系统</Text>
          <Switch
            value={character.relationshipEnabled || false}
            onValueChange={handleRelationshipToggle}
          />
        </View>
  
        {character.relationshipEnabled && (
          <>
            <View style={styles.statsCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>已建立关系</Text>
                <Text style={styles.statValue}>
                  {character.relationshipMap?.relationships ? 
                    Object.keys(character.relationshipMap.relationships).length : 0}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>未读消息</Text>
                <Text style={styles.statValue}>
                  {character.messageBox?.filter(msg => !msg.read).length || 0}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>最近检视</Text>
                <Text style={styles.statValue}>
                  {character.relationshipMap?.lastReviewed ? 
                    new Date(character.relationshipMap.lastReviewed).toLocaleDateString() : 
                    '从未'}
                </Text>
              </View>
            </View>
  
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => setShowRelationshipGraph(true)}
              >
                <Text style={styles.buttonText}>查看关系图谱</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.button}
                onPress={() => setShowMessageBox(true)}
              >
                <Text style={styles.buttonText}>查看消息盒子</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  // ...existing styles...
  
  // Add remaining styles
  relationshipSection: {
    marginTop: 20,
    marginBottom: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.grey,
    paddingTop: 20,
  },
  relationshipTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  relationshipDescription: {
    fontSize: 14,
    color: Colors.grey,
    marginBottom: 16,
  },
  statsCard: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: Colors.grey,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.grey,
  },
  statValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  button: {
    flex: 1,
    backgroundColor: Colors.card,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
    fontWeight: 'bold',
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
  },
  relationshipButtons: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  relationshipButton: {
    backgroundColor: '#444',
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
    justifyContent: 'center',
  },
  highlightButton: {
    backgroundColor: '#FF9ECD',
  },
  relationshipButtonText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
  disabledText: {
    color: '#888',
  },
  messageIconContainer: {
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default CharacterSettings;
