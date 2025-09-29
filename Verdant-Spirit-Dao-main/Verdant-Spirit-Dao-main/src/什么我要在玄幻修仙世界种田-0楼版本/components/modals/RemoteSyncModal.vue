<template>
  <div class="modal-overlay" :class="{ hidden: !store.isRemoteSyncModalOpen }"
    @click.self="store.closeRemoteSyncModal()">
    <div class="modal-content modal-content-wide">
      <button class="modal-close-btn" @click="store.closeRemoteSyncModal()">&times;</button>
      <h3 class="modal-title">
        <i class="fas fa-cloud-sync-alt mr-3"></i>图鉴远程同步
      </h3>
      <div class="modal-body">
        <!-- Tabs -->
        <div class="border-b border-dim mb-4 flex">
          <button class="main-tab-btn" :class="{ active: store.remoteSyncTab === 'submit' }"
            @click="store.remoteSyncTab = 'submit'">
            分享到社区
          </button>
          <button class="main-tab-btn" :class="{ active: store.remoteSyncTab === 'fetch' }"
            @click="store.remoteSyncTab = 'fetch'">
            从社区获取
          </button>
        </div>

        <!-- Tab Content -->
        <div id="remote-sync-tab-content">
          <!-- Submit Tab -->
          <div v-if="store.remoteSyncTab === 'submit'">
            <div v-if="store.isLoading" class="text-center p-4">正在计算差异...</div>
            <div v-else-if="store.localDiff.length === 0" class="text-center p-4 text-secondary">
              恭喜！您的本地图鉴已全部同步至社区。
            </div>
            <div v-else>
              <div class="max-h-60 overflow-y-auto pr-2">
                <div v-for="(group, type) in groupedLocalDiff" :key="type">
                  <h4 class="font-semibold text-primary/90 mt-2 first:mt-0">{{ type }}</h4>
                  <ul>
                    <li v-for="item in group" :key="item.entry.名称"
                      class="p-2 rounded-lg bg-main/50 flex justify-between items-center">
                      <label class="flex items-center cursor-pointer flex-grow mr-4">
                        <input type="checkbox" class="form-checkbox mr-3" v-model="item.selected">
                        <span class="truncate" :title="item.entry.名称">{{ item.entry.名称 }}</span>
                      </label>
                      <div class="space-x-2 flex-shrink-0">
                        <button @click="viewDetails(item.entry)" class="icon-btn" title="查看">
                          <i class="fas fa-eye"></i>
                        </button>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="mt-4 pt-4 border-t border-dim">
                <div class="flex items-center gap-4">
                  <input type="text" v-model="store.providerName" placeholder="提供者署名 (可选)"
                    class="flex-grow bg-secondary border border-dim rounded-md px-3 py-2 text-sm" />
                  <button @click="submitSelected" class="btn-primary" :disabled="selectedLocalItems.length === 0">
                    分享 {{ selectedLocalItems.length }} 个条目
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Fetch Tab -->
          <div v-if="store.remoteSyncTab === 'fetch'">
            <div v-if="store.isLoading" class="text-center p-4">正在从社区获取...</div>
            <div v-else-if="store.remoteDiff.length === 0 && hasFetched" class="text-center p-4 text-secondary">
              恭喜！您的本地图鉴与社区保持同步。
            </div>
            <div v-else-if="store.remoteDiff.length > 0">
              <div class="max-h-60 overflow-y-auto pr-2">
                <div v-for="(group, type) in groupedRemoteDiff" :key="type">
                  <h4 class="font-semibold text-primary/90 mt-2 first:mt-0">{{ type }}</h4>
                  <ul>
                    <li v-for="item in group" :key="item.entry.名称"
                      class="p-2 rounded-lg bg-main/50 flex justify-between items-center">
                      <label class="flex items-center cursor-pointer flex-grow mr-4">
                        <input type="checkbox" class="form-checkbox mr-3" v-model="item.selected">
                        <span class="truncate" :title="item.entry.名称">{{ item.entry.名称 }}</span>
                      </label>
                      <div class="space-x-2 flex-shrink-0">
                        <button @click="viewDetails(item.entry)" class="icon-btn" title="查看">
                          <i class="fas fa-eye"></i>
                        </button>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="mt-4 pt-4 border-t border-dim text-right">
                <button @click="importSelected" class="btn-primary" :disabled="selectedRemoteItems.length === 0">
                  导入 {{ selectedRemoteItems.length }} 个条目
                </button>
              </div>
            </div>
            <div v-else class="text-center p-4 text-secondary">
              <button @click="fetchRemote" class="btn-secondary">
                <i class="fas fa-download mr-2"></i>从社区获取列表
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PokedexEntry } from '../../core/pokedex';
import { usePokedexStore } from '../../stores/systems/pokedexStore';
import { useDetailsStore } from '../../stores/ui/detailsStore';

const store = usePokedexStore();
const detailsStore = useDetailsStore();

const hasFetched = ref(false);

// --- Computed Properties for UI ---

const groupedLocalDiff = computed(() => {
  return store.localDiff.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, any[]>);
});

const groupedRemoteDiff = computed(() => {
  return store.remoteDiff.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, any[]>);
});

const selectedLocalItems = computed(() => store.localDiff.filter(item => item.selected));
const selectedRemoteItems = computed(() => store.remoteDiff.filter(item => item.selected));

// --- Methods ---

const viewDetails = (entry: PokedexEntry) => {
  detailsStore.showDetails(entry);
};

const submitSelected = () => {
  const itemsToSubmit = selectedLocalItems.value.map(item => ({
    type: item.type,
    name: item.entry.名称,
  }));
  store.submitToRemote(itemsToSubmit);
};

const importSelected = () => {
  const itemsToImport = selectedRemoteItems.value.map(item => ({
    type: item.type,
    name: item.entry.名称,
  }));
  store.importFromRemote(itemsToImport);
};

const fetchRemote = async () => {
  await store.calculateRemoteDiff();
  hasFetched.value = true;
};

// --- Watchers ---

watch(() => store.isRemoteSyncModalOpen, (isOpen) => {
  if (isOpen) {
    store.remoteSyncTab = 'submit';
    hasFetched.value = false;
    store.calculateLocalDiff();
  }
});

watch(() => store.remoteSyncTab, (newTab) => {
  if (newTab === 'submit') {
    store.calculateLocalDiff();
  } else {
    // Reset remote diff until user clicks fetch
    store.remoteDiff = [];
    hasFetched.value = false;
  }
});

</script>
