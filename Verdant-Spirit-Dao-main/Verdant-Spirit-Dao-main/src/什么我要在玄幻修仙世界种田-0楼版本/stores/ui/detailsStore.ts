import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '../../core/logger';

declare const toastr: any;

export const useDetailsStore = defineStore('details', () => {
  const isVisible = ref(false);
  const data = ref<Record<string, any> | null>(null);
  const title = ref('详情');
  const isEditMode = ref(false);
  const onSaveCallback = ref<((data: any) => Promise<void>) | null>(null);

  const showDetails = (
    itemData: Record<string, any>,
    saveCallback?: (updatedData: any) => Promise<void>,
  ) => {
    logger('info', 'DetailsStore', 'showDetails called with:', itemData);
    data.value = JSON.parse(JSON.stringify(itemData)); // Use a deep copy
    const titleKey = Object.keys(itemData).find(k => k.includes('名称') || k.includes('姓名'));
    title.value = titleKey ? itemData[titleKey] : '详情';
    onSaveCallback.value = saveCallback || null;
    isEditMode.value = false; // Always start in view mode
    isVisible.value = true;
    logger('log', 'DetailsStore', `Modal visibility set to: ${isVisible.value}`);
  };

  const hideModal = () => {
    logger('info', 'DetailsStore', 'hideModal called.');
    isVisible.value = false;
    data.value = null;
    isEditMode.value = false;
    onSaveCallback.value = null;
    logger('log', 'DetailsStore', `Modal visibility set to: ${isVisible.value}`);
  };

  const toggleEditMode = () => {
    isEditMode.value = !isEditMode.value;
    logger('info', 'DetailsStore', `Toggled edit mode to: ${isEditMode.value}`);
  };

  const saveDetails = async (updatedData: any) => {
    if (onSaveCallback.value) {
      try {
        await onSaveCallback.value(updatedData);
        logger('info', 'DetailsStore', 'Save callback executed successfully.');
        toastr.success('保存成功！');
        isEditMode.value = false; // Exit edit mode on successful save
        // Optionally, you can update the view with the saved data
        data.value = JSON.parse(JSON.stringify(updatedData));
      } catch (error) {
        logger('error', 'DetailsStore', 'Save callback failed.', error);
        toastr.error('保存失败，请查看控制台日志。');
      }
    } else {
      logger('warn', 'DetailsStore', 'Save was attempted but no onSaveCallback is registered.');
    }
  };

  return {
    isVisible,
    data,
    title,
    isEditMode,
    onSaveCallback,
    showDetails,
    hideModal,
    toggleEditMode,
    saveDetails,
  };
});
