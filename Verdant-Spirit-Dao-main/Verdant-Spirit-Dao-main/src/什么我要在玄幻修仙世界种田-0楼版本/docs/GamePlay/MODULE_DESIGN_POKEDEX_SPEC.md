# 图鉴系统规范 (POKEDEX_SPEC.md) v3.0

本文档旨在明确图鉴系统在 v3.0 响应式架构中的定位，并详细描述其数据来源、流动方式及相关模块的职责。它与 `REACTIVE_STATE_SPEC.md` 和 `CHAT_FLOW_SPEC.md` 共同构成项目的核心开发规范。

## 1. 核心设计哲学：状态统一与职责分离

为了根除状态不一致的问题并简化数据流，v3.0 架构废除了 `pokedexStore` 的独立状态，将所有游戏内图鉴数据统一归入 `worldStore` 进行管理。

*   **`世界.图鉴`**: **游戏过程中的唯一事实来源**。此数据由 `worldStore` 管理，代表玩家在**当前游戏存档**中已经发现和解锁的知识。UI界面上所有图鉴相关的展示，都**必须且只能**来源于此状态，以确保UI忠实反映玩家的游戏进度。这是**游戏内叙事**的一部分。

*   **全局图鉴 (`pokedex-data.ts` & 全局变量)**: **游戏知识的权威事实来源**。它是一个静态的、通过模块导入的全局知识库，定义了游戏中所有物品、妖兽、植物、书籍等的权威属性。玩家通过**游戏外元操作**（如使用图鉴管理器）对其进行的修改，是在编辑游戏的**基础数据库**。

## 2. 数据流动与交互原则 (v3.0 响应式模型)

图鉴系统的数据流动被明确划分为两种独立的路径：

### 路径A: 游戏内事件驱动 (用于更新玩家发现)

此路径严格遵循 `REACTIVE_STATE_SPEC.md` 中定义的**LLM事件驱动数据流**，确保逻辑清晰、解耦且可预测。

**`LLM 生成“发现”事件` -> `1. 事件注入` -> `2. WorldStore 响应` -> `3. UI 自动更新`**

#### 阶段1: 事件注入 (责任模块: `core/stateUpdater.ts`)

1.  **事件触发**: 当LLM的输出中包含“新图鉴发现”事件时，`stateUpdater.ts` 的 `syncVariables` 函数会解析这些事件。
2.  **送入总线**: 解析出的 `GameEvent` 对象（包含新图鉴条目）被送入 `eventLogStore`。这是所有**游戏内**状态变更的起点。

#### 阶段2: WorldStore 响应式处理 (责任模块: `stores/core/worldStore.ts`)

这是图鉴系统**游戏内状态更新**的核心，完全内聚在 `worldStore` 中。

1.  **处理事件**: 在状态重算期间，`worldStore` 的 `_dangerouslyProcessEvents` 方法会同步处理 `eventLogStore` 中的所有事件。
2.  **更新状态**: 当该方法遇到 `新图鉴发现` 事件时，它会：
    *   遍历事件中的所有新条目。
    *   对于每个条目，检查**自身的 `world.value.图鉴` 状态**中是否已存在同名条目。
    *   **如果不存在**: 该条目被视为新发现，将被直接添加到 `world.value.图鉴` 状态的对应类别数组中。
3.  **状态持久化**: `worldStore` 的状态持久化由 `recalculateAndApplyState` 统一负责。在事件重放结束后，包含最新图鉴信息的 `world` 对象会被完整地写入酒馆变量。

#### 阶段3: UI 自动更新 (责任模块: `components/pokedex/*.vue`)

1.  **数据绑定**: 所有与图鉴相关的Vue组件都通过 `usePokedexStore()` 获取 `pokedexStore` 的实例。
2.  **响应式渲染**: UI组件直接或通过 `pokedexStore` 的 `computed` 属性，从 `worldStore.world.图鉴` 读取数据。
3.  **自动更新**: 当 `worldStore` 的 `world.图鉴` 状态因响应事件而发生变化时，Vue的响应式系统会**自动**检测到这些变化，并**精确地重新渲染**所有相关的UI组件。

### 路径B: 游戏外元操作 (用于管理全局数据库)

此路径用于玩家作为“上帝”角色，通过UI直接管理全局图鉴数据库。

**`用户在 PokedexManagerModal 中操作` -> `1. 调用 PokedexStore` -> `2. Store 调用 PokedexManager` -> `3. Manager 修改全局变量`**

1.  **用户交互**: 用户在 `PokedexManagerModal.vue` 中点击“添加条目”、“批准新发现”或“删除条目”。
2.  **调用 Store**: `PokedexManagerModal.vue` 调用 `pokedexStore` 中对应的处理函数（如 `createOrUpdateEntry`, `approveDiscoveries`）。
3.  **委托 Manager**: `pokedexStore` **不会创建事件**，而是直接调用 `pokedexManager` 中相应的方法（如 `createPokedexEntry`, `deletePokedexEntry`）。
4.  **修改全局变量**: `pokedexManager` 负责直接读写**全局变量** (`type: 'global'`)，从而更新权威的图鉴数据库。

## 3. 模块职责总结 (v2.1)

*   **`core/stateUpdater.ts`**: **事件解析器和注入器**。只负责将LLM的JSON块转化为标准的 `GameEvent` 并送入 `eventLogStore`。
*   **`stores/core/worldStore.ts`**: **游戏世界状态的唯一管理者**。
    *   **作为事件消费者**: 监听 `eventLogStore` 中的“新图鉴发现”事件，并更新**游戏内**的 `world.图鉴` 状态。
    *   **作为持久化负责人**: 在状态重算结束后，负责将包含最新图鉴信息的完整 `world` 对象写入酒馆变量。
*   **`stores/systems/pokedexStore.ts`**: **图鉴系统的UI协调者与副作用处理器**。
    *   **作为状态中介**: 通过 `computed` 属性从 `worldStore` 读取图鉴数据，供UI层使用。
    *   **作为元操作的入口**: 提供 `createOrUpdateEntry` 等方法，供UI调用。它将这些调用委托给 `pokedexManager`，以操作**游戏外**的全局图鉴数据库。
    *   **作为副作用处理器**: 监听 `eventLogStore` 以触发自动补全等不直接修改核心状态的逻辑。
*   **`components/pokedex/*.vue`**: **纯粹的视图层**。
    *   **只读取** `worldStore` 或 `pokedexStore` 中的计算属性进行展示。
    *   通过调用 `pokedexStore` 的方法来触发**元操作**。
*   **`core/pokedex.ts` (`PokedexManager`)**: **权威知识库的管理器**。封装了对**全局图鉴数据库**（存储在全局变量中）的所有直接CRUD操作。
*   **`PokedexManagerModal.vue`**: **元操作的用户界面**。为玩家提供了一个接口，用于调用 `pokedexStore` 中定义的元操作方法。
