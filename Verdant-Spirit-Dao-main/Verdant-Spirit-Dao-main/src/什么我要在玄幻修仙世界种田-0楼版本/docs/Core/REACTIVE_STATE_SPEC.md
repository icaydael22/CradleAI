# 完全响应式状态管理规范 (v3.0: worldStore 核心)

## 1. 概述

本文档定义了项目 v2.0+ 的核心状态管理架构。为了统一**内部事件**（如时间变化）和**外部事件**（来自LLM的状态更新）的处理方式，我们引入了以 **`EventLogStore`** 作为事件总线、以 **Pinia** 作为状态容器的**完全响应式**状态管理模式。

此架构取代了旧的、混合了过程式调用的状态更新模型，旨在建立一个逻辑内聚、高度解耦、数据流完全可预测的系统。所有新功能开发和旧模块重构都**必须**遵循此规范。

---

## 2. 核心理念

本架构包含两大类事件源和一套统一的响应式处理流程。

### 2.1 事件源 (Event Sources)

#### 2.1.1 来自LLM的外部事件 (External Events from LLM)

- **来源**: LLM 生成的回复中的 `<statusbar>` JSON块。
- **核心**: 这些事件是驱动游戏世界剧情和状态演变的主要动力。
- **规范**:
  - 所有LLM事件都必须遵循 `GameEvent` 契约（定义于 `core/eventManager.ts`）。
  - `core/stateUpdater.ts` 中的 `syncVariables` 函数是解析这些事件并将其送入系统的**唯一入口**。

#### 2.1.2 来自系统的内部事件 (Internal Events from System)

- **来源**: 游戏核心逻辑，如 `worldChangeHandler` (处理时间流逝)、`stateUpdater` (同步变量后) 等。
- **核心**: 这些事件是模块间通信的桥梁，用于触发**瞬时**的、需要解耦的业务逻辑，独立于LLM的叙事。
- **规范**:
  - 内部事件通过一个全局的**响应式事件总线** (`core/reactiveMessageBus.ts`) 进行广播。
  - 一个中央**编排器** (`core/storeOrchestrator.ts`) 负责监听总线上的所有事件，并将它们转换为对相应Pinia Store Action的调用。
  - 这种“总线 -> 编排器 -> Store”的模式，在维持模块解耦的同时，确保了清晰、可预测的单向数据流。

### 2.2 响应式核心组件

#### 2.2.1 `EventLogStore`: LLM事件总线 (The LLM Event Bus)

- **职责**: 作为所有**来自LLM的** `GameEvent` 的**单一事实来源** (Single Source of Truth) 和事件中心。它专门处理由剧情驱动、需要持久化和可重放的状态变更。
- **规范**:
  - `stores/eventLogStore.ts` 是处理LLM事件的中央总线。它的内部状态 (`allEvents`) 是对 `世界.事件列表` 变量的实时、响应式镜像。
  - `stateUpdater.ts` 是**唯一**可以将新事件写入 (`addEvents`) `EventLogStore` 的模块。
  - **`worldStore` 是 `eventLogStore` 的主要消费者**。它监听事件并更新其内部的、统一的世界状态。

#### 2.2.2 Pinia Stores: 状态的最终归宿 (The State Containers)

- **职责**: 存储和管理应用的所有细分状态（物品、任务、角色等）。
- **规范**:
  - 每个Store负责一块具体的业务领域。
  - Store的状态**只能**由其内部的Action或Watcher来修改。
  - Store通过监听 `EventLogStore` (对于LLM事件) 或其他Store的状态 (对于衍生状态变化) 来实现业务逻辑，而非直接响应底层事件。

---

## 3. 数据流

我们的架构现在清晰地分为两条既独立又统一的数据流。

### 3.1 LLM事件驱动的数据流

```
[LLM生成回复]
     |
     v
[stateUpdater.ts] -> syncVariables(json, messageId)
     |
     v
[EventLogStore]   -> addEvents(newEvents) // 状态是事件列表本身
     |
     +----------------------+----------------------+
     |                      |                      |
     v                      v                      v
[worldStore Watcher]
(监听allEvents变化)
     |
     v
(处理所有事件, 更新 world.value)
     |
     v
(由 worldStore 统一持久化)
     |                      |                      |
     +----------------------+----------------------+
     |
     v
[Vue Component] -> (自动响应式更新UI)
```

### 3.2 内部事件驱动的数据流 (以时间变化为例)

