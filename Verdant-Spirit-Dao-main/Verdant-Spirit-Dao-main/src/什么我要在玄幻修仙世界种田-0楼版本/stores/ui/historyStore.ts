import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatHistoryManager, Branch, Turn, MessagePage } from '../../core/history';

declare const toastr: any;

// 为前端显示扩展Turn接口
export interface DisplayTurn extends Turn {
  turnIndex: number;
}

export const useHistoryStore = defineStore('history', () => {
  // --- State ---
  const historyManager = ref<ChatHistoryManager | null>(null);
  const branches = ref<Branch[]>([]);
  const activeBranchId = ref<string | null>(null);
  const turns = ref<DisplayTurn[]>([]);
  const isModalVisible = ref(false);
  const activeTab = ref<'messages' | 'graph'>('messages');

  // --- Getters ---
  const activeBranch = computed(() => branches.value.find((b: Branch) => b.isActive));

  // --- Internal Helpers ---
  function getManager(): any {
    if (!historyManager.value) {
      // @ts-ignore - Assuming storyRenderer is available on window
      historyManager.value = window.storyRenderer.getHistoryManager();
    }
    return historyManager.value!;
  }

  // --- Actions ---
  async function loadHistoryData() {
    const manager = getManager();
    await manager.loadHistory();
    
    branches.value = manager.getBranches();
    const currentActiveBranchId = manager.getActiveBranchId();
    activeBranchId.value = currentActiveBranchId;
    
    // @ts-ignore - Accessing private history for now. A public method would be better.
    const rawTurns = manager.history.branches[currentActiveBranchId!];
    const turnIndices = Object.keys(rawTurns).map(Number).sort((a, b) => a - b);
    
    turns.value = turnIndices.map(index => ({
      ...rawTurns[index],
      turnIndex: index,
    }));
  }

  async function showModal() {
    await loadHistoryData();
    isModalVisible.value = true;
    activeTab.value = 'messages';
  }

  function hideModal() {
    isModalVisible.value = false;
  }

  async function switchBranch(branchId: string, branchName: string) {
    toastr.warning('分支功能暂未开放，敬请期待！');
    /*
    if (confirm(`确定要加载分支 "${branchName}" 吗？\n游戏状态将同步至该分支的最新进度。`)) {
      try {
        const manager = getManager();
        await manager.switchBranch(branchId);
        
        const messages = manager.getMessagesForPrompt();
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage) {
          throw new Error('新分支没有任何消息，无法进行状态重算。');
        }

        // 派发事件，让应用主逻辑处理状态重算
        // The manager is a live object and can be retrieved from the global scope in the handler.
        // Passing it through the event detail might cause issues if the event object is cloned or inspected.
        window.dispatchEvent(new CustomEvent('branchChanged', {
          detail: {
            targetMessageId: lastMessage.id,
          }
        }));
        
        toastr.success(`已切换到分支 "${branchName}"！`);
        hideModal();
        await loadHistoryData();

      } catch (error) {
        console.error('Failed to switch branch:', error);
        toastr.error(`切换分支失败: ${error}`);
      }
    }
    */
  }

  async function renameBranch(branchId: string, oldName: string) {
    toastr.warning('分支功能暂未开放，敬请期待！');
    /*
    const newName = prompt(`为分支 "${oldName}" 输入新名称:`, oldName);
    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
      try {
        await getManager().renameBranch(branchId, newName.trim());
        toastr.success('分支已重命名！');
        await loadHistoryData(); // Refresh data
      } catch (error: any) {
        console.error('Failed to rename branch:', error);
        toastr.error(`重命名失败: ${error.message}`);
      }
    }
    */
  }

  async function deleteBranch(branchId: string, branchName: string) {
    toastr.warning('分支功能暂未开放，敬请期待！');
    /*
    if (confirm(`确定要永久删除分支 "${branchName}" 吗？\n此操作不可逆！`)) {
      try {
        await getManager().deleteBranch(branchId);
        toastr.success('分支已删除！正在刷新...');
        setTimeout(() => window.location.reload(), 1500);
      } catch (error: any) {
        console.error('Failed to delete branch:', error);
        toastr.error(`删除失败: ${error.message}`);
      }
    }
    */
  }

  async function createBranchFromTurn(turnIndex: number) {
    toastr.warning('分支功能暂未开放，敬请期待！');
    /*
    if (confirm(`确定要从第 ${turnIndex + 1} 回合创建新的故事分支吗？\n游戏状态将同步至该时间点。`)) {
      try {
        const manager = getManager();
        const newBranchId = await manager.createBranch(turnIndex);
        
        const messages = manager.getMessagesForPrompt();
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage) {
          throw new Error('新创建的分支没有任何消息，无法进行状态重算。');
        }

        // 派发事件，让应用主逻辑处理状态重算
        // The manager is a live object and can be retrieved from the global scope in the handler.
        // Passing it through the event detail might cause issues if the event object is cloned or inspected.
        window.dispatchEvent(new CustomEvent('branchChanged', {
          detail: {
            targetMessageId: lastMessage.id,
          }
        }));

        toastr.success(`新分支 "${newBranchId}" 已成功创建！`);
        hideModal();
        await loadHistoryData();

      } catch (error) {
        console.error('Failed to create branch:', error);
        toastr.error(`创建分支失败: ${error}`);
      }
    }
    */
  }

  async function deleteTurn(
    turnIndex: number,
    // 依赖注入，方便测试
    confirmFn = window.confirm,
    storyRenderer = window.storyRenderer
  ) {
    if (confirmFn(`确定要删除第 ${turnIndex + 1} 回合吗？\n此操作在当前分支上不可逆！`)) {
      try {
        await getManager().deleteTurn(turnIndex);
        toastr.success('回合已成功删除！');
        await loadHistoryData(); // Refresh data
        if (storyRenderer) {
            storyRenderer.init();
        }
      } catch (error) {
        console.error('Failed to delete turn:', error);
        toastr.error('删除回合失败，请查看控制台获取详情。');
      }
    }
  }

  async function updateMessageContent(
    messageId: string,
    newContent: string,
    // 依赖注入，方便测试
    dispatchEventFn = window.dispatchEvent.bind(window)
  ) {
    try {
      const manager = getManager();
      await manager.updateMessagePageContent(messageId, newContent);

      const messages = manager.getMessagesForPrompt();
      const lastMessage = messages[messages.length - 1];

      if (lastMessage) {
        dispatchEventFn(new CustomEvent('branchChanged', {
          detail: {
            targetMessageId: lastMessage.id,
          }
        }));
        toastr.success(`消息已保存！正在重新计算状态...`);
      } else {
        toastr.warning('消息已保存，但无法找到最新消息来进行状态重算。');
      }

      await loadHistoryData(); // 刷新UI中的历史记录显示
    } catch (error) {
      console.error('Failed to save message and recalculate state:', error);
      toastr.error('保存消息失败，请查看控制台。');
    }
  }

  return {
    // State
    branches,
    activeBranchId,
    turns,
    isModalVisible,
    activeTab,
    // Getters
    activeBranch,
    // Actions
    showModal,
    hideModal,
    switchBranch,
    renameBranch,
    deleteBranch,
    createBranchFromTurn,
    deleteTurn,
    updateMessageContent,
    loadHistoryData,
  };
});
