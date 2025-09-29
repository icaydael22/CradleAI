/**
 * @file contextLinker.ts
 * @description 智能上下文系统的后台语义学习模块。
 * 负责异步分析玩家输入和图鉴条目，动态学习并扩展与玩家意图相关的关键词。
 */

// @ts-ignore
declare const getVariables: (options?: any) => any;
// @ts-ignore
declare const _: any; // lodash
// @ts-ignore
declare const chatHistoryManager: any; // 全局历史管理器实例
// @ts-ignore
declare const eventOn: any;
// @ts-ignore
declare const iframe_events: any;
// @ts-ignore
declare const toastr: any;

import { z } from 'zod';
import { logger } from '../../core/logger';
import { generateAndParseJson } from '../../core/generation';
import { useSmartContextStore } from '../../stores/modules/smartContextStore';
import { getIsRecalculatingState } from '../../core/state';
import promptTemplate from './prompt.md?raw';

// #region 类型定义
/**
 * 候选图鉴条目的接口定义
 */
interface CandidateEntry {
  id: string;          // 图鉴条目的完整变量路径, e.g., "世界.图鉴.物品.潮汐木芯"
  name: string;
  description: string;
  tags?: string[];     // 预定义的标签
  dynamicKeywords: string[];
  // 用于排序的元数据
  lastAnalyzedTurn: number;
  missCount: number;
}

/**
 * 从LLM返回的更新指令
 */
interface KeywordUpdate {
  id: string;
  newKeywords: string[];
}

const KeywordUpdateResponseSchema = z.array(z.object({
  id: z.string(),
  newKeywords: z.array(z.string()),
}));

// 简化的历史记录类型，用于在模块内部进行类型检查
interface SimpleTurn {
  role: 'user' | 'assistant';
  pages: { [pageIndex: number]: { content: string } };
}
// #endregion

/**
 * 智能筛选和优先级排序的核心逻辑
 * @param userInput 玩家的最新输入
 * @param currentTurn 当前的回合数
 * @returns 经过筛选和排序后的、最适合进行语义分析的图鑑条目列表
 */
function selectCandidateEntries(userInput: string, currentTurn: number): CandidateEntry[] {
  const BUDGET_LIMIT = 5; // 每次最多分析5个条目
  const COOLDOWN_TURNS = 20; // 20回合内分析过的条目降低优先级

  const allVars = getVariables({ type: 'chat' });
  const allPokedex = _.get(allVars, '世界.图鉴', {});
  const linkerProfile = _.get(allVars, 'plugin_storage.context_linker_profile', {});
  // const currentLocation = _.get(allVars, '世界.地点', ''); // 暂不使用地点

  // 1. 展平图鑑，并融合linkerProfile中的数据
  const flatPokedex: CandidateEntry[] = [];
  for (const category in allPokedex) {
    if (Array.isArray(allPokedex[category])) {
      for (const item of allPokedex[category]) {
        const itemId = `世界.图鉴.${category}.${item.名称}`;
        const profile = linkerProfile[itemId] || {};
        flatPokedex.push({
          id: itemId,
          name: item.名称,
          description: item.描述,
          tags: item.tags || [],
          dynamicKeywords: profile.dynamicKeywords || [],
          lastAnalyzedTurn: profile.lastAnalyzedTurn || 0,
          missCount: profile.missCount || 0,
        });
      }
    }
  }

  // 2. 上下文粗筛 (Coarse Filtering)
  const filteredEntries = flatPokedex.filter(entry => {
    // 简单的关键词匹配：如果用户输入包含了条目名称，则直接入选
    return userInput.includes(entry.name);
    // 未来可以增加更复杂的匹配逻辑，例如匹配描述或标签
  });

  // 如果粗筛结果不为空，直接使用粗筛结果
  const preSelectedEntries = filteredEntries.length > 0 ? filteredEntries : flatPokedex;

  // 3. 动态优先级排序 (Dynamic Priority Sorting)
  const sortedEntries = _.orderBy(preSelectedEntries, [
    (entry: CandidateEntry) => {
      let score = 0;
      // a. 关键词数量越少，优先级越高
      score += (10 - Math.min(entry.dynamicKeywords.length, 10)) * 10;
      // b. 冷却时间：近期分析过的降分
      const turnsSinceAnalyzed = currentTurn - entry.lastAnalyzedTurn;
      if (turnsSinceAnalyzed < COOLDOWN_TURNS) {
        score -= (COOLDOWN_TURNS - turnsSinceAnalyzed) * 5; // 越近扣分越多
      }
      // c. 负反馈：多次未命中（miss）的降分
      score -= entry.missCount * 10;
      return score;
    }
  ], ['desc']);

  // 4. 预算限流 (Budget Limiting)
  return sortedEntries.slice(0, BUDGET_LIMIT);
}

