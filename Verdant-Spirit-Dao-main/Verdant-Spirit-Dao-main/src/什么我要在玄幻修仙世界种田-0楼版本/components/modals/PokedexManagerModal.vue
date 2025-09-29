<template>
  <div v-if="store.isManagerModalOpen" class="modal-overlay">
    <div class="modal-content modal-content-wide">
      <button @click="store.closeManagerModal()" class="modal-close-btn">&times;</button>
      <h3 class="modal-title">
        <span>图鉴管理</span>
        <button @click="toggleHelp" class="help-btn" :class="{ active: isHelpVisible }" title="帮助">
          <i class="fas fa-question"></i>
        </button>
      </h3>
      <div class="modal-body">
        <!-- 帮助信息 -->
        <div v-if="isHelpVisible" class="p-3 mb-4 text-xs rounded-lg bg-secondary/50 text-secondary border border-dim">
          <p class="font-bold mb-2 text-primary/80">图鉴管理功能说明:</p>
          <ul class="list-disc list-inside space-y-1">
            <li><b>图鉴总览:</b> 查看、编辑或删除已收录的所有图鉴条目。勾选条目后，点击下方的“注入选中项”按钮，可以将这些信息添加到当前楼层的变量中，让AI在下一次回应时“知道”这些内容。</li>
            <li><b>添加条目:</b> 通过表单或JSON模式，手动向你的全局图鉴数据库中添加新的条目。</li>
            <li><b>待收录条目:</b> 这里会自动列出当前楼层新出现的、但尚未被收录到全局图鉴的条目，方便你一键收录。</li>
            <li><b>远程同步:</b> 与社区服务器进行数据交换，可以分享你独有的条目，也可以从社区获取他人分享的内容来丰富你的图鉴。</li>
          </ul>
        </div>

        <!-- 主功能Tabs -->
        <div class="flex border-b border-dim mb-4">
          <button @click="store.managerTab = 'view'" class="main-tab-btn"
            :class="{ active: store.managerTab === 'view' }">图鉴总览</button>
          <button @click="store.managerTab = 'add'" class="main-tab-btn"
            :class="{ active: store.managerTab === 'add' }">添加条目</button>
        </div>

        <!-- Loading Spinner -->
        <div v-if="store.isLoading" class="flex justify-center items-center p-8">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
        </div>

        <!-- 内容区域 -->
        <div v-else>
          <!-- 查看 & 注入 Tab -->
          <div v-show="store.managerTab === 'view'">
            <!-- 待收录条目 -->
            <div v-if="store.newDiscoveries.length > 0" class="mb-4">
              <h4 class="font-bold text-lg mb-2 text-accent flex justify-between items-center">
                <span><i class="fas fa-lightbulb mr-2"></i>待收录条目</span>
                <button @click="handleApproveDiscoveries" class="btn-secondary text-xs py-1 px-2">
                  <i class="fas fa-check-double mr-1"></i>一键收录选中项
                </button>
              </h4>
              <div class="max-h-40 overflow-y-auto pr-2 border border-dim rounded-lg p-2 bg-secondary/30">
                <div v-for="group in groupedDiscoveries" :key="group.type">
                  <h4 class="font-semibold text-primary/90 mt-2 first:mt-0">{{ group.type }}</h4>
                  <ul>
                    <li v-for="item in group.entries" :key="item.entry.名称" class="p-2 rounded-lg bg-main/50">
                      <label class="flex items-center cursor-pointer">
                        <input type="checkbox" class="form-checkbox mr-3" v-model="selectedDiscoveries" :value="item">
                        <span>{{ item.entry.名称 }}</span>
                      </label>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <!-- 待审核条目 -->
            <div v-if="store.pendingReviewItems.length > 0" class="mb-4">
              <h4 class="font-bold text-lg mb-2 text-yellow-400 flex justify-between items-center">
                <span><i class="fas fa-gavel mr-2"></i>待审核条目</span>
              </h4>
              <div class="max-h-40 overflow-y-auto pr-2 border border-dim rounded-lg p-2 bg-secondary/30">
                <ul class="space-y-2">
                  <li v-for="(item, index) in store.pendingReviewItems" :key="`${item.type}-${item.entry.名称}`"
                    class="p-2 rounded-lg bg-main/50 flex justify-between items-center">
                    <span class="truncate" :title="item.entry.名称">[{{ item.type }}] {{ item.entry.名称 }}</span>
                    <div class="space-x-2 flex-shrink-0">
                      <button @click="handleEditEntry(item.type, item.entry)" class="icon-btn" title="编辑"><i
                          class="fas fa-pencil-alt"></i></button>
                      <button @click="store.approvePendingItem(index)"
                        class="icon-btn text-green-500 hover:text-green-400" title="确认录入"><i
                          class="fas fa-check"></i></button>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <hr class="my-4 border-t border-dim theme-transition">

            <!-- 搜索框 -->
            <div class="mb-4">
              <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-3">
                  <i class="fas fa-search text-secondary"></i>
                </span>
                <input type="text" v-model="searchQuery" @input="handleSearch" placeholder="搜索图鉴、成就..."
                  class="w-full p-3 pl-10 rounded-lg bg-main/50 border-2 border-dim focus:ring-accent focus:border-accent theme-transition" />
              </div>
            </div>

            <!-- 图鉴列表 -->
            <div id="existing-pokedex-list" v-if="!searchQuery">
              <PokedexViewList v-for="type in pokedexTypes" :key="type" :title="`${type}图鉴`" :type="type"
                :entries="store.globalPokedex?.[type] || []" v-model="selectedInjectItems" @view="handleViewDetails"
                @edit="handleEditEntry(type, $event)" @delete="handleDeleteEntry(type, $event)" />
              <!-- 成就列表 -->
              <details class="group" open>
                <summary
                  class="font-bold text-lg cursor-pointer hover:text-accent transition-colors theme-transition flex justify-between items-center py-2">
                  成就图鉴 (已解锁 {{ store.achievements.length }}, 共 {{ store.achievementPoints }} 点)
                  <i class="fas fa-chevron-down transition-transform duration-300 group-open:rotate-180"></i>
                </summary>
                <ul class="space-y-2 mt-2">
                  <li v-if="store.achievements.length === 0" class="text-secondary text-sm italic p-2">尚未解锁任何成就</li>
                  <li v-for="ach in store.achievements" :key="ach.名称"
                    class="p-3 rounded-lg bg-secondary/50 border border-dim flex justify-between items-center">
                    <div class="flex-grow">
                      <p class="font-semibold text-primary flex justify-between items-center">
                        <span><i class="fas fa-trophy mr-2 text-yellow-400"></i>{{ ach.名称 }}</span>
                        <span class="text-xs font-normal text-secondary">{{ ach.日期 || '' }}</span>
                      </p>
                      <p class="text-sm text-secondary mt-1 pl-6">{{ ach.描述 || '没有描述。' }}</p>
                    </div>
                    <div class="space-x-2 flex-shrink-0 ml-4">
                      <button @click="handleEditEntry('成就', ach)" class="icon-btn" title="编辑"><i
                          class="fas fa-pencil-alt"></i></button>
                      <button @click="handleDeleteEntry('成就', ach)" class="icon-btn text-red-500 hover:text-red-400"
                        title="删除"><i class="fas fa-trash"></i></button>
                    </div>
                  </li>
                </ul>
              </details>
            </div>

            <!-- 搜索结果 -->
            <div v-else id="search-results-list">
              <ul class="space-y-2">
                <li v-if="searchResults.length === 0 && searchQuery" class="text-secondary text-sm italic p-2 text-center">
                  没有找到与 "{{ searchQuery }}" 匹配的条目
                </li>
                <li v-for="result in searchResults" :key="`${result.item.type}-${result.item.名称}`"
                  class="py-4 border-b border-dim last:border-b-0">
                  <div class="flex justify-between items-center">
                    <div class="flex-grow overflow-hidden">
                      <p class="font-semibold text-primary truncate">
                        <span class="text-xs font-mono mr-2 p-1 rounded bg-main/50 text-accent/80">{{ result.item.type
                        }}</span>
                        {{ result.item.名称 }}
                      </p>
                      <p class="text-sm text-secondary mt-1 pl-4 truncate">{{ result.item.描述 || '没有描述。' }}</p>
                    </div>
                    <div class="space-x-2 flex-shrink-0 ml-4">
                    <button @click="handleViewDetails(result.item)" class="icon-btn" title="查看详情"><i
                        class="fas fa-eye"></i></button>
                    <button @click="handleEditEntry(result.item.type, result.item)" class="icon-btn" title="编辑"><i
                        class="fas fa-pencil-alt"></i></button>
                    <button @click="handleDeleteEntry(result.item.type, result.item)"
                      class="icon-btn text-red-500 hover:text-red-400" title="删除"><i class="fas fa-trash"></i></button>
                    </div>
                  </div>
                  <!-- Debug Info -->
                  <details class="mt-2 text-xs">
                    <summary class="cursor-pointer text-secondary hover:text-primary">显示匹配详情</summary>
                    <pre
                      class="mt-1 p-2 rounded bg-main/50 text-secondary/80 overflow-x-auto text-xs"><code>{{ JSON.stringify(result.matches, null, 2) }}</code></pre>
                  </details>
                </li>
              </ul>
            </div>
          </div>

          <!-- 添加新条目 Tab -->
          <div v-show="store.managerTab === 'add'">
            <AddEntryForm ref="addForm" />
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="flex justify-end mt-4 pt-4 border-t border-dim">
        <button @click="openRemoteSync" class="btn-secondary mr-auto">
          <i class="fas fa-cloud-upload-alt mr-2"></i>远程同步
        </button>
        <button v-if="store.managerTab === 'view'" @click="handleInject" class="btn-primary">
          <i class="fas fa-sign-in-alt mr-2"></i>注入选中项
        </button>
        <button v-if="store.managerTab === 'add'" @click="handleSubmitEntry" class="btn-primary">
          <i class="fas fa-plus mr-2"></i>{{ editingEntryOriginalName ? '确认更新' : '确认添加' }}
        </button>
      </div>
    </div>
  </div>
  <RemoteSyncModal />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { PokedexEntry, PokedexType } from '../../core/pokedex';
