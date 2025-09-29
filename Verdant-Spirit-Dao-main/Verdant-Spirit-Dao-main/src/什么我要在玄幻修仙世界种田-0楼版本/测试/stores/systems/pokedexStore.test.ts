import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick, reactive } from 'vue';
import { useWorldStore } from '@/stores/core/worldStore';
import { usePokedexStore } from '@/stores/systems/pokedexStore';
import { useEventLogStore } from '@/stores/core/eventLogStore';
import { useAppStore } from '@/stores/app/appStore';
import { PokedexEntry, PokedexType } from '@/core/pokedex';

// Mock external dependencies
// Ensure the mock returns the same instance every time
const mockEventLogStore = reactive({
  addEvents: vi.fn(),
  allEvents: [],
});
vi.mock('@/stores/core/eventLogStore', () => ({
  useEventLogStore: vi.fn(() => mockEventLogStore),
}));

vi.mock('@/stores/app/appStore', () => ({
  useAppStore: vi.fn(() => ({
    floorId: 'test_floor_id',
  })),
}));

// Mocks for dynamically imported stores must be defined at the module level
// before the describe block, because vi.mock gets hoisted.
const mockSettingsStore = {
  settings: {
    autoCompletePokedex: true,
    pokedexCompletionProfileId: 'test-profile',
  },
};
const mockItemStore = {
  items: [],
};

vi.mock('@/stores/ui/settingsStore', () => ({
  useSettingsStore: () => mockSettingsStore,
}));
vi.mock('@/stores/facades/itemStore', () => ({
  useItemStore: () => mockItemStore,
}));
vi.mock('@/core/secondaryLlmApi', () => ({
  generateWithSecondaryApi: vi.fn(),
}));

// Mock global functions and objects
const mockPokedexManager = {
  getPokedexData: vi.fn(),
  getSystemData: vi.fn(),
  createPokedexEntry: vi.fn().mockResolvedValue(true),
  deleteAchievement: vi.fn().mockResolvedValue(true),
  deletePokedexEntry: vi.fn().mockResolvedValue(true),
  updateAchievement: vi.fn().mockResolvedValue(true),
  updatePokedexEntry: vi.fn().mockResolvedValue(true),
  createAchievement: vi.fn().mockResolvedValue(true),
};

const mockToastr = {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
};

const mockPokedexData = {
  妖兽: [
    { 名称: '赤尾狐', 类别: '妖兽', status: 'known' },
    { 名称: '铁羽鹰', 类别: '妖兽', status: 'undiscovered' },
  ],
  植物: [
    { 名称: '凝血草', 类别: '植物', status: 'known' },
  ],
  物品: [],
  书籍: [],
};

