import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import _ from 'lodash';
import { logger } from '../../core/logger';
import { SHELTER_COMPONENTS_DATA, SHELTER_DESCRIPTIVE_MAPPING } from '../../data/shelter-data';
import { IShelter } from '../../types';
import { useItemStore } from '../facades/itemStore';
import { useTimeStore } from './timeStore';
import { useWeatherStore } from './weatherStore';

declare const toastr: any;

export const useShelterStore = defineStore('shelter', () => {
  // #region Stores
  let worldStore: any;
  const timeStore = useTimeStore();
  const itemStore = useItemStore();
  const weatherStore = useWeatherStore();
  // #endregion

  // #region State (Facade - no local state)
  // This state is purely for UI effects, like highlighting a recently damaged component.
  const recentlyDamagedComponent = ref<string | null>(null);
  // #endregion

  // #region Getters
  const shelter = ref<IShelter | null>(null);

  // DEPRECATED: The logic has been moved to calculateCompositeAttributes for consistency.
  // These getters now simply reflect the calculated state from the world object.
  const totalDefense = computed(() => shelter.value?.防御力 || '无');
  const totalComfort = computed(() => '未实现'); // Comfort calculation not implemented yet.
  // #endregion

  // #region Helpers
  function mapValueToDescription(value: number, mapping: { [key: number]: string }): string {
    const keys = Object.keys(mapping).map(Number).sort((a, b) => a - b);
    for (let i = keys.length - 1; i >= 0; i--) {
      if (value >= keys[i]) {
        return mapping[keys[i]];
      }
    }
    return keys.length > 0 ?mapping[keys[0]] : '未知';
  };

  function calculateCompositeAttributes(shelterState: IShelter): IShelter {
    let totalDefense = 0;
    const newFunctions: string[] = [];

    for (const componentId in shelterState.组件) {
      const component = shelterState.组件[componentId as keyof typeof shelterState.组件];
      const componentData = SHELTER_COMPONENTS_DATA[componentId as keyof typeof SHELTER_COMPONENTS_DATA];

      if (component.规模 && component.规模 !== '未开垦' && component.规模 !== '未布置' && componentData) {
        const upgradeData = componentData.upgrades[component.规模 as keyof typeof componentData.upgrades];
        if (upgradeData) {
          const data = upgradeData as any; // Use type assertion to simplify access
          if (data.baseDefense) { totalDefense += data.baseDefense; }
          if (data.defenseBonus) { totalDefense += data.defenseBonus; }
          if (data.description) { newFunctions.push(`[${componentData.name}] ${data.description}`); }
        }
      }

      if (component.耐久度 != null) {
        const durabilityValue = parseFloat(component.耐久度.replace('%', ''));
        component.状态 = mapValueToDescription(durabilityValue, SHELTER_DESCRIPTIVE_MAPPING.durability);
      }
    }

    shelterState.防御力 = mapValueToDescription(totalDefense, SHELTER_DESCRIPTIVE_MAPPING.defense);
    shelterState.功能 = newFunctions;
    
    logger('info', 'ShelterStore', 'Recalculated shelter composite attributes.', { defense: shelterState.防御力, functions: shelterState.功能.length });
    return shelterState;
  }

  const consumeMaterials = (materials: { name: string; quantity: number }[]): boolean => {
    logger('warn', 'ShelterStore', '`consumeMaterials` is a placeholder and does not actually consume items yet.');
    // TODO: Implement proper item consumption from itemStore. This should return a boolean.
    return true;
  };
  // #endregion

  // #region Actions
  function clearRecentlyDamagedComponent() {
    if (recentlyDamagedComponent.value) {
      recentlyDamagedComponent.value = null;
    }
  }
  // #endregion

  // #region Watchers
  watch(() => timeStore.state?.day, (newDay, oldDay) => {
    if (shelter.value === null || newDay === undefined || oldDay === undefined || newDay <= oldDay) return;
    // TODO: Refactor the time change logic.
    // This function should calculate the necessary changes (durability decay, resource production)
    // and then emit internal events via reactiveMessageBus.
    // The worldStore will listen for these events and apply the state changes.
    // For resource production, it should generate a '物品变化' event and push it to the eventLogStore.
    logger('log', 'ShelterStore', 'Time change detected, shelter update logic needs to be refactored to emit events.');
  });
  // #endregion

  /**
   * Internal function to be called ONLY by worldStore to process shelter-related events.
   * It mutates the worldState object directly.
   * @param event The game event to process.
   * @param worldState The full world state object from worldStore.
   */
  function _handleShelterEvent(event: any, worldState: any) {
    if (!worldState.庇护所) {
        logger('warn', 'shelterStore:_handleShelterEvent', 'Shelter state is missing in worldState. Cannot process event.', event);
        return;
    }

    const { type, payload } = event;
    const currentShelter = worldState.庇护所;

    switch (type) {
      case '庇护所建造':
      case '庇护所升级': {
        const { 组件ID, 等级 } = payload;
        if (!组件ID || !等级 || !currentShelter.组件[组件ID]) {
          toastr.error('收到了格式不正确的“庇护所建造/升级”事件。');
          break;
        }
        const componentData = SHELTER_COMPONENTS_DATA[组件ID as keyof typeof SHELTER_COMPONENTS_DATA];
        if (!componentData) {
          toastr.error(`收到了无效的组件ID“${组件ID}”。`);
          break;
        }
        
        const upgradeData = componentData.upgrades[等级 as keyof typeof componentData.upgrades];
        if (!upgradeData) {
          toastr.error(`组件“${组件ID}”没有名为“${等级}”的等级。`);
          break;
        }

        if (consumeMaterials((upgradeData as any).materials)) {
          const componentToUpdate = currentShelter.组件[组件ID as keyof typeof currentShelter.组件];
          componentToUpdate.规模 = 等级;
          componentToUpdate.状态 = '完好无损';
          componentToUpdate.耐久度 = '100.00%';
        }
        break;
      }
      case '庇护所修复': {
        const { 组件ID, 数量 } = payload;
        if (!组件ID || typeof 数量 !== 'number' || !currentShelter.组件[组件ID]) {
          toastr.error('收到了格式不正确的“庇护所修复”事件。');
          break;
        }
        const component = currentShelter.组件[组件ID];
        if (component && component.耐久度) {
          const oldDurability = parseFloat(component.耐久度.replace('%','')) || 0;
          const newDurability = Math.min(100, oldDurability + 数量);
          component.耐久度 = `${newDurability.toFixed(2)}%`;
          component.状态 = mapValueToDescription(newDurability, SHELTER_DESCRIPTIVE_MAPPING.durability);
        }
        break;
      }
      case '庇护所受损': {
        const { 组件ID, 数量 } = payload;
        if (!组件ID || typeof 数量 !== 'number' || !currentShelter.组件[组件ID]) {
          toastr.error('收到了格式不正确的“庇护所受损”事件。');
          break;
        }
        const component = currentShelter.组件[组件ID];
        if (component && component.耐久度) {
          const oldDurability = parseFloat(component.耐久度.replace('%','')) || 100;
          const newDurability = Math.max(0, oldDurability - 数量);
          component.耐久度 = `${newDurability.toFixed(2)}%`;
          component.状态 = mapValueToDescription(newDurability, SHELTER_DESCRIPTIVE_MAPPING.durability);
          recentlyDamagedComponent.value = 组件ID;
        }
        break;
      }
      case '庇护所攻击': {
        const { 数量: strength } = payload;
        if (typeof strength !== 'number') {
          toastr.error('收到了格式不正确的“庇护所攻击”事件。');
          break;
        }
        const damageableComponents = Object.keys(currentShelter.组件).filter(id => currentShelter.组件[id as keyof typeof currentShelter.组件].耐久度);
        if (damageableComponents.length > 0) {
            const damagePerComponent = strength / damageableComponents.length;
            damageableComponents.forEach(id => {
              const component = currentShelter.组件[id as keyof typeof currentShelter.组件];
              if (component && component.耐久度) {
                const oldDurability = parseFloat(component.耐久度.replace('%','')) || 100;
                const newDurability = Math.max(0, oldDurability - damagePerComponent);
                component.耐久度 = `${newDurability.toFixed(2)}%`;
              }
            });
        }
        break;
      }
    }
    // After any event, recalculate composite attributes
    worldState.庇护所 = calculateCompositeAttributes(currentShelter);
  }

  function initialize(providedWorldStore: any) {
    worldStore = providedWorldStore;

    // Watch for the shelter data to become available and update the local ref
    watch(() => worldStore.shelter, (newShelter) => {
      shelter.value = newShelter;
    }, { immediate: true });

    worldStore.registerEventHandler('庇护所建造', _handleShelterEvent);
    worldStore.registerEventHandler('庇护所升级', _handleShelterEvent);
    worldStore.registerEventHandler('庇护所修复', _handleShelterEvent);
    worldStore.registerEventHandler('庇护所受损', _handleShelterEvent);
    worldStore.registerEventHandler('庇护所攻击', _handleShelterEvent);
  }

  return {
    // Getters
    shelter,
    totalDefense, // This is now a simple computed property reflecting world state
    totalComfort,
    // UI State
    recentlyDamagedComponent,
    // Actions
    clearRecentlyDamagedComponent,
    _handleShelterEvent,
    initialize,
  };
});
