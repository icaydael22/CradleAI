<template>
  <div class="panel-box p-4">
    <h3 class="panel-title" style="font-size: 1.1rem; padding: 0 0 0.75rem 0;">{{ title }}</h3>
    <div v-if="items.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <button v-for="(item, index) in items" :key="item.名称 || index"
        class="clickable-item text-left text-sm p-2 bg-secondary/50 rounded-md hover:bg-secondary transition-colors duration-150 truncate"
        @click="showDetails(item)">
        {{ item.名称 }}
      </button>
    </div>
    <p v-else class="text-xs text-secondary italic mt-2">空</p>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { logger } from '../../core/logger';
import { useItemStore } from '../../stores/facades/itemStore';
import { usePokedexStore } from '../../stores/systems/pokedexStore';
import { useDetailsStore } from '../../stores/ui/detailsStore';

const props = defineProps<{
  title: string;
  items: any[];
  // Add a type prop to distinguish between different kinds of lists
  listType: 'item' | 'pokedex';
  pokedexType?: '妖兽' | '植物' | '物品' | '书籍' | '成就';
}>();

watch(() => props.items, (newItems) => {
  logger('info', 'PokedexList', `[${props.title}] received updated items:`, JSON.parse(JSON.stringify(newItems)));
}, { deep: true, immediate: true });

const detailsStore = useDetailsStore();
const itemStore = useItemStore();
const pokedexStore = usePokedexStore();

const showDetails = (item: any) => {
  logger('info', 'PokedexList', `Item clicked, attempting to show modal for:`, item);
  if (props.listType === 'item') {
    itemStore.editItem(item.名称);
  } else if (props.listType === 'pokedex' && props.pokedexType) {
    pokedexStore.editPokedexEntry(props.pokedexType, item.名称);
  } else {
    // Fallback for components that don't have the edit functionality
    detailsStore.showDetails(_.cloneDeep(item));
  }
};
</script>

<style scoped>
/* 如果需要，可以在此处为列表添加任何特定样式 */
</style>
