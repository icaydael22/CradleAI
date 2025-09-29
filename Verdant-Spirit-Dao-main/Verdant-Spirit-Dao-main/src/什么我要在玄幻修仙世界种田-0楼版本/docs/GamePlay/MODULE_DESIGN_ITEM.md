# 物品模块设计规范 (v2.0 - worldStore 核心)

本文档详细阐述了“物品”模块在 v2.0 响应式架构下的完整技术实现，旨在为开发者提供一个清晰、统一的设计和实现指南。

## 1. 设计哲学

物品模块作为游戏中最核心、交互最频繁的系统之一，其设计严格遵循项目 v2.0 的**完全响应式状态管理规范** ([`REACTIVE_STATE_SPEC.md`](../Core/REACTIVE_STATE_SPEC.md))。

1.  **单一事实来源 (Single Source of Truth)**: `worldStore` 中持有的 `world.value.角色[主控角色].物品` 状态，是所有玩家物品数据的**唯一事实来源**。
2.  **事件驱动 (Event-Driven)**: 物品状态的任何变更（获得、失去、更新）**必须**通过 `EventLogStore` 中的 `物品变化` 或 `物品条目更新` 事件来驱动，并由 `worldStore` 统一处理。
3.  **状态容器内聚 (State Container Cohesion)**: 所有与物品相关的事件处理逻辑、数据获取和持久化操作，都内聚在 `worldStore` (`stores/core/worldStore.ts`) 中。
4.  **门面模式 (Facade Pattern)**: `itemStore` (`stores/facades/itemStore.ts`) 不再管理任何持久化状态。它作为一个**无状态的门面**，通过计算属性 (`computed`) 从 `worldStore` 和 `characterStore` 派生出当前玩家的物品列表，为UI层提供一个稳定、简洁的接口。
5.  **UI响应式 (Reactive UI)**: UI组件 (如 `InventoryPanel.vue`) **只负责消费**来自 `itemStore` 的数据，并响应式地更新视图。

---

## 2. 数据持久化层

### 2.1 数据结构

物品数据持久化在酒馆聊天变量的 `世界.角色.<角色名>.物品` 路径下，其结构由 `VARIABLES_SPEC.md` 定义。

**核心结构示例**:

```json
"世界": {
  "角色": {
    "主控角色名": "萧栖雪",
    "萧栖雪": {
      "物品": [
        { "名称": "潮汐木芯", "数量": 5, "描述": "..." },
        { "名称": "《长春诀》拓本", "数量": 1, "描述": "..." }
      ]
    }
  }
}
```

---

## 3. 响应式数据链路

这是物品模块的核心。它清晰地定义了数据如何从持久化层流动到UI层，以及如何响应变化。

### 3.1 数据流图

```mermaid
graph TD
    subgraph "Data Persistence"
        A[酒馆聊天变量<br>'世界.角色.萧栖雪.物品']
    end

    subgraph "Core State & Event Layer"
        B[worldStore.ts]
        C[eventLogStore.ts]
    end

    subgraph "Facade Layer"
        D[characterStore.ts]
        E[itemStore.ts]
    end

    subgraph "UI Layer"
        F[Inventory.vue]
    end

    subgraph "External Input"
        G[LLM Response]
        H[stateUpdater.ts]
    end

    A -- "1. Load/Persist" -- B
    G -- "2. Parse Event" --> H
    H -- "3. Add to Bus" --> C
    C -- "4. Processed by" --> B

    B -- "5a. Provides `world.角色`" --> D
    D -- "5b. Provides `mainCharacter`" --> E
    B -- "5c. Provides `world`" --> E

    E -- "6. Provides `items` computed" --> F
```

### 3.2 链路详解

1.  **初始化/持久化**: `worldStore` 在启动时加载 `世界` 变量，并在状态变更后将其完整写回。
2.  **事件生成**: LLM 在其响应中生成 `物品变化` 事件。
3.  **事件注入**: `stateUpdater` 解析事件并将其送入 `eventLogStore`。
4.  **事件处理**: `worldStore` 监听到 `eventLogStore` 的变化，在其 `_dangerouslyProcessEvents` 方法中找到 `物品变化` 事件，并直接修改 `world.value` 中对应角色的 `物品` 数组。
5.  **数据派生**:
    *   `characterStore` 从 `worldStore` 中派生出 `mainCharacter` 对象。
    *   `itemStore` 监听到 `characterStore.mainCharacter` 的变化，并从中提取出 `物品` 列表，作为自己的 `items` 计算属性。
6.  **UI渲染**: `Inventory.vue` 等UI组件消费 `itemStore.items`，当 `worldStore` 中的源数据变化时，UI会自动更新。

---

## 4. 模块职责

*   **`worldStore.ts`**:
    *   **职责**: 物品状态的**唯一管理者**。
    *   **实现**:
        *   通过 `registerEventHandler` 注册 `物品变化` 和 `物品条目更新` 事件的处理器。
        *   处理器直接修改 `world.value.角色[主控角色].物品` 数组。

*   **`itemStore.ts`**:
    *   **职责**: **数据门面**。
    *   **实现**:
        *   不包含任何本地 `ref` 状态。
        *   依赖 `characterStore` 来获取当前的主控角色。
        *   提供一个 `items` 计算属性，返回 `characterStore.mainCharacter?.物品 || []`。
        *   可以包含一些与物品相关的、不修改状态的辅助函数（如计算总价值、按类型过滤等）。
        *   `addItem`, `removeItem` 等修改状态的函数应被移除，调用它们的地方应改为生成相应的LLM事件。

*   **`UI Components`**:
    *   **职责**: **纯视图**。
    *   **实现**:
        *   从 `itemStore` 读取 `items` 并渲染。
        *   当用户执行消耗物品的操作时（如“使用丹药”），应调用 `actions.ts` 中的函数来生成 `物品变化` 事件，而不是直接调用 `itemStore` 的方法。