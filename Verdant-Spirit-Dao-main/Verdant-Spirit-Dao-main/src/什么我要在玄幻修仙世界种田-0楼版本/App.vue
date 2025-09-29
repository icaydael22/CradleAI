<template>
  <div id="app-container" class="font-sans text-text bg-main min-h-screen flex flex-col">
    <!-- Loading Screen Overlay -->
    <LoadingScreen v-if="generationStore.isGeneratingWorld" />

    <!-- Setup Screen Overlay -->
    <SetupScreen v-else-if="setupStore.isVisible" />

    <!-- Main Menu Overlay -->
    <MainMenu v-else-if="mainMenuStore.isVisible" @new-game="setupStore.showSetup()" @continue-game="logAndContinueGame" />

    <!-- Game Content -->
    <template v-else>
      <!-- Top Bar -->
      <TopBar />

      <!-- Main Content Grid -->
      <div id="main-content-grid" class="flex-grow flex overflow-hidden">
        <!-- Left Panel (Story) -->
        <div id="left-panel" class="flex-grow flex flex-col overflow-hidden">
          <StoryPanel />
          <ActionPanel />
        </div>

        <!-- Resizer -->
        <div id="resizer" class="w-2 cursor-col-resize bg-dim-dark hover:bg-accent transition-colors"></div>

        <!-- Right Panel (Side Panel) -->
        <div id="side-panel-vue" class="hidden lg:flex lg:flex-col w-96 border-l border-dim overflow-hidden">
          <DesktopSidePanel />
        </div>
      </div>

      <!-- Mobile Navigation -->
      <SidePanel class="lg:hidden" />

      <!-- Modals -->
      <DetailsModal />
      <MenuModal />
      <PokedexManagerModal />
      <VersionModal />
      <DebugModal />
      <HistoryModal />
      <SettingsModal />
      <ConfirmModal />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useMainMenuStore } from './stores/ui/mainMenuStore';
import { useSetupStore } from './stores/ui/setupStore';
import { useGenerationStore } from './stores/app/generationStore';
import { logger } from './core/logger';
import { checkSecondaryLlmConfig } from './core/ui-checks';

// Import all components to be used in the template
import LoadingScreen from './components/system/LoadingScreen.vue';
import ActionPanel from './components/action/ActionPanel.vue';
import MainMenu from './components/MainMenu.vue';
import SetupScreen from './components/setup/SetupScreen.vue';
import TopBar from './components/TopBar.vue';
import StoryPanel from './components/story/StoryPanel.vue';
import DesktopSidePanel from './components/sidepanel/DesktopSidePanel.vue';
import SidePanel from './components/sidepanel/SidePanel.vue';
import DetailsModal from './components/modals/DetailsModal.vue';
import MenuModal from './components/modals/MenuModal.vue';
import PokedexManagerModal from './components/modals/PokedexManagerModal.vue';
import VersionModal from './components/modals/VersionModal.vue';
import DebugModal from './components/debug/DebugModal.vue';
import HistoryModal from './components/modals/HistoryModal.vue';
import SettingsModal from './components/modals/SettingsModal.vue';
import ConfirmModal from './components/modals/ConfirmModal.vue';

const mainMenuStore = useMainMenuStore();
const setupStore = useSetupStore();
const generationStore = useGenerationStore();


function logAndContinueGame() {
  logger('info', 'App.vue', 'continue-game event received. Calling window.startGame to load and recalculate state.');
  // @ts-ignore
  window.startGame();
}

// Watch for the main menu to close, which means the game is starting.
// This is the perfect time to run initial checks.
watch(() => mainMenuStore.isVisible, (isVisible, wasVisible) => {
  if (wasVisible && !isVisible) {
    // We've just exited the main menu
    logger('info', 'App.vue', 'Main menu closed, running initial UI checks.');
    checkSecondaryLlmConfig();
  }
});

onMounted(() => {
  // Draggable Resizer Logic
  const resizer = document.getElementById('resizer');
  const leftPanel = document.getElementById('left-panel');
  const rightPanel = document.getElementById('side-panel-vue');

  if (!resizer || !leftPanel || !rightPanel) {
    console.warn('Resizer elements not found, skipping initialization.');
    return;
  }

  let isResizing = false;

  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const container = document.getElementById('main-content-grid');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const leftPanelWidth = e.clientX - containerRect.left;
    const rightPanelWidth = containerRect.right - e.clientX;

    // Set minimum panel widths to prevent them from collapsing
    if (leftPanelWidth > 200 && rightPanelWidth > 200) {
      leftPanel.style.width = `${leftPanelWidth}px`;
      // Use flex-grow for the right panel to be responsive
      // rightPanel.style.width = `${rightPanelWidth}px`; 
    }
  };

  const onMouseUp = () => {
    isResizing = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
});
</script>

<style>
/* Add any global styles specific to the App component here */
#app-container {
  height: 100vh;
}
</style>