import { logger } from '../../core/logger';
import { useDetailsStore } from '../../stores/ui/detailsStore';
import { usePokedexStore } from '../../stores/systems/pokedexStore';
import { useSearchStore } from '../../stores/modules/searchStore';
import AddEntryForm from '../pokedex/AddEntryForm.vue';
import PokedexViewList from '../pokedex/PokedexViewList.vue';
import RemoteSyncModal from './RemoteSyncModal.vue';

declare const toastr: any;

const store = usePokedexStore();
const searchStore = useSearchStore();
const detailsStore = useDetailsStore();
const isHelpVisible = ref(false);
const selectedDiscoveries = ref<{ type: PokedexType, entry: PokedexEntry }[]>([]);
const selectedInjectItems = ref<{ type: PokedexType, name: string }[]>([]);
const addForm = ref<InstanceType<typeof AddEntryForm> | null>(null);
const editingEntryOriginalName = ref<string | null>(null);

const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const handleSearch = () => {
  logger('log', 'PokedexUI', `[ManagerModal] Searching for: "${searchQuery.value}"`);
  searchResults.value = searchStore.search('knowledge', searchQuery.value);
};

const pokedexTypes = computed(() => ['妖兽', '植物', '物品', '书籍'] as PokedexType[]);

const groupedDiscoveries = computed(() => {
  return store.newDiscoveries.reduce((acc, item) => {
    let group = acc.find(g => g.type === item.type);
    if (!group) {
      group = { type: item.type, entries: [] };
      acc.push(group);
    }
    group.entries.push(item);
    return acc;
  }, [] as { type: PokedexType, entries: { type: PokedexType, entry: PokedexEntry }[] }[]);
});

