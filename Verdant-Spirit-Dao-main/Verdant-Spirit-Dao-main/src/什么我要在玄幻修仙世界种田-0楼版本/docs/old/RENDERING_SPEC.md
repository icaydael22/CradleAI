# 渲染系统规范 (RENDERING_SPEC.md) v2.0

本文档旨在详细描述基于 **Vue 3 & Pinia** 的新一代UI渲染系统的工作流程、设计哲学以及核心模块的职责。此规范取代了旧有的基于 jQuery 和手动 DOM 操作的 v1.0 版本。它与 `UI_FRAMEWORK_SPEC.md` 和 `VARIABLES_SPEC.md` 共同构成了项目的前端核心规范。

## 1. 设计哲学

随着项目迁移至 Vue 3 和 Pinia，我们的核心设计哲学得到了现代化实现：

1. **单一事实来源 (Single Source of Truth)**: 渲染系统的所有输出——即用户在界面上看到的一切——依然**必须**由**聊天变量 (Chat Variables)** 驱动。然而，现在是通过 Pinia store 作为响应式代理来实现，而非手动读取。
2. **响应式数据驱动 (Reactivity-Driven)**: UI 是状态的直接反映。我们不再手动调用渲染函数，而是通过修改 Pinia store 中的状态，让 Vue 的响应式系统自动、高效地更新 DOM。开发者只需关心状态，而非视图。
3. **组件化渲染 (Component-Based Rendering)**: 渲染逻辑被封装在独立的、可复用的单文件组件 (`.vue`) 中。旧的 `StoryRenderer` 和 `core/systems.ts` 已被废弃，其职责被分解到各个功能明确的 Vue 组件中。

## 2. 核心模块与职责

### 2.1 Vue 组件 (`components/**/*.vue`)

Vue 组件是新渲染系统的基本单元，负责定义 UI 的一小块区域的结构、样式和行为。

* **职责**:
  * 通过 `<template>` 定义 HTML 结构。
  * 通过 `<script setup>` 定义组件的逻辑，包括从 Pinia store 获取状态和调用 actions。
  * 通过 `<style scoped>` 定义组件的局部样式。
  * 组件是**无状态的 (stateless)**，它们自身不存储业务数据，所有状态都从 Pinia store 中获取。

### 2.2 Pinia Stores (`stores/*.ts`)

Pinia store 是连接**酒馆聊天变量**和**Vue 组件**的核心桥梁，是状态管理的中央枢纽。

* **职责**:
  * 为 `聊天变量` 的一个特定领域（如 `角色`、`世界`）提供一个集中管理的、类型安全的状态容器。
  * **初始化**: 提供 `fetch...` 或 `init...` actions，通过调用 `getVariables()` 从酒馆加载初始状态。
  * **读取**: 将加载的状态存储在响应式属性（如 `ref` 或 `reactive`）中，供 Vue 组件通过 `getters` 或直接访问来读取。
  * **写入**: 提供 `actions` 来修改 store 的内部状态，并负责调用 `updateVariablesWith()` 或 `replaceVariables()` 将这些变更同步回酒馆的聊天变量中。

### 2.3 应用入口 (`index.ts` & `App.vue`)

* **`index.ts`**: 应用程序的启动点。负责创建 Vue 应用实例、创建 Pinia 实例，并将 Pinia 注册为 Vue 插件，最后将根组件 `App.vue` 挂载到 `index.html` 的 `#app` 元素上。
* **`App.vue`**: 根组件，作为所有其他组件的容器。通常负责布局整个应用界面，并可能在 `onMounted` 钩子中触发全局状态的初始加载。

## 3. 渲染流程详解

### 3.1 初始渲染 (页面加载时)

1. `index.ts` 中的 `$(() => { ... })` 回调被触发。
2. `createApp(App)` 和 `createPinia()` 被调用，Vue 应用和 Pinia 实例被创建。
3. `app.use(pinia)` 将 Pinia 注册为插件，使其对所有组件可用。
4. `app.mount('#app')` 将 `App.vue` 及其所有子组件挂载到 DOM 中。
5. 在各个组件的 `onMounted` 生命周期钩子中，它们会调用相应 Pinia store 的 `fetch...` action (例如 `useCharacterStore().fetchCharacterData()`)。
6. 这些 `fetch` actions 调用 `getVariables()` 从酒馆获取最新的聊天变量。
7. 获取数据后，actions 会更新 store 内部的响应式状态 (e.g., `character.value = parsed.data`)。
8. 由于 Vue 的响应式机制，所有订阅了这些状态的组件模板都会自动更新，将数据显示在界面上。
9. 渲染完成，UI 显示出游戏上次结束时的状态。

### 3.2 更新渲染 (状态变化时)

#### 场景 A: 用户交互 (例如，点击按钮)

1. 用户在某个 Vue 组件上执行操作（例如，点击 `<button @click="takeDamage">`）。
2. 组件的事件处理器 (`takeDamage` 函数) 被调用。
3. 该函数调用一个 Pinia store 的 action (例如 `store.updateHealth(store.character.health - 10)`)。
4. `updateHealth` action 首先更新 store 内部的响应式状态 (`character.value.health = newHealth`)。
5. Vue 立即检测到状态变化，并自动重新渲染所有使用 `character.health` 的组件部分。UI 瞬间更新。
6. 然后，`updateHealth` action 调用 `updateVariablesWith({ type: 'chat', value: { '角色.health': newHealth } })` 将变更持久化到酒馆的聊天变量中。

#### 场景 B: AI 响应后 (外部状态变化)

1. AI 响应导致聊天变量在酒馆后端被更新。
2. `core/variables.ts` 中的 `syncVariables` 函数被调用，并通过 `messageBus.emit('variablesSynced')` 发出通知。
3. 一个或多个 Pinia stores 会监听这个 `variablesSynced` 事件。
4. 监听到事件后，这些 stores 会再次调用它们的 `fetch...` actions，从酒馆重新加载它们所管理的那部分状态。
5. store 的内部状态被新数据覆盖。
6. Vue 的响应式系统再次自动触发所有相关组件的重新渲染。
7. UI 自动反映出由 AI 事件引发的状态变化，整个过程无需手动操作 DOM。

## 4. 组件、Store 与变量映射关系

| UI 模块/组件 | 驱动的 Pinia Store | 主要管理的聊天变量路径 |
| :--- | :--- | :--- |
| **世界信息 (`WorldTab.vue`)** | `useWorldStore` | `世界.时间`, `世界.地点`, `世界.庇护所` |
| **角色列表 (`TeamTab.vue`)** | `useTeamStore` | `角色` (遍历所有子对象) |
| **角色关系 (`RelationsTab.vue`)** | `useRelationsStore` | `角色.[主控角色名].关系` |
| **图鉴面板 (`PokedexPanel.vue`)** | `usePokedexStore` | `世界.图鉴` |
| **物品栏 (`InventoryPanel.vue`)** | `useTeamStore` | `角色.[主控角色名].物品` |
| **系统面板 (`SystemTab.vue`)** | `useSystemStore`, `useQuestStore`, etc. | `世界.系统` |
| **行动选项 (`ActionPanel.vue`)** | `useActionStore` | (来自当次消息的JSON) |
| **故事面板 (`StoryPanel.vue`)** | `useStoryStore` | (从聊天历史记录中读取) |
| **顶部控制栏 (`TopBar.vue`)** | `useMenuStore`, `useThemeStore`, etc. | (不直接关联聊天变量) |
