import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { z } from 'zod';
import { ChatHistoryManager, MessagePage } from '../../core/history';
import { getVariables, safeInsertOrAssignVariables } from '../../core/variables';
import { SecondaryApiProfileSchema, useApiProfileStore } from '../app/apiProfileStore';
import _ from 'lodash';
import { logger } from '../../core/logger';

const DEFAULT_SUMMARY_PROMPT = `你是“玄幻修仙世界种田”项目的专业剧情策划与摘要编辑。你的任务是对对话历史进行增量式迭代摘要，保证连贯性与信息完整。

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
- 任务与目标：进行中/已完成/失败；给出下一步建议1–2条
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

// Zod Schema for settings validation
const SettingsSchema = z.object({
  contextLimit: z.number().min(10).max(100).default(20),
  summaryTrigger: z.number().min(20).max(200).default(30),
  summaryPrompt: z.string().default(DEFAULT_SUMMARY_PROMPT),
  shouldStream: z.boolean().default(true),
  summaryApiProfileId: z.string().nullable().default(null), // For summary-specific LLM profile
  autoCompletePokedex: z.boolean().default(true), // For the new auto-completion feature
  pokedexCompletionProfileId: z.string().nullable().default(null), // For pokedex completion-specific LLM profile
  // API profiles are now managed by ApiProfileStore
});

// We also need a schema for the full stored object, including profiles
const StoredSettingsSchema = SettingsSchema.extend({
  secondaryApiProfiles: z.array(SecondaryApiProfileSchema).default([SecondaryApiProfileSchema.parse({})]),
  activeSecondaryApiProfileId: z.string().optional(),
});

type Settings = z.infer<typeof SettingsSchema>;
type StoredSettings = z.infer<typeof StoredSettingsSchema>;

const SETTINGS_KEY = 'plugin_storage.settings';

export const useSettingsStore = defineStore('settings', () => {
  // --- State ---
  const settings = ref<Settings>(SettingsSchema.parse({}));
  const latestSummary = ref<string>('暂无摘要。');
  const isModalVisible = ref(false);
  const initialTab = ref('params'); // The tab to show when the modal opens
  const modelLists = ref<Record<string, string[]>>({}); // Cache for model lists, keyed by profile ID
  const isFetchingModels = ref(false);

  // --- Actions ---

  function openModal(tab: string = 'params') {
    initialTab.value = tab;
    isModalVisible.value = true;
  }

  function closeModal() {
    isModalVisible.value = false;
  }

  /**
   * Fetches settings from chat variables and validates them.
   */
  async function fetchSettings() {
    const apiProfileStore = useApiProfileStore();
    let charVars;
    try {
      charVars = await getVariables({ type: 'character' }) || {};
    } catch (error: any) {
      if (error.name === 'DataCloneError') {
        logger('warn', 'settingsStore', 'Failed to get variables due to a DataCloneError. This might happen during branch switching. Using default settings.', error);
        charVars = {}; // Proceed with empty vars
      } else {
        throw error;
      }
    }
    const storedSettings = _.get(charVars, SETTINGS_KEY, {});
    
    const parsed = StoredSettingsSchema.safeParse(storedSettings);
    if (parsed.success) {
      const { secondaryApiProfiles, activeSecondaryApiProfileId, ...mainSettings } = parsed.data;
      settings.value = mainSettings;
      // 只有在成功加载到数据时才更新 profiles
      apiProfileStore.setProfiles(secondaryApiProfiles, activeSecondaryApiProfileId);
    } else {
      console.warn('Settings validation failed, using default settings.', parsed.error);
      // 如果加载失败，只重置主设置，不触碰 apiProfileStore
      // 这样可以保留用户在当前会话中可能已经创建的配置
      settings.value = SettingsSchema.parse({});
    }
  }

  /**
   * Saves the current settings to character variables.
   */
  async function saveSettings() {
    const apiProfileStore = useApiProfileStore();
    try {
      const fullSettings: StoredSettings = {
        ...settings.value,
        secondaryApiProfiles: apiProfileStore.profiles,
        activeSecondaryApiProfileId: apiProfileStore.activeProfileId,
      };
      
      const settingsToSave = {};
      _.set(settingsToSave, SETTINGS_KEY, fullSettings);
      
      await safeInsertOrAssignVariables(settingsToSave, { type: 'character' });

      toastr.success('设置已保存。');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toastr.error('设置保存失败。');
    }
  }

  // --- Profile Management Actions ---
  function addProfile() {
    const apiProfileStore = useApiProfileStore();
    const newProfile = SecondaryApiProfileSchema.parse({ name: `配置 ${apiProfileStore.profiles.length + 1}` });
    const updatedProfiles = [...apiProfileStore.profiles, newProfile];
    apiProfileStore.setProfiles(updatedProfiles, newProfile.id);
  }

  function removeProfile(profileId: string) {
    const apiProfileStore = useApiProfileStore();
    if (apiProfileStore.profiles.length <= 1) {
      toastr.warning('不能删除最后一个配置。');
      return;
    }
    const updatedProfiles = apiProfileStore.profiles.filter(p => p.id !== profileId);
    apiProfileStore.setProfiles(updatedProfiles);
  }

  async function fetchModelsForProfile(profileId: string) {
    const apiProfileStore = useApiProfileStore();
    const profile = apiProfileStore.profiles.find(p => p.id === profileId);
    if (!profile || !profile.apiKey) {
      toastr.error('请先填写当前配置的API密钥。');
      return;
    }

    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/models',
      claude: 'https://api.anthropic.com/v1/models',
      makersuite: 'https://generativelanguage.googleapis.com/v1beta/models',
      deepseek: 'https://api.deepseek.com/v1/models',
    };

    const modelListUrl = endpoints[profile.source];
    if (!modelListUrl) {
      toastr.info('当前API源不支持自动获取模型列表。');
      return;
    }

    isFetchingModels.value = true;
    try {
      let requestUrl = modelListUrl;
      const requestOptions: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };

      // Google Gemini API uses a different auth method
      if (profile.source === 'makersuite') {
        requestUrl = `${modelListUrl}?key=${profile.apiKey}`;
      } else {
        (requestOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${profile.apiKey}`;
      }

      const response = await fetch(requestUrl, requestOptions);

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.statusText}`);
      }

      const data = await response.json();
      let models = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
      
      // Post-process model names for specific providers
      if (profile.source === 'makersuite') {
        models = models.map((m: string) => m.replace(/^models\//, ''));
      }

      modelLists.value[profileId] = models;
      toastr.success(`成功获取 ${models.length} 个模型。`);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      toastr.error('获取模型列表失败，请检查API密钥和网络连接。');
    } finally {
      isFetchingModels.value = false;
    }
  }

  /**
   * Fetches the latest summary from the chat history.
   * @param historyManager An instance of ChatHistoryManager.
   */
  async function fetchLatestSummary(historyManager: ChatHistoryManager) {
    await historyManager.loadHistory();
    const messages = historyManager.getMessagesForPrompt();
    const lastSummary = messages.findLast((m: MessagePage) => m.role === 'summary');
    latestSummary.value = lastSummary ? (lastSummary.content as string) : '暂无摘要。';
  }

  /**
   * Restores the summary prompt to its default value.
   */
  function restoreDefaultPrompt() {
    settings.value.summaryPrompt = DEFAULT_SUMMARY_PROMPT;
    toastr.info('提示词已恢复为默认设置。');
  }

  // --- Watchers ---
  // Automatically save settings when they change, with a debounce.
  watch(settings, _.debounce(saveSettings, 500), { deep: true });
  // Also watch the apiProfileStore for changes
  watch(useApiProfileStore(), _.debounce(saveSettings, 500), { deep: true });

  return {
    settings,
    latestSummary,
    isModalVisible,
    modelLists,
    isFetchingModels,
    initialTab,
    openModal,
    closeModal,
    fetchSettings,
    fetchLatestSummary,
    restoreDefaultPrompt,
    addProfile,
    removeProfile,
    fetchModelsForProfile,
    DEFAULT_SUMMARY_PROMPT,
  };
});
