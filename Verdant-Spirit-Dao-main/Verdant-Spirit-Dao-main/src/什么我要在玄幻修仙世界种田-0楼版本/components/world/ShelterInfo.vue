<template>
  <div id="shelter-container">
    <div v-if="shelter">
      <h3 class="font-bold text-lg mb-3 pb-2 border-b border-dim theme-transition">
        <i class="fas fa-home text-accent mr-2"></i> {{ shelter.名称 || '庇护所' }}
      </h3>
      <div class="text-sm space-y-1 text-secondary px-2">
        <p>规模: {{ shelter.规模 }}</p>
        <p>状态: {{ shelter.状态 }}</p>
        <p>舒适度: {{ shelter.舒适度 }}</p>
        <p>防御力: {{ shelter.防御力 }}</p>
      </div>

      <div v-if="shelter.功能 && shelter.功能.length > 0" class="mt-4">
        <h4 class="font-semibold mb-2 text-primary/90 px-2">功能</h4>
        <ul class="list-disc list-inside text-sm text-secondary space-y-1 px-2">
          <li v-for="func in shelter.功能" :key="func">{{ func }}</li>
        </ul>
      </div>

      <div v-if="builtComponents && builtComponents.length > 0" class="mt-4">
        <h4 class="font-semibold mb-2 text-primary/90 px-2">组件详情</h4>
        <div class="space-y-3">
          <ShelterComponent
            v-for="[name, component] in builtComponents"
            :key="name"
            :name="name"
            :component="component"
          />
        </div>
      </div>
    </div>
    <div v-else>
      <p class="text-secondary italic">暂无庇护所信息。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PropType, watch, computed } from 'vue';
import { logger } from '../../core/logger';
import ShelterComponent from './ShelterComponent.vue';

const props = defineProps({
  shelter: {
    type: Object as PropType<any | null>,
    required: true,
  },
});

const builtComponents = computed(() => {
  if (!props.shelter || !props.shelter.组件) {
    return [];
  }
  return Object.entries(props.shelter.组件).filter(([name, component]: [string, any]) => {
    return component.状态 !== '未建造' && component.规模 !== '未开垦' && component.规模 !== '未布置';
  });
});

logger('info', 'ShelterInfo', 'Component has been rendered.');

watch(() => props.shelter, (newShelter) => {
  logger('log', 'ShelterInfo', 'Prop "shelter" has changed.', { new: newShelter });
  if (newShelter) {
    logger('log', 'ShelterInfo', 'Built components calculated:', builtComponents.value);
  }
}, { deep: true, immediate: true });
</script>
