/// <reference types="vitest/globals" />

import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import SkillPanel from '../../components/system/SkillPanel.vue';
import {
  useCharacterStore,
  useGenerationStore,
  useSkillStore,
  useWorldStore,
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from '../integration/integrationTestSetup';

// 我们不 mock 核心的 stateUpdater 逻辑，但 mock 与外部系统的交互
vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
    saveStateSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

describe('最终集成测试: 技能系统 (Skill System End-to-End)', () => {
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  let skillStore: ReturnType<typeof useSkillStore>;
  let generationStore: ReturnType<typeof useGenerationStore>;
  let pinia: ReturnType<typeof createTestingPinia>;

  // 在所有测试开始前，设置一个持久化的测试环境
  beforeAll(() => {
    pinia = createTestingPinia({ stubActions: false });
    setActivePinia(pinia);

    // 所有 store 都从同一个 pinia 实例中获取
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    skillStore = useSkillStore();
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

  it('[技能全流程] 应能完整模拟从学习、升级到最终UI渲染的全过程', async () => {
    
    // --- 阶段一：创世 (Genesis) ---
    const initialState = {
      世界: {
        time: { day: 1, timeOfDay: '清晨' },
        角色: {
          '萧栖雪': { 姓名: '萧栖雪', 技能: {} }
        }
      },
      角色: {
        '萧栖雪': { 姓名: '萧栖雪', 技能: {} }
      }
    };
    worldStore._dangerouslySetState(initialState.世界);
    characterStore.$patch({ characters: initialState.角色 });

    // **后端断言**: 初始状态下没有技能
    expect(skillStore.skills.value).toEqual([]);
    expect(skillStore.hasSkills.value).toBe(false);

    // **前端断言**: 初始UI应显示空状态
    const initialWrapper = mount(SkillPanel, { global: { plugins: [pinia] } });
    expect(initialWrapper.text()).toContain('尚未学习任何技能。');

    // --- 阶段二：学习新技能 (Learning a New Skill) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn1_events = [
      { type: "技能更新", payload: { id: 'gongfa_01', 名称: '长春诀', 类别: '功法', 熟练度: 30 } },
    ];
    const response1 = createMockResponse(turn1_events, '你在冥想中领悟了「长春诀」的基础法门。');
    
    await handlers.onGenerationEnded(response1, 'turn-1-msg');

    // **后端断言**: 技能已正确添加
    expect(skillStore.skills.value).toHaveLength(1);
    const changchunJue = skillStore.skills.value.find((s: any) => s.id === 'gongfa_01');
    expect(changchunJue).toBeDefined();
    expect(changchunJue?.名称).toBe('长春诀');
    expect(changchunJue?.等级).toBe(1);
    expect(changchunJue?.熟练度).toBe(30);

    // --- 阶段三：提升熟练度 (Gaining Proficiency) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn2_events = [
      { type: "技能更新", payload: { id: 'gongfa_01', 熟练度: 50 } },
    ];
    const response2 = createMockResponse(turn2_events, '经过一番苦修，你的「长春诀」更加精进了。');
    await handlers.onGenerationEnded(response2, 'turn-2-msg');

    // **后端断言**: 熟练度增加，等级不变
    const changchunJueT2 = skillStore.skills.value.find((s: any) => s.id === 'gongfa_01');
    expect(changchunJueT2?.熟练度).toBe(80); // 30 + 50
    expect(changchunJueT2?.等级).toBe(1);

    // --- 阶段四：技能升级 (Leveling Up) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn3_events = [
      { type: "技能更新", payload: { id: 'gongfa_01', 熟练度: 40 } }, // 80 + 40 = 120
    ];
    const response3 = createMockResponse(turn3_events, '你感觉体内的灵力流动豁然开朗，「长春诀」突破了！');
    await handlers.onGenerationEnded(response3, 'turn-3-msg');

    // **后端断言**: 等级提升，熟练度被正确扣除
    const changchunJueT3 = skillStore.skills.value.find((s: any) => s.id === 'gongfa_01');
    expect(changchunJueT3?.等级).toBe(2);
    expect(changchunJueT3?.熟练度).toBe(20); // 120 - 100

    // --- 阶段五：学习新技能并一次性多级提升 (Learning Another Skill with Multi-Level Up) ---
    generationStore._setTestState({ isNewTurn: true, isAiGenerating: true });
    const turn4_events = [
      { type: "技能更新", payload: { id: 'shengHuo_01', 名称: '炼丹术', 类别: '生活', 熟练度: 250 } },
    ];
    const response4 = createMockResponse(turn4_events, '你从一本古籍中习得了「炼丹术」，并展现出了惊人的天赋。');
    await handlers.onGenerationEnded(response4, 'turn-4-msg');

    // **后端断言**: 新技能被添加，并且等级和熟练度计算正确
    expect(skillStore.skills.value).toHaveLength(2);
    const liandanShu = skillStore.skills.value.find((s: any) => s.id === 'shengHuo_01');
    expect(liandanShu).toBeDefined();
    expect(liandanShu?.名称).toBe('炼丹术');
    expect(liandanShu?.类别).toBe('生活');
    expect(liandanShu?.等级).toBe(3); // 250 -> L1+100 -> L2+100 -> L3
    expect(liandanShu?.熟练度).toBe(50); // 250 - 200

    // --- 阶段六：最终UI验证 (Final UI Assertion) ---
    // 遵循最佳实践，为最终UI渲染创建一个独立的Pinia实例
    // 最终UI验证不再需要创建新的pinia实例，
    // 因为我们的mock store是全局共享且响应式的。
    // 我们将通过props直接注入最新的store状态。
    const finalWrapper = mount(SkillPanel, {
      global: { plugins: [pinia] }, // 使用贯穿测试的同一个pinia实例
      props: {
        // @ts-ignore
        testSkillStore: {
          // 直接传递最终计算好的数组，而不是整个store实例
          hasSkills: skillStore.hasSkills.value,
          gongfaSkills: skillStore.gongfaSkills.value,
          shengHuoSkills: skillStore.shengHuoSkills.value,
        },
      }
    });
    await finalWrapper.vm.$nextTick();

    // **前端断言**: UI应精确反映最终的后端状态
    expect(finalWrapper.text()).not.toContain('尚未学习任何技能。');

    // 1. 验证功法技能
    const gongfaSection = finalWrapper.find('[data-testid="gongfa-section"]');
    expect(gongfaSection.exists()).toBe(true);
    expect(gongfaSection.text()).toContain('长春诀');
    expect(gongfaSection.text()).toContain('Lv. 2');
    expect(gongfaSection.text()).toContain('20 / 100');
    const gongfaProgressBar = gongfaSection.find('.progress-bar-fg');
    expect(gongfaProgressBar.attributes('style')).toContain('width: 20%');

    // 2. 验证生活技能
    const shenghuoSection = finalWrapper.find('[data-testid="shenghuo-section"]');
    expect(shenghuoSection.exists()).toBe(true);
    expect(shenghuoSection.text()).toContain('炼丹术');
    expect(shenghuoSection.text()).toContain('Lv. 3');
    expect(shenghuoSection.text()).toContain('50 / 100');
    const shenghuoProgressBar = shenghuoSection.find('.progress-bar-fg');
    expect(shenghuoProgressBar.attributes('style')).toContain('width: 50%');
  });
});