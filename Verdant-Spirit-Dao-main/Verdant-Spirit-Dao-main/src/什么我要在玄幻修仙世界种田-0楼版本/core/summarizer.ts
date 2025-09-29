// core/summarizer.ts
import { useApiProfileStore } from '../stores/app/apiProfileStore';
import { useSettingsStore } from '../stores/ui/settingsStore';
import { ChatHistoryManager, MessagePage } from './history';
import { logger } from './logger';
import { generateWithSecondaryApi } from './secondaryLlmApi';
import { getIsRecalculatingState } from './state';
import { assignVariables } from './variables';

// Declare global functions
// declare const generateRaw: (prompt: string, options?: any) => Promise<string>; // Replaced by generateWithSecondaryApi
declare const getVariables: (options: any) => any;
declare const getFloorId: () => any;
declare const _: any;
declare const eventOn: any;
declare const iframe_events: any;
declare const toastr: any;

const SETTINGS_KEY = 'plugin_settings.context_management';

/**
 * Manages the automatic summarization of chat history in the background.
 */
export class Summarizer {
  private historyManager: ChatHistoryManager;
  private isSummarizing: boolean = false;

  constructor(historyManager: ChatHistoryManager) {
    this.historyManager = historyManager;
  }

  /**
   * Checks if a summary is needed and triggers it if conditions are met.
   * This should be called after a new message is added.
   */
  public async triggerSummaryIfNeeded(): Promise<void> {
    if (this.isSummarizing || getIsRecalculatingState()) {
      logger('log', 'Summarizer', 'Skipping trigger: already summarizing or recalculating state.');
      return;
    }

    const messages = this.historyManager.getMessagesForPrompt();
    const chatVars = getVariables({ type: 'chat' }) || {};
    const settings = _.get(chatVars, SETTINGS_KEY, { summaryTrigger: 30 });
    const summaryTrigger = settings.summaryTrigger;

    // 根据最新一次持久化的摘要，计算自那以后新增的消息数量
    const previousSummarizedIds: string[] = _.get(chatVars, 'plugin_storage.summary.latest.summarizedMessageIds', []);
    const prevSet = new Set(previousSummarizedIds);
    const messagesSinceLastSummary = messages.filter((m: MessagePage) => !prevSet.has(m.id)).length;

    if (messagesSinceLastSummary >= summaryTrigger) {
      console.log(`[Summarizer] ${messagesSinceLastSummary} messages since last summary, exceeding trigger count of ${summaryTrigger}.`);
      this.executeSummary();
    }
  }

