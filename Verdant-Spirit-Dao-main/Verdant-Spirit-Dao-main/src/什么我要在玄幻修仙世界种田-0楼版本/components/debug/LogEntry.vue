<template>
  <div class="debug-log-entry">
    <span :class="levelColor" class="font-bold">[{{ entry.timestamp }}] [{{ entry.source }}]</span>
    <span v-if="!isLong || isExpanded">{{ fullMessage }}</span>
    <span v-else>
      {{ truncatedMessage }}...
      <a href="#" class="log-expand-btn" @click.prevent="isExpanded = true">显示更多</a>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, PropType } from 'vue';
import { LogEntry } from '../../core/logger';

const props = defineProps({
  entry: {
    type: Object as PropType<LogEntry>,
    required: true,
  },
});

const isExpanded = ref(false);
const truncationLength = 200;

const fullMessage = computed(() => {
  const dataStr = props.entry.data.map(d => typeof d === 'object' ? JSON.stringify(d, null, 2) : String(d)).join(' ');
  return props.entry.message + ' ' + dataStr;
});

const isLong = computed(() => fullMessage.value.length > truncationLength);

const truncatedMessage = computed(() => {
  return fullMessage.value.substring(0, truncationLength);
});

const levelColor = computed(() => {
  switch (props.entry.level) {
    case 'info': return 'text-green-400';
    case 'warn': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-cyan-400';
  }
});
</script>

<style scoped>
.debug-log-entry {
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--border-color);
  word-break: break-all;
  white-space: pre-wrap;
}

.log-expand-btn {
  color: #60a5fa; /* blue-400 */
  text-decoration: underline;
  cursor: pointer;
  margin-left: 0.5rem;
  font-weight: bold;
}

.log-expand-btn:hover {
  color: #3b82f6; /* blue-500 */
}
</style>
