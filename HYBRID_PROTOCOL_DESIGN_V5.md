# CradleIntro 混合协议层设计方案 (V5 - 终版)

## 1. 目标与背景

本文档旨在解决 `CradleIntro` 项目中 React Native (RN) 与 WebView 之间通信协议僵化、扩展性差的问题。通过引入一个名为 `manifest.json` 的核心协议文件，我们旨在建立一个灵活、可配置、可扩展的混合驱动架构，以支持未来多样化的功能模块（如社交媒体、投资养成等）。

**现状:**
- RN 与 WebView 间的通信类型（`type`）是硬编码的。
- WebView 的交互（如按钮点击）与 RN 端的 API 请求是写死绑定的。
- 缺乏一个统一的、声明式的协议层来定义交互、数据流和渲染逻辑。

**目标:**
- **一切皆可配置**: 通过 `manifest.json` 定义所有核心交互。
- **双轨驱动**: 同时支持传统的线性叙事（视觉小说）和非线性的事件驱动模块（微应用）。
- **职责分离**: RN 专注于原生能力、数据持久化和 AI 调用；WebView 专注于 UI 渲染和内部业务逻辑。

---

## 2. 核心设计：面板、模块与Manifest

### 2.1. 架构概述
新架构的核心是引入一个**面板（Panel）**作为微应用（Modules）的容器。

- **App.vue**: 作为根组件，包含传统的视觉小说界面和一个**可随时唤出的全屏面板容器**。
- **面板 (Panel.vue)**: 一个内置的、带有多标签页的父组件。它根据 `manifest.json` 动态生成标签页，并负责加载和显示激活的模块。
- **模块 (Module)**: 每一个模块（如社交媒体、角色状态）都是一个独立的、“无头”的Vue组件，负责单一的功能。它在被面板加载后，其外观完全由外部注入的CSS定义。

### 2.2. `manifest.json` - 协议蓝图
`manifest.json` 是连接 RN、WebView 和 AI 的唯一契约。

```json
{
  "manifest_version": "5.0",
  "engine_name": "CradleIntro Hybrid Engine",

  "modules": [
    {
      "id": "social_media_module",
      "name": "社交媒体",
      "entry_component": "components/modules/social/SocialMediaRoot.vue",
      "store": "useSocialMediaStore"
    },
    {
      "id": "character_status_module",
      "name": "角色状态",
      "entry_component": "components/modules/status/CharacterStatus.vue",
      "store": "useCharacterStore"
    }
  ],

  "actions": [
    {
      "name": "postToSocialMedia",
      "rn_handler": "handleGenerateContent",
      "request_type": "updateSocialFeed",
      "required_payload": ["content"],
      "ui_trigger": {
        "element_type": "button",
        "label": "发布",
        "css_class": "theme-post-button",
        "event": "click",
        "action_name": "postToSocialMedia"
      }
    },
    {
      "name": "getVariable",
      "rn_handler": "handleGetVariable",
      "request_type": "updateModuleState",
      "required_payload": ["variableName", "targetStore", "targetAction"]
    }
  ],

  "requests": [
    {
      "type": "updateSocialFeed",
      "parser": "generic-event-parser",
      "target_store": "useSocialMediaStore",
      "target_action": "addPosts"
    }
  ]
}
```
*(为简洁起见，部分描述性字段已在代码块中省略)*

- **`modules` (模块清单)**: 定义了将出现在**面板**中的所有可用**标签页**。每个对象都代表一个可加载的微应用。
- **`actions` (动作清单)**: 定义了 WebView (模块) 可以向 RN 发起的**所有高级动作**。
- **`requests` (渲染请求)**: 定义了 RN 向 WebView 发送的消息及其在 WebView 中的处理方式。

---

## 3. 高级定制：完全主题化 (Total Theming)

此架构的核心优势之一是支持**彻底的样式与逻辑分离**。

### 3.1. 实现原理：布局骨架与主题注入 (Layout Skeletons & Theme Injection)

新架构的核心思想是将组件区分为 **“布局骨架” (Layout Skeleton)** 和 **“主题皮肤” (Theme Skin)**。

