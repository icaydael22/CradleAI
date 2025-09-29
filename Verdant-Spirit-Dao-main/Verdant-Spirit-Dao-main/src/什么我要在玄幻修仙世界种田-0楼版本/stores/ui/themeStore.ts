import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '../../core/logger';

type Theme = 'night' | 'day' | 'jade' | 'classic';

export const useThemeStore = defineStore('theme', () => {
  // State
  const currentTheme = ref<Theme>('night');

  // Actions
  /**
   * Sets the application theme and persists it to localStorage.
   * @param theme The theme to set.
   */
  function setTheme(theme: Theme) {
    currentTheme.value = theme;
    document.body.className = 'theme-transition'; // Reset classes
    document.body.classList.add(`${theme}-mode`);
    localStorage.setItem('theme', theme);
    logger('info', 'ThemeStore', `Theme changed to ${theme}`);
  }

  /**
   * Initializes the theme from localStorage or defaults to 'night'.
   */
  function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme && ['night', 'day', 'jade', 'classic'].includes(savedTheme)) {
      setTheme(savedTheme);
    } else {
      setTheme('night'); // Default theme
    }
  }

  return {
    currentTheme,
    setTheme,
    initializeTheme,
  };
});
