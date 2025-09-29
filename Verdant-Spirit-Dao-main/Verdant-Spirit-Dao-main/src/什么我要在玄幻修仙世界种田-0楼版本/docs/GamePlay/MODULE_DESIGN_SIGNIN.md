# 签到系统模块设计规范 (MODULE_DESIGN_SIGNIN.md) v3.0

本文档详细阐述了签到系统 (`SYSTEM_SIGNIN`) 的设计与实现，该系统已根据项目最终架构（`FINAL_ARCHITECTURE.md`）进行了完全重构，以遵循**注册表模式**和**单一事实来源**原则。

---

## 1. 核心理念：状态衍生与多源事件驱动

签到系统是一个典型的**衍生系统**，其状态完全由其他核心状态决定。它遵循新架构的核心理念：

1.  **单一事实来源 (`worldStore`)**: 签到记录、连续签到天数等核心数据持久化在 `世界.签到` 变量中，由 `worldStore` 统一管理。`signInStore` 自身不持有任何独立的状态。
2.  **逻辑与状态分离**: `worldStore` 负责管理状态和事件循环，而 `signInStore` 则作为纯粹的**业务逻辑提供者**，定义了“如何”处理 `'签到'` 事件。
3.  **响应式衍生**: `signInStore` 中的所有数据（如日历、签到状态）都通过 `computed` 属性从 `worldStore` 和 `timeStore` 响应式地派生。
4.  **依赖注入 (注册表模式)**: `signInStore` 在初始化时，将其 `handleSignInEvent` 处理器**注册**到 `worldStore` 中。它不主动监听事件，而是由 `worldStore` 在处理事件时回调。

这种设计确保了清晰的**单向数据流**，使系统状态可预测且易于调试。

---

## 2. 数据持久化

签到系统的所有持久化数据都存储在酒馆的聊天变量中。

- **路径**: `世界.签到`
- **数据结构**:

    ```json
    {
      "签到记录": {
        "Y1M1": [1, 5, 10, 28] // Key: Y{年}M{月}, Value: [签到日期数组]
      },
      "连续签到天数": 5,
      "今日已签到": false,
      "月卡": {
        "状态": "未激活", // "未激活" | "激活中"
        "剩余天数": 0
      }
    }
    ```

- **管理者**: `worldStore` 是该数据结构的**唯一写入者**。

---

## 3. 响应式数据链路

签到系统的数据流现在分为三条清晰的路径：内部时间驱动、LLM事件驱动（通过注册表模式）和内部事件驱动。

### 3.1 内部时间驱动的数据流 (每日重置)

此流程处理因游戏内时间流逝而产生的状态变化，例如每日重置。

```mermaid
graph TD
    subgraph Core Stores
        A[timeStore] -- state: day --> B;
        B(signInStore Watcher);
        C[worldStore] -- action: updateWorldState --> D{世界.签到};
    end

    subgraph System Logic
        B -- watches timeStore.day --> E{每日重置逻辑};
        E -- e.g., new day detected --> F[调用 worldStore.updateWorldState(...)];
    end
    
    F --> C;
```

**流程解析**:

1. `timeStore` 的状态 `day` 发生变化。
2. `signInStore` 中的 `watch` 监听到 `day` 的变化，触发每日重置逻辑。
3. 该逻辑调用 `worldStore.updateWorldState` action 来持久化变更（例如，将 `今日已签到` 设为 `false`）。

### 3.2 LLM事件驱动的数据流 (注册表模式)

此流程处理由玩家操作（如点击签到）并经由LLM确认后返回的 `'签到'` 事件。

```mermaid
graph TD
    subgraph "输入与核心事件层"
        A[LLM生成 "签到" 事件] --> B[stateUpdater];
        B --> C[eventLogStore];
    end

    subgraph "核心状态与事件循环"
        D[worldStore]
        D_Loop{事件循环}
        D_Registry[事件处理器注册表]
    end

    subgraph "业务逻辑层"
        E[signInStore]
        E_Handler[handleSignInEvent(...)]
    end

    %% 流程
    C -- "1. 监听事件" --> D
    D -- "2. 触发内部事件循环" --> D_Loop
    D_Loop -- "3. 查找'签到'处理器" --> D_Registry
    D_Registry -- "4. 调用已注册的处理器" --> E_Handler
    E_Handler -- "5. 直接修改 worldState" --> D
    
    %% 注册流程 (初始化时)
    E -- "初始化时" --> D_Registry((注册处理器));
```

**流程解析**:

1. LLM 生成一个 `签到` 类型的 `GameEvent`。
2. `stateUpdater` 将事件添加到 `eventLogStore`。
3. `worldStore` 监听到 `eventLogStore` 的变化，并开始处理新事件。
4. `worldStore` 在其**事件处理器注册表**中查找到由 `signInStore` 注册的 `handleSignInEvent` 处理器。
5. `worldStore` 调用该处理器，并将事件对象和可变的 `worldState` 传递给它。
6. `handleSignInEvent` 函数执行签到逻辑（更新签到记录、增加连续天数等），直接修改传入的 `worldState` 对象。
7. `worldStore` 的事件循环结束后，统一将变更后的 `world` 状态持久化。
8. `signInStore` 的所有相关 getter (`calendarData`, `consecutiveDays` 等) 因 `worldStore` 状态变更而自动重新计算，UI随之更新。

### 3.3 内部事件驱动的数据流 (发放奖励)

此流程处理由签到系统内部逻辑触发、需要与其他系统交互的场景，例如发放补签卡。

```mermaid
graph TD
    subgraph signInStore
        A(handleSignInEvent) -- 连续签到天数 % 7 === 0 --> B[emit('awardItem', ...) on reactiveMessageBus];
    end

    subgraph Event Bus & Orchestrator
        C[reactiveMessageBus] -- event: awardItem --> D(storeOrchestrator);
    end

    subgraph itemStore
        D -- calls action --> E[itemStore.awardItem(...)];
        E --> F[更新 itemStore.items 并持久化];
    end
```

**流程解析**:

1. 在 `handleSignInEvent` 处理器中，检查到 `连续签到天数` 达到了7的倍数。
2. `signInStore` 通过 `reactiveMessageBus.emit` 发出一个 `awardItem` **内部事件**。
3. `storeOrchestrator` 监听到该事件，并调用 `itemStore` 相应的 action 来发放物品。

---

## 4. UI 组件

UI层被拆分为两个组件，严格遵循**视图与逻辑分离**的原则。

### 4.1 `SignInPanel.vue`

- **职责**: 主签到界面，负责展示日历、连续签到天数，并提供每日签到和打开/关闭补签面板的入口。
- **数据源**: `useSignInStore()`。
- **用户交互**:
  - `@click="store.signIn"`: 调用 action，通过 `actionStore` 触发LLM生成当天的签到事件。

### 4.2 `RetroactiveSignInPanel.vue`

- **职责**: 补签功能的用户界面。
- **数据源**:
  - `useSignInStore()`: 用于获取可补签的日期列表。
  - `useItemStore()`: 用于获取玩家当前拥有的“补签卡”数量。
- **用户交互**:
  - `@click="store.retroactiveSignIn(dateString)"`: 调用 `signInStore` 提供的 action，触发LLM生成一个带有 `date` payload 的 `签到` 事件。

---

## 5. 总结

重构后的签到系统清晰地展示了新架构的优势。通过将事件处理逻辑注册到 `worldStore`，`signInStore` 的职责变得更加纯粹和集中：派生UI状态、定义业务逻辑、触发玩家动作。这不仅消除了模块间的直接依赖，也使得整个应用的数据流更加统一和可预测。
