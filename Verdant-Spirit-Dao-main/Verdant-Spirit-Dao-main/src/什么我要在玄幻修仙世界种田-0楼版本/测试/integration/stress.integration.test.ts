/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recalculateAndApplyState } from '../../core/stateUpdater';
import {
  useAchievementStore,
  useCharacterStore,
  useGenerationStore,
  useMapStore,
  usePokedexStore,
  useQuestStore,
  useShelterStore,
  useSkillStore,
  useWeatherStore,
  useWorldStore,
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 复合事件流与压力测试 (Stress Test)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let mockHistoryManager: ReturnType<typeof setupIntegrationTest>['mockHistoryManager'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let initialState: any;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let questStore: ReturnType<typeof useQuestStore>;
  let pokedexStore: ReturnType<typeof usePokedexStore>;
  let skillStore: ReturnType<typeof useSkillStore>;
  let mapStore: ReturnType<typeof useMapStore>;
  let shelterStore: ReturnType<typeof useShelterStore>;
  let achievementStore: ReturnType<typeof useAchievementStore>;
  let weatherStore: ReturnType<typeof useWeatherStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    questStore = useQuestStore();
    pokedexStore = usePokedexStore();
    skillStore = useSkillStore();
    mapStore = useMapStore();
    shelterStore = useShelterStore();
    achievementStore = useAchievementStore();
    weatherStore = useWeatherStore();

    // b. 运行测试设置，并将关键的 worldStore 实例注入进去
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;
    mockHistoryManager = setup.mockHistoryManager;

    if (handlers.setTestGenerationStore) {
      handlers.setTestGenerationStore(generationStore);
    }

    // c. 准备测试需要的特定状态
    generationStore._setTestState({
      isNewTurn: true,
      isAiGenerating: true,
    });

    // d. 为测试预设初始状态
    characterStore.mainCharacter.value.物品 = [{ 名称: '宝箱钥匙', 数量: 1 }];
    characterStore.mainCharacter.value.体力 = 100;
    // 为“鉴定”技能预置到主角技能与世界技能，确保事件走增量叠加分支（5 + 5 = 10）
    characterStore.mainCharacter.value.技能 = [
      { id: '鉴定', 名称: '鉴定', 类别: '生活', 熟练度: 5, 等级: 1 },
    ];
    (worldStore.world.value.技能 as any[]) = [
      { id: '鉴定', 名称: '鉴定', 类别: '生活', 熟练度: 5, 等级: 1 },
    ];
    worldStore.world.value.地图.currentPlayerLocation = '初始地点';
    worldStore.world.value.地图.regions = {
      'initial_place': { id: 'initial_place', 名称: '初始地点', 描述: '一切开始的地方。' }
    };
    worldStore.world.value.地图.connections = [];
    worldStore.world.value.世界观 = {
        rumors: [{ content: '古老的传说', status: 'undiscovered' }],
        pokedex_entries: [],
        adventure_hooks: [],
    };
    worldStore.world.value.奇遇 = { 冷却至天数: 0, 上次奇遇天数: 0 };
    worldStore.world.value.成就 = { 成就点数: 10, completed: {},奖励列表:[],上次刷新天数:10 }; // 预设点数用于测试消耗
    (worldStore.world.value as any).任务 = [
      { id: 'failed_quest', 名称: '一个注定失败的任务', 描述: '此任务注定失败', 状态: '进行中' }
    ];
    // 为庇护所组件预设一个初始状态，以便测试“受损”事件
    worldStore.world.value.庇护所 = {
      名称: "测试庇护所",
      组件: {
        "工坊": { 规模: '初级工坊', 状态: '完好无损', 耐久度: '100.00%' }
      }
    };
    initialState = {
      世界: JSON.parse(JSON.stringify(worldStore.world.value)),
      角色: JSON.parse(JSON.stringify(characterStore.characters.value)),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[压力测试] 应能正确处理一个包含地点、天气、任务和多系统交互的连续叙事', async () => {
    // --- Turn 1: 出发与发现 ---
    const turn1_events = [
      { type: "上下文更新", payload: { "时间": { "day": 2, "timeOfDay": "正午" }, "地点": "迷雾森林" } },
      { type: "新区域发现", payload: { id: "misty_forest", 名称: "迷雾森林", 描述: "一片常年被迷雾笼罩的森林。" } },
      { type: "路径更新", payload: { connection: { from_region: "initial_place", to_region: "misty_forest", direction: "向东", description: "一条通往森林的小径。" } } },
      { type: "世界观条目状态更新", payload: { "类型": "传闻", "名称": "古老的传说", "新状态": "known" } },
      { type: "新任务接收", payload: { "id": "explore_forest", "名称": "探索迷雾森林", "描述": "深入迷雾森林，寻找传说的源头。", "目标": { "到达森林深处": 1 }, "当前进度": { "到达森林深处": 0 } } },
      { type: "角色更新", payload: { "体力": -10 } }, // 跋涉消耗体力
    ];
    const response1 = createMockResponse(turn1_events, '你向东走，进入了传说中的迷雾森林，接到了探索任务。');
    await handlers.onGenerationEnded(response1, 'stress-turn-1');

    generationStore._setTestState({
      isNewTurn: false,
      isAiGenerating: false,
    });

    generationStore._setTestState({
      isNewTurn: true,
      isAiGenerating: true,
    });

    // --- Assertions for Turn 1 ---
    expect(mockHistoryManager.addAssistantMessagePage).toHaveBeenCalledWith(response1);
    expect(worldStore.world.value.time.day).toBe(2);
    expect(worldStore.world.value.地点).toBe('迷雾森林');
    expect(worldStore.world.value.地图.regions['misty_forest']).toBeDefined();
    expect(questStore.quests.value.find(q => q.id === 'explore_forest')).toBeDefined();
    expect(characterStore.mainCharacter.value.体力).toBe(90);
    expect(worldStore.world.value.天气.当前天气).toBe('晴朗'); // 天气未变

    // --- Turn 2: 深入与奇遇，天气变化 ---
    const turn2_events = [
      { type: "上下文更新", payload: { "时间": { "day": 2, "timeOfDay": "黄昏" }, "地点": "森林深处" } },
      { type: "设置特殊天象", payload: { "天象": "小雨", "持续时间": "2时辰" } },
      { type: "任务进度更新", payload: { "id": "explore_forest", "当前进度": { "到达森林深处": 1 } } },
      { type: "奇遇", payload: { "名称": "发现一个古老的宝箱", "事件": { type: "物品变化", payload: { "失去": [{ "名称": "宝箱钥匙", "数量": 1 }] } } } },
      { type: "物品变化", payload: { "获得": [{ "名称": "神秘的古籍", "数量": 1 }, { "名称": "灵石", "数量": 50 }] } },
      { type: "新图鉴发现", payload: { "类型": "物品", "数据": { "名称": "神秘的古籍", "描述": "一本记载着未知知识的古书。" } } },
      { type: "技能更新", payload: { "id": "鉴定", "熟练度": 5 } },
      { type: "新成就", payload: { "id": "forest_explorer", "名称": "森林探险家", "描述": "抵达森林深处。", "点数": 5 } },
    ];
    const response2 = createMockResponse(turn2_events, '天色渐暗，下起了小雨。你抵达了森林深处，用钥匙打开了一个宝箱。');
    const turn2MessageId = 'stress-turn-2';
    await handlers.onGenerationEnded(response2, turn2MessageId);

    generationStore._setTestState({
      isNewTurn: false,
      isAiGenerating: false,
    });

    generationStore._setTestState({
      isNewTurn: true,
      isAiGenerating: true,
    });

    // --- Assertions for Turn 2 ---
    expect(mockHistoryManager.addAssistantMessagePage).toHaveBeenCalledWith(response2);
    expect(worldStore.world.value.天气.当前天气).toBe('小雨');
    const questAfterTurn2 = questStore.quests.value.find(q => q.id === 'explore_forest');
    expect(questAfterTurn2).toBeDefined();
    if (questAfterTurn2) {
      expect(questAfterTurn2.当前进度.到达森林深处).toBe(1);
    }
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '宝箱钥匙')).toBeUndefined();
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '神秘的古籍')).toBeDefined();
    expect((pokedexStore.entries as any)['物品'].some((e: any) => e.名称 === '神秘的古籍')).toBe(true);
    const skill = skillStore.skills.value.find(s => s.id === '鉴定');
    expect(skill).toBeDefined();
    if (skill) {
      expect(skill.熟练度).toBe(10); // 5 (initial) + 5 (increase)
    }
    expect(achievementStore.points.value).toBe(15); // 10 initial + 5 gained

    // --- Turn 3 (Swipe A): 完成任务与庇护所升级 ---
    const turn3_events_A = [
      { type: "上下文更新", payload: { "时间": { "day": 3, "timeOfDay": "清晨" } } },
      { type: "任务完成", payload: { "id": "explore_forest" } },
      { type: "物品变化", payload: { "获得": [{ "名称": "任务奖励品", "数量": 1 }] } },
      { type: "庇护所升级", payload: { "组件ID": "工坊", "等级": "中级工坊" } },
      { type: "庇护所受损", payload: { "组件ID": "工坊", "数量": 10 } },
    ];
    const response3_A = createMockResponse(turn3_events_A, '一夜过去，你完成了探索任务，庇护所的工坊也升级了，但似乎有些损坏。');
    await handlers.onGenerationEnded(response3_A, 'stress-turn-3A');

    // --- Assertions for Turn 3 (Swipe A) ---
    expect(mockHistoryManager.addAssistantMessagePage).toHaveBeenCalledWith(response3_A);
    const questAfterSwipeA = questStore.quests.value.find(q => q.id === 'explore_forest');
    expect(questAfterSwipeA).toBeDefined();
    if (questAfterSwipeA) {
      expect(questAfterSwipeA.状态).toBe('已完成');
    }
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '任务奖励品')).toBeDefined();
    let shelterComponentsA = (worldStore.world.value.庇护所.组件 as any);
    expect(shelterComponentsA['工坊'].规模).toBe('中级工坊');
    expect(shelterComponentsA['工坊'].耐久度).toBe('90.00%');

    // --- 状态回溯：调用真实的 `recalculateAndApplyState` 回到第二回合结束的状态 ---
    const recalculationInputs = {
      startState: initialState,
      eventsToReplay: [...turn1_events, ...turn2_events],
    };
    await recalculateAndApplyState(
      mockHistoryManager as any,
      turn2MessageId,
      worldStore,
      characterStore,
      undefined,
      recalculationInputs
    );
    
    const newCharState = worldStore.world.value.角色.萧栖雪;
    Object.assign(characterStore.mainCharacter.value, newCharState);


    // --- Turn 3 (Swipe B): 不同的结果，庇护所严重受损 ---
    const turn3_events_B = [
      { type: "上下文更新", payload: { "时间": { "day": 3, "timeOfDay": "清晨" } } }, // 时间点相同
      { type: "任务失败", payload: { "id": "explore_forest" } }, // 任务失败了
      { type: "庇护所受损", payload: { "组件ID": "工坊", "数量": 50 } }, // 受到更严重的攻击
    ];
    const response3_B = createMockResponse(turn3_events_B, '你迷失了方向，未能在规定时间内完成任务。更糟糕的是，庇护所遭到了严重破坏。');
    await handlers.onGenerationEnded(response3_B, 'stress-turn-3B');

    // --- Final Assertions for Turn 3 (Swipe B) ---
    expect(mockHistoryManager.addAssistantMessagePage).toHaveBeenCalledWith(response3_B);
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalledTimes(5); // 总共调用了5次
    const questAfterSwipeB = questStore.quests.value.find(q => q.id === 'explore_forest');
    expect(questAfterSwipeB).toBeDefined();
    if (questAfterSwipeB) {
      expect(questAfterSwipeB.状态).toBe('失败');
    }
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '任务奖励品')).toBeUndefined(); // 没有获得奖励
    const shelterComponentsB = (worldStore.world.value.庇护所.组件 as any);
    expect(shelterComponentsB['工坊'].状态).toBe('严重受损'); // 状态变为严重受损
    expect(shelterComponentsB['工坊'].耐久度).toBe('50.00%'); // 100% - 50%
    expect(worldStore.world.value.time.day).toBe(3); // 时间正常推进
  });
});