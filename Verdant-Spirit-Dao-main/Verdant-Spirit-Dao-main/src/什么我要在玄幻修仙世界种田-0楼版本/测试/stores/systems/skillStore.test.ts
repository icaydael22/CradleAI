import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { computed } from 'vue';
import { useWorldStore } from '@/stores/core/worldStore';
import { useCharacterStore } from '@/stores/facades/characterStore';
import { useSkillStore, type Skill } from '@/stores/systems/skillStore';
import { logger } from '@/core/logger';

// Mock dependencies
vi.mock('@/stores/core/worldStore');
vi.mock('@/stores/facades/characterStore');
vi.mock('@/core/logger');

const mockInitialSkills: Record<string, Skill> = {
  'gongfa_01': { id: 'gongfa_01', 名称: '长春诀', 类别: '功法', 等级: 2, 熟练度: 30 },
  'shengHuo_01': { id: 'shengHuo_01', 名称: '炼丹术', 类别: '生活', 等级: 1, 熟练度: 80 },
};

describe('useSkillStore', () => {
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    const mockCharacter = {
      技能: _.cloneDeep(mockInitialSkills),
    };
    
    worldStore = {
      world: {
        角色: {
          '主角': mockCharacter,
        },
      },
      registerEventHandler: vi.fn(),
    } as any;

    characterStore = {
      mainCharacter: mockCharacter,
      mainCharacterName: '主角',
    } as any;

    vi.mocked(useWorldStore).mockReturnValue(worldStore);
    vi.mocked(useCharacterStore).mockReturnValue(characterStore);

    (global as any).toastr = {
      error: vi.fn(),
    };
  });

  describe('Getters', () => {
    it('should derive the skill list correctly', () => {
      const skillStore = useSkillStore();
      expect(skillStore.skills).toHaveLength(2);
      expect(skillStore.hasSkills).toBe(true);
    });

    it('should filter gongfa skills', () => {
      const skillStore = useSkillStore();
      expect(skillStore.gongfaSkills).toHaveLength(1);
      expect(skillStore.gongfaSkills[0].id).toBe('gongfa_01');
    });

    it('should filter shengHuo skills', () => {
      const skillStore = useSkillStore();
      expect(skillStore.shengHuoSkills).toHaveLength(1);
      expect(skillStore.shengHuoSkills[0].id).toBe('shengHuo_01');
    });

    it('should return empty arrays if character has no skills', () => {
      characterStore.mainCharacter.技能 = {}; // Modify the mock directly
      const skillStore = useSkillStore();
      expect(skillStore.skills).toEqual([]);
      expect(skillStore.hasSkills).toBe(false);
    });
  });

  describe('Event Handlers', () => {
    let handlers: Record<string, (event: any, worldState: any) => void> = {};

    beforeEach(() => {
      handlers = {};
      vi.mocked(worldStore.registerEventHandler).mockImplementation((eventType, handler) => {
        handlers[eventType] = handler;
      });
      // Instantiate the store to trigger the event handler registration
      useSkillStore();
    });

    it('handleSkillUpdate should add a new skill', () => {
      const worldState = { 角色: { '主角': { 技能: {} } } };
      const newSkillEvent = {
        payload: { id: 'new_01', 名称: '新技能', 类别: '生活', 熟练度: 10 },
      };

      handlers['技能更新'](newSkillEvent, worldState);

      const newSkill = worldState.角色.主角.技能['new_01'];
      expect(newSkill).toBeDefined();
      expect(newSkill.等级).toBe(1);
      expect(newSkill.熟练度).toBe(10);
    });

    it('handleSkillUpdate should update an existing skill', () => {
      const worldState = { 角色: { '主角': { 技能: _.cloneDeep(mockInitialSkills) } } };
      const updateEvent = {
        payload: { id: 'shengHuo_01', 熟练度: 95 },
      };

      handlers['技能更新'](updateEvent, worldState);

      const updatedSkill = worldState.角色.主角.技能['shengHuo_01'];
      expect(updatedSkill.熟练度).toBe(95);
      expect(updatedSkill.等级).toBe(1); // No level up
    });

    it('handleSkillUpdate should handle a single level up', () => {
      const worldState = { 角色: { '主角': { 技能: _.cloneDeep(mockInitialSkills) } } };
      const levelUpEvent = {
        payload: { id: 'shengHuo_01', 熟练度: 120 },
      };

      handlers['技能更新'](levelUpEvent, worldState);

      const updatedSkill = worldState.角色.主角.技能['shengHuo_01'];
      expect(updatedSkill.等级).toBe(2);
      expect(updatedSkill.熟练度).toBe(20); // 120 - 100
    });

    it('handleSkillUpdate should handle multiple level ups at once', () => {
      const worldState = { 角色: { '主角': { 技能: _.cloneDeep(mockInitialSkills) } } };
      const multiLevelUpEvent = {
        payload: { id: 'shengHuo_01', 熟练度: 350 },
      };

      handlers['技能更新'](multiLevelUpEvent, worldState);

      const updatedSkill = worldState.角色.主角.技能['shengHuo_01'];
      expect(updatedSkill.等级).toBe(4); // 1 -> 2 -> 3 -> 4
      expect(updatedSkill.熟练度).toBe(50); // 350 - 300
    });
    
    it('handleSkillUpdate should add a new skill and level it up immediately', () => {
      const worldState = { 角色: { '主角': { 技能: {} } } };
      const newSkillEvent = {
        payload: { id: 'new_02', 名称: '天才技能', 类别: '功法', 熟练度: 250 },
      };

      handlers['技能更新'](newSkillEvent, worldState);

      const newSkill = worldState.角色.主角.技能['new_02'];
      expect(newSkill).toBeDefined();
      expect(newSkill.等级).toBe(3); // 1 -> 2 -> 3
      expect(newSkill.熟练度).toBe(50); // 250 - 200
    });

    it('should not process event if skill ID is missing', () => {
      const worldState = { 角色: { '主角': { 技能: _.cloneDeep(mockInitialSkills) } } };
      const invalidEvent = { payload: { 名称: '无效技能' } };

      handlers['技能更新'](invalidEvent, worldState);

      // State should remain unchanged
      expect(worldState.角色.主角.技能).toEqual(mockInitialSkills);
      
      // Check that at least one of the calls to logger was a warn call with the correct message.
      const loggerCalls = vi.mocked(logger).mock.calls;
      const warnCall = loggerCalls.find(call => 
        call[0] === 'warn' && 
        call[1] === 'SkillStore' && 
        typeof call[2] === 'string' &&
        call[2].includes('missing skill ID')
      );
      expect(warnCall).toBeDefined();
    });
  });
});
