<template>
  <div id="barter-system-container" class="bg-main rounded-xl border border-dim p-4 shadow-sm card-hover theme-transition">
    <div class="flex justify-between items-center mb-3 pb-2 border-b border-dim">
      <h3 class="font-bold text-lg theme-transition flex items-center">
        <i class="fas fa-store mr-2 text-accent"></i> {{ store.systemName }}
      </h3>
      <button @click="store.refreshItems" :disabled="!store.canRefresh" class="text-sm text-accent hover:text-accent-hover transition-colors p-1 rounded hover:bg-secondary disabled:text-secondary disabled:cursor-not-allowed" :title="store.canRefresh ? '刷新可换取物品' : '今日已刷新'">
        <i class="fas fa-sync-alt"></i> {{ store.canRefresh ? '刷新' : '明日再来' }}
      </button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div>
        <h4 class="font-semibold text-base mb-2 text-primary/80">我的物品</h4>
        <div class="bg-secondary/30 rounded-lg p-3 shadow-inner max-h-48 overflow-y-auto">
          <ul v-if="store.myItems.length > 0" class="space-y-2 text-sm" data-testid="my-items-list">
            <li v-for="item in store.myItems" :key="item.名称" class="flex items-center p-2 rounded-md bg-main/30">
              <input type="checkbox" :checked="store.mySelectedItems[item.名称]" @change="store.toggleMyItemSelection(item.名称)" class="mr-3 form-checkbox">
              <div class="flex-grow">
                <span class="font-semibold text-primary">{{ item.名称 }}</span>
                <span class="text-xs text-secondary ml-2">(价值: {{ store.getItemValue(item) }})</span>
              </div>
              <span class="font-mono text-accent font-semibold">x {{ item.数量 || 1 }}</span>
            </li>
          </ul>
          <p v-else class="text-secondary text-sm italic text-center p-4">你没有可用于交换的物品。</p>
        </div>
      </div>
      <div>
        <h4 class="font-semibold text-base mb-2 text-primary/80">可换取的物品</h4>
        <div class="bg-secondary/30 rounded-lg p-3 shadow-inner max-h-60 overflow-y-auto">
          <ul v-if="store.availableItems.length > 0" class="space-y-2 text-sm" data-testid="trader-items-list">
            <li v-for="item in store.availableItems" :key="item.名称" class="flex items-start p-2 rounded-md bg-main/30">
              <input type="checkbox" :checked="!!store.traderSelectedItems[item.名称]" @change="store.toggleTraderItemSelection(item.名称)" class="mr-3 mt-1 form-checkbox">
              <div class="flex-grow">
                <div class="flex justify-between items-center">
                  <span class="font-semibold text-primary">{{ item.名称 }}</span>
                  <span class="font-mono text-accent font-semibold">{{ store.getItemValue(item) }} <i class="fas fa-coins text-xs"></i></span>
                </div>
                <p class="text-xs text-secondary mt-1">{{ item.描述 || '暂无描述' }}</p>
                <p class="text-xs text-secondary mt-1">库存: {{ item.库存 }}</p>
              </div>
            </li>
          </ul>
          <p v-else class="text-secondary text-sm italic text-center p-4">当前没有可换取的物品。</p>
        </div>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-dim">
      <h4 class="font-semibold text-base mb-2 text-primary/80">交易详情</h4>
      <div class="bg-secondary/30 rounded-lg p-3 shadow-inner text-sm space-y-2">
        <div class="flex justify-between">
          <span>我方出价:</span>
          <span class="font-bold text-accent">{{ store.myOfferValue }} <i class="fas fa-coins text-xs"></i></span>
        </div>
        <div class="flex justify-between">
          <span>对方要价:</span>
          <span class="font-bold text-primary">{{ store.traderRequestValue }} <i class="fas fa-coins text-xs"></i></span>
        </div>
      </div>
      <button @click="store.executeTrade" :disabled="!store.isTradeBalanced" class="btn-primary w-full mt-3">
        <i class="fas fa-exchange-alt mr-2"></i> 确认交易
      </button>
      <p class="text-center text-xs text-secondary mt-2 h-4">
        <span v-if="!store.isTradeBalanced && store.traderRequestValue > 0">我方出价需大于等于对方要价</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useBarterStore } from '../../stores/systems/barterStore';

const props = defineProps({
  testStore: {
    type: Object,
    required: false,
  }
});

const store = props.testStore || useBarterStore();

onMounted(() => {
  //store.initialize();
});
</script>
