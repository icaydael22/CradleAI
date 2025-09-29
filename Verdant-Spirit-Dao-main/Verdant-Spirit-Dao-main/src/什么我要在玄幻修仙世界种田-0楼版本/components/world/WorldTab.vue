<template>
  <div id="world-tab-content" class="side-tab-content">
    <div v-if="worldStore.world" class="p-4 space-y-4">
      <!-- 新的时间/天气信息卡片 -->
      <div class="bg-background-light p-3 rounded-lg shadow">
        <div class="flex justify-between items-center mb-2">
          <div class="font-bold text-lg">
            第 {{ time.day }} 天
          </div>
          <div class="px-2 py-1 bg-primary rounded-full text-xs font-bold">
            {{ time.timeOfDay }}
          </div>
        </div>
        <div class="text-sm text-secondary space-y-1">
          <div class="flex items-center justify-between">
            <span><i class="fas fa-calendar-alt fa-fw mr-2"></i>季节</span>
            <span class="font-semibold">{{ time.season }} · {{ time.solarTerm }}</span>
          </div>
          <div v-if="weather" class="flex items-center justify-between" :title="weather.天气描述">
            <span><i class="fas fa-cloud-sun fa-fw mr-2"></i>天气</span>
            <span class="font-semibold">{{ weather.当前天气 }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span><i class="fas fa-map-marker-alt fa-fw mr-2"></i>地点</span>
            <span class="font-semibold">{{ worldStore.location }}</span>
          </div>
        </div>
      </div>

      <ShelterInfo :shelter="worldStore.shelter" />
      <hr class="my-4 border-t border-dim theme-transition">
      <MapDisplay :test-map-store="props.testMapStore" />
    </div>
    <div v-else class="text-center text-secondary p-4">
      正在加载世界信息...
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch, computed, isRef } from 'vue';
import { logger } from '../../core/logger';
import { useWorldStore } from '../../stores/core/worldStore';
import {useShelterStore} from '@/stores/systems/shelterStore'
import { useMapStore } from '../../stores/systems/mapStore';
import type { ITimeState, IWeatherState } from '../../types';
import ShelterInfo from './ShelterInfo.vue';
import MapDisplay from './MapDisplay.vue';

const props = defineProps<{
  testWorldStore?: ReturnType<typeof useWorldStore>;
  testMapStore?: ReturnType<typeof useMapStore>;
}>();

const worldStore = props.testWorldStore || useWorldStore();
const shelterStore = useShelterStore();

//console.log("worldStore.world.value:",worldStore.world.value)

logger('info', 'WorldTab', 'Component instance created.');

// 关键修复：创建一个计算属性来处理测试环境中 ref 和生产环境中普通对象的差异
const time = computed(() => {
  const timeData = worldStore.time;
  return (isRef(timeData) ? timeData.value : timeData) as ITimeState;
});

const weather = computed<IWeatherState>(() => {
  const weatherData = worldStore.weather;
  return (isRef(weatherData) ? weatherData.value : weatherData) as IWeatherState;
});

onMounted(() => {
  logger('log', 'WorldTab', 'Component has been mounted. Initializing world data...');
  if (!worldStore.world) {
    worldStore.initialize(shelterStore);
  }
});

watch(() => worldStore.world, (newWorld, oldWorld) => {
  if (newWorld) {
    logger('info', 'WorldTab', 'World data has been loaded/updated in the store.');
  } else {
    logger('warn', 'WorldTab', 'World data is null or undefined in the store.');
  }
}, { deep: true });
</script>
