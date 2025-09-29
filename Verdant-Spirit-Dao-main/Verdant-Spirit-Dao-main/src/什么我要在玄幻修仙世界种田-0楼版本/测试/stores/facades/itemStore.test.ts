import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorldStore } from '@/stores/core/worldStore';
import { useItemStore } from '@/stores/facades/itemStore';
import { useEventLogStore } from '@/stores/core/eventLogStore';
import { useDetailsStore } from '@/stores/ui/detailsStore';
import { logger } from '@/core/logger';

// Mock stores
vi.mock('@/stores/core/eventLogStore');
vi.mock('@/stores/ui/detailsStore');
vi.mock('@/core/logger');

const mockMainCharacterWithItems = {
  '主控角色名': '主角',
  '主角': {
    姓名: '主角',
    物品: [
      { 名称: '苹果', 数量: 5, 价值: { 基础价值: 1 } },
      { 名称: '铁剑', 数量: 1, 价值: { 基础价值: 10 } },
    ],
  },
};

describe('useItemStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(useEventLogStore).mockReturnValue({
      addEvents: vi.fn(),
    } as any);
    vi.mocked(useDetailsStore).mockReturnValue({
      showDetails: vi.fn(),
    } as any);
  });

  it('should return an empty array if the main character has no items', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角', 物品: [] },
      },
    } as any;
    const itemStore = useItemStore();
    expect(itemStore.items).toEqual([]);
  });

  it('should return an empty array if there is no main character', () => {
    const itemStore = useItemStore();
    expect(itemStore.items).toEqual([]);
  });

  it('should derive the item list from the main character in worldStore', () => {
    const worldStore = useWorldStore();
    worldStore.world = { 角色: mockMainCharacterWithItems } as any;
    const itemStore = useItemStore();
    expect(itemStore.items.length).toBe(2);
    expect(itemStore.items.map((i: any) => i.名称)).toEqual(['苹果', '铁剑']);
  });

  it('should calculate total value correctly', () => {
    const worldStore = useWorldStore();
    worldStore.world = { 角色: mockMainCharacterWithItems } as any;
    const itemStore = useItemStore();
    // 5 * 1 + 1 * 10 = 15
    expect(itemStore.totalValue).toBe(15);
  });

  it('should return 0 value if there are no items', () => {
    const itemStore = useItemStore();
    expect(itemStore.totalValue).toBe(0);
  });

  it('should reactively update when an item is added', async () => {
    const worldStore = useWorldStore();
    worldStore.world = { 角色: mockMainCharacterWithItems } as any;
    const itemStore = useItemStore();

    expect(itemStore.items.length).toBe(2);

    // Simulate adding a new item
    worldStore.world.角色!.主角!.物品!.push({ 名称: '草药', 数量: 10, 价值: { 基础价值: 2 } });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(itemStore.items.length).toBe(3);
    expect(itemStore.totalValue).toBe(35); // 15 + 10 * 2
  });

  it('should trigger "物品条目更新" event when editItem is called', async () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: mockMainCharacterWithItems,
    } as any;
    const itemStore = useItemStore();
    const eventLogStore = useEventLogStore();
    const detailsStore = useDetailsStore();

    const originalItemName = '苹果';
    const updatedItemData = { 数量: 7, 描述: '新鲜的红苹果' };

    // Make the mock for showDetails call the callback
    vi.mocked(detailsStore.showDetails).mockImplementation((item, saveCallback) => {
      if (saveCallback) {
        saveCallback({ ...item, ...updatedItemData });
      }
    });

    itemStore.editItem(originalItemName);

    expect(detailsStore.showDetails).toHaveBeenCalledTimes(1);
    expect(eventLogStore.addEvents).toHaveBeenCalledTimes(1);

    const emittedEventCall = vi.mocked(eventLogStore.addEvents).mock.calls[0];
    const emittedEvent = emittedEventCall[0][0]; // Get the first event from the first argument of the first call

    expect(emittedEvent.type).toBe('物品条目更新');
    expect(emittedEvent.payload).toEqual({
      originalName: originalItemName,
      updatedData: expect.objectContaining({
        数量: updatedItemData.数量,
        描述: updatedItemData.描述,
      }),
    });
  });

  it('should not trigger any event if the item to edit does not exist', () => {
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: mockMainCharacterWithItems,
    } as any;
    const itemStore = useItemStore();
    const eventLogStore = useEventLogStore();
    const detailsStore = useDetailsStore();

    itemStore.editItem('不存在的物品');

    expect(detailsStore.showDetails).not.toHaveBeenCalled();
    expect(eventLogStore.addEvents).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith('error', 'itemStore', expect.stringContaining('Attempted to edit a non-existent item'));
  });
});
