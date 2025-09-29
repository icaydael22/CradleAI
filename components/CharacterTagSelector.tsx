import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import characterData from '@/app/data/character_data.json';
import { theme } from '@/constants/theme';
import { generateUUID } from '@/utils/uuid';

// Define types for character data
interface Character {
  english_name: string;
  chinese_translation: string;
  works: string[];
  uuid?: string; // 新增uuid属性
}

interface CharacterTagSelectorProps {
  visible: boolean;
  onClose: () => void;
  onAddCharacter: (tagString: string) => void;
  characterTags?: string[]; // Optional prop for existing character tags
}

const CharacterTagSelector: React.FC<CharacterTagSelectorProps> = ({
  visible,
  onClose,
  onAddCharacter
}) => {
  // State for search query
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCharacters, setFilteredCharacters] = useState<Character[]>([]);
  
  // Clean up character data on component mount
  const [characters, setCharacters] = useState<Character[]>([]);
  
  useEffect(() => {
    // Process character data - clean up Chinese translations
    const processedData = characterData.map((char: Character) => {
      return {
        ...char,
        chinese_translation: char.chinese_translation.split('#')[0].trim(),
        uuid: generateUUID(), // 为每个角色生成uuid
      };
    });
    setCharacters(processedData);
    setFilteredCharacters(processedData);
  }, []);
  
  // Handle search input changes
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCharacters(characters);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = characters.filter(character =>
      character.english_name.toLowerCase().includes(query) ||
      character.chinese_translation.toLowerCase().includes(query) ||
      character.works.some(work => work.toLowerCase().includes(query))
    );
    
    setFilteredCharacters(filtered);
  }, [searchQuery, characters]);
  
  // Handle character selection
  const handleSelectCharacter = (character: Character) => {
    // Format tag as "character_name, work1, work2, ..."
    const tagString = [character.english_name, ...character.works].join(',');
    onAddCharacter(tagString);
    onClose();
  };
  
  // Extract display name (either English or Chinese part)
  const getDisplayName = (character: Character) => {
    if (character.chinese_translation) {
      return `${character.english_name} (${character.chinese_translation})`;
    }
    return character.english_name;
  };
  
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>选择角色</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        
        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#aaa" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索角色或作品..."
            placeholderTextColor="#888"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color="#aaa" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Character list */}
        <FlatList
          data={filteredCharacters}
          keyExtractor={(item) => item.uuid!} // 使用uuid作为key
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.characterItem}
              onPress={() => handleSelectCharacter(item)}
            >
              <View style={styles.characterInfo}>
                <Text style={styles.characterName}>{item.english_name}</Text>
                {item.chinese_translation && (
                  <Text style={styles.characterTranslation}>{item.chinese_translation}</Text>
                )}
                <View style={styles.worksContainer}>
                  {item.works.map((work, index) => (
                    <View key={index} style={styles.workTag}>
                      <Text style={styles.workText}>{work}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => handleSelectCharacter(item)}
              >
                <Ionicons name="add-circle" size={24} color="#ff9f1c" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.characterList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>没有找到匹配的角色</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 8,
    margin: 12,
  },
  searchIcon: {
    marginHorizontal: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    padding: 4,
  },
  clearButton: {
    padding: 4,
  },
  characterList: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  characterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  characterTranslation: {
    color: '#bbb',
    fontSize: 14,
    marginTop: 2,
  },
  worksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  workTag: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  workText: {
    color: theme.colors.accent,
    fontSize: 12,
  },
  addButton: {
    marginLeft: 12,
    padding: 6,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#aaa',
    fontSize: 16,
    fontStyle: 'italic',
  },
});

export default CharacterTagSelector;
