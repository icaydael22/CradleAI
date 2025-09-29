<template>
  <div id="settings-modal" class="modal-overlay" :class="{ 'hidden': !showModal }">
    <div class="modal-content">
      <button @click="closeModal" class="modal-close-btn">&times;</button>
      <h3 class="modal-title">上下文管理</h3>
      <div class="modal-body">
        <!-- 标签页导航 -->
        <div class="flex border-b border-dim mb-4">
          <button @click="activeTab = 'params'" :class="{ 'active': activeTab === 'params' }"
            class="main-tab-btn">参数设置</button>
          <button @click="activeTab = 'summary'" :class="{ 'active': activeTab === 'summary' }"
            class="main-tab-btn">摘要管理</button>
          <button @click="activeTab = 'smartContext'" :class="{ 'active': activeTab === 'smartContext' }"
            class="main-tab-btn">智能上下文</button>
          <button @click="activeTab = 'secondaryLlm'" :class="{ 'active': activeTab === 'secondaryLlm' }"
            class="main-tab-btn">次级LLM</button>
        </div>

        <!-- 参数设置标签页 -->
        <div v-show="activeTab === 'params'" id="settings-params-tab" class="main-tab-content">
          <div class="space-y-4">
            <div>
              <label for="context-limit-input" class="block mb-2 text-sm font-medium">上下文消息数</label>
              <input type="range" id="context-limit-slider" min="10" max="100"
                v-model.number="store.settings.contextLimit"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700">
              <div class="text-right text-sm text-secondary mt-1">
                当前值: <span id="context-limit-value">{{ store.settings.contextLimit }}</span> 条
              </div>
              <p class="text-xs text-secondary mt-1">设置每次请求时，携带的最近历史消息数量。</p>
            </div>
            <div>
              <label for="summary-trigger-input" class="block mb-2 text-sm font-medium">自动总结触发数</label>
              <input type="range" id="summary-trigger-slider" min="20" :max="store.settings.contextLimit"
                v-model.number="store.settings.summaryTrigger"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700">
              <div class="text-right text-sm text-secondary mt-1">
                当前值: <span id="summary-trigger-value">{{ store.settings.summaryTrigger }}</span> 条
              </div>
              <p class="text-xs text-secondary mt-1">当总消息数达到此值时，会自动在后台进行一次“迭代式精炼”总结。此值不能大于上下文消息数。</p>
            </div>
            <div class="flex justify-between items-center">
              <div>
                <label for="streaming-response-toggle" class="text-sm font-medium">流式响应</label>
                <p class="text-xs text-secondary mt-1">启用后，AI的回复将逐字显示。</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                <input type="checkbox" id="streaming-response-toggle" v-model="store.settings.shouldStream"
                  class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                <label for="streaming-response-toggle"
                  class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <div>
                <label for="auto-complete-pokedex-toggle" class="text-sm font-medium">后台自动补全图鉴</label>
                <p class="text-xs text-secondary mt-1">启用后，当AI忘记生成图鉴时，会自动在后台尝试补全。</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                <input type="checkbox" id="auto-complete-pokedex-toggle" v-model="store.settings.autoCompletePokedex"
                  class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                <label for="auto-complete-pokedex-toggle"
                  class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
              </div>
            </div>
            <!-- Pokedex Completion LLM Profile Selector -->
            <div v-if="store.settings.autoCompletePokedex" class="pl-4">
              <label for="pokedex-llm-profile-select" class="block mb-2 text-sm font-medium">用于补全的LLM配置</label>
              <select id="pokedex-llm-profile-select" v-model="store.settings.pokedexCompletionProfileId"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                <option :value="null">-- 使用当前激活的次级LLM --</option>
                <option v-for="profile in apiProfileStore.profiles" :key="profile.id" :value="profile.id">
                  {{ profile.name }}
                </option>
              </select>
              <p class="text-xs text-secondary mt-1">选择一个次级LLM配置用于后台图鉴补全。留空则使用当前全局激活的配置。</p>
            </div>
          </div>
        </div>

        <!-- 摘要管理标签页 -->
        <div v-show="activeTab === 'summary'" id="settings-summary-tab" class="main-tab-content">
          <div class="space-y-4">
            <div>
              <label for="summary-llm-profile-select" class="block mb-2 text-sm font-medium">用于摘要的LLM配置</label>
              <select id="summary-llm-profile-select" v-model="store.settings.summaryApiProfileId"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                <option :value="null">-- 使用全局默认配置 --</option>
                <option v-for="profile in apiProfileStore.profiles" :key="profile.id" :value="profile.id">
                  {{ profile.name }}
                </option>
              </select>
              <p class="text-xs text-secondary mt-1">选择一个次级LLM配置用于生成摘要。留空则使用当前激活的全局配置。</p>
            </div>
            <div>
              <h4 class="font-bold text-md mb-2">最新摘要</h4>
              <div id="latest-summary-content"
                class="text-sm p-3 bg-secondary/30 rounded-lg max-h-40 overflow-y-auto border border-dim">
                <p class="text-secondary whitespace-pre-wrap">{{ store.latestSummary }}</p>
              </div>
            </div>
            <div>
              <div class="flex justify-between items-center mb-2">
                <h4 class="font-bold text-md">自定义总结提示词</h4>
                <button @click="store.restoreDefaultPrompt()"
                  class="text-xs text-accent hover:text-accent-hover transition-colors">恢复默认</button>
              </div>
              <textarea id="summary-prompt-input" v-model="store.settings.summaryPrompt"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono text-sm"
                rows="6"></textarea>
              <p class="text-xs text-secondary mt-1">
                可用占位符: <code v-pre>{{PREVIOUS_SUMMARY}}</code> (过往摘要), <code v-pre>{{NEW_HISTORY}}</code> (新对话)。
              </p>
            </div>
            <button @click="handleForceSummary" :disabled="isForcingSummary" class="btn-secondary w-full">
              <i class="fas fa-brain mr-2" :class="{ 'fa-spin': isForcingSummary }"></i>
              {{ isForcingSummary ? '正在生成...' : '立即在后台生成一次精炼摘要' }}
            </button>
          </div>
        </div>

        <!-- 次级LLM设置标签页 -->
        <div v-show="activeTab === 'secondaryLlm'" id="settings-secondary-llm-tab" class="main-tab-content">
          <!-- Profile Management -->
          <div class="flex items-center gap-2 mb-4 pb-4 border-b border-dim">
            <label for="profile-select" class="text-sm font-medium flex-shrink-0">配置档案:</label>
            <select id="profile-select" v-model="apiProfileStore.activeProfileId"
              class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
              <option v-for="profile in apiProfileStore.profiles" :key="profile.id" :value="profile.id">
                {{ profile.name }}
              </option>
            </select>
            <button @click="store.addProfile()" class="btn-secondary btn-sm flex-shrink-0">+</button>
            <button @click="handleRemoveProfile"
              class="btn-secondary btn-sm flex-shrink-0 text-red-500 hover:bg-red-500 hover:text-white">-</button>
          </div>

          <div v-if="activeProfile" :key="activeProfile.id" class="space-y-4">
            <div>
              <label for="profile-name-input" class="block mb-2 text-sm font-medium">档案名称</label>
              <input type="text" id="profile-name-input" v-model="activeProfile.name"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
            </div>
            <div>
              <label for="secondary-api-source" class="block mb-2 text-sm font-medium">API源</label>
              <select id="secondary-api-source" v-model="activeProfile.source"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                <option value="openai">OpenAI</option>
                <option value="claude">Claude</option>
                <option value="makersuite">Makersuite (Gemini)</option>
                <option value="deepseek">DeepSeek</option>
              </select>
              <p class="text-xs text-secondary mt-1">目前仅支持部分主流提供商。</p>
            </div>
            <div>
              <label for="secondary-api-url" class="block mb-2 text-sm font-medium">API端点</label>
              <input type="text" id="secondary-api-url" v-model="activeProfile.apiUrl"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono text-sm">
            </div>
            <div>
              <label for="secondary-api-key" class="block mb-2 text-sm font-medium">API密钥</label>
              <input type="password" id="secondary-api-key" v-model="activeProfile.apiKey"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono text-sm">
            </div>
            <div>
              <label for="secondary-api-model" class="block mb-2 text-sm font-medium">模型名称</label>
              <div class="flex items-center gap-2">
                <input type="text" id="secondary-api-model" v-model="activeProfile.model" list="model-list"
                  class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono text-sm">
                <datalist id="model-list">
                  <option v-for="model in currentModelList" :key="model" :value="model"></option>
                </datalist>
                <button @click="handleFetchModels" :disabled="store.isFetchingModels"
                  class="btn-secondary flex-shrink-0">
                  <i class="fas fa-sync-alt" :class="{ 'fa-spin': store.isFetchingModels }"></i>
                </button>
                <button @click="handleTestApi" :disabled="isTestingApi" class="btn-secondary flex-shrink-0">
                  <i class="fas fa-paper-plane" :class="{ 'fa-spin': isTestingApi }"></i>
                  {{ isTestingApi ? '' : '测试' }}
                </button>
              </div>
            </div>
            <div class="flex justify-between items-center pt-2">
              <div>
                <label for="secondary-api-summary-toggle" class="text-sm font-medium">携带摘要</label>
                <p class="text-xs text-secondary mt-1">启用后，将携带最新的摘要作为上下文。此选项优先于“完整上下文”。</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                <input type="checkbox" id="secondary-api-summary-toggle" v-model="activeProfile.useSummary"
                  class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                <label for="secondary-api-summary-toggle"
                  class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <div>
                <label for="secondary-api-context-toggle" class="text-sm font-medium">携带完整上下文</label>
                <p class="text-xs text-secondary mt-1">启用后，将携带完整的聊天记录作为上下文。如果“携带摘要”已启用，则此选项无效。</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                <input type="checkbox" id="secondary-api-context-toggle" v-model="activeProfile.useFullContext"
                  class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                <label for="secondary-api-context-toggle"
                  class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
              </div>
            </div>
            <!-- Fallback Mechanism -->
            <div class="flex justify-between items-center pt-2">
              <div>
                <label for="fallback-toggle" class="text-sm font-medium">启用主LLM保底</label>
                <p class="text-xs text-secondary mt-1">当次级LLM连续请求失败时，自动切换到主LLM。</p>
              </div>
              <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                <input type="checkbox" id="fallback-toggle" v-model="activeProfile.fallbackEnabled"
                  class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                <label for="fallback-toggle"
                  class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
              </div>
            </div>
            <div v-if="activeProfile.fallbackEnabled">
              <label for="fallback-threshold-input" class="block mb-2 text-sm font-medium">失败次数阈值</label>
              <input type="number" id="fallback-threshold-input" v-model.number="activeProfile.fallbackThreshold"
                min="1"
                class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
              <p class="text-xs text-secondary mt-1">连续失败这么多次后触发保底机制。</p>
            </div>
          </div>
        </div>

        <!-- 智能上下文管理标签页 -->
        <div v-show="activeTab === 'smartContext'" id="settings-smart-context-tab" class="main-tab-content">
          <div class="space-y-6">
            <!-- 主开关和LLM选择 -->
            <div class="p-4 border border-dim rounded-lg space-y-4">
              <div class="flex justify-between items-center">
                <div>
                  <label for="smart-context-toggle" class="text-sm font-medium">启用智能上下文系统</label>
                  <p class="text-xs text-secondary mt-1">关闭后将暂停后台学习和动态注入，但不会删除任何数据。</p>
                </div>
                <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                  <input type="checkbox" id="smart-context-toggle" :checked="smartContextStore.isEnabled"
                    @change="handleToggleChange"
                    class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                  <label for="smart-context-toggle"
                    class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                </div>
              </div>
              <div v-if="smartContextStore.isEnabled">
                <label for="llm-profile-select" class="block mb-2 text-sm font-medium">用于学习的LLM配置</label>
                <select id="llm-profile-select" :value="smartContextStore.selectedApiProfileId"
                  @change="handleProfileSelectChange"
                  class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                  <option :value="null">-- 请选择一个次级LLM配置 --</option>
                  <option v-for="profile in apiProfileStore.profiles" :key="profile.id" :value="profile.id">
                    {{ profile.name }}
                  </option>
                </select>
                <p class="text-xs text-secondary mt-1">后台将使用此配置来学习新的关键词。</p>
              </div>
            </div>

            <!-- 参数设置 -->
            <div class="p-4 border border-dim rounded-lg" v-if="smartContextStore.isEnabled">
              <h4 class="font-bold text-md mb-4">注入参数设置</h4>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block mb-2 text-sm font-medium">高频阈值</label>
                  <input type="number" v-model.number="smartContextStore.injectionParams.highFreqThreshold"
                    @change="updateInjectionParams"
                    class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                  <p class="text-xs text-secondary mt-1">引用次数超过此值则总是注入。</p>
                </div>
                <div>
                  <label class="block mb-2 text-sm font-medium">中频阈值</label>
                  <input type="number" v-model.number="smartContextStore.injectionParams.mediumFreqThreshold"
                    @change="updateInjectionParams"
                    class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                  <p class="text-xs text-secondary mt-1">引用次数超过此值则进入冷却注入。</p>
                </div>
                <div>
                  <label class="block mb-2 text-sm font-medium">中频冷却 (回合)</label>
                  <input type="number" v-model.number="smartContextStore.injectionParams.mediumFreqCooldown"
                    @change="updateInjectionParams"
                    class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                  <p class="text-xs text-secondary mt-1">距离上次注入超过此回合数才再次注入。</p>
                </div>
                <div>
                  <label class="block mb-2 text-sm font-medium">低频冷却 (回合)</label>
                  <input type="number" v-model.number="smartContextStore.injectionParams.lowFreqCooldown"
                    @change="updateInjectionParams"
                    class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
                  <p class="text-xs text-secondary mt-1">距离上次注入超过此回合数才再次注入。</p>
                </div>
              </div>
            </div>

            <!-- 条目管理 -->
            <div class="p-4 border border-dim rounded-lg" v-if="smartContextStore.isEnabled">
              <h4 class="font-bold text-md mb-2">知识条目状态</h4>
              <div class="max-h-96 overflow-y-auto space-y-2 pr-2">
                <div v-for="(item, id) in smartContextStore.injectionProbabilityTable" :key="id"
                  class="p-3 bg-secondary/30 rounded-lg border border-dim">
                  <div class="flex justify-between items-start">
                    <div>
                      <p class="font-mono text-xs text-accent break-all">{{ id }}</p>
                      <p class="text-sm font-bold"
                        :class="{ 'text-green-400': item.status === 'Injecting', 'text-yellow-400': item.status === 'Cooling Down' }">
                        状态: {{ item.status }}
                      </p>
                      <p class="text-xs text-secondary">{{ item.reason }}</p>
                    </div>
                    <button @click="handleForceUpdate(id as string)" class="btn-secondary btn-sm flex-shrink-0">
                      <i class="fas fa-sync-alt"></i> 立即更新
                    </button>
                  </div>
                  <div class="mt-2 text-xs text-secondary border-t border-dim pt-2">
                    <span>引用: {{ item.freq }}</span> |
                    <span>上次注入: {{ item.lastSent }}</span> |
                    <span>上次分析: {{ smartContextStore.linkerProfile[id]?.lastAnalyzedTurn || 'N/A' }}</span> |
                    <span>Miss: {{ smartContextStore.linkerProfile[id]?.missCount || 0 }}</span>
                    <div v-if="smartContextStore.linkerProfile[id]?.dynamicKeywords?.length" class="mt-1">
                      动态关键词:
                      <span v-for="kw in smartContextStore.linkerProfile[id].dynamicKeywords" :key="kw"
                        class="inline-block bg-primary/20 rounded px-1.5 py-0.5 text-xs mr-1 mb-1">
                        {{ kw }}
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="Object.keys(smartContextStore.injectionProbabilityTable).length === 0"
                  class="text-center text-secondary py-4">
                  没有可用的知识条目统计信息。
                </div>
              </div>
              <!-- Actions -->
              <div class="mt-4 pt-4 border-t border-dim space-y-2">
                <button @click="handleForceUpdateAll" :disabled="smartContextStore.isAnalyzingAll"
                  class="btn-secondary w-full">
                  <i class="fas fa-globe-asia mr-2" :class="{ 'fa-spin': smartContextStore.isAnalyzingAll }"></i>
                  {{ smartContextStore.isAnalyzingAll ? '正在更新中...' : '立即更新所有条目' }}
                </button>
                <button @click="showHelp = !showHelp" class="btn-secondary w-full !bg-transparent">
                  <i class="fas fa-question-circle mr-2"></i>
                  这是什么？
                </button>
                <div v-if="showHelp"
                  class="p-3 text-xs text-secondary bg-secondary/30 rounded-lg border border-dim mt-2">
                  <p><strong>智能上下文</strong>是一个实验性功能，它会：</p>
                  <ul class="list-disc list-inside mt-1 space-y-1">
                    <li>在后台，使用您选择的次级LLM，分析您的输入并为相关的游戏知识（如图鉴条目）动态学习新的“关联关键词”。</li>
                    <li>在生成AI回复时，根据您的输入和知识的使用“热度”，智能地只将最相关的几条知识注入到上下文中，而不是全部注入。</li>
                  </ul>
                  <p class="mt-2">这能让AI更好地理解您的意图，并在长对话中保持更高的连贯性，同时还能节省一些Token。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChatHistoryManager } from '../../core/history';
