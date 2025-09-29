import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useWorldStore } from '../core/worldStore';
import { IRegion, IConnection } from '../../types';
import { logger } from '../../core/logger';

export const useMapStore = defineStore('map', () => {
  // #region Stores
  const worldStore = useWorldStore();
  // #endregion

  // #region Getters (Facade)
  const mapState = computed(() => worldStore.world?.地图);

  const regions = computed<Record<string, IRegion>>(() => mapState.value?.regions || {});
  const connections = computed<IConnection[]>(() => mapState.value?.connections || []);
  const currentPlayerLocation = computed<string>(() => mapState.value?.currentPlayerLocation || '');
  const currentRegion = computed<IRegion | undefined>(() => {
    return regions.value[currentPlayerLocation.value];
  });

  const visibleExits = computed<IConnection[]>(() => {
    return connections.value.filter(c => c.from_region === currentPlayerLocation.value && c.is_visible);
  });
  // #endregion

  // All actions that modify state have been moved to worldStore event handlers.
  // This store is now a pure facade for accessing map data.

  return {
    regions,
    connections,
    currentPlayerLocation,
    currentRegion,
    visibleExits,
  };
});
