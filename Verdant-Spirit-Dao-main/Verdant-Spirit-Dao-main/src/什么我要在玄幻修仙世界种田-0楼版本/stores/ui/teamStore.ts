import _ from 'lodash';
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { logger } from '../../core/logger';
import { useCharacterStore } from '../facades/characterStore';

export const useTeamStore = defineStore('team', () => {
  const characterStore = useCharacterStore();

  // Getters
  const characters = computed(() => {
    logger('log', 'TeamStore', 'Passing through characters from characterStore. Source:', characterStore.characters);
    return characterStore.characters;
  });

  const mainCharacterName = computed(() => {
    logger('log', 'TeamStore', 'Passing through mainCharacterName from characterStore. Source:', characterStore.mainCharacterName);
    return characterStore.mainCharacterName;
  });

  const mainCharacter = computed(() => {
    logger('log', 'TeamStore', `Passing through mainCharacter from characterStore. Source:`, characterStore.mainCharacter);
    return characterStore.mainCharacter;
  });

  const npcs = computed(() => {
    logger('log', 'TeamStore', 'Computing npcs.');
    const allChars = characters.value;
    const mainChar = mainCharacter.value;

    if (!mainChar) {
      logger('log', 'TeamStore', 'No main character, returning all characters as NPCs.', allChars);
      return allChars;
    }
    
    const result = allChars.filter(c => c.姓名 !== mainChar.姓名);
    logger('log', 'TeamStore', 'Computed npcs result:', result);
    return result;
  });

  return {
    characters,
    mainCharacterName,
    mainCharacter,
    npcs,
  };
});
