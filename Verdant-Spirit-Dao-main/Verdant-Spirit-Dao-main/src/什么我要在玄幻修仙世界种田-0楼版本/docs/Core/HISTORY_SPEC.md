# 聊天历史管理规范 (HISTORY_SPEC.md) v3.0

本文档旨在详细描述聊天历史记录系统的设计、数据结构、核心功能及其在应用中的交互方式。此版本将进一步明确**核心历史管理器 (`ChatHistoryManager`)** 与 **UI状态管理器 (`historyStore`)** 之间的职责划分。

## 1. 核心设计哲学

1.  **分层架构**: 系统明确分为两层：
    *   **核心层 (`core/history.ts`)**: `ChatHistoryManager` 类，负责所有与数据结构相关的底层操作，如加载、保存、增删改查回合/分支，以及状态重算所需的数据获取。它是一个纯粹的数据管理器，不依赖任何UI框架。
    *   **UI展现层 (`stores/ui/historyStore.ts`)**: 一个 Pinia store，作为 `ChatHistoryManager` 的前端代理和UI状态容器。它负责驱动历史记录模态框的显示、处理用户交互（如点击按钮），并调用核心层的方法来执行实际操作。

2.  **结构化回合 (Structured Turns)**: 历史记录的核心单元是“回合” (`Turn`)。每个回合清晰地包含用户的输入和AI对应的多个回复（`Swipes`），使数据结构与交互逻辑完全对齐。

3.  **三层数据模型**: 数据结构为 `分支 (Branch) -> 回合 (Turn) -> 消息页 (MessagePage)`。这种设计以适度的空间换取了极高的操作简便性和可维护性。

4.  **事件溯源关联**: 每个 `MessagePage` (即 `Swipe`) 都有一个全局唯一的 `id`，`世界.事件列表` 中的每个事件都通过 `sourceMessageId` 与其精确绑定，这是状态重算的基础。

## 2. 数据结构

### MessagePage 接口 (单个消息页/Swipe)

代表一个独立的消息单元，无论是用户输入还是AI的单个回复。

```typescript
interface MessagePage {
  id: string;          // 消息页的全局唯一ID
  role: 'user' | 'assistant' | 'summary';
  content: string;       // 消息内容
  timestamp: number;
  isValid?: boolean;     // 消息有效性
}
```

### Turn 接口 (单个回合)

封装了对话中的一个“回合”。

```typescript
interface Turn {
  role: 'user' | 'assistant';
  pages: { 
    [pageIndex: number]: MessagePage; // 该回合的所有消息页
  };
  activePageIndex: number; // 当前激活的消息页索引
}
```

### DisplayTurn 接口 (用于UI显示)

在 `historyStore.ts` 中定义，为 `Turn` 接口添加了前端渲染所需的 `turnIndex`。

```typescript
interface DisplayTurn extends Turn {
  turnIndex: number;
}
```

### ChatHistory 接口 (历史记录顶层结构)

```typescript
interface ChatHistory {
  branches: {
    [branchId: string]: { // 分支ID，如 'main'
      [turnIndex: number]: Turn; // 回合索引，以数字为键
    };
  };
  activeBranch: string;
  // 用于快速查找的元数据，在加载时生成
  metadata: {
    [messageId: string]: {
      branchId: string;
      turnIndex: number;
      pageIndex: number;
    }
  }
}
```

## 3. 核心层: `ChatHistoryManager` 的职责

`ChatHistoryManager` (`core/history.ts`) 是历史数据的唯一权威来源，负责所有核心的数据操作。

### 3.1 初始化与加载 (`loadHistory`)

*   **时机**: 应用启动时由 `index.ts` 调用。
*   **流程**:
    1.  从聊天变量 `plugin_storage.llm_history` 中读取 `ChatHistory` 对象。
    2.  **兼容性迁移**: (如果需要) 检测旧版数据结构并自动转换为新版结构。
    3.  **元数据构建**: 遍历历史树，构建 `metadata` 查找表，将每个 `messageId` 映射到其精确坐标 (`branchId`, `turnIndex`, `pageIndex`)，供 O(1) 复杂度的快速访问。

### 3.2 核心操作 API (供上层调用)

*   **`addUserTurn(message: MessagePage)`**: 在当前分支末尾添加一个用户回合。
*   **`addAssistantMessagePage(message: MessagePage)`**: 在当前分支的最后一个回合（如果存在且是 `assistant` 回合）或一个新回合中，添加一个AI消息页。
*   **`setActivePage(turnIndex: number, pageIndex: number)`**: 切换指定回合的激活消息页，并触发状态重算。
*   **`updateMessagePageContent(messageId: string, newContent: string)`**: 编辑指定消息页的内容。
*   **`deleteTurn(turnIndex: number)`**: 删除指定的回合。
*   **`createBranch(fromTurnIndex: number)`**: 从指定回合创建新分支。
*   **`switchBranch(branchId: string)`**: 切换到指定分支。
*   **`renameBranch(branchId: string, newName: string)`**: 重命名分支。
*   **`deleteBranch(branchId: string)`**: 删除分支。
*   **`getMessagesForPrompt()`**: 遍历当前活动分支的所有 `Turn`，根据每个 `Turn` 的 `activePageIndex` 挑选出正确的 `MessagePage`，组装成一个线性的对话历史发送给LLM。

