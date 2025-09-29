# 次级LLM API模块设计规范 (SECONDARY_LLM_API_SPEC.md) v3.1

本文档旨在为“次级LLM API”模块设计详细、可靠的技术实现方案，使其完全融入项目现有的 **Vue 3 + Pinia** 响应式架构，并提供丰富的用户体验增强功能。

## 1. 核心目标与哲学

* **核心目标**: 提供一个标准化的、即插即用的接口，允许游戏内的其他模块通过一个独立的、可配置的次级LLM来完成特定的、非核心叙事的文本生成任务。
* **设计哲学**:
  * **非侵入式**: 严格遵守“即插即用”原则，该模块的存在不应修改或影响主游戏循环 (`CHAT_FLOW_SPEC.md`) 的任何逻辑。
  * **状态分离与集中化**: 为了解决模块间的循环依赖，状态管理被拆分为两个专门的Pinia Store。API档案的核心数据由 `apiProfileStore` 管理，而其他UI相关的设置则由 `settingsStore` 管理。
  * **角色级持久化**: 所有配置（包括API档案）都存储在**角色级 (`character`)** 变量中，确保每个角色都可以有自己独立的设置。
  * **用户体验优先**: 提供多项便利功能，如多档案管理、自动填充、在线模型获取和连接测试，以降低用户的配置难度。
  * **健壮性与可靠性**: 内置主LLM保底机制，确保在次级LLM不可用时，核心功能仍能继续运行。

## 2. 技术方案

### 2.1 状态管理 (State Management)

为了解决循环依赖并实现更清晰的职责分离，次级LLM的状态由两个Store共同管理。

#### 2.1.1 API档案核心 (`stores/app/apiProfileStore.ts`)

这是所有API配置档案的**单一事实来源**。

* **核心数据结构**:
  * `profiles`: 一个 `SecondaryApiProfile` 对象的数组，存储了所有用户创建的配置档案。
  * `activeProfileId`: 一个字符串，用于追踪当前用户选中的是哪个配置档案。
* **职责**:
  * 存储和管理所有API配置档案。
  * 提供 `setProfiles` action 来原子化地更新档案列表和当前激活的ID。

#### 2.1.2 UI与设置 (`stores/ui/settingsStore.ts`)

该Store负责管理除API档案外的所有其他设置，并协调与UI的交互。

* **核心职责**:
  * **持久化**: 在 `fetchSettings` 和 `saveSettings` 中，通过 `getVariables({ type: 'character' })` 和 `insertOrAssignVariables(..., { type: 'character' })` 与**角色级**变量交互，实现配置的读取和存储。它会同时协调 `apiProfileStore` 的数据。
  * **档案管理**: `addProfile` 和 `removeProfile` action 会调用 `apiProfileStore` 来实际修改档案数据。
  * **模型列表获取 (`fetchModelsForProfile`)**:
    * 根据 `apiProfileStore` 中指定档案的 `source` 和 `apiKey`，异步请求服务商API以获取可用模型列表。
    * **智能认证**: 能够自动处理不同服务商的认证方式（如 `Bearer Token` vs. `URL query key`）。
    * **名称规范化**: 会自动处理并清洗返回的模型名称（如移除 `models/` 前缀）。
  * **连接测试 (`testApiProfile`)**:
    * **统一调用入口**: 此函数现在调用 `generateWithSecondaryApi` 来执行测试，确保测试流程与实际调用流程完全一致，共享相同的日志、保底和错误处理逻辑。
    * **循环依赖解决方案**: 最初的循环依赖问题，已通过将状态拆分到 `apiProfileStore` 中得到根本解决。

### 2.2 核心模块 (`core/secondaryLlmApi.ts`)

该模块封装了所有与次级LLM交互的复杂逻辑，并向上层模块暴露一个简洁的函数。**从 v3.1 开始，该函数内部会自动处理事件监听，调用者可以直接 `await` 其返回的 Promise 来获取最终结果，无需再手动监听 `GENERATION_ENDED` 事件。**

* **函数签名与载荷 (Payload)**:

    ```typescript
    // core/secondaryLlmApi.ts

    interface SecondaryLlmPayload {
      method: 'generate' | 'generateRaw';
      config: GenerateConfig | GenerateRawConfig;
      secondaryApiConfig?: SecondaryApiConfigOverride;
      profileId?: string; // 覆盖当前激活的档案ID
      generationId?: string; // (可选) 为本次调用指定一个自定义ID
    }

    async function generateWithSecondaryApi(payload: SecondaryLlmPayload): Promise<string>
    ```

