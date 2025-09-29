# 角色模块设计规范 (v2.0 - worldStore 核心)

本文档详细阐述了“角色”模块在 v2.0 响应式架构下的完整技术实现，旨在为开发者提供一个清晰、统一的设计和实现指南。

## 1. 设计哲学

角色模块是游戏的核心，其设计严格遵循项目 v2.0 的**完全响应式状态管理规范** (`REACTIVE_STATE_SPEC.md`)。

1.  **单一事实来源 (Single Source of Truth)**: `worldStore` 中持有的 `world.value.角色` 状态，是所有角色数据的**唯一事实来源**。
2.  **事件驱动 (Event-Driven)**: 角色状态的创建和变更**必须**通过 `EventLogStore` 中的 `角色更新` 事件来驱动，并由 `worldStore` 统一处理。
3.  **状态容器内聚 (State Container Cohesion)**: 所有与角色相关的业务逻辑、数据获取和持久化操作，都内聚在 `worldStore` (`stores/core/worldStore.ts`) 中。
4.  **门面模式 (Facade Pattern)**: `characterStore` (`stores/facades/characterStore.ts`) 不再管理任何持久化状态。它作为一个**无状态的门面**，通过计算属性 (`computed`) 从 `worldStore` 派生数据，为UI层提供一个稳定、简洁的接口。
5.  **UI响应式 (Reactive UI)**: UI组件 (如 `TeamTab`, `CharacterCard`) **只负责消费**来自 `characterStore` 或 `teamStore` 的数据，并响应式地更新视图。

---

## 2. 数据持久化层

### 2.1 数据结构

角色数据持久化在酒馆聊天变量的 `世界.角色` 命名空间下，其结构由 `VARIABLES_SPEC.md` 定义。

**核心结构示例**:

```json
"世界": {
  "角色": {
    "主控角色名": "萧栖雪",
    "萧栖雪": {
      "姓名": "萧栖雪",
      "等级": "淬体境一层",
      "状态": {
        "体力": { "value": 75, "max": 110 }
      }
    },
    "李云": {
      // ... 其他NPC数据
    }
  }
}
```

### 2.2 Zod Schema 校验

为了确保数据的健壮性和类型安全，所有与角色相关的 Zod Schema (`CharacterSchema`, `CharactersContainerSchema`) 和 TypeScript 类型 (`ICharacter`, `ICharacters`) 都已从 `characterStore` 中剥离，并集中定义在 `types.ts` 文件中。`worldStore` 在初始化时会使用这些 `Schema` 对 `世界.角色` 数据进行校验。

---

## 3. 响应式数据链路

这是角色模块的核心。它清晰地定义了数据如何从持久化层流动到UI层，以及如何响应变化。

### 3.1 数据流图

```
[酒馆聊天变量 '世界.角色']
       ^
       | (3. 由 worldStore 统一持久化)
       v
[worldStore.ts] <-----------------------+
       | (1. 初始化加载)                     |
       |                                     | (2. 监听 EventLogStore, 处理 '角色更新' 事件)
       |                                     |
       | (通过 world.value.角色 暴露状态)      [EventLogStore]
       v                                     ^
[characterStore.ts (门面)]                     | (LLM生成事件)
       |                                     |
       | (通过 Computed Properties 派生数据)     |
       v                                     |
[teamStore.ts (UI Store)] -------------------+
       |
       v
[TeamTab.vue / CharacterCard.vue (UI Components)]
```

### 3.2 链路详解

#### 3.2.1 阶段一：初始化加载 (Initial Load)

1.  **应用入口 (`index.ts`)**:
    *   调用 `worldStore.initialize()`。
2.  **`worldStore.initialize()`**:
    *   调用 `getVariables()` 读取完整的 `世界` 对象，包括 `世界.角色`。
    *   使用 `CharactersContainerSchema` 进行校验。
    *   将数据存入 `world.value`，完成所有核心状态的初始化。

#### 3.2.2 阶段二：事件驱动更新 (Event-Driven Updates)

1.  **`stateUpdater.ts`**:
    *   解析LLM回复，将 `角色更新` 事件推送到 `eventLogStore`。
2.  **`worldStore.ts` 的 `_dangerouslyProcessEvents`**:
    *   在状态重算时，此方法被调用。
    *   它会遍历事件列表，找到 `角色更新` 事件。
    *   **核心逻辑**: 直接修改 `world.value.角色` 对象，进行深度合并更新或创建新角色。
3.  **持久化**:
    *   在状态重算流程的最后，`recalculateAndApplyState` 会将 `worldStore` 中最新的、包含所有角色变更的 `world` 对象，完整地写回到酒馆变量中。

---

## 4. UI组件层

UI层完全解耦，只负责展示由上游Store提供的数据。

### 4.1 `stores/facades/characterStore.ts` (门面)

`characterStore` 的职责被极大简化。

*   **依赖**: 它直接 `useWorldStore()`。
*   **核心功能**:
    *   `characters`: 一个 `computed` 属性，返回 `worldStore.world?.角色 || {}`。
    *   `mainCharacterName`: 一个 `computed` 属性，返回 `worldStore.world?.角色?.主控角色名 || null`。
    *   `mainCharacter`: 一个 `computed` 属性，根据 `mainCharacterName` 从 `characters` 中提取出主控角色的完整对象。
    *   它不再包含任何 `ref` 状态、`watch` 监听器或持久化 `actions`。

### 4.2 `stores/ui/teamStore.ts` (UI状态派生)

此Store的职责不变，但其数据源已变为 `characterStore` (门面)。

*   **依赖**: 它直接 `useCharacterStore()`。
*   **核心功能**:
    *   `mainCharacter`: 一个 `computed` 属性，直接返回 `characterStore.mainCharacter`。
    *   `npcs`: 一个 `computed` 属性，从 `characterStore.characters` 中排除主控角色，返回所有NPC的列表。

### 4.3 UI组件 (无变化)

`TeamTab.vue` 和 `CharacterCard.vue` 的实现保持不变。它们继续从 `teamStore` 中消费数据，由于整个数据链路是响应式的，当 `worldStore` 中的源数据发生变化时，UI会自动更新。

---

## 5. 总结

角色模块形成了一个更健壮、更清晰的单向数据流：

**持久化 (`世界.角色`) -> 核心状态容器 (`worldStore`) -> 门面 (`characterStore`) -> UI Store (`teamStore`) -> UI组件**

状态的变更由**事件**触发，通过 `EventLogStore` 驱动 `worldStore` 更新，更新后的状态再自动、响应式地流经所有中间层，最终反映在UI上。这个闭环确保了数据的**一致性**、**健壮性**和**可维护性**。
