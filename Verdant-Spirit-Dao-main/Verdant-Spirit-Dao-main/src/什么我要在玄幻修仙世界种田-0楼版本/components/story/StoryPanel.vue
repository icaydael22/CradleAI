<template>
  <div class="panel-box flex flex-col" style="
    max-height: 60vh;
    min-height: 30vh;
">
    <h2 class="panel-title">
      <div class="flex items-center">
        <i class="fas fa-scroll mr-2"></i>
        <span>当前情节</span>
        <div class="ml-2 flex items-center space-x-1">
          <button v-if="!storyStore.isEditing" @click="storyStore.startEditing" class="icon-btn text-sm" title="编辑">
            <i class="fas fa-pen"></i>
          </button>
          <button v-if="storyStore.isEditing" @click="storyStore.saveEditing" class="icon-btn text-sm" title="保存">
            <i class="fas fa-save"></i>
          </button>
          <button v-if="storyStore.isEditing" @click="storyStore.cancelEditing" class="icon-btn text-sm" title="取消">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button @click="historyStore.showModal" class="control-btn text-sm" title="查看历史消息"><i
            class="fas fa-history"></i></button>
        <button @click="settingsStore.openModal" class="control-btn text-sm" title="设置"><i
            class="fas fa-cog"></i></button>
      </div>
    </h2>

    <div id="story-content" class="panel-body flex-grow">
      <textarea v-if="storyStore.isEditing" v-model="storyStore.editText"
        class="w-full h-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition"></textarea>
      <div v-else-if="storyStore.hasError" class="text-center text-red-400 p-4">
        <p>生成或解析内容时出错。</p>
        <button @click="storyStore.retryGeneration" class="btn btn-primary mt-2">
          <i class="fas fa-redo mr-2"></i>重试
        </button>
      </div>
      <div v-else v-html="storyStore.storyHtml"></div>
    </div>

    <div id="swipe-controls" class="flex justify-center items-center space-x-2 text-sm py-3">
      <button @click="storyStore.previousSwipe" :disabled="storyStore.isPrevSwipeDisabled" class="control-btn"
        title="上一个回应">
        <i class="fas fa-chevron-left"></i>
      </button>
      <span class="font-mono text-secondary">{{ storyStore.swipeCounterText }}</span>
      <button @click="storyStore.nextSwipe" :disabled="storyStore.isNextSwipeDisabled" class="control-btn"
        title="下一个回应">
        <i :class="['fas', storyStore.isAiGenerating ? 'fa-spinner fa-spin' : 'fa-chevron-right']"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeMount, onUpdated, onBeforeUpdate, onUnmounted, onBeforeUnmount, onRenderTracked, onRenderTriggered, watch } from 'vue';
import { useStoryStore } from '../../stores/ui/storyStore';
import { useHistoryStore } from '../../stores/ui/historyStore';
import { useSettingsStore } from '../../stores/ui/settingsStore';
import { logger } from '../../core/logger';

const storyStore = useStoryStore();
const historyStore = useHistoryStore();
const settingsStore = useSettingsStore();

onBeforeMount(() => {
  logger('info', 'StoryPanel', 'Component is about to be mounted.');
});

onMounted(() => {
  logger('info', 'StoryPanel', 'Component has been mounted.');
});

onBeforeUpdate(() => {
  logger('info', 'StoryPanel', 'Component is about to update. Current story state:', {
    isEditing: storyStore.isEditing,
    storyHtmlLength: storyStore.storyHtml.length,
    editTextLength: storyStore.editText.length,
    swipeCounter: storyStore.swipeCounterText,
  });
});

onUpdated(() => {
  logger('info', 'StoryPanel', 'Component has been updated.');
});

onBeforeUnmount(() => {
  logger('info', 'StoryPanel', 'Component is about to be unmounted.');
});

onUnmounted(() => {
  logger('info', 'StoryPanel', 'Component has been unmounted.');
});

onRenderTracked((event) => {
  logger('log', 'StoryPanel', 'Render tracked a dependency:', event);
});

onRenderTriggered((event) => {
  logger('log', 'StoryPanel', 'Render was triggered by a dependency change:', event);
});

watch(() => storyStore.storyHtml, (newValue, oldValue) => {
  logger('log', 'StoryPanel', 'storyHtml changed:', { from: oldValue.substring(0, 50), to: newValue.substring(0, 50) });
});

watch(() => storyStore.swipeCounterText, (newValue, oldValue) => {
  logger('log', 'StoryPanel', 'swipeCounterText changed:', { from: oldValue, to: newValue });
});
</script>
