import { Character } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHARACTERS_STORAGE_KEY = 'characters';

/**
 * Get a character by ID from a list of characters
 */
export function getCharacterById(
  characters: Character[],
  id: string
): Character | undefined {
  return characters.find(character => character.id === id);
}

/**
 * Initialize the relationship system for a character
 * @param character The character to initialize
 * @returns The updated character with relationship system enabled
 */
export function initializeRelationshipSystem(character: Character): Character {
  return {
    ...character,
    relationshipEnabled: true,
    relationshipMap: character.relationshipMap || {
      relationships: {},
      lastReviewed: Date.now(),
      lastUpdated: Date.now()
    },
    messageBox: character.messageBox || []
  };
}

/**
 * Check if a character has relationship with another character
 * @param character The character to check
 * @param targetId The target character ID
 * @returns True if relationship exists
 */
export function hasRelationship(character: Character, targetId: string): boolean {
  return Boolean(character.relationshipMap?.relationships[targetId]);
}

/**
 * Get relationship strength between two characters
 * @param character The source character
 * @param targetId The target character ID
 * @returns The strength value or 0 if no relationship
 */
export function getRelationshipStrength(character: Character, targetId: string): number {
  return character.relationshipMap?.relationships[targetId]?.strength || 0;
}

/**
 * Save all characters to AsyncStorage
 */
export const saveCharacters = async (characters: Character[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(characters));
  } catch (error) {
    console.error('Failed to save characters:', error);
    throw error;
  }
};

/**
 * Load all characters from AsyncStorage
 */
export const loadCharacters = async (): Promise<Character[]> => {
  try {
    const data = await AsyncStorage.getItem(CHARACTERS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load characters:', error);
    return [];
  }
};

/**
 * Add a new character
 */
export const addCharacter = async (character: Character): Promise<Character[]> => {
  try {
    const characters = await loadCharacters();
    const updatedCharacters = [...characters, character];
    await saveCharacters(updatedCharacters);
    return updatedCharacters;
  } catch (error) {
    console.error('Failed to add character:', error);
    throw error;
  }
};

/**
 * Update an existing character
 */
export const updateCharacter = async (updatedCharacter: Character): Promise<Character[]> => {
  try {
    const characters = await loadCharacters();
    const updatedCharacters = characters.map(character => 
      character.id === updatedCharacter.id ? updatedCharacter : character
    );
    await saveCharacters(updatedCharacters);
    return updatedCharacters;
  } catch (error) {
    console.error('Failed to update character:', error);
    throw error;
  }
};

/**
 * Delete multiple characters
 */
export const deleteCharacters = async (characterIds: string[]): Promise<Character[]> => {
  try {
    const characters = await loadCharacters();
    const updatedCharacters = characters.filter(
      character => !characterIds.includes(character.id)
    );
    await saveCharacters(updatedCharacters);
    return updatedCharacters;
  } catch (error) {
    console.error('Failed to delete characters:', error);
    throw error;
  }
};

/**
 * Get all characters with relationships enabled
 */
export const getCharactersWithRelationships = async (): Promise<Character[]> => {
  try {
    const characters = await loadCharacters();
    return characters.filter(character => character.relationshipEnabled);
  } catch (error) {
    console.error('Failed to get characters with relationships:', error);
    return [];
  }
};

/**
 * Mock function for implementation referenced in circle-service.ts
 */
export const getAllCharacters = (): Character[] => {
  // This would typically fetch from storage or context
  // For now returning empty array as a placeholder
  // In a production app, this should be replaced with actual implementation
  let characters: Character[] = [];
  loadCharacters()
    .then(loadedCharacters => {
      characters = loadedCharacters;
    })
    .catch(error => {
      console.error('Failed to load characters:', error);
    });
  return characters;
};
