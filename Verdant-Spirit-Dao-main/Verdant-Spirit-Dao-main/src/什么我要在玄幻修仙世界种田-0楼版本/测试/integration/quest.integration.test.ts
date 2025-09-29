/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharacterStore, useGenerationStore, useQuestStore, useWorldStore } from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 任务系统 (Quest)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let questStore: ReturnType<typeof useQuestStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    questStore = useQuestStore();

    // b. 运行测试设置，并将关键的 worldStore 实例注入进去
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;

    if (handlers.setTestGenerationStore) {
      handlers.setTestGenerationStore(generationStore);
    }

    // c. 准备测试需要的特定状态
    generationStore._setTestState({
      isNewTurn: true,
      isAiGenerating: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[任务] 接收新任务 -> 更新进度 -> 完成任务', async () => {
    const questId = 'find_herb';

    // --- 步骤 1: 接收新任务 ---
    const receiveQuestEvent = {
      type: "新任务接收",
      payload: {
        "id": questId,
        "名称": "寻找草药",
        "描述": "为炼丹师寻找一株稀有的草药。",
        "目标": { "收集草药": 1 },
        "当前进度": { "收集草药": 0 }
      }
    };
    const response1 = createMockResponse([receiveQuestEvent]);
    generationStore.currentTurnSwipes = [response1] as any;
    await handlers.onGenerationEnded(response1, 'test-gen-q1');

    // 断言: 任务已接收
    const questAfterReceiving = questStore.quests.value.find(q => q.id === questId);
    expect(questAfterReceiving).toBeDefined();
    if (questAfterReceiving) {
      expect(questAfterReceiving.状态).toBe('进行中');
      expect(questAfterReceiving.当前进度.收集草药).toBe(0);
    }

    // --- 步骤 2: 更新任务进度 ---
    const updateQuestEvent = {
      type: "任务进度更新",
      payload: { "id": questId, "当前进度": { "收集草药": 1 } }
    };
    const response2 = createMockResponse([updateQuestEvent]);
    generationStore.currentTurnSwipes = [response2] as any;
    await handlers.onGenerationEnded(response2, 'test-gen-q2');

    // 断言: 任务进度已更新
    const questAfterUpdate = questStore.quests.value.find(q => q.id === questId);
    expect(questAfterUpdate).toBeDefined();
    if (questAfterUpdate) {
      expect(questAfterUpdate.当前进度.收集草药).toBe(1);
      expect(questAfterUpdate.状态).toBe('进行中'); // 状态不变
    }

    // --- 步骤 3: 完成任务并获得奖励 ---
    const completeQuestEvents = [
      { type: "任务完成", payload: { "id": questId } },
      { type: "物品变化", payload: { "获得": [{ "名称": "灵石", "数量": 10 }] } }
    ];
    const response3 = createMockResponse(completeQuestEvents);
    generationStore.currentTurnSwipes = [response3] as any;
    await handlers.onGenerationEnded(response3, 'test-gen-q3');

    // 断言: 任务已完成，奖励已发放
    const questAfterCompletion = questStore.quests.value.find(q => q.id === questId);
    expect(questAfterCompletion).toBeDefined();
    if (questAfterCompletion) {
      expect(questAfterCompletion.状态).toBe('已完成');
    }
    const finalItems = characterStore.mainCharacter.value.物品;
    expect(finalItems.find(item => item.名称 === '灵石')?.数量).toBe(10);

    // 断言: 每一步都调用了核心事件处理器
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalledTimes(3);
  });
});