1.  **预置“布局骨架”组件**: 引擎内置一系列功能性的Vue组件（如 `SocialMedia.vue`, `CharacterStatus.vue`）和它们对应的Pinia Stores。这些组件的本质是 **布局模板**，其特点是：
    *   **包含完整的业务逻辑**（如何处理数据、如何调用`rnAPI`）。
    *   **拥有一个稳定、语义化的HTML结构**（骨架），定义了可供定制的区域和元素。
    *   **自身不包含任何样式代码**。

> **类比：海报设计模板**
> 这就像一个海报设计软件，引擎提供了一系列功能不同的“海报模板”（即“骨架”组件），而创作者则可以在这个模板的布局框架内，用自己的“颜料”和“贴纸”（CSS和配置）来完成最终的设计。

2.  **在配置包中定义皮肤**: 剧本的创作者可以在ZIP包中提供一个完整的 `theme.css` 文件。这个文件定义了所有模块UI的视觉细节。

3.  **RN读取并传递**: RN在初始化时，会读取 `theme.css` 的**全部文本内容**，并将其放入 `initialize` 消息的 `injectedCss` 字段中发送给WebView。

4.  **WebView动态应用**: WebView的根组件在启动时，会接收这个CSS字符串，并动态创建一个`<style>`标签将其注入到文档的`<head>`中，从而全局应用这些样式。

    ```javascript
    // WebView: App.vue (Conceptual)
    function applyCustomCSS(cssString) {
      const styleElement = document.createElement('style');
      styleElement.textContent = cssString;
      document.head.appendChild(styleElement);
    }
    // 在处理 initialize 消息时调用...
    if (message.type === 'initialize' && message.data.injectedCss) {
      applyCustomCSS(message.data.injectedCss);
    }
    ```

### 3.2. 样式绑定：稳定的HTML骨架契约 (Styling Contract: The Stable HTML Skeleton)

**关键问题**：当组件UI完全由外部CSS定义时，创作者如何为特定元素（如“发布”按钮）添加样式？

**答案**：通过**稳定的、语义化的HTML属性**作为“骨架”组件与 `theme.css` 之间的“契约”。

1.  **“骨架”组件定义契约**:
    `SocialMedia.vue` 的模板会为其内部的关键HTML元素（容器、列表、输入框等）设置固定的 `data-ref` 或 `class` 属性。

    ```vue
    <!-- SocialMedia.vue 骨架模板 -->
    <template>
      <div class="social-media-module">
        <div data-ref="post-list-container">
          <!-- 帖子列表会渲染在这里 -->
        </div>
        <div data-ref="composer-area">
          <textarea data-ref="post-input"></textarea>
          <!-- 交互按钮将由 manifest 动态生成 -->
        </div>
      </div>
    </template>
    ```

2.  **`theme.css` 应用样式**:
    剧本创作者可以完全信赖这些 `data-ref` 属性是稳定存在的，并为其自由设计样式。

    ```css
    /* theme.css (示例) */
    .social-media-module [data-ref="composer-area"] {
      border-top: 1px solid #eee;
      padding: 10px;
    }
    .social-media-module [data-ref="post-input"] {
      width: 100%;
      border: none;
      /* ... */
    }
    ```

只要“骨架”组件的HTML结构契约不变，创作者就可以创造出千变万化的视觉主题。

### 3.3. 逻辑绑定：可配置的动作触发器 (Logic Contract: Configurable Action Triggers)

更进一步，我们不仅解耦样式，还要解耦**交互行为本身**。

**关键问题**：如何让“发布”这个行为（包括按钮本身）也变成可配置的，而不是硬编码在组件模板里？

**答案**：将UI触发器（`ui_trigger`）的定义也移入 `manifest.json`。

1.  **在 `manifest.json` 中定义交互**:
    我们在 `actions` 中增加一个 `ui_trigger` 字段，用来描述如何在UI上呈现这个动作的触发器。

    ```json
    // manifest.json
    "actions": [
      {
        "name": "postToSocialMedia", // 对应 rnAPI.postToSocialMedia
        "rn_handler": "handleGenerateContent",
        /* ... */
        "ui_trigger": {
          "element_type": "button",
          "label": "发布",
          "css_class": "theme-post-button",
          "event": "click",
          "action_name": "postToSocialMedia" // 点击后触发的 action 名称
        }
      }
    ]
    ```

