import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorldStore } from '@/stores/core/worldStore';
import { useMapStore } from '@/stores/systems/mapStore';

const mockMapData = {
  regions: {
    forest_01: { region_id: 'forest_01', name: '宁静森林' },
    cave_01: { region_id: 'cave_01', name: '阴暗洞口' },
  },
  connections: [
    { from_region: 'forest_01', to_region: 'cave_01', direction: '北方', is_visible: true },
    { from_region: 'cave_01', to_region: 'forest_01', direction: '南方', is_visible: true },
    { from_region: 'forest_01', to_region: 'hidden_ruins', direction: '西方', is_visible: false },
  ],
  currentPlayerLocation: 'forest_01',
};

describe('useMapStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should return default values when map data is not present', () => {
    const mapStore = useMapStore();
    expect(mapStore.regions).toEqual({});
    expect(mapStore.connections).toEqual([]);
    expect(mapStore.currentPlayerLocation).toBe('');
    expect(mapStore.currentRegion).toBeUndefined();
    expect(mapStore.visibleExits).toEqual([]);
  });

  it('should derive map data correctly from worldStore', () => {
    const worldStore = useWorldStore();
    worldStore.world = { 地图: mockMapData } as any;
    const mapStore = useMapStore();
    expect(mapStore.regions).toEqual(mockMapData.regions);
    expect(mapStore.connections).toEqual(mockMapData.connections);
    expect(mapStore.currentPlayerLocation).toBe('forest_01');
  });

  it('should derive the current region details correctly', () => {
    const worldStore = useWorldStore();
    worldStore.world = { 地图: mockMapData } as any;
    const mapStore = useMapStore();
    expect(mapStore.currentRegion).toBeDefined();
    expect(mapStore.currentRegion?.name).toBe('宁静森林');
  });

  it('should derive visible exits for the current location', () => {
    const worldStore = useWorldStore();
    worldStore.world = { 地图: mockMapData } as any;
    const mapStore = useMapStore();
    expect(mapStore.visibleExits.length).toBe(1);
    // ✅ Correctly access the first element of the array
    expect(mapStore.visibleExits[0].direction).toBe('北方');
    expect(mapStore.visibleExits[0].to_region).toBe('cave_01');
  });

  it('should reactively update when player location changes', async () => {
    const worldStore = useWorldStore();
    worldStore.world = { 地图: mockMapData } as any;
    const mapStore = useMapStore();

    expect(mapStore.currentPlayerLocation).toBe('forest_01');
    expect(mapStore.visibleExits.length).toBe(1);

    // Simulate moving to the cave
    if (worldStore.world?.地图) {
      worldStore.world.地图.currentPlayerLocation = 'cave_01';
    }
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mapStore.currentPlayerLocation).toBe('cave_01');
    expect(mapStore.currentRegion?.name).toBe('阴暗洞口');
    expect(mapStore.visibleExits.length).toBe(1);
    // ✅ Correctly access the first element of the array after update
    expect(mapStore.visibleExits[0].direction).toBe('南方');
  });

  it('should return undefined for currentRegion if location is invalid', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      地图: {
        ...mockMapData,
        currentPlayerLocation: 'invalid_location',
      },
    } as any;
    const mapStore = useMapStore();
    expect(mapStore.currentRegion).toBeUndefined();
  });

  it('should filter out non-visible exits', () => {
    const worldStore = useWorldStore();
    worldStore.world = { 地图: mockMapData } as any;
    const mapStore = useMapStore();
    // The mock data has one visible and one non-visible exit from forest_01
    expect(mapStore.visibleExits.length).toBe(1);
    expect(mapStore.visibleExits.every(e => e.is_visible)).toBe(true);
  });

  it('should return an empty array for visibleExits if connections are empty', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      地图: {
        ...mockMapData,
        connections: [],
      },
    } as any;
    const mapStore = useMapStore();
    expect(mapStore.visibleExits).toEqual([]);
  });
});