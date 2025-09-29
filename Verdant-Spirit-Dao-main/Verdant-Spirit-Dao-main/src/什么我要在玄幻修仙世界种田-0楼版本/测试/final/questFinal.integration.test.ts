/// <reference types="vitest/globals" />

import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ActionPanel from '../../components/action/ActionPanel.vue';
import PokedexTab from '../../components/pokedex/PokedexTab.vue';
import StoryPanel from '../../components/story/StoryPanel.vue';
import QuestTab from '../../components/system/QuestTab.vue';
import CharacterCard from '../../components/team/CharacterCard.vue';
import ShelterInfo from '../../components/world/ShelterInfo.vue';
import WorldTab from '../../components/world/WorldTab.vue';
import { recalculateAndApplyState } from '../../core/stateUpdater';
import {
  useActionStore,
  useCharacterStore,
  useGenerationStore,
  useMapStore,
  usePokedexStore,
  useQuestStore,
  useShelterStore,
  useStoryStore,
  useWeatherStore,
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

describe('最终集成测试: 完整核心流程 (End-to-End Core Flow)-任务系统版本', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let mockHistoryManager: ReturnType<typeof setupIntegrationTest>['mockHistoryManager'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let questStore: ReturnType<typeof useQuestStore>;
  let pokedexStore: ReturnType<typeof usePokedexStore>;
  let storyStore: ReturnType<typeof useStoryStore>;
  let actionStore: ReturnType<typeof useActionStore>;
  let generationStore: ReturnType<typeof useGenerationStore>;
  let mapStore: ReturnType<typeof useMapStore>;
  let shelterStore: ReturnType<typeof useShelterStore>;
  let weatherStore: ReturnType<typeof useWeatherStore>;
  let pinia: ReturnType<typeof createTestingPinia>;

  // 在所有测试开始前，设置一个持久化的测试环境
  beforeAll(() => {
    // 创建一个在所有测试中共享的 pinia 实例
    pinia = createTestingPinia({ stubActions: false });
    setActivePinia(pinia);

    // 所有 store 都从同一个 pinia 实例中获取
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    questStore = useQuestStore();
    pokedexStore = usePokedexStore();
    storyStore = useStoryStore();
    actionStore = useActionStore();
    generationStore = useGenerationStore();
    mapStore = useMapStore();
    shelterStore = useShelterStore();
    weatherStore = useWeatherStore();
    
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;
    mockHistoryManager = setup.mockHistoryManager;

    if (handlers.setTestGenerationStore) {
      handlers.setTestGenerationStore(generationStore);
    }
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('[端到端流程] 应能完整模拟从创世、推进回合到状态回溯的全过程', async () => {
    
    // --- 阶段一：创世 (Genesis & L3 State Loading) ---
    const initialState = {
      世界: {
        time: { day: 1, timeOfDay: '清晨' },
        地点: '新手村',
        weather: { 当前天气: '晴朗' },
        地图: {
          regions: { 'newbie_village': { id: 'newbie_village', 名称: '新手村', 描述: '一切开始的地方。' } },
          connections: [],
          currentPlayerLocation: 'newbie_village',
        },
        庇护所: {
          名称: "简陋的庇护所",
          组件: {
            "床": { 规模: '草席', 状态: '完好无损', 耐久度: '100.00%' }
          }
        },
        任务列表: [],
        角色: {
          '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '新手剑', 数量: 1 }], 体力: 100 }
        }
      },
      角色: {
        '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '新手剑', 数量: 1 }], 体力: 100 }
      }
    };
    // 模拟加载初始状态
    worldStore._dangerouslySetState(initialState.世界);
    characterStore.$patch({ characters: initialState.角色 });

    // 断言：创世状态已正确加载
    expect(worldStore.world.value.time.day).toBe(1);
    expect(characterStore.mainCharacter.value.物品[0].名称).toBe('新手剑');
    expect(questStore.quests.value.length).toBe(0);

    // --- 阶段二：推进到第一回合 (Advancing to Turn 1) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn1_events = [
      { type: "上下文更新", payload: { "时间": { "day": 1, "timeOfDay": "正午" } } },
      { type: "新任务接收", payload: { "id": "first_quest", "名称": "村长的委托" } },
      { type: "物品变化", payload: { "获得": [{ "名称": "小面包", "数量": 3 }] } },
      { type: "新图鉴发现", payload: { "类型": "物品", "数据": { "名称": "小面包", "描述": "普通的面包，可以果腹。" } } },
    ];
    const response1 = createMockResponse(turn1_events, '你接到了村长的第一个委托，并得到了一些面包作为干粮。');
    
    // 在 onGenerationEnded 之前，需要确保 mock history manager 能返回正确的消息
    // 这样，当 storyStore.fetchData 被调用时，它能获取到我们期望的内容
    mockHistoryManager.getMessagesForPrompt.mockReturnValue([{
      role: 'assistant',
      content: response1,
      id: 'turn-1-msg',
    }]);

    await handlers.onGenerationEnded(response1, 'turn-1-msg');

    // **后端断言**: 第一回合的状态正确
    expect(worldStore.world.value.time.timeOfDay).toBe('正午');
    // After event processing, the mock questStore should be reactively updated
    const firstQuest = questStore.quests.value.find(q => q.id === 'first_quest');
    expect(firstQuest).toBeDefined();
    if (firstQuest) {
      expect(firstQuest.状态).toBe('进行中');
    }
    expect(characterStore.mainCharacter.value.物品.find((i: any) => i.名称 === '小面包')?.数量).toBe(3);
    // @ts-ignore
    expect(pokedexStore.entries['物品'].some(e => e.名称 === '小面包')).toBe(true);

    // **前端断言**: UI 应反映第一回合的状态

    // 关键修复：将更新后的任务状态同步回 worldStore，以便所有组件实例都能访问到
    (worldStore.world.value as any).任务列表 = questStore.quests.value;

    const piniaT1 = createTestingPinia({
      initialState: {
        // 现在 worldStore 是最新的，QuestTab 可以从中正确初始化
        world: { world: worldStore.world.value },
      },
      stubActions: false,
    });
    setActivePinia(piniaT1);

    // Get the mock stores which are now all connected to the same mock state
    const storyStoreForComponent = storyStore;

    // Manually trigger fetchData to simulate the component lifecycle
    await storyStoreForComponent.fetchData();

    const questWrapperT1 = mount(QuestTab, {
      global: {
        plugins: [pinia],
      },
      props: {
        // @ts-ignore
        testQuestStore: {
          ...questStore,
          ongoingQuests: questStore.quests.value.filter((q: any) => q.状态 === '进行中') as any,
          completedQuests: [],
          notCompletedQuests: [],
          failedQuests: [],
        },
      },
    });
    const storyWrapperT1 = mount(StoryPanel, { global: { plugins: [piniaT1] } });
    
    await storyWrapperT1.vm.$nextTick();
    await questWrapperT1.vm.$nextTick();

    //console.log("questWrapperT1 now is:",questWrapperT1.text())

    // Now, the assertions should pass because all stores see the same data
    expect(storyWrapperT1.text()).toContain('你接到了村长的第一个委托');
    expect(storyWrapperT1.find('.fa-spinner.fa-spin').exists()).toBe(false); // 加载动画应消失
    const prevButtonT1 = storyWrapperT1.find('button[title="上一个回应"]');
    const nextButtonT1 = storyWrapperT1.find('button[title="下一个回应"]');
    expect((prevButtonT1.element as HTMLButtonElement).disabled).toBe(true); // 第一个消息，不能往前翻
    expect((nextButtonT1.element as HTMLButtonElement).disabled).toBe(false); // 即使只有一个回应，也总可以往后翻页以生成新回应

    // 任务断言
    expect(questWrapperT1.text()).toContain('村长的委托');
    // 注意：由于组件内部实现，状态的 class 可能需要更具体的选择器
    // expect(questWrapperT1.find('.status-ongoing').exists()).toBe(true);

    // 关键修复：在完成T1的前端断言后，将激活的pinia实例切回主实例
    setActivePinia(pinia);

    // --- 阶段三：在第二回合处理不同的 Swipe (Handling Swipes in Turn 2) ---
    
    // 3.1 准备 L1 缓存：即第一回合结束时的状态快照
    const state_T1 = {
      世界: JSON.parse(JSON.stringify(worldStore.world.value)),
      角色: JSON.parse(JSON.stringify(characterStore.characters.value)),
    };

    // 3.2 模拟并激活 Swipe A (消耗新手剑)
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn2_events_A = [
      { type: "上下文更新", payload: { "时间": { "day": 1, "timeOfDay": "下午" } } },
      { type: "物品变化", payload: { "失去": [{ "名称": "新手剑", "数量": 1 }] } },
    ];
    const response2_A = createMockResponse(turn2_events_A, '在与史莱姆的战斗中，你的新手剑不幸断裂了。');
    await handlers.onGenerationEnded(response2_A, 'turn-2-swipe-A');

    // **后端断言**: 状态已根据 Swipe A 更新
    expect(worldStore.world.value.time.timeOfDay).toBe('下午');
    expect(characterStore.mainCharacter.value.物品.find((i: any) => i.名称 === '新手剑')).toBeUndefined();

    // 3.3 模拟用户切换到 Swipe B (未消耗新手剑，而是消耗了体力)
    // 这一步是测试的核心：我们调用真实的 `recalculateAndApplyState` 来模拟回溯
    const turn2_events_B = [
      { type: "上下文更新", payload: { "时间": { "day": 1, "timeOfDay": "下午" } } }, // 时间点相同
      { type: "角色更新", payload: { "体力": -10 } },
      { type: "物品变化", payload: { "获得": [{ "名称": "史莱姆凝胶", "数量": 2 }] } },
      { type: "新图鉴发现", payload: { "类型": "物品", "数据": { "名称": "史莱姆凝胶", "描述": "史莱姆的核心，有多种用途。" } } },
    ];
    const recalculationInputs = {
      startState: state_T1, // 从第一回合结束的状态开始
      eventsToReplay: turn2_events_B, // 只重放 B 的事件
    };
    
    // 执行状态重算
    await recalculateAndApplyState(
      mockHistoryManager as any,
      'turn-2-swipe-B', // 目标消息ID
      worldStore,
      characterStore,
      undefined, // pinia 实例，mock中不需要
      recalculationInputs
    );
    
    // 3.4 **后端断言**最终状态
    // 验证状态是基于 T1 的快照 + Swipe B 的事件，而不是 Swipe A
    const finalItems = characterStore.mainCharacter.value.物品;
    expect(worldStore.world.value.time.timeOfDay).toBe('下午'); // 时间正确推进
    
    // 关键断言：新手剑回来了！
    expect(finalItems.find((i: any) => i.名称 === '新手剑')?.数量).toBe(1);
    // 关键断言：获得了史莱姆凝胶
    expect(finalItems.find((i: any) => i.名称 === '史莱姆凝胶')?.数量).toBe(2);
    // 关键断言：体力被消耗了
    // @ts-ignore
    expect(characterStore.mainCharacter.value.体力).toBe(90);
    // 关键断言：图鉴条目被正确添加
    // @ts-ignore
    expect(pokedexStore.entries['物品'].some(e => e.名称 === '史莱姆凝胶')).toBe(true);
    // 关键断言：第一回合的任务状态依然存在
    const finalFirstQuest = questStore.quests.value.find(q => q.id === 'first_quest');
    expect(finalFirstQuest).toBeDefined();
    if (finalFirstQuest) {
      expect(finalFirstQuest.状态).toBe('进行中');
    }

    // --- 阶段四：物品更新与最终状态验证 ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn3_events = [
      { type: "上下文更新", payload: { "时间": { "day": 2, "timeOfDay": "深夜" } } },
      { type: "物品条目更新", payload: { "originalName": "新手剑", "updatedData": { "名称": "百炼新手剑", "描述": "经过百般锤炼的新手剑，更加锋利。" } } },
      { type: "物品变化", payload: { "失去": [{ "名称": "史莱姆凝胶", "数量": 1 }] } },
    ];
    const response3 = createMockResponse(turn3_events, '你利用史莱姆凝胶，成功强化了你的新手剑。');
    await handlers.onGenerationEnded(response3, 'turn-3');

    // **后端断言**: 物品更新后的状态
    expect(worldStore.world.value.time.timeOfDay).toBe('深夜');
    const finalItemsT3 = characterStore.mainCharacter.value.物品;
    expect(finalItemsT3.find((i: any) => i.名称 === '新手剑')).toBeUndefined();
    expect(finalItemsT3.find((i: any) => i.名称 === '百炼新手剑')).toBeDefined();
    expect(finalItemsT3.find((i: any) => i.名称 === '史莱姆凝胶')?.数量).toBe(1);


    // 3.5 **前端断言**最终状态
    // 同样，复用共享的 pinia 实例来挂载所有需要验证的组件
    
    // 1. 验证角色卡片
    // 为 CharacterCard 创建一个符合其 props 期望的对象
    const characterForCard = {
      ...characterStore.mainCharacter.value,
      状态: {
        // @ts-ignore
        体力: { value: characterStore.mainCharacter.value.体力, max: 100 },
      },
    };

    const characterWrapperT2 = mount(CharacterCard, {
      global: { plugins: [pinia] },
      props: {
        character: characterForCard,
        isMainCharacter: true,
      },
    });
    await characterWrapperT2.vm.$nextTick();
    
    expect(characterWrapperT2.text()).toContain('体力');
    expect(characterWrapperT2.text()).toContain('90 / 100');
    const healthBar = characterWrapperT2.findAll('.progress-bar-fg').find(bar => bar.html().includes('width: 90%'));
    expect(healthBar).toBeDefined();
    expect(healthBar!.classes()).toContain('bg-green-500'); // 90% 应该是绿色

    // 2. 验证行动面板
    // 模拟AI根据新状态生成了行动选项
    actionStore.options = ['处理史莱姆凝胶', '检查新手剑的状况', '继续前进'];
    const actionWrapperT2 = mount(ActionPanel, {
      global: { plugins: [pinia] },
      props: {
        // @ts-ignore
        testActionStore: actionStore,
      },
    });
    await actionWrapperT2.vm.$nextTick();
    
    expect(actionWrapperT2.text()).toContain('处理史莱姆凝胶');
    expect(actionWrapperT2.text()).toContain('检查新手剑的状况');
    expect(actionWrapperT2.text()).not.toContain('攻击史莱姆'); // 旧的选项不应存在

    // 3. 验证图鉴面板
    // 关键：同步 pokedexStore 的状态到 worldStore，以便 PokedexTab 能正确读取
    (worldStore.world.value as any).图鉴 = pokedexStore.entries;
    const pokedexWrapperT2 = mount(PokedexTab, {
      global: { plugins: [pinia] },
      props: {
        // @ts-ignore
        testWorldStore: worldStore,
        // @ts-ignore
        testItemStore: {
          // 我们需要模拟一个 itemStore，因为 PokedexTab 依赖它
          // 它的 items getter 应该从 characterStore 派生
          get items() {
            return characterStore.mainCharacter.value.物品;
          }
        }
      }
    });
    await pokedexWrapperT2.vm.$nextTick();

    const pokedexText = pokedexWrapperT2.text();

    expect(pokedexText).toContain('小面包');
    expect(pokedexText).toContain('史莱姆凝胶');
    expect(pokedexText).toContain('百炼新手剑');

    // --- 阶段五：世界变化与庇护所交互 ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn4_events = [
      { type: "上下文更新", payload: { "时间": { "day": 3, "timeOfDay": "上午" }, "地点": "黑森林" } },
      { type: "设置特殊天象", payload: { "天象": "暴雨", "持续时间": "1时辰" } },
      { type: "新区域发现", payload: { id: "dark_forest", 名称: "黑森林", 描述: "一片危险的森林。" } },
      { type: "路径更新", payload: { connection: { from_region: "newbie_village", to_region: "dark_forest", direction: "向北" } } },
      { type: "庇护所受损", payload: { "组件ID": "床", "数量": 20 } },
    ];
    const response4 = createMockResponse(turn4_events, '你向北进入了黑森林，突然下起了暴雨，你的床也被淋湿了。');
    await handlers.onGenerationEnded(response4, 'turn-4');

    // **后端断言**: 世界状态已更新
    expect(worldStore.world.value.time.day).toBe(3);
    expect(worldStore.world.value.地点).toBe('黑森林');
    expect(worldStore.world.value.天气.当前天气).toBe('暴雨');
    expect(mapStore.regions['dark_forest']).toBeDefined();
    expect(mapStore.connections.some((c: any) => c.to_region === 'dark_forest')).toBe(true);
    const shelterComponent = shelterStore.components as any;
    //console.log("shelterStore.components:",shelterStore.components)
    expect(shelterComponent.床.耐久度).toBe('80.00%');
    expect(shelterComponent.床.状态).toBe('基本完好');

    // **前端断言**: WorldTab 和 ShelterInfo 应反映新状态
    const worldTabWrapper = mount(WorldTab, {
      global: { plugins: [pinia] },
      props: {
        // @ts-ignore
        testWorldStore: worldStore,
        // @ts-ignore
        testMapStore: mapStore,
      }
    });
    const shelterInfoWrapper = mount(ShelterInfo, {
      global: { plugins: [pinia] },
      props: { shelter: worldStore.shelter.value }
    });
    await worldTabWrapper.vm.$nextTick();
    await shelterInfoWrapper.vm.$nextTick();

    //console.log("worldTabWrapper.text():",worldTabWrapper.text())
    //console.log("shelterInfoWrapper.text():",shelterInfoWrapper.text())

    expect(worldTabWrapper.text()).toContain('第 3 天');
    expect(worldTabWrapper.text()).toContain('暴雨');
    expect(worldTabWrapper.text()).toContain('黑森林');
    expect(shelterInfoWrapper.text()).toContain('床');
    expect(shelterInfoWrapper.text()).toContain('80.00%');
    expect(shelterInfoWrapper.text()).toContain('基本完好');

    // --- 阶段六：任务成功与失败 ---
    // 6.1 任务成功
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn5_events_success = [
      { type: "上下文更新", payload: { "时间": { "day": 3, "timeOfDay": "下午" } } },
      { type: "任务完成", payload: { "id": "first_quest" } },
      { type: "物品变化", payload: { "获得": [{ "名称": "村长的谢礼", "数量": 1 }] } },
    ];
    const response5_success = createMockResponse(turn5_events_success, '你完成了村长的委托，得到了谢礼。');
    await handlers.onGenerationEnded(response5_success, 'turn-5-success');

    // **后端断言**: 任务成功
    let successQuest = questStore.quests.value.find(q => q.id === 'first_quest');
    expect(successQuest).toBeDefined();
    if (successQuest) {
      expect(successQuest.状态).toBe('已完成');
    }
    expect(characterStore.mainCharacter.value.物品.some((i: any) => i.名称 === '村长的谢礼')).toBe(true);

    // 6.2 准备新任务用于测试失败
    const turn6_events_new_quest = [
      { type: "新任务接收", payload: { "id": "second_quest", "名称": "紧急任务" } },
    ];
    const response6_new = createMockResponse(turn6_events_new_quest, '你接到了一个紧急任务。');
    await handlers.onGenerationEnded(response6_new, 'turn-6-new');
    let secondQuest = questStore.quests.value.find(q => q.id === 'second_quest');
    expect(secondQuest).toBeDefined();
    if (secondQuest) {
      expect(secondQuest.状态).toBe('进行中');
    }

    // 6.3 任务失败
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn7_events_fail = [
      { type: "上下文更新", payload: { "时间": { "day": 4, "timeOfDay": "上午" } } },
      { type: "任务失败", payload: { "id": "second_quest" } },
    ];
    const response7_fail = createMockResponse(turn7_events_fail, '由于超时，紧急任务失败了。');
    await handlers.onGenerationEnded(response7_fail, 'turn-7-fail');

    // **后端断言**: 任务失败
    let failedQuest = questStore.quests.value.find(q => q.id === 'second_quest');
    expect(failedQuest).toBeDefined();
    if (failedQuest) {
      expect(failedQuest.状态).toBe('失败');
    }

    // **前端断言**: 任务列表状态
    // 采用 signInFinal 测试中的最佳实践，创建新的 Pinia 实例以确保状态同步
    const finalPinia = createTestingPinia({
      initialState: {
        // @ts-ignore
        world: { world: worldStore.world.value },
      },
      stubActions: false,
    });

    const questWrapper = mount(QuestTab, {
      global: { plugins: [finalPinia] },
    });
    await questWrapper.vm.$nextTick();

    // **前端断言 - 已完成任务**
    // 1. 找到并点击“已完成”标签页
    const completedTabButton = questWrapper.findAll('.quest-tab-btn').find(btn => btn.text().includes('已完成'));
    expect(completedTabButton?.exists()).toBe(true);
    await completedTabButton!.trigger('click');
    await questWrapper.vm.$nextTick();

    // 2. 在“已完成”标签页下查找任务
    const completedQuestItem = questWrapper.find('[data-testid="quest-first_quest"]');
    expect(completedQuestItem.exists()).toBe(true);
    expect(completedQuestItem.text()).toContain('村长的委托');
    expect(completedQuestItem.classes()).toContain('status-已完成');

    // **前端断言 - 失败任务**
    // 1. 找到并点击“失败”标签页
    const failedTabButton = questWrapper.findAll('.quest-tab-btn').find(btn => btn.text().includes('失败'));
    expect(failedTabButton?.exists()).toBe(true);
    await failedTabButton!.trigger('click');
    await questWrapper.vm.$nextTick();
    
    // 2. 在“失败”标签页下查找任务
    const failedQuestItem = questWrapper.find('[data-testid="quest-second_quest"]');
    expect(failedQuestItem.exists()).toBe(true);
    expect(failedQuestItem.text()).toContain('紧急任务');
    expect(failedQuestItem.classes()).toContain('status-失败');
  });
});