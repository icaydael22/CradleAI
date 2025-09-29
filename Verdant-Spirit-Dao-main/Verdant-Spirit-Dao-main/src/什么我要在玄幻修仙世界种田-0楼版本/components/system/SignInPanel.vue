<template>
  <div class="bg-main rounded-xl border border-dim p-3.5 shadow-sm card-hover theme-transition">
    <h3 class="font-bold text-lg mb-3 pb-2 border-b border-dim theme-transition">
      🗓️ {{ store.systemName }}
    </h3>
    <div v-if="store.isLoading" class="text-center py-4 text-secondary italic">
      <i class="fas fa-spinner fa-spin mr-1"></i> 正在加载签到数据...
    </div>
    <div v-else-if="!store.currentDate" class="text-center py-4 text-secondary italic">
      <i class="fas fa-exclamation-circle mr-1"></i> 无法获取当前游戏日期
    </div>
    <div v-else class="space-y-4">
      <div>
        <div class="text-center mb-2 font-semibold text-primary">
          第{{ store.calendarData.year }}年 - 第{{ store.calendarData.month }}月
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-xs">
          <div
            v-for="day in store.calendarData.days"
            :key="day.day"
            :class="getDayClasses(day)"
            :title="getDayTitle(day)"
            :data-testid="`calendar-day-${day.day}`"
          >
            <i v-if="day.isSignedIn" class="fas fa-check"></i>
            <span v-else>{{ day.day }}</span>
          </div>
        </div>
      </div>
      <div class="text-center text-sm text-secondary space-y-1 pt-2">
        <p>连续签到: <span class="font-bold text-accent">{{ store.consecutiveDays }}</span> 天</p>
        <p>
          月卡状态:
          <span class="font-bold text-accent">
            {{ store.monthlyCard.状态 === '未激活' ? '未激活' : `激活中 (剩余${store.monthlyCard.剩余天数}天)` }}
          </span>
          <button
            v-if="store.monthlyCard.状态 === '未激活'"
            @click="store.activateMonthlyCard"
            class="text-xs ml-2 px-2 py-0.5 rounded bg-accent/20 hover:bg-accent/40 text-accent transition-colors"
            title="向AI询问激活月卡的条件"
          >
            激活
          </button>
        </p>
      </div>
      <button
        @click="store.signIn"
        class="btn-primary w-full"
        :disabled="store.hasSignedInToday"
      >
        <i class="fas fa-calendar-check mr-2"></i>
        {{ store.hasSignedInToday ? '今日已签到' : '今日签到' }}
      </button>
      <button
        @click="showRetroactivePanel = !showRetroactivePanel"
        class="btn-secondary w-full mt-2"
      >
        <i class="fas fa-undo mr-2"></i>
        {{ showRetroactivePanel ? '关闭补签' : '打开补签' }}
      </button>
      <RetroactiveSignInPanel v-if="showRetroactivePanel" :test-sign-in-store="store" :test-item-store="props.testItemStore" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSignInStore } from '../../stores/systems/signInStore';
import RetroactiveSignInPanel from './RetroactiveSignInPanel.vue';

const props = defineProps({
 testSignInStore: {
   type: Object,
   required: false,
 },
 testItemStore: {
   type: Object,
   required: false,
 }
});

const store = props.testSignInStore || useSignInStore();
const showRetroactivePanel = ref(false);

interface CalendarDay {
  day: number;
  isToday: boolean;
  isSignedIn: boolean;
}

const getDayClasses = (day: CalendarDay) => {
  let classes = 'w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-300 ';
  if (day.isToday) {
    classes += 'font-bold ring-2 ring-accent ';
    classes += day.isSignedIn ? 'bg-accent/50 text-white ' : 'bg-accent/30 text-accent ';
  } else {
    classes += day.isSignedIn ? 'bg-green-500/50 text-white ' : 'bg-secondary/50 ';
  }
  return classes;
};

const getDayTitle = (day: CalendarDay) => {
  return `第${day.day}天：${day.isSignedIn ? '已签到' : '未签到'}`;
};
</script>
