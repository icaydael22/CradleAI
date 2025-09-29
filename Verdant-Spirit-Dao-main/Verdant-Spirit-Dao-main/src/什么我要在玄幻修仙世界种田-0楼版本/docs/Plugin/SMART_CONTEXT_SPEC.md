# 智能上下文系统规范 (SMART_CONTEXT_SPEC.md) v2.0

本文档旨在详细描述“智能上下文系统”的设计哲学、核心工作流程、数据结构以及如何在游戏中启用它。**本文档内容已根据最新的 v2.0 响应式架构更新。**

## 1. 设计哲学与目标

### 1.1 核心目标

本系统的核心目标是，在不显著增加技术复杂度和API成本的前提下，通过模拟“记忆”和“联想”能力，大幅提升LLM在长程对话中的连贯性和沉浸感。系统应能：

1. **动态学习**: 自动学习玩家语言与游戏概念之间的非字面关联。
2. **智能筛选**: 根据对话焦点，动态筛选出最相关的背景知识注入到Prompt中。
3. **非侵入式**: 系统的开启与否不应影响核心游戏逻辑，玩家可以随时选择启用或禁用。

### 1.2 设计哲学：响应式记忆闭环

系统构建了一个由“后台语义学习”和“前台动态注入”组成的记忆闭环：

- **后台学习 (`ContextLinker`)**: 如同大脑在“离线”时整理信息。它在后台异步工作，低成本地为游戏知识（图鉴条目）建立更丰富的语义链接（动态关键词）。
- **前台注入 (`smartContextStore`)**: 如同大脑在对话时“提取记忆”。它作为系统的响应式核心，根据当前对话的“热点”，通过计算属性（Computed Properties）**自动推导出**最相关的几条信息。`PromptManager` 则消费其结果，呈现给LLM。

---

## 2. 核心工作流程

### 2.1 Part 1: 后台语义学习 (`ContextLinker`)

此流程在每次玩家回合结束（`GENERATION_ENDED`事件触发）后，在后台异步执行。

1. **提取上下文**: `contextLinker.ts`中的`processTurn`函数被调用。它会从聊天记录中找到最近的一条**用户输入**作为分析的源文本。
2. **智能筛选候选条目**:
    - 调用`selectCandidateEntries`函数，该函数首先将所有已发现的图鉴条目“展平”为一个列表。
    - **粗筛**: **(已升级)** 调用 `searchStore.search('knowledge', userInput)`，利用 Fuse.js 强大的模糊搜索能力，筛选出与用户输入语义最相关的条目作为候选。这确保了即使没有直接的词语重叠，也能找到相关的学习材料。
    - **优先级排序**: 对所有条目（或粗筛后的条目）进行打分，综合考虑以下因素：
        - **关键词稀疏度**: 动态关键词越少的条目，得分越高（优先学习新知识）。
        - **冷却时间**: 近期（如20回合内）被分析过的条目，得分会降低。
        - **负反馈**: 过去多次分析但未能学习到新关键词的条目，得分会降低。
    - **预算限流**: 最终只选取得分最高的N个条目（如5个）进入下一步，以控制成本。
3. **调用LLM分析 (已实现)**:
    - `fetchNewKeywordsFromLLM`函数会将用户输入和筛选出的候选条目，按照`prompt.md`中定义的格式，发送给一个次级LLM。
4. **保存学习成果**:
    - `saveNewKeywords`函数负责解析LLM的返回结果。
    - 如果LLM为某个条目生成了新的关键词，这些关键词会被追加到`plugin_storage.context_linker_profile`中对应条目的`dynamicKeywords`列表里，同时重置其`missCount`。
    - 所有被分析过的条目（无论是否产生新关键词），其`lastAnalyzedTurn`都会被更新为当前回合数。未产生新关键词的条目，其`missCount`会增加。

### 2.2 Part 2: 前台动态注入 (由 `smartContextStore` 驱动)

此流程围绕一个核心的 Pinia store (`smartContextStore.ts`) 展开，它成为了智能上下文决策的单一事实来源。

