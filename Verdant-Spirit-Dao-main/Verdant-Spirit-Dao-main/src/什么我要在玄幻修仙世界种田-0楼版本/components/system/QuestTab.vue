<template>
  <div id="quest-system-panel" class="bg-main rounded-xl border border-dim p-3.5 shadow-sm card-hover theme-transition">
    <div class="flex justify-between items-center mb-3 pb-2 border-b border-dim">
      <h3 class="font-bold text-lg theme-transition">
        <i class="fas fa-scroll text-accent mr-2"></i> 任务系统
      </h3>
    </div>
    <div class="relative mb-3">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <i class="fas fa-search text-secondary"></i>
      </div>
      <input 
        type="search" 
        v-model="searchTerm"
        class="w-full bg-secondary/30 rounded-md py-2 pl-10 pr-4 text-sm border border-dim focus:border-accent focus:ring-0 theme-transition" 
        placeholder="搜索任务名称..."
      >
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-dim mb-3 quest-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="['quest-tab-btn flex-1 p-2 text-sm font-semibold transition-colors', { 'active': activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <i :class="['fas', tab.icon, 'mr-1.5']"></i>
        {{ tab.label }} <span class="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-secondary/50">{{ tab.count }}</span>
      </button>
    </div>

    <!-- Content -->
    <div class="quest-tabs-content">
      <div v-if="activeTabData" class="quest-tab-pane">
        <ul v-if="filteredQuests(activeTabData.data).length > 0" class="space-y-3 quest-list">
          <QuestItem v-for="quest in filteredQuests(activeTabData.data)" :key="quest.id" :quest="quest" />
        </ul>
        <p v-else class="text-secondary text-sm italic p-4 text-center">该分类下没有任务。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuestStore, type QuestStore } from '../../stores/systems/questStore';
import type { Quest } from '../../stores/systems/questStore';
import QuestItem from './QuestItem.vue';
import { logger } from '../../core/logger';

// 允许在测试环境中注入 mock store
const props = defineProps<{
  testQuestStore?: QuestStore;
}>();

const questStore = props.testQuestStore || useQuestStore();

const searchTerm = ref('');
const activeTab = ref('ongoing');

const tabs = computed(() => {
  // 通过直接依赖 questStore 的 computed 属性，确保响应性
  const ongoing = questStore.ongoingQuests;
  const completed = questStore.completedQuests;
  const notCompleted = questStore.notCompletedQuests;
  const failed = questStore.failedQuests;

  return [
    { id: 'ongoing', label: '进行中', count: ongoing.length, data: ongoing, icon: 'fa-person-running' },
    { id: 'completed', label: '已完成', count: completed.length, data: completed, icon: 'fa-check-double' },
    { id: 'not-completed', label: '未完成', count: notCompleted.length, data: notCompleted, icon: 'fa-box-archive' },
    { id: 'failed', label: '失败', count: failed.length, data: failed, icon: 'fa-xmark' },
  ];
});

const activeTabData = computed(() => tabs.value.find(tab => tab.id === activeTab.value));

const filteredQuests = (quests: Quest[]) => {
    if (!searchTerm.value) {
        return quests;
    }
    return quests.filter(quest => quest.名称.toLowerCase().includes(searchTerm.value.toLowerCase()));
};

// The quest store is now initialized centrally in index.ts
// onMounted(() => {
//   logger('info', 'QuestTab', 'Component mounted. Fetching initial quest data.');
//   questStore.fetchQuests();
// });
</script>

<style scoped>
.quest-tab-pane {
  display: block; /* v-show handles visibility */
}
.quest-tab-btn.active { 
  color: var(--accent-color); 
  border-bottom: 2px solid var(--accent-color); 
}
</style>