/**
 * 调用LLM进行语义分析并获取新的关键词
 * @param userInput 玩家的最新输入
 * @param entries 经过筛选的候选图鉴条目
 * @returns 一个包含新关键词的更新指令数组
 */
async function fetchNewKeywordsFromLLM(userInput: string, entries: CandidateEntry[]): Promise<KeywordUpdate[]> {
  const smartContextStore = useSmartContextStore();
  if (entries.length === 0) return [];
  if (!smartContextStore.apiProfileIdToUse) {
    logger('warn', 'ContextLinker', 'No secondary LLM profile available (neither specific nor global active). Skipping keyword generation.');
    return [];
  }

  const llmInput = {
    userInput,
    pokedexEntries: entries.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      dynamicKeywords: e.dynamicKeywords,
    })),
  };

  try {
    const updates = await generateAndParseJson(
      {
        method: 'generateRaw',
        profileId: smartContextStore.apiProfileIdToUse,
        generationId: `context-linker-${crypto.randomUUID()}`,
        config: {
          user_input: JSON.stringify(llmInput, null, 2),
          ordered_prompts: [
            { role: 'system', content: promptTemplate },
            'user_input',
          ],
          // @ts-ignore - Undocumented property to encourage JSON output
          response_format: { type: 'json_object' },
        },
      },
      KeywordUpdateResponseSchema,
    );
    return updates;
  } catch (error) {
    logger('error', 'ContextLinker', 'Failed to generate and parse keywords from LLM.', error);
    toastr.error('后台学习关键词失败，请检查次级LLM配置或网络。');
    return [];
  }
}

/**
 * 将学习到的新关键词更新到聊天变量中
 * @param updates 从LLM返回的更新指令
 * @param analyzedEntries 被送到LLM进行分析的条目列表
 * @param currentTurn 当前的回合数
 */
async function saveNewKeywords(updates: KeywordUpdate[], analyzedEntries: CandidateEntry[], currentTurn: number): Promise<void> {
  if (analyzedEntries.length === 0) {
    return;
  }

  const lastMessage = chatHistoryManager.getLastUserTurn()?.pages[0];
  if (!lastMessage) {
    logger('error', 'ContextLinker', 'Could not find the last user message to attach plugin event.');
    return;
  }

  // The new event contains all information needed to replay the state change.
  await chatHistoryManager.addPluginEvent(lastMessage.id, {
    type: 'ContextLinkerRan',
    updates: updates,
    analyzedIds: analyzedEntries.map(e => e.id),
    turn: currentTurn,
  });
}


/**
 * 按需分析单个知识条目
 * @param entryId 要分析的图鉴条目的完整ID
 */
export async function analyzeSingleEntry(entryId: string): Promise<void> {
  if (!chatHistoryManager) {
    logger('warn', 'ContextLinker', 'ChatHistoryManager not available, skipping single entry analysis.');
    return;
  }

  const lastUserMessage = chatHistoryManager.getLastUserMessage();
  const userInput = lastUserMessage?.content || ''; // 如果没有用户输入，则使用空字符串
  const currentTurn = chatHistoryManager.getMessagesForPrompt().length;

  // 1. 查找并构建候选条目
  const allVars = getVariables({ type: 'chat' });
  const parts = entryId.split('.');
  if (parts.length < 4) {
    logger('error', 'ContextLinker', `Invalid entry ID format: ${entryId}`);
    return;
  }
  const category = parts[2];
  const name = parts.slice(3).join('.');
  
  const categoryItems = _.get(allVars, `世界.图鉴.${category}`, []);
  const item = categoryItems.find((i: any) => i.名称 === name);

  if (!item) {
    logger('error', 'ContextLinker', `Entry not found for ID: ${entryId}`);
    toastr.error(`无法找到条目: ${name}`);
    return;
  }

  const linkerProfile = _.get(allVars, 'plugin_storage.context_linker_profile', {});
  const profile = linkerProfile[entryId] || {};
  
  const candidate: CandidateEntry = {
    id: entryId,
    name: item.名称,
    description: item.描述,
    tags: item.tags || [],
    dynamicKeywords: profile.dynamicKeywords || [],
    lastAnalyzedTurn: profile.lastAnalyzedTurn || 0,
    missCount: profile.missCount || 0,
  };

  logger('info', 'ContextLinker', `Force analyzing single entry: "${candidate.name}"`);
  toastr.info(`正在为 "${candidate.name}" 请求新的关键词...`);

  // 2. 调用LLM进行分析
  const updates = await fetchNewKeywordsFromLLM(userInput, [candidate]);
  if (updates.length > 0 && updates[0].newKeywords.length > 0) {
    toastr.success(`为 "${candidate.name}" 成功学习到新关键词: ${updates[0].newKeywords.join(', ')}`);
  } else {
    toastr.warning(`本次未能为 "${candidate.name}" 学习到新的关键词。`);
  }

  // 3. 保存学习结果
  await saveNewKeywords(updates, [candidate], currentTurn);
  logger('info', 'ContextLinker', `Single entry analysis finished for "${candidate.name}".`);
}

