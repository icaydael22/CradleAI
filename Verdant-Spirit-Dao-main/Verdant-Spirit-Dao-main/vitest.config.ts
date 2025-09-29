/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/什么我要在玄幻修仙世界种田-0楼版本/测试/**/*.test.ts'],
    root: fileURLToPath(new URL('./', import.meta.url)),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/什么我要在玄幻修仙世界种田-0楼版本', import.meta.url)),
      // Add this alias to fix the dynamic import issue in tests
      '../systems/shelterStore': fileURLToPath(new URL('./src/什么我要在玄幻修仙世界种田-0楼版本/stores/systems/shelterStore.ts', import.meta.url)),
    },
  },
});