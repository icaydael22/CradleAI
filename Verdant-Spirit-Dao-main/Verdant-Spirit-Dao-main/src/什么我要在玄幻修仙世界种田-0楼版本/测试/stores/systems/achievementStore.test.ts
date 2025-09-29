import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { useWorldStore } from '@/stores/core/worldStore';
import { useTimeStore } from '@/stores/systems/timeStore';
import { useActionStore } from '@/stores/ui/actionStore';
import { useAchievementStore } from '@/stores/systems/achievementStore';

import type { GameEvent } from '@/stores/core/eventLogStore';

// Mock dependencies
vi.mock('@/stores/core/worldStore');
vi.mock('@/stores/systems/timeStore');
vi.mock('@/stores/ui/actionStore');

const mockInitialAchievementState = {
  成就点数: 50,
  completed: {
    'achv_01': { id: 'achv_01', 名称: '初出茅庐', 描述: '...', 完成时间: '第 1 天', 点数: 10 },
  },
  奖励列表: [
    { id: 'reward_01', 名称: '小还丹', 描述: '...', 消耗点数: 20, 库存: 3 },
    { id: 'reward_02', 名称: '铁剑', 描述: '...', 消耗点数: 50, 库存: 1 },
  ],
  上次刷新天数: 1,
};

// Helper to create a mock GameEvent
const createMockEvent = (type: string, payload: any): GameEvent => ({
  type,
  payload,
  eventId: `evt_${Date.now()}`,
  sourceMessageId: 'msg_test',
});

