<template>
  <div class="panel-box flex flex-col">
    <!-- 标签页导航 -->
    <div class="flex border-b border-dim">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['side-tab-btn', { active: store.activeTab === tab.id }]"
        @click="store.setActiveTab(tab.id)"
      >
        <i :class="tab.icon"></i>
      </button>
    </div>

    <!-- 标签页内容 -->
    <div class="side-panel-body flex-grow">
      <!-- 队伍标签页 -->
      <div v-show="store.activeTab === 'team'" class="h-full">
        <TeamTab />
      </div>
      <!-- 关系标签页 -->
      <div v-show="store.activeTab === 'relations'" class="h-full">
        <RelationsTab />
      </div>
      <!-- 图鉴标签页 -->
      <div v-show="store.activeTab === 'pokedex'" class="h-full">
        <PokedexTab />
      </div>
      <!-- 世界标签页 -->
      <div v-show="store.activeTab === 'world'" class="h-full">
        <WorldTab />
      </div>
      <!-- 系统标签页 -->
      <div v-show="store.activeTab === 'system'" class="h-full">
        <SystemTab />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSidePanelStore, type SidePanelTab } from '../../stores/ui/sidePanelStore';
import TeamTab from '../team/TeamTab.vue';
import RelationsTab from '../team/RelationsTab.vue';
import PokedexTab from '../pokedex/PokedexTab.vue';
import WorldTab from '../world/WorldTab.vue';
import SystemTab from '../system/SystemTab.vue';

const store = useSidePanelStore();

const tabs: { id: SidePanelTab; icon: string; name: string }[] = [
  { id: 'team', icon: 'fas fa-users', name: '队伍' },
  { id: 'relations', icon: 'fas fa-users-cog', name: '关系' },
  { id: 'pokedex', icon: 'fas fa-book', name: '图鉴' },
  { id: 'world', icon: 'fas fa-globe-asia', name: '世界' },
  { id: 'system', icon: 'fas fa-cogs', name: '系统' },
];
</script>
