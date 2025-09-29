<template>
  <div class="side-tab-content">
    <div v-if="!store.mainCharacter && store.npcs.length === 0" class="text-center py-4 text-secondary">
      <i class="fas fa-info-circle mr-1"></i>没有角色数据
    </div>
    <div v-else class="grid grid-cols-1 gap-4">
      <CharacterCard v-if="store.mainCharacter" :character="store.mainCharacter" :is-main-character="true" />
      <CharacterCard v-for="npc in store.npcs" :key="npc.姓名" :character="npc" :is-main-character="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useTeamStore } from '../../stores/ui/teamStore';
import CharacterCard from './CharacterCard.vue';
import { logger } from '../../core/logger';

const store = useTeamStore();

onMounted(() => {
  logger('info', 'TeamTab', 'Component mounted.', {
    mainCharacter: store.mainCharacter,
    npcs: store.npcs,
  });
});

watch(() => [store.mainCharacter, store.npcs], (newData) => {
  logger('info', 'TeamTab', 'Data from teamStore changed.', {
    mainCharacter: newData[0],
    npcs: newData[1],
  });
}, { deep: true });
</script>
