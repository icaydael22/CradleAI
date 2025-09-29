# 游戏模块设计：技能系统 (MODULE_DESIGN_SKILL.md) v2.0

本文档详细阐述了技能系统的设计与实现，该系统已根据项目最终架构（`FINAL_ARCHITECTURE.md`）进行了完全重构，以遵循**注册表模式**和**单一事实来源**原则。

## 1. 核心设计理念

技能系统是新架构模式下的一个标准范例，其核心理念是：

- **单一事实来源 (Single Source of Truth)**: 技能数据是角色数据的一部分，统一存储在 `worldStore` 的 `世界.角色.<角色名>.技能` 路径下。`skillStore` 自身不持有任何持久化状态。
- **逻辑与状态分离**: `worldStore` 负责管理状态和事件循环，而 `skillStore` 则作为纯粹的**业务逻辑提供者**，定义了“如何”处理与技能相关的事件。
- **响应式衍生**: `skillStore` 中的所有数据（如技能列表）都通过 `computed` 属性从 `characterStore` (作为 `worldStore` 的门面) 响应式地派生，确保UI始终与核心状态同步。
- **依赖注入 (注册表模式)**: `skillStore` 在初始化时，将其 `handleSkillUpdate` 事件处理器**注册**到 `worldStore` 中。它不关心事件“何时”发生，只负责定义事件发生时应执行的逻辑。

---

## 2. 数据持久化 (Persistence Layer)

技能系统的状态数据作为角色属性的一部分，被持久化存储在**世界**变量对象下，由 `worldStore` 统一管理。

- **路径**: `世界.角色.<主控角色名>.技能`
- **数据结构**:

  ```json
  {
    "skill_water_1": { 
      "id": "skill_water_1", 
      "名称": "引水咒", 
      "类别": "功法", 
      "熟练度": 5, 
      "等级": 1,
      "描述": "基础的水系法术，可以引导少量水流。",
      "当前等级效果": "引来一股微弱的水流，可用于灌溉小片灵田。"
    }
  }
  ```

- **设计 rationale**:
  - 将技能数据与角色绑定，符合逻辑数据模型。
  - 采用以**技能ID为键的字典结构**，以保持 `O(1)` 时间复杂度的读写性能。

---

## 3. 响应式数据链路 (Reactive Data Flow)

技能系统的数据流严格遵循 `FINAL_ARCHITECTURE.md` 中定义的**注册表模式**。

### 3.1 核心组件

- **`stores/systems/skillStore.ts`**:
  - **角色**: 技能系统的**业务逻辑提供者 (Business Logic Provider)** 和 **视图模型 (View Model)**。
  - **职责**:
    1. **状态派生**: 自身不存储状态。所有数据（如 `skillList`, `gongfaSkills`）都通过 `computed` 属性从 `characterStore.mainCharacter.技能` 响应式地派生。
    2. **定义事件处理器**: 包含一个纯函数 `handleSkillUpdate`，该函数接收 `event` 和可变的 `worldState` 作为参数，并直接在 `worldState.角色.<角色名>.技能` 上执行增、删、改操作。
    3. **注册处理器**: 在 `defineStore` 的初始化阶段，调用 `worldStore.registerEventHandler` 方法，将 `handleSkillUpdate` 处理器与 `'技能更新'` 事件类型进行绑定。

- **`stores/core/worldStore.ts`**:
  - **角色**: **单一事实来源 (Single Source of Truth)** 和 **事件循环处理器 (Event Loop Processor)**。
  - **职责**:
    - 在 `WorldStateSchema` 中定义 `角色` 的 `Zod` 结构，其中包含了技能的数据结构。
    - 提供 `registerEventHandler` 方法，允许其他 Store 注入自己的业务逻辑。
    - 在内部的事件处理循环中，当监听到 `'技能更新'` 事件时，会调用由 `skillStore` 注册的处理器。
    - 统一负责将变更后的 `world` 状态持久化到酒馆变量中。

### 3.2 数据流图 (新架构)

```mermaid
graph TD
    subgraph "输入层"
        A[LLM生成 "技能更新" 事件]
    end

    subgraph "核心事件层"
        B[stateUpdater.ts]
        C[eventLogStore]
    end

    subgraph "核心状态层"
        D[worldStore]
        D_Loop{事件循环}
        D_Registry[事件处理器注册表]
    end

    subgraph "业务逻辑层 (Systems)"
        E[skillStore]
        E_Handler[handleSkillUpdate(...)]
    end
    
    subgraph "门面层 (Facades)"
        G[characterStore]
    end

    subgraph "UI/视图层"
        F[SkillPanel.vue]
    end

    %% 流程
    A -- "1. LLM响应" --> B
    B -- "2. 解析并送入事件总线" --> C
    C -- "3. 监听事件变化" --> D
    D -- "4. 触发内部事件循环" --> D_Loop
    D_Loop -- "5. 查找'技能更新'处理器" --> D_Registry
    D_Registry -- "6. 调用已注册的处理器" --> E_Handler
    E_Handler -- "7. 直接修改 worldState" --> D
    D -- "8. 状态变更，响应式触发" --> G
    G -- "9. 派生 mainCharacter" --> E
    E -- "10. 派生 skillList" --> F

    %% 注册流程 (初始化时)
    E -- "初始化时调用" --> D_Registry((注册处理器))
```

---

## 4. UI 显示 (View Layer)

技能系统的UI由 `SkillPanel.vue` 组件负责。

- **组件**: `components/system/SkillPanel.vue`
- **职责**:
  1. **数据源**: 通过 `useSkillStore()` 获取 `skillStore` 的实例。
  2. **渲染**:
     - 使用 `v-if="store.hasSkills"` 来处理空状态显示。
     - 使用 `v-for` 遍历 `store.skills` (`computed` 属性) 来渲染每个技能的UI元素。
     - 熟练度进度条等都直接绑定自 `skill` 对象。
- **响应式更新**: 由于 `SkillPanel.vue` 依赖于 `skillStore` 的响应式状态，任何通过事件流导致的技能数据变化，都会被Vue的响应式系统自动捕捉并重新渲染UI。

---

## 5. 总结

重构后的技能系统完全遵循了项目的核心架构规范。通过将技能数据归于 `worldStore` 统一管理，并将业务逻辑封装为注册到 `worldStore` 的处理器，`skillStore` 的职责变得极为纯粹：它只负责从核心状态中派生出UI需要的数据，并提供处理自身业务逻辑的纯函数。这种模式极大地降低了耦合，提升了系统的可维护性和可预测性。