* **核心实现**:
    1. **获取激活的配置**: 从 `apiProfileStore` 中获取当前激活的配置档案 (`activeProfile`)。
    2. **上下文构建**: 根据 `activeProfile` 中的 `useSummary` 和 `useFullContext` 设置，从 `ChatHistoryManager` 中提取正确的上下文（摘要、完整历史或无上下文）。
    3. **请求隔离与事件处理**:
        * **内部事件处理**: `generateWithSecondaryApi` 函数现在是围绕一个内部类 `SecondaryLlmGenerator` 的封装器。这种设计确保了每一次调用都创建一个独立的实例，从而使并发的生成请求之间不会发生事件监听冲突。
        * **自定义ID**: 调用者依然可以通过 `payload.generationId` 传入一个自定义ID。这个ID现在主要用于内部的事件路由，以确保 `Promise` 能被正确的 `GENERATION_ENDED` 事件 `resolve`。
        * **自动ID**: 如果调用时未提供 `generationId`，函数会自动生成一个唯一的ID，以保证事件处理的可靠性。
    4. **保底机制检查**:
        * 在请求前，检查 `generationStore.isAiGenerating` 以确保主LLM空闲。
        * 检查当前 `activeProfile` 是否启用了保底，并从一个模块内的 `Map` (`failureCounts`) 中读取该档案的连续失败次数。
        * 如果满足所有保底条件，则向用户发出 `toastr` 警告，并将请求配置中的 `custom_api` 字段设为 `undefined`，从而将请求无缝切换到主LLM。
    5. **请求执行与重试**:
        * **自动重试**: `generate` 或 `generateRaw` 调用被封装在一个重试循环中，最多尝试3次。
        * **请求成功**: 任何一次尝试成功，都会立即返回结果，并重置 `failureCounts` 中对应档案的失败计数为 `0`。如果本次是保底生成，则额外向用户发出 `toastr` 通知。
        * **请求失败**: 如果一次尝试失败，将等待一小段时间（随尝试次数增加而增加）后再次尝试。
        * **最终失败**: 如果所有3次尝试都失败，将增加 `failureCounts` 的计数，向用户显示一条明确的错误消息（提示检查API Key或网络），并向上抛出最终的错误，以便调用方可以处理。

### 2.3 用户配置界面 (`components/modals/SettingsModal.vue`)

配置界面被实现为“设置”模态框中的一个独立标签页，并提供了丰富的交互功能。

* **UI 结构**:
  * **档案管理**: 顶部是一个下拉菜单，用于在不同的配置档案间切换，旁边配有 `+` 和 `-` 按钮来新增和删除档案。
  * **动态表单**: 下方的表单内容会根据当前选择的档案动态更新。
  * **模型获取与测试**: 在“模型名称”输入框旁，并排提供了“刷新”和“测试”两个功能按钮，并配有加载状态（旋转图标）。
  * **保底配置**: “启用主LLM保底”开关控制着下方“失败次数阈值”数字输入框的显示。

* **核心逻辑 (`<script setup>`)**:
  * **`activeProfile` 计算属性**: 作为连接 `v-model` 和 Pinia store 的桥梁，简化了数据绑定。
  * **URL自动填充**: 使用 `watch` 监听 `activeProfile.source` 的变化。当用户切换API源时，会自动为 `apiUrl` 填充推荐的默认端点URL。
  * **模型列表**: 将模型名称的 `input` 与 `<datalist>` 元素绑定。当 `store.fetchModelsForProfile` 成功后，用户既可以从下拉建议中选择模型，也可以手动输入。

## 3. 使用示例

```typescript
// 在任何需要调用次级LLM的地方
import { generateWithSecondaryApi } from '../../core/secondaryLlmApi';

async function generateDiaryEntry(summary: string) {
  try {
    const diaryPrompt = `请根据以下摘要，以我的口吻写一篇日记：${summary}`;

    // 函数调用方式保持不变，所有复杂逻辑（上下文、保底、事件处理）都在内部完成。
    // 调用方只需 await 其返回的 Promise 即可，无需再自行监听事件。
    const diaryText = await generateWithSecondaryApi({
      method: 'generateRaw',
      config: {
        user_input: diaryPrompt,
        ordered_prompts: [
          { role: 'system', content: '你是一个日记生成助手。' },
          'user_input',
        ],
      }
    });

    console.log('日记生成成功:', diaryText);
  } catch (error) {
    // 错误会被上抛，调用方可以自行处理
    console.error('调用次级LLM或其保底机制失败:', error);
  }
}
```

## 4. 模块职责总结

* **`core/secondaryLlmApi.ts`**: 封装调用次级LLM的全部逻辑，包括上下文构建、保底机制和失败计数，是功能的核心。它依赖 `apiProfileStore` 获取配置。
* **`stores/app/apiProfileStore.ts`**: 作为API配置档案的**单一事实来源**，负责存储和管理所有档案数据。
* **`stores/ui/settingsStore.ts`**: 负责其他相关设置的UI状态管理，并协调 `apiProfileStore` 与**角色级**变量之间的持久化。同时，它提供了获取模型列表和测试连接等面向UI的 `actions`。
* **`components/modals/SettingsModal.vue`**: 提供一个功能丰富的响应式用户配置界面，作为 `settingsStore` 和 `apiProfileStore` 的视图。
* **`stores/app/generationStore.ts`**: 为保底机制提供关于主LLM当前状态的只读信息。
