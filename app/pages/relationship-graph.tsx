import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StatusBar,
  SafeAreaView,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCharacters } from '@/constants/CharactersContext';
import { Character } from '@/shared/types';
import { RelationshipService } from '@/services/relationship-service';
import { Relationship, RelationshipType } from '@/shared/types/relationship-types';
import { RelationshipPromptService } from '@/services/relationship-prompt-service';
import { useUser } from '@/constants/UserContext';
import RelationshipGraph from '@/components/RelationshipGraph';
import CharacterSelector from '@/components/CharacterSelector';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// Chinese translations for relationship types
const RELATIONSHIP_TYPE_CN: Record<RelationshipType, string> = {
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

// Relationship Legend component
const RelationshipLegend = () => {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);
  
  // Only show a subset of relationships when collapsed
  const displayTypes: RelationshipType[] = expanded 
    ? ['enemy', 'rival', 'stranger', 'acquaintance', 'colleague', 'friend', 
       'close_friend', 'best_friend', 'family', 'crush', 'lover', 'partner', 
       'ex', 'mentor', 'student', 'admirer', 'idol'] 
    : ['enemy', 'stranger', 'acquaintance', 'friend', 'best_friend', 'lover', 'family'];
    
  // If not visible, show only a toggle button
  if (!visible) {
    return (
      <TouchableOpacity 
        style={styles.legendToggleButton}
        onPress={() => setVisible(true)}
      >
        <Ionicons name="list-circle" size={28} color="#FF9ECD" />
      </TouchableOpacity>
    );
  }
  
  return (
    <View style={styles.legendContainer}>
      <TouchableOpacity 
        style={styles.legendHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.legendTitle}>关系图例</Text>
        <View style={styles.legendHeaderButtons}>
          <TouchableOpacity
            style={styles.legendMinimizeButton}
            onPress={() => setVisible(false)}
          >
            <Ionicons name="remove-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <Ionicons 
            name={expanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#fff" 
          />
        </View>
      </TouchableOpacity>
      
      {displayTypes.map(type => (
        <View key={type} style={styles.legendItem}>
          <View 
            style={[styles.legendColor, { backgroundColor: COLOR_MAP[type] }]} 
          />
          <Text style={styles.legendText}>
            {RELATIONSHIP_TYPE_CN[type]} ({type})
          </Text>
        </View>
      ))}
      
      {!expanded && displayTypes.length < Object.keys(COLOR_MAP).length && (
        <TouchableOpacity
          style={styles.showMoreButton}
          onPress={() => setExpanded(true)}
        >
          <Text style={styles.showMoreText}>显示更多...</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const RelationshipGraphPage = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { characters, updateCharacter } = useCharacters();
  const { user } = useUser();

  // State variables
  const [loading, setLoading] = useState(true);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(id || null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNewRelationshipModalVisible, setIsNewRelationshipModalVisible] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  
  // Edit form state
  const [editedStrength, setEditedStrength] = useState('0');
  const [editedType, setEditedType] = useState<RelationshipType>('acquaintance');
  const [editedDescription, setEditedDescription] = useState('');
  
  // New relationship form state
  const [newTargetCharacterId, setNewTargetCharacterId] = useState<string | null>(null);
  
  useEffect(() => {
    if (characters.length > 0) {
      // If we have a specific ID, use that
      if (id) {
        const character = characters.find(c => c.id === id);
        if (character) {
          setSelectedCharacterId(id);
          setSelectedCharacter(character);
        } else {
          // If character not found, pick first with relationships enabled
          const characterWithRelationships = characters.find(c => c.relationshipEnabled);
          if (characterWithRelationships) {
            setSelectedCharacterId(characterWithRelationships.id);
            setSelectedCharacter(characterWithRelationships);
          }
        }
      } else {
        // No ID provided, pick first with relationships enabled
        const characterWithRelationships = characters.find(c => c.relationshipEnabled);
        if (characterWithRelationships) {
          setSelectedCharacterId(characterWithRelationships.id);
          setSelectedCharacter(characterWithRelationships);
        }
      }
      setLoading(false);
    }
  }, [characters, id]);

  // Set up selected relationship details when changed
  useEffect(() => {
    if (selectedRelationshipId && selectedCharacter?.relationshipMap?.relationships) {
      const relationship = selectedCharacter.relationshipMap.relationships[selectedRelationshipId];
      if (relationship) {
        setEditedStrength(relationship.strength.toString());
        setEditedType(relationship.type);
        setEditedDescription(relationship.description || '');
      }
    }
  }, [selectedRelationshipId, selectedCharacter]);

  // Handle character selection
  const handleSelectCharacter = useCallback((characterId: string) => {
    const character = characters.find(c => c.id === characterId);
    if (character) {
      setSelectedCharacterId(characterId);
      setSelectedCharacter(character);
      setSelectedRelationshipId(null); // Reset selected relationship when character changes
    }
  }, [characters]);

  // Handle relationship selection
  const handleSelectRelationship = useCallback((relationshipId: string) => {
    setSelectedRelationshipId(relationshipId);
    setIsEditModalVisible(true);
  }, []);

  // Handle relationship update
  const handleUpdateRelationship = useCallback(async () => {
    if (!selectedCharacter || !selectedRelationshipId) return;
    
    try {
      // Parse strength value
      const strength = parseInt(editedStrength);
      if (isNaN(strength)) {
        Alert.alert('错误', '关系强度必须是数字');
        return;
      }
      
      // Ensure strength is within valid range
      const boundedStrength = Math.max(-100, Math.min(100, strength));
      
      // Create a new copy of the character object
      let updatedCharacter = { ...selectedCharacter };
      
      // Initialize relationship map if needed
      if (!updatedCharacter.relationshipMap) {
        updatedCharacter = RelationshipService.initializeRelationshipMap(updatedCharacter);
      }
      
      // Update the relationships
      const updatedRelationships = {
        ...updatedCharacter.relationshipMap!.relationships,
        [selectedRelationshipId]: {
          ...updatedCharacter.relationshipMap!.relationships[selectedRelationshipId],
          strength: boundedStrength,
          type: editedType,
          description: editedDescription,
          lastUpdated: Date.now()
        }
      };
      
      // Create final updated character object
      const finalUpdatedCharacter = {
        ...updatedCharacter,
        relationshipMap: {
          ...updatedCharacter.relationshipMap!,
          relationships: updatedRelationships,
          lastUpdated: Date.now()
        }
      };
      
      // Save changes
      await updateCharacter(finalUpdatedCharacter);
      
      // Close modal
      setIsEditModalVisible(false);
      
      // Update local state
      setSelectedCharacter(finalUpdatedCharacter);
      
    } catch (error) {
      console.error('Failed to update relationship:', error);
      Alert.alert('错误', '更新关系失败');
    }
  }, [selectedCharacter, selectedRelationshipId, editedStrength, editedType, editedDescription, updateCharacter]);
  
  // Handle relationship creation
  const handleCreateRelationship = useCallback(async () => {
    if (!selectedCharacter || !newTargetCharacterId) {
      Alert.alert('错误', '请选择角色');
      return;
    }
    
    try {
      // Get the target character
      const targetCharacter = characters.find(c => c.id === newTargetCharacterId);
      if (!targetCharacter) {
        Alert.alert('错误', '找不到目标角色');
        return;
      }
      
      // Initialize relationship map if needed
      let updatedCharacter = selectedCharacter;
      if (!updatedCharacter.relationshipMap) {
        updatedCharacter = RelationshipService.initializeRelationshipMap(selectedCharacter);
      }
      
      // Create the new relationship
      const relationship: Relationship = {
        targetId: newTargetCharacterId,
        strength: parseInt(editedStrength) || 0,
        type: editedType,
        description: editedDescription || `${selectedCharacter.name}对${targetCharacter.name}的关系`,
        lastUpdated: Date.now(),
        interactions: 1
      };
      
      // Add to relationships map
      const updatedCharacterWithRelationship = {
        ...updatedCharacter,
        relationshipMap: {
          ...updatedCharacter.relationshipMap!,
          relationships: {
            ...updatedCharacter.relationshipMap!.relationships,
            [newTargetCharacterId]: relationship
          },
          lastUpdated: Date.now()
        }
      };
      
      // Save changes
      await updateCharacter(updatedCharacterWithRelationship);
      
      // Close modal and update state
      setIsNewRelationshipModalVisible(false);
      setSelectedCharacter(updatedCharacterWithRelationship);
      // Keep the selected character ID the same - this fixes the issue of jumping to another character
      setNewTargetCharacterId(null);
      setEditedStrength('0');
      setEditedType('acquaintance');
      setEditedDescription('');
      
    } catch (error) {
      console.error('Failed to create relationship:', error);
      Alert.alert('错误', '创建关系失败');
    }
  }, [selectedCharacter, newTargetCharacterId, editedStrength, editedType, editedDescription, characters, updateCharacter]);
  
  // Generate relationship description using API
  const handleGenerateDescription = useCallback(async () => {
    if (!selectedCharacter || !selectedRelationshipId) return;
    
    try {
      setIsGeneratingDescription(true);
      
      // Get target character
      const targetCharacter = characters.find(
        c => c.id === selectedRelationshipId
      );
      
      if (!targetCharacter) {
        Alert.alert('错误', '找不到目标角色');
        return;
      }
      
      // Get current relationship
      const relationship = selectedCharacter.relationshipMap?.relationships[selectedRelationshipId];
      
      if (!relationship) {
        Alert.alert('错误', '找不到关系数据');
        return;
      }
      
      // Get API key from user settings
      const apiKey = user?.settings?.chat?.characterApiKey;
      const apiSettings = {
        apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
        openrouter: user?.settings?.chat?.openrouter
      };
      
      if (!apiKey) {
        Alert.alert('错误', '未设置API密钥，请在设置中配置');
        return;
      }
      
      // Generate description using RelationshipPromptService
      const description = await RelationshipPromptService.generateRelationshipDescription(
        selectedCharacter,
        targetCharacter,
        relationship,
        apiKey,
        apiSettings
      );
      
      // Update form field
      setEditedDescription(description);
      
    } catch (error) {
      console.error('Failed to generate description:', error);
      Alert.alert('错误', '生成关系描述失败');
    } finally {
      setIsGeneratingDescription(false);
    }
  }, [selectedCharacter, selectedRelationshipId, characters, user]);
  
  // Helper function to get available target characters for new relationships
  const getAvailableTargetCharacters = useCallback(() => {
    if (!selectedCharacter) return [];
    
    // Filter out characters that already have a relationship with the selected character
    return characters.filter(c => 
      c.id !== selectedCharacter.id && 
      (!selectedCharacter.relationshipMap || 
       !selectedCharacter.relationshipMap.relationships ||
       !selectedCharacter.relationshipMap.relationships[c.id])
    );
  }, [selectedCharacter, characters]);
  
  // Render relationship type selector
  const renderRelationshipTypeSelector = () => {
    const types: RelationshipType[] = [
      'stranger', 'acquaintance', 'colleague', 'friend', 'close_friend', 
      'best_friend', 'family', 'crush', 'lover', 'partner', 'ex',
      'mentor', 'student', 'admirer', 'idol', 'rival', 'enemy'
    ];
    
    return (
      <View style={styles.typeContainer}>
        <Text style={styles.formLabel}>关系类型:</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.typeSelector}
        >
          {types.map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                editedType === type && styles.selectedTypeButton,
                { backgroundColor: COLOR_MAP[type] }
              ]}
              onPress={() => setEditedType(type)}
            >
              <Text 
                style={[
                  styles.typeText,
                  editedType === type && styles.selectedTypeText
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#FF9ECD" />
      </SafeAreaView>
    );
  }
  
  // If no characters have relationship system enabled
  if (!characters.some(c => c.relationshipEnabled)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>关系图谱</Text>
        </View>
        
        <View style={styles.emptyContainer}>
          <Ionicons name="people" size={64} color="#666" />
          <Text style={styles.emptyText}>没有角色启用关系系统</Text>
          <Text style={styles.emptySubtext}>请先在角色设置中启用关系系统</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.back()}
          >
            <Text style={styles.emptyButtonText}>返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditedStrength('0');
            setEditedType('acquaintance');
            setEditedDescription('');
            setIsNewRelationshipModalVisible(true);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Character selector */}
      <View style={styles.selectorContainer}>
        <CharacterSelector
          characters={characters.filter(c => c.relationshipEnabled)}
          selectedCharacterId={selectedCharacterId}
          onSelectCharacter={handleSelectCharacter}
          showRelationshipStatus={false}
        />
      </View>
      
      {/* Main content */}
      {selectedCharacter ? (
        <View style={styles.graphContainer}>
          {/* Relationship legend - now will be positioned at the bottom left */}
          <RelationshipLegend />
          
          <RelationshipGraph
            character={selectedCharacter}
            allCharacters={characters}
            onUpdateCharacter={updateCharacter}
            onSelectRelationship={handleSelectRelationship}
            relationshipTypeLabels={RELATIONSHIP_TYPE_CN}
          />
        </View>
      ) : (
        <View style={styles.noSelectionContainer}>
          <Text style={styles.noSelectionText}>请选择一个角色</Text>
        </View>
      )}
      
      {/* Edit relationship modal */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>编辑关系</Text>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {/* Strength slider */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  关系强度: {editedStrength}
                </Text>
                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>-100</Text>
                  <TextInput
                    style={styles.strengthInput}
                    value={editedStrength}
                    onChangeText={setEditedStrength}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.sliderLabel}>100</Text>
                </View>
              </View>
              
              {/* Type selector */}
              {renderRelationshipTypeSelector()}
              
              {/* Description */}
              <View style={styles.formGroup}>
                <View style={styles.descriptionHeader}>
                  <Text style={styles.formLabel}>关系描述:</Text>
                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={handleGenerateDescription}
                    disabled={isGeneratingDescription}
                  >
                    {isGeneratingDescription ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={16} color="#fff" />
                        <Text style={styles.generateButtonText}>生成描述</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.descriptionInput}
                  value={editedDescription}
                  onChangeText={setEditedDescription}
                  multiline={true}
                  numberOfLines={4}
                  placeholder="描述这段关系..."
                  placeholderTextColor="#999"
                />
              </View>
              
              {/* Save button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleUpdateRelationship}
              >
                <Text style={styles.saveButtonText}>保存更改</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      
      {/* New relationship modal - increase the height */}
      <Modal
        visible={isNewRelationshipModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsNewRelationshipModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.newRelationshipModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>新建关系</Text>
              <TouchableOpacity
                onPress={() => setIsNewRelationshipModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {/* Character selector */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>选择角色:</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.characterPickerContainer}
                  contentContainerStyle={styles.characterPickerContent}
                >
                  {getAvailableTargetCharacters().map(character => (
                    <TouchableOpacity
                      key={character.id}
                      style={[
                        styles.characterItem,
                        newTargetCharacterId === character.id && styles.selectedCharacterItem
                      ]}
                      onPress={() => setNewTargetCharacterId(character.id)}
                    >
                      <View style={styles.characterAvatar}>
                        {character.avatar ? (
                          <Image
                            source={{ uri: character.avatar }}
                            style={styles.avatarImage}
                          />
                        ) : (
                          <View style={[styles.avatarPlaceholder, { backgroundColor: '#FF9ECD' }]}>
                            <Text style={styles.avatarPlaceholderText}>
                              {character.name.substring(0, 1)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.characterName}>{character.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              {/* Strength slider */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  关系强度: {editedStrength}
                </Text>
                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>-100</Text>
                  <TextInput
                    style={styles.strengthInput}
                    value={editedStrength}
                    onChangeText={setEditedStrength}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.sliderLabel}>100</Text>
                </View>
              </View>
              
              {/* Type selector */}
              {renderRelationshipTypeSelector()}
              
              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>关系描述:</Text>
                <TextInput
                  style={[styles.descriptionInput, styles.newRelationshipDescriptionInput]}
                  value={editedDescription}
                  onChangeText={setEditedDescription}
                  multiline={true}
                  numberOfLines={6} 
                  placeholder="描述这段关系..."
                  placeholderTextColor="#999"
                />
              </View>
              
              {/* Create button */}
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  !newTargetCharacterId && styles.disabledButton
                ]}
                onPress={handleCreateRelationship}
                disabled={!newTargetCharacterId}
              >
                <Text style={styles.saveButtonText}>创建关系</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282828',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 0 + 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  backButton: {
    padding: 8,
  },
  addButton: {
    padding: 8,
  },
  selectorContainer: {
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  graphContainer: {
    flex: 1,
  },
  noSelectionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSelectionText: {
    color: '#aaa',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.9,
    maxHeight: SCREEN_HEIGHT * 0.7,
    backgroundColor: '#333',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#444',
    borderBottomWidth: 1,
    borderBottomColor: '#555',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: '#aaa',
    width: 40,
    textAlign: 'center',
  },
  strengthInput: {
    flex: 1,
    backgroundColor: '#444',
    color: '#fff',
    padding: 8,
    borderRadius: 4,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  typeContainer: {
    marginBottom: 16,
  },
  typeSelector: {
    flexDirection: 'row',
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTypeButton: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  typeText: {
    color: '#282828',
    fontWeight: 'bold',
  },
  selectedTypeText: {
    color: '#fff',
  },
  descriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  descriptionInput: {
    backgroundColor: '#444',
    color: '#fff',
    padding: 12,
    borderRadius: 4,
    height: 100,
    textAlignVertical: 'top',
  },
  generateButton: {
    backgroundColor: '#666',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 4,
  },
  generateButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: 'rgb(255, 190, 159)',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  disabledButton: {
    backgroundColor: '#666',
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#282828',
    fontSize: 16,
    fontWeight: 'bold',
  },
  characterPickerContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  characterItem: {
    alignItems: 'center',
    marginRight: 16,
    width: 80,
    opacity: 0.7,
  },
  selectedCharacterItem: {
    opacity: 1,
  },
  characterAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 60,
    height: 60,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  characterName: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 80,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#FF9ECD',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#282828',
    fontSize: 16,
    fontWeight: 'bold',
  },
  legendContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(40, 40, 40, 0.85)',
    borderRadius: 8,
    padding: 10,
    zIndex: 10,
    maxWidth: 180,
    borderWidth: 1,
    borderColor: '#444',
  },
  legendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  legendTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  legendHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendMinimizeButton: {
    marginRight: 10,
    padding: 2,
  },
  legendToggleButton: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(40, 40, 40, 0.85)',
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  legendText: {
    color: '#fff',
    fontSize: 12,
  },
  showMoreButton: {
    marginTop: 6,
    alignItems: 'center',
  },
  showMoreText: {
    color: '#FF9ECD',
    fontSize: 12,
  },
  newRelationshipModalContent: {
    maxHeight: SCREEN_HEIGHT * 0.85, // Increase modal height
  },
  
  characterPickerContent: {
    paddingVertical: 10,
  },
  
  newRelationshipDescriptionInput: {
    height: 120, // Make description input larger
  },
});

export default RelationshipGraphPage;

// Add export to make component available
export { default as RelationshipGraphPage } from './relationship-graph';