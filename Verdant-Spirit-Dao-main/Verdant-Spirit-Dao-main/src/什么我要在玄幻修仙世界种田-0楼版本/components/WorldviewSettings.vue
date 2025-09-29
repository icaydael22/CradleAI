<template>
  <div class="h-full w-full max-w-5xl mx-auto flex flex-col">
    <div class="flex justify-between items-center mb-6">
      <button @click="$emit('back')" class="btn-secondary"><i class="fas fa-arrow-left mr-2"></i>返回菜单</button>
      <div>
        <button @click="resetSettings" class="btn-secondary mr-4">恢复默认</button>
        <button @click="saveSettings" class="btn-primary">保存设定</button>
      </div>
    </div>
    <div class="relative rounded-xl p-6 sm:p-8 world-bg world-panel-box overflow-y-auto flex-grow min-h-0">
      <div class="relative z-10 prose-custom max-w-none">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl sm:text-3xl font-bold panel-title !p-0 !border-none">世界观设定</h2>
          <div class="flex items-center">
            <label for="preset-select" class="text-sm font-medium text-primary mr-2 whitespace-nowrap">加载预设:</label>
            <select id="preset-select" @change="applySelectedPreset($event)" class="form-input">
              <option disabled selected value="">选择...</option>
              <option v-for="preset in worldviewPresets" :key="preset.name" :value="preset.name">
                {{ preset.name }}
              </option>
            </select>
          </div>
        </div>
        <p class="text-secondary">在这里，你可以自定义游戏的核心世界观。这些设定将被保存，并用于指导AI生成更符合你喜好的故事。</p>

        <div class="space-y-6 mt-8">
          <!-- General Settings -->
          <details class="group panel-box !p-0" open>
            <summary class="panel-title cursor-pointer">
              <h3 class="text-xl font-bold flex items-center"><i class="fas fa-globe-asia text-accent mr-3"></i>基本信息
              </h3>
              <div class="transform transition-transform duration-300 group-open:rotate-180">
                <i class="fas fa-chevron-down"></i>
              </div>
            </summary>
            <div class="panel-body">
              <div class="grid md:grid-cols-2 gap-6">
                <div>
                  <label for="worldName" class="block text-sm font-medium text-primary mb-2">世界名称</label>
                  <input type="text" id="worldName" v-model="localSettings.worldName" class="form-input w-full">
                </div>
                <div>
                  <label for="powerSystemName" class="block text-sm font-medium text-primary mb-2">异世力量</label>
                  <input type="text" id="powerSystemName" v-model="localSettings.powerSystem.name"
                    class="form-input w-full">
                </div>
                <div class="md:col-span-2">
                  <label for="worldDescription" class="block text-sm font-medium text-primary mb-2">世界观简述</label>
                  <textarea id="worldDescription" v-model="localSettings.description" rows="3"
                    class="form-input w-full"></textarea>
                </div>
                <div class="md:col-span-2">
                  <label for="powerSystemDescription" class="block text-sm font-medium text-primary mb-2">力量描述</label>
                  <textarea id="powerSystemDescription" v-model="localSettings.powerSystem.description" rows="3"
                    class="form-input w-full"></textarea>
                </div>
              </div>
            </div>
          </details>

          <!-- Cultivation Ranks -->
          <details class="group panel-box !p-0">
            <summary class="panel-title cursor-pointer">
              <h3 class="text-xl font-bold flex items-center"><i class="fas fa-fist-raised text-accent mr-3"></i>修炼等阶
              </h3>
              <div class="transform transition-transform duration-300 group-open:rotate-180">
                <i class="fas fa-chevron-down"></i>
              </div>
            </summary>
            <div class="panel-body space-y-4 max-h-72 overflow-y-auto">
              <div v-for="(rank, index) in localSettings.cultivationRanks" :key="index" class="flex items-start gap-4">
                <div class="p-4 border border-dim rounded-lg bg-secondary flex-grow">
                  <div class="grid grid-cols-3 gap-4 items-center">
                    <input type="text" v-model="rank.name" placeholder="境界名称" class="form-input col-span-1">
                    <input type="text" v-model="rank.description" placeholder="境界描述" class="form-input col-span-2">
                  </div>
                  <div class="mt-4">
                    <label class="block text-sm font-medium text-primary mb-2">子层级 (用英文逗号分隔)</label>
                    <input type="text" :value="rank.levels.join(',')"
                      @input="rank.levels = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim())"
                      class="form-input w-full">
                  </div>
                </div>
                <button @click="removeCultivationRank(index)"
                  class="btn-secondary btn-sm !p-2 h-fit mt-4 flex-shrink-0">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div class="mt-4">
                <button @click="addCultivationRank" class="btn-secondary btn-sm">
                  <i class="fas fa-plus mr-2"></i>添加境界
                </button>
              </div>
            </div>
          </details>

          <!-- Item Ranks -->
          <details class="group panel-box !p-0">
            <summary class="panel-title cursor-pointer">
              <h3 class="text-xl font-bold flex items-center"><i class="fas fa-gem text-accent mr-3"></i>物品等阶</h3>
              <div class="transform transition-transform duration-300 group-open:rotate-180">
                <i class="fas fa-chevron-down"></i>
              </div>
            </summary>
            <div class="panel-body">
              <div class="flex border-b border-dim mb-4">
                <button v-for="(system, index) in localSettings.itemRankSystems" :key="index"
                  @click="activeItemSystemIndex = index"
                  :class="['tab-btn', { 'active': activeItemSystemIndex === index }]">
                  {{ system.systemName }}
                </button>
                <button @click="addItemSystem" class="ml-4 btn-secondary btn-sm h-fit">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
              <div v-if="activeItemSystem" class="space-y-4 max-h-72 overflow-y-auto">
                <div class="flex items-center gap-4">
                  <input type="text" v-model="activeItemSystem.systemName" placeholder="体系名称"
                    class="form-input font-bold">
                  <button @click="removeItemSystem(activeItemSystemIndex)"
                    class="btn-secondary btn-sm !p-2 h-fit flex-shrink-0">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                <div v-for="(rank, index) in activeItemSystem.ranks" :key="index" class="flex items-start gap-4">
                  <div class="p-4 border border-dim rounded-lg bg-secondary flex-grow">
                    <div class="grid grid-cols-3 gap-4 items-center">
                      <input type="text" v-model="rank.name" placeholder="大境界名称" class="form-input col-span-1">
                      <input type="text" v-model="rank.description" placeholder="大境界描述" class="form-input col-span-2">
                    </div>
                    <div class="mt-4">
                      <label class="block text-sm font-medium text-primary mb-2">子层级 (用英文逗号分隔)</label>
                      <input type="text" :value="rank.levels.join(',')"
                        @input="rank.levels = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim())"
                        class="form-input w-full">
                    </div>
                  </div>
                  <button @click="removeItemRank(index)" class="btn-secondary btn-sm !p-2 h-fit mt-4 flex-shrink-0">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                <div class="mt-4">
                  <button @click="addItemRank" class="btn-secondary btn-sm">
                    <i class="fas fa-plus mr-2"></i>添加物品大境界
                  </button>
                </div>
              </div>
            </div>
          </details>

          <!-- Professions -->
          <details class="group panel-box !p-0">
            <summary class="panel-title cursor-pointer">
              <h3 class="text-xl font-bold flex items-center"><i class="fas fa-user-tie text-accent mr-3"></i>多元职业</h3>
              <div class="transform transition-transform duration-300 group-open:rotate-180">
                <i class="fas fa-chevron-down"></i>
              </div>
            </summary>
            <div class="panel-body space-y-4 max-h-72 overflow-y-auto">
              <div v-for="(prof, index) in localSettings.professions" :key="index" class="flex items-center gap-4">
                <div class="grid grid-cols-3 gap-4 flex-grow">
                  <input type="text" v-model="prof.category" placeholder="职业类别" class="form-input col-span-1">
                  <input type="text" v-model="prof.list" placeholder="职业列表 (用顿号分隔)" class="form-input col-span-2">
                </div>
                <button @click="removeProfession(index)" class="btn-secondary btn-sm !p-2 h-fit flex-shrink-0">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div class="mt-4">
                <button @click="addProfession" class="btn-secondary btn-sm">
                  <i class="fas fa-plus mr-2"></i>添加职业类别
                </button>
              </div>
            </div>
          </details>

          <!-- Fixed Setting -->
          <div class="panel-box !p-6">
            <h4 class="font-bold text-xl mb-3 flex items-center"><i
                class="fas fa-map-marked-alt text-purple-400 mr-3"></i>开场舞台：洄潮屿 (不可修改)</h4>
            <p class="text-secondary">位于无妄海东部，洋流交汇之地的隐秘洞天。表象平凡，内藏玄机。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { IWorldviewDefinition } from '../data/worldview-data';
