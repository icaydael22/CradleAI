<template>
  <div class="bg-secondary/50 rounded-xl border border-dim p-4 shadow-sm card-hover theme-transition">
    <h3 class="font-bold text-lg mb-3 pb-2 border-b border-dim theme-transition">
      👤 {{ character.姓名 }}
    </h3>
    <div class="space-y-3 text-sm">
      <!-- Core Stats -->
      <div class="grid grid-cols-2 gap-x-4 gap-y-2">
        <div v-if="character.等级"><span class="font-medium text-accent">📈 等级:</span> {{ character.等级 }}</div>
        <div v-if="character.职业"><span class="font-medium text-accent">💼 职业:</span> {{ character.职业 }}</div>
        <div v-if="character.种族"><span class="font-medium text-accent">🧬 种族:</span> {{ character.种族 }}</div>
        <div v-if="character.年龄"><span class="font-medium text-accent">🎂 年龄:</span> {{ character.年龄 }}</div>
      </div>

      <template v-if="isMainCharacter">
        <!-- Traits -->
        <div v-if="character.特质 && character.特质.length > 0">
          <span class="font-medium text-accent">🌟 特质:</span>
          <div class="flex flex-wrap gap-2 mt-1">
            <span v-for="trait in character.特质" :key="trait"
              class="px-2 py-0.5 bg-accent/20 text-accent-hover rounded-full text-xs">
              {{ trait }}
            </span>
          </div>
        </div>

        <!-- Talents -->
        <div v-if="character.天赋">
          <span class="font-medium text-accent">天赋:</span>
          <!-- Render as object if it's the object form -->
          <ul v-if="typeof character.天赋 === 'object' && !Array.isArray(character.天赋)"
            class="list-inside list-disc ml-2 mt-1">
            <li>根骨: {{ character.天赋.根骨 }}</li>
            <li>悟性: {{ character.天赋.悟性 }}</li>
            <li>气运: {{ character.天赋.气运 }}</li>
          </ul>
          <!-- Render as array if it's the array form -->
          <ul v-else-if="Array.isArray(character.天赋)" class="list-inside list-disc ml-2 mt-1">
            <li v-for="talent in character.天赋" :key="talent">{{ talent }}</li>
          </ul>
        </div>

        <!-- Status Bars -->
        <div v-if="character.状态">
          <span class="font-medium text-accent">🎭 状态:</span>
          <div class="mt-1 space-y-2">
            <div v-for="(status, key) in character.状态" :key="key">
              <template v-if="status">
                <div class="flex items-center justify-between text-xs">
                  <span>{{ key }}</span>
                  <span class="font-mono">{{ status.value }} / {{ status.max }}</span>
                </div>
                <div class="progress-bar-bg w-full rounded-full h-1.5">
                  <div class="progress-bar-fg h-1.5 rounded-full"
                    :style="{ width: `${(status.value / status.max) * 100}%` }"
                    :class="getProgressBarColor(status.value / status.max)">
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Collapsible Details -->
        <details class="collapsible-section text-xs">
          <summary class="cursor-pointer text-accent/80 hover:text-accent">显示/隐藏详细信息</summary>
          <div class="mt-2 space-y-2 pt-2 border-t border-dim">
            <div v-if="character.籍贯"><span class="font-semibold">籍贯:</span> {{ character.籍贯 }}</div>
            <div v-if="character.外貌特征"><span class="font-semibold">外貌:</span> {{ character.外貌特征 }}</div>
            <div v-if="character.身份背景">
              <span class="font-semibold">背景:</span>
              <ul class="list-inside list-disc ml-2">
                <li>前世: {{ character.身份背景.前世 }}</li>
                <li>现世: {{ character.身份背景.现世 }}</li>
              </ul>
            </div>
            <div v-if="character.性格特点">
              <span class="font-semibold">性格:</span>
              <ul class="list-inside list-disc ml-2">
                <li>核心: {{ character.性格特点.核心 }}</li>
                <li>习惯: {{ character.性格特点.习惯 }}</li>
              </ul>
            </div>
            <!-- Dynamically Rendered Additional Properties -->
            <div v-for="(value, key) in additionalProperties" :key="key">
              <span class="font-semibold">{{ key }}:</span>
              <template v-if="typeof value === 'object' && value !== null">
                <ul class="list-inside list-disc ml-2">
                  <li v-for="(subValue, subKey) in value" :key="subKey">
                    {{ subKey }}: {{ subValue }}
                  </li>
                </ul>
              </template>
              <template v-else>
                {{ value }}
              </template>
            </div>
          </div>
        </details>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, toRefs, watch } from 'vue';
import { logger } from '../../core/logger';
import type { ICharacter } from '../../types';

const props = defineProps<{
  character: ICharacter;
  isMainCharacter: boolean;
}>();

const { character, isMainCharacter } = toRefs(props);

// List of pre-defined keys that are already handled in the template
const PRE_DEFINED_KEYS = [
  '姓名', '等级', '职业', '种族', '年龄', '特质', '天赋', '状态',
  '籍贯', '外貌特征', '身份背景', '性格特点', '物品', '关系',
];

const additionalProperties = computed(() => {
  return Object.entries(character.value)
    .filter(([key]) => !PRE_DEFINED_KEYS.includes(key))
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {} as Record<string, any>);
});

const getProgressBarColor = (percentage: number) => {
  if (percentage < 0.25) return 'bg-red-500';
  if (percentage < 0.5) return 'bg-yellow-500';
  return 'bg-green-500';
};

onMounted(() => {
  logger('info', 'CharacterCard', `Component mounted for character: ${character.value?.姓名}`, {
    character: character.value,
    isMainCharacter: isMainCharacter.value,
  });
});

watch(character, (newChar) => {
  logger('info', 'CharacterCard', `Character prop changed for: ${newChar?.姓名}`, {
    character: newChar,
  });
}, { deep: true });
</script>
