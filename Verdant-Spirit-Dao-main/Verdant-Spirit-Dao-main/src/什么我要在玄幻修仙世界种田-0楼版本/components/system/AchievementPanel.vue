<template>
  <div v-if="store.achievementData" id="achievement-system-panel"
    class="bg-main rounded-xl border border-dim p-3.5 shadow-sm card-hover theme-transition">
    <div class="flex justify-between items-center mb-3 pb-2 border-b border-dim">
      <h3 class="font-bold text-lg theme-transition">
        🏆 成就系统
      </h3>
      <div class="font-bold text-accent text-lg" title="成就点数">
        {{ store.points }} <i class="fas fa-star text-xs"></i>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-dim mb-3 achievement-tabs">
      <button class="achievement-tab-btn flex-1 p-2 text-sm font-semibold transition-colors"
        :class="{ 'active': activeTab === 'achievements' }" aria-label="成就" @click="activeTab = 'achievements'">
        <i class="fas fa-trophy mr-1.5"></i> 成就
      </button>
      <button class="achievement-tab-btn flex-1 p-2 text-sm font-semibold transition-colors"
        :class="{ 'active': activeTab === 'rewards' }" aria-label="奖励" @click="activeTab = 'rewards'">
        <i class="fas fa-gift mr-1.5"></i> 奖励
      </button>
    </div>

    <!-- Tab Content -->
    <div class="achievement-tabs-content">
      <div id="achievement-tab-achievements" class="achievement-tab-pane"
        :class="{ 'active': activeTab === 'achievements' }">
        <ul v-if="store.completedAchievements.length > 0" class="space-y-3">
          <li v-for="ach in store.completedAchievements" :key="ach.id"
            class="clickable-item rounded-lg p-3 hover:bg-secondary transition-colors" @click="showDetails(ach)">
            <div class="flex items-center">
              <i class="fas fa-trophy text-yellow-400 mr-3 fa-lg"></i>
              <p class="font-semibold text-primary">{{ ach.名称 }}</p>
            </div>
            <p class="text-sm text-secondary pl-8 mt-1">{{ ach.描述 }}</p>
          </li>
        </ul>
        <p v-else class="text-secondary text-sm italic p-4 text-center">尚未解锁任何成就。</p>
      </div>
      <div id="achievement-tab-rewards" class="achievement-tab-pane" :class="{ 'active': activeTab === 'rewards' }">
        <ul v-if="store.rewards.length > 0" class="space-y-3">
          <li v-for="reward in store.rewards" :key="reward.id" class="p-3 bg-main opacity-50 rounded-lg">
            <div class="flex justify-between items-start">
              <div class="flex-grow">
                <p class="font-semibold text-primary">{{ reward.名称 }}</p>
                <p class="text-sm text-secondary mt-1">{{ reward.描述 }}</p>
                <p class="text-xs text-secondary mt-1">库存: {{ reward.库存 }}</p>
              </div>
              <div class="text-right ml-4 flex-shrink-0">
                <div class="font-bold text-accent mb-2">{{ reward.消耗点数 }} <i class="fas fa-star text-xs"></i></div>
                <button class="redeem-btn btn-sm btn-primary" :disabled="store.points < reward.消耗点数 || reward.库存 <= 0"
                  @click="store.redeemReward(reward.id)">
                  {{ reward.库存 <= 0 ? '无货' : '兑换' }} </button>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="text-secondary text-sm italic p-4 text-center">当前没有可兑换的奖励。</p>
        <div class="mt-4 pt-3 border-t border-dim text-center">
          <button id="refresh-rewards-btn" class="btn-secondary w-full sm:w-auto" :disabled="!store.canRefresh"
            @click="store.refreshRewards()">
            <i class="fas fa-sync-alt mr-2"></i> {{ store.canRefresh ? '刷新奖励列表' : `还需 ${store.daysUntilRefresh} 天` }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="text-center p-4 text-secondary">
    正在加载成就数据...
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAchievementStore } from '../../stores/systems/achievementStore';
import { useDetailsStore } from '../../stores/ui/detailsStore';

const props = defineProps({
  testStore: {
    type: Object,
    required: false,
  }
});

const store = props.testStore || useAchievementStore();
const detailsStore = useDetailsStore();
const activeTab = ref('achievements');

function showDetails(achievement: any) {
  detailsStore.showDetails(achievement);
}
</script>

<style scoped>
.achievement-tab-pane {
  display: none;
}
.achievement-tab-pane.active {
  display: block;
}
.achievement-tab-btn.active {
  color: var(--accent-color);
  border-bottom: 2px solid var(--accent-color);
}
</style>