1. **状态管理与初始化**:
    - `smartContextStore` 在初始化时通过 `updateStatsFromVariables()` action，从聊天变量中加载 `knowledgeStats` (知识库使用统计) 和 `linkerProfile` (后台学习成果) 到其响应式 `state` 中。

2. **响应式数据流 (已集成模糊搜索)**:
    - **用户输入时**: `promptManager` 在准备提示词前，调用 `smartContextStore.processUserInput(userInput)`。
    - `processUserInput` action 内部：
        1. 更新 `lastUserInput` state。
        2. **调用模糊搜索**: 立即调用 `searchStore.search('knowledge', userInput)`，对包含所有图鉴、成就等知识的综合索引执行搜索。
        3. `referencedIdsThisTurn` getter **自动**响应 `searchStore` 搜索结果的变化，并根据预设的 `score` 阈值（如 `score < 0.4`）筛选出所有高相关性的条目ID。
        4. 根据 getter 的结果，action 会更新 `knowledgeStats` state 中的 `frequency` 计数。

3. **动态注入决策 (核心)**:
    - **`injectedKnowledge` 计算属性**: 这是整个注入逻辑的核心。它是一个 `computed` 属性，会自动监听 `referencedIdsThisTurn` 和 `knowledgeStats` 的变化，并根据以下组合规则，**自动推导出**当前应该注入到提示词中的图鉴条目列表：
        - **强制注入**: `referencedIdsThisTurn` 计算出的所有条目，会被无条件地加入到注入列表。
        - **频率注入**: 遍历 `knowledgeStats` 中的所有其他条目，根据预设在 `injectionParams` 中的“高/中/低频”阈值和冷却时间规则，决定是否注入。
    - **更新发送记录**: 在计算过程中，`injectedKnowledge` 还会自动更新所有被选中注入的条目的 `lastSentTurn` 字段，并将其持久化。

4. **生成Prompt**:
    - `promptManager` 的 `explainVariables` 函数不再执行任何复杂的决策逻辑。
    - 它只是简单地从 `smartContextStore.injectedKnowledge` 这个 getter 中获取最终的图鉴条目列表，并将其格式化后放入Prompt。

这种响应式架构将复杂的决策过程声明式地定义为状态的派生，使得代码更清晰、性能更优、且更易于维护。

### 2.3 冷启动学习（启用时一次性扫描）

- 触发时机: 当设置面板中启用“智能上下文”开关，且已选择用于学习的次级LLM配置时，`smartContextStore.setEnabled(true)` 会在前台状态持久化后立即触发一次“冷启动学习”。
- 分析范围: 仅针对“未学习”的条目，即在 `plugin_storage.context_linker_profile` 中不存在或其 `dynamicKeywords` 为空的图鉴条目。
- 实现入口: `contextLinker.ts` 中的 `analyzeUnlearnedEntries` 会遍历目标条目ID，依次调用 `analyzeSingleEntry`，由 `fetchNewKeywordsFromLLM` 请求关键词，并通过 `saveNewKeywords` 写入插件事件 `ContextLinkerRan`（包含 `updates`、`analyzedIds`、`turn`），以便历史重放时可重建状态。
- 限流与提示: 每个条目请求之间加入约 500ms 延迟，避免对API与UI造成压力；过程中通过 `toastr` 进行用户提示与结果反馈。
- 失败处理: 若未选择任何次级LLM配置，则跳过本次冷启动，并提示用户可在选择配置后手动点击“立即更新所有条目”。

---

## 3. 数据结构

本系统引入了两个新的聊天变量路径。

### 3.1 `plugin_storage.context_linker_profile`

用于持久化存储后台学习到的语义链接。

- **路径**: `plugin_storage.context_linker_profile`
- **结构**: 一个以图鉴条目完整ID为键的对象。

    ```json
    {
      "世界.图鉴.物品.潮汐木芯": {
        "dynamicKeywords": ["硬木头", "防潮材料"],
        "lastAnalyzedTurn": 102,
        "missCount": 3
      }
    }
    ```

