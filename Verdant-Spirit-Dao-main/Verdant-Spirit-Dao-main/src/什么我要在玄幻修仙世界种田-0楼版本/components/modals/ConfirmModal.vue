<template>
  <div v-if="confirmStore.isVisible" class="modal-overlay" @click.self="handleCancel">
    <div class="confirm-modal-content">
      <h3 class="modal-title">{{ confirmStore.title }}</h3>
      <div class="modal-body">
        <p>{{ confirmStore.message }}</p>
      </div>
      <div class="modal-actions">
        <button @click="handleCancel" class="btn-secondary">取消</button>
        <button @click="handleConfirm" class="btn-primary">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirmStore } from '../../stores/ui/confirmStore';
import { watch } from 'vue';
import { logger } from '../../core/logger';

const confirmStore = useConfirmStore();

watch(() => confirmStore.isVisible, (newValue) => {
  logger('info', 'ConfirmModal', `Visibility changed to: ${newValue}`);
});

const handleConfirm = () => {
  logger('info', 'ConfirmModal', 'handleConfirm called.');
  confirmStore.confirm();
};

const handleCancel = () => {
  logger('info', 'ConfirmModal', 'handleCancel called.');
  confirmStore.cancel();
};
</script>

<style scoped>
.confirm-modal-content {
  background-color: var(--bg-card);
  border-radius: 1rem;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  padding: 2rem;
  width: 90vw;
  max-width: 400px;
  text-align: center;
}

.modal-body p {
  margin-bottom: 1.5rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}
</style>