```
[worldChangeHandler] -> reactiveMessageBus.emit('timeChanged', payload)
     |
     v
[reactiveMessageBus] -> (响应式状态 'events.timeChanged' 更新)
     |
     v
[storeOrchestrator]  -> watch(() => events.timeChanged, ...)
     |
     v
[timeStore]          -> updateTime(payload) // Action被调用
     |
     v
(timeStore.day 等状态变化)
     |
     +----------------------+----------------------+
     |                      |                      |
     v                      v                      v
[worldStore Watcher]   [signInStore Watcher]  [other Store Watchers]
(监听timeStore.day)    (监听timeStore.day)    (监听timeStore.day)
     |                      |                      |
     v                      v                      v
(触发各自的业务逻辑)     (触发各自的业务逻辑)     (触发各自的业务逻辑)
     |                      |                      |
     v                      v                      v
[Vue Component] -> (自动响应式更新UI)
```

---

## 4. 实施指南：重构一个LLM事件处理器

以 `物品变化` 事件为例，展示如何从旧的 `EventManager` 模式迁移到新的完全响应式模式。

### 改造前：逻辑在外部Handler中，过程式调用

旧代码 (`core/events/itemChangeHandler.ts`):

```typescript
// itemChangeHandler.ts
export const handleItemChange: EventHandler = {
  execute: (payload, currentVars) => {
    // ...直接操作 currentVars 对象的逻辑...
    const characterItems = _.cloneDeep(currentVars.角色[mainCharacterName]?.物品 || []);
    // ...增删改查...
    return { '角色': { [mainCharacterName]: { 物品: characterItems } } };
  }
};

// index.ts
eventManager.register('物品变化', handleItemChange);

// variables.ts (syncVariables)
// ...
const { finalState } = await eventManager.processEvents(...);
await updateVariablesWith((vars) => {
  vars.角色 = finalState.角色;
  vars.世界 = finalState.世界;
  return vars;
});
// ...
```

### 改造后：逻辑内聚于Store，响应式触发

**第一步: 在 `stateUpdater.ts` 中将事件送入总线**

```typescript
// core/stateUpdater.ts
import { useEventLogStore } from '../stores/eventLogStore';

export async function syncVariables(statusbarData, messageId, eventManager) {
  // ... 解析和标准化 newEvents ...

  // 获取 eventLog store 实例
  const eventLogStore = useEventLogStore();

  // 将新事件添加到中央日志中。这将自动触发所有监听器。
  await eventLogStore.addEvents(newEvents);

  // (过渡阶段) 仍然调用旧的 eventManager 来处理尚未迁移的事件
  // ...
}
```

**第二步: 在 `itemStore.ts` 中响应事件**

```typescript
// stores/itemStore.ts
import { watch } from 'vue';
import _ from 'lodash';
import { useEventLogStore } from './eventLogStore';

export const useItemStore = defineStore('item', () => {
  const items = ref<Item[]>([]);
  const lastProcessedEventIndex = ref(-1); // 用于防止重复处理事件

  const eventLogStore = useEventLogStore();

  // 监听事件总线的变化
  watch(() => eventLogStore.allEvents, (newEvents) => {
    // 只处理上次处理位置之后的新事件
    const eventsToProcess = newEvents.slice(lastProcessedEventIndex.value + 1);
    if (eventsToProcess.length === 0) return;

    let hasChanged = false;
    const currentItems = _.cloneDeep(items.value);

    for (const event of eventsToProcess) {
      if (event.type === '物品变化') {
        hasChanged = true;
        const payload = event.payload;
        // ... 此处是原 handleItemChange 的核心逻辑 ...
        // (获得、失去、更新 currentItems 数组)
      }
    }

    if (hasChanged) {
      items.value = currentItems; // 更新本Store的状态
      persistItems(); // 将更新后的状态写回酒馆变量
    }
    
    // 更新处理位置
    lastProcessedEventIndex.value = newEvents.length - 1;
  }, { deep: true });

  async function persistItems() {
    // ...将 items.value 写回 `角色.主控角色名.物品`...
  }

  return { items, ... };
});
```

---

## 5. 最佳实践

1.  **Store的单一职责**: 每个Store应该只关心自己的业务领域。`itemStore` 只处理物品，`questStore` 只处理任务。
2.  **事件的纯粹性**: `EventLogStore` 是一个只读的事件日志。任何Store都不应该尝试去修改或删除其中的事件，只能读取和响应。
3.  **避免跨Store的Action瀑布**: 尽量避免一个Store的watcher调用另一个Store的Action，后者又触发另一个watcher...形成复杂的调用链。优先让多个Store独立地响应 `EventLogStore` 中的同一个事件。
4.  **状态重算**: 当需要切换消息页（Swipe）并重算状态时，核心逻辑是：
    1.  调用 `calculateStateUntil` (`variables.ts`) 获取目标消息点的**完整事件列表**。
    2.  调用 `eventLogStore.setEvents(fullEventList)` **一次性替换**事件日志。
    3.  Pinia的响应式系统会自动触发所有Store的watcher，根据新的事件列表**重新计算出最终状态**。整个过程是自动且可预测的。

