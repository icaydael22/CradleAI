/// <reference types="vitest/globals" />

import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import BarterPanel from '../../components/system/BarterPanel.vue';
import {
  useBarterStore,
  useCharacterStore,
  useGenerationStore,
  useWorldStore,
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from '../integration/integrationTestSetup';

// 遵循指南，我们只 mock 外部依赖，不 mock 核心逻辑
vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
    saveStateSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

describe('最终集成测试: 以物换物系统 (Barter System End-to-End)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let barterStore: ReturnType<typeof useBarterStore>;
  let generationStore: ReturnType<typeof useGenerationStore>;
  let pinia: ReturnType<typeof createTestingPinia>;

  // 1. 统一且持久化的测试环境
  beforeAll(() => {
    // 创建一个在所有测试中共享的 pinia 实例
    pinia = createTestingPinia({ stubActions: false });
    setActivePinia(pinia);

    // 所有 store 都从同一个 pinia 实例中获取
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    barterStore = useBarterStore();
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

  it('[端到端流程] 应能完整模拟从发起交易到UI更新的全过程', async () => {
    
    // --- 阶段一：创世与状态初始化 ---
    const initialState = {
      世界: {
        time: { day: 1, timeOfDay: '正午' },
        地点: '边境市场',
        角色: {
          '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '灵石', 数量: 20 }, { 名称: '草药', 数量: 10 }], 体力: 100 }
        },
        以物换物: {
          名称: '神秘商人',
          上次刷新天数: 0,
          可换取的物品: [
            { 名称: '铁剑', 数量: 1, 价值: { 基础价值: 15 } },
            { 名称: '恢复药水', 数量: 3, 价值: { 基础价值: 10 } },
          ],
        },
      },
      角色: {
        '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '灵石', 数量: 20 }, { 名称: '草药', 数量: 10 }], 体力: 100 }
      }
    };
    worldStore._dangerouslySetState(initialState.世界);
    characterStore.$patch({ characters: initialState.角色 });

    // 断言：创世状态已正确加载
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '灵石')?.数量).toBe(20);
    expect((worldStore.world.value as any).以物换物.可换取的物品.length).toBe(2);

    // --- 阶段二：执行一次成功的交易 ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn1_events = [
      { type: "物品变化", payload: { "失去": [{ "名称": "灵石", "数量": 10 }], "获得": [{ "名称": "铁剑", "数量": 1 }] } },
      { type: "交易完成", payload: {} },
    ];
    const response1 = createMockResponse(turn1_events, '你用10颗灵石，从商人那里换来了一把锋利的铁剑。');
    
    await handlers.onGenerationEnded(response1, 'turn-1-trade');

    // **后端断言**: 交易后的状态正确
    // 2.1 角色物品更新
    const itemsT1 = characterStore.mainCharacter.value.物品;
    expect(itemsT1.find(i => i.名称 === '灵石')?.数量).toBe(10);
    expect(itemsT1.find(i => i.名称 === '铁剑')?.数量).toBe(1);
    expect(itemsT1.find(i => i.名称 === '草药')?.数量).toBe(10); // 未交易的物品不变

    // 2.2 交易状态被重置 (通过 mock 验证)
    // 注意：在我们的 mock 实现中，`交易完成` 事件会触发 `barterStore.resetSelections`
    expect(barterStore.resetSelections).toHaveBeenCalled();

    // --- 阶段三：前端UI断言 ---
    // 关键：创建一个包含最终状态的 pinia 实例来挂载组件，确保UI反映的是最新状态
    const finalPinia = createTestingPinia({
      initialState: {
        // @ts-ignore
        world: { world: worldStore.world.value },
        // @ts-ignore
        character: { characters: characterStore.characters.value },
      },
      stubActions: false,
    });

    // 激活包含最终状态的 pinia 实例
    setActivePinia(finalPinia);
    const barterStoreForComponent = useBarterStore(); // 从已激活的pinia实例获取store
    const barterWrapper = mount(BarterPanel, {
      global: { plugins: [finalPinia] },
      props: {
        // @ts-ignore
        testStore: barterStoreForComponent,
      }
    });
    await barterWrapper.vm.$nextTick();

    // 3.1 验证玩家物品列表是否已更新
    const myItemsList = barterWrapper.find('[data-testid="my-items-list"]');
    expect(myItemsList.text()).toContain('灵石');
    expect(myItemsList.text()).toContain('x 10');
    expect(myItemsList.text()).toContain('铁剑');
    expect(myItemsList.text()).toContain('x 1');

    // 3.2 验证商人物品列表保持不变
    const traderItemsList = barterWrapper.find('[data-testid="trader-items-list"]');
    expect(traderItemsList.text()).toContain('恢复药水');

    // 3.3 验证交易按钮是禁用的 (因为没有选择任何物品)
    const tradeButton = barterWrapper.find('.btn-primary');
    expect((tradeButton.element as HTMLButtonElement).disabled).toBe(true);

    // --- 阶段四：执行刷新库存操作 ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn2_events = [
        { type: "上下文更新", payload: { "时间": { "day": 2, "timeOfDay": "清晨" } } },
        { type: "可换取物品更新", payload: [
            { 名称: '精致皮甲', 数量: 1, 价值: { 基础价值: 50 } },
            { 名称: '解毒剂', 数量: 5, 价值: { 基础价值: 5 } },
        ]},
    ];
    const response2 = createMockResponse(turn2_events, '第二天，你再次找到商人，发现他更新了货物。');
    
    await handlers.onGenerationEnded(response2, 'turn-2-refresh');

    // **后端断言**: 刷新后的状态
    expect(worldStore.world.value.time.day).toBe(2);
    const newAvailableItems = (worldStore.world.value as any).以物换物.可换取的物品;
    expect(newAvailableItems.some((i: any) => i.名称 === '精致皮甲')).toBe(true);
    expect(newAvailableItems.some((i: any) => i.名称 === '铁剑')).toBe(false); // 旧物品已消失
    expect((worldStore.world.value as any).以物换物.上次刷新天数).toBe(2);

    // **前端断言**: 刷新后的UI
    const refreshedPinia = createTestingPinia({
      initialState: {
        // @ts-ignore
        world: { world: worldStore.world.value },
        // @ts-ignore
        character: { characters: characterStore.characters.value }, // 确保角色状态也被传递
      },
      stubActions: false,
    });
    // 激活新的 pinia 实例
    setActivePinia(refreshedPinia);
    const refreshedBarterStore = useBarterStore(); // 从已激活的pinia实例获取store
    const refreshedWrapper = mount(BarterPanel, {
      global: { plugins: [refreshedPinia] },
      props: {
        // @ts-ignore
        testStore: refreshedBarterStore,
      }
    });
    await refreshedWrapper.vm.$nextTick();

    const refreshedTraderList = refreshedWrapper.find('[data-testid="trader-items-list"]');
    expect(refreshedTraderList.text()).toContain('精致皮甲');
    expect(refreshedTraderList.text()).toContain('解毒剂');
    expect(refreshedTraderList.text()).not.toContain('恢复药水');

    // 验证刷新按钮变为不可用状态
    const refreshBtn = refreshedWrapper.find('.text-sm.text-accent');
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(refreshBtn.text()).toContain('明日再来');
  });
});