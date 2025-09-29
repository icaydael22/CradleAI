import { defineStore } from 'pinia';
import { ref } from 'vue';
import { checkForUpdates, LOCAL_VERSION, updateCardFiles } from '../../core/version';
import { logger } from '../../core/logger';

declare const toastr: any;

export const useVersionStore = defineStore('version', () => {
  // State
  const isModalVisible = ref(false);
  const isLoading = ref(false);
  const isUpdating = ref(false);
  
  const localVersion = ref(LOCAL_VERSION);
  const remoteVersion = ref('');
  const hasUpdate = ref(false);
  const changelogHtml = ref('');
  const filesToUpdate = ref<string[]>([]);

  // Actions
  async function openModal() {
    isModalVisible.value = true;
    isLoading.value = true;
    logger('info', 'VersionStore', 'Opening version modal and checking for updates...');
    try {
      const updateInfo = await checkForUpdates();
      if (updateInfo) {
        remoteVersion.value = updateInfo.remoteVersion;
        hasUpdate.value = updateInfo.hasUpdate;
        changelogHtml.value = updateInfo.changelogHtml || '<p>未能加载更新日志。</p>';
        filesToUpdate.value = updateInfo.filesToUpdate || [];
        logger('info', 'VersionStore', 'Update check complete.', updateInfo);
      } else {
        changelogHtml.value = '<p>检查更新失败，请稍后再试。</p>';
        logger('error', 'VersionStore', 'checkForUpdates returned null.');
      }
    } catch (error) {
      logger('error', 'VersionStore', 'An error occurred while checking for updates.', error);
      changelogHtml.value = '<p>检查更新时发生错误。</p>';
    } finally {
      isLoading.value = false;
    }
  }

  function closeModal() {
    if (isUpdating.value) {
      toastr.warning('正在更新中，请勿关闭窗口。');
      return;
    }
    isModalVisible.value = false;
    // Reset state for next open
    isLoading.value = false;
    remoteVersion.value = '';
    hasUpdate.value = false;
    changelogHtml.value = '';
    filesToUpdate.value = [];
  }

  async function startUpdate() {
    if (!hasUpdate.value || filesToUpdate.value.length === 0) {
      toastr.info('当前已是最新版本。');
      return;
    }

    isUpdating.value = true;
    logger('info', 'VersionStore', 'Starting update process...', { files: filesToUpdate.value });
    try {
      await updateCardFiles(filesToUpdate.value);
      toastr.success('更新成功！刷新页面后生效。');
      // Update state to reflect that the update is done
      hasUpdate.value = false;
      localVersion.value = remoteVersion.value; // Assume update brings it to remote version
      closeModal();
    } catch (error) {
      logger('error', 'VersionStore', 'Update process failed.', error);
      toastr.error('更新失败，请查看控制台获取详细信息。');
    } finally {
      isUpdating.value = false;
    }
  }

  return {
    isModalVisible,
    isLoading,
    isUpdating,
    localVersion,
    remoteVersion,
    hasUpdate,
    changelogHtml,
    openModal,
    closeModal,
    startUpdate,
  };
});
