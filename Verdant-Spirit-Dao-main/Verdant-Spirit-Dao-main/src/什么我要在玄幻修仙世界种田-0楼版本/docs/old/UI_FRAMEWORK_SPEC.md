# UI 框架设计规范：Vue 3 & Pinia

## 1. 概述

本文档旨在确立《什么？我要在玄幻修仙世界种田？》项目前端开发的官方 UI 框架为 **Vue 3**，并引入 **Pinia** 作为首选的状态管理方案。

此规范旨在取代旧有的、基于 jQuery 的命令式 DOM 操作模式，转向一种更现代化、更高效的声明式、数据驱动的开发范式。所有**新开发**的前端界面都必须遵守此规范。

---

## 2. 为什么选择 Vue & Pinia？

选择 Vue 和 Pinia 是基于项目核心设计理念的战略决策，旨在提升开发效率、代码质量和长期可维护性。

* **高度契合数据驱动思想**:
  * 项目架构的核心是“单一事实来源”，即所有 UI 展示都必须由**聊天变量** (`聊天变量`) 驱动 (`RENDERING_SPEC.md`)。
  * Vue 的核心特性是**数据驱动视图**，它能自动将 JavaScript 中的状态变化精确地映射到 DOM 更新上。这与项目理念完美契合，让开发者能专注于业务逻辑（操作变量），而非繁琐的 DOM 操作。

* **声明式渲染**:
  * **jQuery (旧)**: `$('#player-health').text(player.health);` (需要手动选择元素并更新)
  * **Vue (新)**: `<p>{{ player.health }}</p>` (视图与数据自动绑定，只需更新 `player.health` 即可)
  * 这种声明式的方式极大地简化了代码，减少了因忘记更新 UI 或选择器错误而导致的 bug。

* **组件化开发**:
  * Vue 的单文件组件 (`.vue`) 允许我们将 UI 拆分为独立的、可复用的模块。例如，“庇护所”的每个建筑、“山河绘卷”的每个地点，都可以封装成一个独立的组件，包含各自的模板、逻辑和样式，极大地提高了代码的组织性和复用性。

* **类型安全的状态管理 (Pinia)**:
  * 直接操作庞大而深套的 `聊天变量` 对象容易出错且难以追踪。
  * Pinia 提供了集中式的、类型安全的状态管理容器 (Store)。我们可以将 `聊天变量` 的不同部分（如 `角色`、`世界`）映射到不同的 Store 中，通过定义好的 `actions` 和 `getters` 来规范数据的读取和修改，使得状态变更可预测、可调试。

---

## 3. 核心实践

### 3.1. 初始化 Vue 应用

项目的加载机制依赖 jQuery 的 `$(() => {})` 来确保 DOM 完全加载。我们的 Vue 应用应该在此回调中被初始化和挂载。

**`index.ts` (入口文件):**

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue'; // 根组件

