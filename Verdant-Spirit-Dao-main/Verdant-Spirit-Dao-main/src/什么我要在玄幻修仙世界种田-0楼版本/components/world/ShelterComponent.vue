<template>
  <div class="p-3 bg-secondary/30 rounded-lg border border-dim">
    <p class="font-bold text-primary/90">{{ name }} <span class="text-xs text-secondary">({{ component.规模 }})</span></p>
    <ul class="mt-2 space-y-1 text-xs text-secondary">
      <li v-if="component.材料">
        <i class="fas fa-gem fa-fw mr-1 text-gray-400"></i> 材料: <span class="font-semibold text-primary/80">{{ component.材料 }}</span>
      </li>
      <li v-if="component.耐久度">
        <i class="fas fa-heart fa-fw mr-1 text-red-400"></i> 耐久度: <span class="font-semibold text-primary/80">{{ component.耐久度 }}</span>
      </li>
       <li v-if="component.防御加成">
        <i class="fas fa-shield-alt fa-fw mr-1 text-blue-400"></i> 防御加成: <span class="font-semibold text-primary/80">{{ component.防御加成 }}</span>
      </li>
      <li v-if="component.状态">
        <i class="fas fa-info-circle fa-fw mr-1 text-yellow-400"></i> 状态: <span class="font-semibold text-primary/80">{{ component.状态 }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { PropType } from 'vue';

defineProps({
  name: {
    type: String,
    required: true,
  },
  component: {
    type: Object as PropType<any>,
    required: true,
  },
});
</script>