2.  **通用模块动态渲染触发器**:
    “骨架”组件（现在可以更通用，如 `GenericModule.vue`）不再包含写死的 `<button>`。它会读取 `manifest` 中与自己相关的 `actions`，并动态渲染出这些 `ui_trigger`。

    ```vue
    <!-- GenericModule.vue (概念) -->
    <template>
      <div class="module-container">
        <!-- ... 其他根据数据渲染的通用布局 ... -->
        <div class="actions-panel">
          <component
            v-for="trigger in availableTriggers"
            :is="trigger.element_type"
            :class="trigger.css_class"
            @[trigger.event]="() => handleAction(trigger.action_name)"
          >
            {{ trigger.label }}
          </component>
        </div>
      </div>
    </template>
    <script setup>
    import { ref, onMounted } from 'vue';
    import { rnAPI } from '@/services/rn-api';
    
    const availableTriggers = ref([]); // 从 manifest 中加载
    
    function handleAction(actionName) {
      // 从 <textarea data-ref="post-input"> 获取内容
      const payload = { content: '...' };
      
      // 动态调用 rnAPI
      if (typeof rnAPI[actionName] === 'function') {
        rnAPI[actionName](payload);
      }
    }
    
    onMounted(() => {
      // ... 根据 manifest.modules.id 找到本模块
      // ... 筛选出 manifest.actions 中属于本模块的 actions
      // ... 将这些 actions 的 ui_trigger 赋值给 availableTriggers
    });
    </script>
    ```

通过这种方式，组件的**布局骨架**、**视觉皮肤 (CSS)** 和 **交互逻辑 (manifest)** 被彻底分离，实现了终极的灵活性。

---

## 4. 端到端流程示例：使用面板发布微博

1.  **初始化 (App Launch)**:
    - RN加载ZIP包，读取 `manifest.json`, `variables.json`, `theme.css`。
    - RN启动WebView，并发送 `initialize` 消息，其中包含上述所有配置数据。
    - WebView (`App.vue`) 收到消息后：
        - 注入 `theme.css`。
        - 初始化 `rnAPI`。
        - 初始化 `worldStore` 存储变量。
        - **初始化 `Panel.vue` 组件，根据 `manifest.modules` 生成“社交媒体”和“角色状态”两个标签页。**

2.  **用户交互 (Action)**:
    - 用户在主游戏界面点击“手机”图标，触发 `App.vue` 显示 `Panel.vue` 容器。
    - 面板出现，默认显示第一个标签页“社交媒体”，即渲染 `SocialMediaRoot.vue` 组件。
    - 用户输入内容，点击带有 `data-action="post-to-social-media"` 属性的“发布”按钮。（注意，现在动作触发器也是配置化的了）
    - `@click="handlePost"` 函数被触发，调用 `rnAPI.postToSocialMedia(...)`。

3.  **RN 处理与 AI 调用 (Handler)**:
    - RN收到 `action` 消息，查找 `manifest`，找到对应的 `rn_handler: "handleGenerateContent"`。
    - `handleGenerateContent` 函数执行，调用LLM并返回JSON结果。

4.  **返回结果 (Request)**:
    - RN根据 `manifest` 中的 `request_type: "updateSocialFeed"`，将AI结果包装成 `request` 消息发回WebView。

5.  **WebView 解析与渲染 (Parser & Store)**:
    - WebView的 `ParserService` 收到消息，根据 `manifest` 定义，将数据路由到 `useSocialMediaStore` 的 `addPosts` action。
    - Store状态更新，`SocialMediaRoot.vue` 组件响应式地渲染出新的帖子。

---

## 5. 总结

这个设计将原本僵化的通信逻辑，转变为一个以 `manifest.json` 为核心的、声明式的、高度可扩展的系统。它不仅提供了清晰的数据流和高度的可扩展性，更通过**CSS注入**和**稳定的HTML契约**，实现了UI表现层与逻辑层的彻底分离，赋予了剧本创作者前所未有的视觉定制能力。

