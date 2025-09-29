  <template>
    <div class="log-viewer">
      <!-- 控制栏 -->
      <div class="flex flex-wrap items-center gap-4 py-2 border-b border-dim mb-2">
        <!-- 搜索框 -->
        <div class="relative flex-grow">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-secondary"></i>
          <input type="text" v-model="searchTerm" placeholder="搜索日志..."
            class="w-full bg-secondary rounded-full border border-dim p-1.5 pl-8 text-sm text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition">
        </div>
        <!-- 模块过滤器 -->
        <div class="relative flex-shrink-0">
          <button @click="toggleModuleFilter" class="btn-secondary btn-sm w-48 text-left relative">
            <span>模块 ({{ selectedModules.length }}/{{ availableModules.length }})</span>
            <i class="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 transition-transform"
              :class="{'rotate-180': showModuleFilter}"></i>
          </button>
          <div v-if="showModuleFilter" class="dropdown-content absolute z-10 mt-1 w-full max-h-60 overflow-y-auto"
            style="width: 190px">
            <div class="p-2 border-b border-dim">
              <button @click="selectAllModules" class="btn-secondary btn-sm mr-2">全选</button>
              <button @click="deselectAllModules" class="btn-secondary btn-sm">全不选</button>
            </div>
            <label v-for="mod in availableModules" :key="mod"
              class="flex items-center p-2 hover:bg-secondary cursor-pointer">
              <input type="checkbox" :value="mod" v-model="selectedModules" class="mr-2">
              <span>{{ mod }}</span>
            </label>
          </div>
        </div>
        <!-- 等级过滤器 -->
        <div class="flex items-center gap-x-3 text-sm">
          <label><input type="checkbox" v-model="levels.log"> Log</label>
          <label><input type="checkbox" v-model="levels.info"> Info</label>
          <label><input type="checkbox" v-model="levels.warn"> Warn</label>
          <label><input type="checkbox" v-model="levels.error"> Error</label>
        </div>
        <!-- 按钮 -->
        <button @click="refreshLogs" class="btn-secondary btn-sm" title="刷新日志"><i class="fas fa-sync-alt"></i></button>
        <button @click="handleClearLogs" class="btn-secondary btn-sm" title="清空日志"><i
            class="fas fa-trash-alt"></i></button>
        <button @click="downloadLogs" class="btn-secondary btn-sm" title="下载日志"><i class="fas fa-download"></i></button>
      </div>

      <!-- 日志容器 -->
      <div class="log-container font-mono text-xs">
        <LogEntryComponent v-for="(entry, index) in filteredLogs" :key="index" :entry="entry" />
        <div v-if="filteredLogs.length === 0" class="text-center text-secondary p-4">
          没有匹配的日志条目。
        </div>
      </div>
    </div>
  </template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { getLogs, clearLogs, getLogsAsText, LogEntry } from '../../core/logger';
import LogEntryComponent from './LogEntry.vue';

const allLogs = ref<LogEntry[]>([]);
const searchTerm = ref('');
const levels = reactive({
  log: true,
  info: true,
  warn: true,
  error: true,
});
const selectedModules = ref<string[]>([]);
const showModuleFilter = ref(false);

const availableModules = computed(() => {
  const modules = new Set(allLogs.value.map(entry => entry.source));
  return Array.from(modules).sort();
});

// 当可用模块列表更新时，自动全选
watch(availableModules, (newModules, oldModules) => {
  if (JSON.stringify(newModules) !== JSON.stringify(oldModules)) {
    selectedModules.value = [...newModules];
  }
}, { deep: true });

function toggleModuleFilter() {
  showModuleFilter.value = !showModuleFilter.value;
}

function selectAllModules() {
  selectedModules.value = [...availableModules.value];
}

function deselectAllModules() {
  selectedModules.value = [];
}

onMounted(() => {
  refreshLogs();
});

const filteredLogs = computed(() => {
  const search = searchTerm.value.toLowerCase();
  const selectedModulesSet = new Set(selectedModules.value);

  return allLogs.value.filter(entry => {
    const levelMatch = levels[entry.level];
    if (!levelMatch) return false;

    const moduleMatch = selectedModulesSet.has(entry.source);
    if (!moduleMatch) return false;

    if (search === '') return true;

    const messageMatch = String(entry.message).toLowerCase().includes(search);
    const sourceMatch = String(entry.source).toLowerCase().includes(search);
    const dataMatch = entry.data.some(d => {
      const json = JSON.stringify(d);
      return typeof json === 'string' && json.toLowerCase().includes(search);
    });

    return messageMatch || sourceMatch || dataMatch;
  });
});

function refreshLogs() {
  allLogs.value = getLogs();
}

function handleClearLogs() {
  if (confirm('确定要清空所有日志吗？此操作不可撤销。')) {
    clearLogs();
    refreshLogs();
  }
}

function downloadLogs() {
  const logText = getLogsAsText(selectedModules.value);
  const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xuanhuan-debug-log-${new Date().toISOString()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

</script>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.log-container {
  flex-grow: 1;
  overflow-y: auto;
}
.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}
</style>
