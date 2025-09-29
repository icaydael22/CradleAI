# 游戏模块设计：任务系统 (MODULE_DESIGN_QUEST.md) v2.0

本文档详细阐述了任务系统的设计与实现，该系统已根据项目最终架构（`FINAL_ARCHITECTURE.md`）进行了完全重构，以遵循**注册表模式**和**单一事实来源**原则。

## 1. 核心设计理念

任务系统是新架构模式下的一个标准范例，其核心理念是：

- **单一事实来源 (Single Source of Truth)**: 任务系统的所有状态数据都统一存储在 `worldStore` 的 `世界.任务列表` 路径下。`questStore` 自身不持有任何持久化状态。
- **逻辑与状态分离**: `worldStore` 负责管理状态和事件循环，而 `questStore` 则作为纯粹的**业务逻辑提供者**，定义了“如何”处理与任务相关的事件。
- **响应式衍生**: `questStore` 中的所有数据（如 `ongoingQuests`, `completedQuests`）都通过 `computed` 属性从 `worldStore` 响应式地派生，确保UI始终与核心状态同步。
- **依赖注入 (注册表模式)**: `questStore` 在初始化时，将其事件处理器函数（如 `handleNewQuest`）**注册**到 `worldStore` 中。它不关心事件“何时”发生，只负责定义事件发生时应执行的逻辑。

---

## 2. 数据持久化 (Persistence Layer)

任务系统的状态数据被持久化存储在**世界**变量对象下，由 `worldStore` 统一管理。

- **路径**: `世界.任务列表`
- **数据结构** (`Quest[]`):

  ```json
  [
    {
      "id": "q_001",
      "名称": "修复庇护所",
      "描述": "你的庇护所被损坏了，需要修理。",
      "状态": "进行中",
      "目标": [
        { "描述": "将围墙修复至80%耐久度", "完成": false }
      ],
      "奖励": "10个木材"
    }
  ]
  ```

- **设计 rationale**:
  - `任务列表` 是一个数组，直接反映了玩家当前的任务日志。
  - 每个任务对象都由 `QuestSchema` (在 `questStore.ts` 中定义) 进行严格的类型校验。

---

## 3. 响应式数据链路 (Reactive Data Flow)

任务系统的数据流严格遵循 `FINAL_ARCHITECTURE.md` 中定义的**注册表模式**。

### 3.1 核心组件

- **`stores/systems/questStore.ts`**:
  - **角色**: 任务系统的**业务逻辑提供者 (Business Logic Provider)** 和 **视图模型 (View Model)**。
  - **职责**:
    1. **状态派生**: 自身不存储状态。所有数据（如 `quests`, `ongoingQuests`）都通过 `computed` 属性从 `worldStore.world.任务列表` 响应式地派生。
    2. **定义事件处理器**: 包含多个纯函数（如 `handleNewQuest`, `handleQuestProgress`, `handleQuestComplete`, `handleQuestFail`），每个函数都接收 `event` 和可变的 `worldState` 作为参数，并直接在 `worldState.任务列表` 上执行增、删、改操作。
    3. **注册处理器**: 在 `defineStore` 的初始化阶段，调用 `worldStore.registerEventHandler` 方法，将上述处理器与对应的事件类型（如 `'新任务接收'`）进行绑定。

- **`stores/core/worldStore.ts`**:
  - **角色**: **单一事实来源 (Single Source of Truth)** 和 **事件循环处理器 (Event Loop Processor)**。
  - **职责**:
    - 在 `WorldStateSchema` 中定义 `任务列表` 的 `Zod` 结构。
    - 提供 `registerEventHandler` 方法，允许其他 Store 注入自己的业务逻辑。
    - 在内部的事件处理循环中，当监听到 `eventLogStore` 的变化时，会查找已注册的处理器并调用它，将事件和自身管理的 `world.value` 状态传递过去。
    - 统一负责将变更后的 `world` 状态持久化到酒馆变量中。

### 3.2 数据流图 (新架构)

```mermaid
graph TD
    subgraph "输入层"
        A[LLM生成 "新任务接收" 等事件]
    end

    subgraph "核心事件层"
        B[stateUpdater.ts]
        C[eventLogStore]
    end

    subgraph "核心状态层"
        D[worldStore]
        D_Loop{事件循环<br>_dangerouslyProcessEvents}
        D_Registry[事件处理器注册表]
    end

    subgraph "业务逻辑层 (Systems)"
        E[questStore]
        E_Handler[handleNewQuest(...)]
    end

    subgraph "UI/视图层"
        F[QuestTab.vue]
    end

    %% 流程
    A -- "1. LLM响应" --> B
    B -- "2. 解析并送入事件总线" --> C
    C -- "3. 监听事件变化" --> D
    D -- "4. 触发内部事件循环" --> D_Loop
    D_Loop -- "5. 查找事件类型对应的处理器" --> D_Registry
    D_Registry -- "6. 调用已注册的处理器" --> E_Handler
    E_Handler -- "7. 直接修改 worldState.任务列表" --> D
    D -- "8. 状态变更，响应式触发" --> E
    E -- "9. 派生 computed 属性" --> F

    %% 注册流程 (初始化时)
    E -- "初始化时调用" --> D_Registry((注册处理器))
```

---

## 4. UI 显示 (View Layer)

任务系统的UI由 `QuestTab.vue` 和 `QuestItem.vue` 等组件负责。

- **组件**: `components/system/QuestTab.vue`
- **职责**:
  1. **数据源**: 通过 `useQuestStore()` 获取 `questStore` 的实例。
  2. **渲染**:
     - **分类显示**: 使用 `v-for` 分别遍历 `store.ongoingQuests`, `store.completedQuests` 等 `computed` 属性，将不同状态的任务渲染到对应的区域。
     - **任务详情**: 每个任务项由 `QuestItem.vue` 组件渲染，展示任务的名称、描述、目标和进度。

---

## 5. 总结

重构后的任务系统完全遵循了项目的核心架构规范。通过将持久化、业务逻辑和UI显示清晰地分离到不同的层次，并利用Pinia和Vue的响应式能力将它们连接起来，构建了一个健壮、可维护且易于扩展的功能模块。其数据流严格遵循“事件 -> `eventLogStore` -> `worldStore` 事件循环 -> 业务Store处理器 -> `worldStore` 状态更新 -> UI”的单向模式。