// 确保在 DOM 加载完毕后执行
$(() => {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia); // 注册 Pinia 插件
  app.mount('#app'); // 挂载到 HTML 中的 <div id="app"></div>
});
```

### 3.2. 使用 Pinia 管理状态

Pinia 是连接**酒馆聊天变量**和**Vue 组件**的核心桥梁。

1. **定义 Store**: 在 `stores` 目录下为 `聊天变量` 的主要模块创建独立的 Store 文件。
2. **同步状态**: Store 的核心职责是从 `getVariables()` 初始化其状态，并提供 `actions` 来调用 `updateVariablesWith()` 或 `replaceVariables()` 将变更写回酒馆。

**示例: `stores/characterStore.ts`**

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { z } from 'zod'; // 使用 Zod 进行数据校验

// 假设这是从 VARIABLES_SPEC.md 定义的 Zod Schema
const CharacterSchema = z.object({
  name: z.string(),
  health: z.number(),
  // ... 其他角色属性
});

type Character = z.infer<typeof CharacterSchema>;

export const useCharacterStore = defineStore('character', () => {
  // State
  const character = ref<Character | null>(null);

  // Actions
  /**
   * 从酒馆变量中加载角色数据，并进行类型校验
   */
  async function fetchCharacterData() {
    const vars = await getVariables({ type: 'chat' });
    const parsed = CharacterSchema.safeParse(_.get(vars, '角色'));
    if (parsed.success) {
      character.value = parsed.data;
    } else {
      console.error('角色数据校验失败:', parsed.error);
      // 在此可以添加错误处理或默认值逻辑
    }
  }

  /**
   * 更新角色生命值并同步到酒馆变量
   * @param newHealth 新的生命值
   */
  async function updateHealth(newHealth: number) {
    if (character.value) {
      character.value.health = newHealth;
      // 使用 updateVariablesWith 来精确更新，避免覆盖其他属性
      await updateVariablesWith({
        type: 'chat',
        value: { '角色.health': newHealth },
      });
    }
  }

  return {
    character,
    fetchCharacterData,
    updateHealth,
  };
});
```

### 3.3. 在 Vue 组件中使用 Store

在组件的 `<script setup>` 中，可以直接导入并使用 Store。

**示例: `components/CharacterStatus.vue`**

```vue
<template>
  <div v-if="store.character">
    <h1>{{ store.character.name }}</h1>
    <p>生命值: {{ store.character.health }}</p>
    <button @click="takeDamage">受到伤害</button>
  </div>
  <div v-else>
    正在加载角色数据...
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useCharacterStore } from '../stores/characterStore';

const store = useCharacterStore();

// 在组件挂载时，从酒馆加载初始数据
onMounted(() => {
  store.fetchCharacterData();
});

function takeDamage() {
  if (store.character) {
    store.updateHealth(store.character.health - 10);
  }
}
</script>
```

---

## 4. 迁移总结

项目已成功从基于 jQuery 的命令式 DOM 操作模式，全面转向基于 Vue 3 和 Pinia 的现代化声明式架构。所有核心 UI 组件均已完成重构。

