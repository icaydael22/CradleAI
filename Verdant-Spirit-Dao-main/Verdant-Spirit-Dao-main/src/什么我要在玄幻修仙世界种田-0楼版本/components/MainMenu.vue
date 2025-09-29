<template>
  <transition name="fade">
    <div v-if="store.isVisible" id="main-menu-container" class="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 bg-bg-primary z-50">

      <transition :name="transitionName" mode="out-in">
        <div :key="store.currentView" class="w-full">
          <!-- Main Menu View -->
          <div v-if="store.currentView === 'main' || store.currentView === 'startGame'" class="text-center max-w-sm mx-auto">
            <div class="text-center mb-12">
              <h1 class="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-primary">什么？我要在<br>玄幻修仙世界种田？</h1>
              <p class="mt-4 text-lg text-secondary">同层卡版本</p>
            </div>

            <div class="w-full">
              <!-- Main Menu Buttons -->
              <transition name="slide-fade" mode="out-in">
                <div v-if="store.currentView === 'main'" class="grid grid-cols-1 gap-4">
                  <button @click="store.showView('startGame')" class="main-menu-btn btn-primary">开始游戏</button>
                  <button @click="store.showView('overview')" class="main-menu-btn btn-secondary">世界观设定</button>
                  <button @click="store.showView('about')" class="main-menu-btn btn-secondary">关于</button>
                </div>
                
                <!-- Start Game Submenu -->
                <div v-else-if="store.currentView === 'startGame'" class="grid grid-cols-1 gap-4">
                  <button @click="handleNewGame" class="main-menu-btn btn-primary">开始新游戏</button>
                  <button @click="handleContinueGame" class="main-menu-btn btn-secondary" :disabled="!store.canContinue">继续游戏</button>
                  <button @click="triggerLoadGame" class="main-menu-btn btn-secondary">加载存档</button>
                  <button @click="store.backToMain()" class="main-menu-btn btn-secondary mt-4">返回</button>
                </div>
              </transition>
            </div>
            <input type="file" ref="loadGameInput" class="hidden" accept=".json" @change="onFileSelected">
          </div>

          <!-- Worldview Settings Panel -->
          <WorldviewSettings 
            v-else-if="store.currentView === 'overview'"
            :settings="worldviewSettings"
            @back="store.backToMain()"
            @save="saveWorldview"
            @reset="resetWorldview"
          />

          <!-- About Panel -->
          <div v-else-if="store.currentView === 'about'" class="h-full w-full max-w-2xl mx-auto">
              <button @click="store.backToMain()" class="btn-secondary mb-6"><i class="fas fa-arrow-left mr-2"></i>返回菜单</button>
              <div class="panel-box p-8 text-center">
                  <h2 class="text-3xl font-bold panel-title" style="border-bottom: none;">关于</h2>
                  <p class="mt-4 text-secondary">《什么？我要在玄幻修仙世界种田？》</p>
                  <p class="mt-2 text-sm text-secondary">作者：goddess_boreas</p>
                  <p class="mt-6 max-w-prose mx-auto text-base text-gray-400">
                    一个基于TavernAI的模块化框架，旨在为用户提供高度可定制的、动态的、沉浸式的文字冒险体验。
                  </p>
                  <a href="https://github.com/HerSophia/Verdant-Spirit-Dao" target="_blank" rel="noopener noreferrer" class="inline-block mt-6 bg-gray-800 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-900 transition-colors duration-200">
                    <i class="fab fa-github mr-2"></i>查看源码
                  </a>
              </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import WorldviewSettings from './WorldviewSettings.vue';
import { useMainMenuStore, MainMenuView } from '../stores/ui/mainMenuStore';
import { usePokedexStore } from '../stores/systems/pokedexStore';
import { useSetupStore } from '../stores/ui/setupStore';
import { logger } from '../core/logger';
import { DEFAULT_WORLDVIEW, IWorldviewDefinition } from '../data/worldview-data';
import { assignVariables, getVariables } from '../core/variables';
import _ from 'lodash';

const emit = defineEmits(['new-game', 'continue-game']);

declare const toastr: any;

const store = useMainMenuStore();
const setupStore = useSetupStore();
const pokedexStore = usePokedexStore();
const worldviewSettings = ref<IWorldviewDefinition>(_.cloneDeep(DEFAULT_WORLDVIEW));
const loadGameInput = ref<HTMLInputElement | null>(null);
const transitionName = ref('slide-left');

watch(() => store.currentView, (newView, oldView) => {
  const views: MainMenuView[] = ['main', 'startGame', 'overview', 'about'];
  const newIndex = views.indexOf(newView);
  const oldIndex = views.indexOf(oldView);
  transitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right';
});

onMounted(async () => {
  // 存档检查逻辑已移至 index.ts 中进行统一管理，此处不再需要。
  // MainMenu.vue 只负责响应 mainMenuStore 的状态。

  // Load worldview settings
  const worldVar = getVariables({ type: 'world' });
  const savedWorldview = _.get(worldVar, '世界观.固定世界信息');
  if (savedWorldview) {
    worldviewSettings.value = _.merge({}, _.cloneDeep(DEFAULT_WORLDVIEW), savedWorldview);
    logger('info', 'MainMenu', 'Loaded custom worldview settings from variables.');
  }
});

async function saveWorldview(newSettings: IWorldviewDefinition) {
  try {
    const oldPowerSystemName = worldviewSettings.value.powerSystem.name;
    const newPowerSystemName = newSettings.powerSystem.name;

    worldviewSettings.value = newSettings;
    await assignVariables({ '世界.世界观.固定世界信息': worldviewSettings.value });

    // If the power system name has changed, update the pokedex data in memory
    if (oldPowerSystemName !== newPowerSystemName) {
      pokedexStore.updatePowerSystemNameInPokedex(oldPowerSystemName, newPowerSystemName);
    }

    toastr.success('世界观设定已保存！');
    logger('info', 'MainMenu', 'Worldview settings saved.', worldviewSettings.value);
  } catch (error) {
    toastr.error('保存失败，请查看控制台。');
    logger('error', 'MainMenu', 'Failed to save worldview settings.', error);
  }
}

function resetWorldview() {
  if (confirm('确定要将所有世界观设定恢复为默认值吗？')) {
    worldviewSettings.value = _.cloneDeep(DEFAULT_WORLDVIEW);
    toastr.info('已恢复为默认设定。');
  }
}

function triggerLoadGame() {
  loadGameInput.value?.click();
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content === 'string') {
          const saveData = JSON.parse(content);
          logger('info', 'MainMenu', 'Save file loaded, calling store action.', saveData);
          store.handleLoadGame(saveData);
          // The store action will handle hiding the menu and reloading.
        }
      } catch (error) {
        logger('error', 'MainMenu', 'Failed to parse save file.', error);
        // @ts-ignore
        toastr.error('加载存档失败：文件格式无效。');
      }
    };
    reader.readAsText(file);
  }
  // Reset the input value to allow loading the same file again
  if (input) {
    input.value = '';
  }
}

function handleNewGame() {
  logger('info', 'MainMenu', 'Emitting new-game event.');
  emit('new-game');
}

function handleContinueGame() {
  logger('info', 'MainMenu.vue', 'handleContinueGame called. Emitting continue-game event.');
  emit('continue-game');
}
</script>
