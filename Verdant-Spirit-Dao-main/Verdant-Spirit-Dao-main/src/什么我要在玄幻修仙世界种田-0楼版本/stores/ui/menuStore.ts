import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useMenuStore = defineStore('menu', () => {
  // State
  const isVisible = ref(false);

  // Actions
  function showMenu() {
    isVisible.value = true;
  }

  function hideMenu() {
    isVisible.value = false;
  }

  function toggleMenu() {
    isVisible.value = !isVisible.value;
  }

  return {
    isVisible,
    showMenu,
    hideMenu,
    toggleMenu,
  };
});