const toggleHelp = () => {
  isHelpVisible.value = !isHelpVisible.value;
};

const handleApproveDiscoveries = () => {
  const itemsToApprove = selectedDiscoveries.value.map(d => ({ type: d.type, name: d.entry.名称 }));
  logger('log', 'PokedexUI', `[ManagerModal] User clicked "Approve Discoveries" for ${itemsToApprove.length} items.`, itemsToApprove);
  store.approveDiscoveries(itemsToApprove);
  selectedDiscoveries.value = [];
};

const handleEditPending = (item: { type: PokedexType | '成就', entry: PokedexEntry }) => {
  handleEditEntry(item.type, item.entry);
};

const handleInject = () => {
  logger('log', 'PokedexUI', `[ManagerModal] User clicked "Inject Entries" for ${selectedInjectItems.value.length} items.`, selectedInjectItems.value);
  store.injectEntries(selectedInjectItems.value);
  selectedInjectItems.value = [];
};

const handleViewDetails = (entry: PokedexEntry) => {
  detailsStore.showDetails(entry);
};

const handleEditEntry = (type: PokedexType | '成就', entry: PokedexEntry) => {
  logger('log', 'PokedexUI', `[ManagerModal] User clicked "Edit Entry" for [${type}] ${entry.名称}. Opening details modal.`, entry);
  store.editPokedexEntry(type, entry.名称);
};

const handleEditInForm = (type: PokedexType | '成就', entry: PokedexEntry) => {
  logger('log', 'PokedexUI', `[ManagerModal] User clicked "Edit In Form" for [${type}] ${entry.名称}. Switching to add tab.`, entry);
  store.managerTab = 'add';
  editingEntryOriginalName.value = entry.名称;
  nextTick(() => {
    addForm.value?.setEntryForEdit(type, entry);
  });
};

const handleDeleteEntry = (type: PokedexType | '成就', entry: PokedexEntry) => {
  logger('log', 'PokedexUI', `[ManagerModal] User clicked "Delete Entry" for [${type}] ${entry.名称}.`);
  store.deleteEntry(type, entry.名称);
};

const handleSubmitEntry = async () => {
  const result = addForm.value?.getEntryData();
  if (!result) return;

  logger('log', 'PokedexUI', `[ManagerModal] User clicked "Submit Entry". Editing: ${!!editingEntryOriginalName.value}. Data:`, result);

  if (result.error) {
    toastr.error(result.error);
    return;
  }

  if ('entries' in result) { // JSON mode
    for (const entry of result.entries) {
      await store.createOrUpdateEntry(result.type, entry);
    }
  } else { // Form mode
    await store.createOrUpdateEntry(result.type, result.entry, editingEntryOriginalName.value ?? undefined);
  }

  editingEntryOriginalName.value = null;
  addForm.value?.resetFormFields();
  store.managerTab = 'view';
};

const openRemoteSync = () => {
  store.openRemoteSyncModal();
};

</script>

<style scoped>
/* Scoped styles can be added here if needed */
</style>
