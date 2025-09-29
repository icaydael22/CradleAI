import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Character } from '../shared/types';

export function useCharacters() {
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Load characters
  const loadCharacters = useCallback(async () => {
    try {
      setLoading(true);
      const value = await AsyncStorage.getItem('characters');
      if (value) {
        setCharacters(JSON.parse(value));
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load characters'));
      console.error('Error loading characters:', err);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Update characters
  const updateCharacters = useCallback(async (updatedCharacters: Record<string, Character>) => {
    try {
      await AsyncStorage.setItem('characters', JSON.stringify(updatedCharacters));
      setCharacters(updatedCharacters);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to save characters'));
      console.error('Error saving characters:', err);
    }
  }, []);
  
  // Update a single character
  const updateCharacter = useCallback(async (updatedCharacter: Character) => {
    try {
      const updatedCharacters = { 
        ...characters, 
        [updatedCharacter.id]: updatedCharacter
      };
      
      await AsyncStorage.setItem('characters', JSON.stringify(updatedCharacters));
      setCharacters(updatedCharacters);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update character'));
      console.error('Error updating character:', err);
      return false;
    }
  }, [characters]);
  
  // Load characters on component mount
  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);
  
  const refreshCharacters = useCallback(() => {
    loadCharacters();
  }, [loadCharacters]);
  
  return { 
    characters, 
    loading, 
    error, 
    updateCharacter, 
    updateCharacters,
    refreshCharacters
  };
}