describe('useAchievementStore', () => {
  let worldStore: ReturnType<typeof useWorldStore>;
  let timeStore: { day: number; timeOfDay: string }; // Use a plain object for easier mutation in tests
  let actionStore: ReturnType<typeof useActionStore>;

  beforeEach(() => {
    setActivePinia(createPinia());

    // Mock global toastr to prevent ReferenceError in test environment
    (global as any).toastr = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    };

    // Provide mock implementations for the stores
    worldStore = {
      world: {
        成就: _.cloneDeep(mockInitialAchievementState),
      },
      registerEventHandler: vi.fn(),
    } as any;

    // Use a plain, mutable object for the timeStore mock
    timeStore = {
      day: 10,
      timeOfDay: '午时',
    };

    actionStore = {
      triggerSystemAction: vi.fn(),
    } as any;

    vi.mocked(useWorldStore).mockReturnValue(worldStore);
    vi.mocked(useTimeStore).mockReturnValue(timeStore as any); // Use `as any` to satisfy the type checker
    vi.mocked(useActionStore).mockReturnValue(actionStore);
  });

  // --- Getters and Computed Properties ---
  describe('Getters', () => {
    it('should derive points correctly', () => {
      const achievementStore = useAchievementStore();
      expect(achievementStore.points).toBe(50);
    });

    it('should return 0 points if achievement data is missing', () => {
      worldStore.world.成就 = undefined;
      const achievementStore = useAchievementStore();
      expect(achievementStore.points).toBe(0);
    });

    it('should derive completed achievements as an array', () => {
      const achievementStore = useAchievementStore();
      expect(achievementStore.completedAchievements).toHaveLength(1);
      expect((achievementStore.completedAchievements[0] as any).id).toBe('achv_01');
    });

    it('should derive rewards correctly', () => {
      const achievementStore = useAchievementStore();
      expect(achievementStore.rewards).toHaveLength(2);
      expect(achievementStore.rewards[0].id).toBe('reward_01');
    });

    it('should calculate canRefresh correctly', () => {
      // --- Test Case 1: Cannot refresh ---
      // Pinia is already active from the global beforeEach
      timeStore.day = 10;
      let achievementStore = useAchievementStore();
      expect(achievementStore.canRefresh).toBe(false);
      expect(achievementStore.daysUntilRefresh).toBe(5);

      // --- Test Case 2: Can refresh (exactly 14 days later) ---
      // We must reset the entire Pinia instance to force re-creation of the store
      // and re-evaluation of its computed properties with the new mock value.
      setActivePinia(createPinia());
      vi.mocked(useWorldStore).mockReturnValue(worldStore);
      timeStore.day = 15; // Set the new time *before* the store is created
      vi.mocked(useTimeStore).mockReturnValue(timeStore as any);
      vi.mocked(useActionStore).mockReturnValue(actionStore);
      
      achievementStore = useAchievementStore(); // This now creates a NEW instance
      expect(achievementStore.canRefresh).toBe(true);
      expect(achievementStore.daysUntilRefresh).toBe(0);
      
      // --- Test Case 3: Can refresh (more than 14 days later) ---
      setActivePinia(createPinia());
      vi.mocked(useWorldStore).mockReturnValue(worldStore);
      timeStore.day = 20;
      vi.mocked(useTimeStore).mockReturnValue(timeStore as any);
      vi.mocked(useActionStore).mockReturnValue(actionStore);

      achievementStore = useAchievementStore();
      expect(achievementStore.canRefresh).toBe(true);
      expect(achievementStore.daysUntilRefresh).toBe(0);
    });
  });

  // --- Actions ---
  describe('Actions', () => {
    it('redeemReward should trigger a system action', async () => {
      const achievementStore = useAchievementStore();
      await achievementStore.redeemReward('reward_01');
      expect(actionStore.triggerSystemAction).toHaveBeenCalledWith('我决定兑换成就奖励：“小还丹”。');
    });

    it('refreshRewards should trigger a system action if allowed', async () => {
      const achievementStore = useAchievementStore();
      timeStore.day = 20; // Make refreshable
      await achievementStore.refreshRewards();
      expect(actionStore.triggerSystemAction).toHaveBeenCalledWith('我查看了一下成就奖励列表，看看有没有什么新东西。');
    });

    it('refreshRewards should not trigger a system action if on cooldown', async () => {
      const achievementStore = useAchievementStore();
      timeStore.day = 10; // Not refreshable
      await achievementStore.refreshRewards();
      expect(actionStore.triggerSystemAction).not.toHaveBeenCalled();
    });
  });

  // --- Event Handlers (Testing the core logic directly) ---
  describe('Event Handlers', () => {
    it('handleNewAchievement should add a new achievement and points', () => {
      const achievementStore = useAchievementStore();
      const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
      const newAchvEvent = createMockEvent('新成就', { id: 'achv_02', 名称: '新的征程', 描述: '...', 点数: 25 });
      timeStore.day = 11;
      timeStore.timeOfDay = '申时';

      achievementStore.handleNewAchievement(newAchvEvent, worldState);

      expect(worldState.成就.成就点数).toBe(75);
      expect((worldState.成就.completed as any)['achv_02']).toBeDefined();
      expect((worldState.成就.completed as any)['achv_02'].完成时间).toBe('第 11 天 申时');
    });
    
    it('handleNewAchievement should not add points if achievement already exists', () => {
      const achievementStore = useAchievementStore();
      const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
      const existingAchvEvent = createMockEvent('新成就', { id: 'achv_01', 名称: '初出茅庐-更新', 描述: '更新描述', 点数: 10 });

      achievementStore.handleNewAchievement(existingAchvEvent, worldState);

      // Points should NOT be added again
      expect(worldState.成就.成就点数).toBe(50);
      // Data should be updated, but completion time preserved
      expect(worldState.成就.completed['achv_01'].名称).toBe('初出茅庐-更新');
      expect(worldState.成就.completed['achv_01'].完成时间).toBe('第 1 天');
    });

    it('handleRewardUpdate should replace the rewards list and update refresh day', () => {
      const achievementStore = useAchievementStore();
      const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
      const newRewards = [
        { id: 'new_reward', 名称: '新的奖励', 消耗点数: 100, 库存: 1 },
      ];
      const rewardUpdateEvent = createMockEvent('成就奖励更新', newRewards);
      timeStore.day = 12;

      achievementStore.handleRewardUpdate(rewardUpdateEvent, worldState);

      expect(worldState.成就.奖励列表).toEqual(newRewards);
      expect(worldState.成就.上次刷新天数).toBe(12);
    });

    it('handleRewardRedemption should deduct points and stock', () => {
      const achievementStore = useAchievementStore();
      const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
      const redeemEvent = createMockEvent('成就奖励兑换', { id: 'reward_01', '消耗点数': 20 });

      achievementStore.handleRewardRedemption(redeemEvent, worldState);

      expect(worldState.成就.成就点数).toBe(30);
      expect(worldState.成就.奖励列表!.find(r => r.id === 'reward_01')!.库存).toBe(2);
    });

    it('handleRewardRedemption should fail if points are insufficient', () => {
      const achievementStore = useAchievementStore();
      const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
      const redeemEvent = createMockEvent('成就奖励兑换', { id: 'reward_02', '消耗点数': 50 });
      worldState.成就.成就点数 = 49; // Not enough points

      achievementStore.handleRewardRedemption(redeemEvent, worldState);

      // State should not change
      expect(worldState.成就.成就点数).toBe(49);
      expect(worldState.成就.奖励列表!.find(r => r.id === 'reward_02')!.库存).toBe(1);
    });

    it('handleRewardRedemption should fail if reward does not exist', () => {
      const achievementStore = useAchievementStore();
      const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
      const redeemEvent = createMockEvent('成就奖励兑换', { id: 'non_existent_reward', '消耗点数': 10 });

      achievementStore.handleRewardRedemption(redeemEvent, worldState);

      // State should not change
      expect(worldState.成就.成就点数).toBe(50);
    });

    describe('Robustness and Edge Cases', () => {
      it('handleNewAchievement should default points to 0 if missing', () => {
        const achievementStore = useAchievementStore();
        const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
        const newAchvEvent = createMockEvent('新成就', { id: 'achv_03', 名称: '无点数成就', 描述: '...' });
        achievementStore.handleNewAchievement(newAchvEvent, worldState);
        expect(worldState.成就.成就点数).toBe(50); // Points should not change
        expect((worldState.成就.completed as any)['achv_03']).toBeDefined();
      });

      it('handleNewAchievement should handle non-object payload gracefully', () => {
        const achievementStore = useAchievementStore();
        const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
        const invalidEvent = createMockEvent('新成就', [{ id: 'invalid' }]);
        achievementStore.handleNewAchievement(invalidEvent, worldState);
        expect(worldState.成就).toEqual(mockInitialAchievementState); // State should not change
        expect((global as any).toastr.error).toHaveBeenCalledWith('收到了格式不正确的“新成就”事件。');
      });

      it('handleRewardUpdate should handle non-array payload gracefully', () => {
        const achievementStore = useAchievementStore();
        const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
        const invalidEvent = createMockEvent('成就奖励更新', { id: 'not-an-array' });
        achievementStore.handleRewardUpdate(invalidEvent, worldState);
        expect(worldState.成就).toEqual(mockInitialAchievementState); // State should not change
        expect((global as any).toastr.error).toHaveBeenCalledWith('收到了格式不正确的“成就奖励更新”事件，内容不是数组。');
      });

      it('handleRewardRedemption should fail if reward list does not exist', () => {
        const achievementStore = useAchievementStore();
        const worldState: any = { 成就: _.cloneDeep(mockInitialAchievementState) };
        worldState.成就.奖励列表 = undefined;
        const redeemEvent = createMockEvent('成就奖励兑换', { id: 'reward_01', '消耗点数': 20 });
        achievementStore.handleRewardRedemption(redeemEvent, worldState);
        expect(worldState.成就.成就点数).toBe(50); // Points should not change
        expect((global as any).toastr.error).toHaveBeenCalledWith('尝试兑换成就奖励失败，奖励列表不存在。');
      });

      it('handleRewardRedemption should fail if reward stock is zero', () => {
        const achievementStore = useAchievementStore();
        const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
        worldState.成就.奖励列表!.find(r => r.id === 'reward_01')!.库存 = 0; // Set reward_01 stock to 0
        const redeemEvent = createMockEvent('成就奖励兑换', { id: 'reward_01', '消耗点数': 20 });
        achievementStore.handleRewardRedemption(redeemEvent, worldState);
        expect(worldState.成就.成就点数).toBe(50); // Points should not change
        expect(worldState.成就.奖励列表!.find(r => r.id === 'reward_01')!.库存).toBe(0);
      });

      it('handleRewardRedemption should default cost to 0 if missing', () => {
        const achievementStore = useAchievementStore();
        const worldState = { 成就: _.cloneDeep(mockInitialAchievementState) };
        const redeemEvent = createMockEvent('成就奖励兑换', { id: 'reward_01' });
        achievementStore.handleRewardRedemption(redeemEvent, worldState);
        expect(worldState.成就.成就点数).toBe(50); // Points should not be deducted
        expect(worldState.成就.奖励列表!.find(r => r.id === 'reward_01')!.库存).toBe(2);
      });
    });

    describe('Initialization from undefined state', () => {
      it('handleNewAchievement should create state if it does not exist', () => {
        const achievementStore = useAchievementStore();
        const worldState: any = { 成就: undefined };
        const newAchvEvent = createMockEvent('新成就', { id: 'achv_01', 名称: '创世纪', 点数: 100 });
        achievementStore.handleNewAchievement(newAchvEvent, worldState);
        expect(worldState.成就).toBeDefined();
        expect(worldState.成就.成就点数).toBe(100);
        expect(worldState.成就.completed['achv_01']).toBeDefined();
      });

      it('handleRewardUpdate should create state if it does not exist', () => {
        const achievementStore = useAchievementStore();
        const worldState: any = { 成就: undefined };
        const newRewards = [{ id: 'new_reward', 名称: '新的奖励', 消耗点数: 100, 库存: 1 }];
        const rewardUpdateEvent = createMockEvent('成就奖励更新', newRewards);
        achievementStore.handleRewardUpdate(rewardUpdateEvent, worldState);
        expect(worldState.成就).toBeDefined();
        expect(worldState.成就.奖励列表).toEqual(newRewards);
      });

      it('handleRewardRedemption should create and handle state if it does not exist', () => {
        const achievementStore = useAchievementStore();
        const worldState: any = { 成就: undefined };
        const redeemEvent = createMockEvent('成就奖励兑换', { id: 'any_reward' });
        achievementStore.handleRewardRedemption(redeemEvent, worldState);
        expect(worldState.成就).toBeDefined();
        // Further checks are difficult as the list is empty, but we confirm it doesn't crash
        expect((global as any).toastr.error).toHaveBeenCalledWith('尝试兑换成就奖励失败，奖励列表不存在。');
      });
    });
  });
});
