/// <reference types="vitest/globals" />

import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import SignInPanel from '../../components/system/SignInPanel.vue';
import {
  useActionStore,
  useCharacterStore,
  useGenerationStore,
  useSignInStore,
  useWorldStore,
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from '../integration/integrationTestSetup';

// 关键：我们不 mock stateUpdater，以测试真实的状态重算逻辑
// 我们只 mock 那些与外部系统交互的模块
vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
    saveStateSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

describe('最终集成测试: 签到系统完整流程 (End-to-End SignIn Flow)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let signInStore: ReturnType<typeof useSignInStore>;
  let actionStore: ReturnType<typeof useActionStore>;
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
    signInStore = useSignInStore();
    actionStore = useActionStore();
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

  it('[端到端流程] 应能完整模拟从每日签到、中断、补签到月卡激活的全过程', async () => {

    // --- 阶段一：创世与初始状态 ---
    const initialState = {
      世界: {
        time: { day: 10, timeOfDay: '清晨' },
        当前日期: { 年: 1, 月: 1, 日: 10 },
        签到: {
          今日已签到: true, // 假设第10天已经签到
          连续签到天数: 6, // 初始状态应该是连续6天 (5,6,7,8,9,10)
          签到记录: { 'Y1M1': [5, 6, 7, 8, 9,10] },
          月卡: { 状态: '未激活', 剩余天数: 0, activatedDate: null },
        },
        角色: {
          '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '补签卡', 数量: 1 }], 体力: 100 }
        }
      },
      角色: {
        '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '补签卡', 数量: 1 }], 体力: 100 }
      }
    };
    // @ts-ignore
    worldStore._dangerouslySetState(initialState.世界);
    characterStore.$patch({ characters: initialState.角色 });

    // **后端断言**: 创世状态
    expect(signInStore.consecutiveDays.value).toBe(6);

    // --- 阶段二：正常签到 ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn1_events = [
      { type: "上下文更新", payload: { "当前日期": { "日": 11 }, "时间": { "day": 11 } } },
      { type: "签到", payload: {} },
    ];
    await handlers.onGenerationEnded(createMockResponse(turn1_events, '你签到了。'), 'turn-1');

    // **后端断言**: 连续天数增加
    expect(signInStore.consecutiveDays.value).toBe(7);

    // --- 阶段三：中断签到 ---
    const turn2_events = [
      { type: "上下文更新", payload: { "当前日期": { "日": 13 }, "时间": { "day": 13 } } },
    ];
    await handlers.onGenerationEnded(createMockResponse(turn2_events, '时间来到了第13天。'), 'turn-2');

    // **后端断言**: 连续天数被重算为0
    expect(signInStore.consecutiveDays.value).toBe(0);

    // --- 阶段四：通过补签恢复连续天数 ---
    const turn3_events = [
      { type: "签到", payload: { date: "第一年一月十二日" } }, // 补签被跳过的第12天
      { type: "物品变化", payload: { "失去": [{ "名称": "补签卡", "数量": 1 }] } },
    ];
    await handlers.onGenerationEnded(createMockResponse(turn3_events, '你使用了补签卡。'), 'turn-3');

    // **后端断言**: 补签后，连续天数被正确地重新计算
    // 补签了第12天，与之前的7天（5,6,7,8,9,10,11）连续，总共是8天
    expect(signInStore.consecutiveDays.value).toBe(8);
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '补签卡')).toBeUndefined();

    // --- 阶段五：在恢复连续的基础上继续签到 ---
    const turn4_events = [
      { type: "签到", payload: {} }, // 签到第13天
    ];
    await handlers.onGenerationEnded(createMockResponse(turn4_events, '你在第13天签到。'), 'turn-4');

    // **后端断言**: 连续天数继续增长
    expect(signInStore.consecutiveDays.value).toBe(9);

    // --- 阶段六：前端UI验证 ---
    // 关键：创建一个包含最终状态的 pinia 实例来挂载组件
    const finalPinia = createTestingPinia({
      initialState: {
        // @ts-ignore
        world: { world: worldStore.world.value },
        // @ts-ignore
        character: { characters: characterStore.characters.value },
      },
      stubActions: false,
    });

    const signInWrapper = mount(SignInPanel, {
      global: { plugins: [finalPinia] },
    });
    await signInWrapper.vm.$nextTick();

    // **前端断言**
    const text = signInWrapper.text();
    expect(text).toContain('连续签到: 9 天');

    // 验证日历状态
    const day11Cell = signInWrapper.find('[data-testid="calendar-day-11"]');
    const day12Cell = signInWrapper.find('[data-testid="calendar-day-12"]');
    const day13Cell = signInWrapper.find('[data-testid="calendar-day-13"]');

    // 确保元素存在
    expect(day11Cell.exists()).toBe(true);
    expect(day12Cell.exists()).toBe(true);
    expect(day13Cell.exists()).toBe(true);

    // 第11天是正常签到
    expect(day11Cell.classes()).toContain('bg-green-500/50');
    // 第12天是补签
    expect(day12Cell.classes()).toContain('bg-green-500/50');
    // 第13天是今天，并且已签到
    expect(day13Cell.classes()).toContain('ring-accent'); // today class
    expect(day13Cell.classes()).toContain('bg-accent/50'); // signed-in today class

    // 验证签到按钮状态
    const signInButton = signInWrapper.findAll('button').find(b => b.text().includes('今日'));
    expect(signInButton).toBeDefined();
    expect(signInButton!.text()).toContain('今日已签到');
    expect((signInButton!.element as HTMLButtonElement).disabled).toBe(true);
  });
});