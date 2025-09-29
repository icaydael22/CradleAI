# Vue + Pinia 项目集成测试方法论

本文档基于对 `src/什么我要在玄幻修仙世界种田-0楼版本/测试/final/questFinal.integration.test.ts` 的分析，总结了一套健壮、可维护的端到端（End-to-End）集成测试方法论，旨在为未来的集成测试提供清晰的指导和最佳实践。

## 核心思想

集成测试的目标是在一个受控的环境中，最大程度地模拟真实的用户流程，从而同时验证“后端”状态逻辑（Pinia Stores）和“前端”UI表现（Vue Components）的正确性与协同工作的能力。

---

## 关键方法论

### 1. 统一且持久化的测试环境

为了模拟应用的真实运行环境并提高测试效率，我们应该在整个测试文件中共享一个统一的状态管理实例。

-   **单一Pinia实例**: 在所有测试开始前（`beforeAll`），通过 `createTestingPinia()` 创建一个共享的Pinia实例。这确保了所有Store和组件都连接到同一个状态管理中心。
-   **共享Store实例**: 所有的mock stores都在 `beforeAll` 中初始化一次。这保证了测试用例之间的状态是连续的，对于模拟多回合的复杂流程至关重要。

**代码样例:**
```typescript
// in your xxx.integration.test.ts
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { beforeAll, describe } from 'vitest';
import { useWorldStore, useCharacterStore } from '../__mocks__/stores';

describe('集成测试套件', () => {
  let pinia;
  let worldStore;
  let characterStore;

  beforeAll(() => {
    // 创建一个在所有测试中共享的 pinia 实例
    pinia = createTestingPinia({ stubActions: false });
    setActivePinia(pinia);

    // 所有 store 都从同一个 pinia 实例中获取
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
    // ... 其他 stores
  });

  // ... 测试用例
});
```

### 2. 策略性、最小化的Mock

测试的健壮性来源于其真实性。因此，我们应尽可能少地使用mock，只mock那些必要的外部依赖。

-   **不Mock核心逻辑**: 永远不要mock被测试的核心业务逻辑。例如，状态更新、数据计算等函数应该使用真实实现，否则测试就失去了意义。
-   **Mock外部依赖**: 只mock那些会产生副作用（如文件读写、API请求）或依赖外部环境的模块。

**代码样例:**
```typescript
// Mock 那些与外部系统交互的模块
vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    // Mock 掉文件系统操作
    saveStateSnapshot: vi.fn().mockResolvedValue(undefined),
    // Mock 掉与Tavern插件的交互
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
  };
});
```

### 3. 通过Props为组件注入Mock Store（关键技巧）

这是实现组件级别状态精准控制的核心技巧，极大地提高了组件测试的灵活性和隔离性。

-   **问题**: 如何在不污染全局Store状态的情况下，测试一个组件在特定数据下的UI表现？
-   **解决方案**: 为组件添加一个可选的、仅用于测试的prop（例如 `testStore`）。在组件内部，优先使用这个prop；如果prop不存在（生产环境），则回退到从Pinia获取。

**代码样例:**

**组件内部 (`QuestTab.vue` - 伪代码):**
```typescript
import { useQuestStore } from '@/stores/systems/questStore';

const props = defineProps({
  testQuestStore: {
    type: Object,
    required: false,
  }
});

// 如果 testQuestStore prop 存在，则使用它；否则，使用全局 store
const questStore = props.testQuestStore || useQuestStore();

const ongoingQuests = computed(() => questStore.ongoingQuests);
```

**测试代码中 (`QuestTab.test.ts`):**
```typescript
import { mount } from '@vue/test-utils';
import QuestTab from '../../components/system/QuestTab.vue';

it('应该只显示进行中的任务', () => {
  const questWrapper = mount(QuestTab, {
    global: {
      plugins: [pinia], // 确保组件能访问全局依赖
    },
    props: {
      // @ts-ignore
      // 注入一个定制过的 store 对象
      testQuestStore: {
        // 覆盖特定的 getter，为组件提供一个受控的、可预测的数据视图
        ongoingQuests: [
          { id: 'quest1', 名称: '进行中的任务', 状态: '进行中' }
        ],
        completedQuests: [],
        failedQuests: [],
      },
    },
  });

  expect(questWrapper.text()).toContain('进行中的任务');
  expect(questWrapper.text()).not.toContain('已完成的任务');
});
```

