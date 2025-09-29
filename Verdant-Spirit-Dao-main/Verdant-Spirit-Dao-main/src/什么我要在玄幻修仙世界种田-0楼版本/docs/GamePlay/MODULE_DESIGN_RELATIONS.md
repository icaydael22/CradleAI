# 关系模块设计规范 (v2.0 - worldStore 核心)

本文档详细阐述了“关系”模块在 v2.0 响应式架构下的完整技术实现，旨在为开发者提供一个清晰、统一的设计和实现指南。

## 1. 设计哲学

角色关系是驱动游戏内社交互动和剧情发展的核心。其设计严格遵循项目 v2.0 的**完全响应式状态管理规范** ([`REACTIVE_STATE_SPEC.md`](../Core/REACTIVE_STATE_SPEC.md))。

1.  **单一事实来源 (Single Source of Truth)**: `worldStore` 中持有的 `world.value.角色.<角色名>.关系` 状态，是所有角色关系数据的**唯一事实来源**。
2.  **事件驱动 (Event-Driven)**: 关系状态的任何变更（提升、下降、锁定等）**必须**通过 `EventLogStore` 中的 `关系变化` 事件来驱动，并由 `worldStore` 统一处理。
3.  **状态容器内聚 (State Container Cohesion)**: 所有与关系相关的事件处理逻辑、数据获取和持久化操作，都内聚在 `worldStore` (`stores/core/worldStore.ts`) 中。
4.  **门面模式 (Facade Pattern)**: `relationsStore` (`stores/systems/relationsStore.ts`) 不再管理任何持久化状态。它作为一个**无状态的门面**，通过计算属性 (`computed`) 从 `worldStore` 和 `characterStore` 派生出所有角色的关系数据，为UI层提供一个稳定、简洁的接口。
5.  **UI响应式 (Reactive UI)**: UI组件 (如 `RelationsTab.vue`) **只负责消费**来自 `relationsStore` 的数据，并响应式地更新视图。

---

## 2. 数据持久化层

### 2.1 数据结构

关系数据持久化在酒馆聊天变量的 `世界.角色.<角色名>.关系` 路径下。为了确保数据的可扩展性和查询效率，我们规定**关系必须是一个对象（字典）**，而不是数组。

**核心结构示例 (`VARIABLES_SPEC.md`)**:

```json
"世界": {
  "角色": {
    "主控角色名": "萧栖雪",
    "萧栖雪": {
      "关系": {
        "李云": 50, // 好感度数值
        "神秘商人": -10
      }
    },
    "李云": {
      "关系": {
        "萧栖雪": 50
      }
    }
  }
}
```

---

## 3. 响应式数据链路

### 3.1 数据流图

```mermaid
graph TD
    subgraph "Data Persistence"
        A[酒馆聊天变量<br>'世界.角色.*.关系']
    end

    subgraph "Core State & Event Layer"
        B[worldStore.ts]
        C[eventLogStore.ts]
    end

    subgraph "Facade Layer"
        D[characterStore.ts]
        E[relationsStore.ts]
    end

    subgraph "UI Layer"
        F[RelationsTab.vue]
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
    D -- "5b. Provides `characters`" --> E

    E -- "6. Provides `relations` computed" --> F
```

### 3.2 链路详解

1.  **初始化/持久化**: `worldStore` 在启动时加载 `世界` 变量，并在状态变更后将其完整写回。
2.  **事件生成**: LLM 在其响应中生成 `关系变化` 事件。
3.  **事件注入**: `stateUpdater` 解析事件并将其送入 `eventLogStore`。
4.  **事件处理**: `worldStore` 监听到 `eventLogStore` 的变化，在其 `_dangerouslyProcessEvents` 方法中找到 `关系变化` 事件，并直接修改 `world.value` 中对应角色的 `关系` 对象。
5.  **数据派生**:
    *   `characterStore` 从 `worldStore` 中派生出 `characters` 对象。
    *   `relationsStore` 监听到 `characterStore.characters` 的变化，并从中提取出所有角色的关系数据，格式化后作为自己的 `relations` 计算属性。
6.  **UI渲染**: `RelationsTab.vue` 等UI组件消费 `relationsStore.relations`，当 `worldStore` 中的源数据变化时，UI会自动更新。

---

## 4. 模块职责

*   **`worldStore.ts`**:
    *   **职责**: 关系状态的**唯一管理者**。
    *   **实现**:
        *   通过 `registerEventHandler` 注册 `关系变化` 事件的处理器。
        *   处理器负责解析 `payload`（包含 `角色`, `目标`, `变化值`），并精确地更新 `world.value.角色[角色].关系[目标]` 的数值。

*   **`relationsStore.ts`**:
    *   **职责**: **数据门面**。
    *   **实现**:
        *   不包含任何本地 `ref` 状态。
        *   依赖 `characterStore` 来获取所有角色的数据。
        *   提供一个 `relations` 计算属性，该属性遍历 `characterStore.characters`，并返回一个格式化后的、适合UI展示的关系列表或对象。

*   **`UI Components`**:
    *   **职责**: **纯视图**。
    *   **实现**:
        *   从 `relationsStore` 读取 `relations` 并渲染。
        *   不包含任何修改状态的逻辑。