import { generateWithSecondaryApi } from '../../core/secondaryLlmApi';
import { Summarizer } from '../../core/summarizer';
import { useApiProfileStore } from '../../stores/app/apiProfileStore';
import { useSmartContextStore } from '../../stores/modules/smartContextStore';
import { usePokedexStore } from '../../stores/systems/pokedexStore';
import { useSettingsStore } from '../../stores/ui/settingsStore';

const store = useSettingsStore();
const apiProfileStore = useApiProfileStore();
const smartContextStore = useSmartContextStore();
const pokedexStore = usePokedexStore();
const activeTab = ref('params');
const showHelp = ref(false);
const isTestingApi = ref(false);
const isForcingSummary = ref(false);

// The root visibility is now controlled by the store
const showModal = computed({
  get: () => store.isModalVisible,
  set: (value) => {
    if (!value) {
      store.closeModal();
    }
  }
});

// Watch for changes in contextLimit to enforce summaryTrigger max value
watch(() => store.settings.contextLimit, (newLimit) => {
  if (store.settings.summaryTrigger > newLimit) {
    store.settings.summaryTrigger = newLimit;
  }
}, { immediate: true });

// Watch for changes in autoCompletePokedex to trigger a scan
watch(() => store.settings.autoCompletePokedex, (newValue, oldValue) => {
  if (newValue === true && oldValue === false) {
    // When the toggle is turned on, trigger a scan for missing pokedex entries.
    toastr.info('后台图鉴自动补全功能已开启，将扫描一次当前所有物品。');
    pokedexStore.scanAndCompleteMissingPokedex();
  }
});

