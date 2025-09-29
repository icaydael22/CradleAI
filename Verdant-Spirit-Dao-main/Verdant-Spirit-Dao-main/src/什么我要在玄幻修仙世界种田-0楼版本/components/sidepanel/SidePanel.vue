<template>
  <div>
    <!-- Overlay -->
    <transition name="fade">
      <div
        v-if="store.isMobilePanelOpen"
        class="fixed inset-0 z-40 bg-opacity-25 backdrop-blur-sm lg:hidden"
        @click="handleOverlayClick"
      ></div>
    </transition>

    <div class="fixed bottom-0 left-0 right-0 z-50 bg-main border-t border-dim lg:hidden">
      <div class="flex justify-around">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['flex-1 py-2 px-1 text-center transition-colors duration-200', store.activeTab === tab.id ? 'text-accent' : 'text-secondary']"
          @click="handleTabClick(tab.id)"
        >
          <i :class="[tab.icon, 'text-xl']"></i>
          <span class="block text-xs mt-1">{{ tab.name }}</span>
        </button>
      </div>
      
      <!-- Mobile Panel Content -->
      <transition name="slide-up">
        <div 
          v-if="store.isMobilePanelOpen" 
          class="absolute bottom-full left-0 right-0 max-h-[70vh] overflow-y-auto bg-main border-t border-dim p-4"
        >
          <component :is="activeTabComponent" />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

const tabComponentMap = {
  team: TeamTab,
  relations: RelationsTab,
  pokedex: PokedexTab,
  world: WorldTab,
  system: SystemTab,
};

const activeTabComponent = computed(() => {
  return tabComponentMap[store.activeTab];
});

function handleTabClick(tabId: SidePanelTab) {
  // If the same tab is clicked again, toggle the panel. Otherwise, just switch tabs.
  if (store.activeTab === tabId) {
    store.toggleMobilePanel();
  } else {
    store.setActiveTab(tabId);
    store.openMobilePanel(); // Ensure panel is open when switching to a new tab
  }
}

function handleOverlayClick() {
  store.toggleMobilePanel();
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
