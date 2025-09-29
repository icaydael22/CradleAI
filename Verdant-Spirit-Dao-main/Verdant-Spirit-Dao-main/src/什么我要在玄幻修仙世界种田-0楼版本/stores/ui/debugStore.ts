import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDebugStore = defineStore('debug', () => {
  // State
  const isVisible = ref(false);
  const chatVariables = ref<Record<string, any> | null>(null);
  const isLoading = ref(false);

  // Actions
  function openModal() {
    isVisible.value = true;
  }

  function closeModal() {
    isVisible.value = false;
  }

  async function fetchChatVariables() {
    isLoading.value = true;
    try {
      // Assuming getVariables is globally available
      chatVariables.value = await getVariables({ type: 'chat' });
    } catch (error) {
      console.error('Failed to fetch chat variables:', error);
      chatVariables.value = { error: 'Failed to load variables.' };
    } finally {
      isLoading.value = false;
    }
  }

  return {
    isVisible,
    chatVariables,
    isLoading,
    openModal,
    closeModal,
    fetchChatVariables,
  };
});
