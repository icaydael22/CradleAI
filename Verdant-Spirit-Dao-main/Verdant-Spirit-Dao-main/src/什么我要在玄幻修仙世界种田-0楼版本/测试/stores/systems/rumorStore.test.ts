import * as generation from '@/core/generation';
import { useWorldStore } from '@/stores/core/worldStore';
import { useCharacterStore } from '@/stores/facades/characterStore';
import { useRumorStore } from '@/stores/systems/rumorStore';
import { useTimeStore } from '@/stores/systems/timeStore';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the generation module
vi.mock('@/core/generation', () => ({
  generateAndParseJson: vi.fn(),
}));

describe('Rumor Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Mock global toastr to prevent ReferenceError in test environment
    (global as any).toastr = {
      error: vi.fn(),
    };

    // It's crucial to spy on the actions *after* the pinia instance is created and stores are available.
    const worldStore = useWorldStore();
    const timeStore = useTimeStore(); // Get timeStore instance
    vi.spyOn(worldStore, 'updateWorldview').mockResolvedValue();
    vi.spyOn(worldStore, 'updateWorldState').mockResolvedValue();
    // Mock currentDateString directly
    vi.spyOn(timeStore, 'currentDateString', 'get').mockReturnValue('第 1 天 卯时');
  });

  it('onNewDay should trigger rumor generation on a lucky day', async () => {
    const rumorStore = useRumorStore();
    const worldStore = useWorldStore();
    const timeStore = useTimeStore(); // Get timeStore instance
    const characterStore = useCharacterStore();

    // Setup mock state directly on the source of truth: worldStore
    worldStore.$state.world = {
      ...worldStore.$state.world,
      地点: '新手村',
      地图: { regions: { 'village_01': { name: '新手村' } } } as any,
      时间: { day: 1, timeOfDay: '卯时', season: '春', solarTerm: '立春', weather: '晴朗' },
    };
    characterStore.$state = {
      ...characterStore.$state,
      mainCharacterName: '主角',
      characters: { '主角': { 姓名: '主角' } } as any,
    };

    const mockRumors = [
      {
        content: '听说村口的井闹鬼了。',
        source_location: '新手村',
        related_entities: ['井'],
        type: 'hook',
      },
    ];

    vi.spyOn(generation, 'generateAndParseJson').mockResolvedValue(mockRumors);
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    await rumorStore.onNewDay({ newDay: 2 });

    expect(generation.generateAndParseJson).toHaveBeenCalled();
    expect(worldStore.updateWorldview).toHaveBeenCalledWith({
      rumors: expect.arrayContaining([
        expect.objectContaining({
          content: '听说村口的井闹鬼了。',
          created_date: '第 1 天 卯时',
        }),
      ]),
    });
  });

  it('should handle worldview updates correctly', async () => {
    const rumorStore = useRumorStore();
    const worldStore = useWorldStore();
    const timeStore = useTimeStore(); // Get timeStore instance
    const characterStore = useCharacterStore();

    // Setup mock state directly on the source of truth: worldStore
    worldStore.$state.world = {
      ...worldStore.$state.world,
      地点: '新手村',
      地图: { regions: { 'village_01': { name: '新手村' } } } as any,
      时间: { day: 2, timeOfDay: '辰时', season: '春', solarTerm: '立春', weather: '晴朗' },
    };
    characterStore.$state = {
      ...characterStore.$state,
      mainCharacterName: '主角',
      characters: { '主角': { 姓名: '主角' } } as any,
    };

    // Mock currentDateString for this specific test
    vi.spyOn(timeStore, 'currentDateString', 'get').mockReturnValue('第 2 天 辰时');

    const mockWorldviewUpdate = [
      {
        content: '{"path":"地图.regions.village_01.description","value":"村子被一层神秘的薄雾笼罩。"}',
        source_location: '新手村',
        related_entities: ['新手村'],
        type: 'worldview',
      },
    ];

    vi.spyOn(generation, 'generateAndParseJson').mockResolvedValue(mockWorldviewUpdate);
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    await rumorStore.onNewDay({ newDay: 3 });

    expect(worldStore.updateWorldState).toHaveBeenCalledWith('地图.regions.village_01.description', '村子被一层神秘的薄雾笼罩。');
    expect(worldStore.updateWorldview).toHaveBeenCalledWith({
      rumors: expect.arrayContaining([
        expect.objectContaining({
          content: '听说新手村发生了些变化。',
          type: 'lore',
          created_date: '第 2 天 辰时',
        }),
      ]),
    });
  });

  it('should not generate rumors on an unlucky day', async () => {
    const rumorStore = useRumorStore();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await rumorStore.onNewDay({ newDay: 4 });

    expect(generation.generateAndParseJson).not.toHaveBeenCalled();
  });

  describe('Robustness and Error Handling', () => {
    it('should handle errors from generateAndParseJson gracefully', async () => {
      const rumorStore = useRumorStore();
      const worldStore = useWorldStore();
      worldStore.$state.world = { ...worldStore.$state.world, 地点: '测试地点' };
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // Lucky day
      const testError = new Error('LLM Error');
      vi.spyOn(generation, 'generateAndParseJson').mockRejectedValue(testError);

      await rumorStore.onNewDay({ newDay: 5 });

      expect((global as any).toastr.error).toHaveBeenCalledWith(
        `传闻生成失败: ${testError}`,
        '错误',
      );
    });

    it('should not call worldStore methods if generateAndParseJson returns an empty array', async () => {
      const rumorStore = useRumorStore();
      const worldStore = useWorldStore();
      worldStore.$state.world = { ...worldStore.$state.world, 地点: '测试地点' };
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // Lucky day
      vi.spyOn(generation, 'generateAndParseJson').mockResolvedValue([]);

      await rumorStore.onNewDay({ newDay: 6 });

      expect(worldStore.updateWorldview).not.toHaveBeenCalled();
      expect(worldStore.updateWorldState).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON in worldview rumor content', async () => {
      const rumorStore = useRumorStore();
      const worldStore = useWorldStore();
      worldStore.$state.world = { ...worldStore.$state.world, 地点: '测试地点' };
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      const invalidWorldviewUpdate = [{
        type: 'worldview',
        content: 'not a valid json',
      }];
      vi.spyOn(generation, 'generateAndParseJson').mockResolvedValue(invalidWorldviewUpdate);

      await rumorStore.onNewDay({ newDay: 7 });

      expect((global as any).toastr.error).toHaveBeenCalledWith(
        '收到了格式不正确的“世界观更新”传闻，内容无法被解析为JSON。',
      );
    });

    it('should handle worldview rumor with missing path or value', async () => {
      const rumorStore = useRumorStore();
      const worldStore = useWorldStore();
      worldStore.$state.world = { ...worldStore.$state.world, 地点: '测试地点' };
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      const incompleteWorldviewUpdate = [{
        type: 'worldview',
        content: '{"path":"some.path"}', // Missing value
      }, {
        type: 'worldview',
        content: '{"value":"some.value"}', // Missing path
      }];
      vi.spyOn(generation, 'generateAndParseJson').mockResolvedValue(incompleteWorldviewUpdate);

      await rumorStore.onNewDay({ newDay: 8 });

      expect(worldStore.updateWorldState).not.toHaveBeenCalled();
    });

    it('should not generate rumors if location is missing', async () => {
      const rumorStore = useRumorStore();
      const worldStore = useWorldStore();
      // Explicitly set world to an object without a '地点' property
      worldStore.world = {
        时间: { day: 1, timeOfDay: '上午', season: '春', solarTerm: '惊蛰', weather: '晴朗' },
      };
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      await rumorStore.onNewDay({ newDay: 9 });

      expect(generation.generateAndParseJson).not.toHaveBeenCalled();
    });


    it('should still generate rumors if map is missing but location exists', async () => {
      const rumorStore = useRumorStore();
      const worldStore = useWorldStore();
      const characterStore = useCharacterStore();

      worldStore.world = {
        地点: '新手村',
        地图: undefined, // No map
      };
      
      characterStore.$state = {
        mainCharacterName: '主角',
        characters: { '主角': { 姓名: '主角' } as any },
      };

      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      vi.spyOn(generation, 'generateAndParseJson').mockResolvedValue([]);

      await rumorStore.onNewDay({ newDay: 10 });

      expect(generation.generateAndParseJson).toHaveBeenCalled();
    });

  });
});