* **已完成的迁移**:
        ***调试控制台 (`Debug Modal`)**: 作为迁移的试点项目，调试控制台已完全重构为Vue组件，其**唤起和状态管理**也已从旧有的 JQuery 模式迁移至 Pinia store，实现了完全的 Vue 生态整合。其实现（位于 `src/components/debug/` 和 `src/stores/debugStore.ts`）可作为后续迁移工作的参考范例。
        * **行动面板 (`Action Panel`)**: 玩家进行主要操作的UI界面。已迁移至 `ActionPanel.vue` 组件，并由 `actionStore.ts` 驱动。
        ***图鉴面板 (`Pokedex Panel`)**: 侧边栏的图鉴、草药学、书籍、物品等列表。已迁移至 `components/pokedex/` 目录下的 Vue 组件。
        * **详情模态框 (`Details Modal`)**: 用于显示图鉴等条目详情的模态框。已迁移至 `components/modals/DetailsModal.vue`。注意：由于目前 JQuery 与 Vue3 共存的过渡性问题，其 `hidden` 属性被暂时写死，而非由 store 动态管理。
        ***世界信息面板 (`World Tab`)**: 侧边栏的世界标签页，包括时间、地点、天气和庇护所信息。已迁移至 `components/world/` 目录下的 Vue 组件，并由 `worldStore.ts` 驱动。
        * **队伍面板 (`Team Tab`)**: 侧边栏的角色信息标签页。已迁移至 `components/team/` 目录下的 Vue 组件，并由 `teamStore.ts` 驱动。
        ***任务系统 (`Quest System`)**: 侧边栏的系统标签页中的任务面板。已迁移至 `components/system/` 目录下的 Vue 组件，并由 `questStore.ts` 驱动。
        * **签到系统 (`Sign-In System`)**: 侧边栏的系统标签页中的签到面板。已迁移至 `components/system/SignInPanel.vue` 组件，并由 `signInStore.ts` 驱动。
        ***以物换物系统 (`Barter System`)**: 侧边栏的系统标签页中的交易面板。已迁移至 `components/system/BarterPanel.vue` 组件，并由 `barterStore.ts` 驱动。
        * **成就系统 (`Achievement System`)**: 侧边栏的系统标签页中的成就面板。已迁移至 `components/system/AchievementPanel.vue` 组件，并由 `achievementStore.ts` 驱动。
        ***技能系统 (`Skill System`)**: 侧边栏的系统标签页中的技能面板。已迁移至 `components/system/SkillPanel.vue` 组件，并由 `skillStore.ts` 驱动。
        * **上下文设置模态框 (`Settings Modal`)**: 用于管理上下文长度、摘要和流式响应的设置弹窗。已迁移至 `components/modals/SettingsModal.vue` 组件，并由 `settingsStore.ts` 驱动。
        ***故事面板 (`Story Panel`)**: 游戏的核心叙事窗口，包括情节展示、编辑功能和滑动（Swipe）控制。已迁移至 `components/story/StoryPanel.vue` 组件，并由 `storyStore.ts` 驱动。
        * **侧边栏 (`Side Panel`)**: 整个右侧信息面板。已迁移至 `components/sidepanel/SidePanel.vue` 组件，并由 `sidePanelStore.ts` 驱动。其子标签页（如 `TeamTab`, `WorldTab` 等）现在被动态加载。作为此迁移的一部分，`SystemTab.vue` 中的旧版 jQuery 事件监听器 (`$(document).on(...)`) 已被移除，并替换为推荐的、类型安全的 `messageBus` 机制，以响应 `variablesSynced` 事件。
        ***关系面板 (`Relations Tab`)**: 侧边栏的人物关系标签页。已迁移至 `components/team/RelationsTab.vue` 组件，并由 `relationsStore.ts` 驱动。由于 `cytoscape.js` 库在 iframe 中存在兼容性问题，原有的网络图可视化方案已被废弃，改为使用更稳定、清晰的卡片式列表来展示各角色的关系数据。
        * **菜单模态框 (`Menu Modal`)**: 游戏中的主菜单弹窗，提供存档、读档和返回主菜单的功能。已迁移至 `components/modals/MenuModal.vue` 组件，并由 `menuStore.ts` 驱动。
        ***图鉴管理模态框 (`Pokedex Manager Modal`)**: 用于查看、编辑、添加和同步图鉴条目的复杂模态框。已迁移至 `components/modals/PokedexManagerModal.vue`，并由 `pokedexStore.ts` 驱动。其子组件包括 `PokedexViewList.vue`、`AddEntryForm.vue` 和 `RemoteSyncModal.vue`。
        * **顶部全局控制栏 (`Top Bar`)**: 位于游戏界面顶部的全局控制栏，包含菜单、图鉴、主题切换等按钮。已迁移至 `components/TopBar.vue` 组件，其事件处理完全由 Pinia stores 驱动。
        ***开局设定界面 (`Setup Screen`)**: 用于玩家自定义游戏开局选项的全屏界面。已从旧有的 `SetupModule` (基于jQuery) 完全迁移至 `components/setup/SetupScreen.vue` 组件，并由 `setupStore.ts` 驱动。
        * **版本更新模态框 (`Version Modal`)**: 用于显示版本信息、更新日志和执行更新的弹窗。已迁移至 `components/modals/VersionModal.vue` 组件，并由 `versionStore.ts` 驱动。
        * **主菜单 (`Main Menu`)**: 游戏启动时的初始界面，包括开始游戏、设定概览和关于页面。已从旧有的 jQuery DOM 操作完全迁移至 `components/MainMenu.vue` 组件，并由 `mainMenuStore.ts` 驱动，实现了完整的响应式控制和更流畅的过渡动画。
  * **近期修复**:
    * **UI 布局与样式修复**: 对主游戏界面和模态框进行了一系列样式修复与统一。具体包括：
      * **统一模态框样式**: 为所有 Vue 模态框（如详情、设置、菜单等）建立了一套通用的 SCSS 样式，包括遮罩、内容面板、标题、脚部等，确保了视觉一致性。
      * **优化主界面布局**: 调整了桌面端的主界面布局，移除了可拖拽的 resizer，为左右面板添加了边距，并设置了固定的顶部内边距以适配顶栏。
      * **修复滚动问题**: 解决了 Flexbox 布局下 `overflow` 不生效的问题。通过将 `.panel-box` 容器设置为 flex 列布局，并为 `.panel-body` 和 `#left-panel` 添加 `min-height: 0`，成功修复了行动选项列表和左侧主面板在内容溢出时无法滚动的问题。
    * **新游戏流程**: 修复了开始新游戏时，`StoryPanel.vue` 无法正确加载创世消息的 bug。根本原因是 `startGame` 函数的逻辑顺序错误，以及在开始新游戏时未能正确清理旧的聊天记录变量。现已通过在 `index.ts` 中优先调用 `clearAllChatVariables` 来确保每次新游戏都在一个干净的状态下开始，从而解决了此问题。
  * **已知问题**:
    * **`BarterPanel` 渲染问题**: 在迁移“以物换物”面板时，遇到了一个棘手的渲染问题。尽管 Pinia store (`barterStore.ts`) 中的计算属性 (`myOfferValue`) 在日志中显示计算结果正确（例如 `180`），但 Vue 组件的模板有时会将其渲染为 `NaN`。这可能是一个深层的响应式更新问题，需要进一步的调查。

