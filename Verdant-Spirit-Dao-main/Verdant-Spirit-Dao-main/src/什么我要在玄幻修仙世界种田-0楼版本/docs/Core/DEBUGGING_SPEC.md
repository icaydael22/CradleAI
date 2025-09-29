# 调试系统规范 (DEBUGGING_SPEC.md) v1.3

本文档旨在为开发者提供一个清晰、统一的调试系统使用规范，重点在于通过一个集中的日志系统来控制调试信息的输出。

## 1. 设计哲学

1. **非侵入性 (Non-Intrusive)**: 调试系统在默认状态下应完全静默，不产生任何性能开销，不干扰正常的游戏流程。
2. **按需输出 (On-Demand Output)**: 只有当调试模式被显式开启时，详细的调试信息才会被打印到浏览器的开发者控制台中。
3. **集中管理 (Centralized Control)**: 所有模块的调试输出都应通过一个统一的日志函数来管理，而不是散乱地使用 `console.log`。
4. **清晰可读 (Readability)**: 输出的日志应包含等级、时间戳、模块名和消息内容，并使用颜色进行区分，以提高可读性。

## 2. 启动与入口

1. **入口**: 在游戏主界面的右上角，会添加一个“调试设置”按钮（图标为 <i class="fas fa-bug"></i>）。
2. **激活**: 点击该按钮，会弹出一个独立的模态框。
3. **控制**: 模态框中提供一个“开启调试模式”的开关。此开关的状态会实时影响日志系统是否输出信息。
4. **持久化**: 调试模式的开关状态将存储在浏览器的 `localStorage` (`xuanhuan.debugMode`) 中，以便在刷新页面后保持状态。

## 3. 核心功能：日志系统

### 3.1 日志模块 (`core/logger.ts`)

这是调试系统的核心。它提供了一个名为 `logger` 的导出函数。

* **函数签名**: `logger(level, moduleName, message, ...additionalData)`
* **参数**:
  * `level`: 日志等级，可选值为 `'log'`, `'info'`, `'warn'`, `'error'`。
  * `moduleName`: 字符串，用于标识日志来源的模块（例如 `'History'`, `'Renderer'`, `'AI Events'`）。
  * `message`: 要打印的主要消息或对象。
  * `...additionalData`: 任意数量的附加数据，会一并打印。
* **行为**:
  * 函数在被调用时，会首先检查 `localStorage` 中的 `xuanhuan.debugMode` 状态。
  * 如果状态为 `'true'`，它会根据 `level` 使用不同的颜色，将格式化后的日志（包含时间戳、模块名）打印到控制台。
  * 如果状态不为 `'true'`，函数将直接返回，不执行任何操作。

### 3.2 使用方法

在项目的任何模块中，开发者都应导入并使用此 `logger` 函数来替代 `console.log`。

**示例**:

```typescript
import { logger } from './core/logger';

// ... 在某个函数中 ...
function someFunction() {
  const data = { id: 1, name: '灵谷' };
  logger('info', 'MyModule', '成功获取数据:', data);
  
  if (!data.name) {
    logger('warn', 'MyModule', '数据中缺少 "name" 字段。');
  }
}
```

## 4. 核心功能：调试面板

调试模态框已完全迁移至 **Vue 3** 框架，集成了多个高级工具，通过Tab页进行切换，为开发者提供全面的调试支持。

### 4.1 日志查看器 (Log Viewer)

*   **功能**: 提供一个响应式的日志显示界面，可以实时查看由 `logger` 函数记录的所有信息。
*   **操作**:
    *   **过滤与搜索**: 提供按日志等级（Log, Info, Warn, Error）进行过滤的复选框，以及一个文本输入框用于实时搜索日志内容。
    *   **展开长日志**: 对于过长的日志条目，会自动进行截断，并提供“显示更多”链接以查看完整内容。
    *   **管理**: 提供“刷新”、“清空”和“下载”按钮，方便对当前会话的日志进行管理。

### 4.2 状态浏览器 (State Browser)

