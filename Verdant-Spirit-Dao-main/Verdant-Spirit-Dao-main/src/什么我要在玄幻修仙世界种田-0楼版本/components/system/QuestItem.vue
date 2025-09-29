<template>
  <li
    class="p-3 bg-main/50 rounded-lg quest-item"
    :class="`status-${quest.状态}`"
    :data-quest-name="quest.名称.toLowerCase()"
    :data-testid="`quest-${quest.id}`"
  >
    <div class="font-semibold text-primary">{{ quest.名称 }}</div>
    <p class="text-sm text-secondary mt-1">{{ quest.描述 }}</p>
    
    <!-- Objectives, Progress, Conditions, Rewards -->
    <div v-if="shouldShowDetails" class="mt-2">
        <!-- Progress Bars -->
        <template v-if="progressBars.length > 0">
            <div v-for="(p, index) in progressBars" :key="index" class="mt-2">
                <div class="flex justify-between items-center mb-1 text-xs font-mono text-secondary">
                    <span>{{ p.label || '进度' }}</span>
                    <span>{{ p.text || `${p.value ?? 0} / ${p.max ?? 0}` }}</span>
                </div>
                <div class="progress-bar-bg w-full rounded-full h-1.5">
                    <div class="progress-bar-fg bg-accent h-1.5 rounded-full" :style="{ width: `${(p.max ?? 0) > 0 ? ((p.value ?? 0) / (p.max as number)) * 100 : 0}%` }"></div>
                </div>
            </div>
        </template>

        <!-- Objectives List -->
        <ul v-if="objectives.length > 0" class="space-y-1 mt-2 text-xs list-disc list-inside pl-2">
            <li v-for="(obj, index) in objectives" :key="index" :class="obj.完成 ? 'text-green-400 line-through' : 'text-secondary'">
                {{ obj.描述 }}
            </li>
        </ul>

        <!-- Conditions -->
        <ul v-if="quest.条件 && quest.条件.length > 0" class="space-y-1 mt-2 text-xs list-inside pl-2">
            <li v-for="(cond, index) in quest.条件" :key="index" class="text-yellow-400/80">
                <i class="fas fa-exclamation-triangle fa-fw mr-1"></i>{{ cond }}
            </li>
        </ul>

        <!-- Rewards -->
        <div v-if="rewards.length > 0" class="mt-2 pt-2 border-t border-dim/50">
            <h5 class="text-xs font-semibold text-green-400/90 mb-1"><i class="fas fa-gift fa-fw mr-1"></i>奖励</h5>
            <ul class="space-y-1 text-xs list-disc list-inside pl-2">
                <li v-for="(reward, index) in rewards" :key="index" class="text-secondary">
                    {{ formatReward(reward) }}
                </li>
            </ul>
        </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue';
import type { PropType } from 'vue';
import type { Quest } from '../../stores/systems/questStore';

const props = defineProps({
  quest: {
    type: Object as PropType<Quest>,
    required: true,
  },
});

const { quest } = toRefs(props);

//console.log("[DEBUG Quest] Quest now has:",quest.value)

const shouldShowDetails = computed(() => {
    return quest.value.状态 === '进行中' || quest.value.状态 === '未完成';
});

const objectives = computed(() => {
    const questValue = quest.value;
    // 兼容 '目标' 和 'objectives' 两种键
    const rawObjectives = questValue.objectives || questValue.目标 || [];
    // 确保返回的是一个有效的数组
    return Array.isArray(rawObjectives) ? rawObjectives : [];
});

const progressBars = computed(() => {
    if (!quest.value.进度) return [];
    return Array.isArray(quest.value.进度) ? quest.value.进度 : [quest.value.进度];
});

const rewards = computed(() => {
    if (!quest.value.奖励) return [];
    if (typeof quest.value.奖励 === 'string') return [quest.value.奖励];
    return quest.value.奖励;
});

function formatReward(reward: any): string {
    if (typeof reward === 'string') {
        return reward;
    }
    if (typeof reward === 'object' && reward !== null && reward['名称']) {
        const amount = reward['数量'] ? ` x${reward['数量']}` : '';
        return `${reward['名称']}${amount}`;
    }
    return '';
}
</script>
