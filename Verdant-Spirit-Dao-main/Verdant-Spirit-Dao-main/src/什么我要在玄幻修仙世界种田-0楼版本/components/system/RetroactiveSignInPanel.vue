<template>
  <div class="pt-4 mt-4 border-t border-dim theme-transition space-y-3">
    <h4 class="font-semibold text-md text-center">补签中心</h4>
    <p class="text-center text-sm text-secondary">
      你当前拥有 <span class="font-bold text-accent">{{ retroCardCount }}</span> 张补签卡。
    </p>

    <div class="grid grid-cols-7 gap-1 text-center text-xs">
      <div v-for="day in unSignedInDays" :key="day.day" :class="getDayClasses(day)" :title="`补签第${day.day}天`"
        @click="selectDay(day.day)">
        {{ day.day }}
      </div>
    </div>

    <button class="btn-primary w-full" :disabled="!selectedDay || retroCardCount <= 0" @click="useRetroCard">
      <i class="fas fa-check mr-2"></i>
      <span v-if="!selectedDay && retroCardCount > 0">请选择补签日期</span>
      <span v-else-if="retroCardCount > 0">消耗补签卡 (补签第 {{ selectedDay }} 天)</span>
      <span v-else>补签卡不足</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { logger } from '../../core/logger';
import { useItemStore } from '../../stores/facades/itemStore';
import { useSignInStore } from '../../stores/systems/signInStore';

const props = defineProps({
  testItemStore: {
    type: Object,
    required: false,
  },
  testSignInStore: {
    type: Object,
    required: false,
  }
});

const itemStore = props.testItemStore || useItemStore();
const signInStore = props.testSignInStore || useSignInStore();

const selectedDay = ref<number | null>(null);

const retroCardCount = computed(() => {
  const card = itemStore.items.find((i: { 名称: string; }) => i.名称 === '补签卡');
  return card?.数量 || 0;
});

const unSignedInDays = computed(() => {
  return signInStore.calendarData.days.filter((d: { isSignedIn: boolean; isToday: boolean }) => !d.isSignedIn && !d.isToday);
});

function selectDay(day: number) {
  selectedDay.value = day;
}

// Replicate the styling logic from SignInPanel for consistency
const getDayClasses = (day: { day: number }) => {
  let classes = 'w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-300 cursor-pointer ';
  if (selectedDay.value === day.day) {
    classes += 'bg-accent text-white ring-2 ring-accent ';
  } else {
    classes += 'bg-secondary/50 hover:bg-secondary/80 ';
  }
  return classes;
};

async function useRetroCard() {
  if (!selectedDay.value || retroCardCount.value <= 0) return;

  const { year, month } = signInStore.calendarData;
  const dateString = `第${year}年${month}月${selectedDay.value}日`;

  logger('info', 'RetroactiveSignIn', `User wants to retroactively sign in for ${dateString}`);

  await signInStore.retroactiveSignIn(dateString);

  selectedDay.value = null;
}
</script>

<style lang="scss" scoped>
/* Styles are now handled by Tailwind utility classes in the template */
</style>
