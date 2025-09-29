# 角色卡跨平台 API 规范 (RFC) v0.1

## 1. 摘要与动机

为了促进LLM角色扮演平台间角色卡的互操作性与可移植性，我们提出构建一个标准化的“角色卡开发抽象层” (Character Card Development Abstraction Layer)。该抽象层的核心是一个名为 `CharacterAPI` 的全局对象，它为角色卡开发者提供一套统一、稳定、与平台无关的接口。

本文档旨在草拟 `CharacterAPI` 的第一版规范，作为社区讨论和后续开发的基础。

## 2. 核心原则

*   **平台无关**: API的设计不应依赖任何特定平台的内部实现。
*   **简单易用**: 提供语义清晰、符合直觉的函数签名。
*   **类型安全**: 鼓励使用 TypeScript 进行开发，提供完整的类型定义。
*   **可扩展性**: 基础 API 集合应保持精简，同时允许平台通过“特性检测”暴露高级功能。

## 3. 基础：平台识别

一切交互的基础是 `window.platformAndInformation()` 方法。`CharacterAPI` 库在初始化时会首先调用此方法，以识别当前宿主环境。

```typescript
// 各平台需要实现此方法
interface PlatformInfo {
  name: string; // e.g., "SillyTavern"
  version: string; // e.g., "1.11.0"
  features: string[]; // e.g., ["GroupChat", "WorldInfo"]
}

window.platformAndInformation = function(): PlatformInfo {
  // ... platform-specific implementation
};
```

## 4. API 规范草案

`CharacterAPI` 将被设计为一个全局可访问的对象，其下根据功能划分模块。

### 4.1 状态管理 (`CharacterAPI.state`)

这是最核心的模块，负责角色卡数据的持久化和读取。它将取代 `getVariables`, `safeInsertOrAssignVariables` 等具体实现。

**函数签名:**

```typescript
interface StateManager {
  /**
   * 获取指定作用域的变量值
   * @param key - 变量的键名
   * @param scope - 作用域 (默认为 'character')
   */
  get<T>(key: string, scope?: 'character' | 'chat' | 'global'): Promise<T | null>;

  /**
   * 设置指定作用域的变量值
   * @param key - 变量的键名
   * @param value - 要设置的值
   * @param scope - 作用域 (默认为 'character')
   */
  set<T>(key: string, value: T, scope?: 'character' | 'chat' | 'global'): Promise<void>;

  /**
   * 深度合并对象到指定作用域的变量中
   * @param updates - 要合并的更新对象
   * @param scope - 作用域 (默认为 'chat')
   */
  update<T extends object>(updates: T, scope?: 'character' | 'chat' | 'global'): Promise<void>;
}
```

**示例:**

```typescript
// 读取角色好感度
const favor = await CharacterAPI.state.get('favor');

// 更新主角的背包
await CharacterAPI.state.update({
  inventory: { items: [ { id: 'potion', count: 5 } ] }
}, 'character');
```

### 4.2 事件系统 (`CharacterAPI.events`)

提供一个标准化的事件总线，用于响应平台事件和进行模块间通信。

**函数签名:**

```typescript
interface EventManager {
  /**
   * 监听一个标准事件
   * @param eventName - 标准事件名
   * @param callback - 回调函数
   * @returns 一个可以用来取消监听的函数
   */
  on(eventName: 'message:sent' | 'message:received' | 'state:changed', callback: (payload: any) => void): () => void;

  /**
   * 派发一个自定义事件
   * @param eventName - 自定义事件名
   * @param detail - 事件负载
   */
  emit(eventName: string, detail: any): void;
}
```

### 4.3 对话历史 (`CharacterAPI.chat`)

提供对当前对话上下文的访问和操作能力。

**函数签名:**

```typescript
interface ChatManager {
  /**
   * 获取纯净的对话历史记录
   * @param options - 可选的过滤和格式化选项
   */
  getHistory(options?: { count?: number; format?: 'text' | 'json' }): Promise<any>;

  /**
   * 向对话历史中插入一条消息
   * @param message - 消息对象
   * @param position - 插入位置 (e.g., 'last', 'first')
   */
  addMessage(message: object, position?: string): Promise<void>;
}
```

### 4.4 AI 生成 (`CharacterAPI.generation`)

封装 AI 文本生成请求，屏蔽不同平台的实现细节。

**函数签名:**

```typescript
interface GenerationManager {
  /**
   * 使用平台当前启用的预设，请求一次文本生成
   * @param prompt - 用户输入或引导AI回复的文本
   * @param options - 可选配置，如流式传输
   */
  generateWithPreset(prompt: string, options?: { stream?: boolean; generation_id?: string }): Promise<string>;

  /**
   * 完全自定义提示词，请求一次文本生成 (高级)
   * @param ordered_prompts - 一个定义了提示词顺序和内容的对象数组
   * @param options - 可选配置
   */
  generateRaw(ordered_prompts: object[], options?: { stream?: boolean; generation_id?: string }): Promise<string>;

  /**
   * 停止所有正在进行的生成任务
   */
  stop(): Promise<void>;
}
```

