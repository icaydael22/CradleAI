<template>
  <div id="setup-container" class="fixed inset-0 z-[1010] bg-background text-primary overflow-y-auto">
    <div class="container mx-auto px-4 py-12 max-w-7xl">
      <!-- 标题区域 -->
      <header class="text-center mb-12">
        <h1 class="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">什么？我要在玄幻修仙世界种田？</h1>
        <p class="mt-4 text-base md:text-lg text-secondary">
          自定义你的开局
        </p>
      </header>

      <!-- 主体内容 -->
      <main class="panel-box max-w-5xl mx-auto">
        <div class="p-6 sm:p-8 md:p-12">
          <h2 class="panel-title">天赋与家世</h2>
          <!-- 角色名称编辑 -->
          <div class="mb-6">
            <h3 class="font-bold text-lg sm:text-xl mb-4 text-accent">角色档案</h3>
            <div v-if="!isEditingName" id="character-name-display" class="flex items-center">
              <h4 class="text-2xl sm:text-3xl font-serif text-blue-400">{{ store.characterName }}</h4>
              <button @click="toggleNameEdit(true)" id="edit-name-button" class="ml-4 text-secondary hover:text-primary transition"><i class="fas fa-pencil-alt"></i></button>
            </div>
            <div v-else id="character-name-edit" class="mt-2">
              <input type="text" v-model="editingName" @keyup.enter="handleNameConfirm" @keyup.esc="toggleNameEdit(false)" id="character-name-input" class="form-input bg-secondary text-primary text-2xl font-serif rounded px-2 py-1 w-full max-w-xs">
              <div class="mt-2">
                <button @click="handleNameConfirm" id="confirm-name-button" class="btn-primary text-sm py-1 px-3">确认</button>
                <button @click="toggleNameEdit(false)" id="cancel-name-button" class="btn-secondary text-sm py-1 px-3 ml-2">取消</button>
              </div>
            </div>
          </div>
          <p class="text-secondary mb-8">你将有10点天赋点，自由分配在以下各项中，以决定你的开局。这将影响你的初始资源、功法、以及可能遇到的奇遇。</p>

          <!-- 自定义角色设定表单 -->
          <details class="collapsible-section" :open="isDesktop">
            <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">自定义角色设定</summary>
            <div class="space-y-6 mt-4 p-4 border border-dim rounded-lg">
              <!-- 基础信息 -->
              <div>
                <h4 class="font-semibold text-primary mb-2">一、基础信息</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label for="char-gender" class="block text-sm font-medium text-secondary">性别</label>
                    <select v-model="store.customCharacterData.gender" id="char-gender" name="char-gender" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary">
                      <option>女</option>
                      <option>男</option>
                    </select>
                  </div>
                  <div>
                    <label for="char-age" class="block text-sm font-medium text-secondary">年龄 (穿越时)</label>
                    <input type="number" v-model.number="store.customCharacterData.age" name="char-age" id="char-age" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary">
                  </div>
                  <div class="sm:col-span-2">
                    <label for="char-appearance" class="block text-sm font-medium text-secondary">外貌特征</label>
                    <textarea v-model="store.customCharacterData.appearance" id="char-appearance" name="char-appearance" rows="3" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary"></textarea>
                  </div>
                </div>
              </div>
              <!-- 核心设定 -->
              <div>
                <h4 class="font-semibold text-primary mb-2">二、核心设定与背景</h4>
                <div class="space-y-4">
                  <div>
                    <label for="char-background-earth" class="block text-sm font-medium text-secondary">前世 (地球) 身份</label>
                    <input type="text" v-model="store.customCharacterData.backgroundEarth" name="char-background-earth" id="char-background-earth" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary">
                  </div>
                  <div>
                    <label for="char-background-world" class="block text-sm font-medium text-secondary">现世 (元初界) 身份</label>
                    <input type="text" v-model="store.customCharacterData.backgroundWorld" name="char-background-world" id="char-background-world" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary">
                  </div>
                </div>
              </div>
              <!-- 性格特点 -->
              <div>
                <h4 class="font-semibold text-primary mb-2">三、性格与能力</h4>
                <div class="space-y-4">
                  <div>
                    <label for="char-personality" class="block text-sm font-medium text-secondary">核心性格</label>
                    <input type="text" v-model="store.customCharacterData.personality" name="char-personality" id="char-personality" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary">
                  </div>
                  <div>
                    <label for="char-habits" class="block text-sm font-medium text-secondary">学者气质/习惯</label>
                    <input type="text" v-model="store.customCharacterData.habits" name="char-habits" id="char-habits" class="mt-1 block w-full rounded-md border-gray-600 bg-secondary shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-primary">
                  </div>
                </div>
              </div>
            </div>
          </details>

          <div class="space-y-8 md:space-y-12">
            <!-- All sections will be dynamically generated -->
            <details class="collapsible-section" :open="isDesktop">
              <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">初始地点 (选择你的降落点)</summary>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <label v-for="option in store.staticData.initialLocations" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.initialLocation === option.id}">
                  <input type="radio" :id="option.id" name="initialLocation" :value="option.id" v-model="store.selections.initialLocation" class="sr-only">
                  <div class="card-radio-content">
                    <span class="font-semibold text-primary">{{ option.name }}</span>
                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                  </div>
                </label>
              </div>
            </details>

            <!-- Other sections follow the same pattern -->
            <details class="collapsible-section" :open="isDesktop">
                <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">开局时间 (选择你的初始季节)</summary>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <label v-for="option in store.staticData.seasons" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.season === option.id}">
                        <input type="radio" :id="option.id" name="season" :value="option.id" v-model="store.selections.season" class="sr-only">
                        <div class="card-radio-content">
                            <span class="font-semibold text-primary">{{ option.name }}</span>
                            <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                        </div>
                    </label>
                </div>
            </details>

            <details class="collapsible-section" :open="isDesktop">
                <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">海岛环境 (选择恶劣环境可获得<span class="text-yellow-400">额外点数</span>)</summary>
                <div class="space-y-6 mt-4">
                    <div>
                        <h4 class="font-semibold text-primary mb-2">息壤灵田</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <label v-for="option in store.staticData.farmlands" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.farmland === option.id}">
                                <input type="radio" :id="option.id" name="farmland" :value="option.id" v-model="store.selections.farmland" class="sr-only">
                                <div class="card-radio-content">
                                    <span class="font-semibold text-primary">{{ option.name }} <span class="text-yellow-400">(+{{ option.extraPoints }})</span></span>
                                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-semibold text-primary mb-2">淡水资源</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                             <label v-for="option in store.staticData.waterSources" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.water === option.id}">
                                <input type="radio" :id="option.id" name="water" :value="option.id" v-model="store.selections.water" class="sr-only">
                                <div class="card-radio-content">
                                    <span class="font-semibold text-primary">{{ option.name }} <span class="text-yellow-400">(+{{ option.extraPoints }})</span></span>
                                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-semibold text-primary mb-2">生物环境</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <label v-for="option in store.staticData.creatures" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.creature === option.id}">
                                <input type="radio" :id="option.id" name="creature" :value="option.id" v-model="store.selections.creature" class="sr-only">
                                <div class="card-radio-content">
                                    <span class="font-semibold text-primary">{{ option.name }} <span class="text-yellow-400">(+{{ option.extraPoints }})</span></span>
                                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-semibold text-primary mb-2">海床地形</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <label v-for="option in store.staticData.seabeds" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.seabed === option.id}">
                                <input type="radio" :id="option.id" name="seabed" :value="option.id" v-model="store.selections.seabed" class="sr-only">
                                <div class="card-radio-content">
                                    <span class="font-semibold text-primary">{{ option.name }} <span class="text-yellow-400">(+{{ option.extraPoints }})</span></span>
                                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-semibold text-primary mb-2">海域天象</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <label v-for="option in store.staticData.storms" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.storm === option.id}">
                                <input type="radio" :id="option.id" name="storm" :value="option.id" v-model="store.selections.storm" class="sr-only">
                                <div class="card-radio-content">
                                    <span class="font-semibold text-primary">{{ option.name }} <span class="text-yellow-400">(+{{ option.extraPoints }})</span></span>
                                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-semibold text-primary mb-2">周边岛屿</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <label v-for="option in store.staticData.islands" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.islands === option.id}">
                                <input type="radio" :id="option.id" name="islands" :value="option.id" v-model="store.selections.islands" class="sr-only">
                                <div class="card-radio-content">
                                    <span class="font-semibold text-primary">{{ option.name }} <span class="text-yellow-400">(+{{ option.extraPoints }})</span></span>
                                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </details>

            <!-- Traits Selection -->
            <details class="collapsible-section" :open="isDesktop">
              <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">凡人特长 (选择一项)</summary>
              <div class="flex grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <!-- 默认特质 (左侧) -->
                <div>
                    <div class="card-radio-label has-checked cursor-default h-full flex flex-col justify-center">
                        <div class="">
                            <span class="font-semibold text-primary">{{ store.staticData.defaultTrait.name }} (默认)</span>
                            <p class="text-xs text-secondary mt-1">{{ store.staticData.defaultTrait.description }}</p>
                        </div>
                    </div>
                </div>
                <!-- 可选特质 (右侧) -->
                <div class="space-y-4">
                  <label v-for="option in store.staticData.optionalTraits" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.trait === option.id}">
                    <input type="radio" :id="option.id" name="trait" :value="option.id" v-model="store.selections.trait" class="sr-only">
                    <div class="card-radio-content">
                      <span class="font-semibold text-primary">{{ option.name }}</span>
                      <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                    </div>
                  </label>
                </div>
              </div>
            </details>

            <!-- Talent Allocation -->
            <details class="collapsible-section" :open="isDesktop">
              <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">
                天赋分配 (剩余天赋点: <span :class="{'text-red-500': store.talentRemaining < 0}" class="text-blue-400 font-bold">{{ Math.max(0, store.talentRemaining) }}</span> / <span class="text-gray-400">10</span>)
              </summary>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mt-4">
                <div class="card rounded-lg p-6 bg-secondary/30">
                  <label class="font-semibold flex items-center justify-between">
                    <span><i class="fas fa-bone text-yellow-400 mr-2"></i>根骨</span>
                    <span class="text-lg font-bold text-blue-400">{{ store.talents['talent-gen-gu'] }}</span>
                  </label>
                  <p class="text-sm text-secondary mt-1 mb-3">影响你的修炼速度与肉身强度。</p>
                  <input v-model.number="store.talents['talent-gen-gu']" type="range" min="0" max="10" class="form-range w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer talent-slider">
                </div>
                <div class="card rounded-lg p-6 bg-secondary/30">
                  <label class="font-semibold flex items-center justify-between">
                    <span><i class="fas fa-brain text-purple-400 mr-2"></i>悟性</span>
                    <span class="text-lg font-bold text-blue-400">{{ store.talents['talent-wu-xing'] }}</span>
                  </label>
                  <p class="text-sm text-secondary mt-1 mb-3">决定你领悟功法、破解禁制的能力。</p>
                  <input v-model.number="store.talents['talent-wu-xing']" type="range" min="0" max="10" class="form-range w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer talent-slider">
                </div>
                <div class="card rounded-lg p-6 bg-secondary/30">
                  <label class="font-semibold flex items-center justify-between">
                    <span><i class="fas fa-clover text-green-400 mr-2"></i>气运</span>
                    <span class="text-lg font-bold text-blue-400">{{ store.talents['talent-qi-yun'] }}</span>
                  </label>
                  <p class="text-sm text-secondary mt-1 mb-3">影响你遇到奇遇、拾取宝物的概率。</p>
                  <input v-model.number="store.talents['talent-qi-yun']" type="range" min="0" max="10" class="form-range w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer talent-slider">
                </div>
              </div>
            </details>

            <!-- Item Selection -->
            <details class="collapsible-section" :open="isDesktop">
              <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">物品选择</summary>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mt-4">
                <div>
                  <h3 class="font-bold text-base mb-2">背包/仓库 (仙缘点: <span :class="{'text-red-500': store.inventoryRemaining < 0}" class="text-green-400 font-bold">{{ Math.max(0, store.inventoryRemaining) }}</span> / <span class="text-gray-400">5</span>)</h3>
                  <div class="card rounded-lg p-4 sm:p-6 bg-secondary/30">
                    <div class="space-y-3 max-h-60 sm:max-h-72 overflow-y-auto pr-2">
                      <label v-for="item in store.staticData.inventoryItems" :key="item.id" :for="item.id" class="card-checkbox-label" :class="{'has-checked': store.selections.inventory.includes(item.id)}">
                        <input type="checkbox" :id="item.id" :value="item.id" v-model="store.selections.inventory" class="sr-only">
                        <div class="card-checkbox-content">
                          <div class="flex justify-between items-center">
                            <span class="font-semibold text-primary">{{ item.name }}</span>
                            <span class="text-sm font-bold text-green-400">{{ item.points }}点</span>
                          </div>
                          <p class="text-xs text-secondary mt-1">{{ item.description }}</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 class="font-bold text-base mb-2">帆布包 (遗物点: <span :class="{'text-red-500': store.bagRemaining < 0}" class="text-cyan-400 font-bold">{{ Math.max(0, store.bagRemaining) }}</span> / <span class="text-gray-400">5</span>)</h3>
                  <div class="card rounded-lg p-4 sm:p-6 bg-secondary/30">
                    <div class="space-y-3 max-h-60 sm:max-h-72 overflow-y-auto pr-2">
                       <label v-for="item in store.staticData.bagItems" :key="item.id" :for="item.id" class="card-checkbox-label" :class="{'has-checked': store.selections.bag.includes(item.id)}">
                        <input type="checkbox" :id="item.id" :value="item.id" v-model="store.selections.bag" class="sr-only">
                        <div class="card-checkbox-content">
                          <div class="flex justify-between items-center">
                            <span class="font-semibold text-primary">{{ item.name }}</span>
                            <span class="text-sm font-bold text-cyan-400">{{ item.points }}点</span>
                          </div>
                          <p class="text-xs text-secondary mt-1">{{ item.description }}</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <!-- System Selection -->
            <details class="collapsible-section" :open="isDesktop">
              <summary class="font-bold text-lg sm:text-xl mb-4 cursor-pointer text-accent">高级设置 (选择一个游戏内系统)</summary>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <label v-for="option in store.staticData.systems" :key="option.id" :for="option.id" class="card-radio-label" :class="{'has-checked': store.selections.system === option.id}">
                  <input type="radio" :id="option.id" name="system" :value="option.id" v-model="store.selections.system" class="sr-only">
                  <div class="card-radio-content">
                    <div class="flex justify-between items-center">
                      <span class="font-semibold text-primary">{{ option.name }}</span>
                      <span class="text-sm font-bold text-yellow-400">{{ option.points }}点</span>
                    </div>
                    <p class="text-xs text-secondary mt-1">{{ option.description }}</p>
                  </div>
                </label>
              </div>
            </details>

            <!-- Points Summary -->
            <div class="text-center p-4 card rounded-lg bg-secondary/30">
              <h3 class="font-bold text-lg">点数结算</h3>
              <p class="text-sm text-secondary">天赋、仙缘、遗物点数超出部分将自动从环境提供的额外点数中扣除。若额外点数不足，则无法开局。</p>
              <p class="text-lg mt-2">最终剩余点数: <span class="text-yellow-400 font-bold">{{ store.finalExtraRemaining }}</span></p>
            </div>

            <!-- Action Buttons -->
            <div class="text-center flex justify-center items-center space-x-4">
              <button @click="store.loadPreviousSelection" id="load-previous-button" class="btn-secondary py-3 px-8">
                <i class="fas fa-history mr-2"></i>读取上次
              </button>
              <button @click="handleConfirm" :disabled="store.isConfirmDisabled || isProcessing" id="confirm-start-button" class="btn-primary py-3 px-8 disabled:opacity-50 disabled:cursor-not-allowed">
                <i :class="isProcessing ? 'fas fa-spinner fa-spin' : 'fas fa-check-circle'" class="mr-2"></i>
                {{ isProcessing ? '生成中...' : '确认开局' }}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, reactive, computed } from 'vue';
