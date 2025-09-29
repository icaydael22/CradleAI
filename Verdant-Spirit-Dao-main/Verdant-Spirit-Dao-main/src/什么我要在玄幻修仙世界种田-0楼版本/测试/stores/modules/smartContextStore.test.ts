import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSmartContextStore } from '../../../stores/modules/smartContextStore';
import { useWorldStore } from '../../../stores/core/worldStore';
import { useHistoryStore } from '../../../stores/ui/historyStore';
import { useSearchStore } from '../../../stores/modules/searchStore';
import _ from 'lodash';

// Mocking dependencies
vi.mock('../../../stores/core/worldStore');
vi.mock('../../../stores/ui/historyStore');
vi.mock('../../../stores/modules/searchStore');
vi.mock('../../../core/variables', () => ({
  getVariables: vi.fn().mockResolvedValue({}),
  updateVariables: vi.fn().mockResolvedValue(undefined),
}));

describe('stores/modules/smartContextStore.ts', () => {
  let smartContextStore: ReturnType<typeof useSmartContextStore>;
  let mockWorldStore: ReturnType<typeof useWorldStore>;
  let mockHistoryStore: ReturnType<typeof useHistoryStore>;
  let mockSearchStore: ReturnType<typeof useSearchStore>;

  const mockPokedexData = {
    '物品': [
      { '名称': '潮汐木芯', '描述': '一种坚硬的木头。' },
      { '名称': '火焰花', '描述': '会发光的植物。' },
    ],
    '地点': [
      { '名称': '迷雾森林', '描述': '一个充满迷雾的森林。' },
    ],
  };

  const mockSearchResults = [
    { item: { id: '世界.图鉴.物品.潮汐木芯' }, score: 0.1 },
    { item: { id: '世界.图鉴.地点.迷雾森林' }, score: 0.5 }, // score > 0.4, should be filtered out
  ];

  beforeEach(() => {
    setActivePinia(createPinia());

    // Mock implementations
    vi.mocked(useWorldStore).mockReturnValue({
      world: {
        图鉴: mockPokedexData,
      },
    } as any);

    vi.mocked(useHistoryStore).mockReturnValue({
      turns: { length: 100 }, // Current turn is 100
    } as any);

    vi.mocked(useSearchStore).mockReturnValue({
      search: vi.fn().mockReturnValue(mockSearchResults),
    } as any);

    smartContextStore = useSmartContextStore();
    mockWorldStore = useWorldStore();
    mockHistoryStore = useHistoryStore();
    mockSearchStore = useSearchStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    expect(smartContextStore.knowledgeStats).toEqual({});
    expect(smartContextStore.linkerProfile).toEqual({});
    expect(smartContextStore.lastUserInput).toBe('');
    expect(smartContextStore.isEnabled).toBe(false);
  });

  describe('processUserInput', () => {
    it('should call searchStore.search with user input', () => {
      const userInput = '关于潮汐木芯';
      smartContextStore.processUserInput(userInput);
      expect(mockSearchStore.search).toHaveBeenCalledWith('knowledge', userInput);
    });

    it('should update lastUserInput state', () => {
      const userInput = '这是新的输入';
      smartContextStore.processUserInput(userInput);
      expect(smartContextStore.lastUserInput).toBe(userInput);
    });

    it('should increment frequency for referenced entries', () => {
      // Initial state
      smartContextStore.knowledgeStats = {
        '世界.图鉴.物品.潮汐木芯': { frequency: 5, lastSentTurn: 10 },
      };
      
      const userInput = '关于潮汐木芯';
      smartContextStore.processUserInput(userInput);

      // referencedIdsThisTurn should find '潮汐木芯' from the mocked search results
      const stats = smartContextStore.knowledgeStats['世界.图鉴.物品.潮汐木芯'];
      expect(stats.frequency).toBe(6);
    });

    it('should create a new entry in knowledgeStats if referenced for the first time', () => {
      const userInput = '关于潮汐木芯';
      smartContextStore.processUserInput(userInput);
      
      const stats = smartContextStore.knowledgeStats['世界.图鉴.物品.潮汐木芯'];
      expect(stats).toBeDefined();
      expect(stats.frequency).toBe(1);
      expect(stats.lastSentTurn).toBe(-999);
    });
  });

  describe('Getters', () => {
    it('referencedIdsThisTurn should return only high-relevance results', () => {
      const userInput = '关于潮汐木芯';
      smartContextStore.processUserInput(userInput);
      
      const ids = smartContextStore.referencedIdsThisTurn;
      expect(ids.size).toBe(1);
      expect(ids.has('世界.图鉴.物品.潮汐木芯')).toBe(true);
      expect(ids.has('世界.图鉴.地点.迷雾森林')).toBe(false); // Filtered by score
    });
  });

  describe('injectedKnowledge', () => {
    const MOCK_ID_WOOD = '世界.图鉴.物品.潮汐木芯';
    const MOCK_ID_FLOWER = '世界.图鉴.物品.火焰花';
    const MOCK_ID_FOREST = '世界.图鉴.地点.迷雾森林';

    beforeEach(() => {
      // Reset search mock for granular control in these tests
      vi.mocked(mockSearchStore.search).mockReturnValue([]);
      smartContextStore.processUserInput(''); // Reset lastUserInput and search results
    });

    it('should force inject entries referenced this turn', () => {
      vi.mocked(mockSearchStore.search).mockReturnValue([
        { item: { id: MOCK_ID_WOOD }, score: 0.1 }
      ]);
      smartContextStore.processUserInput('给我木头');

      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(1);
      expect(injected[0].名称).toBe('潮汐木芯');
    });

    it('should inject high-frequency entries', () => {
      smartContextStore.knowledgeStats = {
        [MOCK_ID_FLOWER]: { frequency: 15, lastSentTurn: 90 }, // high freq > 10
      };
      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(1);
      expect(injected[0].名称).toBe('火焰花');
    });

    it('should inject medium-frequency entries when cooldown is over', () => {
      smartContextStore.knowledgeStats = {
        [MOCK_ID_FLOWER]: { frequency: 5, lastSentTurn: 95 }, // med freq > 3, cooldown is 3, 100 - 95 > 3
      };
      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(1);
      expect(injected[0].名称).toBe('火焰花');
    });

    it('should NOT inject medium-frequency entries during cooldown', () => {
      smartContextStore.knowledgeStats = {
        [MOCK_ID_FLOWER]: { frequency: 5, lastSentTurn: 98 }, // med freq > 3, cooldown is 3, 100 - 98 < 3
      };
      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(0);
    });

    it('should inject low-frequency entries when cooldown is over', () => {
      smartContextStore.knowledgeStats = {
        [MOCK_ID_FLOWER]: { frequency: 2, lastSentTurn: 80 }, // low freq, cooldown is 10, 100 - 80 > 10
      };
      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(1);
      expect(injected[0].名称).toBe('火焰花');
    });

    it('should NOT inject low-frequency entries during cooldown', () => {
      smartContextStore.knowledgeStats = {
        [MOCK_ID_FLOWER]: { frequency: 2, lastSentTurn: 95 }, // low freq, cooldown is 10, 100 - 95 < 10
      };
      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(0);
    });

    it('should combine forced, high-frequency, and cooled-down entries correctly', () => {
      // 1. Forced
      vi.mocked(mockSearchStore.search).mockReturnValue([
        { item: { id: MOCK_ID_WOOD }, score: 0.1 }
      ]);
      smartContextStore.processUserInput('给我木头');

      // 2. High-freq (should be injected)
      // 3. Cooled-down (should be injected)
      // 4. On cooldown (should NOT be injected)
      smartContextStore.knowledgeStats = {
        ...smartContextStore.knowledgeStats,
        [MOCK_ID_FLOWER]: { frequency: 11, lastSentTurn: 99 }, // High Freq
        [MOCK_ID_FOREST]: { frequency: 4, lastSentTurn: 90 }, // Med Freq, Cooldown over
        '世界.图鉴.物品.不存在的物品': { frequency: 4, lastSentTurn: 98 }, // Med Freq, On Cooldown
      };

      const injected = smartContextStore.injectedKnowledge;
      const injectedNames = injected.map(item => item.名称);

      expect(injected.length).toBe(3);
      expect(injectedNames).toContain('潮汐木芯'); // Forced
      expect(injectedNames).toContain('火焰花');   // High Freq
      expect(injectedNames).toContain('迷雾森林'); // Cooled down
    });

    it('should update lastSentTurn for all injected entries', () => {
      smartContextStore.knowledgeStats = {
        [MOCK_ID_FLOWER]: { frequency: 15, lastSentTurn: 90 },
        [MOCK_ID_WOOD]: { frequency: 5, lastSentTurn: 95 },
      };

      // Trigger the computed property calculation
      const injected = smartContextStore.injectedKnowledge;
      expect(injected.length).toBe(2);

      // Check the state after calculation
      const currentTurn = mockHistoryStore.turns.length;
      expect(smartContextStore.knowledgeStats[MOCK_ID_FLOWER].lastSentTurn).toBe(currentTurn);
      expect(smartContextStore.knowledgeStats[MOCK_ID_WOOD].lastSentTurn).toBe(currentTurn);
    });
  });

  describe('rebuildStateFromHistory', () => {
    const mockMessages: any[] = [
      // Turn 1: User references an entry by its exact name. Linker then learns a new keyword for it.
      { role: 'user', content: '你好，给我一些潮汐木芯' }, // turn 1
      { role: 'assistant', pluginEvents: [
        {
          type: 'ContextLinkerRan',
          turn: 1,
          analyzedIds: ['世界.图鉴.物品.潮汐木芯', '世界.图鉴.物品.火焰花'],
          updates: [
            { id: '世界.图鉴.物品.潮汐木芯', newKeywords: ['硬木头'] }
          ]
        }
      ]},
      // Turn 2: User references the entry using the newly learned keyword.
      { role: 'user', content: '我需要一些硬木头' }, // turn 2
      { role: 'assistant', pluginEvents: [] },
      // Turn 3: User references another entry by name.
      { role: 'user', content: '我要去迷雾森林' }, // turn 3
      { role: 'assistant', pluginEvents: [
        {
          type: 'ContextLinkerRan',
          turn: 3,
          analyzedIds: ['世界.图鉴.物品.火焰花'],
          updates: [] // miss
        }
      ]},
    ];

    it('should correctly rebuild knowledgeStats and linkerProfile from history', () => {
      // The `rebuildStateFromHistory` function relies on `allKeywordsMap` which in turn relies on `worldStore`.
      // The mock for `worldStore` is already provided in `beforeEach`, so `allKeywordsMap` will be computed correctly
      // based on the pokedex entry names. This test ensures the chronological processing is correct.

      smartContextStore.rebuildStateFromHistory(mockMessages);

      // Verify knowledgeStats
      const stats = smartContextStore.knowledgeStats;
      // '潮汐木芯' should be referenced in turn 1 (by name) and turn 2 (by new keyword)
      expect(stats['世界.图鉴.物品.潮汐木芯']).toBeDefined();
      expect(stats['世界.图鉴.物品.潮汐木芯'].frequency).toBe(2);
      // '迷雾森林' should be referenced in turn 3
      expect(stats['世界.图鉴.地点.迷雾森林']).toBeDefined();
      expect(stats['世界.图鉴.地点.迷雾森林'].frequency).toBe(1);
      expect(stats['世界.图鉴.物品.火焰花']).toBeUndefined();

      // Verify linkerProfile
      const profile = smartContextStore.linkerProfile;
      const woodProfile = profile['世界.图鉴.物品.潮汐木芯'];
      expect(woodProfile.dynamicKeywords).toEqual(['硬木头']);
      expect(woodProfile.lastAnalyzedTurn).toBe(1);
      expect(woodProfile.missCount).toBe(0);

      const flowerProfile = profile['世界.图鉴.物品.火焰花'];
      expect(flowerProfile.dynamicKeywords).toEqual([]);
      expect(flowerProfile.lastAnalyzedTurn).toBe(3);
      expect(flowerProfile.missCount).toBe(2);
    });
  });
});
