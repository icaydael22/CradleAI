# 开发者速查文档 (v1.2)

本文档旨在为项目开发者提供一套清晰、统一的核心API使用规范，内容整合自酒馆助手官方文档及本项目设计规范，涵盖**变量操作**与**事件系统**两大核心功能。

## 1. 设计哲学

1. **单一事实来源**: 游戏状态的唯一来源是聊天变量 (`variables`)。
2. **事件驱动**: 模块间通信通过全局事件总线解耦，响应式地处理状态变化。
3. **API封装**: 所有状态变更和模块通信都应通过本项目封装的全局函数进行，以确保数据流的稳定和可追溯性。

---

## 2. 变量操作 (Variables API)

这些函数封装了与不同作用域（全局、聊天、角色、消息、脚本）变量的交互逻辑。

---

## 2.1 获取变量

### `getVariables`

获取指定作用域的完整变量表。这是一个只读操作，返回的是当前变量状态的一个深拷贝。

**函数签名**:

```typescript
function getVariables({ type, message_id, script_id }?: VariableOption): Record<string, any>
```

**参数**:

* `option?` (可选): 一个配置对象。
  * `type?`: `string` - 变量类型，默认为 `'chat'`。可选值: `'global'`, `'character'`, `'chat'`, `'message'`, `'script'`。
  * `message_id?`: `number | 'latest'` - 当 `type` 为 `'message'` 时，指定消息楼层号。
  * `script_id?`: `string` - 当 `type` 为 `'script'` 时，指定脚本ID。

**返回值**:

* `Record<string, any>`: 包含指定作用域所有变量的键值对对象。

**示例**:

```typescript
// 获取所有聊天变量
const chatVars = getVariables();

// 获取角色变量
const characterVars = getVariables({type: 'character'});
```

---

## 2.2 修改/插入变量

### `safeInsertOrAssignVariables` (推荐)

**安全地深度合并**新的变量到现有的变量表中。如果变量已存在，则更新其值；如果不存在，则创建它。**这是最常用且推荐的增量更新方法。**

此函数是原生 `insertOrAssignVariables` 的安全包装器，专门用于解决 Tavern Helper v3.5.1 中对数组行为的破坏性更新，并能正确处理 Vue 的响应式代理对象。

**函数签名**:

```typescript
function safeInsertOrAssignVariables(updates: Record<string, any>, options: any = { type: 'chat' }): Promise<void>
```

**示例**:

```typescript
// 执行前变量: `{角色: {爱城华恋: {好感度: 5}}}`
await safeInsertOrAssignVariables(
  { 角色: { 爱城华恋: { 好感度: 10 }, 神乐光: { 好感度: 5 } } },
  { type: 'character' }
);
// 执行后变量: `{角色: {爱城华恋: {好感度: 10}, 神乐光: {好感度: 5}}}`
```

### `updateVariables`

一个简化的变量更新函数，用于**合并部分更新到聊天变量**。这是 `safeInsertOrAssignVariables` 针对 `type: 'chat'` 的快捷方式。

**函数签名**:

```typescript
function updateVariables(updates: Record<string, any>): Promise<void>
```

### `assignVariables`

一个简化的变量赋值函数，用于**直接替换指定路径的值**。这也是 `safeInsertOrAssignVariables` 的快捷方式，但允许指定作用域。

**函数签名**:

```typescript
function assignVariables(updates: Record<string, any>, options: any = { type: 'chat' }): Promise<void>
```

### `replaceVariables` (谨慎使用)

**完全替换**指定作用域的变量表。这是一个覆盖式操作，通常仅用于加载存档或重置状态等高级场景。

**函数签名**:

```typescript
function replaceVariables(variables: Record<string, any>, { type, message_id }?: VariableOption): Promise<Record<string, any>>
```

---

## 2.3 在提示词中获取变量

你可以在Prompt中直接嵌入变量值，这对于动态生成上下文非常有用。

* **全局变量**: `{{get_global_variable::神乐光.好感度}}`
* **聊天变量**: `{{get_chat_variable::商品.1.内容}}`
* **角色变量**: `{{get_character_variable::爱城华恋.好感度}}`
* **消息楼层变量**: `{{get_message_variable::当前剧情阶段}}`

获取到的结果与 `JSON.stringify(变量)` 的输出一致。

---

## 3. 事件系统 (Event System)

模块间通信是构建响应式系统的基石。本项目提供了一套全新的、类型安全的模块通信总线，并逐步废弃旧有的事件系统。

### 3.1 [推荐] 类型安全消息总线 (`reactiveMessageBus`)

这是**所有新功能开发的首选**通信方式。它由 `core/reactiveMessageBus.ts` 提供，并通过 `events` 对象暴露。

**核心优势**:

* **类型安全**: 杜绝事件名拼写错误和payload结构错误。
* **自动补全**: IDE会自动提示可用的事件名和payload结构。
* **易于维护**: 重构事件时，编译器会标出所有需要修改的地方。

#### 3.1.1 发送事件

通过修改 `events` 对象中对应事件的 `.value` 来派发事件。

```typescript
import { events } from './core/reactiveMessageBus';

const payload = {
    fromDay: 1,
    toDay: 2,
    fromTimeOfDay: '亥时',
    toTimeOfDay: '子时',
};
events.timeChanged.value = { timestamp: Date.now(), payload };
```

#### 3.1.2 监听事件 (`watch`)

使用 Vue 的 `watch` 函数来监听 `events` 对象中对应事件的变化。

```typescript
import { watch } from 'vue';
import { events } from './core/reactiveMessageBus';

export function initializeMyModuleListener() {
  watch(() => events.timeChanged, (event) => {
    if (event) {
      const payload = event.payload;
      if (payload.toDay > payload.fromDay) {
        // 执行每日重置逻辑
      }
    }
  }, { deep: true });
}
```

---

### 3.2 [**禁止使用**] 旧版全局事件总线 (Legacy)

> **[!] 警告**: 以下 `eventOn` 和 `eventEmit` 函数是已废弃的旧版全局事件系统。**严禁在任何新代码中使用这些函数进行模块间通信**。它们的存在仅为兼容极少数尚未迁移的旧模块，并将在未来版本中被彻底移除。

---

## 4. 请求生成 (Generation API)

这些函数封装了请求 AI 生成回复的逻辑，提供了使用预设和完全自定义两种模式。

---

### 4.1 `generate`

使用 Silly Tavern 当前启用的预设，让 AI 生成一段文本。

**函数签名**:

```typescript
function generate(config: GenerateConfig): Promise<string>;
```

**核心参数 (`config`)**:

* `user_input?`: `string` - 用户输入。
* `should_stream?`: `boolean` - 是否启用流式传输 (默认为 `false`)，启用后可监听过程事件。
* `generation_id?`: `string` - 唯一ID。可用于并发生成、通过ID停止特定生成，并在事件中返回。

---

### 4.2 `generateRaw`

不使用预设，完全自定义提示词顺序和内容，让 AI 生成一段文本。

**函数签名**:

```typescript
function generateRaw(config: GenerateConfig): Promise<string>;
```

**核心参数 (`config`)**:

* `ordered_prompts?`: `(BuiltinPrompt | RolePrompt)[]` - 一个定义了提示词顺序和内容的数组。

---

### 4.3 生成过程事件

当 `should_stream: true` 时，可以监听以下事件来跟踪生成过程。所有生成事件现在都会在其载荷中包含 `generation_id`。

* `iframe_events.GENERATION_STARTED`
* `iframe_events.STREAM_TOKEN_RECEIVED_FULLY`
* `iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY`
* `iframe_events.GENERATION_ENDED`
