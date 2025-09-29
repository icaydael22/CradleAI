import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { useWorldStore } from '@/stores/core/worldStore';
import { useBarterStore } from '@/stores/systems/barterStore';
import { useCharacterStore } from '@/stores/facades/characterStore';
import { useActionStore } from '@/stores/ui/actionStore';

// Hoist mocks for all dependent stores
vi.mock('@/stores/core/worldStore');
vi.mock('@/stores/facades/characterStore');
vi.mock('@/stores/ui/actionStore');

const getMockBarterData = () => ({
  名称: '黑市商人',
  上次刷新天数: 0,
  可换取的物品: [
    { 名称: '灵石', 数量: 1, 价值: { 基础价值: 10 } },
    { 名称: '铁矿石', 数量: 20, 价值: { 基础价值: 2 } },
  ],
});

const getMockMainCharacter = () => ({
  姓名: '主角',
  物品: [
    { 名称: '苹果', 数量: 5, 价值: { 基础价值: 1 } },
    { 名称: '铜币', 数量: 100, 价值: { 基础价值: 0.1 } },
  ],
});

// Helper function to set up the stores with specific state for each test
const getMockWorld = () => ({
  以物换物: getMockBarterData(),
  角色: {
    '主控角色名': '主角',
    '主角': getMockMainCharacter(),
  } as Record<string, any>,
  图鉴: { 物品: [] },
  时间: { day: 1, timeOfDay: '白天', season: '春', solarTerm: '春分', weather: '晴朗' },
});

// Helper function to set up the stores with specific state for each test
const setupStore = (worldStateChanges: any = {}) => {
    // Create a deep clone of the default world to avoid test pollution.
    // Then, merge the specific changes for the current test.
    const world = _.cloneDeep(getMockWorld());
    _.merge(world, worldStateChanges);

    // The _.merge function skips `undefined` properties, which can cause issues in tests
    // that explicitly check for `undefined` states (e.g., a character with no items).
    // This block manually ensures that if a test provides a `主角` object, it completely
    // replaces the default, including its properties like `物品`.
    if (worldStateChanges.角色 && Object.prototype.hasOwnProperty.call(worldStateChanges.角色, '主角')) {
        world.角色.主角 = worldStateChanges.角色.主角;
    }

    vi.mocked(useWorldStore).mockReturnValue({ world } as any);
    const mainCharacter = world.角色 ? world.角色[world.角色.主控角色名] : undefined;
    vi.mocked(useCharacterStore).mockReturnValue({ mainCharacter } as any);

    const actionStore = { triggerSystemAction: vi.fn() };
    vi.mocked(useActionStore).mockReturnValue(actionStore as any);

    (window as any).pokedexManager = {
        calculateItemValue: vi.fn((item: any) => _.get(item, '价值.基础价值', _.get(item, '价值')) || 0),
    };
    (window as any).toastr = { error: vi.fn(), warning: vi.fn() };

    return { barterStore: useBarterStore(), actionStore, world };
};


