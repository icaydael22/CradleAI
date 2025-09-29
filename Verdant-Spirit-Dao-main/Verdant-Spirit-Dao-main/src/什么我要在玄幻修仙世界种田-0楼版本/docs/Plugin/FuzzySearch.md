# 插件设计文档：Fuse.js 模糊搜索集成

本文档旨在为游戏内集成 Fuse.js 模糊搜索功能提供一套完整、可靠的技术实现方案。

## 1. 核心目标与哲学

* **核心目标**: 为游戏内的多个数据密集型模块（如图鉴、任务日志、物品栏）提供一个高效、智能、用户友好的模糊搜索功能。
* **设计哲学**:
  * **中心化管理**: 所有搜索逻辑应由一个专门的模块统一管理，避免代码分散。
  * **响应式集成**: 搜索功能必须与项目现有的 Pinia 响应式数据流无缝集成，确保搜索索引能实时反映游戏状态的变化。
  * **体验优先**: 搜索配置应以提升用户体验为首要目标，在准确性和容错性之间找到最佳平衡。
  * **赋能LLM**: 将搜索能力作为一种工具开放给LLM，创造更深度的智能交互。

## 2. 技术实现方案：`searchStore`

我们将创建一个新的 Pinia Store `stores/modules/searchStore.ts`，作为整个应用模糊搜索功能的唯一入口和状态管理器。

### 2.1 Store State

```typescript
// stores/modules/searchStore.ts
import { defineStore } from 'pinia';
import Fuse from 'fuse.js';

interface SearchState {
  fuseInstances: Map<string, Fuse<any>>; // 存储所有Fuse.js实例
  searchResults: Record<string, any[]>; // 存储各个索引的搜索结果
  isIndexing: boolean; // 标记是否正在进行大规模索引
}

export const useSearchStore = defineStore('search', {
  state: (): SearchState => ({
    fuseInstances: new Map(),
    searchResults: {},
    isIndexing: false,
  }),
  // ... actions and getters
});
```

### 2.2 核心 Actions

#### `initializeSearchIndex(indexName: string, data: any[], options: Fuse.IFuseOptions<any>)`

* **职责**: 初始化或重建一个特定数据集的搜索索引。
* **流程**:
    1. 根据 `indexName`, `data`, 和 `options` 创建一个新的 `Fuse` 实例。
    2. 将实例存入 `state.fuseInstances` 中：`this.fuseInstances.set(indexName, newFuseInstance)`。
    3. 为该索引初始化一个空的搜索结果数组：`this.searchResults[indexName] = []`。
* **调用时机**: 在各个业务Store（如`pokedexStore`）的数据初始化 `action` 中被调用。

#### `search(indexName: string, query: string)`

* **职责**: 执行搜索。
* **流程**:
    1. 通过 `indexName` 从 `state.fuseInstances` 中获取对应的Fuse实例。
    2. 如果实例存在，则执行 `fuse.search(query)`。
    3. 将返回的结果（只取 `item` 部分）更新到 `state.searchResults[indexName]` 中。
* **调用时机**: 由UI组件中的搜索输入框 `v-on:input` 事件触发。

#### `addToIndex(indexName: string, document: any)` & `removeFromIndex(indexName: string, documentId: string)`

* **职责**: 动态地向索引中添加或移除单个文档，以保持数据同步。
* **流程**: 分别调用对应Fuse实例的 `.add()` 和 `.remove()` 方法。
* **调用时机**: 由 `searchStore` 自身通过 `watch` 监听源数据Store的变化时自动调用。

### 2.3 响应式数据同步

`searchStore` 的核心是自动同步。这通过在 `searchStore` 内部建立对源数据Store的 `watch` 来实现。

```typescript
// stores/modules/searchStore.ts

// ... (in an action, e.g., setupWatchers)
const pokedexStore = usePokedexStore();

watch(() => pokedexStore.chatPokedex, (newPokedex, oldPokedex) => {
  // 这是一个简化的 diff 逻辑，实际应用中可能需要更精确的比较
  if (newPokedex.length > oldPokedex.length) {
    const newItem = newPokedex[newPokedex.length - 1];
    this.addToIndex('pokedex', newItem);
  } 
  // ... handle removals
}, { deep: true });
```

