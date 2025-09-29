import { defineStore } from 'pinia';
import { ref } from 'vue';

export type SidePanelTab = 'team' | 'relations' | 'pokedex' | 'world' | 'system';

export const useSidePanelStore = defineStore('sidePanel', () => {
  const activeTab = ref<SidePanelTab>('team');
  const isMobilePanelOpen = ref(false);

  function setActiveTab(tab: SidePanelTab) {
    activeTab.value = tab;
  }

  function toggleMobilePanel() {
    isMobilePanelOpen.value = !isMobilePanelOpen.value;
  }

  function openMobilePanel() {
    isMobilePanelOpen.value = true;
  }

  function closeMobilePanel() {
    isMobilePanelOpen.value = false;
  }

  return {
    activeTab,
    setActiveTab,
    isMobilePanelOpen,
    toggleMobilePanel,
    openMobilePanel,
    closeMobilePanel,
  };
});
