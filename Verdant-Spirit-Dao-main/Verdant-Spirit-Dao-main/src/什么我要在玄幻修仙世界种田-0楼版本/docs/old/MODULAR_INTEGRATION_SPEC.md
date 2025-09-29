# 模块化整合规范 (MODULAR_INTEGRATION_SPEC.md) v1.6

本文档旨在为《玄幻修仙世界种田》项目提供一套清晰、可维护的模块化整合方案，用于将“开局设定”功能 (`SetupModule`) 与“游戏主引擎” (`0楼版本`项目) 进行解耦整合。

## 1. 设计哲学

整合的核心是遵循“高内聚，低耦合”的软件设计准则，构建一个清晰的 **“主应用-模块” (Host-Module)** 架构。

1. **主应用 (Host Application)**:
    * 即 `0楼版本` 项目，作为整个应用的“外壳”或“宿主”。
    * **职责**: 管理应用的整体生命周期、核心状态（通过聊天变量作为单一事实来源）、UI布局（包括主菜单和游戏界面），并负责在特定流程中（如新游戏）动态加载功能模块。
    * **原则**: 主应用**不应**关心任何具体模块的内部实现细节。它只通过一套标准接口与模块通信。

2. **功能模块 (Feature Module)**:
    * 例如 `SetupModule`，负责完全封装一项独立的功能（如开局设定）。
    * **职责**: 封装其功能所需的所有 **逻辑** 和 **数据处理**。对于UI，主应用在 `index.html` 中提供静态HTML结构（“骨架”），模块则负责接管这个结构，并为其注入动态内容和交互行为。
    * **原则**: 模块**不应**直接访问或修改主应用的核心状态或DOM。它只能在主应用提供的容器内运作，并通过约定的回调函数或事件将结果返回给主应用。

## 2. 模块接口规范 (Module Interface Contract)

为了实现主应用与模块之间的解耦，我们定义以下接口作为通信的唯一契约。

### 2.1 `IGameModule` 接口

所有功能模块都应实现此接口：

```typescript
interface IGameModule {
  /**
   * 挂载模块
   * @param container - 主应用提供的用于渲染模块UI的HTML元素。
   * @param onComplete - 模块完成其任务时调用的回调函数，用于将结果返回给主应用。
   */
  mount(container: HTMLElement, onComplete: (result: any) => void): Promise<void>;

  /**
   * 卸载模块
   * 负责清理模块创建的所有DOM元素、事件监听器等资源。
   */
  unmount(): Promise<void>;
}
```

### 2.2 `SetupModule` 的数据契约 (`initialState` 对象)

当玩家点击“确认开局”时，`SetupModule` 必须通过 `onComplete` 回调函数，返回一个严格遵循 `VARIABLES_SPEC.md` 规范的 **初始状态对象 (initialState)**。这是模块与主应用之间数据传递的唯一格式。

此对象不仅包含了角色的基础信息（如通过新增的表单自定义的性别、年龄、外貌、背景故事等），还应详细记录玩家在开局时做出的所有策略性选择（如初始地点、季节、天赋分配等），以便于后续的游戏逻辑判断和状态追溯。

**(注意：`initialState` 的具体结构和数据映射规则，请严格参考 `VARIABLES_SPEC.md` (v2.0) 中定义的 `角色` 和 `世界` 命名空间结构)**

## 3. 应用生命周期与数据流 (v1.5 更新)

整合后的应用将遵循一个以**页面重载 (Reload)** 为核心的状态转换流程，以确保数据一致性。

1. **入口 (`index.ts`) 启动**:
    * 主应用初始化所有核心服务，如 `ChatHistoryManager`。
    * 主应用调用 `chatHistoryManager.loadHistory()` 从聊天变量中加载历史记录到内存。
    * **新增：状态路由检查**:
        * 检查 `sessionStorage` 中是否存在 `gameStateAfterReload` 标志。
        * **检查后立即清除该标志**，以防影响后续的正常刷新。
    * **根据路由标志或存档状态决定初始界面**:
        * **如果标志为 `'setup'`**: 直接调用 `showScreen('setup')`，进入开局设定流程。
        * **如果标志为 `'game'`**: 直接调用 `startGame()`，进入游戏主界面。
        * **如果无标志 (正常加载)**:
            * 检查 `historyManager.getTurnCount() > 0`。
            * 如果存在存档，则调用 `startGame()` 直接进入游戏。
            * 如果不存在存档，则调用 `showScreen('menu')` 显示主菜单。

2. **用户在主菜单交互**:
    * 用户看到“开始游戏”、“设定概览”、“关于”三个选项。
    * 点击“设定概览”或“关于”会切换到对应的面板。

