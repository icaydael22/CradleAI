import './index.scss';

// Core Modules
import { EventManager } from './core/eventManager';
import { ChatHistoryManager, MessagePage } from './core/history';
import { logger } from './core/logger';
import { PokedexManager } from './core/pokedex';
import { PromptManager } from './core/promptManager';
import { getProcessedStoryText } from './core/regexProcessor';
import { StoryRenderer } from './core/renderer';
import { isRecalculating } from './core/state';
import { recalculateAndApplyState, syncVariables } from './core/stateUpdater';
import { Summarizer } from './core/summarizer';
import { TimeManager } from './core/time';
import { extractJsonFromStatusBar } from './core/utils';
import { clearAllChatVariables, getVariables, initializeState, overwriteAllChatVariables, saveStateSnapshot } from './core/variables';

// UI Initialization Modules
import { marked } from 'marked';
import { createPinia, Pinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue'; // Import the root component
import { triggerAction } from './core/actions';
import { initializePipManager } from './core/pip';
import { emit } from './core/reactiveMessageBus';
import { initializeAllStores, initializeStoreOrchestrator } from './core/storeOrchestrator';
import { getGenesisMessage } from './data/genesisMessages';
import { processTurn as processContextLinkerTurn } from './modules/smartContext/contextLinker';
import { useAppStore } from './stores/app/appStore';
import { useGenerationStore } from './stores/app/generationStore';
import { initializeActionStoreDependencies } from './stores/ui/actionStore';
import { useMainMenuStore } from './stores/ui/mainMenuStore';
import { useSetupStore } from './stores/ui/setupStore';
import { useStoryStore } from './stores/ui/storyStore';
import { useThemeStore } from './stores/ui/themeStore';
import { useWorldStore } from './stores/core/worldStore';

// Declare global variables from script tags
declare const $: any;
declare const tavern_events: any;
declare const iframe_events: any;
declare const getCurrentMessageId: () => number | null;
declare const eventOn: any;
declare const _: any;

// --- Refactored Generation Lifecycle Handlers ---

interface GenerationContext {
  pinia: Pinia;
  historyManager: ChatHistoryManager;
  worldStore?: any; // Allow passing a mock store for testing
  eventLogStore?: any; // Allow passing a mock store for testing
}

/**
 * Creates and manages the handlers for the AI generation lifecycle.
 * This function encapsulates the logic and dependencies for handling generation events.
 * @param context - An object containing dependencies like the Pinia instance and HistoryManager.
 * @returns An object with methods to handle generation events.
 */
export function createGenerationLifecycleHandlers(context: GenerationContext) {
  const { pinia, historyManager, worldStore: testWorldStore, eventLogStore: testEventLogStore } = context;
  let testGenerationStore: any = null; // Variable to hold the store for testing


  /**
   * Injects a mock generation store for testing purposes.
   * This allows tests to control the store instance used by the handlers.
   * @param store - The mock store instance.
   */
  const setTestGenerationStore = (store: any) => {
    if (import.meta.env?.MODE === 'test') {
      testGenerationStore = store;
      //console.log('[DEBUG] testGenerationStore obtained，testGenerationStore：',testGenerationStore.isNewTurn);
    }
  };

  const onGenerationStarted = (generationId: string) => {
    const generationStore = useGenerationStore(pinia);
    if (generationId && generationId.startsWith('secondary-llm-')) return;
    if (generationStore.isAiGenerating || generationStore.isSecondaryLlmRequestActive) return;

    generationStore.isAiGenerating = true;
    useStoryStore(pinia).setGenerationStatus(true);
    if (generationStore.isNewTurn && generationStore.currentTurnSwipes.length === 0) {
      generationStore.currentTurnSwipes = [];
    }
    generationStore.addSwipe('');
    generationStore.currentSwipeIndex = generationStore.currentTurnSwipes.length - 1;
  };

  const onStreamTokenReceived = async (fullText: string, generationId: string) => {
    const generationStore = useGenerationStore(pinia);
    if (generationId && generationId.startsWith('secondary-llm-')) return;
    if (!generationStore.isAiGenerating) {
      onGenerationStarted(generationId);
    }
    generationStore.updateLastSwipe(fullText);
    useStoryStore(pinia).updateStreamedContent(fullText);
  };

  const saveMessageToHistory = async (generationStore: any): Promise<MessagePage | null> => {
    const finalContent = _.last(generationStore.currentTurnSwipes);
    if (finalContent === undefined) return null;

    try {
      // This will now correctly call the mock historyManager in tests
      const messageId = await historyManager.addAssistantMessagePage(finalContent);
      return { id: messageId, role: 'assistant', content: finalContent, timestamp: Date.now(), isValid: true };
    } catch (error) {
      logger('error', 'Index:saveMessageToHistory', 'Failed to save message to history.', { error });
      return null;
    }
  };

  const saveStateAndCreateSnapshotIfNeeded = async (messageId: string) => {
    // In a test environment, we don't want to deal with snapshots unless specifically testing for it.
    if (import.meta.env?.MODE === 'test') {
      return;
    }
    const turnIndex = historyManager.getMessageIndex(messageId);
    if (turnIndex > 0 && turnIndex % 20 === 0) {
      logger('info', 'Index', `Turn ${turnIndex} reached. Creating L2 state snapshot...`);
      const snapshot = _.cloneDeep(getVariables({ type: 'chat' }));
      if (snapshot) {
        await saveStateSnapshot(messageId, snapshot, historyManager);
      } else {
        logger('error', 'Index', `Failed to create snapshot for turn ${turnIndex}: recalculated state was null.`);
      }
    }
  };

  const onGenerationEnded = async (finalMessage: string, generationId: string): Promise<any | null> => {
    //console.log(`[DEBUG] onGenerationEnded triggered. generationId: "${generationId}"`);
    let generationStore = useGenerationStore(pinia);
    const storyStore = useStoryStore(pinia);
    //console.log('[DEBUG] storyStore obtained.');
    // MODIFICATION: In a test environment, directly use the mocked store to ensure consistency.
    //console.log("import.meta:",import.meta.env?.MODE === 'test')
    if (import.meta.env?.MODE === 'test' && testGenerationStore) {
      generationStore = testGenerationStore;
      //console.log('[DEBUG] testGenerationStore obtained，generationStore：',generationStore.isNewTurn);
    }
    //console.log('[DEBUG] generationStore obtained. isNewTurn:', generationStore.isNewTurn, 'isAiGenerating:', generationStore.isAiGenerating);
    const appStore = useAppStore(pinia);
    //console.log('[DEBUG] appStore obtained.');

    if (generationId && (generationId.startsWith('secondary-llm-') || generationId.startsWith('world-gen-'))) {
      //console.log(`[DEBUG] Ignoring response from special generationId: ${generationId}.`);
      logger('info', 'Index:onGenerationEnded', `Ignoring response from ${generationId}.`);
      return null;
    }

    //console.log('[DEBUG] Checking generation status...');
    if (!generationStore.isAiGenerating || generationStore.isSecondaryLlmRequestActive) {
      //console.log('[DEBUG] Generation check FAILED. isAiGenerating:', generationStore.isAiGenerating, 'isSecondaryLlmRequestActive:', generationStore.isSecondaryLlmRequestActive);
      return null;
    }
    //console.log('[DEBUG] Generation check PASSED.');

    const processedFinalMessage = getProcessedStoryText(finalMessage);
    //console.log('[DEBUG] Message processed. Calling updateLastSwipe...');
    // FIX: Ensure there's a swipe to update, especially in test environments
    if (generationStore.currentTurnSwipes.length === 0) {
      generationStore.addSwipe(processedFinalMessage);
    } else {
      generationStore.updateLastSwipe(processedFinalMessage);
    }
    //console.log('[DEBUG] updateLastSwipe finished.');

    //console.log('[DEBUG] Saving message to history...');
    if (generationStore.isNewTurn) {
      const jsonString = extractJsonFromStatusBar(processedFinalMessage);
      if (!jsonString) {
        logger('warn', 'Index:onGenerationEnded', 'No statusbar found in the new turn message. Aborting save.');
        storyStore.setHasError(true);
        generationStore.isAiGenerating = false;
        generationStore.removeLastSwipe(); // 移除无效的生成内容
        return null;
      }

      try {
        JSON.parse(jsonString); // 仅作校验，不赋值
      } catch (error) {
        logger('error', 'Index:onGenerationEnded', 'Failed to parse statusbar JSON. Aborting save.', { error, jsonString });
        storyStore.setHasError(true);
        generationStore.isAiGenerating = false;
        generationStore.removeLastSwipe(); // 移除无效的生成内容
        return null;
      }
    }

    const savedMessage = await saveMessageToHistory(generationStore);
    if (!savedMessage) {
      generationStore.isAiGenerating = false;
      return null;
    }

    if (generationStore.isNewTurn) {
      const jsonString = extractJsonFromStatusBar(savedMessage.content)!; // We already validated this
      try {
        const parsedJson = JSON.parse(jsonString);
        if (import.meta.env?.MODE === 'test') {
          await syncVariables(
            parsedJson,
            savedMessage.id,
            testWorldStore,
            testEventLogStore
          );
        } else {
          await syncVariables(parsedJson, savedMessage.id);
        }
        await saveStateAndCreateSnapshotIfNeeded(savedMessage.id);
        storyStore.setHasError(false);
        return parsedJson;
      } catch (error) {
        logger('error', 'Index:onGenerationEnded', 'Failed to sync state for new turn, though JSON was valid.', { error, jsonString });
        storyStore.setHasError(true);
        // Even if sync fails, the message is saved. This might need manual correction.
        return null;
      }
    } else {
      try {
        isRecalculating.value = true;
        await recalculateAndApplyState(historyManager, savedMessage.id);
        const { useSmartContextStore } = await import('./stores/modules/smartContextStore');
        const smartContextStore = useSmartContextStore();
        const messagesToReplay = historyManager.getActiveMessagesUntil(savedMessage.id);
        if (messagesToReplay) {
          smartContextStore.rebuildStateFromHistory(messagesToReplay);
        }
        await saveStateAndCreateSnapshotIfNeeded(savedMessage.id);
        isRecalculating.value = false;
        emit('variablesSynced', undefined);
        storyStore.setHasError(false);
      } catch (error) {
        logger('error', 'Index:onGenerationEnded', 'Failed to recalculate state for a new swipe.', { error });
        storyStore.setHasError(true);
      }
    }

    generationStore.isAiGenerating = false;
    if (generationStore.isNewTurn) {
      generationStore.isNewTurn = false;
    }

    appStore.signalCoreStateReady();

    // 显式发射UI更新事件
    const eventManager = (window as any).eventManager;
    if (eventManager) {
      eventManager.emit('uiShouldUpdate');
    }

    try {
      await processContextLinkerTurn();
    } catch (error) {
      logger('error', 'ContextLinker', 'processTurn failed', error);
    }
  };

  const onGenerationStopped = async () => {
    const generationStore = useGenerationStore(pinia);
    if (generationStore.isSecondaryLlmRequestActive) {
      logger('info', 'Index:onGenerationStopped', 'Generation stopped event ignored for secondary LLM request.');
      return;
    }
    const partialMessage = _.last(generationStore.currentTurnSwipes) ?? '';
    await onGenerationEnded(partialMessage, 'main-stopped');
  };

  return {
    onGenerationStarted,
    onStreamTokenReceived,
    onGenerationEnded,
    onGenerationStopped,
    setTestGenerationStore, // Expose the new method
  };
}


// Main application entry point
(async () => {
  // 0. Initialize Pinia and Stores for early access
  const pinia = createPinia();
  const themeStore = useThemeStore(pinia);
  themeStore.initializeTheme();

  // Initialize Picture-in-Picture Manager
  initializePipManager(pinia);

  // 1. Initial Configuration
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // 2. State Initialization
  const appStore = useAppStore(pinia);
  appStore.floorId = getCurrentMessageId() ?? 0;
  logger('info', 'Index', `Initialized. Operating on floor_id: ${appStore.floorId}`);

  // 5. Core Component Initialization
  const historyManager = new ChatHistoryManager();
  const pokedexManager = new PokedexManager();
  const eventManager = new EventManager(pokedexManager); // 创建 EventManager 实例
  // @ts-ignore
  window.pokedexManager = pokedexManager; // Expose instance globally for stores
  // @ts-ignore
  window.eventManager = eventManager; // Expose instance globally
  const timeManager = new TimeManager();
  const promptManager = new PromptManager(pokedexManager);

  await historyManager.loadHistory(); // Ensure history is loaded before rendering

  const summarizer = new Summarizer(historyManager);
  const storyRenderer = new StoryRenderer(historyManager, pokedexManager, timeManager);

  // @ts-ignore
  window.storyRenderer = storyRenderer;
  // @ts-ignore
  window.promptManager = promptManager;
  // @ts-ignore
  window.chatHistoryManager = historyManager;

  // 6. UI Initialization & Mounting
  const app = createApp(App);
  app.use(pinia);

  // Initialize the new store orchestrator layer BEFORE mounting the app
  initializeStoreOrchestrator();

  // Dynamically adjust iframe height to fill available vertical space
  const adjustIframeHeight = () => {
    const iframe = window.frameElement as HTMLIFrameElement;
    if (!iframe) return;

    const parentDoc = window.parent.document;
    if (parentDoc.fullscreenElement && parentDoc.fullscreenElement === iframe.parentElement) {
      iframe.style.height = '100%';
      document.body.style.height = '100%';
      return;
    }

    const rect = iframe.getBoundingClientRect();
    const availableHeight = window.parent.innerHeight - rect.top - 10;

    if (availableHeight > 0) {
      const newHeight = `${availableHeight}px`;
      iframe.style.height = newHeight;
      document.body.style.height = newHeight;
    }
  };

  adjustIframeHeight();
  window.parent.addEventListener('resize', adjustIframeHeight);
  window.parent.document.addEventListener('fullscreenchange', adjustIframeHeight);

  await initializeAllStores();

  initializeActionStoreDependencies(storyRenderer, historyManager, summarizer, promptManager, triggerAction);

  const { useActionStore } = await import('./stores/ui/actionStore');
  const actionStore = useActionStore(pinia);
  actionStore.fetchData();

  // @ts-ignore
  window.stores = {
    ...(window.stores || {}),
    story: () => import('./stores/ui/storyStore').then(m => m.useStoryStore(pinia)),
  };

  window.addEventListener('request-main-menu', () => {
    useMainMenuStore(pinia).showMenu();
  });

  window.addEventListener('stateActivationRequested', async (event: any) => {
    const { newMessageId } = event.detail;
    if (newMessageId) {
      isRecalculating.value = true;
      await recalculateAndApplyState(historyManager, newMessageId);
      const { useSmartContextStore } = await import('./stores/modules/smartContextStore');
      const smartContextStore = useSmartContextStore();
      const messagesToReplay = historyManager.getActiveMessagesUntil(newMessageId);
      if (messagesToReplay) {
        smartContextStore.rebuildStateFromHistory(messagesToReplay);
      }
      isRecalculating.value = false;
      emit('variablesSynced', undefined);
      appStore.signalCoreStateReady();
    }
  });

  window.addEventListener('branchChanged', async (event: any) => {
    const { targetMessageId } = event.detail;
    const manager = window.chatHistoryManager as ChatHistoryManager;
    if (targetMessageId && manager) {
      logger('info', 'Index', `Branch change detected. Recalculating state for message ID: ${targetMessageId}`);
      isRecalculating.value = true;
      await recalculateAndApplyState(manager, targetMessageId);
      const { useSmartContextStore } = await import('./stores/modules/smartContextStore');
      const smartContextStore = useSmartContextStore();
      const messagesToReplay = manager.getActiveMessagesUntil(targetMessageId);
      if (messagesToReplay) {
        smartContextStore.rebuildStateFromHistory(messagesToReplay);
      }
      isRecalculating.value = false;
      emit('variablesSynced', undefined);
      appStore.signalCoreStateReady();
    }
  });

  const cleanupIncompleteTurn = async (historyManagerInstance: ChatHistoryManager) => {
    const history = historyManagerInstance.getRawHistory();
    const activeBranch = history.branches[history.activeBranch];
    const turnIndices = Object.keys(activeBranch).map(Number).sort((a, b) => a - b);
    const lastTurnIndex = _.last(turnIndices);

    if (lastTurnIndex === undefined) return;

    const lastTurn = activeBranch[lastTurnIndex];

    if (lastTurn.role === 'user') {
      await historyManagerInstance.deleteTurn(lastTurnIndex);
    }
  };

  const startGame = async (initialState?: Record<string, any>) => {
    logger('info', 'Index:startGame', 'Start game process initiated.', { hasInitialState: !!initialState });
    useMainMenuStore(pinia).hideMenu();
    useSetupStore(pinia).isVisible = false;

    if (initialState) {
      logger('info', 'Index:startGame', 'Starting a new game with initial state.');
      await clearAllChatVariables();
      historyManager.reset();

      await overwriteAllChatVariables(initialState);

      initializeState(initialState);

      const genesisMessage = getGenesisMessage(initialState);
      await historyManager.addAssistantMessagePage(genesisMessage);
      logger('info', 'Index:startGame', `Genesis message added.`);

      // 根据CHAT_FLOW_SPEC，新游戏初始化后需要立即进行一次状态重算，以确保所有store都基于初始状态更新
      const lastMessage = historyManager.getLastAssistantMessage();
      if (lastMessage && lastMessage.id) {
        logger('info', 'Index:startGame', `Recalculating state immediately after genesis for message: ${lastMessage.id}`);
        isRecalculating.value = true;
        await recalculateAndApplyState(historyManager, lastMessage.id);
        isRecalculating.value = false;
        emit('variablesSynced', undefined);
      } else {
        logger('warn', 'Index:startGame', 'Could not find genesis message to trigger initial state recalculation.');
        // 即使找不到消息，也发出信号以尝试继续流程
        emit('variablesSynced', undefined);
      }
    } else {
      logger('info', 'Index:startGame', 'Continuing game. Forcing history reload and full state recalculation.');
      await historyManager.loadHistory();
      await cleanupIncompleteTurn(historyManager);

      const messages = historyManager.getMessagesForPrompt();
      const lastMessage = _.findLast(messages, (m: MessagePage) => m.role === 'assistant');

      if (lastMessage && lastMessage.id) {
        logger('info', 'Index:startGame', `Recalculating state from the true last message: ${lastMessage.id}`);
        isRecalculating.value = true;
        await recalculateAndApplyState(historyManager, lastMessage.id);
        isRecalculating.value = false;
        emit('variablesSynced', undefined);
      } else {
        logger('warn', 'Index:startGame', 'No assistant messages found to recalculate state from.');
      }
    }

    logger('info', 'Index:startGame', 'Signaling that core state is ready.');
    appStore.signalCoreStateReady();

    const storyStore = useStoryStore(pinia);
    await storyStore.fetchData();
  };
  // @ts-ignore
  window.startGame = startGame;

  const actionAfterReload = sessionStorage.getItem('gameStateAfterReload');
  sessionStorage.removeItem('gameStateAfterReload');

  if (actionAfterReload === 'setup') {
    useSetupStore(pinia).showSetup();
  } else if (actionAfterReload === 'game') {
    const currentVars = await getVariables({ type: 'chat' });
    if (currentVars && currentVars.世界 && currentVars.世界.初始状态) {
      initializeState(currentVars.世界.初始状态);
    }
    await cleanupIncompleteTurn(historyManager);
    await startGame();
  } else {
    const mainMenuStore = useMainMenuStore(pinia);
    
    // 重新定义“继续游戏”的检查逻辑，使其更加健壮
    const checkCanContinue = async () => {
      try {
        const currentVars = await getVariables({ type: 'chat' });
        const hasInitialState = _.get(currentVars, '世界.初始状态') && _.get(currentVars, '备份.初始状态备份');
        const hasHistory = historyManager.getLastAssistantMessage() !== null;

        if (hasInitialState && hasHistory) {
          logger('info', 'Index', 'Valid save data found. Enabling "Continue" button.');
          initializeState(currentVars.世界.初始状态);
          await cleanupIncompleteTurn(historyManager);
          return true;
        } else {
          logger('warn', 'Index', 'No valid save data found. Disabling "Continue" button.', { hasInitialState, hasHistory });
          return false;
        }
      } catch (error) {
        logger('error', 'Index', 'Error while checking for continuable game state.', error);
        return false;
      }
    };

    const canContinue = await checkCanContinue();
    mainMenuStore.updateCanContinue(canContinue);
    mainMenuStore.showMenu();
  }

  // Create and bind lifecycle handlers
  const generationHandlers = createGenerationLifecycleHandlers({ pinia, historyManager });
  eventOn(iframe_events.GENERATION_STARTED, generationHandlers.onGenerationStarted);
  eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, generationHandlers.onStreamTokenReceived);
  eventOn(iframe_events.GENERATION_ENDED, generationHandlers.onGenerationEnded);
  eventOn(tavern_events.GENERATION_STOPPED, generationHandlers.onGenerationStopped);

  // Mount the app AFTER all state has been loaded and stores are ready.
  app.mount('#app');
  logger('info', 'Vue', 'Single root Vue app has been mounted.');
})();
