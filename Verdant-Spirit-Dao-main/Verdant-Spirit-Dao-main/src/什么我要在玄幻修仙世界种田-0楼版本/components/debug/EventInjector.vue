<template>
  <div class="event-injector">
    <p class="text-xs text-secondary mb-2">在此处粘贴事件的JSON，然后点击注入。事件将通过 `syncVariables` 函数处理。</p>
    <div class="mb-2">
      <label class="text-xs font-bold text-secondary">事件模板预设:</label>
      <div id="event-presets-container" class="flex flex-wrap gap-2 mt-1">
        <button class="btn-secondary btn-sm" @click="setEventPreset('item')">物品变化</button>
        <button class="btn-secondary btn-sm" @click="setEventPreset('character')">角色更新</button>
        <button class="btn-secondary btn-sm" @click="setEventPreset('achievement')">解锁成就</button>
      </div>
    </div>
    <textarea class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono text-sm" rows="6" v-model="eventJson" placeholder='{ "事件": "...", "数据": { ... } }'></textarea>
    <button class="btn-primary btn-sm mt-2" @click="injectEvent">
      <i class="fas fa-syringe mr-1"></i> 注入事件
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { syncVariables } from '../../core/variables';
import { logger } from '../../core/logger';

const eventJson = ref('');

const presets = {
  item: {
    "事件列表": [
      {
        "事件": "物品变化",
        "数据": {
          "角色": "萧栖雪",
          "物品": "灵石",
          "数量": 10
        }
      }
    ]
  },
  character: {
    "事件列表": [
      {
        "事件": "角色更新",
        "数据": {
          "角色": "萧栖雪",
          "属性": "生命值",
          "变化": -5
        }
      }
    ]
  },
  achievement: {
    "事件列表": [
      {
        "事件": "成就解锁",
        "数据": {
          "成就ID": "first_step"
        }
      }
    ]
  }
};

function setEventPreset(presetName: keyof typeof presets) {
  eventJson.value = JSON.stringify(presets[presetName], null, 2);
}

async function injectEvent() {
  try {
    const eventObject = JSON.parse(eventJson.value);
    
    // Allow users to input a single event or a full statusbar object
    let statusbarData;
    if (Array.isArray(eventObject['事件列表'])) {
      statusbarData = eventObject;
    } else if (eventObject['事件'] && eventObject['数据']) {
      statusbarData = { "事件列表": [eventObject] };
    } else {
      toastr.error('JSON格式无效。请输入单个事件对象或完整的事件列表结构。');
      return;
    }

    const eventManager = (window as any).eventManager;
    if (!eventManager) {
      toastr.error('EventManager 未找到，无法注入事件。');
      logger('error', 'EventInjector', 'window.eventManager is not available.');
      return;
    }

    const injectedMessageId = `injected-event-${Date.now()}`;
    logger('info', 'EventInjector', `Injecting event with messageId: ${injectedMessageId}`, statusbarData);
    
    await syncVariables(statusbarData, injectedMessageId, eventManager);
    
    toastr.success('事件已成功注入处理队列。');

    // Also trigger a manual refresh of the side panels to show immediate effect
    const storyRenderer = (window as any).storyRenderer;
    if (storyRenderer) {
      storyRenderer.renderSidePanels(null);
      logger('info', 'EventInjector', 'Side panels automatically refreshed after event injection.');
    }

  } catch (error) {
    logger('error', 'EventInjector', 'Failed to parse or inject event.', error);
    toastr.error('事件注入失败，请检查 JSON 格式或查看控制台。');
  }
}
</script>

<style scoped>
.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}
</style>
