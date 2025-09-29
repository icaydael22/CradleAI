<template>
  <div v-if="store.isModalVisible" class="modal-overlay" @click.self="store.hideModal">
    <div class="modal-content modal-content-wide">
      <button @click="store.hideModal" class="modal-close-btn">&times;</button>
      <h3 class="modal-title">历史记录</h3>
      <div class="modal-body" style="padding-top: 0;">
        <!-- Tabs -->
        <div class="flex border-b border-dim mb-2 overflow-x-auto">
          <div class="flex flex-nowrap">
            <div v-for="branch in store.branches" :key="branch.id"
              :class="['main-tab-btn branch-tab', { 'active': branch.isActive }]"
              @click="!branch.isActive && store.switchBranch(branch.id, branch.name)">
              <span>{{ branch.name }}</span>
            </div>
          </div>
          <!-- Graph Tab (Future) -->
          <!-- <div id="history-graph-tab" class="main-tab-btn ml-auto">关系图</div> -->
        </div>

        <!-- Messages Container -->
        <div class="max-h-[70vh] overflow-y-auto pr-2">
          <div v-if="store.turns.length > 0" class="space-y-3 p-1">
            <HistoryTurn v-for="turn in store.turns" :key="turn.turnIndex" :turn="turn" />
          </div>
          <p v-else class="text-secondary text-center p-4">当前分支没有历史记录。</p>

          <!-- Branch Actions -->
          <div v-if="store.activeBranch" class="flex flex-row gap-2 justify-end p-2 mt-4">
            <button @click="store.renameBranch(store.activeBranch.id, store.activeBranch.name)"
              class="btn-secondary btn-sm">
              <i class="fas fa-pencil-alt mr-2"></i>重命名当前分支
            </button>
            <button @click="store.deleteBranch(store.activeBranch.id, store.activeBranch.name)"
              class="btn-danger btn-sm">
              <i class="fas fa-trash-alt mr-2"></i>删除当前分支
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHistoryStore } from '../../stores/ui/historyStore';
import HistoryTurn from './HistoryTurn.vue';

const store = useHistoryStore();

</script>

<style scoped>
/* Styles from index.scss for modals can be used directly */
</style>
