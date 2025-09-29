<template>
  <div>
    <details v-if="isObjectOrArray" class="variable-details" open>
      <summary class="variable-summary">
        <span class="variable-key">{{ keyName }}:</span>
        <span class="variable-preview">{{ preview }}</span>
      </summary>
      <div class="variable-content">
        <VariableEntry
          v-for="([key, value]) in entries"
          :key="key"
          :key-name="Array.isArray(data) ? `[${key}]` : key"
          :data="value"
        />
      </div>
    </details>
    <div v-else class="variable-entry">
      <span class="variable-key">{{ keyName }}:</span>
      <span :class="valueClass" class="variable-value" v-html="formattedValue"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType } from 'vue';
import _ from 'lodash';

const props = defineProps({
  keyName: {
    type: String,
    required: true,
  },
  data: {
    type: [Object, Array, String, Number, Boolean, null] as PropType<any>,
    required: true,
  },
});

const isObjectOrArray = computed(() => _.isObject(props.data) && !_.isEmpty(props.data));

const entries = computed(() => {
  if (_.isObject(props.data)) {
    return Object.entries(props.data);
  }
  return [];
});

const preview = computed(() => {
  if (Array.isArray(props.data)) {
    return `[... ${props.data.length} items]`;
  }
  if (_.isObject(props.data)) {
    return '{...}';
  }
  return '';
});

const formattedValue = computed(() => {
  if (_.isString(props.data)) {
    return `"${_.escape(props.data)}"`;
  }
  if (props.data === null) {
    return 'null';
  }
  return _.escape(String(props.data));
});

const valueClass = computed(() => {
  const type = typeof props.data;
  if (props.data === null) return 'json-null';
  return `json-${type}`;
});
</script>

<style scoped>
.variable-details {
  margin-left: 1rem;
  border-left: 1px dashed color-mix(in srgb, var(--border-color) 50%, transparent);
}
.variable-details[open] > .variable-summary {
  margin-bottom: 0.25rem;
}
.variable-summary {
  cursor: pointer;
  list-style: none;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
}
.variable-summary::-webkit-details-marker {
  display: none;
}
.variable-summary:hover {
  background-color: color-mix(in srgb, var(--bg-card) 30%, transparent);
}
.variable-key {
  font-weight: 600;
  color: var(--text-secondary);
  margin-right: 0.5rem;
}
.variable-details > .variable-summary > .variable-key {
  color: var(--text-primary);
}
.variable-preview {
  color: var(--text-secondary);
  font-style: italic;
  font-size: 0.8rem;
}
.variable-details:not([open]) > .variable-summary > .variable-preview {
  display: inline;
}
.variable-details[open] > .variable-summary > .variable-preview {
  display: none;
}
.variable-content {
  padding-left: 1rem;
}
.variable-entry {
  padding: 0.2rem 0.5rem;
}
.variable-value {
  font-family: monospace;
}
.json-string { color: #a5d6a7; }
.json-number { color: #81d4fa; }
.json-boolean { color: #ce93d8; }
.json-null { color: var(--text-secondary); }
</style>