import { useSetupStore } from '../../stores/ui/setupStore';
import { useMainMenuStore } from '../../stores/ui/mainMenuStore';
import { logger } from '../../core/logger';

const store = useSetupStore();
const mainMenuStore = useMainMenuStore();
const isEditingName = ref(false);
const editingName = ref('');
const isProcessing = ref(false);

const isDesktop = computed(() => window.matchMedia('(min-width: 768px)').matches);


onMounted(() => {
  store.loadPreviousSelection();
});

// Watch for any changes and save them automatically
watch(
  () => [store.selections, store.talents, store.characterName, store.customCharacterData],
  () => {
    store.saveCurrentSelection();
  },
  { deep: true }
);

function toggleNameEdit(isEditing: boolean) {
  isEditingName.value = isEditing;
  if (isEditing) {
    editingName.value = store.characterName;
  }
}

function handleNameConfirm() {
  if (editingName.value.trim()) {
    store.characterName = editingName.value.trim();
  }
  toggleNameEdit(false);
}

async function handleConfirm() {
    logger('log', 'SetupScreen', 'handleConfirm triggered.');
    if (store.isConfirmDisabled || isProcessing.value) {
        if (store.isConfirmDisabled) toastr.error('点数分配超出上限！');
        return;
    }
    
    isProcessing.value = true;

    try {
        const finalState = await store.generateInitialState();

        if (finalState) {
            logger('info', 'SetupScreen', 'Setup confirmed. Calling mainMenuStore.handleNewGame with final state.');
            // Directly call the store action instead of emitting an event
            await mainMenuStore.handleNewGame(finalState);
        } else {
            logger('error', 'SetupScreen', 'Failed to generate final state from store.');
            toastr.error('生成开局数据时发生错误，请检查控制台日志。');
        }
    } catch (error) {
        logger('error', 'SetupScreen', 'An error occurred during world generation.', error);
        toastr.error('生成初始世界时发生严重错误，请检查API Key或网络连接，并查看控制台日志。');
    } finally {
        // isProcessing should be set to false by the loading screen logic now,
        // but we keep it here as a fallback.
        isProcessing.value = false;
    }
}

</script>

<style scoped>
/* Scoped styles for this component */
.has-checked {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 1px var(--accent-color);
}
</style>