import { worldviewPresets } from '../data/worldview-presets-data';
import _ from 'lodash';

const props = defineProps<{
  settings: IWorldviewDefinition;
}>();

const emit = defineEmits(['save', 'reset', 'back']);

const localSettings = ref<IWorldviewDefinition>(_.cloneDeep(props.settings));
const activeItemSystemIndex = ref(0);

const activeItemSystem = computed(() => {
  return localSettings.value.itemRankSystems[activeItemSystemIndex.value];
});

watch(() => props.settings, (newSettings) => {
  localSettings.value = _.cloneDeep(newSettings);
}, { deep: true });

function saveSettings() {
  emit('save', localSettings.value);
}

function resetSettings() {
  emit('reset');
}

function applySelectedPreset(event: Event) {
  const selectElement = event.target as HTMLSelectElement;
  const selectedName = selectElement.value;
  const selectedPreset = worldviewPresets.find(p => p.name === selectedName);

  if (selectedPreset) {
    if (confirm(`确定要加载 “${selectedName}” 预设吗？这会覆盖您当前的自定义设定。`)) {
      localSettings.value = _.cloneDeep(selectedPreset.worldview);
      toastr.success(`已加载预设: ${selectedName}`);
    }
    // Reset select to the placeholder option to allow re-selection of the same preset
    selectElement.value = "";
  }
}

