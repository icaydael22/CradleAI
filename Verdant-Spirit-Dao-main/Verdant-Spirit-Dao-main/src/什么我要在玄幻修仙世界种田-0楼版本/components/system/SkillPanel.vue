<template>
  <div class="bg-main rounded-xl border border-dim p-3.5 shadow-sm card-hover theme-transition">
    <h3 class="font-bold text-lg mb-2 pb-1 border-b border-dim theme-transition">
      ⚙️ 技能面板
    </h3>
    <div v-if="store.hasSkills" class="space-y-4">
      <!-- 功法技能 -->
      <div v-if="store.gongfaSkills.length > 0" data-testid="gongfa-section">
        <h4 class="font-semibold text-accent mb-2 text-sm">功法</h4>
        <div class="space-y-3">
          <div v-for="skill in store.gongfaSkills" :key="skill.id" @click="detailsStore.showDetails(skill)" class="cursor-pointer">
            <div class="flex justify-between items-center mb-1">
              <span class="font-semibold text-primary">{{ skill.名称 }}</span>
              <span class="text-sm font-mono text-secondary">Lv. {{ skill.等级 }}</span>
            </div>
            <div class="progress-bar-bg w-full rounded-full h-2.5">
              <div
                class="progress-bar-fg bg-accent h-2.5 rounded-full"
                :style="{ width: `${(skill.熟练度 / 100) * 100}%` }"
              ></div>
            </div>
            <div class="text-right text-xs font-mono text-secondary mt-1">{{ skill.熟练度 }} / 100</div>
          </div>
        </div>
      </div>

      <!-- 生活技能 -->
      <div v-if="store.shengHuoSkills.length > 0" data-testid="shenghuo-section">
        <h4 class="font-semibold text-green-500 mb-2 text-sm">生活</h4>
        <div class="space-y-3">
          <div v-for="skill in store.shengHuoSkills" :key="skill.id" @click="detailsStore.showDetails(skill)" class="cursor-pointer">
            <div class="flex justify-between items-center mb-1">
              <span class="font-semibold text-primary">{{ skill.名称 }}</span>
              <span class="text-sm font-mono text-secondary">Lv. {{ skill.等级 }}</span>
            </div>
            <div class="progress-bar-bg w-full rounded-full h-2.5">
              <div
                class="progress-bar-fg bg-green-500 h-2.5 rounded-full"
                :style="{ width: `${(skill.熟练度 / 100) * 100}%` }"
              ></div>
            </div>
            <div class="text-right text-xs font-mono text-secondary mt-1">{{ skill.熟练度 }} / 100</div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-secondary text-sm italic">
      尚未学习任何技能。
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSkillStore } from '../../stores/systems/skillStore';
import { useDetailsStore } from '../../stores/ui/detailsStore';

const props = defineProps({
  testSkillStore: {
    type: Object,
    required: false,
  },
});

const store = props.testSkillStore || useSkillStore();
const detailsStore = useDetailsStore();

//console.log("store.skills.value:", store.skills.value)

onMounted(() => {
  //store.initialize();
});
</script>
