# 最终方案核心架构图 (FINAL_ARCHITECTURE.md)

本文档旨在通过架构图和核心原则，定义项目在v3.0及以后版本所遵循的最终技术架构。这是所有新功能开发和旧模块重构的“导航地图”和“共同语言”。

## 1. 核心架构图

```mermaid
graph TD
    subgraph "数据持久化层 (Data Persistence Layer)"
        A[酒馆聊天变量<br>(单一事实来源)]
    end

    subgraph "核心状态与事件层 (Core State & Event Layer)"
        B[worldStore.ts<br>(核心状态容器)]
        C[eventLogStore.ts<br>(LLM事件总线)]
        D[reactiveMessageBus.ts<br>(内部事件总线)]
    end

    subgraph "业务逻辑层 (Business Logic Layer)"
        E[Pinia Stores (Systems)<br>e.g., timeStore, shelterStore, questStore]
        F[Pinia Stores (Modules)<br>e.g., promptStore, smartContextStore]
    end

    subgraph "UI门面与派生状态层 (UI Facade & Derived State Layer)"
        G[Pinia Stores (Core Facades)<br>e.g., characterStore, itemStore]
        H[Pinia Stores (UI)<br>e.g., teamStore, sidePanelStore]
    end

    subgraph "视图层 (View Layer)"
        I[Vue Components<br>(e.g., TeamTab.vue, ShelterPanel.vue)]
    end

    subgraph "外部输入与处理 (External Input & Processing)"
        J[LLM Response]
        K[stateUpdater.ts]
        L[storeOrchestrator.ts]
    end

    %% 数据流定义
    A -- "1. 初始化加载/持久化" -- B
    J -- "2. 解析LLM事件" --> K
    K -- "3. 将LLM事件送入总线" --> C
    
    subgraph "LLM事件驱动流 (LLM Event Flow)"
        C -- "4. 监听LLM事件" --> B
    end
    
    B -- "5. 暴露核心状态 (world.value)" --> G
    G -- "6. 派生UI友好数据" --> H
    H -- "7. 消费UI状态" --> I

    subgraph "内部事件驱动流 (Internal Event Flow)"
        M[游戏逻辑<br>e.g., worldChangeHandler] -- "8a. 发布内部事件" --> D
        D -- "8b. 监听内部事件" --> L
        L -- "8c. 调用Action" --> E
    end

    subgraph "Store间响应式衍生 (Inter-Store Reactivity)"
        B -- "9a. 监听核心状态" --> E
        E -- "9b. 监听系统状态" --> F
    end
    
    F -- "10. 为PromptManager提供片段" --> L[...PromptManager]
```

## 2. 架构解读

1.  **数据源头 (Data Source)**:
    *   一切的根基是 **`A[酒馆聊天变量]`**，它是持久化状态的唯一权威。
    *   **`B[worldStore]`** 是这个权威数据在内存中的**响应式镜像**和**守护者**。它负责在应用启动时加载这些变量，并在状态变更后将其写回。

2.  **两大事件驱动流**:
    *   **LLM事件流**:
        *   `J[LLM Response]` 经过 `K[stateUpdater]` 解析后，所有游戏事件被送入 `C[eventLogStore]`。
        *   `B[worldStore]` 是 `eventLogStore` 的**主要消费者**，它监听事件日志的变化，并据此修改自身维护的核心世界状态 (`world.value`)。这是驱动游戏剧情和核心状态演变的主路径。
    *   **内部事件流**:
        *   游戏内部逻辑（如时间推进）通过 `D[reactiveMessageBus]` 发布瞬时事件。
        *   `L[storeOrchestrator]` 作为中央调度员，监听这些事件，并调用相应 `E[系统Store]` 的 Actions。这用于处理模块间的解耦通信。

3.  **响应式状态衍生**:
    *   这是架构的精髓。所有 `E[系统Store]` 和 `F[模块Store]` 都像“卫星”一样环绕着 `B[worldStore]`。
    *   它们通过 `watch` 或 `computed` **响应式地**从 `worldStore` 或其他上游 Store 获取状态，并执行自己的业务逻辑。例如，`signInStore` 监听 `timeStore` 的日期变化。

4.  **清晰的UI分层**:
    *   `G[门面Store]` (如 `characterStore`) 从 `worldStore` 中派生出结构更清晰的数据。
    *   `H[UI Store]` (如 `teamStore`) 再从门面 Store 中进一步组合和派生出直接服务于UI的数据。
    *   最终 `I[Vue Components]` 只需消费这些准备好的数据即可，完全无需关心复杂的业务逻辑。

## 3. 核心共识

我们以此为基础进行后续所有工作：

1.  **`worldStore` 是宇宙的中心**: 它是所有核心游戏状态的唯一管理者。任何对 `世界` 或 `角色` 变量的修改，最终都必须通过 `worldStore` 来完成。
2.  **严格区分事件类型**:
    *   来自 **LLM 的、需要持久化和可重放的**状态变更，走 `eventLogStore` -> `worldStore` 路径。
    *   **内部的、瞬时的、用于模块解耦的**通知，走 `reactiveMessageBus` -> `storeOrchestrator` -> `目标Store` 路径。
3.  **拥抱响应式衍生**: 优先使用 `watch` 和 `computed` 来实现 Store 间的状态联动，而不是通过手动的命令式调用。
4.  **保持UI层的纯净**: UI组件和UI Store只负责“读”和“展示”，将所有“写”和业务逻辑都封装在 `Systems` 和 `Core` 层的 Store 中。
5.  **采用注册表模式解耦**: `worldStore` 作为事件循环器，不直接处理具体事件逻辑。各个业务Store（如 `shelterStore`, `weatherStore`）通过 `worldStore` 提供的 `registerEventHandler` 方法，将自己的事件处理器注册进去，实现了核心状态管理与业务逻辑的完全解耦。