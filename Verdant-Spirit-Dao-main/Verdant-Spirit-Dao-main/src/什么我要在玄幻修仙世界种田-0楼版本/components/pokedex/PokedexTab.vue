<template>
  <div class="side-panel-body">
    <PokedexList title="妖兽" :items="worldStore.world?.图鉴?.['妖兽'] ?? []" list-type="pokedex" pokedex-type="妖兽" />
    <PokedexList title="灵植" :items="worldStore.world?.图鉴?.['植物'] ?? []" list-type="pokedex" pokedex-type="植物" />
    <PokedexList title="书籍" :items="worldStore.world?.图鉴?.['书籍'] ?? []" list-type="pokedex" pokedex-type="书籍" />
    <PokedexList title="物品" :items="itemStore.items" list-type="item" />
  </div>
</template>

<script setup lang="ts">
import { useItemStore } from '../../stores/facades/itemStore';
import { useWorldStore } from '../../stores/core/worldStore';
import PokedexList from './PokedexList.vue';

// 允许在测试环境中注入 mock store
const props = defineProps<{
  testWorldStore?: ReturnType<typeof useWorldStore>;
  testItemStore?: ReturnType<typeof useItemStore>;
}>();

const worldStore = props.testWorldStore || useWorldStore();
const itemStore = props.testItemStore || useItemStore();
</script>
