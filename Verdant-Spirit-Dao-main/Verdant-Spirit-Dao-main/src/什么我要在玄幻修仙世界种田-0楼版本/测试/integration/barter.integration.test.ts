/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBarterStore, useCharacterStore, useGenerationStore, useWorldStore } from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 以物换物系统 (Barter)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let barterStore: ReturnType<typeof useBarterStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    barterStore = useBarterStore();

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
    
    // d. 为交易测试预设角色物品
    characterStore.mainCharacter.value.物品 = [{ 名称: '灵石', 数量: 10 }, { 名称: '草药', 数量: 5 }];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[交易] 成功执行一次交易', async () => {
    // a. 准备模拟数据 (用户已选择交易物品)
    barterStore.playerOfferedItems = [{ name: '灵石', quantity: 5 }];

    const events = [
      {
        type: "物品变化",
        payload: {
          "失去": [{ "名称": "灵石", "数量": 5 }],
          "获得": [{ "名称": "神秘丹药", "数量": 1 }]
        }
      },
      {
        type: "交易完成",
        payload: {}
      }
    ];
    const mockResponse = createMockResponse(events, '你用5颗灵石换来了一颗神秘的丹药。');
    generationStore.currentTurnSwipes = [mockResponse] as any;

    await handlers.onGenerationEnded(mockResponse, 'test-gen-barter');

    // c. 断言状态变化
    // c.1. 核心事件处理函数被调用
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();

    // c.2. 角色物品栏状态正确更新
    const finalItems = characterStore.mainCharacter.value.物品;
    expect(finalItems.find(item => item.名称 === '灵石')?.数量).toBe(5);
    expect(finalItems.find(item => item.名称 === '神秘丹药')?.数量).toBe(1);
    expect(finalItems.find(item => item.名称 === '草药')?.数量).toBe(5); // 未交易的物品应保持不变

    // c.3. 交易相关的Store状态被清空
    expect(barterStore.playerOfferedItems).toHaveLength(0);
    expect(useBarterStore().resetSelections).toHaveBeenCalled();
  });
});