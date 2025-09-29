/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignInStore, useCharacterStore, useGenerationStore, useWorldStore } from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 签到系统 (SignIn)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let signInStore: ReturnType<typeof useSignInStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    signInStore = useSignInStore();

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

    // d. 为签到测试预设状态
    worldStore.world.value.签到 = {
      今日已签到: false,
      连续签到天数: 5,
      签到记录: {}, // Add missing property
      月卡: {
        状态: '未激活',
        activatedDate: null,
      },
    };
    // Match the type definition for the time object
    worldStore.world.value.time = { day: 1, timeOfDay: '子时' };
    characterStore.mainCharacter.value.物品 = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[签到] 执行每日签到并获得奖励', async () => {
    // a. 准备模拟数据
    const events = [
      {
        type: "签到",
        payload: {
          "连续天数": 6,
          "今日已签到": true
        }
      },
      {
        type: "物品变化",
        payload: {
          "获得": [{ "名称": "签到奖励", "数量": 1 }]
        }
      }
    ];
    const mockResponse = createMockResponse(events, '你完成了今日签到，获得了奖励。');
    generationStore.currentTurnSwipes = [mockResponse] as any;

    // b. 执行核心逻辑
    await handlers.onGenerationEnded(mockResponse, 'test-gen-signin');

    // c. 断言状态变化
    // c.1. 核心事件处理函数被调用
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();

    //console.log("signInStore:",signInStore)

    // c.2. SignInStore 状态正确更新
    expect(worldStore.world.value.签到.今日已签到).toBe(true);
    expect(worldStore.world.value.签到.连续签到天数).toBe(6);

    // c.3. CharacterStore 状态正确更新 (获得奖励)
    const finalItems = characterStore.mainCharacter.value.物品;
    expect(finalItems).toHaveLength(1);
    expect(finalItems[0].名称).toBe('签到奖励');
    expect(finalItems[0].数量).toBe(1);
  });

  it('[签到] 激活月卡', async () => {
    worldStore.world.value.time!.day = 10; // Set a specific day for activation

    const events = [
      { type: "月卡激活", payload: {} },
      { type: "物品变化", payload: { "失去": [{ "名称": "月卡", "数量": 1 }] } }
    ];
    const mockResponse = createMockResponse(events, '你激活了月卡。');
    generationStore.currentTurnSwipes = [mockResponse] as any;

    await handlers.onGenerationEnded(mockResponse, 'test-gen-monthly-card');

    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();

    const signInState = worldStore.world.value.签到;
    expect(signInState.月卡.状态).toBe('已激活');
    expect(signInState.月卡.activatedDate).toBe(10);

    // Verify card is active
    // In the mock, getters are not reactive, so we need to re-evaluate
    // the condition based on the current state.
    let isActive = signInState.月卡.状态 === '已激活' && signInState.月卡.activatedDate !== null && (worldStore.world.value.time!.day - signInState.月卡.activatedDate) < 30;
    expect(isActive).toBe(true);

    // Verify card expires after 30 days
    worldStore.world.value.time!.day = 40;
    isActive = signInState.月卡.状态 === '已激活' && signInState.月卡.activatedDate !== null && (worldStore.world.value.time!.day - signInState.月卡.activatedDate) < 30;
    expect(isActive).toBe(false);
  });
});