- **开发者体验**:
  - **前端 (WebView)**: 专注于创建功能内聚、无样式的“无头”Vue组件和Stores。
  - **后端 (RN)**: 通过在 `manifest` 中注册 `action` 并实现 `rn_handler` 来扩展功能。
  - **剧本创作者**: 通过编写 `theme.css` 和配置 `manifest.json`，可以自由组合功能并定义独一无二的视觉风格。

- **系统优势**:
  - **高内聚，低耦合**: 功能、逻辑和样式分离。
  - **极致的可扩展性与可定制性**: 可任意添加新功能模块，并为它们设计任何视觉主题。
  - **清晰的数据流**: 数据流向被明确定义，易于调试。
  - **模板与定制分离**: 引擎提供稳定的功能“骨架”组件（布局模板），创作者则专注于通过CSS和`manifest.json`进行视觉和交互的“装修”，实现了关注点分离。

---

## 6. 实施要点 (Implementation Notes)

1.  **预置模块**: 引擎需要预先创建一系列常用的“无头”Vue组件及其对应的Pinia Stores（如 `SocialMedia`、`CharacterStatus` 等），作为创作者可以定制的基础。
2.  **RN端处理器**: 所有在 `manifest` 中定义的 `rn_handler` 方法，应统一在RN端的一个新文件（如 `services/module-manager.ts`）中实现，以保持代码的可维护性。
3.  **宏替换**: `module-manager.ts` 在处理 `action` 并调用LLM之前，需要获取当前剧本的变量实例（`ScriptVariableService`），并对 `prompt_template` 执行宏替换。
4.  **向后兼容**: 本方案在现有逻辑之上新增功能，不与原有的视觉小说数据流冲突。
5.  **初始化时序**: 需协调好 `initialize` 消息与RN端其他初始化操作（如发送`initial-scene`）的执行时序。

---

## 7. 功能验收标准 (Acceptance Criteria)

1.  **向后兼容性**:
    *   **标准**: 加载不包含 `manifest.json` 的旧版或纯视觉小说项目时，原有的配置导入、数据传递、渲染及交互功能应完全不受影响。
    *   **验证**: 运行一个仅包含 `webgal-narrative-parser` 格式内容的剧本，确保其表现与新架构实施前一致。

2.  **模块化系统功能**:
    *   **标准**: 创建一个包含完整 `manifest.json`、`theme.css` 和 `variables.json` 的测试项目包（ZIP）。
        *   面板（Panel）能根据 `manifest.modules` 正确生成标签页。
        *   能够正确加载、渲染“无头”Vue组件，并成功注入 `theme.css` 使其显示自定义样式。
        *   模块内的交互（如点击按钮）能通过 `rnAPI` 正确触发 `manifest` 中定义的 `action`。
        *   RN端的 `module-manager` 能正确接收 `action`，调用对应的 `handler`，并向LLM发送请求。
        *   WebView能正确接收RN返回的 `request` 消息，并通过 `ParserService` 将数据分发到目标Store的指定action。
        *   Vue组件能响应Store的数据变化，并自动更新UI。
    *   **验证**: 使用一个模拟的 `test-manifest.json` 和配套资源，在开发环境中模拟完整的RN-WebView通信，验证上述流程的每一步。

3.  **日志与可追溯性**:
    *   **标准**: 从RN加载配置包到WebView最终渲染的全流程，在关键节点（如消息发送/接收、Action分发、Request解析、Store更新）都应有清晰、格式统一的中文日志输出。
    *   **验证**: 审查端到端流程中的控制台输出，确保日志覆盖了所有关键环节，并且内容清晰易懂，足以追溯完整的数据流。

4.  **健壮性与错误处理**:
    *   **标准**: 对于 `manifest` 中配置错误（如 `action` 未定义、`handler` 不存在）或数据格式错误（如 `request` 的 `data` 非法）等情况，系统应能优雅地处理，并在控制台打印明确的错误信息，而不是导致应用崩溃。
    *   **验证**: 手动修改 `test-manifest.json` 以引入各种错误，观察系统的反应和日志输出。

4.  **无头组件和对应store的处理**:    

    *   **标准**: 创建下列`骨架性`无头组件和对应的store：
    -CharacterStatus
    -WorldStatus
    -Actions
    -SocialMedia
    -Shop
    -Map
    -Quest
    *   **验证**: 组件和store在测试中正常发挥功能。