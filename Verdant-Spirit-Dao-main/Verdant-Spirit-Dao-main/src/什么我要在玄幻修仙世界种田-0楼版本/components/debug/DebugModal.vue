<template>
  <div v-if="store.isVisible" class="modal-overlay">
    <div class="modal-content">
      <h3 class="modal-title" style="cursor: move;">
        调试控制台
        <button type="button" class="modal-close-btn" @click="store.closeModal" aria-label="Close">&times;</button>
      </h3>
      <div class="modal-body">
        <!-- Tab 导航 -->
        <div class="flex border-b border-dim mb-2">
          <button :class="['debug-tab-btn', { active: activeTab === 'state' }]"
            @click="activeTab = 'state'">状态监视器</button>
          <button :class="['debug-tab-btn', { active: activeTab === 'events' }]"
            @click="activeTab = 'events'">事件注入器</button>
          <button :class="['debug-tab-btn', { active: activeTab === 'logs' }]"
            @click="activeTab = 'logs'">日志查看器</button>
          <button :class="['debug-tab-btn', { active: activeTab === 'prompt' }]"
            @click="activeTab = 'prompt'">提示词查看器</button>
        </div>

        <!-- Tab 内容 -->
        <div id="debug-tab-content">
          <div v-show="activeTab === 'state'">
            <StateBrowser />
          </div>
          <div v-show="activeTab === 'events'">
            <EventInjector />
          </div>
          <div v-show="activeTab === 'logs'" class="h-full">
            <LogViewer />
          </div>
          <div v-show="activeTab === 'prompt'">
            <PromptViewer />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <div class="flex items-center">
          <label for="debug-mode-toggle" class="text-sm font-medium mr-2">调试模式</label>
          <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
            <input type="checkbox" name="debug-mode-toggle" id="debug-mode-toggle"
              class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
              v-model="isDebugModeEnabled" />
            <label for="debug-mode-toggle"
              class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useDebugStore } from '../../stores/ui/debugStore';
import EventInjector from './EventInjector.vue';
import LogViewer from './LogViewer.vue';
import PromptViewer from './PromptViewer.vue';
import StateBrowser from './StateBrowser.vue';

const store = useDebugStore();
const activeTab = ref('state');
const isDebugModeEnabled = ref(false);

onMounted(() => {
  // Load initial state from localStorage
  isDebugModeEnabled.value = localStorage.getItem('xuanhuan.debugMode') === 'true';
});

watch(isDebugModeEnabled, (newValue) => {
  // Persist state to localStorage
  localStorage.setItem('xuanhuan.debugMode', String(newValue));
  // We need a way to notify the logger to update its status.
  // For now, we assume it reads from localStorage on each call.
});
</script>

<style scoped>
.modal-content {
  width: 80vw;
  max-width: 95vw;
  height: 80vh;
  max-height: 95vh;
  min-width: 400px;
  min-height: 300px;
  resize: both;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-card);
  color: var(--text-primary);
  padding: 1.5rem 2rem;
  border-radius: 1rem;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

.modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-color);
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;
}

.modal-close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: 0;
}

#debug-tab-content {
  flex-grow: 1;
  overflow-y: auto;
}

.modal-footer {
  padding-top: 1rem;
  margin-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.debug-tab-btn {
  padding: 0.5rem 1rem;
  cursor: pointer;
  background: none;
  border: none;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-size: 0.875rem;
}

.debug-tab-btn:hover {
  color: var(--text-primary);
}

.debug-tab-btn.active {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
}

/* Toggle Switch Styles */
.toggle-checkbox:checked {
  right: 0;
  border-color: var(--accent-color);
}

.toggle-checkbox:checked+.toggle-label {
  background-color: var(--accent-color);
}

.toggle-label {
  transition: background-color 0.2s ease-in-out;
}

.toggle-checkbox {
  transition: all 0.2s ease-in-out;
}
</style>
