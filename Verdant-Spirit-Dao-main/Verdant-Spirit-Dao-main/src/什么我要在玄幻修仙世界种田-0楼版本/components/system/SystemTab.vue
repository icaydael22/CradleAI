<template>
  <div>
    <div v-if="systemStore.activeSystem === '任务系统'">
      <QuestTab />
    </div>
    <div v-else-if="systemStore.activeSystem === '签到系统'">
      <SignInPanel />
    </div>
    <div v-else-if="systemStore.activeSystem === '以物换物'">
      <BarterPanel />
    </div>
    <div v-else-if="systemStore.activeSystem === '成就系统'">
      <AchievementPanel />
    </div>
    <div v-else-if="systemStore.activeSystem === '技能面板'">
      <SkillPanel />
    </div>
    <!-- 以后可以添加其他系统的 v-if 或动态组件 -->
    <div v-else-if="systemStore.activeSystem && systemStore.activeSystem !== '无' && systemStore.activeSystem !== '无系统'">
      <div class="text-center py-4 text-secondary theme-transition italic">
        <i class="fas fa-info-circle mr-1"></i>系统 "{{ systemStore.activeSystem }}" 由 Vue 组件渲染。
      </div>
    </div>
    <div v-else>
      <div class="text-center py-4 text-secondary theme-transition italic">
        <i class="fas fa-info-circle mr-1"></i>未绑定系统
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAchievementStore } from '../../stores/systems/achievementStore';
import { useBarterStore } from '../../stores/systems/barterStore';
import { useQuestStore } from '../../stores/systems/questStore'; // 导入以确保 store 被初始化
import { useSignInStore } from '../../stores/systems/signInStore';
import { useSkillStore } from '../../stores/systems/skillStore';
import { useSystemStore } from '../../stores/ui/systemStore';
import AchievementPanel from './AchievementPanel.vue';
import BarterPanel from './BarterPanel.vue';
import QuestTab from './QuestTab.vue';
import SignInPanel from './SignInPanel.vue';
import SkillPanel from './SkillPanel.vue';

// 初始化所有系统 store，确保它们能够开始监听事件
useQuestStore();
useSignInStore();
useBarterStore();
useAchievementStore();
useSkillStore();

const systemStore = useSystemStore();
</script>
