import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 管理 AI 生成过程中的状态。
 */
export const useGenerationStore = defineStore('generation', () => {
  //console.log('[DEBUG] useGenerationStore setup function executed.');
  // STATE
  const isAiGenerating = ref(false);
  const isGeneratingWorld = ref(false); // 新增：用于初始世界生成的加载状态
  const isNewTurn = ref(true);
  const currentTurnSwipes = ref<string[]>([]);
  const currentSwipeIndex = ref(0);
  const lastUserInput = ref('');
  const forceSwipeReset = ref(false);
  const isSecondaryLlmRequestActive = ref(false); // New flag for secondary LLM requests

  // ACTIONS
  function addSwipe(swipeContent: string) {
    currentTurnSwipes.value.push(swipeContent);
  }

  function updateLastSwipe(swipeContent: string) {
    if (currentTurnSwipes.value.length > 0) {
      currentTurnSwipes.value[currentTurnSwipes.value.length - 1] = swipeContent;
    }
  }

  function removeLastSwipe() {
    if (currentTurnSwipes.value.length > 0) {
      currentTurnSwipes.value.pop();
    }
  }

  function reset() {
    isAiGenerating.value = false;
    isNewTurn.value = true;
    currentTurnSwipes.value = [];
    currentSwipeIndex.value = 0;
  }

  return {
    isAiGenerating,
    isGeneratingWorld,
    isNewTurn,
    currentTurnSwipes,
    currentSwipeIndex,
    lastUserInput,
    forceSwipeReset,
    addSwipe,
    updateLastSwipe,
    reset,
    removeLastSwipe,
    isSecondaryLlmRequestActive,
  };
});
