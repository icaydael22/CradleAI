/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAchievementStore, useGenerationStore, useWorldStore } from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 成就系统 (Achievement)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let achievementStore: ReturnType<typeof useAchievementStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    achievementStore = useAchievementStore();

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

  it('[成就] 解锁新成就并获得点数', async () => {

    const achievementEvent = {
      type: "新成就",
      payload: {
        "id": "first_step",
        "名称": "第一步",
        "描述": "完成新手教程。",
        "点数": 10
      }
    };
    const mockResponse = createMockResponse([achievementEvent]);
    generationStore.currentTurnSwipes = [mockResponse] as any;

    await handlers.onGenerationEnded(mockResponse, 'test-gen-2');
    
    // 关键断言：验证事件处理函数是否被调用
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();
    
    // 验证状态
    expect(achievementStore.points.value).toBe(10);
    expect(achievementStore.completedAchievements.value).toHaveLength(1);
    const completedAchievement = (achievementStore.completedAchievements.value as any[]);
    expect(completedAchievement[0].id).toBe('first_step');
    expect(completedAchievement[0].名称).toBe('第一步');
  });
});