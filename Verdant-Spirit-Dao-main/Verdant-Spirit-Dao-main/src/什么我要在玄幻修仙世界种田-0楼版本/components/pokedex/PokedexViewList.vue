<template>
  <div>
    <details class="group" open>
      <summary
        class="font-bold text-lg cursor-pointer hover:text-accent transition-colors theme-transition flex justify-between items-center py-2">
        {{ title }} ({{ entries.length }})
        <i class="fas fa-chevron-down transition-transform duration-300 group-open:rotate-180"></i>
      </summary>
      <ul class="space-y-2 mt-2">
        <li v-if="entries.length === 0" class="text-secondary text-sm italic p-2">暂无条目</li>
        <li v-for="entry in entries" :key="entry.名称"
          class="p-2 rounded-lg bg-secondary/50 flex justify-between items-center">
          <label class="flex items-center cursor-pointer flex-grow mr-4">
            <input type="checkbox" class="form-checkbox mr-3" :value="{ type, name: entry.名称 }"
              v-model="selectedItemsModel">
            <span class="truncate" :title="entry.名称">{{ entry.名称 }}</span>
          </label>
          <div class="space-x-2 flex-shrink-0">
            <button @click="handleAction('view', entry)" class="icon-btn text-blue-400 hover:text-blue-300" title="查看"><i
                class="fas fa-eye"></i></button>
            <button @click="handleAction('edit', entry)" class="icon-btn" title="编辑"><i class="fas fa-pencil-alt"></i></button>
            <button @click="handleAction('delete', entry)" class="icon-btn text-red-500 hover:text-red-400" title="删除"><i
                class="fas fa-trash"></i></button>
          </div>
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PokedexEntry, PokedexType } from '../../core/pokedex';
import { logger } from '../../core/logger';

const props = defineProps<{
  title: string;
  type: PokedexType;
  entries: PokedexEntry[];
  modelValue: { type: PokedexType, name: string }[];
}>();

const emit = defineEmits(['update:modelValue', 'view', 'edit', 'delete']);

const handleAction = (action: 'view' | 'edit' | 'delete', entry: PokedexEntry) => {
  logger('info', 'PokedexViewList', `Action "${action}" triggered for entry:`, entry);
  emit(action, entry);
};

const selectedItemsModel = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value);
  }
});
</script>
