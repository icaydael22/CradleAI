# 自动摘要系统规范 (AUTO_SUMMARY_SPEC.md) v1.1

本文档旨在详细描述“自动摘要系统”的设计哲学、核心工作流程、配置方式以及技术实现细节。

## 1. 设计哲学与目标

### 1.1 核心目标

本系统的核心目标是，通过在后台自动对长对话进行摘要，解决LLM的上下文窗口限制问题，从而在不牺牲性能的前提下，保持游戏的长期叙事连贯性。系统应能：

1.  **维持长期记忆**: 确保即使在数百回合后，游戏的核心情节和关键信息依然能被LLM“记住”。
2.  **控制成本与性能**: 摘要过程应在后台异步执行，不阻塞用户交互，并使用独立的、可配置的次级LLM API，以平衡成本和效果。
3.  **智能优化**: 采用“迭代优化”策略，而不是从头开始总结，以生成更连贯、更全面的摘要。

### 1.2 设计哲学：迭代优化与异步处理

-   **迭代优化 (Iterative Refinement)**: 这是本系统的核心思想。它不只是总结最新的几条对话，而是将“上一份摘要”和“最新的对话内容”结合起来，让LLM生成一份“全新的、优化后的完整摘要”。这种方法能更好地保留长期上下文的精华，避免信息在多次总结后失真。
-   **异步非阻塞 (Asynchronous & Non-Blocking)**: 摘要是一个耗时操作。因此，整个流程被设计为在后台完全异步执行。它通过我们新建的事件驱动机制来调用次级LLM，发起请求后不会等待结果，而是通过监听一个带有唯一ID的`GENERATION_ENDED`事件来接收摘要结果，完全不影响主游戏的聊天流程。

---

## 2. 核心工作流程

此流程在每次主AI生成结束后，由 [`Summarizer.triggerSummaryIfNeeded()`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:35) 启动。

1.  触发条件检查:
    -   若当前正在进行摘要任务或处于重算状态则跳过（见 [`getIsRecalculatingState()`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:36)）。
    -   基于 [`plugin_storage.summary.latest.summarizedMessageIds`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:41) 计算自上次摘要以来“未覆盖”的消息数量。
    -   当未覆盖消息数达到 `summaryTrigger` 阈值时，启动摘要流程。

2.  提示词构建:
    -   `executeSummary` 会从 [`plugin_storage.summary.latest`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:65) 读取上一份摘要文本作为 `{{PREVIOUS_SUMMARY}}`。
    -   需要摘要的消息集合为“未覆盖消息”（不含 `summarizedMessageIds` 中的那些），作为 `{{NEW_HISTORY}}`。
    -   摘要提示词模板来自设置 `summaryPrompt`，若为空则使用内置默认模板。

3.  **异步调用LLM**:
    -   系统为本次摘要任务生成一个唯一的`generationId`（例如 `summarizer-<UUID>`）。
    -   它设置一个`Promise`，并使用`eventOn`开始监听`GENERATION_ENDED`事件。这个`Promise`只会在收到具有匹配`generationId`的事件时才会`resolve`。为了防止永久等待，该`Promise`还设置了一个较长的超时（例如120秒）。
    -   然后，它调用`generateWithSecondaryApi`函数，将构建好的Prompt和`generationId`传递过去。这个调用是“即发即忘”的，程序不会在此处等待。
    -   主逻辑会`await`之前创建的那个监听事件的`Promise`，从而异步地等待摘要结果返回。

4.  结果处理（当前实现）:
    -   摘要返回后，写入 [`plugin_storage.summary.latest`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:167) 并追加到 [`plugin_storage.summary.history`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:167)。
    -   同时记录合并后的 `summarizedMessageIds`，作为下一次触发与“未覆盖消息”计算的依据。
    -   摘要不会写入历史消息页，也不会修改核心状态变量，确保与重算生命周期无冲突。

---

## 3. 配置方式

本系统的所有配置都存储在聊天变量的`plugin_settings.context_management`路径下，用户可以通过设置模态框中的“上下文管理”标签页进行修改。

-   **`summaryTrigger`**: `number`
    -   描述: 触发自动摘要所需的消息数量。例如，设置为`30`意味着每当有30条新消息（不含上一条摘要）产生后，就会启动一次摘要任务。
    -   如何禁用: 将此值设置为一个非常大的数字（如`9999`）或`0`。

-   **`summaryApiProfileId`**: `string`
    -   描述: 用于执行摘要任务的次级LLM API档案的ID。
    -   **注意**: **此项必须被设置**，否则摘要功能将无法工作。用户需要在“设置”->“次级LLM API”中至少创建一个配置档案，然后在这里选中它。

-   **`summaryPrompt`**: `string`
    -   描述: 用户可自定义的摘要提示词模板。
    -   **必须包含** `{{PREVIOUS_SUMMARY}}` 和 `{{NEW_HISTORY}}` 这两个占位符。
    -   如果留空，系统将使用一个内置的默认模板。

---

## 4. 数据结构与生命周期协同

-   持久化结构:
    -   `plugin_storage.summary.latest`: `{ id: string, text: string, summarizedMessageIds: string[], timestamp: number }`
    -   `plugin_storage.summary.history`: `Summary[]`（追加式历史）
-   触发与重算:
    -   触发判断使用 `latest.summarizedMessageIds` 计算未覆盖消息数，避免依赖历史中的 `summary` 页。
    -   在重算期间（[`getIsRecalculatingState()`](src/什么我要在玄幻修仙世界种田-0楼版本/core/summarizer.ts:36) 为 true）摘要流程被抑制。
-   次级LLM上下文:
    -   当配置 `useSummary=true` 时，优先使用历史中的 `summary` 页；若不存在，则回退到 [`plugin_storage.summary.latest`](src/什么我要在玄幻修仙世界种田-0楼版本/core/secondaryLlmApi.ts:141) 作为上下文。
-   与快照的关系:
    -   摘要存储于 `plugin_storage`，不参与 L2/L3 快照；变量覆盖与清理流程会保留 `plugin_storage`（见 [`overwriteAllChatVariables()`](src/什么我要在玄幻修仙世界种田-0楼版本/core/variables.ts:269)）。

## 5. 未来迭代建议

1.  **摘要存储与应用 (最高优先级)**: 重新设计历史记录的数据结构，找到一种非破坏性的方式来存储和利用摘要。可能的方案包括：
    -   将摘要存储在一个独立于聊天记录的变量中。
    -   在`PromptManager`中，当上下文长度超过一定阈值时，自动用最新的摘要替换掉最旧的聊天记录部分。
2.  **手动触发与查看**:
    -   在UI中增加一个“立即生成摘要”的按钮。
    -   在UI中提供一个可以查看所有历史摘要的界面。
