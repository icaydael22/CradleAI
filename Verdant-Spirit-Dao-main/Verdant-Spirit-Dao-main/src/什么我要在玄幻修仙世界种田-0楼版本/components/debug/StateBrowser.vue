<template>
  <div class="state-browser">
    <div class="flex items-center gap-2 mb-2">
      <button class="btn-primary btn-sm" @click="store.fetchChatVariables" :disabled="store.isLoading">
        <i v-if="!store.isLoading" class="fas fa-sync-alt mr-1"></i>
        <span v-if="store.isLoading" class="spinner-border spinner-border-sm mr-1" role="status"
          aria-hidden="true"></span>
        {{ store.isLoading ? '加载中...' : '刷新变量' }}
      </button>
      <button class="btn-secondary btn-sm" @click="downloadVariables" :disabled="!store.chatVariables">
        <i class="fas fa-download mr-1"></i>
        下载变量 (JSON)
      </button>
    </div>

    <div v-if="store.chatVariables" class="variable-tree font-mono text-xs">
      <div v-for="key in orderedKeys" :key="key">
        <div class="state-namespace-card">
          <details open>
            <summary class="flex justify-between items-center">
              <h2>{{ key }}</h2>
              <button class="btn-secondary btn-sm" @click.prevent="downloadSingleVariable(key, store.chatVariables[key])">
                <i class="fas fa-download"></i>
              </button>
            </summary>
            <div class="namespace-content">
              <VariableEntry :key-name="key" :data="store.chatVariables[key]" />
            </div>
          </details>
        </div>
      </div>
    </div>
    <div v-else class="text-center text-secondary p-4">
      点击“刷新变量”以加载状态。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { safeJsonStringify } from '../../core/logger';
import { useDebugStore } from '../../stores/ui/debugStore';
import VariableEntry from './VariableEntry.vue';

const store = useDebugStore();

const orderedKeys = computed(() => {
  if (!store.chatVariables) return [];
  const keys = Object.keys(store.chatVariables);
  const preferredOrder = ['角色', '世界', 'plugin_storage', '备份'];
  const sortedKeys = keys.sort((a, b) => {
    const indexA = preferredOrder.indexOf(a);
    const indexB = preferredOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
  return sortedKeys;
});

function downloadVariables() {
  if (!store.chatVariables) return;

  const dataStr = safeJsonStringify(store.chatVariables, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xuanhuan-variables-${new Date().toISOString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadSingleVariable(key: string, data: any) {
  const dataStr = safeJsonStringify(data, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xuanhuan-variable-${key}-${new Date().toISOString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}

.state-namespace-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  overflow: hidden;
}

.state-namespace-card>details>summary {
  padding: 0.75rem 1.25rem;
  cursor: pointer;
  list-style: none;
}

.state-namespace-card>details>summary::-webkit-details-marker {
  display: none;
}

.state-namespace-card>details>summary:hover {
  background-color: color-mix(in srgb, var(--bg-card) 50%, transparent);
}

.state-namespace-card>details[open]>summary {
  border-bottom: 1px solid var(--border-color);
}

.state-namespace-card h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--accent-color);
  display: inline;
}

.namespace-content {
  padding: 1rem 1.25rem;
}
</style>
