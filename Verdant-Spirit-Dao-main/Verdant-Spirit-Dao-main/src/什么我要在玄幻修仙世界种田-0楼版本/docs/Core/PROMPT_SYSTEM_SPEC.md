# 设计文档：动态提示词系统 (Dynamic Prompt System)

**版本**: 1.0
**状态**: 已实现

## 1. 概述 (Overview)

本文档阐述了新的动态提示词系统（Dynamic Prompt System）的设计与实现。该系统旨在让 `PromptManager` 能够动态地响应游戏世界的实时变化，并将这些变化作为上下文信息注入到发送给大型语言模型（LLM）的系统提示词中。

其核心目标是增强LLM对当前游戏状态的感知，使其生成的叙事和决策更加贴近和适应不断变化的游戏环境，例如天气变化、庇护所状态更新或特殊事件的发生。

## 2. 设计哲学 (Design Philosophy)

- **事件驱动 (Event-Driven)**: 系统完全由 `messageBus` 驱动。`PromptManager` 作为事件的“订阅者”，被动地接收来自其他模块（“发布者”）的状态更新，实现了模块间的低耦合。
- **可扩展性 (Extensibility)**: 添加新的动态信息源应该非常简单。任何模块只要向 `messageBus` 发出一个已定义的事件，`PromptManager` 就可以轻松地配置为监听该事件并相应地更新提示词，而无需修改事件源模块。
- **集中管理 (Centralized Management)**: 所有动态信息的格式化和注入逻辑都集中在 `PromptManager` 内部。这确保了提示词结构的一致性，并简化了调试过程。
- **性能优化 (Performance-conscious)**: 动态信息片段被缓存起来。只有在相关事件发生时，缓存才会更新，并且只有在下次需要生成完整的系统提示词时，这些片段才会被组合起来。

## 3. 技术实现 (Technical Implementation)

### 3.1. 核心组件

- **`core/promptManager.ts`**: 系统的核心实现。
- **`core/messageBus.ts`**: 类型安全的消息总线，用于事件的发布和订阅。
- **`core/events/definitions.ts`**: 所有事件及其载荷的中心化定义（契约）。

### 3.2. 工作流程

1. **初始化 (Initialization)**:
    - 在应用启动时（`index.ts`），`PromptManager` 的实例被创建。
    - 其构造函数调用 `initializeListeners()` 方法。
    - 在 `initializeListeners()` 中, `PromptManager` 使用 `messageBus.on()` 订阅它关心的所有事件（例如 `weatherChanged`, `shelterStatusChanged`, `adventureHintUpdate` 等）。

2. **事件监听与缓存 (Event Listening & Caching)**:
    - 当游戏中的任何模块（如 `WeatherManager`）通过 `messageBus.emit()` 发布一个事件时，`PromptManager` 中对应的监听器回调函数被触发。
    - 回调函数接收到类型安全的 `payload`，并根据其内容生成一段描述性的文本字符串（一个“动态片段”）。
    - 这个片段被存储在一个名为 `dynamicFragments` 的私有 `Map<string, string>` 中，使用事件名或模块名作为键（例如，`'weather'` -> `"当前天气为晴朗，万里无云。"`）。
    - 更新片段后，会调用 `this.systemPrompts.clear()` 来使已缓存的完整系统提示词失效，强制下次请求时重新构建。

3. **提示词构建 (Prompt Construction)**:
    - 当需要生成AI回应时（例如，玩家执行一个动作），`triggerAction` 函数会调用 `promptManager.preparePromptComponents()`。
    - 在 `preparePromptComponents()` 内部，会调用 `explainVariables()` 方法来构建包含所有游戏状态变量的JSON部分。
    - `explainVariables()` 的第一步就是处理 `dynamicFragments`。它会遍历 `Map` 中的所有条目，将它们组合成一个名为 `世界状态摘要` 的数组，并将其作为第一个JSON对象注入到最终的提示词中。
    - **特殊处理**: `adventureHint` 是一个特例，它不会进入 `世界状态摘要`，而是直接被注入到系统指令（System Instruction）的主体部分，因为它对LLM的行为有更强的指导作用。

### 3.3. 代码示例

**监听事件**:

```typescript
// 在 PromptManager.ts 的 initializeListeners 方法中
messageBus.on('weatherChanged', (payload: WeatherChangedPayload) => {
    const weatherDesc = `当前天气为${payload.weatherData.当前天气}，${payload.weatherData.天气描述}。`;
    this.dynamicFragments.set('weather', weatherDesc);
    this.systemPrompts.clear();
});
```

**注入提示词**:

```typescript
// 在 PromptManager.ts 的 explainVariables 方法中
const worldStateSummary: string[] = [];
this.dynamicFragments.forEach((value, key) => {
    if (key !== 'adventureHint') {
        worldStateSummary.push(value);
    }
});

if (worldStateSummary.length > 0) {
    let summaryPart = `  // 来自游戏世界的实时动态信息\n`;
    summaryPart += `  "世界状态摘要": [\n    "${worldStateSummary.join('",\n    "')}"\n  ]`;
    parts.push(summaryPart);
}
```

## 4. 如何添加新的动态提示词片段 (How to Add a New Fragment)

要为一个新的事件添加动态提示词支持，请遵循以下步骤：

1. **定义事件契约 (Define Event Contract)**:
    - 如果事件尚不存在，请前往 `core/events/definitions.ts`。
    - 为事件的 `payload` 创建一个新的 `interface`。
    - 将新事件及其 `payload` 类型添加到 `AppEventMap` 接口中。

2. **发布事件 (Emit the Event)**:
    - 在负责该状态的模块中（例如，一个新的 `ReputationManager`），当状态发生变化时，导入 `messageBus` 并调用 `messageBus.emit()`。
    - 确保 `payload` 的结构与你在上一步中定义的接口相匹配。

    ```typescript
    // 在 ReputationManager.ts 中
    import { messageBus } from './core/messageBus';

    function updateReputation(newStatus: string) {
        // ... 更新声望的逻辑 ...
        messageBus.emit('reputationChanged', { newStatus: newStatus });
    }
    ```

3. **监听事件 (Listen for the Event)**:
    - 打开 `core/promptManager.ts`。
    - 在 `initializeListeners()` 方法中，为你的新事件添加一个新的 `messageBus.on()` 监听器。
    - 在回调函数中，将 `payload` 格式化为你希望LLM看到的文本，并使用一个唯一的键将其存入 `this.dynamicFragments`。
    - **不要忘记** 在回调的末尾调用 `this.systemPrompts.clear()`。

    ```typescript
    // 在 PromptManager.ts 的 initializeListeners 方法中
    messageBus.on('reputationChanged', (payload: ReputationChangedPayload) => {
        const reputationDesc = `你在本地的声望变为：${payload.newStatus}。`;
        this.dynamicFragments.set('reputation', reputationDesc);
        this.systemPrompts.clear();
    });
    ```

完成以上三步后，新的声望信息将自动、动态地出现在发送给LLM的提示词的 `世界状态摘要` 部分。

## 5. 提示词内容策略 (Prompt Content Strategy)

为了最大限度地优化Token使用效率并提升LLM的上下文理解能力，本系统采用“**核心上下文 + 事件驱动摘要**”的策略，而非发送完整的游戏状态。以下是不同类型变量的处理原则：

### 5.1. 建议保留的核心上下文 (Core Context to Keep)

这些是LLM进行每一次叙事都必须了解的基础信息，应该保持发送。

- **`角色.<主控角色>` 的核心状态**:
  - `姓名`, `种族`, `职业`, `等级`
  - `状态` (`口渴度`, `饱腹度`, `体力`, `灵力`) 的当前值。这部分信息应被提炼成简洁格式。
  - `物品`: 角色当前持有的完整物品列表，以确保LLM对角色的全部能力和资源有完整认知。
- **`世界` 的核心状态**:
  - `时间`, `当前日期`, `地点`
  - `天气` 的当前状态摘要 (由事件驱动更新)
  - `庇护所` 的高级状态摘要 (如名称、整体状态，由事件驱动更新)

### 5.2. 通过事件摘要发送的动态信息 (Dynamic Info Sent via Event Summaries)

这类变量结构复杂或内容会不断累积，不应完整发送。其变化应通过 `messageBus` 广播事件，由 `PromptManager` 捕获并生成简洁的文本摘要，注入到 `世界状态摘要` 中。

- **`世界.庇护所` (组件细节)**: 通过 `shelterComponentChanged` 等事件，生成如 `"庇护所的围墙轻微受损"` 的摘要。
- **`世界.图鉴`**: **可以完整发送，但有前提**。系统有可能采用“智能上下文”机制动态注入图鉴条目：
  - **强制注入**: 当玩家输入提及与图鉴条目相关的关键词时，该条目会被强制注入。
  - **频率注入**: 根据条目被引用的历史频率和冷却时间，系统会自动选择性地注入相关条目，以模拟“联想”和“记忆”。
  - **事件摘要**: 当解锁新条目时，依然通过 `pokedexDiscovery` 事件生成摘要，告知LLM“知识库已更新”，但不发送具体内容。
- **`世界.成就` / `世界.技能` / `世界.签到`**: 通过各自的事件（如 `achievementUnlocked`），生成状态变更的摘要。
- **`世界.任务列表`**: 通过 `questUpdated` 事件，生成任务进度变化的摘要。
- **`角色.<角色名>.关系`**: 通过 `relationshipChanged` 事件，生成好感度变化的摘要。

### 5.3. 原则上不应发送的内部状态 (Internal State to Omit)

这类变量是为游戏引擎、状态管理和调试服务的，对LLM的叙事逻辑无益，甚至可能产生干扰。

- **`世界.事件列表`**: **绝对禁止发送**。这是用于状态重算的事件历史记录，发送它会造成信息冗余。
- **`世界.初始状态` / `世界.状态快照` / `备份`**: 纯粹的系统内部数据，用于性能优化和存档恢复。
- **`世界.当前激活系统`**: UI状态控制器，与叙事逻辑无关。
- **`plugin_storage` 命名空间**: 插件的内部数据，不属于核心游戏上下文。但是，ChatHistory会读取plugin_storage.llm_history作为内容，详见[HISTORY_SPEC.md](./HISTORY_SPEC.md)，这一点不可改变。

---

## 6. 架构升级：向响应式状态管理迁移 (Architectural Upgrade: Migrating to Reactive State Management)

**版本**: 2.0
**状态**: 已实现

随着项目整体架构向 `Pinia` 集中式状态管理迁移（详见 `REACTIVE_STATE_SPEC.md`），动态提示词系统已完成相应的升级，更好地融入了新的数据流，提升了系统的可维护性和可预测性。

### 6.1. 核心思想转变

- **旧模式 (v1.0, 事件驱动)**: `PromptManager` 是一个**主动的监听者**。它订阅 (`messageBus.on`) 它关心的底层事件，并自己内部维护一个非响应式的缓存 (`dynamicFragments`)。数据流是：`事件源 -> MessageBus -> PromptManager`。
- **新模式 (v2.0, 响应式)**: `PromptManager` 现在是一个**被动的观察者**。它不再直接监听大多数事件，而是通过 `promptStore` 响应式地观察其他 Pinia Stores 中相关的状态（如 `worldStore.weather`）。当这些状态变化时，`promptStore` 会自动重新计算出相应的提示词片段，`PromptManager` 则直接使用这些计算结果。数据流是：`事件源 -> MessageBus -> (部分由 Store 直接监听，如 adventureStore) -> Pinia Store State 变化 -> promptStore 自动响应 -> PromptManager 读取结果`。

### 6.2. 方案对比

| 特性 | v1.0 事件驱动模型 | v2.0 响应式模型 (Pinia) |
| :--- | :--- | :--- |
| **数据来源** | 分散。`PromptManager` 内部有独立的数据副本 (`dynamicFragments`)。 | **单一事实来源**。所有提示词片段都派生自 Pinia stores 的状态。 |
| **可预测性** | 较低。需要追溯事件触发历史来调试提示词内容。 | **高**。提示词内容完全由当前 Pinia state 决定，易于调试。 |
| **耦合性** | `PromptManager` 与 `messageBus` 和具体的**事件契约**紧密耦合。 | `promptStore` 与其他 **Pinia stores 的状态接口**耦合，与底层事件完全解耦。 |
| **逻辑内聚** | 较低。状态变化的“副作用”（生成提示词文本）逻辑分散在 `PromptManager` 中。 | **高**。状态管理逻辑内聚在各自的 store，`promptStore` 只负责“将状态翻译成文本”。 |
| **可维护性** | 中等。添加新片段需要修改 `PromptManager` 的监听列表，并手动调用缓存清理。 | **高**。添加新片段只需监听新的 store 状态，缓存可通过 `watch` 自动管理。 |
| **潜在问题** | 数据可能与全局状态不同步。 | 依赖关系可能变得复杂；可能丢失事件的瞬时上下文（如“变化原因”）。 |

### 6.3. 迁移实现 (Migration Implementation)

系统从 v1.0 升级到 v2.0 已遵循以下步骤完成：

1. **创建 `stores/promptStore.ts`**:
    - 新建了 Pinia store，作为所有动态提示词片段的集中管理中心。

2. **逐个迁移动态片段**:
    - 以 `weatherChanged` 和 `shelterDamaged` 等事件为例，其逻辑被迁移。
    - 在 `promptStore.ts` 中，`import` 了其上游 store (如 `useWorldStore`, `useSystemStore`)。
    - 使用 `computed` 属性，根据上游 store 的 state (如 `worldStore.weather`) 来生成对应的提示词文本片段。

    ```typescript
    // stores/promptStore.ts (示例)
    import { defineStore } from 'pinia';
    import { computed } from 'vue';
    import { useWorldStore } from './worldStore';
    // ... import 其他需要的 stores

    export const usePromptStore = defineStore('prompt', () => {
      const worldStore = useWorldStore();

      const weatherFragment = computed(() => {
        const data = worldStore.weather;
        if (!data) return '';
        return `当前天气为${data.当前天气}，${data.天气描述}。`;
      });

      // ... 其他片段的 computed ...

      const dynamicFragments = computed(() => {
        const fragments = new Map<string, string>();
        if (weatherFragment.value) fragments.set('weather', weatherFragment.value);
        // ... set 其他片段 ...
        return fragments;
      });

      return { dynamicFragments };
    });
    ```

3. **重构 `PromptManager`**:
    - `core/promptManager.ts` 已被修改。
    - `initializeListeners` 方法中对应的 `messageBus` 监听器已被移除。
    - `explainVariables` 方法现在从 `usePromptStore()` 实例中获取 `dynamicFragments` 这个 `computed` 属性。

4. **处理缓存失效**:
    - `PromptManager` 的构造函数中，使用 `watch` 监听 `promptStore.dynamicFragments` 的变化，并在其变化时调用 `this.systemPrompts.clear()` 来使缓存失效。

5. **完成与清理**:
    - `PromptManager` 中所有相关的事件监听器都已迁移。
    - `initializeListeners` 方法和 `this.dynamicFragments` 属性已被清理或其职责已大幅减少，标志着重构的完成。