---

## 5. 现有前端架构分析(0楼版本)

为了更好地进行重构，以下是对当前基于 jQuery 的前端架构的总结分析。

### 5.1. 文件结构与作用

| 文件路径                 | 作用                                                                                                                                                       | HTML 结构                                                                                                   | CSS 样式                                                                                                                       |
| :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `index.html`             | **应用骨架**：定义所有UI元素的静态结构，包括主菜单、游戏主界面、开局设定及各种模态框。                                                                     | 单页应用结构，所有界面和面板都预先定义好，通过唯一的 `id` 标识。UI的显示/隐藏依赖于 `hidden` class 的切换。 | 完全基于 **TailwindCSS** 的功能类。通过 CDN 引入 Font Awesome 和 TailwindCSS，无本地 CSS 文件链接。                            |
| `index.scss`             | **样式核心**：定义全局样式、主题系统、组件自定义外观和UI状态的视觉表现。                                                                                   | -                                                                                                           | 基于 CSS 变量的强大**主题系统**（夜间、白天、翠玉、古典）。包含大量针对特定 `id` 和 `class` 的组件样式，与 HTML 结构紧密耦合。 |
| `index.ts`               | **应用大脑**：负责初始化所有核心模块、处理UI路由（界面切换）、绑定全局事件监听器、集成各UI模块，并管理AI生成的生命周期。                                   | -                                                                                                           | -                                                                                                                              |
| `core/renderer.ts`       | **渲染引擎**：`StoryRenderer` 类是所有UI更新的**唯一入口**。负责从聊天变量读取数据，然后通过 `innerHTML` 将数据手动渲染成 HTML 并注入 DOM。                | -                                                                                                           | -                                                                                                                              |
| `core/ui.ts`             | **UI工具库**：包含独立的UI辅助函数，如更新 Swipe 控制器状态、切换 Swipe 页面、显示/隐藏模态框等。                                                          | -                                                                                                           | -                                                                                                                              |
| `ui/eventHandlers.ts`    | **事件处理中心**：使用 jQuery 的事件委托模式，监听整个应用的用户交互（主要是点击事件），并调用核心逻辑函数作为响应。                                       | -                                                                                                           | -                                                                                                                              |
| `ui/globalControls.ts`   | **全局控件逻辑**：初始化页面右上角的全局控件，主要是主题切换器的功能。                                                                                     | -                                                                                                           | -                                                                                                                              |
| `ui/sidePanel.ts`        | **侧边栏逻辑**：初始化右侧信息面板的标签页切换功能。                                                                                                       | -                                                                                                           | -                                                                                                                              |
| `ui/globalControls.ts`   | **全局控件逻辑**：初始化页面右上角的全局控件，主要是主题切换器的功能。                                                                                     | -                                                                                                           | -                                                                                                                              |
| `ui/sidePanel.ts`        | **侧边栏逻辑**：初始化右侧信息面板的标签页切换功能。                                                                                                       | -                                                                                                           | -                                                                                                                              |
| `ui/modals/*.ts`         | **模态框初始化器**：每个文件负责一个特定的模态框，包含其事件绑定和与核心逻辑的连接代码。随着项目向 Vue 迁移，这些文件正逐步被废弃，其功能被整合到主 Vue 应用中（例如，`debug.ts` 已被移除）。 | -                                                                                                           | -                                                                                                                              |
| `core/actions.ts`        | **玩家动作处理器**：定义了 `triggerAction` 和 `generateAnotherSwipe`，是连接用户意图和游戏逻辑流程的桥梁。                                                 | -                                                                                                           | -                                                                                                                              |
| `core/eventManager.ts`   | **事件驱动核心**：负责注册、处理和协调所有由 AI 生成的事件，通过事件溯源模式来更新游戏状态。                                                               | -                                                                                                           | -                                                                                                                              |
| `core/generation.ts`     | **AI 通信适配器**：封装了与酒馆底层 AI 生成功能对接的逻辑，负责发送最终的生成请求。                                                                        | -                                                                                                           | -                                                                                                                              |
| `core/history.ts`        | **聊天历史管理器**：负责加载、保存、修改和查询聊天记录，是实现存档、分支和 Swipe 功能的基石。                                                              | -                                                                                                           | -                                                                                                                              |
| `core/logger.ts`         | **日志系统**：提供一个全局的、可配置的日志记录器，用于开发和调试。                                                                                         | -                                                                                                           | -                                                                                                                              |
| `core/messageBus.ts`     | **类型安全消息总线**：提供一个类型安全的发布/订阅系统，用于模块间的内部通信。                                                                              | -                                                                                                           | -                                                                                                                              |
| `core/module.ts`         | **模块接口定义**：定义了 `IGameModule` 接口，作为所有可插拔模块（如开局设定）必须遵守的契约。                                                              | -                                                                                                           | -                                                                                                                              |
| `core/parser.ts`         | **文本解析器**：负责从 AI 返回的原始消息中提取 `<statusbar>` 内的 JSON 数据和纯叙事文本。                                                                  | -                                                                                                           | -                                                                                                                              |
| `core/pokedex.ts`        | **图鉴数据管理器**：管理游戏世界中所有静态条目（妖兽、物品等）的数据，并处理价值计算和远程同步。                                                           | -                                                                                                           | -                                                                                                                              |
| `core/promptManager.ts`  | **提示词工程师**：根据当前游戏状态动态构建发送给 AI 的系统提示词，是 AI 交互的核心。                                                                       | -                                                                                                           | -                                                                                                                              |
| `core/regexProcessor.ts` | **文本后处理器**：负责调用酒馆内置的正则表达式功能，对 AI 返回的文本进行最终的格式化。                                                                     | -                                                                                                           | -                                                                                                                              |
| `core/state.ts`          | **前端全局状态**：管理与 UI 交互流程相关的临时状态（如 AI 是否生成中、当前 Swipes 等），但并非响应式。                                                     | -                                                                                                           | -                                                                                                                              |
| `core/summarizer.ts`     | **历史摘要器**：负责在后台自动调用 AI 对长对话进行总结，以控制上下文长度。                                                                                 | -                                                                                                           | -                                                                                                                              |
| `core/systems.ts`        | **游戏系统渲染器**：包含了渲染各个独立游戏系统（如成就、任务、技能）UI 的函数集合，严重依赖 HTML 字符串拼接。                                              | -                                                                                                           | -                                                                                                                              |
| `core/time.ts`           | **时间工具库**：处理游戏内时间的计算和解析。                                                                                                               | -                                                                                                           | -                                                                                                                              |
| `core/update-script.ts`  | **自动更新脚本**：处理从远程仓库下载并更新游戏脚本（正则、世界书）的逻辑。                                                                                 | -                                                                                                           | -                                                                                                                              |
| `core/variables.ts`      | **状态管理核心**：负责与酒馆变量系统进行底层交互，并提供了事件溯源、状态计算和同步的关键逻辑。                                                             | -                                                                                                           | -                                                                                                                              |
| `core/version.ts`        | **版本检查与更新**：负责从远程仓库检查新版本、获取更新日志，并触发自动更新流程。                                                                           | -                                                                                                           | -                                                                                                                              |