---

## 6. 模块交互重构 TODO (v2.0)

## 6. Pinia Store 模块结构

为了提高可维护性和清晰度，`stores` 文件夹下的所有模块按以下结构组织：

- **`stores/core`**: 存放核心数据模型，是响应式系统的基础。这些Store直接映射并管理酒馆聊天变量中的核心数据结构。
  - `eventLogStore.ts`: 事件总线，管理所有来自LLM的事件。
  - `worldStore.ts`: **核心状态容器**。管理 `世界` 和 `角色` 变量下的所有核心游戏状态。
  - `characterStore.ts`: **(门面)** 从 `worldStore` 派生角色数据，供UI使用。
  - `itemStore.ts`: **(门面)** 从 `worldStore` 派生玩家物品数据，供UI使用。

- **`stores/systems`**: 存放与特定游戏机制或系统相关的Store。它们通常响应 `core` Store的变化或特定的LLM事件。
  - `achievementStore.ts`: 成就系统。
  - `adventureStore.ts`: 奇遇系统。
  - `barterStore.ts`: 交易系统。
  - `pokedexStore.ts`: 图鉴系统。
  - `questStore.ts`: 任务系统。
  - `signInStore.ts`: 签到系统。
  - `skillStore.ts`: 技能系统。
  - `timeStore.ts`: 时间系统。

- **`stores/ui`**: 存放驱动UI组件状态的Store。它们是视图（Vue Components）的数据来源，负责UI交互和显示逻辑。
  - `actionStore.ts`: 行动面板。
  - `debugStore.ts`: 调试工具。
  - `detailsStore.ts`: 详情弹窗。
  - `historyStore.ts`: 历史记录。
  - `mainMenuStore.ts`: 主菜单。
  - `menuStore.ts`: 旧版菜单（待废弃）。
  - `relationsStore.ts`: 角色关系。
  - `settingsStore.ts`: 设置菜单。
  - `setupStore.ts`: 开局设置。
  - `sidePanelStore.ts`: 侧边栏。
  - `storyStore.ts`: 故事叙事。
  - `systemStore.ts`: 系统面板。
  - `teamStore.ts`: 队伍管理（依赖 `characterStore`）。
  - `themeStore.ts`: 主题管理。

- **`stores/modules`**: 存放与可插拔模块或高级功能相关的Store。
  - `promptStore.ts`: 提示词管理。
  - `smartContextStore.ts`: 智能上下文。

- **`stores/app`**: 存放全局应用状态和版本的Store。
  - `appStore.ts`: 全局应用状态（例如 `floorId`）。
  - `generationStore.ts`: 管理与LLM生成相关的状态。
  - `versionStore.ts`: 版本管理。

### 7.2 内部事件与状态衍生的交互模型

我们采用“**响应式总线 + Store监听**”的混合模型来处理模块间的交互，以兼顾**解耦**和**直观性**。

#### 7.2.1 使用响应式总线的场景 (用于“命令”式通信)

当一个模块需要**通知**其他多个、不相关的模块“某件事发生了”，但它本身不关心这些模块会如何响应时，应使用响应式总线。

- **原则**: 发布者与订阅者之间是完全解耦的。
- **示例**:
  - `worldChangeHandler` 发布 `timeChanged` 事件。它不关心 `timeStore` 或其他任何模块如何处理时间变化。
  - `stateUpdater` 发布 `variablesSynced` 事件，通知所有依赖底层变量的 Store 可以刷新数据了。

#### 7.2.2 使用 Store 间监听的场景 (用于“状态衍生”式通信)

当一个 Store 的状态是另一个 Store 状态的**直接衍生品**时，应直接使用 `watch` 监听源 Store 的 state 或 getter。

- **原则**: 消费者与被消费者之间存在明确的、一对一或一对多的数据依赖关系。
- **示例**:
  - `signInStore` 的签到状态**依赖于** `timeStore` 的 `day`。因此 `signInStore` 直接 `watch(timeStore.day, ...)` 是最清晰、最直观的实现。
  - `teamStore` 的队伍信息**衍生自** `characterStore` 的角色列表。因此 `teamStore` 直接 `watch(characterStore.characters, ...)`。
  - `worldStore` 需要根据 `worldStore` 自身的天气状态来计算庇护所损耗，这是模块内部的响应式，也使用 `watch`。
