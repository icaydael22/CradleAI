import { defineStore } from 'pinia';
import { onMounted, ref, watch } from 'vue';
import type { triggerAction as TriggerActionType } from '../../core/actions';
import type { EventManager } from '../../core/eventManager';
import type { ChatHistoryManager, MessagePage } from '../../core/history';
import { logger } from '../../core/logger';
import { extractJsonFromStatusBar } from '../../core/utils';
import type { PromptManager } from '../../core/promptManager';
import type { StoryRenderer } from '../../core/renderer';
import type { Summarizer } from '../../core/summarizer';
import { useAppStore } from '../app/appStore';

// Forward declaration for core module instances
let storyRenderer: StoryRenderer;
let historyManager: ChatHistoryManager;
let summarizer: Summarizer;
let promptManager: PromptManager;
let triggerActionFn: typeof TriggerActionType;

declare const getVariables: (options: any) => Promise<any>;
declare const _: any;

export function initializeActionStoreDependencies(
  renderer: StoryRenderer,
  history: ChatHistoryManager,
  sum: Summarizer,
  prompt: PromptManager,
  triggerAction: typeof TriggerActionType
) {
  storyRenderer = renderer;
  historyManager = history;
  summarizer = sum;
  promptManager = prompt;
  triggerActionFn = triggerAction;

  logger('info', 'ActionStore', 'Dependencies initialized.');

  // Manually set up the event listener here, as onMounted won't work reliably
  // when the store is initialized outside of a component context.
  const actionStore = useActionStore();
  const eventManager = (window as any).eventManager;
  if (eventManager) {
    const fetchDataCallback = () => actionStore.fetchData();
    eventManager.on('uiShouldUpdate', fetchDataCallback);
    window.addEventListener('stateActivationRequested', fetchDataCallback);
  }
  
  // Trigger initial fetch
  actionStore.fetchData();
}

export const useActionStore = defineStore('action', () => {
  const owner = ref('你');
  const options = ref<string[]>([]);
  const customActionInput = ref('');
  const isCustomActionModalVisible = ref(false);
  const isLoading = ref(false);
  const isTextareaMode = ref(false);

  function toggleInputMode() {
    isTextareaMode.value = !isTextareaMode.value;
  }

  async function fetchData() {
    logger('info', 'ActionStore', 'Fetching action data...');
    try {
      if (!historyManager) {
        logger('warn', 'ActionStore', 'fetchData called before historyManager is initialized.');
        return;
      }
      
      // 修复：直接获取当前激活的最后一条AI消息，而不是从整个列表中查找。
      // 这确保了在切换Swipe后，我们能准确地解析新消息的内容。
      const lastMessage = historyManager.getLastAssistantMessage();

      if (lastMessage && lastMessage.content) {
        logger('log', 'ActionStore', 'Last assistant message content being parsed:', { content: lastMessage.content });
        const statusBarJson = extractJsonFromStatusBar(lastMessage.content);
        if (statusBarJson) {
          try {
            const parsed = JSON.parse(statusBarJson);
            //console.log('[Debug] Parsed JSON object:', parsed);
            const actionData = _.get(parsed, '状态总览.行动选项', _.get(parsed, '行动选项', {}));
            
            if (_.isObject(actionData)) {
              const actionOwner = _.get(actionData, '🧝‍♀️ 行动人', '你');
              const actionOptions = _.get(actionData, '📜 可选行动', []);
              
              if (Array.isArray(actionOptions)) {
                setActions(actionOwner, actionOptions);
                logger('info', 'ActionStore', 'Successfully parsed and set actions.', { owner: actionOwner, options: actionOptions });
              } else {
                throw new Error('"可选行动" is not an array.');
              }
            } else {
              throw new Error('Could not find a valid "行动选项" object.');
            }
          } catch (e) {
            logger('error', 'ActionStore', 'Failed to parse status bar JSON or extract actions.', { error: e, json: statusBarJson });
            setActions('错误', ['解析JSON失败']);
          }
        } else {
          setActions('你', []);
          logger('info', 'ActionStore', 'No statusbar found in the last message. Clearing actions.');
        }
      } else {
        // No last assistant message, clear the options.
        setActions('你', []);
        logger('info', 'ActionStore', 'No last assistant message found. Clearing actions.');
      }
    } catch (error) {
      logger('error', 'ActionStore', 'Failed to fetch or parse action data.', error);
      setActions('错误', ['解析行动选项失败']);
    }
  }

  function setActions(ownerName: string, actionOptions: string[]) {
    owner.value = ownerName;
    options.value = actionOptions;
  }

  function showCustomActionModal() {
    isCustomActionModalVisible.value = true;
  }

  function hideCustomActionModal() {
    isCustomActionModalVisible.value = false;
    customActionInput.value = '';
  }

  async function handleOptionClick(option: string | Event, optionIndex: number) {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
      // Defensive programming: If the first argument is an Event object, it means the event handler
      // was wired incorrectly in the component. We extract the text content from the button that was clicked.
      // This prevents a DataCloneError when the event object is passed down to the history manager.
      const actionText = typeof option === 'string' ? option : (option.currentTarget as HTMLElement)?.textContent ?? '';

      if (!actionText.trim()) {
        console.error('Action text is empty, aborting.');
        return;
      }

      await triggerActionFn(actionText, optionIndex, storyRenderer, historyManager, summarizer, promptManager);
    } finally {
      isLoading.value = false;
    }
  }

  async function handleCustomActionConfirm() {
    if (isLoading.value || !customActionInput.value.trim()) return;
    isLoading.value = true;
    const actionText = customActionInput.value.trim();
    hideCustomActionModal();
    try {
      // For custom actions, the index is typically -1 or handled differently
      await triggerActionFn(actionText, -1, storyRenderer, historyManager, summarizer, promptManager);
    } finally {
      isLoading.value = false;
    }
  }

  async function triggerSystemAction(actionText: string) {
    if (isLoading.value) {
      logger('warn', 'ActionStore', 'System action trigger blocked: an action is already in progress.');
      return;
    }
    isLoading.value = true;
    logger('info', 'ActionStore', `Triggering system action: "${actionText}"`);
    try {
      // System actions use a special index like -2 to differentiate from user custom actions (-1)
      await triggerActionFn(actionText, -2, storyRenderer, historyManager, summarizer, promptManager);
    } finally {
      isLoading.value = false;
    }
  }

  // --- Initialization ---
  // The onMounted hook is removed as it's not reliable in this context.
  // Event listener is now set up in initializeActionStoreDependencies.

  return {
    owner,
    options,
    customActionInput,
    isCustomActionModalVisible,
    isLoading,
    setActions,
    showCustomActionModal,
    hideCustomActionModal,
    handleOptionClick,
    handleCustomActionConfirm,
    triggerSystemAction, // Expose the new function
    fetchData, // Expose for debugging or manual refresh
    isTextareaMode,
    toggleInputMode,
  };
});
