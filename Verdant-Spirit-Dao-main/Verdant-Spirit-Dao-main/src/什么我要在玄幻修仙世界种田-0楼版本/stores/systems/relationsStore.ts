import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useCharacterStore } from '../facades/characterStore';

export const useRelationsStore = defineStore('relations', () => {
  // #region Stores
  const characterStore = useCharacterStore();
  // #endregion

  // #region Getters (Facade)
  /**
   * Provides a reactive, formatted list of all characters and their relationships.
   * This is the single source of truth for the UI.
   */
  const relations = computed(() => {
    const allCharacters = characterStore.characters;
    // We can add more complex formatting here if needed for the UI.
    // For now, we return the raw character objects which include the '关系' property.
    return Object.values(allCharacters).filter(char => typeof char === 'object' && char !== null);
  });
  // #endregion

  // All actions that modify state have been moved to worldStore event handlers.
  // This store is now a pure facade for accessing relationship data.

  return {
    relations,
  };
});