const activeProfile = computed(() => {
  return apiProfileStore.profiles.find(p => p.id === apiProfileStore.activeProfileId);
});

const currentModelList = computed(() => {
  return activeProfile.value ? store.modelLists[activeProfile.value.id] || [] : [];
});

const defaultUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  makersuite: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com/v1',
};

watch(() => activeProfile.value?.source, (newSource) => {
  if (activeProfile.value && newSource && defaultUrls[newSource]) {
    // To avoid overwriting user's custom URL, we only set it if it's empty or a known default
    const isDefaultOrEmpty = !activeProfile.value.apiUrl || Object.values(defaultUrls).includes(activeProfile.value.apiUrl);
    if (isDefaultOrEmpty) {
      activeProfile.value.apiUrl = defaultUrls[newSource];
    }
  }
}, { immediate: true });


const handleRemoveProfile = () => {
  if (apiProfileStore.activeProfileId) {
    store.removeProfile(apiProfileStore.activeProfileId);
  }
};

const handleFetchModels = () => {
  if (activeProfile.value) {
    store.fetchModelsForProfile(activeProfile.value.id);
  }
};

const handleTestApi = async () => {
  const profile = activeProfile.value;
  if (!profile || !profile.apiKey || !profile.model) {
    toastr.error('请先填写当前配置的API密钥和模型名称。');
    return;
  }

  isTestingApi.value = true;
  toastr.info(`正在使用模型 [${profile.model}] 进行测试...`);

  try {
    const response = await generateWithSecondaryApi({
      method: 'generateRaw',
      config: {
        user_input: 'Hello',
        ordered_prompts: ['user_input'],
      },
      secondaryApiConfig: {
        source: profile.source,
        apiUrl: profile.apiUrl,
        key: profile.apiKey,
        model: profile.model,
      },
    });

    if (response && response.trim().length > 0) {
      toastr.success('API连接测试成功！');
    } else {
      throw new Error('API返回了空响应。');
    }
  } catch (error) {
    console.error('API Test failed:', error);
    toastr.error('API连接测试失败，请检查配置或查看控制台。');
  } finally {
    isTestingApi.value = false;
  }
};

