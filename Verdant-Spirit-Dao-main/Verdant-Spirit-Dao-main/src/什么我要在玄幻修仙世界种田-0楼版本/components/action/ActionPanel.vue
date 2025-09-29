<template>
  <div class="panel-box flex flex-col overflow-hidden" style="max-height: 35vh; min-height: 25vh;">
    <h2 class="panel-title flex items-center flex-shrink-0">
      <!-- Switcher -->
      <label class="switch mr-3 flex-shrink-0">
        <input type="checkbox" @change="actionStore.toggleInputMode" :checked="actionStore.isTextareaMode">
        <span class="slider round">
          <span class="knob">
            <i class="fas" :class="actionStore.isTextareaMode ? 'fa-keyboard' : 'fa-list-ul'"></i>
          </span>
        </span>
      </label>
      <span class="text-accent truncate">{{ actionStore.owner }}</span>
      <span class="truncate">的行动选项</span>
    </h2>
    <div class="panel-body flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <!-- Options List Mode -->
      <div v-if="!actionStore.isTextareaMode">
        <ul class="space-y-3 cursor-pointer" :class="{ 'opacity-50 pointer-events-none': actionStore.isLoading }">
          <li v-for="(option, index) in actionStore.options" :key="index"
            class="pl-2 py-2 border-l-2 border-dim ml-1 hover:border-indigo-400/70 transition-colors theme-transition"
            @click="actionStore.handleOptionClick(option, index)">
            ▶️ {{ option }}
          </li>
          <li
            class="pl-2 py-2 border-l-2 border-dim ml-1 hover:border-indigo-400/70 transition-colors theme-transition mt-4"
            @click="actionStore.showCustomActionModal">
            <i class="fas fa-pen-nib mr-2 text-accent"></i> 自定义行动...
          </li>
        </ul>
        <!-- Custom action modal -->
        <div v-if="actionStore.isCustomActionModalVisible" class="mt-4">
          <div class="bg-main rounded-lg shadow-xl p-4 border border-dim">
            <h4 class="font-bold text-md mb-3 text-accent flex items-center">
              <i class="fas fa-pen-nib mr-2"></i>输入你的行动
            </h4>
            <textarea v-model="actionStore.customActionInput"
              class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition"
              rows="3" placeholder="你想做什么..."
              @vue:mounted="({ el }: { el: HTMLTextAreaElement }) => el.focus()"></textarea>
            <div class="flex justify-end space-x-3 mt-3">
              <button class="px-4 py-2 rounded bg-gray-600 hover:bg-gray-700 transition-colors theme-transition text-sm"
                @click="actionStore.hideCustomActionModal">
                取消
              </button>
              <button
                class="px-4 py-2 rounded bg-accent hover:bg-accent-hover transition-colors theme-transition text-white text-sm"
                @click="actionStore.handleCustomActionConfirm" :disabled="!actionStore.customActionInput.trim()">
                确认行动
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- Textarea Input Mode -->
      <div v-else>
        <textarea v-model="actionStore.customActionInput"
          class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition"
          rows="5" placeholder="你想做什么..." @vue:mounted="({ el }: { el: HTMLTextAreaElement }) => el.focus()"></textarea>
        <div class="flex justify-end mt-3">
          <button
            class="px-4 py-2 rounded bg-accent hover:bg-accent-hover transition-colors theme-transition text-white text-sm"
            @click="actionStore.handleCustomActionConfirm"
            :disabled="!actionStore.customActionInput.trim() || actionStore.isLoading">
            <span v-if="actionStore.isLoading">处理中...</span>
            <span v-else>确认行动</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useActionStore } from '../../stores/ui/actionStore';
const props = defineProps<{
  testActionStore?: ReturnType<typeof useActionStore>;
}>();

const actionStore = props.testActionStore || useActionStore();
</script>

<style scoped>
/* The switch - the box around the slider */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  /* smaller */
  height: 24px;
  /* smaller */
}

/* Hide default HTML checkbox */
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

/* The slider */
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border-color);
  -webkit-transition: .4s;
  transition: .4s;
}

.knob {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: var(--bg-secondary);
  -webkit-transition: .4s;
  transition: .4s;
  border-radius: 50%;
  color: var(--text-secondary);
}

.knob i {
  font-size: 10px;
}

input:checked+.slider {
  background-color: var(--accent-color);
}

input:focus+.slider {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 50%, transparent);
}

input:checked+.slider .knob {
  -webkit-transform: translateX(20px);
  -ms-transform: translateX(20px);
  transform: translateX(20px);
  background-color: white;
  color: var(--accent-color);
}

/* Rounded sliders */
.slider.round {
  border-radius: 24px;
  /* adjusted */
}
</style>
