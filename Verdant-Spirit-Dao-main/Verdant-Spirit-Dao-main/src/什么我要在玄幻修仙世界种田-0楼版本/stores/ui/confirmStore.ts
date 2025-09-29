import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '../../core/logger';

type ResolveFunction = (value: boolean) => void;

export const useConfirmStore = defineStore('confirm', () => {
  const isVisible = ref(false);
  const title = ref('');
  const message = ref('');
  const resolve = ref<ResolveFunction | null>(null);

  function hide() {
    logger('info', 'ConfirmStore', 'Hiding modal.');
    isVisible.value = false;
    title.value = '';
    message.value = '';
    resolve.value = null;
  }

  function show(_title: string, _message: string): Promise<boolean> {
    title.value = _title;
    message.value = _message;
    isVisible.value = true;
    return new Promise((_resolve) => {
      resolve.value = _resolve;
    });
  }

  function confirm() {
    logger('info', 'ConfirmStore', 'Confirmation received.');
    if (resolve.value) {
      resolve.value(true);
    }
    hide();
  }

  function cancel() {
    logger('info', 'ConfirmStore', 'Cancellation received.');
    if (resolve.value) {
      resolve.value(false);
    }
    hide();
  }

  return {
    isVisible,
    title,
    message,
    show,
    confirm,
    cancel,
  };
});
