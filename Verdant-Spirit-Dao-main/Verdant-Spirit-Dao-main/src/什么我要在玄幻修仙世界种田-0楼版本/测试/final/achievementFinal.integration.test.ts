/// <reference types="vitest/globals" />

import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AchievementPanel from '../../components/system/AchievementPanel.vue';
import {
  useAchievementStore,
  useCharacterStore,
  useGenerationStore,
  useWorldStore,
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from '../integration/integrationTestSetup';

// 关键：我们不 mock stateUpdater，以测试真实的状态重算逻辑
vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
    saveStateSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

describe('最终集成测试: 成就系统 (Achievement System End-to-End)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let achievementStore: ReturnType<typeof useAchievementStore>;
  let generationStore: ReturnType<typeof useGenerationStore>;
  let pinia: ReturnType<typeof createTestingPinia>;

  // 在所有测试开始前，设置一个持久化的测试环境
  beforeAll(() => {
    // 创建一个在所有测试中共享的 pinia 实例
    pinia = createTestingPinia({ stubActions: false });
    setActivePinia(pinia);

    // 所有 store 都从同一个 pinia 实例中获取
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    achievementStore = useAchievementStore();
    generationStore = useGenerationStore();
    
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;

    if (handlers.setTestGenerationStore) {
      handlers.setTestGenerationStore(generationStore);
    }
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('[端到端流程] 应能完整模拟从解锁成就、兑换奖励到刷新奖励的全过程', async () => {
    
    // --- 阶段一：创世 (Genesis) ---
    const initialState = {
      世界: {
        time: { day: 1, timeOfDay: '清晨' },
        成就: {
          成就点数: 0,
          completed: {},
          奖励列表: [],
          上次刷新天数: 0,
        },
        角色: {
          '萧栖雪': { 姓名: '萧栖雪', 物品: [], 体力: 100 }
        }
      },
      角色: {
        '萧栖雪': { 姓名: '萧栖雪', 物品: [], 体力: 100 }
      }
    };
    // 模拟加载初始状态
    worldStore._dangerouslySetState(initialState.世界);
    characterStore.$patch({ characters: initialState.角色 });

    // **后端断言**: 创世状态正确
    expect(achievementStore.points.value).toBe(0);
    expect(achievementStore.completedAchievements.value).toHaveLength(0);

    // --- 阶段二：解锁第一个成就 (Unlock First Achievement) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn1_events = [
      { type: "新成就", payload: { "id": "achv_01", "名称": "初出茅庐", "描述": "完成新手教程。", "点数": 10 } },
    ];
    const response1 = createMockResponse(turn1_events, '你完成了新手教程，解锁了第一个成就！');
    
    await handlers.onGenerationEnded(response1, 'turn-1-msg');

    // **后端断言**: 成就已解锁，点数已增加
    expect(achievementStore.points.value).toBe(10);
    expect(achievementStore.completedAchievements.value).toHaveLength(1);
    const completedAchv = (achievementStore.completedAchievements.value as any[]);
    expect(completedAchv[0].id).toBe('achv_01');
    expect(completedAchv[0].名称).toBe('初出茅庐');

    // **前端断言**: UI 应反映新成就
    const piniaT1 = createTestingPinia({
      initialState: {
        world: { world: worldStore.world.value },
      },
      stubActions: false,
    });

    const wrapperT1 = mount(AchievementPanel, {
      global: { plugins: [piniaT1] },
    });
    await wrapperT1.vm.$nextTick();

    expect(wrapperT1.find('.font-bold.text-accent').text()).toContain('10');
    const achievementsTextT1 = wrapperT1.find('#achievement-tab-achievements').text();
    expect(achievementsTextT1).toContain('初出茅庐');
    expect(achievementsTextT1).toContain('完成新手教程');

    // --- 阶段三：加载成就奖励 (Load Rewards) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn2_events = [
      { type: "成就奖励更新", payload: [
        { id: 'rew_01', 名称: '小还丹', 描述: '恢复少量体力。', 消耗点数: 5, 库存: 3 },
        { id: 'rew_02', 名称: '铁剑', 描述: '一把普通的铁剑。', 消耗点数: 20, 库存: 1 },
      ]},
    ];
    const response2 = createMockResponse(turn2_events, '成就商店刷新了一批新的奖励。');
    await handlers.onGenerationEnded(response2, 'turn-2-msg');

    // **后端断言**: 奖励列表已更新
    expect(achievementStore.rewards.value).toHaveLength(2);
    expect((achievementStore.rewards.value as any[])[0].id).toBe('rew_01');
    expect(worldStore.world.value.成就.上次刷新天数).toBe(1);

    // **前端断言**: 奖励UI正确显示
    const piniaT2 = createTestingPinia({
      initialState: {
        world: { world: worldStore.world.value },
      },
      stubActions: false,
    });
    const wrapperT2 = mount(AchievementPanel, {
      global: { plugins: [piniaT2] },
    });
    await wrapperT2.find('button[aria-label="奖励"]').trigger('click');
    await wrapperT2.vm.$nextTick();

    const rewardsTextT2 = wrapperT2.find('#achievement-tab-rewards').text();
    expect(rewardsTextT2).toContain('小还丹');
    expect(rewardsTextT2).toContain('铁剑');
    const redeemButtons = wrapperT2.findAll('.redeem-btn');
    expect((redeemButtons[0].element as HTMLButtonElement).disabled).toBe(false); // 10点 > 5点，可以兑换
    expect((redeemButtons[1].element as HTMLButtonElement).disabled).toBe(true);  // 10点 < 20点，无法兑换

    // --- 阶段四：兑换奖励 (Redeem a Reward) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn3_events = [
      { type: "成就奖励兑换", payload: { "id": "rew_01", "消耗点数": 5 } },
      { type: "物品变化", payload: { "获得": [{ "名称": "小还丹", "数量": 1 }] } },
    ];
    const response3 = createMockResponse(turn3_events, '你成功兑换了小还丹。');
    await handlers.onGenerationEnded(response3, 'turn-3-msg');

    // **后端断言**: 点数和库存已扣除
    expect(achievementStore.points.value).toBe(5); // 10 - 5 = 5
    const rewardInState = worldStore.world.value.成就.奖励列表?.find(r => r.id === 'rew_01');
    expect(rewardInState?.库存).toBe(2);
    expect(characterStore.mainCharacter.value.物品.some((i: any) => i.名称 === '小还丹')).toBe(true);

    // **前端断言**: UI反映了兑换后的状态
    const piniaT3 = createTestingPinia({
      initialState: {
        world: { world: worldStore.world.value },
      },
      stubActions: false,
    });
    const wrapperT3 = mount(AchievementPanel, {
      global: { plugins: [piniaT3] },
    });
    await wrapperT3.find('button[aria-label="奖励"]').trigger('click');
    await wrapperT3.vm.$nextTick();

    expect(wrapperT3.find('.font-bold.text-accent').text()).toContain('5');
    const rewardItemText = wrapperT3.findAll('#achievement-tab-rewards li').find(li => li.text().includes('小还丹'))?.text();
    expect(rewardItemText).toContain('库存: 2');
    const firstRedeemBtn = wrapperT3.find('.redeem-btn');
    expect((firstRedeemBtn.element as HTMLButtonElement).disabled).toBe(false); // 5点 >= 5点，仍然可以兑换

    // --- 阶段五：刷新奖励列表 (Refresh Rewards) ---
    // 5.1 模拟时间流逝，使刷新可用
    worldStore.world.value.time.day = 15; // 上次刷新是第1天，1 + 14 = 15，可以刷新了

    // 5.2 触发刷新事件
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn4_events = [
      { type: "成就奖励更新", payload: [
        { id: 'rew_03', 名称: '玄铁重剑', 描述: '一把厚重的剑。', 消耗点数: 50, 库存: 1 },
      ]},
    ];
    const response4 = createMockResponse(turn4_events, '你刷新了成就商店，奖励列表焕然一新。');
    await handlers.onGenerationEnded(response4, 'turn-4-msg');

    // **后端断言**: 奖励列表被替换，刷新日期已更新
    expect(achievementStore.rewards.value).toHaveLength(1);
    expect((achievementStore.rewards.value as any[])[0].id).toBe('rew_03');
    expect(worldStore.world.value.成就.上次刷新天数).toBe(15);

    // **前端断言**: UI显示新奖励，并且刷新按钮进入冷却
    const wrapperT4 = mount(AchievementPanel, {
      global: { plugins: [pinia] }, // 使用主 pinia 实例
      props: {
        // @ts-ignore
        testStore: {
          ...achievementStore,
          rewards: achievementStore.rewards.value,
          points: achievementStore.points.value,
          canRefresh: false, // 手动计算
          daysUntilRefresh: 14, // 手动计算
          achievementData: worldStore.world.value.成就,
        }
      }
    });
    await wrapperT4.find('button[aria-label="奖励"]').trigger('click');
    await wrapperT4.vm.$nextTick();

    const rewardsTextT4 = wrapperT4.find('#achievement-tab-rewards').text();
    expect(rewardsTextT4).not.toContain('小还丹');
    expect(rewardsTextT4).toContain('玄铁重剑');

    const refreshBtn = wrapperT4.find('#refresh-rewards-btn');
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(refreshBtn.text()).toContain('还需 14 天');
  });
});