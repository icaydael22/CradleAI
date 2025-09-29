# 模块设计文档：“奇遇” - 动态叙事事件模块 (v1.2 - 根据实际实现更新)

本文档旨在为“奇遇”新模块设计详细、可靠的技术实现方案，使其成为一个能够为游戏注入惊喜和不可预测性的核心叙事功能。

## 1. 核心目标与哲学

*   **核心目标**: 在常规的游戏流程中，由主导叙事的LLM根据上下文，在合适的时机**主动**为玩家创造出稀有的、意料之外的特殊事件（“奇遇”），带来惊喜感，极大地增强故事的动态性和不可预测性。
*   **设计哲学**: “奇遇”不是一个由系统规则驱动的模块，而是一个**由叙事驱动**的模块。它赋予LLM在一定约束下打破常规、创造“神来之笔”的能力。奇遇必须是稀有的，其价值在于“意料之外”。

## 2. 设计原则

*   **LLM主导**: 奇遇的发起者是LLM，而不是系统的计时器或概率检定。
*   **系统约束**: 系统为LLM提供发起奇遇的“权力”，但同时设立严格的规则（如冷却时间）来限制其频率，确保稀有性。
*   **叙事一致性**: 奇遇的生成必须严格基于当前的对话、环境和玩家状态，不能凭空出现。
*   **非侵入式集成**: 奇遇的实现应通过现有的事件和解析流程，无需对核心生成循环做颠覆性修改。

## 3. 技术方案

### 3.1. 奇遇的“提议”：事件驱动的实现

经过迭代，我们放弃了最初的自定义标签 `[ADVENTURE_START]` 方案，转而采用了一种更优雅、更健壮的**事件驱动**模型。LLM现在通过在`<statusbar>`的`事件列表`中生成一个特殊的`"奇遇"`事件来提议奇遇。

*   **Prompt增强**: 在主Prompt (`prompts-data.ts`) 中，我们加入一段特殊的“导演指令”：
    > “【导演指令】你扮演着故事的引导者。在极少数情况下，如果你认为当前的情境非常适合发生一次特别的‘奇遇’，你可以生成一个 `"奇遇"` 事件。你必须遵守以下规则：
    > 1.  奇遇必须与当前上下文紧密相关。
    > 2.  奇遇应该是稀有且有意义的，有好有坏。
    > 3.  **提示**: {{adventure_hint}}”

*   **提议语法**: LLM的提议是一个标准的JSON事件对象，被放置在`事件列表`数组中。这种“事件包装事件”的设计，使得系统无需额外的自定义解析逻辑。

    **通用格式**:
    ```json
    {
      "type": "奇遇",
      "payload": {
        "类型": "发现 | 遭遇 | 困境",
        "事件": { ... } // 一个完整的、符合规范的标准游戏事件对象
      }
    }
    ```

    **示例**:
    *   **发现 (discovery)**: 玩家找到特殊物品或地点。
        ```json
        {
          "type": "奇遇",
          "payload": {
            "类型": "发现",
            "事件": {
              "type": "物品变化",
              "payload": {
                "获得": [{ "名称": "古旧的羊皮纸残片", "描述": "绘制着看不懂的古怪符号...", "价值": { ... } }]
              }
            }
          }
        }
        ```
    *   **遭遇 (encounter)**: 玩家遇到一个特殊的临时NPC或敌人。
        ```json
        {
          "type": "奇遇",
          "payload": {
            "类型": "遭遇",
            "事件": {
              "type": "角色更新",
              "payload": {
                "姓名": "受伤的信使",
                "更新": { "描述": "一名身穿劲装、腿部中箭的男子...", "阵营": "中立" }
              }
            }
          }
        }
        ```

### 3.2. 奇遇的“约束”：系统层控制

为了防止奇遇“烂大街”，系统必须有最终的控制权。

*   **动态冷却时间 (Dynamic Cooldown)**:
    *   系统采用动态冷却机制来确保奇遇的稀有性和不可预测性。
    *   系统定义了冷却范围，例如 `min_cooldown = 30` 天, `max_cooldown = 90` 天。
    *   当一次奇遇成功执行后，`adventureHandler` 会计算 `random_cooldown = random(min_cooldown, max_cooldown)`，并更新 `世界.奇遇.冷却至天数`。
    *   **冷却检查与提示更新 (解耦实现)**:
        *   `promptManager.ts` **不直接参与**冷却时间的计算。它只是一个被动的接收者。
        *   在 `index.ts` 中，系统监听 `timeChanged` 事件。每当游戏时间变化，就会触发 `adventureCooldownHandler.ts` 中的 `checkAdventureCooldown` 函数。
        *   `checkAdventureCooldown` 函数会比较 `世界.当前日期` 和 `世界.奇遇.冷却至天数`。
        *   如果冷却完成，它会触发一个全局的 `adventureHintUpdate` 事件，并将提示（例如：“当前时机合适，你可以酌情提议一次奇遇。”）作为载荷。
        *   `PromptManager` 监听到此事件后，更新其内部的 `adventureHint` 变量，进而在下一次生成Prompt时注入正确的提示。
    *   这种设计将冷却逻辑与Prompt构建逻辑解耦，使代码更清晰、更易于维护。

