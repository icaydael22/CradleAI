# 设计文档：智能上下文与模糊搜索协同机制

本文档旨在详细阐述如何将 `FuzzySearch` (Fuse.js) 模块与 `SmartContext` 模块进行深度集成，以构建一个更强大、更智能的动态上下文系统。

## 1. 核心目标

本次集成的核心目标是，用 Fuse.js 强大的模糊搜索和相关性评分能力，全面取代 SmartContext 系统中原有的、基于精确文本匹配的“知识引用”识别逻辑。这将使系统能够：

1. **理解模糊意图**: 处理用户的错别字、近义词和模糊描述。
2. **实现智能联想**: 根据语义相关性，而非简单的关键词匹配，来识别上下文。
3. **提升学习效率**: 为后台的语义学习提供更相关的候选材料。

## 2. 协同工作流程

我们将重构 SmartContext 的核心流程，将 FuzzySearch 作为其“感知层”。

### 2.1 升级前台注入流程

这是本次集成的核心。`smartContextStore` 中识别“本回合引用知识”的逻辑 (`referencedIdsThisTurn` getter) 将被彻底重构。

**旧逻辑**:
依赖 `userInput.includes(keyword)` 进行精确匹配。

**新协同逻辑**:

1. **统一搜索入口**: `smartContextStore` 将不再自己进行文本匹配，而是直接依赖 `searchStore`。
2. **执行模糊搜索**: 当 `processUserInput` action 被调用时，它会立即执行 `searchStore.search('knowledge', userInput)`。
    * `'knowledge'` 是一个专门为此目的创建的、包含了所有图鉴、任务、物品等知识的综合性Fuse.js索引。
    * 该索引的 `keys` 配置会包含 `name`, `description`, `tags`, 以及 `dynamicKeywords`，并赋予不同权重。
3. **应用阈值**: Fuse.js 会返回一个带 `score` 的结果列表。`smartContextStore` 会应用一个预设的阈值（例如 `score < 0.4`）来筛选出所有“高相关性”的条目。
4. **生成引用**: 所有通过阈值筛选的条目ID，将被视为本回合用户**直接或间接引用**的知识，并被 `referencedIdsThisTurn` getter 返回。
5. **后续流程不变**: 一旦 `referencedIdsThisTurn` 被确定，SmartContext 后续的 `frequency` 统计、强制注入、高频注入等逻辑将保持不变，但它们现在的数据源变得更加智能和准确。

### 2.2 升级后台学习流程

`ContextLinker` 在筛选候选条目以供次级LLM分析时，也将使用 FuzzySearch。

**旧逻辑**:
使用简单的文本包含关系来粗筛候选条目。

**新协同逻辑**:

1. `contextLinker` 在 `selectCandidateEntries` 函数中，将调用 `searchStore.search('knowledge', userInput)`。
2. 这将使得筛选出的候选条目与用户输入的**语义相关性**更强，即使它们之间没有直接的词语重叠。
3. 这确保了我们总是将最“值得学习”的材料发送给LLM，从而提高了后台学习的效率和质量。

## 3. 实现细节

### 3.1 `searchStore` 的配置

需要创建一个名为 `'knowledge'` 的综合性Fuse.js实例，其配置示例如下：

```javascript
// searchStore.ts
const knowledgeOptions = {
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'tags', weight: 0.2 },
    { name: 'dynamicKeywords', weight: 0.2 }, // 后台学习到的关键词
    { name: 'description', weight: 0.1 }
  ],
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  threshold: 0.4, // 这是一个可供调整的关键参数
};

// 在初始化时
const allKnowledge = [...pokedexStore.chatPokedex, ...questStore.activeQuests];
this.initializeSearchIndex('knowledge', allKnowledge, knowledgeOptions);
```

### 3.2 `smartContextStore` 的修改

```typescript
// smartContextStore.ts
import { useSearchStore } from './searchStore';

// ...
  actions: {
    processUserInput(userInput: string) {
      const searchStore = useSearchStore();
      searchStore.search('knowledge', userInput);
      
      // referencedIdsThisTurn getter 会自动从 searchStore.searchResults.knowledge 中获取结果
      // 后续的频率更新等逻辑由 getter 触发
    }
  },
  getters: {
    referencedIdsThisTurn(state) {
      const searchStore = useSearchStore();
      const results = searchStore.searchResults.knowledge || [];
      
      // 注意：这里的 score 阈值是硬编码的，未来可以做成可配置
      return results
        .filter(result => result.score < 0.4)
        .map(result => result.item.id);
    }
  }
// ...
```

## 4. 总结

通过将 FuzzySearch 作为 SmartContext 的前端“感知层”，我们构建了一个更加健壮和智能的记忆系统。该系统能够更好地理解玩家的模糊意图，做出更精准的上下文联想，最终为LLM提供更高质量的信息，从而极大地提升了对话的沉浸感和连贯性。
