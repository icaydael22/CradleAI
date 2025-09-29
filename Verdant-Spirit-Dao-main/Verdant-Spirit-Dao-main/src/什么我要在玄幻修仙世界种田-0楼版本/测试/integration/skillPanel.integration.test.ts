/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillStore, useCharacterStore, useGenerationStore, useWorldStore } from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';

describe('集成测试: 技能面板 (SkillPanel)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let skillStore: ReturnType<typeof useSkillStore>;
  const generationStore = useGenerationStore();

  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    skillStore = useSkillStore();

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

    // d. 为技能测试预设角色和技能状态（使用增量叠加逻辑：初始熟练度为 5，事件 +10 -> 15）
    characterStore.mainCharacter.value.灵力 = 100;
    characterStore.mainCharacter.value.技能 = [
      { id: '炼丹', 名称: '炼丹', 类别: '生活', 熟练度: 5, 等级: 1 },
    ];
    (worldStore.world.value.技能 as any[]) = [
      { id: '炼丹', 名称: '炼丹', 类别: '生活', 熟练度: 5, 等级: 1 },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[技能] 使用技能提升熟练度并消耗资源', async () => {
    // a. 准备模拟数据
    const events = [
      { type: "技能更新", payload: { "id": "炼丹", "名称":"炼丹","熟练度": 10 } },
      { type: "角色更新", payload: { "灵力": -20 } }
    ];
    const mockResponse = createMockResponse(events, '你使用了炼丹术，感觉熟练度有所提升，但消耗了些许灵力。');
    generationStore.currentTurnSwipes = [mockResponse] as any;

    // b. 执行核心逻辑
    await handlers.onGenerationEnded(mockResponse, 'test-gen-skill-1');

    // c. 断言状态变化
    // c.1. 核心事件处理函数被调用
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();

    // c.2. SkillStore 状态正确更新
    const skill = skillStore.skills.value.find(s => s.id === '炼丹');
    expect(skill).toBeDefined();
    if (skill) {
      expect(skill.熟练度).toBe(15); // 5（初始） + 10（事件增量）
    }

    // c.3. CharacterStore 状态正确更新
    expect(characterStore.mainCharacter.value.灵力).toBe(80); // 100 (initial) - 20 (cost)
  });
});