  /**
   * Executes the summarization process.
   */
  private async executeSummary(): Promise<void> {
    this.isSummarizing = true;
    console.log('[Summarizer] Starting iterative refinement summary...');

    try {
      // Find previous summary (persisted in plugin_storage), if any.
      const allMessages = this.historyManager.getMessagesForPrompt();
      const chatVars = getVariables({ type: 'chat' }) || {};
      const previousSummaryText = _.get(chatVars, 'plugin_storage.summary.latest.text', null);
      const previousSummarizedIds: string[] = _.get(chatVars, 'plugin_storage.summary.latest.summarizedMessageIds', []);

      let messagesToSummarize: MessagePage[] = [];
      let previousSummary: MessagePage | null = null;

      if (previousSummaryText) {
        previousSummary = {
          id: 'summary_prev',
          role: 'summary',
          content: previousSummaryText,
          timestamp: Date.now(),
        } as MessagePage;

        const prevSet = new Set(previousSummarizedIds);
        messagesToSummarize = allMessages.filter((m: MessagePage) => !prevSet.has(m.id));
      } else {
        // If no previous summary, summarize the entire history up to the trigger point.
        messagesToSummarize = allMessages;
      }

      if (messagesToSummarize.length === 0) {
        console.log('[Summarizer] No new messages to add to the summary.');
        return;
      }

      // 1. Get character names for the prompt.
      const floor_id = getFloorId();
      const variables = getVariables({ type: 'message', message_id: floor_id }) || {};
      const mainCharacterName = variables['角色']?.['主控角色名'] || '玩家';
      let aiCharacterName = 'AI';
      if (variables['角色']) {
        const characterNames = Object.keys(variables['角色']);
        const otherCharacter = characterNames.find(name => name !== '主控角色名' && name !== mainCharacterName);
        if (otherCharacter) {
          aiCharacterName = otherCharacter;
        }
      }

      // 2. Build the detailed prompt for the LLM.
      const newHistoryText = messagesToSummarize.map((msg: MessagePage) => {
        const roleName = msg.role === 'user' ? mainCharacterName : aiCharacterName;
        const contentToProcess = msg.content.replace(/<statusbar>[\s\S]*?<\/statusbar>/g, '').trim();
        return `${roleName}: ${contentToProcess}`;
      }).join('\n');

      const settingsStore = useSettingsStore();
      const apiProfileStore = useApiProfileStore();

      let userPrompt = settingsStore.settings.summaryPrompt;

      if (!userPrompt) {
        // Fallback to a default prompt if user prompt is not set or empty
        userPrompt = `你是“玄幻修仙世界种田”项目的专业剧情策划与摘要编辑。你的任务是对对话历史进行增量式迭代摘要，保证连贯性与信息完整。

        <过往的剧情摘要>
        {{PREVIOUS_SUMMARY}}
        </过往的剧情摘要>

        <最新的对话内容>
        {{NEW_HISTORY}}
        </最新的对话内容>

        目标：
        1. 基于最新内容更新全局剧情摘要，保持与过往摘要的一致性与延续性。
        2. 仅在必要处重述过往信息，以维护上下文连贯；优先整合新增事实与变化。
        3. 若过往摘要为“无”，则生成一份覆盖当前历史的完整摘要。

        严格约束：
        - 忠实、无臆造；以时间顺序组织，避免跳跃。
        - 角色称谓与口吻统一；避免与游戏系统术语冲突。
        - 明确任务状态、资源道具、能力/境界、关系网络、地点与世界观新信息。
        - 处理冲突时，以“最新的对话内容”为准，解释变化原因。
        - 不输出任何提示工程或元信息；只给出结果。

        输出格式（严格遵循）：
        - 标题：一句话总览
        - 摘要：150–300字，第三人称，简体中文
        - 时间线要点：3–6条（按时间排序）
        - 角色与关系：主要角色与关系变化（要点式）
        - 任务与目标：进行中/已完成/失败
        - 资源与道具：关键物品/资源的拥有与状态
        - 能力与境界：修为/技能/装备重要变动
        - 世界观与设定：新引入或修订的设定
        - 伏笔与悬念：2–4条，避免剧透
        - 风格与叙事基调：一句话描述
        - 变更日志（相对上次）：整合了哪些新增信息（要点式）

        生成准则：
        - 若存在过往摘要：进行“迭代优化”，在不破坏既有叙事的前提下合并新增信息，并精炼表述。
        - 若不存在过往摘要：按输出格式完整生成。
        - 总字数控制在适中（不超过3000字），避免冗长。

        现在开始生成符合上述格式的全新完整摘要。`;
      }
      
      const prompt = userPrompt
        .replace('{{PREVIOUS_SUMMARY}}', previousSummary ? previousSummary.content : '无')
        .replace('{{NEW_HISTORY}}', newHistoryText);

      logger('info', 'Summarizer', 'Sending refinement request with user-defined prompt...');
      
      // 3. Call generateWithSecondaryApi and wait for the response.
      const generationId = `summarizer-${crypto.randomUUID()}`;
      let summaryContent = '';

      try {
        // Fallback logic: use summary-specific profile, or fall back to the global active profile.
        const profileIdToUse = settingsStore.settings.summaryApiProfileId || apiProfileStore.activeProfileId;

        if (!profileIdToUse) {
          throw new Error('No API profile selected for summarization in settings, and no active global profile found.');
        }

        const apiCall = generateWithSecondaryApi({
          method: 'generateRaw',
          profileId: profileIdToUse,
          generationId: generationId,
          config: {
            ordered_prompts: [{ role: 'system', content: prompt }],
          },
        });

        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error(`Summarizer LLM generation timed out for ID: ${generationId}`)), 120000) // 120秒超时
        );

        summaryContent = await Promise.race([apiCall, timeoutPromise]);

      } catch (error) {
        logger('error', 'Summarizer', 'Failed to get summary from LLM.', error);
        toastr.error('后台摘要生成失败，请检查次级LLM配置或网络。');
        this.isSummarizing = false;
        return;
      }

      if (!summaryContent || summaryContent.trim().length === 0) {
        logger('warn', 'Summarizer', 'Received empty summary from LLM.');
        return;
      }
      
      // 4. Persist summary into plugin_storage to avoid interfering with core lifecycle.
      const summarizedMessageIds = [
        ...(_.isArray(previousSummarizedIds) ? previousSummarizedIds : []),
        ...messagesToSummarize.map(m => m.id),
      ];

      const summaryEntry = {
        id: `summary_${Date.now()}`,
        text: summaryContent.trim(),
        summarizedMessageIds,
        timestamp: Date.now(),
      };

      try {
        const currentVars = getVariables({ type: 'chat' }) || {};
        const newVars = _.cloneDeep(currentVars);
        const historyPath = 'plugin_storage.summary.history';
        const latestPath = 'plugin_storage.summary.latest';

        const existingHistory = _.get(newVars, historyPath, []);
        existingHistory.push(summaryEntry);
        _.set(newVars, historyPath, existingHistory);
        _.set(newVars, latestPath, summaryEntry);

        await assignVariables(newVars, { type: 'chat' });
        logger('info', 'Summarizer', 'Refinement process completed. Summary persisted to plugin_storage.');
      } catch (persistError) {
        logger('error', 'Summarizer', 'Failed to persist summary to plugin_storage.', persistError);
      }

    } catch (error) {
      logger('error', 'Summarizer', 'Error during summarization:', error);
    } finally {
      this.isSummarizing = false;
    }
  }
}