3. **进入“开始游戏”子菜单**:
    * 用户点击“开始游戏”。
    * 应用检查 `historyManager.getTurnCount() > 0` 来判断是否存在存档。
    * 如果存在存档，“继续游戏”按钮被启用。
    * 显示“开始游戏”子菜单，其中包含“开始新游戏”、“继续游戏”、“加载存档”选项。

4. **子菜单操作流程**:

    * **场景一：继续游戏 (Continue Game)**
        * 用户点击“继续游戏”。
        * 调用 `startGame()` 函数。
        * `showScreen('game')` 被调用，隐藏菜单并显示游戏主界面 (`#game-panel`)。
        * `storyRenderer.init()` 从已存在的聊天变量中恢复并渲染完整的游戏状态。

    * **场景二：加载存档 (Load Game)**
        * 用户点击“加载存档”，并选择一个 `.json` 存档文件。
        * 应用读取并解析文件内容。
        * 调用 `overwriteAllChatVariables(loadedData)`，用存档数据**完全覆盖**当前的聊天变量。
        * **新增**: 调用 `sessionStorage.setItem('gameStateAfterReload', 'game')` 设置重载后的状态标志。
        * 调用 `window.location.reload()` 重新加载整个应用。
        * 重载后，**入口启动逻辑**会检测到 `'game'` 标志，并直接调用 `startGame()` 进入游戏，从而无缝加载存档。

    * **场景三：开始新游戏 (New Game)**
        * 用户点击“开始新游戏”并确认。
        * 调用 `clearAllChatVariables()` 清空所有聊天变量。
        * **新增**: 调用 `sessionStorage.setItem('gameStateAfterReload', 'setup')` 设置重载后的状态标志。
        * 调用 `window.location.reload()` 重新加载整个应用。
        * 重载后，**入口启动逻辑**会检测到 `'setup'` 标志，并直接调用 `showScreen('setup')` 进入开局设定流程。
        * 动态加载并挂载 `SetupModule`，并传入 `onSetupComplete` 回调函数。

5. **开局完成 (`onSetupComplete` 回调被触发)**
    * 主应用收到 `SetupModule` 传回的 `initialState` 对象。
    * 调用 `setupModule.unmount()` 销毁开局界面。
    * **核心数据流对接与初始化时序**:
        > **[!] 重要时序说明 (Timing is Critical)**
        > 此处的初始化顺序至关重要。错误的顺序会导致“创世快照” (`世界.初始状态`) 在所有数据（特别是 `plugin_storage.llm_history`）被完全写入前就已生成。一个不完整的快照会在后续的状态重算（如切换Swipe或加载）中引发验证失败的错误，因为从不完整快照重算出的状态无法与数据库中的完整状态匹配。
        >
        > **必须**严格遵循以下经过验证的初始化时序：
        >
        1. **写入基础状态**: 首先，调用 `overwriteAllChatVariables(initialState)` 将开局模块生成的纯净初始状态写入变量。同时，为其他需要初始化的模块（如“奇遇”系统）插入其默认状态。
        2. **初始化历史记录**: 接着，调用 `historyManager` 的相关方法（如 `startGenesisTurn` 和 `addAssistantMessagePage`）来创建游戏的第一条消息。**此步骤会创建 `plugin_storage.llm_history` 变量**，这是确保快照完整性的关键。
        3. **创建创世快照**: 在所有基础状态和历史记录都已写入后，从变量中**重新读取一次最完整的状态**。然后，基于这个最完整的状态，创建“创世快照” (`世界.初始状态`)。
        4. **启动游戏**: 最后，调用 `startGame()` 函数，无缝进入游戏主界面，**无需重新加载页面**。

通过这个流程，我们确保了所有状态的建立都遵循“单一事实来源”的原则，并且为用户提供了清晰、现代化的菜单导航体验。

## 4. 目录与文件结构

(目录结构保持不变)

```
src/什么我要在玄幻修仙世界种田-0楼版本/
├── core/         # 游戏核心引擎
├── data/
│   └── genesisMessages.ts # (新增) 存储所有开局情节的文本数据
├── docs/
│   └── MODULAR_INTEGRATION_SPEC.md  # (本文档)
├── modules/      # (新增) 存放所有可插拔的功能模块
│   └── setup/    # 开局设定模块
│       ├── index.ts      # 模块入口，实现 IGameModule 接口
│       ├── data.ts       # 模块所需的常量数据
│       └── types.ts      # 模块内部的类型定义
├── ui/           # 游戏主界面的UI逻辑
├── index.html    # 主HTML，包含所有UI面板骨架
├── index.scss    # 主样式文件
└── index.ts      # 主应用入口，负责生命周期管理和UI调度
