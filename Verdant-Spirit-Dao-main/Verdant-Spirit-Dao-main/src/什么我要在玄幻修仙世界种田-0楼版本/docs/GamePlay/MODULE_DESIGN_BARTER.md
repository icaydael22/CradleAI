# 游戏模块设计：以物换物系统 (v2.0 - 完全响应式)

本文档详细描述了“以物换物”游戏系统的设计理念、数据流、状态管理和UI实现，严格遵循项目核心的**完全响应式状态管理规范** (`REACTIVE_STATE_SPEC.md`)。

## 1. 核心理念

以物换物系统旨在提供一个动态、可交互的交易界面。其实现完全遵循**状态与视图分离**的原则：

*   **单一事实来源 (Single Source of Truth)**: 所有的UI状态（如商店物品列表、玩家物品、选中项、交易价值等）都由 `stores/systems/barterStore.ts` 统一管理。
*   **事件驱动更新**: 商店的可换取物品列表**只能**通过来自LLM的 `可换取物品更新` 事件来变更。
*   **状态驱动视图**: UI组件 (`components/system/BarterPanel.vue`) 是一个纯粹的“哑组件”，它不包含任何业务逻辑，仅负责渲染 `barterStore` 中的状态，并将用户交互委托给 Store 的 Actions 处理。
*   **支持状态重算**: 系统设计确保在切换消息历史（Swipe）时，能够根据历史事件精确地重算出任意时间点的交易面板状态。

## 2. 数据流闭环

系统的数据流形成了一个清晰、可预测的单向闭环：

1.  **LLM -> Store**: LLM 在叙事中生成 `可换取物品更新` 事件。`stateUpdater` 模块捕获此事件并将其添加到 `eventLogStore`。
2.  **Store 响应**: `barterStore` 通过 `watch` 监听到 `eventLogStore` 的变化，处理事件，更新其内部的 `availableItems` 状态，并将此更新持久化到 `世界.以物换物` 变量中。
3.  **Store -> UI**: `BarterPanel.vue` 响应式地连接到 `barterStore`。当 `availableItems` 状态变化时，UI会自动重新渲染，显示最新的物品列表。
4.  **UI -> Store**: 玩家在界面上进行操作（如勾选物品、点击交易按钮），这些操作会直接调用 `barterStore` 中对应的 Actions (`toggleMyItemSelection`, `executeTrade`)。
5.  **Store -> LLM**: `executeTrade` Action 会根据当前选择的物品，构建一个格式化的系统消息（如 `[SYSTEM] 玩家请求进行交易...`），并通过 `triggerAction` 发送给LLM，从而启动新一轮的叙事和状态变更。

## 3. 状态管理 (`barterStore.ts`)

`barterStore` 是整个系统的逻辑核心。

### 3.1 State

*   `availableItems: Ref<IBarterItem[]>`: 商店中可供交换的物品列表。**此状态完全由 `可换取物品更新` 事件驱动**。
*   `myItems: Ref<IBarterItem[]>`: 玩家当前持有的物品列表，在初始化时从角色变量中读取。
*   `mySelectedItems: Ref<Record<string, boolean>>`: 记录玩家选择交易的物品。
*   `traderSelectedItems: Ref<Record<string, boolean>>`: 记录玩家希望换取的商店物品。
*   `lastRefreshDay: Ref<number>`: 记录上次刷新商店的日期，用于控制刷新按钮的可用性。
*   `lastProcessedEventIndex: Ref<number>`: 用于事件增量处理，确保事件不被重复执行。

### 3.2 Getters (Computed Properties)

*   `myOfferValue: ComputedRef<number>`: 自动计算玩家选中物品的总价值。
*   `traderRequestValue: ComputedRef<number>`: 自动计算商店被选中物品的总价值。
*   `isTradeBalanced: ComputedRef<boolean>`: 自动判断交易是否平衡（我方出价 >= 对方要价），直接控制“确认交易”按钮的可用状态。

### 3.3 Actions

*   `initialize()`: 从酒馆变量中读取玩家物品和商店上次的状态，用于初始化UI。
*   `toggleMyItemSelection(itemName)` / `toggleTraderItemSelection(itemName)`: 处理用户的点选操作，更新选择状态。
*   `executeTrade()`: 构建交易请求字符串并发送给LLM。
*   `refreshItems()`: 构建刷新请求字符串并发送给LLM。
*   `persistState()`: 将商店的当前状态（`availableItems` 和 `lastRefreshDay`）写回 `世界.以物换物` 变量。

### 3.4 核心响应逻辑 (Watcher)

`barterStore` 的 `watch` 监听器是实现响应式更新和状态重算的关键：

```typescript
watch(() => eventLogStore.allEvents, (newEvents) => {
    const isRecalc = isRecalculating.value;

    // 步骤 1: 检查是否处于重算状态
    if (isRecalc) {
        // 如果是，则将所有从事件派生的状态重置为初始值
        logger('warn', 'BarterStore', 'Recalculation detected. Resetting event-derived state.');
        availableItems.value = [];
        lastRefreshDay.value = 0;
        lastProcessedEventIndex.value = -1;
    }

    // 步骤 2: 增量处理新事件
    const eventsToProcess = newEvents.slice(lastProcessedEventIndex.value + 1);
    // ... 循环处理 eventsToProcess ...
    for (const event of eventsToProcess) {
        if (event.type === '可换取物品更新') {
            // ... 更新 availableItems.value 和 lastRefreshDay.value ...
        }
    }

    // 步骤 3: 条件性持久化
    // 只有在非重算模式下，才将变更写回酒馆变量
    if (hasChanged && !isRecalc) {
        persistState();
    }

    lastProcessedEventIndex.value = newEvents.length - 1;
}, { deep: true });
```

这个逻辑确保了：
*   **常规流程**: 当新消息传来时，`isRecalc` 为 `false`，Store 会处理新事件并调用 `persistState()` 保存结果。
*   **重算流程**: 当切换消息页时，`isRecalc` 为 `true`，Store 会先**清空**自己的状态，然后根据历史事件**重新构建**状态，但**不会**调用 `persistState()`，避免了中间状态的写入。

## 4. UI 实现 (`BarterPanel.vue`)

UI 组件的设计极度简化，只做两件事：

1.  **渲染状态**: 模板中的所有内容都直接绑定到 `barterStore` 的 state 和 getters。
    ```html
    <!-- 物品列表直接从 store.availableItems 渲染 -->
    <li v-for="item in store.availableItems" ...>
    
    <!-- 按钮的 disabled 状态直接绑定到 store.isTradeBalanced -->
    <button :disabled="!store.isTradeBalanced" ...>
    ```
2.  **转发行为**: 所有的用户交互事件（如 `@click`, `@change`）都直接调用 `barterStore` 的 actions。
    ```html
    <input type="checkbox" @change="store.toggleMyItemSelection(item.名称)" ...>
    <button @click="store.executeTrade" ...>
    ```
这种方式使得UI层非常薄，易于维护，并且自然地享受到了状态管理带来的所有好处。