describe('usePokedexStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Attach mocks to window
    (window as any).pokedexManager = mockPokedexManager;
    (window as any).toastr = mockToastr;
    (window as any)._ = {
        get: (obj: any, path: string, def: any) => {
            const result = path.split('.').reduce((o, k) => (o || {})[k], obj);
            return result === undefined ? def : result;
        },
        cloneDeep: (obj: any) => JSON.parse(JSON.stringify(obj)),
        isEmpty: (obj: any) => Object.keys(obj).length === 0,
        set: (obj: any, path: string, val: any) => {
            const keys = path.split('.');
            const lastKey = keys.pop();
            const parent = keys.reduce((o, k) => o[k] = o[k] || {}, obj);
            if(lastKey) parent[lastKey] = val;
        }
    };

    // Mock global functions
    (global as any).getVariables = vi.fn();
    (global as any).assignVariables = vi.fn();
    (global as any).replaceVariables = vi.fn();
    (global as any).confirm = vi.fn(() => true);


    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset the mock store's state before each test
    mockEventLogStore.allEvents = [];
    mockEventLogStore.addEvents.mockClear();
  });

   afterEach(() => {
    // Clean up mocks
    delete (window as any).pokedexManager;
    delete (window as any).toastr;
    delete (window as any)._;
    delete (global as any).getVariables;
    delete (global as any).assignVariables;
    delete (global as any).replaceVariables;
    delete (global as any).confirm;
  });

  describe('Getters', () => {
      it('should return empty arrays when pokedex data is not present in worldStore', () => {
        const pokedexStore = usePokedexStore();
        expect(pokedexStore.allEntries).toEqual([]);
        expect(pokedexStore.knownEntries).toEqual([]);
        expect(pokedexStore.getEntriesByType('妖兽')).toEqual([]);
      });
    
      it('should derive all entries from worldStore', () => {
        const worldStore = useWorldStore();
        worldStore.world = { 图鉴: mockPokedexData } as any;
        const pokedexStore = usePokedexStore();
        expect(pokedexStore.allEntries.length).toBe(3);
      });
    
      it('should derive known entries correctly', () => {
        const worldStore = useWorldStore();
        worldStore.world = { 图鉴: mockPokedexData } as any;
        const pokedexStore = usePokedexStore();
        expect(pokedexStore.knownEntries.length).toBe(2);
        expect(pokedexStore.knownEntries.map(e => e.名称)).toEqual(['赤尾狐', '凝血草']);
      });
    
      it('should get entries by type correctly', () => {
        const worldStore = useWorldStore();
        worldStore.world = { 图鉴: mockPokedexData } as any;
        const pokedexStore = usePokedexStore();
        const beasts = pokedexStore.getEntriesByType('妖兽');
        expect(beasts.length).toBe(2);
        expect(beasts.map((b: PokedexEntry) => b.名称)).toEqual(['赤尾狐', '铁羽鹰']);
      });
    
      it('should calculate discovery progress correctly', () => {
        const worldStore = useWorldStore();
        worldStore.world = { 图鉴: mockPokedexData } as any;
        const pokedexStore = usePokedexStore();
        const progress = pokedexStore.discoveryProgress;
        expect(progress.妖兽.known).toBe(1);
        expect(progress.妖兽.total).toBe(2);
        expect(progress.植物.known).toBe(1);
        expect(progress.植物.total).toBe(1);
        expect(progress.物品.known).toBe(0);
        expect(progress.物品.total).toBe(0);
      });
    
      it('should reactively update when a new entry is added', async () => {
        const worldStore = useWorldStore();
        worldStore.world = { 图鉴: JSON.parse(JSON.stringify(mockPokedexData)) } as any;
        const pokedexStore = usePokedexStore();
    
        expect(pokedexStore.getEntriesByType('妖兽').length).toBe(2);
    
        // Simulate adding a new beast
        if (worldStore.world?.图鉴?.妖兽) {
            worldStore.world.图鉴.妖兽.push({ 名称: '黑纹豹', 类别: '妖兽', status: 'known', 描述: '一只豹子' });
        }
    
        expect(pokedexStore.getEntriesByType('妖兽').length).toBe(3);
        expect(pokedexStore.knownEntries.length).toBe(3);
      });
  });

  describe('Actions', () => {
    describe('refreshAllData', () => {
        it('should log an error and return if pokedexManager is not available', async () => {
          (window as any).pokedexManager = undefined;
          const pokedexStore = usePokedexStore();
          await pokedexStore.refreshAllData();
          expect(mockToastr.error).toHaveBeenCalledWith('图鉴管理器未初始化，请刷新页面。');
          expect(pokedexStore.isLoading).toBe(false); // Should reset loading state
        });
    
        it('should handle DataCloneError gracefully when fetching variables', async () => {
          // Setup mocks
          mockPokedexManager.getPokedexData.mockResolvedValue({ 妖兽: [], 植物: [], 物品: [], 书籍: [] });
          mockPokedexManager.getSystemData.mockResolvedValue({ 已完成: [], 成就点数: 0 });
          
          const cloneError = new Error('DataCloneError');
          cloneError.name = 'DataCloneError';
          ((global as any).getVariables).mockImplementation(({ type }: { type: string }) => {
            if (type === 'global') {
              throw cloneError;
            }
            return {};
          });
    
          const pokedexStore = usePokedexStore();
          await pokedexStore.refreshAllData();
    
          // Assertions
          expect(pokedexStore.isLoading).toBe(false);
          expect(pokedexStore.pendingReviewItems).toEqual([]); // Should default to empty array
          // Check if other parts of the function still ran
          expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });
    
        it('should correctly calculate new discoveries', async () => {
          // Setup mocks
          const globalPokedex = {
            物品: [{ 名称: '金疮药', status: 'known' } as PokedexEntry],
            妖兽: [] as PokedexEntry[], 植物: [] as PokedexEntry[], 书籍: [] as PokedexEntry[],
          };
          const messagePokedex = {
            物品: [
              { 名称: '金疮药', status: 'known' },
              { 名称: '回元丹', status: 'known' }, // This is the new one
            ],
          };
          mockPokedexManager.getPokedexData.mockResolvedValue(globalPokedex);
          mockPokedexManager.getSystemData.mockResolvedValue({ 已完成: [], 成就点数: 0 });
          ((global as any).getVariables).mockImplementation(({ type }: { type: string }) => {
            if (type === 'message') {
              return { 世界: { 图鉴: messagePokedex } };
            }
            if (type === 'global') {
              return { 世界: { 系统: { 待审核图鉴: [] } } };
            }
            return {};
          });
    
          const pokedexStore = usePokedexStore();
          await pokedexStore.refreshAllData();
    
          expect(pokedexStore.newDiscoveries.length).toBe(1);
          expect(pokedexStore.newDiscoveries[0].type).toBe('物品');
          expect(pokedexStore.newDiscoveries[0].entry.名称).toBe('回元丹');
          expect(pokedexStore.isLoading).toBe(false);
        });
      });

      describe('approveDiscoveries', () => {
        it('should show a warning if no items are selected', async () => {
            const pokedexStore = usePokedexStore();
            await pokedexStore.approveDiscoveries([]);
            expect(mockToastr.warning).toHaveBeenCalledWith('请至少选择一个要收录的条目。');
            expect(mockPokedexManager.createPokedexEntry).not.toHaveBeenCalled();
        });

        it('should call createPokedexEntry for selected items and refresh data', async () => {
            const pokedexStore = usePokedexStore();
            const newDiscovery = { type: '物品' as PokedexType, entry: { 名称: '新物品' } as PokedexEntry };
            pokedexStore.newDiscoveries = [newDiscovery];
            
            // 我们不能在 setup store 中直接 spy 由另一个 action 调用的 action。
            // 因此，我们转而测试它的副作用。
            mockPokedexManager.getPokedexData.mockResolvedValue({ 妖兽: [], 植物: [], 物品: [], 书籍: [] });
            mockPokedexManager.getSystemData.mockResolvedValue({ 已完成: [], 成就点数: 0 });

            await pokedexStore.approveDiscoveries([{ type: '物品', name: '新物品' }]);

            expect(mockPokedexManager.createPokedexEntry).toHaveBeenCalledWith('物品', newDiscovery.entry);
            expect(mockToastr.success).toHaveBeenCalledWith('成功收录了 1 个新条目！');
            expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });
      });

      describe('deleteEntry', () => {
        it('should call deletePokedexEntry for a pokedex item and refresh', async () => {
            const pokedexStore = usePokedexStore();
            mockPokedexManager.getPokedexData.mockResolvedValue({ 妖兽: [], 植物: [], 物品: [], 书籍: [] });
            mockPokedexManager.getSystemData.mockResolvedValue({ 已完成: [], 成就点数: 0 });

            await pokedexStore.deleteEntry('物品', '旧物品');

            expect((global as any).confirm).toHaveBeenCalledWith('确定要删除 物品 图鉴中的 “旧物品” 吗？此操作不可撤销。');
            expect(mockPokedexManager.deletePokedexEntry).toHaveBeenCalledWith('物品', '旧物品');
            expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });

        it('should call deleteAchievement for an achievement and refresh', async () => {
            const pokedexStore = usePokedexStore();
            mockPokedexManager.getPokedexData.mockResolvedValue({ 妖兽: [], 植物: [], 物品: [], 书籍: [] });
            mockPokedexManager.getSystemData.mockResolvedValue({ 已完成: [], 成就点数: 0 });

            await pokedexStore.deleteEntry('成就', '旧成就');

            expect((global as any).confirm).toHaveBeenCalledWith('确定要删除 成就 图鉴中的 “旧成就” 吗？此操作不可撤销。');
            expect(mockPokedexManager.deleteAchievement).toHaveBeenCalledWith('旧成就');
            expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });

        it('should not delete if confirm is false', async () => {
            ((global as any).confirm).mockReturnValue(false);
            const pokedexStore = usePokedexStore();
            const refreshSpy = vi.spyOn(pokedexStore, 'refreshAllData').mockResolvedValue();

            await pokedexStore.deleteEntry('物品', '旧物品');

            expect(mockPokedexManager.deletePokedexEntry).not.toHaveBeenCalled();
            expect(refreshSpy).not.toHaveBeenCalled();
        });
      });

      describe('injectEntries', () => {
        it('should merge entries into the current message variables', async () => {
          const pokedexStore = usePokedexStore();
          const selectedItems = [{ type: '妖兽' as PokedexType, name: '赤尾狐' }];
          
          mockPokedexManager.getPokedexData.mockResolvedValue(mockPokedexData);
          ((global as any).getVariables).mockReturnValue({ 世界: { 图鉴: { 妖兽: [] } } });

          await pokedexStore.injectEntries(selectedItems);

          expect((global as any).replaceVariables).toHaveBeenCalledWith(
            {
              世界: {
                图鉴: {
                  妖兽: [mockPokedexData.妖兽.find(e => e.名称 === '赤尾狐')],
                },
              },
            },
            { type: 'message', message_id: 'test_floor_id' }
          );
          expect(mockToastr.success).toHaveBeenCalledWith('成功注入 1 个条目到当前楼层！');
        });

        it('should not inject duplicate entries', async () => {
          const pokedexStore = usePokedexStore();
          const selectedItems = [{ type: '妖兽' as PokedexType, name: '赤尾狐' }];
          
          mockPokedexManager.getPokedexData.mockResolvedValue(mockPokedexData);
          // Simulate that the entry already exists in the message
          const existingEntry = mockPokedexData.妖兽.find(e => e.名称 === '赤尾狐');
          ((global as any).getVariables).mockReturnValue({ 世界: { 图鉴: { 妖兽: [existingEntry] } } });

          await pokedexStore.injectEntries(selectedItems);

          // replaceVariables should have been called with the exact same data, effectively changing nothing.
          expect((global as any).replaceVariables).toHaveBeenCalledWith(
            {
              世界: {
                图鉴: {
                  妖兽: [existingEntry],
                },
              },
            },
            { type: 'message', message_id: 'test_floor_id' }
          );
        });
      });

      describe('createOrUpdateEntry', () => {
        it('should call createPokedexEntry when originalName is not provided', async () => {
          const pokedexStore = usePokedexStore();
          const newEntry = { 名称: '新妖兽' } as PokedexEntry;
          
          await pokedexStore.createOrUpdateEntry('妖兽', newEntry);

          expect(mockPokedexManager.createPokedexEntry).toHaveBeenCalledWith('妖兽', newEntry);
          expect(mockPokedexManager.updatePokedexEntry).not.toHaveBeenCalled();
          expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });

        it('should call updatePokedexEntry when originalName is provided', async () => {
          const pokedexStore = usePokedexStore();
          const updatedEntry = { 名称: '新名字' } as PokedexEntry;
          const originalName = '旧名字';

          await pokedexStore.createOrUpdateEntry('妖兽', updatedEntry, originalName);

          expect(mockPokedexManager.updatePokedexEntry).toHaveBeenCalledWith('妖兽', originalName, updatedEntry);
          expect(mockPokedexManager.createPokedexEntry).not.toHaveBeenCalled();
          expect(mockToastr.success).toHaveBeenCalledWith('成功更新条目: 新名字');
          expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });

        it('should call createAchievement for achievements', async () => {
           const pokedexStore = usePokedexStore();
           const newAchievement = { 名称: '新成就' } as any;

           await pokedexStore.createOrUpdateEntry('成就', newAchievement);

           expect(mockPokedexManager.createAchievement).toHaveBeenCalledWith(newAchievement);
           expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });

        it('should call updateAchievement for achievements', async () => {
           const pokedexStore = usePokedexStore();
           const updatedAchievement = { 名称: '更新成就' } as any;

           await pokedexStore.createOrUpdateEntry('成就', updatedAchievement, '旧成就');

           expect(mockPokedexManager.updateAchievement).toHaveBeenCalledWith('旧成就', updatedAchievement);
           expect(mockPokedexManager.getPokedexData).toHaveBeenCalled();
        });
      
      });
  
  describe('Event Handlers', () => {
    it('should call createOrUpdateEntry when handling a "图鉴条目更新" event', async () => {
      const pokedexStore = usePokedexStore();
      const updateEvent = {
        type: '图鉴条目更新',
        payload: {
          type: '物品',
          originalName: '旧物品',
          updatedData: { 名称: '新物品' },
        },
      };

      // Spy on the underlying manager method instead of the store action
      const updateSpy = vi.spyOn(mockPokedexManager, 'updatePokedexEntry');

      // Directly call the handler function
      await pokedexStore.handlePokedexEvent(updateEvent as any, {});

      expect(updateSpy).toHaveBeenCalledWith('物品', '旧物品', { 名称: '新物品' });
    });
  });

  describe('Auto Completion (scanAndCompleteMissingPokedex)', () => {
    beforeEach(async () => {
      // We need to reset the state of the mocks before each test
      mockSettingsStore.settings.autoCompletePokedex = true;
      mockItemStore.items = [];
      // Also clear mock function history
      const { generateWithSecondaryApi } = await import('@/core/secondaryLlmApi');
      (generateWithSecondaryApi as any).mockClear();
      vi.clearAllMocks();
    });

    it('should return early if auto-completion is disabled', async () => {
      mockSettingsStore.settings.autoCompletePokedex = false;
      const pokedexStore = usePokedexStore();
      await pokedexStore.scanAndCompleteMissingPokedex();
      const { generateWithSecondaryApi } = await import('@/core/secondaryLlmApi');
      expect(generateWithSecondaryApi).not.toHaveBeenCalled();
    });

    it('should not run if no items are missing', async () => {
      const worldStore = useWorldStore();
      worldStore.world = { 图鉴: { 物品: [{ 名称: '金疮药' }] } } as any;
      mockItemStore.items = [{ 名称: '金疮药' }] as any;
      const pokedexStore = usePokedexStore();
      await pokedexStore.scanAndCompleteMissingPokedex();
      const { generateWithSecondaryApi } = await import('@/core/secondaryLlmApi');
      expect(generateWithSecondaryApi).not.toHaveBeenCalled();
    });

    it('should call generateWithSecondaryApi for missing items', async () => {
      const worldStore = useWorldStore();
      worldStore.world = { 图鉴: { 物品: [] } } as any;
      mockItemStore.items = [{ 名称: '回元丹' }] as any;
      const { generateWithSecondaryApi } = await import('@/core/secondaryLlmApi');
      (generateWithSecondaryApi as any).mockResolvedValue('[]'); // Mock empty response
      
      const pokedexStore = usePokedexStore();
      // We need to use setTimeout to wait for the inner async operation
      vi.useFakeTimers();
      await pokedexStore.scanAndCompleteMissingPokedex();
      await vi.runAllTimersAsync();
      
      expect(generateWithSecondaryApi).toHaveBeenCalled();
      expect(mockToastr.info).toHaveBeenCalledWith('发现 1 个缺失的图鉴条目，将在5秒后尝试后台批量补全...');
      vi.useRealTimers();
    });

    it('should parse LLM response and add a "新图鉴发现" event', async () => {
      const worldStore = useWorldStore();
      worldStore.world = { 图鉴: { 物品: [] } } as any;
      mockItemStore.items = [{ 名称: '回元丹' }] as any;
      const eventLogStore = useEventLogStore();
      const llmResponse = `[
        {
          "类型": "物品",
          "数据": { "名称": "回元丹", "品阶": "凡品中阶", "描述": "...", "价值": { "基础价值": 10 } }
        }
      ]`;
      const { generateWithSecondaryApi } = await import('@/core/secondaryLlmApi');
      (generateWithSecondaryApi as any).mockResolvedValue(llmResponse);

      const pokedexStore = usePokedexStore();
      vi.useFakeTimers();
      await pokedexStore.scanAndCompleteMissingPokedex();
      await vi.runAllTimersAsync();

      // Expect addEvents to be called with an array containing one event object
      expect(eventLogStore.addEvents).toHaveBeenCalledWith([
        expect.objectContaining({
          type: '新图鉴发现',
          payload: {
            类型: '物品',
            数据: { 名称: '回元丹', 品阶: '凡品中阶', 描述: '...', 价值: { 基础价值: 10 } }
          }
        })
      ]);
      expect(mockToastr.success).toHaveBeenCalledWith('成功补全了 1 个图鉴条目！');
      vi.useRealTimers();
    });
  });
  });
});