### 5.2. 核心设计模式与重构要点

* **模式**: **命令式 DOM 操作**
  * **现状**: 代码的核心模式是 `$('selector').show()`, `$('selector').html(...)`, `$('selector').on('click', ...)`。逻辑分散在 `index.ts` (初始化), `renderer.ts` (渲染), 和 `eventHandlers.ts` (交互) 中。
  * **重构指导**: 这是重构的主要目标。需要将这些分散的逻辑，按照功能和UI区域，整合到对应的 **Vue 组件**中。例如，`#side-panel` 的所有渲染和交互逻辑，都应该被封装到一个 `SidePanel.vue` 组件里。

* **模式**: **ID 依赖**
  * **现状**: 整个应用严重依赖 HTML 元素上唯一的 `id` 属性作为选择器。这使得组件难以复用，且 HTML 结构与 JS 代码紧密耦合。
  * **重构指导**: 在 Vue 组件中，应使用 `ref` 来获取对特定 DOM 元素的引用，而不是依赖全局 `id`。组件的范围化 CSS (`<style scoped>`) 可以避免样式冲突。

* **模式**: **HTML 字符串拼接**
  * **现状**: `renderer.ts` 中大量使用字符串拼接来动态生成 HTML 卡片和列表。这种方式难以维护，且有潜在的 XSS 风险。
  * **重构指导**: 将这些 HTML 字符串转换为 **Vue 模板**。使用 `v-for` 循环生成列表，使用 `{{ }}` 插值绑定数据，使用 `:class` 和 `:style` 进行动态样式绑定。例如，`createCharacterCard` 函数应被重构为一个 `CharacterCard.vue` 组件。

* **模式**: **单一事实来源 (做得好的地方)**
  * **现状**: 尽管实现方式陈旧，但架构严格遵循了“所有UI渲染都必须由聊天变量驱动”的核心原则。`renderer.ts` 总是从 `getVariables()` 获取最新状态。
  * **重构指导**: 这是迁移的**最大优势**。我们可以直接将这个原则平移到 Pinia。为聊天变量的不同部分（如 `角色`, `世界`）创建对应的 **Pinia store**。Store 的初始状态从 `getVariables()` 加载，组件则从 Store 中读取数据并渲染视图。用户的操作通过调用 Store 的 `actions` 来更新状态，并最终通过 `updateVariablesWith()` 写回酒馆。

通过遵循此规范，我们可以构建一个更加健壮、可维护和易于扩展的前端系统，完美支撑《什么？我要在玄幻修仙世界种田？》日益复杂的玩法和交互。
