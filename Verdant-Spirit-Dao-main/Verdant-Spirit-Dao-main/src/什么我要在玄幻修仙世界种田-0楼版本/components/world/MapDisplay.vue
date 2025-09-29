<script setup lang="ts">
import { computed } from 'vue';
import { useMapStore } from '../../stores/systems/mapStore';
import { useDetailsStore } from '../../stores/ui/detailsStore';
import type { IRegion, IConnection } from '../../types';
 
const props = defineProps<{
  testMapStore?: ReturnType<typeof useMapStore>;
}>();
 
const mapStore = props.testMapStore || useMapStore();
const detailsStore = useDetailsStore();
 
// Type guards
const isRegion = (item: IRegion | IConnection): item is IRegion => {
  return (item as IRegion).region_id !== undefined;
};
const isConnection = (item: IRegion | IConnection): item is IConnection => {
  return (item as IConnection).from_region !== undefined;
};
 
// Formatters: only pass player-relevant info to details modal (and localize keys)
const formatRegionForDetails = (region: IRegion) => {
  const result: Record<string, any> = {
    名称: region.name,
    简介: region.description,
  };
  if (Array.isArray(region.tags) && region.tags.length > 0) result['标签'] = region.tags;
  if (typeof region.risk_level === 'number') result['风险等级'] = region.risk_level;
  if (region.properties && typeof region.properties.reward_potential === 'number') {
    result['收益潜力'] = region.properties.reward_potential;
  }
  return result;
};
 
const formatConnectionForDetails = (conn: IConnection) => {
  const result: Record<string, any> = {
    名称: `${conn.direction}向的路径`,
    简介: conn.description,
    方向: conn.direction,
  };
  if (typeof conn.travel_time === 'number') result['行程'] = `${conn.travel_time} 时辰`;
  if (typeof conn.risk_level === 'number') result['风险等级'] = conn.risk_level;
  if (Array.isArray(conn.conditions) && conn.conditions.length > 0) result['条件'] = conn.conditions;
  return result;
};
 
const showDetails = (item: IRegion | IConnection) => {
  const payload = isRegion(item) ? formatRegionForDetails(item) : formatConnectionForDetails(item as IConnection);
  detailsStore.showDetails(payload);
};
 
const currentRegion = computed(() => {
  if (mapStore.currentPlayerLocation && mapStore.regions) {
    return mapStore.regions[mapStore.currentPlayerLocation];
  }
  return null;
});
 
const availableConnections = computed(() => {
  return mapStore.connections.filter(c => c.from_region === mapStore.currentPlayerLocation && c.is_visible);
});
 
const visitedRegions = computed(() => {
  return Object.values(mapStore.regions).filter(r => r.status === 'visited' && r.region_id !== mapStore.currentPlayerLocation);
});
 
</script>

<template>
  <div class="map-container bg-background-light p-3 rounded-lg shadow">
    <h3 class="font-bold text-lg mb-2 border-b border-dim pb-2">山河绘卷</h3>
    
    <!-- 当前位置 -->
    <div v-if="currentRegion" class="mb-4">
      <h4 class="font-semibold text-primary mb-1">当前所在</h4>
      <div class="p-2 bg-background rounded-md cursor-pointer hover:bg-background-dark" @click="showDetails(currentRegion)">
        <div class="font-bold">{{ currentRegion.name }}</div>
        <p class="text-xs text-secondary truncate">{{ currentRegion.description }}</p>
      </div>
    </div>

    <!-- 可用路径 -->
    <div v-if="availableConnections.length > 0" class="mb-4">
      <h4 class="font-semibold text-primary mb-1">可用路径</h4>
      <ul class="list-none p-0 m-0 space-y-1">
        <li 
          v-for="conn in availableConnections" 
          :key="conn.direction"
          class="p-2 bg-background rounded-md cursor-pointer hover:bg-background-dark"
          @click="showDetails(conn)"
        >
          <div class="text-sm">
            <span class="font-bold">{{ conn.direction }}</span>: 
            <span class="text-secondary">{{ conn.description }}</span>
          </div>
        </li>
      </ul>
    </div>

    <!-- 已访问区域 -->
    <div v-if="visitedRegions.length > 0">
      <h4 class="font-semibold text-primary mb-1">过往足迹</h4>
      <div class="flex flex-wrap gap-2">
        <span 
          v-for="region in visitedRegions" 
          :key="region.region_id"
          class="px-2 py-1 bg-background rounded-full text-xs cursor-pointer hover:bg-background-dark"
          @click="showDetails(region)"
        >
          {{ region.name }}
        </span>
      </div>
    </div>

  </div>
</template>

<style scoped lang="scss">
/* 使用 TailwindCSS，大部分样式已内联，此处可留空或添加特定复杂样式 */
.map-container {
  // 可以添加过渡效果等
  transition: all 0.3s ease;
}
</style>