### 4. 分阶段、分层次的断言

一个严谨的测试流程应该严格区分“后端”（状态）和“前端”（UI）的验证。

1.  **触发动作**: 模拟一个事件发生（如调用一个核心函数）。
2.  **后端断言**: 立即检查Pinia Stores中的状态是否如预期更新。这是验证业务逻辑的第一步。
3.  **前端断言**: 在后端状态验证通过后，挂载或更新相应的Vue组件，并断言UI是否正确渲染了新的状态。

**代码样例:**
```typescript
// 1. 触发动作
await handlers.onGenerationEnded(response, 'message-id');

// 2. 后端断言：检查 store 的状态
expect(worldStore.world.value.time.timeOfDay).toBe('下午');
expect(characterStore.mainCharacter.value.体力).toBe(90);

// 3. 前端断言：挂载组件并检查 UI
const characterWrapper = mount(CharacterCard, {
  props: { character: characterStore.mainCharacter.value /* ... */ }
});
await characterWrapper.vm.$nextTick(); // 等待DOM更新

expect(characterWrapper.text()).toContain('90 / 100');
const healthBar = characterWrapper.find('.health-bar');
expect(healthBar.attributes('style')).toContain('width: 90%');
```

#### 高级技巧：为最终状态断言创建独立的Pinia实例

在复杂的端到端测试中，状态会经历多轮事件的变更。为了确保前端UI能精确、可靠地反映出最终的后端状态，推荐在前端断言阶段创建一个全新的、一次性的Pinia实例。

-   **问题**: 如何确保组件在挂载时，能获取到经历了多步复杂计算后的最新、最深层的状态，避免潜在的响应式更新延迟问题？
-   **解决方案**: 在执行前端断言前，调用 `createTestingPinia` 并使用 `initialState` 选项，将当前各个 store 的 `.value` 状态快照直接注入。然后，在 `mount` 组件时，将这个全新的 `pinia` 实例传入 `global.plugins`。

**代码样例 (`signInFinal.integration.test.ts`):**
```typescript
// ... 经过多轮后端断言后 ...

// 关键：创建一个包含最终状态的 pinia 实例来挂载组件
const finalPinia = createTestingPinia({
  initialState: {
    // @ts-ignore
    world: { world: worldStore.world.value },
    // @ts-ignore
    character: { characters: characterStore.characters.value },
  },
  stubActions: false,
});

const signInWrapper = mount(SignInPanel, {
  global: { plugins: [finalPinia] }, // 使用这个全新的实例
});
await signInWrapper.vm.$nextTick();

// 现在可以安全地对 signInWrapper 进行断言
expect(signInWrapper.find('[data-testid="calendar-day-13"]').exists()).toBe(true);
```

**与Props注入的对比:**
-   **Props注入**: 更适用于组件的**单元/隔离测试**，用于验证组件在特定、人为构造的输入下的UI表现。
-   **创建新Pinia实例**: 是**端到端集成测试**中验证**最终全局状态**渲染的黄金标准，可靠性最高。

### 5. 端到端的完整流程模拟

最高价值的集成测试是那些能够模拟完整用户核心路径的测试。

-   **阶段划分**: 将复杂的测试流程划分为有意义的阶段（如 `--- 阶段一：创世 ---`），使测试逻辑清晰易懂。
-   **状态连续性**: 后续阶段的测试应建立在之前阶段的状态之上，真实模拟应用状态的演进。
-   **覆盖复杂场景**: 测试应覆盖如“消息切换”（Swipe）、状态回溯等复杂场景，通过保存状态快照、重放不同事件序列来验证其正确性。

---

## 未来集成测试的实施建议

1.  **建立测试基架**: 创建一个类似 `setupIntegrationTest` 的辅助函数，封装通用的mock和环境设置，减少重复代码。
2.  **设计组件时考虑可测试性**: 在开发新组件时，主动添加 `testStore` 这类prop，使其天生易于测试。
3.  **遵循“后端->前端”的断言顺序**: 严格的顺序有助于快速定位问题根源：是业务逻辑错了，还是UI渲染错了？
4.  **优先编写核心流程的端到端用例**: 这些测试能提供最高的业务价值和回归保障。
5.  **利用快照与重放测试复杂逻辑**: 对于有状态回溯、撤销/重做等功能的模块，借鉴 `questFinal.integration.test.ts` 中的状态快照和事件重放模式进行测试。