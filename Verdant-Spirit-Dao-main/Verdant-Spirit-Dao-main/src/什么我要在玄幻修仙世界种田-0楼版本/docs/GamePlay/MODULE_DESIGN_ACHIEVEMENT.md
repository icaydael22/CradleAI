# 游戏模块设计：成就系统 (MODULE_DESIGN_ACHIEVEMENT.md) v2.0

本文档详细阐述了成就系统的设计与实现，该系统已根据项目最终架构（`FINAL_ARCHITECTURE.md`）进行了完全重构，以遵循**注册表模式**和**单一事实来源**原则。

## 1. 核心设计理念

成就系统是新架构模式下的一个标准范例，其核心理念是：

- **单一事实来源 (Single Source of Truth)**: 成就系统的所有状态数据都统一存储在 `worldStore` 的 `世界.成就` 路径下。`achievementStore` 自身不持有任何持久化状态。
- **逻辑与状态分离**: `worldStore` 负责管理状态和事件循环，而 `achievementStore` 则作为纯粹的**业务逻辑提供者**，定义了“如何”处理与成就相关的事件。
- **响应式衍生**: `achievementStore` 中的所有数据（如成就点数、已完成列表）都通过 `computed` 属性从 `worldStore` 响应式地派生，确保UI始终与核心状态同步。
- **依赖注入 (注册表模式)**: `achievementStore` 在初始化时，将其事件处理器函数（如 `handleNewAchievement`）**注册**到 `worldStore` 中。它不关心事件“何时”发生，只负责定义事件发生时应执行的逻辑。

---

## 2. 数据持久化 (Persistence Layer)

成就系统的状态数据被持久化存储在**世界**变量对象下，由 `worldStore` 统一管理。

- **路径**: `世界.成就`
- **数据结构** (`AchievementState`):

  ```json
  {
    "成就点数": 10,
    "completed": {
      "achv_first_arrival": { 
        "id": "achv_first_arrival", 
        "名称": "初来乍到", 
        "描述": "抵达元初界。",
        "点数": 10,
        "完成时间": "第 1 天 子时" 
      }
    },
    "奖励列表": [
      { 
        "id": "item_starter_tool_blueprint", 
        "名称": "基础工具新手包", 
        "描述": "...", 
        "消耗点数": 10, 
        "库存": 1 
      }
    ],
    "上次刷新天数": 1
  }
  ```

- **设计 rationale**:
  - `completed` 字段采用以**成就ID为键的字典结构**，以保持 `O(1)` 时间复杂度的读写性能。
  - `上次刷新天数` 字段用于实现奖励列表的刷新冷却逻辑。

---

## 3. 响应式数据链路 (Reactive Data Flow)

成就系统的数据流严格遵循 `FINAL_ARCHITECTURE.md` 中定义的**注册表模式**。

### 3.1 核心组件

- **`stores/systems/achievementStore.ts`**:
  - **角色**: 成就系统的**业务逻辑提供者 (Business Logic Provider)** 和 **视图模型 (View Model)**。
  - **职责**:
    1. **状态派生**: 自身不存储状态。所有数据（如 `points`, `completedAchievements`, `rewards`）都通过 `computed` 属性从 `worldStore.world.成就` 响应式地派生。
    2. **定义事件处理器**: 包含多个纯函数（如 `handleNewAchievement`, `handleRewardUpdate`），每个函数都接收 `event` 和可变的 `worldState` 作为参数，并直接在 `worldState.成就` 上执行修改。
    3. **注册处理器**: 在 `defineStore` 的初始化阶段，调用 `worldStore.registerEventHandler` 方法，将上述处理器与对应的事件类型（如 `'新成就'`）进行绑定。
    4. **提供 Actions**: 暴露 `redeemReward` 和 `refreshRewards` 等方法给UI层调用。这些方法通过 `actionStore` 发送系统消息，以间接方式触发LLM生成新的事件。

- **`stores/core/worldStore.ts`**:
  - **角色**: **单一事实来源 (Single Source of Truth)** 和 **事件循环处理器 (Event Loop Processor)**。
  - **职责**:
    - 在 `WorldStateSchema` 中定义 `成就` 的 `Zod` 结构，确保数据类型安全。
    - 提供 `registerEventHandler` 方法，允许其他 Store 注入自己的业务逻辑。
    - 在内部的事件处理循环中，当监听到 `eventLogStore` 的变化时，会查找已注册的处理器并调用它，将事件和自身管理的 `world.value` 状态传递过去。
    - 统一负责将变更后的 `world` 状态持久化到酒馆变量中。

### 3.2 数据流图 (新架构)

```mermaid
graph TD
    subgraph "输入层"
        A[LLM生成 "新成就" 等事件]
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
        E[achievementStore]
        E_Handler[handleNewAchievement(...)]
    end

    subgraph "UI/视图层"
        F[AchievementPanel.vue]
    end

    %% 流程
    A -- "1. LLM响应" --> B
    B -- "2. 解析并送入事件总线" --> C
    C -- "3. 监听事件变化" --> D
    D -- "4. 触发内部事件循环" --> D_Loop
    D_Loop -- "5. 查找事件类型对应的处理器" --> D_Registry
    D_Registry -- "6. 调用已注册的处理器" --> E_Handler
    E_Handler -- "7. 直接修改 worldState" --> D
    D -- "8. 状态变更，响应式触发" --> E
    E -- "9. 派生 computed 属性" --> F

    %% 注册流程 (初始化时)
    E -- "初始化时调用" --> D_Registry((注册处理器))
```

---

## 4. UI 显示 (View Layer)

UI层的设计保持不变，它依然是一个纯粹的数据消费者。

- **组件**: `components/system/AchievementPanel.vue`
- **职责**:
  1. **数据源**: 通过 `useAchievementStore()` 获取 `achievementStore` 的实例。
  2. **渲染**: 使用 `v-for` 遍历 `store.completedAchievements` 和 `store.rewards` 等 `computed` 属性来显示数据。
  3. **状态驱动交互**: 按钮的 `:disabled` 状态绑定到 `store.canRefresh` 等派生属性，实现自动的状态驱动交互。
  4. **事件触发**: 点击按钮时，调用 `achievementStore` 中对应的 `redeemReward` 或 `refreshRewards` 方法。

---

## 5. 总结

重构后的成就系统是新架构的一个标准实现。通过将事件处理逻辑从 `achievementStore` 中“拉出”并“注册”到 `worldStore` 中，我们实现了**控制反转 (Inversion of Control)**。`achievementStore` 不再主动监听和拉取事件，而是被动地由 `worldStore` 在适当的时候调用。这极大地降低了模块间的耦合度，并巩固了 `worldStore` 作为应用状态和逻辑流程中心的地位。
