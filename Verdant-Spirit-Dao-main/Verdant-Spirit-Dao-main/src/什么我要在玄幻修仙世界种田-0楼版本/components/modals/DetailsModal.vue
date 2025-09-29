<template>
  <div v-if="detailsStore.isVisible" class="modal-overlay" @click.self="detailsStore.hideModal">
    <div class="details-modal-content">
      <button class="modal-close-btn" @click="detailsStore.hideModal">&times;</button>
      <h3 class="modal-title">{{ detailsStore.title }}</h3>
      <div class="modal-body">
        <div v-if="detailsStore.data">
          <!-- View Mode -->
          <ul v-if="!detailsStore.isEditMode">
            <li v-for="(value, key) in detailsStore.data" :key="key">
              <span class="item-key">{{ key }}:</span>
              <span v-if="key === '价值'"> {{ getCalculatedValue(detailsStore.data as PokedexEntry) }}</span>
              <pre v-else-if="typeof value === 'object'"
                class="whitespace-pre-wrap text-sm bg-secondary/50 p-2 rounded mt-1"><code>{{ JSON.stringify(value, null, 2) }}</code></pre>
              <span v-else> {{ value }}</span>
            </li>
          </ul>
          <!-- Edit Mode -->
          <div v-else class="edit-form">
            <div v-for="(value, key) in editableData" :key="key" class="form-group">
              <label :for="`field-${key}`" class="item-key">{{ key }}:</label>
              <textarea v-if="typeof value === 'object'" :id="`field-${key}`" v-model="editableData[key]"
                class="form-textarea" rows="5"></textarea>
              <input v-else :id="`field-${key}`" v-model="editableData[key]" class="form-input" />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <template v-if="detailsStore.onSaveCallback">
          <!-- Edit Mode Actions -->
          <template v-if="detailsStore.isEditMode">
            <button @click="detailsStore.toggleEditMode" class="icon-btn cancel-btn" title="取消">
              <!-- Cancel Icon (X) -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <button @click="handleSave" class="icon-btn save-btn" title="保存">
              <!-- Save Icon (Checkmark) -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          </template>
          <!-- View Mode Action -->
          <template v-else>
            <button @click="detailsStore.toggleEditMode" class="icon-btn edit-btn" title="编辑">
              <!-- Pen Icon -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            </button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { PokedexEntry, PokedexManager } from '../../core/pokedex';
import { useDetailsStore } from '../../stores/ui/detailsStore';

const detailsStore = useDetailsStore();
const getPokedexManager = (): PokedexManager => (window as any).pokedexManager;

const editableData = ref<Record<string, any>>({});

watch(() => detailsStore.data, (newData) => {
  if (newData) {
    // Create a deep copy for editing to avoid mutating the original store state directly
    editableData.value = JSON.parse(JSON.stringify(newData));
  }
}, { immediate: true, deep: true });


const handleSave = () => {
  const dataToSave: Record<string, any> = {};
  for (const key in editableData.value) {
    const value = editableData.value[key];
    // Try to parse object/JSON strings back into objects
    if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
      try {
        dataToSave[key] = JSON.parse(value);
      } catch (e) {
        dataToSave[key] = value; // Keep as string if parsing fails
      }
    } else {
      dataToSave[key] = value;
    }
  }
  detailsStore.saveDetails(dataToSave);
};

const getCalculatedValue = (entry: PokedexEntry) => {
  const pokedexManager = getPokedexManager();
  if (!pokedexManager || !entry.价值) {
    return 'N/A';
  }
  const finalValue = pokedexManager.calculateItemValue(entry);
  const baseValue = entry.价值.基础价值;
  if (finalValue === baseValue) {
    return `${baseValue}`;
  }
  return `${baseValue} (市场价: ${finalValue})`;
};
</script>

<style scoped>
.details-modal-content {
  background-color: var(--bg-card);
  border-radius: 1rem;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  padding: 2rem;
  width: 90vw;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 9998;
}

.modal-body {
  padding-bottom: 4rem; /* Add padding to prevent content from overlapping with action buttons */
}

.modal-actions {
  position: absolute;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  gap: 0.75rem;
  z-index: 9999;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem; /* 40px */
  height: 2.5rem; /* 40px */
  border-radius: 50%;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  background-color: var(--bg-card);
  color: var(--text-secondary);
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.icon-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25);
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.icon-btn svg {
  width: 1.25rem; /* 20px */
  height: 1.25rem; /* 20px */
}

.edit-btn {
  background-color: var(--color-primary);
  color: white;
}

.save-btn {
  background-color: var(--color-success);
  color: white;
}

.cancel-btn {
  background-color: var(--color-danger);
  color: white;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.item-key {
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 1rem;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}
</style>