## 3. UI 集成示例 (`PokedexTab.vue`)

```vue
<template>
  <div>
    <input type="text" v-model="searchQuery" @input="performSearch" placeholder="搜索图鉴...">
    <ul>
      <li v-for="entry in searchResults" :key="entry.id">
        <!-- 使用 v-html 和高亮函数来显示匹配项 -->
        <span v-html="highlight(entry.name, entry.matches, 'name')"></span>
        <p v-html="highlight(entry.description, entry.matches, 'description')"></p>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSearchStore } from '@/stores/modules/searchStore';

const searchQuery = ref('');
const searchStore = useSearchStore();

const searchResults = computed(() => searchStore.searchResults.pokedex || []);

function performSearch() {
  searchStore.search('pokedex', searchQuery.value);
}

// 一个简单的高亮函数，利用Fuse.js返回的matches信息
function highlight(text, matches, key) {
  // ... logic to wrap matched indices with <mark> tags
  return text;
}
</script>
```

## 4. 与LLM的智能交互

这是将搜索功能从一个简单的UI工具提升为核心游戏机制的关键。

### 4.1 LLM驱动的搜索

* **机制**: LLM可以在叙事中生成一个“搜索”指令事件。
* **事件规范**:

    ```json
    {
      "type": "指令",
      "payload": {
        "指令": "搜索图鉴", // 或 "搜索任务", "搜索物品"
        "关键词": "龙涎草",
        "描述": "NPC提到了'龙涎草'，为玩家自动在图鉴中搜索此条目。"
      }
    }
    ```

* **系统响应**:
    1. `stateUpdater` 捕获此指令。
    2. 调用 `searchStore.search('pokedex', '龙涎草')`。
    3. 同时，可能会调用 `uiStore` 的一个 `action`，如 `openPokedexAndFocusSearch()`，直接将搜索结果界面呈现给玩家。

### 4.2 搜索结果作为LLM上下文

* **机制**: 当玩家进行一次手动搜索后，系统可以将最相关的几条结果注入到下一次的Prompt中。
* **流程**:
    1. 玩家在图鉴中搜索“炼丹 材料”。
    2. `searchStore` 返回了3个最匹配的物品。
    3. `promptManager` 在构建下一个Prompt时，会从 `searchStore` 获取这些结果，并将其格式化后加入上下文。
* **Prompt示例**:

    ```
    [SYSTEM] 玩家刚刚搜索了“炼丹 材料”，并看到了以下结果：
    1. 【荧光苔藓】: ...
    2. 【赤炎果】: ...
    3. 【百年石钟乳】: ...
    
    请你在接下来的叙事中，可以围绕这些物品展开，或者引导玩家思考如何利用它们。
    ```

## 5. 实施步骤

1. **创建 `stores/modules/searchStore.ts`**: 实现上述定义的State, Actions, 和 Getters。
2. **修改源数据Store**: 在如图鉴、任务等Store的初始化 `action` 中，调用 `searchStore.initializeSearchIndex()` 来构建初始索引。
3. **建立响应式链接**: 在 `searchStore` 中建立对源数据Store的 `watch`，以实现索引的自动更新。
4. **开发UI组件**: 在需要搜索功能的UI模块中，添加搜索框，并与 `searchStore` 进行交互。
5. **（可选）实现高亮功能**: 编写一个工具函数，用于解析Fuse.js返回的 `matches` 数组，并为匹配的文本添加高亮标签。
6. **（高级）集成LLM交互**:
    * 在 `stateUpdater` 中添加对 `"搜索图鉴"` 等指令的处理逻辑。
    * 在 `promptManager` 中添加逻辑，使其能够在特定条件下（如玩家执行搜索后）从 `searchStore` 拉取结果并注入到Prompt中。
