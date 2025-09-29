<template>
  <div class="side-tab-content p-2">
    <div v-if="store.relations.length === 0" class="text-center py-4 text-secondary">
      <i class="fas fa-info-circle mr-1"></i>没有人际关系数据
    </div>
    <div v-else class="space-y-4">
      <div v-for="char in store.relations" :key="char.姓名" class="bg-secondary/50 rounded-xl border border-dim p-4 shadow-sm">
        <h3 class="font-bold text-lg text-accent mb-3">
          {{ char.姓名 }}
        </h3>
        <div class="space-y-2 text-sm">
          <div>
            <span class="font-semibold">❤️ 关系:</span>
            <ul v-if="char.关系 && Object.keys(char.关系).length > 0" class="list-disc list-inside ml-2 mt-1">
              <li v-for="(value, name) in char.关系" :key="name" class="flex justify-between">
                <span>{{ name }}</span>
                <span class="font-semibold" :class="typeof value === 'number' ? getRelationColor(value) : ''">{{ value }}</span>
              </li>
            </ul>
            <p v-else class="text-secondary text-xs ml-2 mt-1">暂无</p>
          </div>
          <div>
            <span class="font-semibold">🙂 态度:</span>
            <!-- TODO: 态度的数据结构尚未确定，这里是占位符 -->
            <p class="text-secondary text-xs ml-2 mt-1">待定</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRelationsStore } from '../../stores/systems/relationsStore';

const store = useRelationsStore();

const getRelationColor = (value: number) => {
  if (value < 0) return 'text-red-400';
  if (value > 50) return 'text-green-400';
  return 'text-gray-400';
};
</script>