/**
 * 按需分析所有知识条目
 */
export async function analyzeAllEntries(): Promise<void> {
  logger('info', 'ContextLinker', 'Starting analysis for ALL entries.');
  toastr.info('开始为所有知识条目更新关键词，这可能需要一些时间...');

  const allVars = getVariables({ type: 'chat' });
  const allPokedex = _.get(allVars, '世界.图鉴', {});
  const linkerProfile = _.get(allVars, 'plugin_storage.context_linker_profile', {});

  const allEntryIds: string[] = [];
  for (const category in allPokedex) {
    if (Array.isArray(allPokedex[category])) {
      for (const item of allPokedex[category]) {
        allEntryIds.push(`世界.图鉴.${category}.${item.名称}`);
      }
    }
  }

  if (allEntryIds.length === 0) {
    toastr.warning('没有找到任何可分析的知识条目。');
    return;
  }

  for (let i = 0; i < allEntryIds.length; i++) {
    const entryId = allEntryIds[i];
    // UI is updated inside analyzeSingleEntry
    await analyzeSingleEntry(entryId);
    // Add a small delay to avoid overwhelming the API or the UI
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  toastr.success('所有知识条目都已更新完毕！');
  logger('info', 'ContextLinker', 'Finished analysis for ALL entries.');
}
/**
 * 仅分析“未学习”的知识条目（无动态关键词的条目）
 * 用于在启用智能上下文时执行一次冷启动学习，快速构建初始语义数据库。
 */
export async function analyzeUnlearnedEntries(): Promise<void> {
  logger('info', 'ContextLinker', 'Starting analysis for UNLEARNED entries.');
  toastr.info('正在为“尚未学习”的知识条目生成初始关键词...');

  const allVars = getVariables({ type: 'chat' });
  const allPokedex = _.get(allVars, '世界.图鉴', {});
  const linkerProfile = _.get(allVars, 'plugin_storage.context_linker_profile', {});

  const targetIds: string[] = [];
  for (const category in allPokedex) {
    if (Array.isArray(allPokedex[category])) {
      for (const item of allPokedex[category]) {
        const id = `世界.图鉴.${category}.${item.名称}`;
        const profile = linkerProfile[id];
        const hasKeywords =
          profile && Array.isArray(profile.dynamicKeywords) && profile.dynamicKeywords.length > 0;
        if (!hasKeywords) {
          targetIds.push(id);
        }
      }
    }
  }

  if (targetIds.length === 0) {
    toastr.success('所有条目都已具备动态关键词，无需初始学习。');
    logger('info', 'ContextLinker', 'No unlearned entries found.');
    return;
  }

  for (let i = 0; i < targetIds.length; i++) {
    const entryId = targetIds[i];
    await analyzeSingleEntry(entryId);
    // 小延迟，避免压测API/UI
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  toastr.success('未学习条目的初始化关键词生成已完成！');
  logger('info', 'ContextLinker', 'Finished analysis for UNLEARNED entries.');
}



/**
 * 每个回合的核心处理函数
 * 在 GENERATION_ENDED 事件后被调用
 */
export async function processTurn(): Promise<void> {
  if (getIsRecalculatingState()) {
    // If recalculating state, absolutely forbid any async learning tasks
    return;
  }
  const smartContextStore = useSmartContextStore();
  if (!smartContextStore.isEnabled) {
    // Silently exit if the feature is disabled
    return;
  }

  if (!chatHistoryManager) {
    logger('warn', 'ContextLinker', 'ChatHistoryManager not available, skipping processing.');
    return;
  }

  const lastUserMessage = chatHistoryManager.getLastUserMessage();

  if (!lastUserMessage || !lastUserMessage.content) {
    logger('log', 'ContextLinker', 'No user input found in recent history, skipping.');
    return;
  }
  
  const userInput = lastUserMessage.content;
  const currentTurn = chatHistoryManager.getMessagesForPrompt().length;
  logger('log', 'ContextLinker', `Processing turn ${currentTurn} with user input: "${userInput}"`);

  // 1. 智能筛选候选条目
  const candidates = selectCandidateEntries(userInput, currentTurn);
  if (candidates.length === 0) {
    logger('log', 'ContextLinker', 'No candidate entries selected for analysis.');
    return;
  }
  logger('info', 'ContextLinker', `Selected ${candidates.length} candidates for analysis:`, candidates.map(c => c.name));

  // 2. 调用LLM进行分析
  const updates = await fetchNewKeywordsFromLLM(userInput, candidates);
  logger('info', 'ContextLinker', `LLM analysis returned ${updates.length} updates.`);

  // 3. 保存学习结果
  await saveNewKeywords(updates, candidates, currentTurn);

  logger('info', 'ContextLinker', `Semantic analysis finished for turn ${currentTurn}.`);
}
