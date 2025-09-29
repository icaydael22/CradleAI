import { defineStore } from 'pinia';
import { computed } from 'vue';
import { z } from 'zod';
import _ from 'lodash';
import { logger } from '../../core/logger';
import { useWorldStore } from '../core/worldStore';
import type { ICharacter, ICharacters } from '../../types';

export const useCharacterStore = defineStore('character', () => {
  const worldStore = useWorldStore();

  const characters = computed(() => {
    const chars = worldStore.world?.角色;
    if (!chars) return [];
    // Exclude the '主控角色名' property from the character list
    return Object.values(_.omit(chars, '主控角色名'));
  });

  const mainCharacterName = computed(() => worldStore.world?.角色?.主控角色名 || '');

  const mainCharacter = computed(() => {
    if (mainCharacterName.value && worldStore.world?.角色) {
      return worldStore.world.角色[mainCharacterName.value] as ICharacter || null;
    }
    return null;
  });

  const isInitialized = computed(() => worldStore.isInitialized);

  // No state management or initialization logic is needed here anymore.
  // This store now acts as a pure "Facade" to provide convenient,
  // derived data from the central worldStore.

  const getCharacterByName = (name: string) => {
    return characters.value.find(c => c.姓名 === name);
  };

  return {
    characters,
    mainCharacterName,
    mainCharacter,
    isInitialized,
    getCharacterByName,
  };
});