*   **功能**: 此Tab页提供了一个完全动态的、可折叠的树状视图，用于展示当前所有的聊天变量。它能够递归地渲染所有命名空间（如 `角色`, `世界`, `plugin_storage`）及其所有嵌套的键值对，确保了对 `VARIABLES_SPEC.md` 中定义的任何复杂数据结构都能进行完整、清晰的展示。
*   **操作**:
    *   点击 **“刷新变量”** 按钮，会调用 `getVariables({ type: 'chat' })` 获取最新状态，并将其渲染为可交互的折叠树。
    *   点击 **“下载变量 (JSON)”** 按钮，会将当前获取到的所有聊天变量以格式化的 `.json` 文件形式下载到本地，便于离线分析和调试。
    *   这个动态视图取代了旧的静态卡片和通用JSON树，使开发者能更直观、高效地理解和验证当前的游戏状态。

### 4.3 事件注入器 (Event Injector)

*   **功能**: 这是一个强大的测试工具，允许开发者绕过LLM的生成过程，直接向 `syncVariables` 函数注入事件，以测试核心变量更新逻辑的正确性。
*   **操作**:
    *   **事件预设**: UI提供了一组预设按钮（如“获得物品”、“更新角色状态”、“解锁新成就”）。点击按钮会自动在文本区域生成对应的JSON模板。
    *   **手动输入**: 你也可以在文本框中手动输入一个标准的事件对象（例如 `{"事件": "物品变化", "数据": {...}}`）或一个完整的事件列表结构 (`{"事件列表": [...]}`）。
    *   **注入**: 点击 **“注入事件”** 按钮，输入的JSON会被解析并传递给 `syncVariables` 函数进行处理。成功或失败都会有相应的 `toastr` 提示。
*   **核心原则**: 此工具的设计遵循“聊天变量是唯一事实来源”的原则，通过注入标准事件来“写入”变量，从而验证事件驱动架构的稳健性。

### 4.4 提示词查看器 (Prompt Viewer)

*   **功能**: 此Tab页用于检查发送给LLM的最后一个系统提示词的完整内容。
*   **操作**:
    *   点击 **“刷新提示词”** 按钮，会从 `PromptManager` 获取最新的系统提示词。
    *   提示词会被自动解析为 `SystemInstructions`、`世界状态摘要` 和 `核心变量` 三个部分，并分别估算Token数量，便于开发者进行提示词优化。

## 5. 模块职责 (Vue 迁移后)

* **`core/logger.ts`**: 职责不变，仍然是日志系统的核心，提供 `logger` 函数和日志存储。
* **Vue 组件 (`components/debug/*.vue`)**:
  * **`DebugModal.vue`**: 作为根组件，负责构建模态框的整体布局、Tab导航和页脚，并管理各Tab页的切换。
  * **`StateBrowser.vue`**: “状态浏览器”标签页，负责获取并渲染聊天变量。
  * **`VariableEntry.vue`**: 一个递归子组件，用于在状态浏览器中以可折叠的树状结构显示单个变量条目。
  * **`EventInjector.vue`**: “事件注入器”标签页，提供UI以手动创建和注入事件。
  * **`LogViewer.vue`**: “日志查看器”标签页，负责显示、过滤和管理日志。
  * **`LogEntry.vue`**: 一个子组件，用于显示单条日志，并处理长日志的展开/折叠逻辑。
  * **`PromptViewer.vue`**: “提示词查看器”标签页，负责获取、解析和显示系统提示词。
* **`stores/debugStore.ts`**: 一个 Pinia store，负责处理与调试相关的状态逻辑，例如异步获取聊天变量。
* **`ui/modals/debug.ts`**: 职责简化为**初始化器**。它只负责在用户点击调试按钮时，将 `DebugModal.vue` 组件挂载到DOM中。
* **`index.html`**: 提供“调试设置”按钮和Vue应用的挂载点 (`<div id="debug-modal-app"></div>`)。
* **`index.ts`**: 在应用初始化时，调用 `initDebugModal` 来设置挂载逻辑，并将 `eventManager` 和 `promptManager` 实例暴露到全局 `window` 对象上，以供Vue组件访问。

---

## 6. 预期日志输出示例

以下是在调试模式开启时，从页面加载到完成一次用户交互的完整生命周期中，预期的控制台日志输出流程。这有助于开发者理解数据流和事件触发顺序。

### 阶段一: 页面加载与状态恢复

**场景**: 用户首次加载或刷新页面。此日志流精确展示了从入口到最终渲染的完整数据处理链路。

```
// --- 1. 入口与核心服务加载 (index.ts) ---
[01:32:34] [Index]      Initialized. Operating on floor_id: 0 
[01:32:34] [Pokedex]    Initialized with data from TS module. 
[01:32:34] [History]    Chat history loaded. Active branch: "main". 

// --- 2. 状态恢复 (renderer.ts) ---
[01:32:34] [Renderer]   `init` called. Starting full render process. 
[01:32:34] [Renderer]   Running variable integrity check... 
[01:32:34] [Renderer]   One or more core variables were missing. Initializing them. { ... }
[01:32:34] [Renderer]   Searching for latest valid state in 1 messages. 
[01:32:34] [Renderer]   Checking message at index 0... 
[01:32:34] [Renderer]   Found valid JSON at index 0. Marking as valid and returning. 
[01:32:34] [Renderer]   Status bar JSON parsed. Calling `syncVariables`. { "事件列表": [...] }

// --- 3. 事件重放与变量同步 (variables.ts) ---
[01:32:34] [Variables]  `syncVariables` called with event list: [ { "事件": "角色更新", ... } ]
[01:32:34] [Variables]  `syncVariables` started. Initial chat variables: { ... }
[01:32:34] [Variables]  Processing event: "角色更新"
[01:32:34] [Variables]  Handler for "角色更新" produced updates: { "角色.萧栖雪.姓名": "萧栖雪", ... }
[01:32:34] [Variables]  Processing event: "初始物品设定"
[01:32:34] [Variables]  Handler for "初始物品设定" produced updates: { "角色.萧栖雪.物品": [...], "世界.图鉴.物品": [...] }
[01:32:34] [Variables]  Processing event: "庇护所升级"
[01:32:34] [Variables]  Handler for "庇护所升级" produced updates: { "世界.庇护所": { "状态": "尚未建立" } }
[01:32:34] [Variables]  Processing event: "系统确认"
[01:32:34] [Variables]  [handleSystemUpdate] received event data: { "id": "system-barter", "name": "以物换物", ... }
[01:32:34] [Variables]  [handleSystemUpdate] Current system state before merge: {}
[01:32:34] [Variables]  [handleSystemUpdate] System state after merge: { "id": "system-barter", ..., "名称": "以物换物" }
[01:32:34] [Variables]  Handler for "系统确认" produced updates: { "世界.系统": { ... } }
[01:32:34] [Variables]  Applying all merged updates (nested) to chat variables: { "角色": { ... }, "世界": { ... } }
[01:32:35] [Variables]  [POST-SYNC CHECK] "世界.系统" state immediately after update: { "id": "system-barter", ..., "名称": "以物换物" }

// --- 4. UI渲染 (renderer.ts) ---
[01:32:35] [Renderer]   `syncVariables` has completed. 
[01:32:35] [Renderer]   [POST-SYNC CHECK] "世界.系统" state after sync: { "id": "system-barter", ..., "名称": "以物换物" }
[01:32:35] [Renderer]   All variables before final render. { ... }
[01:32:35] [Renderer]   Rendering World Info: { "time": "未知", "location": "未知" }
[01:32:35] [Renderer]   Rendering Characters. Found characters: [ { "姓名": "萧栖雪", ... } ]
[01:32:35] [Renderer]   Rendering Shelter data: { "状态": "尚未建立" }
[01:32:35] [Renderer]   `renderInventoryFromChatVars` called.
[01:32:35] [Renderer]   [renderSystem] Full variables object being read: { ... }
[01:32:35] [Renderer]   [renderSystem] Rendering System data retrieved from variables: { "id": "system-barter", ... }
[01:32:35] [Renderer]   Initialization and rendering completed successfully. 

// --- 5. 前端UI状态同步 (index.ts) ---
[01:32:34] [Index]      Initial state sync: Found an existing assistant message. Populating swipes state. 
```

### 阶段二: 用户交互 (新回合)

**场景**: 页面加载完成后，用户选择了行动 "探索周围的环境"。

```
[22:10:01] [LOG]   [Actions]    `triggerAction` triggered with action #0: "探索周围的环境"
[22:10:01] [LOG]   [State]      Flag `isNewTurn` set to `true`.
[22:10:01] [LOG]   [History]    New message added to branch "main". History now has 16 entries.
[22:10:01] [LOG]   [History]    Saving history to chat variables...
[22:10:01] [INFO]  [History]    User action saved to history.
[22:10:01] [LOG]   [Actions]    Variables for prompt: { ... }
[22:10:01] [INFO]  [Generation] Final message to be sent to LLM: <ChatHistory>...</ChatHistory><Variables>...</Variables>
[22:10:01] [INFO]  [Generation] `sendGenerationRequest` called.
[22:10:01] [LOG]   [Generation] Formatted state context for injection: 【当前状态】...

[22:10:02] [INFO]  [AI Events]  STREAM_TOKEN_RECEIVED_INCREMENTALLY [First Token]
[22:10:02] [LOG]   [State]      Flag `isAiGenerating` set to `true`.
[22:10:02] [LOG]   [Swipes]     New turn detected. Clearing previous swipes.
[22:10:02] [LOG]   [Swipes]     New swipe placeholder added. Swipe index is now 0. Total swipes: 1.

[22:10:04] [INFO]  [AI Events]  STREAM_TOKEN_RECEIVED_FULLY
[22:10:04] [LOG]   [Swipes]     Full text received, updating last swipe content.
[22:10:04] [LOG]   [Renderer]   Status bar found. Initiating variable sync and render.
[22:10:04] [INFO]  [Variables]  `syncVariables` called with events: { "角色更新": ... }
[22:10:04] [LOG]   [Variables]  Processing event type: "角色更新"
[22:10:04] [LOG]   [Variables]  Handler for "角色更新" produced updates: { "角色.曦月.灵力": ... }
[22:10:04] [INFO]  [Variables]  Applying all merged updates to chat variables: { ... }
[22:10:04] [LOG]   [Renderer]   Variable sync complete, re-rendering side panels.

[22:10:05] [INFO]  [AI Events]  GENERATION_ENDED
[22:10:05] [LOG]   [History]    Final swipe content to be saved: "你仔细观察四周..."
[22:10:05] [LOG]   [History]    This was a new turn. Adding a new assistant message.
[22:10:05] [LOG]   [History]    Saving history to chat variables...
[22:10:05] [INFO]  [History]    Saved final assistant response as a new message.
[22:10:05] [LOG]   [State]      Generation finished. Resetting state flags.
[22:10:05] [LOG]   [State]      Flag `isAiGenerating` set to `false`.
[22:10:05] [LOG]   [State]      Flag `isNewTurn` set to `false`.
```

### 阶段三: 图鉴管理与同步

**场景**: 在一次交互后，LLM生成了一个全新的物品“荧光草”，玩家通过图鉴管理界面批准它，并最终将其分享至社区。

```
// (...接阶段二, LLM的响应中包含了一个新物品的发现事件...)
[22:10:04] [INFO]  [Variables]  `syncVariables` called with events: { "新图鉴发现": { "物品": [{"名称": "荧光草", ...}] } }
[22:10:04] [LOG]   [Variables]  Processing event type: "新图鉴发现"
[22:10:04] [LOG]   [Pokedex]    Read attempt for "荧光草" in "物品": Not Found.
[22:10:04] [WARN]  [Variables]  Found unknown item "荧光草" of type "物品". Added to player pokedex and pending review list.
[22:10:04] [INFO]  [Variables]  Applying all merged updates to chat variables: { "世界.图鉴.物品": [...], "世界.系统.待审核图鉴": [...] }

// (用户打开图鉴管理模态框)
[22:11:30] [LOG]   [PokedexUI]  Pokedex manager modal opened.
[22:11:30] [LOG]   [PokedexUI]  Populating view tab...
[22:11:30] [INFO]  [PokedexUI]  Found 1 items pending review.

// (用户点击“确认录入”按钮)
[22:11:35] [LOG]   [Pokedex]    Attempting to create entry in "物品": { "名称": "荧光草", ... }
[22:11:35] [INFO]  [Pokedex]    Successfully created entry "荧光草" in memory.
[22:11:35] [LOG]   [PokedexUI]  Populating view tab...

// (用户打开远程同步模态框)
[22:12:00] [LOG]   [RemoteSync] Remote sync modal opened.
[22:12:00] [LOG]   [RemoteSync] Populating submit list: comparing local vs remote...
[22:12:01] [INFO]  [Pokedex]    Fetching remote pokedex from https://...
[22:12:02] [INFO]  [Pokedex]    Successfully fetched and parsed remote pokedex.
[22:12:02] [INFO]  [RemoteSync] Found 1 local entries not present on remote.

// (用户选择“荧光草”并点击“提交到社区”)
[22:12:10] [LOG]   [RemoteSync] Submit to remote button clicked, 1 items selected.
[22:12:10] [WARN]  [Pokedex]    submitToHuggingFace is a placeholder and does not actually submit data.
[22:12:10] [INFO]  [RemoteSync] Successfully submitted 1 entries.
```