describe('useBarterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Computed Properties', () => {
    it('should calculate values correctly after selection', () => {
      const { barterStore } = setupStore();
      barterStore.toggleMyItemSelection('铜币'); // 10
      barterStore.toggleTraderItemSelection('铁矿石'); // 40
      
      expect(barterStore.myOfferValue).toBe(10);
      expect(barterStore.traderRequestValue).toBe(40);
    });

    it('should be balanced when offer is greater than or equal to request', () => {
        const { barterStore } = setupStore();
        barterStore.toggleMyItemSelection('铜币'); // 10
        barterStore.toggleTraderItemSelection('灵石'); // 10
        expect(barterStore.isTradeBalanced).toBe(true);
    });

    it('should be unbalanced when request value is 0', () => {
        const { barterStore } = setupStore();
        barterStore.toggleMyItemSelection('铜币');
        expect(barterStore.isTradeBalanced).toBe(false);
    });

    it('canRefresh should be true when cooldown is over', () => {
      const { barterStore } = setupStore({
        时间: { day: 11 },
        以物换物: { 上次刷新天数: 10 },
      });
      expect(barterStore.canRefresh).toBe(true);
    });

    it('canRefresh should be false when on cooldown', () => {
      const { barterStore } = setupStore({
        时间: { day: 11 },
        以物换物: { 上次刷新天数: 11 },
      });
      expect(barterStore.canRefresh).toBe(false);
    });
  });

  describe('getItemValue', () => {
    it('should use pokedexManager if item is in pokedex', () => {
      const { barterStore, world } = setupStore();
      (world.图鉴!.物品 as any[]) = [{ 名称: '灵石', 类别: '材料', 描述: '...', status: 'known' }];
      vi.mocked((window as any).pokedexManager.calculateItemValue).mockReturnValue(15);
      
      const value = barterStore.getItemValue({ 名称: '灵石' } as any);
      
      expect(value).toBe(15);
    });

    it('should handle numeric value property', () => {
        const { barterStore } = setupStore();
        const value = barterStore.getItemValue({ 名称: '数字价值物品', 价值: 7 } as any);
        expect(value).toBe(7);
    });

    describe('getItemValue Robustness', () => {
        it('should return 0 if pokedexManager is not available', () => {
            const { barterStore } = setupStore();
            (window as any).pokedexManager = undefined;
            const value = barterStore.getItemValue({ 名称: '任何物品', 价值: 10 } as any);
            expect(value).toBe(0);
        });

        it('should return 0 if item has no value and is not in pokedex', () => {
            const { barterStore } = setupStore();
            const value = barterStore.getItemValue({ 名称: '无价值物品' } as any);
            expect(value).toBe(0);
        });

        it('should handle malformed value property gracefully', () => {
            const { barterStore } = setupStore();
            const value1 = barterStore.getItemValue({ 名称: '物品1', 价值: '不是数字' } as any);
            const value2 = barterStore.getItemValue({ 名称: '物品2', 价值: { a: 1 } } as any);
            const value3 = barterStore.getItemValue({ 名称: '物品3', 价值: { 基础价值: '也不是数字' } } as any);
            expect(value1).toBe(0);
            expect(value2).toBe(0);
            expect(value3).toBe(0);
        });
    });
  });

  describe('Actions', () => {
    it('executeTrade should not trigger action if trade is unbalanced', async () => {
      const { barterStore, actionStore } = setupStore();
      barterStore.mySelectedItems = { '苹果': true }; // 5
      barterStore.traderSelectedItems = { '灵石': true }; // 10
      
      await barterStore.executeTrade();

      expect(actionStore.triggerSystemAction).not.toHaveBeenCalled();
    });

    it('executeTrade should trigger action with correct string if trade is balanced', async () => {
      const { barterStore, actionStore } = setupStore();
      
      barterStore.mySelectedItems = { '苹果': true, '铜币': true };
      barterStore.traderSelectedItems = { '灵石': true };
      vi.spyOn(barterStore, 'isTradeBalanced', 'get').mockReturnValue(true);

      await barterStore.executeTrade();
      
      const calls = (actionStore.triggerSystemAction as any).mock.calls;
      expect(calls.length).toBe(1);
      const actualString = calls[0][0]; // Correctly extract the string argument
      const option1 = '我提出了一笔交易，用【苹果x5, 铜币x100】交换【灵石】。';
      const option2 = '我提出了一笔交易，用【铜币x100, 苹果x5】交换【灵石】。';
      
      expect([option1, option2]).toContain(actualString);
    });

    it('refreshItems should not trigger action if cooldown is active', async () => {
      const { barterStore, actionStore } = setupStore({ 
          时间: { day: 10 },
          以物换物: { 上次刷新天数: 10 }
      });

      await barterStore.refreshItems();

      expect(actionStore.triggerSystemAction).not.toHaveBeenCalled();
    });

    it('refreshItems should trigger action if cooldown is over', async () => {
      const { barterStore, actionStore, world } = setupStore({ 
          时间: { day: 11 },
          以物换物: { 上次刷新天数: 10 }
      });

      await barterStore.refreshItems();

      const expectedString = `我决定看看【${world.以物换物!.名称}】今天有什么新货色。`;
      expect(actionStore.triggerSystemAction).toHaveBeenCalledWith(expectedString);
    });
  });

  describe('Robustness and Edge Cases', () => {
    it('myItems should return an empty array if mainCharacter or items are undefined', () => {
        // Test case 1: items are undefined
        const { barterStore } = setupStore({ 角色: { 主角: { 姓名: '主角', 物品: undefined } } });
        expect(barterStore.myItems).toEqual([]);

        // Test case 2: mainCharacter is undefined
        const { barterStore: barterStore2 } = setupStore({
            角色: {
                '主控角色名': '不存在的角色',
                '主角': undefined,
            },
        });
        expect(barterStore2.myItems).toEqual([]);
    });

    it('value calculation should handle items with missing or zero quantity', () => {
        const { barterStore } = setupStore({
            角色: {
                '主控角色名': '主角',
                主角: {
                    姓名: '主角',
                    物品: [
                        { 名称: '无数量物品', 价值: { 基础价值: 10 } }, // 数量 missing
                        { 名称: '零数量物品', 数量: 0, 价值: { 基础价值: 5 } },
                    ],
                },
            },
        });
        barterStore.toggleMyItemSelection('无数量物品');
        barterStore.toggleMyItemSelection('零数量物品');
        // 10 * 1 (default) + 5 * 0 = 10
        expect(barterStore.myOfferValue).toBe(10);
    });

    // it('executeTrade should generate correct string for empty offers/requests', async () => {
    //     const setupStoreWithMocks = (isBalanced: boolean) => {
    //         const { barterStore, actionStore } = setupStore();
    //         vi.spyOn(barterStore, 'isTradeBalanced', 'get').mockReturnValue(isBalanced);
    //         return { barterStore, actionStore };
    //     };

    //     /*
    //     // Test case 1: My items empty, trader items selected
    //     const { barterStore: barterStore1, actionStore: actionStore1 } = setupStoreWithMocks(true);
    //     barterStore1.mySelectedItems = {};
    //     barterStore1.traderSelectedItems = { '灵石': true };
    //     await barterStore1.executeTrade();
    //     expect(actionStore1.triggerSystemAction).toHaveBeenCalledWith('我提出了一笔交易，用【】交换【灵石】。');
        
    //     // Test case 2: My items selected, trader items empty
    //     const { barterStore: barterStore2, actionStore: actionStore2 } = setupStoreWithMocks(true);
    //     barterStore2.mySelectedItems = { '苹果': true };
    //     barterStore2.traderSelectedItems = {};
    //     await barterStore2.executeTrade();
    //     expect(actionStore2.triggerSystemAction).toHaveBeenCalledWith('我提出了一笔交易，用【苹果x5】交换【】。');
    //     */
    // });
  });
});