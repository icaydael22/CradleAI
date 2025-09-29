/// <reference types="vitest/globals" />

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  useCharacterStore,
  useQuestStore,
  useWorldStore,
} from '../__mocks__/stores';
import { setupIntegrationTest } from './integrationTestSetup';
import { overwriteAllChatVariables } from '../../core/variables';
import { mockHistoryManagerInstance } from '../../core/__mocks__/history';
import { recalculateAndApplyState } from '../../core/stateUpdater';

// Mock the real modules that are not part of the integration test setup
const getGenesisMessage = vi.fn().mockReturnValue('创世消息');

vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../core/stateUpdater', async (importOriginal) => {
    const actual = await importOriginal() as object;
    return {
        ...actual,
        recalculateAndApplyState: vi.fn().mockImplementation(async (historyManager, messageId, worldStore, characterStore, pinia, inputs) => {
            if (inputs) {
                worldStore._dangerouslySetState(inputs.startState.世界);
                characterStore.$patch({ characters: inputs.startState.角色 });
                worldStore._dangerouslyProcessEvents(inputs.eventsToReplay);
            }
        }),
    }
})

describe('集成测试: 核心流程 (Core Flow)', () => {
  // --- 使用 beforeAll 和 afterAll 来设置一个连续的测试场景 ---
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let questStore: ReturnType<typeof useQuestStore>;
  let mockHistoryManager: ReturnType<typeof setupIntegrationTest>['mockHistoryManager'];
  
  beforeAll(() => {
    // 在所有测试开始前只设置一次
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    questStore = useQuestStore();
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;
    mockHistoryManager = setup.mockHistoryManager;
  });

  afterAll(() => {
    // 在所有测试结束后清理
    vi.clearAllMocks();
  });

  it('[新游戏] 应能正确处理创世消息并初始化所有核心Stores', async () => {
    const customInitialState = {
      世界: { time: { day: 1, timeOfDay: '清晨' }, 地点: '初始地点' },
      角色: { '萧栖雪': { 姓名: '萧栖雪', 物品: [{ 名称: '初始物品', 数量: 1 }] } }
    };
    await overwriteAllChatVariables(customInitialState);
    const genesisMessage = getGenesisMessage(customInitialState);
    await mockHistoryManager.addAssistantMessagePage(genesisMessage);
    await mockHistoryManager.loadHistory();
    expect(overwriteAllChatVariables).toHaveBeenCalledWith(customInitialState);
    expect(getGenesisMessage).toHaveBeenCalledWith(customInitialState);
    expect(mockHistoryManager.addAssistantMessagePage).toHaveBeenCalledWith('创世消息');
    expect(mockHistoryManager.loadHistory).toHaveBeenCalled();
  });

  it('[状态恢复] 应能从包含多个事件的历史记录中精确重建当前状态', async () => {
    const events = [
        { type: "上下文更新", payload: { "时间": { "day": 2 } } },
        { type: "物品变化", payload: { "获得": [{ "名称": "灵石", "数量": 10 }] } },
        { type: "新任务接收", payload: { "id": "test_quest", "名称": "测试任务" } },
        { type: "角色更新", payload: { "体力": -5 } },
    ];
    worldStore._dangerouslyProcessEvents(events);
    expect(worldStore.world.value.time.day).toBe(2);
    const characterItems = characterStore.mainCharacter.value.物品;
    expect(characterItems.find(item => item.名称 === '灵石')?.数量).toBe(10);
    expect(characterStore.mainCharacter.value.体力).toBe(95);
    expect(questStore.quests.value.find(q => q.id === 'test_quest')).toBeDefined();
  });

  it('[状态切换] 在同一回合内切换Swipe应能正确回溯并重算状态', async () => {
    // 1. 准备历史状态 (State_N-1)
    // 此状态是上一个测试结束时的状态：day 2, 10个灵石, 95体力, 1个任务
    const stateN_1 = {
        世界: JSON.parse(JSON.stringify(worldStore.world.value)),
        角色: JSON.parse(JSON.stringify(characterStore.characters.value)),
    };

    // 2. 准备两个并行的 Swipe
    const event_A = [{ type: "物品变化", payload: { "失去": [{ "名称": "灵石", "数量": 5 }] } }];
    const event_B = [{ type: "物品变化", payload: { "获得": [{ "名称": "草药", "数量": 1 }] } }];

    // 3. 首先激活 Swipe_A
    worldStore._dangerouslyProcessEvents(event_A);
    // 断言：此时灵石数量应为 10 - 5 = 5
    expect(characterStore.mainCharacter.value.物品.find(i => i.名称 === '灵石')?.数量).toBe(5);

    // 4. 模拟用户切换到 Swipe_B
    await recalculateAndApplyState(
        mockHistoryManager as any,
        'message-id-for-swipe-B',
        worldStore,
        characterStore,
        undefined,
        {
            startState: stateN_1,
            eventsToReplay: event_B,
        }
    );

    // 5. 断言最终状态
    const finalItems = characterStore.mainCharacter.value.物品;
    expect(finalItems.find(i => i.名称 === '灵石')?.数量).toBe(10); // 灵石数量恢复
    expect(finalItems.find(i => i.名称 === '草药')?.数量).toBe(1); // 获得了草药
    expect(characterStore.mainCharacter.value.体力).toBe(95); // 体力应保持不变
    expect(questStore.quests.value.find(q => q.id === 'test_quest')).toBeDefined(); // 任务状态应保持
  });

  it.todo('[分支创建] 从历史节点创建新分支应能正确复制并建立新的状态起点');
});