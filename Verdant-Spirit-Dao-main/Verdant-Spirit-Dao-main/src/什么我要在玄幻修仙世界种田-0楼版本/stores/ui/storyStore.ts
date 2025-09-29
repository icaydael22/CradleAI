import { defineStore } from 'pinia';
import { computed, ref, watch, onMounted } from 'vue';
import { generateAnotherSwipe } from '../../core/actions';
import { EventManager } from '../../core/eventManager';
import { ChatHistoryManager, MessagePage } from '../../core/history';
import { logger } from '../../core/logger';
import { PromptManager } from '../../core/promptManager';
import { getProcessedStoryText } from '../../core/regexProcessor';
import { StoryRenderer } from '../../core/renderer';
import { useAppStore } from '../app/appStore';
import { useGenerationStore } from '../app/generationStore';

declare const marked: any;
declare const _: any;
declare const toastr: any;
declare const eventOn: (event: string, callback: (...args: any[]) => void) => void;
declare const eventOff: (event: string, callback: (...args: any[]) => void) => void;

interface StoryStoreDependencies {
  historyManager?: ChatHistoryManager;
  storyRenderer?: StoryRenderer;
  promptManager?: PromptManager;
  eventManager?: EventManager;
}

export const createStoryStore = (dependencies: StoryStoreDependencies = {}) => defineStore('story', () => {
  // STATE
  const storyHtml = ref('<p class="text-secondary">正在加载故事...</p>');
  const isEditing = ref(false);
  const editText = ref('');
  const currentSwipe = ref(0);
  const totalSwipes = ref(0);
  const isAiGenerating = ref(false);
  const hasError = ref(false); // 新增：用于标记生成/解析是否出错

  // GETTERS
  const swipeCounterText = computed(() => `${currentSwipe.value + 1} / ${totalSwipes.value}`);
  const isPrevSwipeDisabled = computed(() => isAiGenerating.value || currentSwipe.value <= 0);
  const isNextSwipeDisabled = computed(() => isAiGenerating.value);

  // ACTIONS

  // --- Internal Helpers ---
  const getChatHistoryManager = (): ChatHistoryManager | null => dependencies.historyManager || window.chatHistoryManager || null;
  const getStoryRenderer = (): StoryRenderer | null => dependencies.storyRenderer || window.storyRenderer || null;
  const getPromptManager = (): PromptManager | null => dependencies.promptManager || window.promptManager || null;
  const getEventManager = (): EventManager | null => dependencies.eventManager || window.eventManager || null;

  /**
   * Fetches the latest story content and swipe state.
   * This should only be called after the core state is ready.
   */
  async function fetchData() {
    logger('info', 'StoryStore', 'fetchData triggered.');
    
    const historyManager = getChatHistoryManager();
    const storyRenderer = getStoryRenderer();

    if (!historyManager || !storyRenderer) {
      logger('error', 'StoryStore', 'fetchData called but dependencies are not available.');
      storyHtml.value = '<p class="text-red-400">错误：核心模块加载失败。</p>';
      return;
    }

    // Synchronize swipe state from the history manager
    const history = historyManager.getRawHistory();
    const activeBranch = history.branches[history.activeBranch];
    const turnIndices = Object.keys(activeBranch).map(Number).sort((a, b) => a - b);
    const lastTurnIndex = _.last(turnIndices);

    let lastAssistantTurn;
    if (lastTurnIndex !== undefined) {
      const lastTurn = activeBranch[lastTurnIndex];
      if (lastTurn.role === 'assistant') {
        lastAssistantTurn = lastTurn;
      } else if (turnIndices.length > 1) {
        const secondLastTurnIndex = turnIndices[turnIndices.length - 2];
        lastAssistantTurn = activeBranch[secondLastTurnIndex];
      }
    }

    if (lastAssistantTurn) {
      totalSwipes.value = Object.keys(lastAssistantTurn.pages).length;
      currentSwipe.value = lastAssistantTurn.activePageIndex;
    } else {
      totalSwipes.value = 0;
      currentSwipe.value = 0;
    }

    const generationStore = useGenerationStore();
    isAiGenerating.value = generationStore.isAiGenerating;

    const messages = historyManager.getMessagesForPrompt();
    //logger('log', 'StoryStore', 'Raw messages from historyManager:', _.cloneDeep(messages));
    const lastMessage = _.findLast(messages, (m: MessagePage) => m.role === 'assistant');
    logger('log', 'StoryStore', 'Last assistant message found:', _.cloneDeep(lastMessage));

    if (lastMessage) {
      const storyOnlyMarkdown = lastMessage.content.replace(/<statusbar>[\s\S]*?<\/statusbar>/i, '');
      const rawHtml = marked.parse(storyOnlyMarkdown);
      storyHtml.value = rawHtml;
      editText.value = storyOnlyMarkdown;
    } else {
      storyHtml.value = '<p class="text-secondary">未能加载故事内容。</p>';
    }
    logger('info', 'StoryStore', 'Story data fetched.', {
      swipe: swipeCounterText.value,
      isGenerating: isAiGenerating.value,
    });
  }

  function startEditing() {
    const historyManager = getChatHistoryManager();
    if (!historyManager) return;
    const messages = historyManager.getMessagesForPrompt();
    const lastMessage = _.findLast(messages, (m: MessagePage) => m.role === 'assistant');
    if (!lastMessage) {
      toastr.error('没有找到可以编辑的AI回复。');
      return;
    }
    editText.value = lastMessage.content.replace(/<statusbar>[\s\S]*?<\/statusbar>/i, '');
    isEditing.value = true;
  }

  function cancelEditing() {
    isEditing.value = false;
  }

  async function saveEditing() {
    const historyManager = getChatHistoryManager();
    const storyRenderer = getStoryRenderer();
    if (!historyManager || !storyRenderer) return;

    const messages = historyManager.getMessagesForPrompt();
    const lastMessage = _.findLast(messages, (m: MessagePage) => m.role === 'assistant');
    if (!lastMessage) {
      toastr.error('无法找到要更新的消息。');
      return;
    }

    const statusBarMatch = lastMessage.content.match(/<statusbar>[\s\S]*?<\/statusbar>/i);
    const statusBar = statusBarMatch ? statusBarMatch[0] : '';
    const newFullContent = `${editText.value}\n${statusBar}`;

    try {
      await historyManager.updateMessagePageContent(lastMessage.id, newFullContent);
      const rawHtml = marked.parse(editText.value);
      storyHtml.value = rawHtml;
      isEditing.value = false;
      toastr.success('情节已成功保存！');
    } catch (error) {
      logger('error', 'StoryStore', '保存情节失败', error);
      toastr.error('保存失败，请查看控制台。');
    }
  }

  async function previousSwipe() {
    if (isPrevSwipeDisabled.value) return;
    const historyManager = getChatHistoryManager();
    if (!historyManager) return;

    const history = historyManager.getRawHistory();
    const activeBranch = history.branches[history.activeBranch];
    const turnIndices = Object.keys(activeBranch).map(Number).sort((a, b) => b - a); // Descending

    let lastAssistantTurnIndex: number | undefined;
    for (const index of turnIndices) {
      if (activeBranch[index].role === 'assistant') {
        lastAssistantTurnIndex = index;
        break;
      }
    }

    if (lastAssistantTurnIndex === undefined) {
      logger('error', 'StoryStore', 'previousSwipe: No assistant turn found.');
      return;
    }

    const newPageIndex = currentSwipe.value - 1;
    await historyManager.setActivePage(lastAssistantTurnIndex, newPageIndex);

    const updatedTurn = historyManager.getRawHistory().branches[history.activeBranch][lastAssistantTurnIndex];
    const newMessageId = updatedTurn?.pages?.[newPageIndex]?.id;

    if (newMessageId) {
      window.dispatchEvent(new CustomEvent('stateActivationRequested', { detail: { newMessageId } }));
    } else {
      logger('error', 'StoryStore', `previousSwipe: Could not find message ID for page index ${newPageIndex}`);
    }
  }

  async function nextSwipe() {
    if (isNextSwipeDisabled.value) return;
    const historyManager = getChatHistoryManager();
    const storyRenderer = getStoryRenderer();
    const promptManager = getPromptManager();
    if (!historyManager || !storyRenderer || !promptManager) return;

    if (currentSwipe.value < totalSwipes.value - 1) {
      const history = historyManager.getRawHistory();
      const activeBranch = history.branches[history.activeBranch];
      const turnIndices = Object.keys(activeBranch).map(Number).sort((a, b) => b - a); // Descending

      let lastAssistantTurnIndex: number | undefined;
      for (const index of turnIndices) {
        if (activeBranch[index].role === 'assistant') {
          lastAssistantTurnIndex = index;
          break;
        }
      }

      if (lastAssistantTurnIndex === undefined) {
        logger('error', 'StoryStore', 'nextSwipe: No assistant turn found.');
        return;
      }

      const newPageIndex = currentSwipe.value + 1;
      await historyManager.setActivePage(lastAssistantTurnIndex, newPageIndex);

      const updatedTurn = historyManager.getRawHistory().branches[history.activeBranch][lastAssistantTurnIndex];
      const newMessageId = updatedTurn?.pages?.[newPageIndex]?.id;

      if (newMessageId) {
        window.dispatchEvent(new CustomEvent('stateActivationRequested', { detail: { newMessageId } }));
      } else {
        logger('error', 'StoryStore', `nextSwipe: Could not find message ID for page index ${newPageIndex}`);
      }
    } else {
      generateAnotherSwipe(storyRenderer, historyManager, promptManager);
    }
  }

  /**
   * Updates the story content with a new chunk of streamed text.
   * This is called by the global event listener in index.ts.
   * @param fullText The complete text received so far from the stream.
   */
  function updateStreamedContent(fullText: string) {
    const storyRenderer = getStoryRenderer();
    if (!storyRenderer) {
      logger('warn', 'StoryStore', 'updateStreamedContent called before storyRenderer is available.');
      return;
    }

    //logger('log', 'RegexDebug', '--- Streaming Text Processing ---');
    //logger('log', 'RegexDebug', 'Before:', { text: fullText });

    // 应用正则表达式处理流式文本
    const processedText = getProcessedStoryText(fullText);
    
    //logger('log', 'RegexDebug', 'After:', { text: processedText });

    const storyOnlyMarkdown = processedText.replace(/<statusbar>[\s\S]*?<\/statusbar>/i, '');
    const rawHtml = marked.parse(storyOnlyMarkdown);
    storyHtml.value = rawHtml;
    editText.value = storyOnlyMarkdown; // Also update the edit text for consistency
  }

  /**
   * Sets the store's state to reflect the AI's generation status.
   * @param isGenerating The new generation status.
   */
  function setGenerationStatus(generating: boolean) {
    isAiGenerating.value = generating;
  }

  /**
   * (新增) 设置或清除错误状态。
   * @param errorState - 是否存在错误。
   */
  function setHasError(errorState: boolean) {
    hasError.value = errorState;
    if (errorState) {
      // 如果发生错误，确保生成状态为 false，以便UI可以响应
      isAiGenerating.value = false;
    }
  }

  /**
   * (新增) 触发重试生成。
   */
  async function retryGeneration() {
    logger('info', 'StoryStore', 'Retry generation triggered.');
    if (isAiGenerating.value) return;

    const storyRenderer = getStoryRenderer();
    const historyManager = getChatHistoryManager();
    const promptManager = getPromptManager();

    if (!storyRenderer || !historyManager || !promptManager) {
      logger('error', 'StoryStore', 'Retry failed: core dependencies not available.');
      toastr.error('重试失败，核心模块未准备就绪。');
      return;
    }

    setHasError(false);
    setGenerationStatus(true);
    
    // 直接调用 generateAnotherSwipe 来强制从上一个用户回合重新生成
    await generateAnotherSwipe(storyRenderer, historyManager, promptManager);
  }

  // --- Initialization ---
  onMounted(() => {
    const appStore = useAppStore();
    
    watch(() => appStore.coreStateUpdateCount, () => {
      // 监听计数器变化，每次变化都重新获取数据
      logger('info', 'StoryStore', 'Core state update signal received, fetching data.');
      fetchData();
    }, { immediate: true });
  });

  return {
    storyHtml,
    isEditing,
    editText,
    currentSwipe,
    totalSwipes,
    isAiGenerating,
    swipeCounterText,
    isPrevSwipeDisabled,
    isNextSwipeDisabled,
    fetchData,
    startEditing,
    cancelEditing,
    saveEditing,
    previousSwipe,
    nextSwipe,
    updateStreamedContent,
    setGenerationStatus,
    setHasError,
    retryGeneration,
    hasError,
  };
});

export const useStoryStore = createStoryStore();