### 4.5 UI 交互 (`CharacterAPI.ui`)

提供一组与平台 UI 交互的标准方法。

**函数签名:**

```typescript
interface UIManager {
  /**
   * 显示一条通知消息
   * @param message - 消息内容
   * @param type - 消息类型
   */
  notify(message: string, type: 'info' | 'success' | 'warning' | 'error'): Promise<void>;
}
```

### 4.6 运行时与后端交互 (`CharacterAPI.runtime`)

提供与平台后端或运行时环境交互的高级功能。

**函数签名:**

```typescript
interface RuntimeManager {
  /**
   * 请求平台后端执行一段指定的代码 (如JS片段)
   * @param code - 要执行的代码字符串
   * @param context - 代码执行时可以访问的上下文对象
   * @returns 代码的执行结果
   */
  executeCode<T>(code: string, context?: object): Promise<T>;

  /**
   * 获取经过平台处理（如注入世界信息、角色设定等）后的最终提示词
   * @param prompt - 原始输入
   * @returns 完整的、即将发送给LLM的提示词字符串
   */
  getFinalPrompt(prompt: string): Promise<string>;
}
```

## 5. 开放性问题

*   **API 版本控制**: `CharacterAPI` 自身如何进行版本管理？
*   **复杂数据结构**: 如何标准化处理类似“世界信息”（World Info）这类复杂数据？
*   **权限管理**: 角色卡脚本能访问的 API 是否应该受到限制？

---

## 6. 实现与使用示例

为了更具体地说明本提案的工作方式，以下提供一个简化的代码实现和使用案例。

### 6.1 核心库 (`CharacterAPI.js`) 概念

这是 `CharacterAPI` 库的核心逻辑。它在初始化时检测平台，并加载相应的适配器。

```javascript
// --- CharacterAPI.js ---

// 存储所有平台适配器
const adapters = {};

// 核心 API 对象
const CharacterAPI = {
  state: {},
  events: {},
  generation: {},
  ui: {},

  // 注册适配器的方法
  registerAdapter(platformName, adapter) {
    adapters[platformName] = adapter;
  },

  // 初始化
  async init() {
    if (typeof window.platformAndInformation !== 'function') {
      console.error('CharacterAPI Error: Platform identification function not found.');
      return;
    }

    const platform = window.platformAndInformation();
    const adapter = adapters[platform.name];

    if (!adapter) {
      console.error(`CharacterAPI Error: Adapter for ${platform.name} not found.`);
      return;
    }

    // 使用适配器来填充 API 的具体实现
    this.state = adapter.state;
    this.events = adapter.events;
    this.generation = adapter.generation;
    this.ui = adapter.ui;

    console.log(`CharacterAPI initialized for ${platform.name} v${platform.version}.`);
  }
};

// 暴露到全局
window.CharacterAPI = CharacterAPI;
```

### 6.2 平台适配器 (`sillytavern-adapter.js`) 示例

每个平台都需要一个适配器，将 `CharacterAPI` 的标准调用“翻译”成平台自身的函数。

```javascript
// --- sillytavern-adapter.js ---

// 假设这是 SillyTavern 提供的原生 API
const SillyTavernAPI = {
  getVariable: (scope, key) => getVariables({type: scope})[key],
  updateVariable: (scope, data) => safeInsertOrAssignVariables(data, {type: scope}),
  generate: (text) => generate(text),
  sendSystemMessage: (msg) => কই('chat', msg, 'info'),
};

const sillyTavernAdapter = {
  state: {
    get: async (key, scope = 'character') => {
      return SillyTavernAPI.getVariable(scope, key);
    },
    update: async (updates, scope = 'chat') => {
      return SillyTavernAPI.updateVariable(scope, updates);
    },
    // set 方法的实现...
  },
  generation: {
    generate: async (userInput) => {
      return SillyTavernAPI.generate(userInput);
    }
  },
  ui: {
    notify: async (message, type) => {
      // SillyTavern 的通知可能没有类型，这里做个简化
      return SillyTavernAPI.sendSystemMessage(`[${type.toUpperCase()}] ${message}`);
    }
  },
  // events 的实现...
};

// 向核心库注册自己
CharacterAPI.registerAdapter('SillyTavern', sillyTavernAdapter);
```

### 6.3 角色卡中的使用示例

角色卡开发者只需引入这两个 JS 文件，然后就可以直接使用 `CharacterAPI`。

```html
<!-- my-character-card.html -->
<script src="CharacterAPI.js"></script>
<script src="sillytavern-adapter.js"></script>
<!-- 如果有其他平台的适配器，也在这里引入 -->

<script>
  // 角色卡业务逻辑
  (async function() {
    // 1. 初始化 API
    await CharacterAPI.init();

    // 2. 像调用标准库一样使用
    try {
      const favor = await CharacterAPI.state.get('favor');
      console.log('Current favor:', favor);

      if (favor < 10) {
        await CharacterAPI.ui.notify('好感度不足，无法触发特殊事件。', 'warning');
      }

    } catch (error) {
      console.error('My Card Error:', error);
    }
  })();
</script>
```