// Functions to add/remove cultivation ranks
function addCultivationRank() {
  localSettings.value.cultivationRanks.push({ name: '', description: '', levels: [] });
}
function removeCultivationRank(index: number) {
  localSettings.value.cultivationRanks.splice(index, 1);
}

// Functions to add/remove item rank systems and ranks
function addItemSystem() {
  localSettings.value.itemRankSystems.push({ systemName: '新体系', ranks: [] });
  activeItemSystemIndex.value = localSettings.value.itemRankSystems.length - 1;
}
function removeItemSystem(index: number) {
  if (confirm(`确定要删除 “${localSettings.value.itemRankSystems[index].systemName}” 这个物品体系吗？`)) {
    localSettings.value.itemRankSystems.splice(index, 1);
    if (activeItemSystemIndex.value >= localSettings.value.itemRankSystems.length) {
      activeItemSystemIndex.value = Math.max(0, localSettings.value.itemRankSystems.length - 1);
    }
  }
}
function addItemRank() {
  if (activeItemSystem.value) {
    activeItemSystem.value.ranks.push({ name: '', description: '', levels: [] });
  }
}
function removeItemRank(rankIndex: number) {
  if (activeItemSystem.value) {
    activeItemSystem.value.ranks.splice(rankIndex, 1);
  }
}

// Functions to add/remove professions
function addProfession() {
  localSettings.value.professions.push({ category: '', list: '' });
}
function removeProfession(index: number) {
  localSettings.value.professions.splice(index, 1);
}
</script>

<style scoped>
.form-input {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  transition: all 0.2s ease;
}
.form-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 30%, transparent);
}

.world-bg {
  background-image: radial-gradient(circle at top right, color-mix(in srgb, var(--accent-color) 10%, transparent) 0%, transparent 50%);
}

.world-panel-box {
  background-color: var(--bg-card);
  border-radius: 1rem;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  overflow: auto;
  /* 确保子元素不会溢出圆角 */
  display: flex;
  flex-direction: column;
  height: 90vh;
}

details > summary {
  list-style: none;
}
details > summary::-webkit-details-marker {
  display: none;
}
</style>
