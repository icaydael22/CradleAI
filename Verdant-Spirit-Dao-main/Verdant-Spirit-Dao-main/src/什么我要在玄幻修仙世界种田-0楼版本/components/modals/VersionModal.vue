<template>
  <div v-if="store.isModalVisible" class="modal-overlay" @click.self="store.closeModal">
    <div class="modal-content">
      <button @click="store.closeModal" class="modal-close-btn">&times;</button>
      <h3 class="modal-title">版本信息与更新</h3>

      <div class="modal-body">
        <div v-if="store.isLoading" class="flex justify-center items-center p-8">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
        </div>

        <div v-else>
          <div class="text-center mb-4 p-4 bg-secondary rounded-lg">
            <p class="text-sm text-secondary">当前版本: <span class="font-bold text-primary">{{ store.localVersion }}</span>
            </p>
            <p v-if="store.remoteVersion" class="text-sm text-secondary mt-1">
              最新版本: <span class="font-bold text-primary">{{ store.remoteVersion }}</span>
            </p>
            <div v-if="store.hasUpdate" class="mt-2 text-green-400 font-bold">
              <i class="fas fa-check-circle mr-1"></i> 发现新版本！
            </div>
          </div>

          <div class="prose prose-invert max-w-none changelog-container" v-html="store.changelogHtml"></div>
        </div>
      </div>

      <div class="modal-footer">
        <button v-if="store.hasUpdate" @click="store.startUpdate" :disabled="store.isUpdating" class="btn-primary">
          <span v-if="store.isUpdating">
            <i class="fas fa-spinner fa-spin mr-2"></i>更新中...
          </span>
          <span v-else>
            <i class="fas fa-download mr-2"></i>立即更新
          </span>
        </button>
        <button @click="store.closeModal" class="btn-secondary ml-2">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVersionStore } from '../../stores/app/versionStore';

const store = useVersionStore();
</script>

<style scoped>
.prose {
  color: var(--text-primary);
}

.prose :where(h1, h2, h3, h4, h5, h6):not(:where([class~="not-prose"] *)) {
  color: var(--accent-color);
}

.prose :where(a):not(:where([class~="not-prose"] *)) {
  color: var(--accent-color-hover);
}

.prose :where(strong):not(:where([class~="not-prose"] *)) {
  color: var(--text-primary);
}

.prose :where(blockquote):not(:where([class~="not-prose"] *)) {
  border-left-color: var(--border-color);
  color: var(--text-secondary);
}

.prose :where(code):not(:where([class~="not-prose"] *)) {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
}

.changelog-container {
  max-height: 50vh;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background-color: var(--bg-primary);
}
</style>
