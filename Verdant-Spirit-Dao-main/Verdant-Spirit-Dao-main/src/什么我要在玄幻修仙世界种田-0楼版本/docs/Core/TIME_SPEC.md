# 游戏内时间管理规范 (TIME_SPEC.md) v3.0

本文档旨在为游戏的时间管理系统提供清晰的设计和使用规范。随着游戏架构向完全响应式模型迁移（见 `REACTIVE_STATE_SPEC.md`），时间系统已全面重构，以支持由LLM驱动、通过内部事件总线进行解耦、并由Pinia Store集中管理的叙事节奏。

## 1. 设计哲学 (v3.0)

1. **LLM主导，系统验证**: 时间的推进由大型语言模型（LLM）在叙事中提出，由系统代码进行验证和实施。这给予了LLM最大的叙事自由度，同时通过规则防止逻辑错误（如时间倒流）。
2. **响应式事件驱动 (Reactive Event-Driven)**: 游戏时间的变更由两种方式驱动：
    * **LLM 事件**: LLM 生成的 `上下文更新` 事件，由 `worldStore` 统一处理，直接更新 `世界.时间` 状态。
    * **内部事件**: 游戏逻辑（如 `worldChangeHandler`）可以发布 `timeChanged` 内部事件，由 `storeOrchestrator` 路由，最终调用 `worldStore` 的 action 来更新状态。
3. **状态集中化 (Centralized State)**: 所有与时间相关的权威状态 (`世界.时间`) 都集中在 `worldStore` 中。`timeStore` 作为一个无状态的**门面 (Facade)**，通过 `computed` 属性派生数据供其他模块使用。
4. **职责分离 (Separation of Concerns)**:
    * **`worldStore.ts`**: 作为最终的**状态容器**，负责处理所有时间相关的LLM事件，并持久化状态。
    * **`worldChangeHandler.ts`**: 负责解析LLM意图并**发布** `timeChanged` 内部事件。
    * **`reactiveMessageBus.ts` & `storeOrchestrator.ts`**: 负责**路由**内部事件。
    * **`timeStore.ts`**: 作为**数据门面**，为UI和其他Store提供响应式的、计算好的时间数据。
    * **`core/time.ts`**: 提供纯粹的时间解析**工具函数**。

## 2. 核心模块与职责 (v3.0)

### `stores/systems/timeStore.ts`

这是时间状态的**数据门面 (Data Facade)**。

* **State**: 无本地状态。所有数据均来自 `worldStore`。
* **Getters**:
  * `state`: `computed(() => worldStore.time)`
  * `day`: `computed(() => state.value?.day)`
  * `timeOfDay`: `computed(() => state.value?.timeOfDay)`
  * 提供格式化的时间字符串 (`currentDateString`) 或衍生计算值 (`dayOfYear`)，供UI或其他模块消费。

### `core/events/worldChangeHandler.ts`

这是连接LLM输出和内部事件总线的桥梁。

* **`contextUpdateHandler`**:
  * **职责**: 监听由LLM生成的 `contextUpdate` 事件，并处理其中的时间变更请求。
  * **核心逻辑**:
        1. 当接收到包含 `时间` 字段的事件时，调用 `time.ts` 中的 `parseTimeDetailsFromString` 函数解析出LLM意图推进到的**相对天数**和**时辰索引**。
        2. 从 `世界.当前日期` 和 `世界.当前时辰` 获取当前时间的绝对小时数。
        3. **验证**:
            * 将LLM的相对天数转换为绝对小时数。
            * **规则**: LLM的绝对小时数必须 **大于或等于** 当前的绝对小时数。
            * 如果验证失败（时间倒流），则忽略该请求，并通过 `toastr` （在非重算状态下）向用户显示错误提示。
        4. **发布事件**: 如果验证通过，则构造一个 `TimeChangedPayload`，并通过 `emit('timeChanged', payload)` 将其发布到 `reactiveMessageBus` 上。**它自身不直接修改任何状态**。

### `core/reactiveMessageBus.ts` & `core/storeOrchestrator.ts`

这两个模块构成了内部事件驱动的核心。

* `reactiveMessageBus` 提供 `emit` 和 `events` 接口，用于发布和监听事件。
* `storeOrchestrator` 在应用初始化时启动，`watch` `reactiveMessageBus.events.timeChanged` 的变化，并在事件发生时调用 `timeStore.updateTime(payload)`。

### `core/time.ts`

该模块是时间相关**纯函数**工具的集合。

* **`parseTimeDetailsFromString(timeStr)`**: 从LLM的中文时间字符串中，精确解析出**相对于开局日期的天数**和**标准化的时辰信息**（名称和索引）。
* **`dateToAbsoluteDays(date)` / `absoluteDaysToDate(days)`**: 在日期对象和绝对天数之间进行转换，用于时间验证计算。
* **`parseDayFromChinese(str)`**: 从中文数字字符串中解析出阿拉伯数字。

## 3. 数据契约 (Data Contract) (v3.0)

### 3.1 Pinia Store State (`timeStore`)

这是所有模块应依赖的权威时间数据源。

* **`timeStore.day` (number)**: 游戏的总天数。
* **`timeStore.timeOfDay` (string)**: 当前的标准时辰名称。

### 3.2 底层酒馆变量 (由 `worldStore` 统一管理)

这些变量是持久化的原始数据，不应被UI或其他业务逻辑直接访问。

1. **`世界.时间` (object: `ITimeState`)**:
    * **来源**: 由 `worldStore` 在处理LLM事件或内部事件后更新。
    * **用途**: 作为持久化的唯一事实来源。
2. **`世界.开局日期` (object)**:
    * **来源**: 游戏初始化时生成。
    * **结构**: `{ "年": number, "月": number, "日": number }`
3. **`世界.当前日期` (object)**:
    * **来源**: 由 `contextUpdateHandler` 维护。
    * **结构**: `{ "年": number, "月": number, "日": number }`
    * **用途**: 作为时间推进验证的基准。
4. **`世界.当前时辰` (number)**:
    * **来源**: 由 `contextUpdateHandler` 维护。
    * **格式**: 0-11的数字索引，对应 `子时` 到 `亥时`。
    * **用途**: 用于防止同一天内的时间倒流验证。

## 4. 工作流程 (v3.0)

### 4.1 时间推进流程 (完全响应式)

1. **LLM生成**: LLM在其回复的`<statusbar>`中，生成一个新的 `时间` 字段。
2. **事件解析**: `stateUpdater` 将其作为 `contextUpdate` 事件的载荷，由 `eventManager` 路由到 `worldChangeHandler`。
3. **事件处理**:
    * **LLM 事件**: `worldStore` 直接处理 `上下文更新` 事件，修改 `world.value.时间`。
    * **内部事件**: `worldChangeHandler` 发布 `timeChanged` 事件 -> `storeOrchestrator` 监听到并调用 `timeStore.updateTime()` -> `timeStore.updateTime()` 再调用 `worldStore.updateWorldState('时间', ...)` 来应用变更。
4. **UI与业务逻辑响应**:
    * `timeStore` 通过 `computed` 属性响应 `worldStore.time` 的变化。
    * 所有依赖 `timeStore` 的Vue组件和其他Store，都会自动、响应式地接收到最新的时间数据。

通过这套新的完全响应式架构，我们实现了由LLM灵活控制、逻辑高度解耦、状态完全可预测的时间系统，完美融入了项目的整体架构。
