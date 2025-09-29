<template>
  <div>
    <!-- 模式切换Tabs -->
    <div class="flex border-b border-dim mb-4">
      <button @click="mode = 'form'" class="tab-btn" :class="{ active: mode === 'form' }">表单模式</button>
      <button @click="mode = 'json'" class="tab-btn" :class="{ active: mode === 'json' }">JSON模式</button>
    </div>

    <!-- 表单模式 -->
    <div v-show="mode === 'form'" class="space-y-4">
      <div>
        <label class="block mb-2 text-sm font-medium">图鉴类型:</label>
        <div class="flex flex-wrap gap-4">
          <label v-for="t in entryTypes" :key="t" class="flex items-center">
            <input type="radio" name="entryType" :value="t" v-model="selectedType" class="form-radio mr-2"> {{ t }}
          </label>
        </div>
      </div>
      <div class="space-y-3 max-h-60 overflow-y-auto pr-2">
        <div v-for="(field, index) in formFields" :key="index" class="form-field-row">
          <input type="text" class="form-key-input" placeholder="属性" v-model="field.key">
          <input type="text" class="form-value-input" placeholder="值" v-model="field.value">
          <button @click="removeField(index)" class="remove-field-btn" title="移除此字段"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div>
        <button @click="addField" class="text-sm text-accent hover:text-accent-hover transition-colors p-1 rounded hover:bg-secondary">
          <i class="fas fa-plus mr-1"></i>添加字段
        </button>
      </div>
    </div>

    <!-- JSON模式 -->
    <div v-show="mode === 'json'">
      <div class="mb-4">
        <label class="block mb-2 text-sm font-medium">图鉴类型 (将应用于所有条目):</label>
        <div class="flex flex-wrap gap-4">
          <label v-for="t in entryTypes" :key="t" class="flex items-center">
            <input type="radio" name="jsonEntryType" :value="t" v-model="selectedType" class="form-radio mr-2"> {{ t }}
          </label>
        </div>
      </div>
      <div>
        <label for="json-input" class="block mb-2 text-sm font-medium">JSON数据:</label>
        <textarea id="json-input" class="w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono" rows="8" v-model="jsonInput" placeholder='[&#10;  { "名称": "xxx", "等级": "xxx" },&#10;  { "名称": "yyy", "习性": "yyy" }&#10;]'></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { PokedexEntry, PokedexType } from '../../core/pokedex';
import { logger } from '../../core/logger';

const mode = ref<'form' | 'json'>('form');
const entryTypes: (PokedexType | '成就')[] = ['妖兽', '植物', '物品', '书籍', '成就'];
const selectedType = ref<(PokedexType | '成就')>('妖兽');
const formFields = ref<{ key: string, value: string }[]>([]);
const jsonInput = ref('');

const defaultFields: Record<string, { key: string, value: string }[]> = {
  '妖兽': [{ key: '名称', value: '' }, { key: '等级', value: '' }, { key: '习性', value: '' }],
  '植物': [{ key: '名称', value: '' }, { key: '品阶', value: '' }, { key: '功效', value: '' }],
  '物品': [{ key: '名称', value: '' }, { key: '品阶', value: '' }, { key: '描述', value: '' }],
  '书籍': [{ key: '名称', value: '' }, { key: '类型', value: '' }, { key: '内容摘要', value: '' }],
  '成就': [{ key: '名称', value: '' }, { key: '描述', value: '' }, { key: '点数', value: '0' }],
};

const resetFormFields = () => {
  formFields.value = defaultFields[selectedType.value] || [{ key: '名称', value: '' }];
};

watch(selectedType, (newType, oldType) => {
  logger('log', 'AddEntryForm', `Pokedex type changed from "${oldType}" to "${newType}", resetting fields.`);
  resetFormFields();
}, { immediate: true });

const addField = () => {
  formFields.value.push({ key: '', value: '' });
};

const removeField = (index: number) => {
  formFields.value.splice(index, 1);
};

const setEntryForEdit = (type: PokedexType | '成就', entry: PokedexEntry) => {
  logger('info', 'AddEntryForm', `Setting form to edit entry:`, { type, entry });
  mode.value = 'form';
  selectedType.value = type;
  formFields.value = Object.entries(entry).map(([key, value]) => ({ key, value: String(value) }));
};

const getEntryData = (): { type: PokedexType | '成就', entry: PokedexEntry, error?: string } | { type: PokedexType | '成就', entries: PokedexEntry[], error?: string } => {
  logger('log', 'AddEntryForm', `Attempting to get entry data from mode: "${mode.value}"`);
  if (mode.value === 'form') {
    const entry: PokedexEntry = { '名称': '' };
    formFields.value.forEach(field => {
      if (field.key) entry[field.key] = field.value;
    });
    if (!entry.名称) {
      logger('warn', 'AddEntryForm', 'Validation failed: Name is a required field.');
      return { type: selectedType.value, entry, error: '“名称”是必填字段！' };
    }
    logger('info', 'AddEntryForm', 'Successfully retrieved entry from form:', { type: selectedType.value, entry });
    return { type: selectedType.value, entry };
  } else {
    try {
      const data = JSON.parse(jsonInput.value);
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        if (!entry.名称) {
          logger('warn', 'AddEntryForm', 'Validation failed: An entry in JSON is missing the name field.', entry);
          return { type: selectedType.value, entries, error: 'JSON数据中的每个条目都必须包含“名称”字段！' };
        }
      }
      logger('info', 'AddEntryForm', 'Successfully parsed entries from JSON:', { type: selectedType.value, entries });
      return { type: selectedType.value, entries };
    } catch (e: any) {
      logger('error', 'AddEntryForm', 'Failed to parse JSON input.', e.message);
      return { type: selectedType.value, entries: [], error: 'JSON格式无效，请检查！' };
    }
  }
};

defineExpose({
  setEntryForEdit,
  getEntryData,
  resetFormFields,
});
</script>
