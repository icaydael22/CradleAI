import { defineStore } from 'pinia';
import { computed } from 'vue';
import _ from 'lodash';
import { logger } from '../../core/logger';
import { useTimeStore } from './timeStore';
import { useWorldStore, type WorldState } from '../core/worldStore';
import { useActionStore } from '../ui/actionStore';
import type { GameEvent } from '../core/eventLogStore';

declare const toastr: any;

interface Achievement {
  id: string;
  名称: string;
  描述: string;
  完成时间: string;
}

interface Reward {
  id: string;
  名称: string;
  描述: string;
  消耗点数: number;
  库存: number;
}

export interface AchievementState {
  成就点数: number;
  completed: Record<string, Achievement>;
  奖励列表?: Reward[];
  上次刷新天数?: number;
}

export const useAchievementStore = defineStore('achievement', () => {
  // Core stores
  const worldStore = useWorldStore();
  const timeStore = useTimeStore();
  const actionStore = useActionStore();

  // Getters - All data is derived reactively from worldStore
  const achievementData = computed(() => worldStore.world?.成就);

  const points = computed(() => achievementData.value?.成就点数 ?? 0);
  const completedAchievements = computed(() => Object.values(achievementData.value?.completed ?? {}));
  const rewards = computed(() => achievementData.value?.奖励列表 ?? []);

  const canRefresh = computed(() => {
    if (!achievementData.value) return false;
    const lastRefreshDay = achievementData.value.上次刷新天数 ?? 0;
    // Allow refresh every 14 days
    return timeStore.day >= lastRefreshDay + 14;
  });

  const daysUntilRefresh = computed(() => {
    if (!achievementData.value) return 14;
    const lastRefreshDay = achievementData.value.上次刷新天数 ?? 0;
    const nextRefreshDay = lastRefreshDay + 14;
    return Math.max(0, nextRefreshDay - timeStore.day);
  });

  // #region Event Handlers
  function handleNewAchievement(event: GameEvent, worldState: WorldState) {
    // Ensure the achievement state exists before processing
    if (!worldState.成就) {
      worldState.成就 = { 成就点数: 0, completed: {} };
    }
    //console.log('[调试] handleNewAchievement 被调用，事件:', JSON.stringify(event, null, 2));
    //console.log('[调试] 更新前的世界状态 (成就部分):', JSON.stringify(worldState.成就, null, 2));

    const achievementPayload = event.payload;
    if (typeof achievementPayload !== 'object' || achievementPayload === null || Array.isArray(achievementPayload)) {
      logger('warn', 'achievementStore', '新成就事件的 payload 不是一个有效的对象', achievementPayload);
      toastr.error('收到了格式不正确的“新成就”事件。');
      console.error('[调试] Payload 格式错误，处理终止。');
      return;
    }

    const { id, '点数': points = 0 } = achievementPayload as any;
    //console.log('[调试] 解析出的成就: id=${id}, 点数=${points}`);

    if (!id) {
      logger('warn', 'achievementStore', '新成就事件缺少 "id" 字段', achievementPayload);
      toastr.error('收到了格式不正确的“新成就”事件，缺少ID。');
      console.error('[调试] 成就缺少 "id"，处理终止。');
      return;
    }

    const achievementState = worldState.成就 as AchievementState;
    // Only add points and set completion time if the achievement is new
    if (!achievementState.completed[id]) {
      //console.log('[调试] 成就 "${id}" 是新的，准备添加。`);
      const completionTime = `第 ${timeStore.day} 天 ${timeStore.timeOfDay}`;
      achievementState.completed[id] = {
        ...achievementPayload,
        完成时间: completionTime,
      };
      achievementState.成就点数 += points;
      //console.log('[调试] 点数已增加，当前总点数: ${achievementState.成就点数}`);
    } else {
      //console.log('[调试] 成就 "${id}" 已存在，仅更新数据。`);
      // If the achievement already exists (e.g., from a recalculation),
      // update its data but preserve the original completion time.
      const originalCompletionTime = achievementState.completed[id].完成时间;
      // Merge new data into the existing achievement, but preserve the original completion time.
      Object.assign(achievementState.completed[id], achievementPayload);
      achievementState.completed[id].完成时间 = originalCompletionTime;
    }
    //console.log('[调试] 更新后的世界状态 (成就部分):', JSON.stringify(worldState.成就, null, 2));
  }

  function handleRewardUpdate(event: GameEvent, worldState: WorldState) {
    // Ensure the achievement state exists before processing
    if (!worldState.成就) {
      worldState.成就 = { 成就点数: 0, completed: {} };
    }
    const payload = event.payload;
    if (!Array.isArray(payload)) {
      logger('warn', 'achievementStore', '成就奖励更新事件的 payload 不是一个数组', payload);
      toastr.error('收到了格式不正确的“成就奖励更新”事件，内容不是数组。');
      return;
    }
    
    const achievementState = worldState.成就 as AchievementState;
    achievementState.奖励列表 = payload;
    achievementState.上次刷新天数 = timeStore.day;
  }

  function handleRewardRedemption(event: GameEvent, worldState: WorldState) {
    // Ensure the achievement state exists before processing
    if (!worldState.成就) {
      worldState.成就 = { 成就点数: 0, completed: {} };
    }
    const { id: rewardId, '消耗点数': cost = 0 } = event.payload;

    if (!rewardId) {
      logger('warn', 'achievementStore', '成就奖励兑换事件缺少 "id" 字段', event.payload);
      toastr.error('收到了格式不正确的“成就奖励兑换”事件，缺少ID。');
      return;
    }

    const achievementState = worldState.成就 as AchievementState;
    const rewards = achievementState.奖励列表;
    if (!rewards) {
      logger('warn', 'achievementStore', '尝试兑换奖励失败，奖励列表不存在。');
      toastr.error('尝试兑换成就奖励失败，奖励列表不存在。');
      return;
    }

    const rewardIndex = rewards.findIndex((r) => r.id === rewardId);
    if (rewardIndex === -1) {
      logger('warn', 'achievementStore', `找不到ID为 "${rewardId}" 的奖励`);
      toastr.error(`尝试兑换成就奖励失败，找不到ID为“${rewardId}”的奖励。`);
      return;
    }

    if (achievementState.成就点数 < cost) {
      logger('warn', 'achievementStore', `成就点数不足 (${achievementState.成就点数})，无法兑换需要 ${cost} 点的奖励。`);
      // No toastr here, as this might be a valid state during recalculation.
      return;
    }

    if (rewards[rewardIndex].库存 <= 0) {
      logger('warn', 'achievementStore', `奖励 "${rewards[rewardIndex].名称}" 库存不足，无法兑换。`);
      toastr.error(`“${rewards[rewardIndex].名称}”已经没有库存了。`);
      return;
    }
    
    rewards[rewardIndex].库存 -= 1;
    achievementState.成就点数 -= cost;
  }
  // #endregion

  // #region Initialization
  function initializeEventHandlers(ws: ReturnType<typeof useWorldStore> | null = null) {
    const targetWorldStore = ws || worldStore;
    logger('log', 'achievementStore', 'Registering event handlers...');
    targetWorldStore.registerEventHandler('新成就', (event: GameEvent, worldState: WorldState) => {
      if (!worldState.成就) worldState.成就 = { 成就点数: 0, completed: {} };
      handleNewAchievement(event, worldState);
    });
    targetWorldStore.registerEventHandler('成就奖励更新', (event: GameEvent, worldState: WorldState) => {
      if (!worldState.成就) worldState.成就 = { 成就点数: 0, completed: {} };
      handleRewardUpdate(event, worldState);
    });
    targetWorldStore.registerEventHandler('成就奖励兑换', (event: GameEvent, worldState: WorldState) => {
      if (!worldState.成就) worldState.成就 = { 成就点数: 0, completed: {} };
      handleRewardRedemption(event, worldState);
    });
  }

  // #endregion

  // #region Actions
  async function redeemReward(rewardId: string) {
    logger('info', 'AchievementStore', `Player requested to redeem reward: ${rewardId}`);
    const reward = rewards.value.find(r => r.id === rewardId as any);
    const rewardName = reward ? reward.名称 : rewardId;
    const systemMessage = `我决定兑换成就奖励：“${rewardName}”。`;
    await actionStore.triggerSystemAction(systemMessage);
  }

  async function refreshRewards() {
    if (!canRefresh.value) {
      logger('warn', 'AchievementStore', 'Refresh button clicked, but refresh is not allowed yet.');
      return;
    }
    logger('info', 'AchievementStore', 'Player requested to refresh rewards list.');
    const systemMessage = `我查看了一下成就奖励列表，看看有没有什么新东西。`;
    await actionStore.triggerSystemAction(systemMessage);
  }
  // #endregion

  return {
    points,
    completedAchievements,
    rewards,
    canRefresh,
    daysUntilRefresh,
    redeemReward,
    refreshRewards,
    achievementData, // Expose for debugging or direct access if needed
    initializeEventHandlers, // Expose for testing
    // Expose handlers for direct testing
    handleNewAchievement,
    handleRewardUpdate,
    handleRewardRedemption,
  };
});