### 3.2 `世界.知识库使用统计`

用于追踪知识的“热度”，是前台动态注入决策的核心依据。

- **路径**: `世界.知识库使用统计`
- **结构**: 一个以图鉴条目完整ID为键的对象。

    ```json
    {
      "世界.图鉴.物品.潮汐木芯": {
        "frequency": 15,
        "lastSentTurn": 102
      }
    }
    ```

---

## 4. 如何启用/禁用本系统

本系统的设计遵循**非侵入式**原则，其行为完全由`世界.知识库使用统计`这个变量的存在与否来控制。

- **启用系统**:
  - 在游戏存档的聊天变量中，手动或通过开局设置，添加一个空的`世界.知识库使用统计: {}`对象。
  - 一旦`promptManager.ts`检测到此对象的存在（通过`smartContextStore.knowledgeStats`是否为空），它将**自动切换**到新的动态注入逻辑。
  - 启用后将自动触发一次“冷启动学习”（仅未学习条目）。如未选择用于学习的LLM配置，此步骤将被跳过并在UI中提示。
  - 也可在设置页点击“立即更新所有条目”手动触发全量学习。
- **禁用系统**:
  - 从聊天变量中**移除**`世界.知识-库使用统计`对象。
  - `promptManager.ts`在检测不到此对象时，将自动退回至旧的、全量注入图鉴信息的逻辑，保证游戏体验的向后兼容。

这种“开关”机制确保了玩家可以自由选择是否使用此实验性功能，而不会对游戏存档的稳定性构成任何威胁。

---

## 5. 后续迭代建议

1. **(已完成) 接入 `fetchNewKeywordsFromLLM`**: 后台学习闭环已可用，能将候选条目与玩家输入一并发送至次级LLM并解析结构化结果。
2. **(已完成) 升级关键词匹配算法**: 系统已全面集成 **Fuse.js** 模糊搜索库，取代了旧有的 `string.includes()` 精确匹配。这显著提升了系统对用户模糊意图的理解能力。
3. **(已完成) 引入“冷启动学习”**: 启用智能上下文时自动对“未学习”条目执行一次初始化学习（`analyzeUnlearnedEntries`），加速构建初始语义数据库。
4. **引入“预置知识”**: 为了解决冷启动问题，可以为一部分核心的、基础的图鉴条目预先手动添加一些高质量的动态关键词，作为系统的“初始记忆”。
5. **在调试面板中增加可视化**: 在调试工具中增加一个专门的Tab，用于实时查看`context_linker_profile`和`知识库使用统计`的内容。`smartContextStore`中已有的`injectionProbabilityTable` getter可以为此提供现成的数据源。

---

## 附录：已废弃的 v1.0 前台注入工作流

> **注意**: 以下描述的是在系统迁移到 Pinia 响应式架构之前的工作流程，**仅供历史参考**。当前代码已不再使用此逻辑。

1. **关键词匹配与频率统计**:
    - `promptManager` 中存在一个 `findAndTrackKnowledgeReferences` 函数被调用。它会遍历所有图鉴条目的**名称**和**所有动态关键词**。
    - 如果用户本回合的输入内容包含了其中任何一个关键词，则视为一次“引用”。
    - 被引用的条目ID会被添加到一个临时的`forceInjectKnowledgeIds`集合中。
    - 同时，该条目在`世界.知识库使用统计`中的`frequency`计数会+1。
2. **动态注入决策**:
    - 核心的`explainVariables`函数在准备图鉴信息时，会执行以下决策：
        - **强制注入**: `forceInjectKnowledgeIds`集合中的所有条目，会被无条件地加入到本次注入的知识列表中。
        - **频率注入**: 遍历`世界.知识库使用统计`中的所有其他条目，根据预设的“高/中/低频”阈值和冷却时间规则，决定是否注入。
    - **更新发送记录**: 所有最终被选中并注入到Prompt的条目，其在`世界.知识库使用统计`中的`lastSentTurn`字段都会被更新为当前回合数。
