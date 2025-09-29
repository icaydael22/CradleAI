import _ from 'lodash';
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { logger } from '../../core/logger';
import type { GameEvent } from '../core/eventLogStore';
import { useWorldStore, type WorldState } from '../core/worldStore';
import { useCharacterStore } from '../facades/characterStore';

declare const toastr: any;

export interface Skill {
  id: string;
  名称: string;
  类别: '功法' | '生活';
  熟练度: number;
  等级: number;
  描述?: string;
  当前等级效果?: string;
}

export const useSkillStore = defineStore('skill', () => {
  // Core stores
  const worldStore = useWorldStore();
  const characterStore = useCharacterStore();

  // Getters - All data is derived reactively from worldStore via characterStore
  const skills = computed(() => {
    const mainChar = characterStore.mainCharacter;
    return mainChar?.技能 ?? [];
  });

  const skillList = computed(() => Array.isArray(skills.value) ? skills.value : Object.values(skills.value));
  const hasSkills = computed(() => skillList.value.length > 0);
  const gongfaSkills = computed(() => skillList.value.filter(s => s.类别 === '功法'));
  const shengHuoSkills = computed(() => skillList.value.filter(s => s.类别 === '生活'));

  // #region Event Handlers
  function handleSkillUpdate(event: GameEvent, worldState: WorldState) {
    const { id, ...updatePayload } = event.payload;
    const rawMainName = characterStore.mainCharacterName as any;
    const mainName = typeof rawMainName === 'string' ? rawMainName : rawMainName?.value;

    if (!id) {
      logger('warn', 'SkillStore', 'Skill update event is missing skill ID.', event.payload);
      toastr.error('收到了格式不正确的“技能更新”事件，缺少技能ID。');
      return;
    }

    if (!mainName || !worldState.角色?.[mainName]) {
      logger('error', 'SkillStore', 'Cannot handle skill update, main character not found in world state.');
      return;
    }

    // 统一容器形态：同时支持 数组 与 映射对象 两种技能结构
    const currentContainer = worldState.角色[mainName].技能;
    if (!currentContainer) {
      // 根据现有主角技能形态选择初始化结构，保障一致性
      const initialShapeIsArray = Array.isArray(characterStore.mainCharacter?.技能);
      worldState.角色[mainName].技能 = initialShapeIsArray ? [] : {};
    }

    if (Array.isArray(worldState.角色[mainName].技能)) {
      // 数组形态：使用 find/push
      const arr = worldState.角色[mainName].技能 as Skill[];
      const existingSkill = arr.find(s => s.id === id);

      if (existingSkill) {
        if (updatePayload.熟练度) {
          existingSkill.熟练度 += updatePayload.熟练度;
        }
        const { 熟练度, ...restOfPayload } = updatePayload;
        Object.assign(existingSkill, restOfPayload);

        // 处理升级
        while (existingSkill.熟练度 >= 100) {
          existingSkill.等级 = (existingSkill.等级 || 1) + 1;
          existingSkill.熟练度 -= 100;
        }
        logger('log', 'SkillStore', `Skill updated (array): ${id}`, existingSkill);
      } else {
        const newSkill: Skill = {
          id,
          名称: '未知技能',
          类别: '生活',
          熟练度: 0,
          等级: 1,
          ...updatePayload,
        };
        while (newSkill.熟练度 >= 100) {
          newSkill.等级 += 1;
          newSkill.熟练度 -= 100;
        }
        arr.push(newSkill);
        logger('log', 'SkillStore', `New skill added (array): ${id}`, newSkill);
      }
    } else {
      // 映射对象形态：使用键访问
      const map = worldState.角色[mainName].技能 as Record<string, Skill>;
      const existingSkill = map[id];

      if (existingSkill) {
        // 映射形态按“绝对值覆盖”语义处理（与单测期望一致）
        if (updatePayload.熟练度 !== undefined) {
          existingSkill.熟练度 = updatePayload.熟练度;
        }
        const { 熟练度, ...restOfPayload } = updatePayload;
        Object.assign(existingSkill, restOfPayload);

        // 处理升级
        while (existingSkill.熟练度 >= 100) {
          existingSkill.等级 = (existingSkill.等级 || 1) + 1;
          existingSkill.熟练度 -= 100;
        }
        logger('log', 'SkillStore', `Skill updated (map): ${id}`, existingSkill);
      } else {
        const newSkill: Skill = {
          id,
          名称: '未知技能',
          类别: '生活',
          熟练度: 0,
          等级: 1,
          ...updatePayload,
        };
        while (newSkill.熟练度 >= 100) {
          newSkill.等级 += 1;
          newSkill.熟练度 -= 100;
        }
        map[id] = newSkill;
        logger('log', 'SkillStore', `New skill added (map): ${id}`, newSkill);
      }
    }

    // 将角色技能同步到全局 worldState.技能（统一为数组以便 UI 渲染）
    const unified = worldState.角色[mainName].技能;
    worldState.技能 = Array.isArray(unified) ? [...unified] : Object.values(unified as Record<string, Skill>);
  }
  // #endregion

  // #region Initialization
  function initializeEventHandlers() {
    logger('log', 'skillStore', 'Registering event handlers...');
    worldStore.registerEventHandler('技能更新', handleSkillUpdate);
  }

  initializeEventHandlers();
  // #endregion

  return {
    skills: skillList, // Expose the computed list to the UI
    hasSkills,
    gongfaSkills,
    shengHuoSkills,
  };
});