const updateInjectionParams = () => {
  smartContextStore.updateInjectionParams(smartContextStore.injectionParams);
};

const handleForceUpdate = (entryId: string) => {
  if (!smartContextStore.selectedApiProfileId) {
    toastr.error('请先在上方选择一个用于学习的LLM配置。');
    return;
  }
  smartContextStore.forceAnalyzeEntry(entryId);
};

const handleToggleChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  smartContextStore.setEnabled(target.checked);
};

const handleProfileSelectChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  smartContextStore.setApiProfileId(target.value || null);
};

const handleForceUpdateAll = () => {
  if (!smartContextStore.selectedApiProfileId) {
    toastr.error('请先在上方选择一个用于学习的LLM配置。');
    return;
  }
  smartContextStore.forceAnalyzeAllEntries();
};

const openModal = () => {
  const historyManager = (window as any).chatHistoryManager as ChatHistoryManager;
  if (historyManager) {
    store.fetchSettings();
    store.fetchLatestSummary(historyManager);
  }
  // Also fetch smart context stats when opening the modal
  smartContextStore.updateStatsFromVariables();
  store.openModal();
};

const closeModal = () => {
  store.closeModal();
};

const handleForceSummary = async () => {
  const summarizer = (window as any).summarizer as Summarizer;
  if (!summarizer) {
    toastr.error('Summarizer 实例未找到。');
    return;
  }

  toastr.info('已在后台启动手动精炼摘要任务...');
  isForcingSummary.value = true;
  try {
    // @ts-ignore - Accessing private method for manual trigger
    await summarizer.executeSummary();
    toastr.success('手动摘要已成功生成！');
    // We need the history manager to update the display after summarizing
    const historyManager = (window as any).chatHistoryManager as ChatHistoryManager;
    if (historyManager) {
      await store.fetchLatestSummary(historyManager);
    }
  } catch (error) {
    console.error('Forced summary failed:', error);
    toastr.error('手动摘要失败，请查看控制台。');
  } finally {
    isForcingSummary.value = false;
  }
};

// Expose openModal to be called from outside Vue (e.g., from jQuery event handlers)
defineExpose({
  openModal,
});

onMounted(() => {
  // This component will be mounted programmatically, so we don't need to do much here.
  // The `openModal` method will be our entry point.
  // We also watch the store's visibility state to sync with our local state.
  watch(() => store.isModalVisible, (newValue) => {
    if (newValue) {
      activeTab.value = store.initialTab || 'params'; // Fallback to 'params' when no initial tab provided
      const historyManager = (window as any).chatHistoryManager as ChatHistoryManager;
      if (historyManager) {
        store.fetchSettings();
        store.fetchLatestSummary(historyManager);
      }
    }
  });
});
</script>