*   **叙事锚点**: 指令中会强调，奇遇的提议必须与最近的对话内容、玩家行为或所处环境紧密相关。
*   **冷却期强制执行**: 即便LLM在冷却期内（例如，由于用户的越狱提示）意外生成了`"奇遇"`事件，`adventureHandler`在执行时会进行最终校验。如果发现当前仍处于冷却期，它会**静默忽略**该事件，不会执行其`payload`中的任何内容，也不会重置冷却时间，从而保证了系统的公平性和稀有性。

### 3.3. 奇遇的“解析与执行”

*   **解析 (无需增强)**: 由于奇遇提议已经是一个标准JSON事件，`core/parser.ts` 中的 `extractJsonFromStatusBar` 函数可以自动处理它，无需任何额外逻辑。自定义标签解析的复杂性被完全消除。
*   **事件分发**:
    *   在 `index.ts` 的主流程中，从`<statusbar>`解析出的`事件列表`被传递给`EventManager`。
    *   `EventManager` 遍历事件列表，当遇到 `type` 为 `"奇遇"` 的事件时，会将其分发给已注册的 `adventureHandler`。
*   **事件处理 (`adventureCooldownHandler.ts`)**:
    *   `adventureCooldownHandler.ts` 包含核心的 `adventureHandler` 处理器。
    *   当 `adventureHandler` 接收到 `"奇遇"` 事件时，它会执行两个关键操作：
        1.  **内部事件的再分发**: 它会从奇遇事件的 `payload.事件` 中提取出被包装的内部事件（例如，一个`"物品变化"`事件），并将其**重新**交由 `EventManager` 进行处理。这巧妙地重用了所有现有的标准事件处理器（如 `itemChangeHandler`），无需为奇遇编写重复的状态更新逻辑。
        2.  **冷却时间更新**: 在处理完内部事件后，`adventureHandler` 会立即根据动态冷却机制计算并更新 `世界.奇遇.冷却至天数` 变量，为下一次奇遇做准备。

## 4. 数据结构规范

为了支持此模块，我们需要在 `世界` 命名空间下定义一个新的数据结构。

*   **路径**: `世界.奇遇`
*   **结构**:
    ```json
    {
      "冷却至天数": 95, // 下一次奇遇最早可以发生的绝对游戏天数
      "上次奇遇天数": 20, // 上一次发生奇遇的绝对游戏天数
      "历史奇遇记录": [ // (可选) 用于未来分析或展示
        { "天数": 20, "类型": "discovery", "摘要": "发现古旧的羊皮纸残片" }
      ]
    }
    ```
*   **集成**: 此结构应被添加到 `VARIABLES_SPEC.md` 的 `世界` 部分。

## 5. 实施步骤

1.  **更新 `VARIABLES_SPEC.md`**: 在 `世界` 命名空间下正式添加 `奇遇` 对象结构。
2.  **更新 `data/prompts-data.ts`**:
    *   在 `BASE` prompt中增加“导演指令”和关于`"奇遇"`事件格式的说明。
3.  **更新 `core/promptManager.ts`**:
    *   实现对 `adventureHintUpdate` 全局事件的监听，以被动更新其内部的 `adventureHint` 变量。
4.  **创建 `core/events/adventureCooldownHandler.ts`**:
    *   实现 `adventureHandler`：用于处理 `"奇遇"` 事件，它会再分发内部事件并重置冷却时间。
    *   实现 `checkAdventureCooldown`：由 `timeChanged` 事件触发，负责检查冷却状态并发出 `adventureHintUpdate` 事件。
5.  **注册处理器与监听器**:
    *   在 `adventureCooldownHandler.ts` 中，导出一个新的初始化函数 `initializeAdventureListener`，内部使用 `messageBus` 监听 `timeChanged` 事件。
        ```typescript
        // adventureCooldownHandler.ts
        export function initializeAdventureListener() {
          messageBus.on('timeChanged', (payload) => {
            checkAdventureCooldown(payload);
          });
        }
        ```
    *   在 `index.ts` 中，导入并调用 `initializeAdventureListener()` 来激活监听器。
    *   在 `index.ts` 中，照常使用 `eventManager.register('奇遇', adventureHandler)` 注册处理器。
6.  **初始化状态**: 在 `modules/setup/index.ts` 的 `handleConfirm` 函数中，构建初始 `worldState` 对象时，为 `世界.奇遇` 设置一个初始值（例如，`冷却至天数: 15`），让玩家在游戏早期就有机会遇到第一次奇遇。
7.  **测试**: 设计测试用例，覆盖不同类型的奇遇提议，并验证冷却机制是否按预期工作。
