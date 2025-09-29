import { defineStore } from 'pinia';
import { computed } from 'vue';
import { logger } from '../../core/logger';
import { useCharacterStore } from './characterStore';
import { useDetailsStore } from '../ui/detailsStore';
import { useAppStore } from '../app/appStore';
import { useEventLogStore } from '../core/eventLogStore';
import type { GameEvent } from '../../core/eventManager';
import type { Item } from '../../types';

export const useItemStore = defineStore('item', () => {
  // #region Stores
  const characterStore = useCharacterStore();
  const detailsStore = useDetailsStore();
  const appStore = useAppStore();
  const eventLogStore = useEventLogStore();
  // #endregion

  // #region Getters (Facade)
  /**
   * Provides a reactive list of the main character's items.
   * This is the single source of truth for the UI.
   */
  const items = computed(() => characterStore.mainCharacter?.物品 || []);
  const totalValue = computed(() => {
    return items.value.reduce((total: number, item: any) => {
      const value = item.价值?.基础价值 || 0;
      const quantity = item.数量 || 1;
      return total + (value * quantity);
    }, 0);
  });
  // #endregion

  // #region Actions
  /**
   * Opens the details modal to edit an item.
   * This action does NOT modify state directly. Instead, it creates a '物品条目更新'
   * event which is then processed by the central worldStore.
   * @param itemName The name of the item to edit.
   */
  function editItem(itemName: string) {
    const item = items.value.find(i => i.名称 === itemName);

    if (!item) {
      logger('error', 'itemStore', `Attempted to edit a non-existent item: ${itemName}`);
      return;
    }

    const saveCallback = async (updatedData: Item) => {
      const newEvent: GameEvent = {
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sourceMessageId: String(appStore.floorId),
        type: '物品条目更新',
        payload: {
          originalName: itemName,
          updatedData: updatedData,
        },
      };
      await eventLogStore.addEvents([newEvent]);
      // The worldStore watcher will automatically handle the state update and persistence.
    };

    detailsStore.showDetails(item, saveCallback);
  }
  // #endregion

  return {
    items,
    totalValue,
    editItem,
  };
});
