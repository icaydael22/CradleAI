import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '../../core/logger';
import { clearAllChatVariables, overwriteAllChatVariables } from '../../core/variables';
import { useGenerationStore } from '../app/generationStore';
import { useSetupStore } from './setupStore';

export type MainMenuView = 'main' | 'startGame' | 'overview' | 'about';

export const useMainMenuStore = defineStore('mainMenu', () => {
  const generationStore = useGenerationStore();
  const setupStore = useSetupStore();
  const isVisible = ref(true);
  const currentView = ref<MainMenuView>('main');
  const canContinue = ref(false);

  function updateCanContinue(value: boolean) {
    canContinue.value = value;
  }

  function showView(view: MainMenuView) {
    logger('info', 'MainMenuStore', `Switching to view: ${view}`);
    currentView.value = view;
    isVisible.value = true;
  }

  function hideMenu() {
    logger('info', 'mainMenuStore.ts', `hideMenu called. Current isVisible state: ${isVisible.value}. Setting to false.`);
    isVisible.value = false;
    logger('info', 'mainMenuStore.ts', `hideMenu finished. New isVisible state: ${isVisible.value}.`);
  }
  
  function showMenu() {
    logger('info', 'MainMenuStore', 'Showing main menu.');
    currentView.value = 'main';
    isVisible.value = true;
  }

  function backToMain() {
    currentView.value = 'main';
  }

  async function handleNewGame(initialState: Record<string, any>) {
    logger('log', 'MainMenuStore', 'handleNewGame triggered.');
    logger('info', 'MainMenuStore', 'Handling new game start.', initialState);

    // 1. Hide the setup screen
    setupStore.hideSetup();

    // 2. Show the loading screen
    generationStore.isGeneratingWorld = true;

    try {
      // The actual game start logic is now in index.ts's startGame
      // which is exposed on the window object.
      if ((window as any).startGame) {
        await (window as any).startGame(initialState);
      } else {
        logger('error', 'MainMenuStore', 'startGame function not found on window object.');
      }
    } finally {
      // This will be called after startGame completes or if an error occurs.
      // The startGame function itself is responsible for hiding the loading screen on success.
      generationStore.isGeneratingWorld = false;
    }
  }

  async function handleContinueGame() {
    logger('info', 'mainMenuStore.ts', 'handleContinueGame called. Calling hideMenu.');
    hideMenu();
  }

  async function handleLoadGame(saveData: Record<string, any>) {
    try {
      if (typeof saveData !== 'object' || saveData === null) {
        throw new Error('Invalid save file format.');
      }
      // Logic to sanitize old save formats can be added here if needed
      await overwriteAllChatVariables(saveData);
      sessionStorage.setItem('gameStateAfterReload', 'game');
      window.location.reload();
    } catch (error) {
      logger('error', 'MainMenuStore', 'Failed to load save file:', error);
      alert('加载存档失败，文件格式可能不正确。');
    }
  }

  return {
    isVisible,
    currentView,
    canContinue,
    updateCanContinue,
    showView,
    hideMenu,
    showMenu,
    backToMain,
    handleNewGame,
    handleContinueGame,
    handleLoadGame,
  };
});
