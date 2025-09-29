import { defineStore } from 'pinia';
import { computed } from 'vue';
import { z } from 'zod';
import _ from 'lodash';
import { logger } from '../../core/logger';
import { useWorldStore, type WorldState } from '../core/worldStore';
import type { GameEvent } from '../core/eventLogStore';

declare const toastr: any;

// #region Zod Schemas
const QuestObjectiveSchema = z.object({
  描述: z.string(),
  完成: z.boolean(),
});

const QuestProgressSchema = z.object({
    label: z.string().optional(),
    value: z.number().optional(),
    max: z.number().optional(),
    text: z.string().optional(),
});

const QuestRewardSchema = z.union([
    z.string(), // 兼容 "100灵石"
    z.object({ // 兼容 { "名称": "新手工具箱", "数量": 1 }
        名称: z.string(),
        数量: z.number().optional(),
    }),
    z.object({ // 兼容LLM新的格式 { "type": "角色经验", "value": 50 }
        type: z.string(),
        value: z.any().optional(),
        名称: z.string().optional(),
        数量: z.number().optional(),
    }).passthrough(), // 使用 passthrough 允许其他未知字段
]);

const QuestSchema = z.object({
  id: z.string(),
  名称: z.string(),
  描述: z.string(),
  类型: z.string().optional(), // 从LLM接收的任务类型
  状态: z.enum(['进行中', '已完成', '未完成', '失败']),
  目标: z.array(QuestObjectiveSchema).optional(),
  objectives: z.array(QuestObjectiveSchema).optional(), // 兼容旧写法
  奖励: z.union([z.string(), z.array(QuestRewardSchema)]).optional(),
  条件: z.array(z.string()).optional(),
  进度: z.union([QuestProgressSchema, z.array(QuestProgressSchema)]).optional(),
});

export type Quest = z.infer<typeof QuestSchema>;
// #endregion

interface QuestStoreDependencies {
  worldStore?: ReturnType<typeof useWorldStore>;
}

export const createQuestStore = (dependencies: QuestStoreDependencies = {}) => defineStore('quest', () => {
  // Core stores
  const worldStore = dependencies.worldStore || useWorldStore();

  // Getters - All data is derived reactively from worldStore
  const quests = computed(() => (worldStore.world?.任务列表 as Quest[] | undefined) ?? []);
  const ongoingQuests = computed(() => quests.value.filter(q => q.状态 === '进行中'));
  const completedQuests = computed(() => quests.value.filter(q => q.状态 === '已完成'));
  const notCompletedQuests = computed(() => quests.value.filter(q => q.状态 === '未完成'));
  const failedQuests = computed(() => quests.value.filter(q => q.状态 === '失败'));

  // #region Event Handlers
  function handleNewQuest(event: GameEvent, worldState: WorldState) {
    const newQuestData = { ...event.payload, '状态': '进行中' };
    const parsed = QuestSchema.safeParse(newQuestData);

    if (!parsed.success) {
      logger('error', 'QuestStore', '[handleNewQuest] Invalid quest data received.', newQuestData, parsed.error.flatten());
      toastr.error('收到了格式不正确的“新任务接收”事件。');
      return;
    }

    const questList = worldState.任务列表 as Quest[];
    if (questList.some(q => q.id === parsed.data.id)) {
      logger('warn', 'QuestStore', `[handleNewQuest] Quest with id "${parsed.data.id}" already exists.`);
      return;
    }
    questList.push(parsed.data);
  }

  function handleQuestProgress(event: GameEvent, worldState: WorldState) {
    const { id, 进度, 描述 } = event.payload;
    const questList = worldState.任务列表 as Quest[];
    const quest = questList.find(q => q.id === id || q.名称 === id);

    if (!quest) {
      logger('warn', 'QuestStore', `[handleQuestProgress] Quest with id or name "${id}" not found.`);
      return;
    }
    if (进度) quest.进度 = 进度;
    if (描述) quest.描述 = 描述;
  }

  function handleQuestComplete(event: GameEvent, worldState: WorldState) {
    const { id } = event.payload;
    const questList = worldState.任务列表 as Quest[];
    const quest = questList.find(q => q.id === id || q.名称 === id);

    if (!quest) {
      logger('warn', 'QuestStore', `[handleQuestComplete] Quest with id or name "${id}" not found.`);
      return;
    }
    quest.状态 = '已完成';
  }

  function handleQuestFail(event: GameEvent, worldState: WorldState) {
    const { id } = event.payload;
    const questList = worldState.任务列表 as Quest[];
    const quest = questList.find(q => q.id === id || q.名称 === id);

    if (!quest) {
      logger('warn', 'QuestStore', `[handleQuestFail] Quest with id or name "${id}" not found.`);
      return;
    }
    quest.状态 = '失败';
  }
  // #endregion

  // #region Initialization
  function initialize() {
    logger('log', 'questStore', 'Registering event handlers...');
    const ensureQuestListExists = (worldState: WorldState) => {
        if (!worldState.任务列表) {
            worldState.任务列表 = [];
        }
    };

    const newQuestHandler = (event: GameEvent, worldState: WorldState) => {
        ensureQuestListExists(worldState);
        handleNewQuest(event, worldState);
    };
    worldStore.registerEventHandler('新任务接收', newQuestHandler);
    worldStore.registerEventHandler('任务接收', newQuestHandler); // 兼容LLM可能产生的错误格式
    worldStore.registerEventHandler('任务进度更新', (event, worldState) => {
        ensureQuestListExists(worldState);
        handleQuestProgress(event, worldState);
    });
    worldStore.registerEventHandler('任务完成', (event, worldState) => {
        ensureQuestListExists(worldState);
        handleQuestComplete(event, worldState);
    });
    worldStore.registerEventHandler('任务失败', (event, worldState) => {
        ensureQuestListExists(worldState);
        handleQuestFail(event, worldState);
    });
  }
  // #endregion

  return {
    quests,
    ongoingQuests,
    completedQuests,
    notCompletedQuests,
    failedQuests,
    initialize,
  };
});

export const useQuestStore = createQuestStore();
export type QuestStore = ReturnType<typeof useQuestStore>;