### 3.3 持久化 (`saveHistory`)

*   一个私有方法，在任何修改操作后被调用，将整个 `ChatHistory` 对象写回到聊天变量中。

## 4. UI展现层: `historyStore` 的职责

`historyStore.ts` 是一个 Pinia store，负责连接核心历史逻辑与前端UI。

### 4.1 状态 (State)

*   `historyManager`: `ref<ChatHistoryManager | null>` - 持有从全局获取的 `ChatHistoryManager` 实例。
*   `branches`: `ref<Branch[]>` - 当前所有分支的列表，用于UI渲染。
*   `activeBranchId`: `ref<string | null>` - 当前激活分支的ID。
*   `turns`: `ref<DisplayTurn[]>` - 当前激活分支的回合列表，用于UI渲染。
*   `isModalVisible`: `ref<boolean>` - 控制历史记录模态框的显示与隐藏。
*   `activeTab`: `ref<'messages' | 'graph'>` - 模态框内的活动标签页。

### 4.2 动作 (Actions) - 用户交互入口

`historyStore` 的 Actions 是UI组件事件的直接响应者。它们通常会先调用 `getManager()` 获取核心服务实例，然后调用 `ChatHistoryManager` 的相应方法，并在操作完成后更新UI状态。

*   **`showModal()`**:
    1.  调用 `loadHistoryData()` 从 `ChatHistoryManager` 加载最新数据到 store 的 state 中。
    2.  设置 `isModalVisible.value = true`，显示模态框。

*   **`hideModal()`**: 设置 `isModalVisible.value = false`，隐藏模态框。

*   **`loadHistoryData()`**:
    1.  调用 `getManager().loadHistory()` 确保核心管理器数据最新。
    2.  调用 `getManager().getBranches()` 和 `getManager().getActiveBranchId()` 更新 `branches` 和 `activeBranchId` 状态。
    3.  获取当前分支的原始回合数据，并转换为 `DisplayTurn[]` 格式，更新 `turns` 状态。

*   **`updateMessageContent(messageId: string, newContent: string)`**:
    1.  调用 `getManager().updateMessagePageContent(...)`。
    2.  操作成功后，派发 `branchChanged` 自定义事件，通知 `index.ts` 进行全局状态重算。
    3.  调用 `loadHistoryData()` 刷新UI。

*   **`deleteTurn(turnIndex: number)`**:
    1.  弹出确认框。
    2.  调用 `getManager().deleteTurn(turnIndex)`。
    3.  操作成功后，调用 `loadHistoryData()` 刷新UI，并可能触发 `storyRenderer.init()` 重新渲染故事。

*   **分支操作 (`switchBranch`, `renameBranch`, `deleteBranch`, `createBranchFromTurn`)**:
    *   这些函数目前在UI层被临时禁用（通过 `toastr.warning` 提示）。
    *   其标准流程应为：调用 `ChatHistoryManager` 的同名方法 -> 成功后派发 `branchChanged` 事件 -> 调用 `loadHistoryData()` 刷新UI。

## 5. 数据流与协同

### 查看历史记录

1.  用户点击“历史记录”按钮，调用 `historyStore.showModal()`。
2.  `historyStore` 调用 `loadHistoryData()`，从 `ChatHistoryManager` 拉取分支和回合信息并存入 `ref`。
3.  Vue组件 (`HistoryModal.vue`) 响应式地渲染出 `branches` 和 `turns` 的数据。

### 编辑一条消息

1.  用户在 `HistoryModal.vue` 中编辑消息并保存，调用 `historyStore.updateMessageContent(id, newContent)`。
2.  `historyStore` 调用 `ChatHistoryManager.updateMessagePageContent()`，核心层修改数据并持久化。
3.  `historyStore` 派发 `branchChanged` 事件。
4.  `index.ts` 监听到该事件，触发全局状态重算流程（参考 `CHAT_FLOW_SPEC.md`）。
5.  `historyStore` 调用 `loadHistoryData()` 刷新模态框内的显示。

### 删除一个回合

1.  用户点击删除按钮，调用 `historyStore.deleteTurn(turnIndex)`。
2.  `historyStore` 调用 `ChatHistoryManager.deleteTurn()`，核心层修改数据并持久化。
3.  `historyStore` 调用 `loadHistoryData()` 刷新UI。
4.  `storyRenderer.init()` 被调用，可能会重新渲染主故事面板以反映删除后的状态。
