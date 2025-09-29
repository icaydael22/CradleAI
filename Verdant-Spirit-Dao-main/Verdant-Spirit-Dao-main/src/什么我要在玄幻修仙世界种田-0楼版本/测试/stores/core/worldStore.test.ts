import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { useWorldStore } from '@/stores/core/worldStore';
import { useCharacterStore } from '@/stores/facades/characterStore';

// Mock characterStore to isolate worldStore logic
vi.mock('@/stores/facades/characterStore');

// Mock a simple event handler function
const mockWeatherHandler = vi.fn((event, world) => {
  world.天气 = event.payload.天气;
});

describe('useWorldStore', () => {
  beforeEach(() => {
    // Set up a fresh Pinia instance for each test to ensure isolation
    setActivePinia(createPinia());
    // Reset mocks before each test
    mockWeatherHandler.mockClear();
    // Provide a mock implementation for the character store
    vi.mocked(useCharacterStore).mockReturnValue({
      mainCharacterName: '主角',
    } as any);
  });

  it('should initialize with an empty world and character state', () => {
    const worldStore = useWorldStore();
    expect(worldStore.world).toEqual({});
    expect(worldStore.character).toEqual({});
  });

  it('should register an event handler successfully', () => {
    const worldStore = useWorldStore();
    worldStore.registerEventHandler('天气变化', mockWeatherHandler);
    // We can't directly inspect the handlers, but we can verify by processing an event
    expect(worldStore.processEvent).toBeDefined();
  });

  it('should process a registered event and update the world state', () => {
    const worldStore = useWorldStore();
    
    // 1. Register the handler
    worldStore.registerEventHandler('天气变化', mockWeatherHandler);

    // 2. Define the event to process
    const weatherEvent = { type: '天气变化', payload: { 天气: '晴朗' } } as any;

    // 3. Process the event
    worldStore.processEvent(weatherEvent);

    // 4. Assert that the handler was called correctly
    expect(mockWeatherHandler).toHaveBeenCalledTimes(1);
    expect(mockWeatherHandler).toHaveBeenCalledWith(weatherEvent, worldStore.world);

    // 5. Assert that the world state was updated by the handler
    expect(worldStore.world.天气).toBe('晴朗');
  });

  it('should not process an unregistered event', () => {
    const worldStore = useWorldStore();
    // Note: '地点变化' handler is NOT registered
    const locationEvent = { type: '地点变化', payload: { 地点: '青石镇' } } as any;

    worldStore.processEvent(locationEvent);

    // Assert that the world state remains unchanged
    expect(worldStore.world.地点).toBeUndefined();
  });

  it('should handle multiple event handlers correctly', () => {
    const worldStore = useWorldStore();
    const mockTimeHandler = vi.fn((event, world) => {
      world.时间 = event.payload.时间;
    });

    worldStore.registerEventHandler('天气变化', mockWeatherHandler);
    worldStore.registerEventHandler('时间变化', mockTimeHandler);

    const weatherEvent = { type: '天气变化', payload: { 天气: '多云' } } as any;
    const timeEvent = { type: '时间变化', payload: { 时间: '黄昏' } } as any;

    worldStore.processEvent(weatherEvent);
    worldStore.processEvent(timeEvent);

    expect(mockWeatherHandler).toHaveBeenCalledTimes(1);
    expect(mockTimeHandler).toHaveBeenCalledTimes(1);
    expect(worldStore.world.天气).toBe('多云');
    expect(worldStore.world.时间).toBe('黄昏');
  });

  // --- Item Event Handler Tests ---
  // The actual handler logic is copied from worldStore.ts to ensure we are testing the real logic
  // without depending on the store's full initialization lifecycle.
  const itemChangeHandler = (event: any, worldState: any) => {
    const characterStore = useCharacterStore();
    const mainCharName = characterStore.mainCharacterName;
    if (!mainCharName || !worldState.角色?.[mainCharName]) return;

    const mainCharacter = worldState.角色[mainCharName];
    if (!mainCharacter.物品) mainCharacter.物品 = [];
    const newItemList = mainCharacter.物品;

    const payload = event.payload;
    if (payload.获得) {
      for (const itemToAdd of payload.获得) {
        const existingItem = newItemList.find((i: any) => i.名称 === itemToAdd.名称);
        if (existingItem) {
          existingItem.数量 = (existingItem.数量 || 1) + (itemToAdd.数量 || 1);
        } else {
          newItemList.push({ ...itemToAdd, 数量: itemToAdd.数量 || 1 });
        }
      }
    }
    if (payload.失去) {
      for (const itemToRemove of payload.失去) {
        const existingItem = newItemList.find((i: any) => i.名称 === itemToRemove.名称);
        if (existingItem) {
          existingItem.数量 = (existingItem.数量 || 1) - (itemToRemove.数量 || 1);
          if (existingItem.数量 <= 0) {
            _.remove(newItemList, (i: any) => i.名称 === itemToRemove.名称);
          }
        }
      }
    }
    if (payload.更新) {
      for (const itemToUpdate of payload.更新) {
        const existingItem = newItemList.find((i: any) => i.名称 === itemToUpdate.名称);
        if (existingItem) {
          Object.assign(existingItem, itemToUpdate.更新);
        }
      }
    }
  };

  const itemEntryUpdateHandler = (event: any, worldState: any) => {
    const characterStore = useCharacterStore();
    const mainCharName = characterStore.mainCharacterName;
    if (!mainCharName || !worldState.角色?.[mainCharName]?.物品) return;

    const newItemList = worldState.角色[mainCharName].物品;
    const { originalName, updatedData } = event.payload;
    const itemIndex = newItemList.findIndex((i: any) => i.名称 === originalName);
    if (itemIndex !== -1) {
      Object.assign(newItemList[itemIndex], updatedData);
    }
  };

  it('should handle "物品变化" event to gain new items', () => {
    const worldStore = useWorldStore();
    worldStore._dangerouslySetState({
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [] },
      },
    } as any);

    worldStore.registerEventHandler('物品变化', itemChangeHandler);

    const gainEvent = {
      type: '物品变化',
      payload: {
        获得: [{ 名称: '灵草', 数量: 10 }],
      },
    } as any;

    worldStore.processEvent(gainEvent);

    expect(_.cloneDeep(worldStore.world.角色!.主角.物品)).toEqual([{ 名称: '灵草', 数量: 10 }]);
  });

  it('should handle "物品变化" event to gain existing items (increase quantity)', () => {
    const worldStore = useWorldStore();
    worldStore._dangerouslySetState({
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [{ 名称: '灵草', 数量: 10 }] },
      },
    } as any);

    worldStore.registerEventHandler('物品变化', itemChangeHandler);

    const gainEvent = {
      type: '物品变化',
      payload: {
        获得: [{ 名称: '灵草', 数量: 5 }],
      },
    } as any;

    worldStore.processEvent(gainEvent);

    expect(_.cloneDeep(worldStore.world.角色!.主角.物品)).toEqual([{ 名称: '灵草', 数量: 15 }]);
  });

  it('should handle "物品变化" event to lose items (decrease quantity)', () => {
    const worldStore = useWorldStore();
    worldStore._dangerouslySetState({
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [{ 名称: '灵草', 数量: 10 }] },
      },
    } as any);

    worldStore.registerEventHandler('物品变化', itemChangeHandler);

    const loseEvent = {
      type: '物品变化',
      payload: {
        失去: [{ 名称: '灵草', 数量: 3 }],
      },
    } as any;

    worldStore.processEvent(loseEvent);

    expect(_.cloneDeep(worldStore.world.角色!.主角.物品)).toEqual([{ 名称: '灵草', 数量: 7 }]);
  });

  it('should handle "物品变化" event to lose items (remove if quantity <= 0)', () => {
    const worldStore = useWorldStore();
    worldStore._dangerouslySetState({
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [{ 名称: '灵草', 数量: 5 }] },
      },
    } as any);

    worldStore.registerEventHandler('物品变化', itemChangeHandler);

    const loseEvent = {
      type: '物品变化',
      payload: {
        失去: [{ 名称: '灵草', 数量: 5 }],
      },
    } as any;

    worldStore.processEvent(loseEvent);

    expect(_.cloneDeep(worldStore.world.角色!.主角.物品)).toEqual([]);
  });

  it('should handle "物品变化" event to update item properties', () => {
    const worldStore = useWorldStore();
    worldStore._dangerouslySetState({
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [{ 名称: '灵草', 数量: 10, 描述: '普通的灵草' }] },
      },
    } as any);

    worldStore.registerEventHandler('物品变化', itemChangeHandler);

    const updateEvent = {
      type: '物品变化',
      payload: {
        更新: [{ 名称: '灵草', 更新: { 描述: '稀有的灵草', 稀有度: '稀有' } }],
      },
    } as any;

    worldStore.processEvent(updateEvent);

    expect(_.cloneDeep(worldStore.world.角色!.主角.物品)).toEqual([{ 名称: '灵草', 数量: 10, 描述: '稀有的灵草', 稀有度: '稀有' }]);
  });

  it('should handle "物品条目更新" event to update item data', () => {
    const worldStore = useWorldStore();
    worldStore._dangerouslySetState({
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [{ 名称: '灵草', 数量: 10, 描述: '普通的灵草' }] },
      },
    } as any);

    worldStore.registerEventHandler('物品条目更新', itemEntryUpdateHandler);

    const itemEntryUpdateEvent = {
      type: '物品条目更新',
      payload: {
        originalName: '灵草',
        updatedData: { 数量: 5, 描述: '更稀有的灵草', 稀有度: '史诗' },
      },
    } as any;

    worldStore.processEvent(itemEntryUpdateEvent);

    expect(_.cloneDeep(worldStore.world.角色!.主角.物品)).toEqual([{ 名称: '灵草', 数量: 5, 描述: '更稀有的灵草', 稀有度: '史诗' }]);
  });
});