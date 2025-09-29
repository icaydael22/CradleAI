/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCharacterStore,
  useGenerationStore,
  useWorldStore,
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 无系统 (None)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // Get fresh store instances for each test
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    
    // Run setup before each test, injecting the test-specific worldStore
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;

    if (handlers.setTestGenerationStore) {
      handlers.setTestGenerationStore(generationStore);
    }

    // Reset generation state specifically for the test
    generationStore._setTestState({
      isNewTurn: true,
      isAiGenerating: true,
    });
  });

  afterEach(() => {
    // Reset all mocks after each test to ensure isolation
    vi.clearAllMocks();
  });

  it('[无系统] 处理一次不含任何特殊系统事件的标准交互', async () => {
    const events = [
      { type: "上下文更新", payload: { "时间": { "day": 2 } } },
      { type: "物品变化", payload: { "获得": [{ "名称": "测试物品", "数量": 1 }] } }
    ];
    const mockResponse = createMockResponse(events);
    generationStore.currentTurnSwipes = [mockResponse] as any;

    await handlers.onGenerationEnded(mockResponse, 'test-gen-1');

    //console.log("worldStore.world:", worldStore.world.value);

    expect(worldStore.world.value.time.day).toBe(2);
    expect(characterStore.mainCharacter.value.物品).toHaveLength(1);
    expect(characterStore.mainCharacter.value.物品[0].名称).toBe('测试物品');

    // Verify that the core event processing was called
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();
  });
});