import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { useWorldStore } from '@/stores/core/worldStore';
import { useQuestStore, type Quest } from '@/stores/systems/questStore';
import { logger } from '@/core/logger';

// Mock dependencies
vi.mock('@/stores/core/worldStore');
vi.mock('@/core/logger');

const mockInitialQuestList: Quest[] = [
  { id: 'q_001', 名称: '修复庇护所', 描述: '...', 状态: '进行中' },
  { id: 'q_002', 名称: '收集草药', 描述: '...', 状态: '进行中' },
  { id: 'q_003', 名称: '往日的荣耀', 描述: '...', 状态: '已完成' },
  { id: 'q_004', 名称: '迷失的商队', 描述: '...', 状态: '失败' },
];

describe('useQuestStore', () => {
  let worldStore: ReturnType<typeof useWorldStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks(); // Reset all mocks before each test

    worldStore = {
      world: {
        任务列表: _.cloneDeep(mockInitialQuestList),
      },
      registerEventHandler: vi.fn(),
    } as any;

    vi.mocked(useWorldStore).mockReturnValue(worldStore);

    // Mock global toastr
    (global as any).toastr = {
      error: vi.fn(),
    };
  });

  // --- Getters and Computed Properties ---
  describe('Getters', () => {
    it('should derive all quests correctly', () => {
      const questStore = useQuestStore();
      expect(questStore.quests).toHaveLength(4);
    });

    it('should derive ongoing quests', () => {
      const questStore = useQuestStore();
      expect(questStore.ongoingQuests).toHaveLength(2);
      expect(questStore.ongoingQuests.map(q => q.id)).toEqual(['q_001', 'q_002']);
    });

    it('should derive completed quests', () => {
      const questStore = useQuestStore();
      expect(questStore.completedQuests).toHaveLength(1);
      expect(questStore.completedQuests[0].id).toBe('q_003');
    });

    it('should derive failed quests', () => {
      const questStore = useQuestStore();
      expect(questStore.failedQuests).toHaveLength(1);
      expect(questStore.failedQuests[0].id).toBe('q_004');
    });

    it('should return empty arrays if quest list is missing', () => {
      worldStore.world.任务列表 = undefined;
      const questStore = useQuestStore();
      expect(questStore.quests).toEqual([]);
      expect(questStore.ongoingQuests).toEqual([]);
    });
  });

  // --- Event Handlers (Testing the core logic directly) ---
  describe('Event Handlers', () => {
    let handlers: Record<string, (event: any, worldState: any) => void> = {};

    beforeEach(() => {
      handlers = {};
      vi.mocked(worldStore.registerEventHandler).mockImplementation((eventType, handler) => {
        handlers[eventType] = handler;
      });
      // The `initialize` method in the store is what sets up the handlers.
      const questStore = useQuestStore();
      questStore.initialize();
    });

    it('handleNewQuest should add a valid new quest', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const newQuestEvent = {
        payload: { id: 'q_005', 名称: '探索洞穴', 描述: '一个神秘的洞穴。' },
      };

      handlers['新任务接收'](newQuestEvent, worldState);

      expect(worldState.任务列表).toHaveLength(5);
      const newQuest = worldState.任务列表.find(q => q.id === 'q_005');
      expect(newQuest).toBeDefined();
      expect(newQuest?.状态).toBe('进行中');
    });

    it('handleNewQuest should not add a quest with a duplicate id', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const duplicateQuestEvent = {
        payload: { id: 'q_001', 名称: '重复的任务', 描述: '...' },
      };

      handlers['新任务接收'](duplicateQuestEvent, worldState);

      expect(worldState.任务列表).toHaveLength(4);
      expect(logger).toHaveBeenCalledWith('warn', 'QuestStore', expect.stringContaining('already exists'));
    });

    it('handleNewQuest should not add a quest with invalid data', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const invalidQuestEvent = {
        payload: { 名称: '没有ID的任务', 描述: '...' }, // Missing 'id'
      };

      handlers['新任务接收'](invalidQuestEvent, worldState);

      expect(worldState.任务列表).toHaveLength(4);
      
      // Check that at least one of the calls to logger was an error call with the correct message.
      // This is more robust than toHaveBeenCalledWith, which checks all arguments.
      const loggerCalls = vi.mocked(logger).mock.calls;
      const errorCall = loggerCalls.find(call => 
        call[0] === 'error' && 
        call[1] === 'QuestStore' && 
        typeof call[2] === 'string' &&
        call[2].includes('Invalid quest data received')
      );
      expect(errorCall).toBeDefined();
    });

    it('handleQuestProgress should update a quest\'s progress and description', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const progressEvent = {
        payload: {
          id: 'q_001',
          进度: { value: 50, max: 100, text: '50%' },
          描述: '庇护所的修复工作已完成一半。',
        },
      };

      handlers['任务进度更新'](progressEvent, worldState);

      const updatedQuest = worldState.任务列表.find(q => q.id === 'q_001');
      expect(updatedQuest?.描述).toBe('庇护所的修复工作已完成一半。');
      expect(updatedQuest?.进度).toEqual({ value: 50, max: 100, text: '50%' });
    });

    it('handleQuestComplete should change a quest\'s status to "已完成"', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const completeEvent = { payload: { id: 'q_002' } };

      handlers['任务完成'](completeEvent, worldState);

      const completedQuest = worldState.任务列表.find(q => q.id === 'q_002');
      expect(completedQuest?.状态).toBe('已完成');
    });

    it('handleQuestFail should change a quest\'s status to "失败"', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const failEvent = { payload: { id: 'q_001' } };

      handlers['任务失败'](failEvent, worldState);

      const failedQuest = worldState.任务列表.find(q => q.id === 'q_001');
      expect(failedQuest?.状态).toBe('失败');
    });

    it('should not throw an error when trying to update a non-existent quest', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const nonExistentEvent = { payload: { id: 'q_999' } };

      // Wrap in a function to test that it doesn't throw
      const action = () => handlers['任务完成'](nonExistentEvent, worldState);

      expect(action).not.toThrow();
      expect(logger).toHaveBeenCalledWith('warn', 'QuestStore', expect.stringContaining('not found'));
    });

    it('should update quest by name if id is not found', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const progressEvent = {
        payload: {
          id: '修复庇护所', // Using name instead of id
          进度: { value: 75, max: 100, text: '75%' },
        },
      };

      handlers['任务进度更新'](progressEvent, worldState);

      const updatedQuest = worldState.任务列表.find(q => q.id === 'q_001');
      expect(updatedQuest?.进度).toEqual({ value: 75, max: 100, text: '75%' });
    });

    it('should handle alias event "任务接收" for new quests', () => {
      const worldState = { 任务列表: _.cloneDeep(mockInitialQuestList) };
      const newQuestEvent = {
        payload: { id: 'q_006', 名称: '别名任务', 描述: '...' },
      };

      handlers['任务接收'](newQuestEvent, worldState);

      expect(worldState.任务列表).toHaveLength(5);
      expect(worldState.任务列表.find(q => q.id === 'q_006')).toBeDefined();
    });

    it('should work correctly if the initial quest list is undefined', () => {
      const worldState = { 任务列表: undefined };
      const newQuestEvent = {
        payload: { id: 'q_001', 名称: '第一个任务', 描述: '...' },
      };

      // This should create the list and add the quest
      handlers['新任务接收'](newQuestEvent, worldState as any);

      expect(worldState.任务列表).toBeDefined();
      expect(worldState.任务列表).toHaveLength(1);
      // @ts-ignore
      expect(worldState.任务列表[0].id).toBe('q_001');
    });
  });
});
