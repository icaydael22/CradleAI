# Vue 组件单元测试指南

本文档通过分析项目中的多个测试文件 (`ActionPanel.test.ts` 及 `tests/components/system/` 目录下的文件)，总结了一套针对 Vue + Pinia + Vitest 技术栈的组件单元测试最佳实践，从基础到高级。

## 核心技术栈

- **测试运行器**: `Vitest` - 提供了 `describe`, `it`, `expect` 等Jasmine风格的API。
- **组件挂载**: `@vue/test-utils` - 提供了 `mount` 方法来在虚拟DOM中挂载组件。
- **状态管理 (Mock)**: `@pinia/testing` - 提供了 `createTestingPinia` 来轻松地 mock Pinia store。

## 测试文件的标准结构

一个典型的组件测试文件遵循以下结构：

```typescript
// 1. 导入核心库
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';

// 2. 导入待测试组件和其依赖的 store
import MyComponent from 'path/to/MyComponent.vue';
import { useMyStore } from 'path/to/myStore';

// 3. 使用 describe 对组件测试进行分组
describe('MyComponent.vue', () => {

  // 4. (可选) 使用 beforeEach 设置每个测试前的通用环境
  beforeEach(() => {
    // 为 Pinia 创建一个干净的实例，避免测试间的状态污染
    setActivePinia(createPinia());
  });

  // 5. 使用 it/test 编写独立的测试用例
  it('应该正确渲染初始状态', () => {
    // ... 测试逻辑
  });

  it('当用户点击按钮时，应该调用某个方法', async () => {
    // ... 测试逻辑
  });
});
```

## 基础测试套路

### 1. 挂载组件与 Mock Store (基础)

最常见的场景是使用 `createTestingPinia` 来创建一个 mock 的 Pinia 环境。

- **`createSpy: vi.fn`**: (推荐) 这个参数会自动将 store 中的所有 action 和 getter 替换为 Vitest 的 mock function (`vi.fn`)。这使得我们可以追踪 action 是否被调用以及以何种参数被调用，同时完全隔离组件逻辑。

**代码范例**:

```typescript
const wrapper = mount(ActionPanel, {
  global: {
    plugins: [createTestingPinia({ createSpy: vi.fn })],
  },
});

// 挂载后，可以从测试环境中获取 store 实例
const store = useActionStore();
```

### 2. 测试渲染结果

最基础的测试是验证组件是否根据 store 的状态正确渲染其内容。

**流程**:

1. 挂载组件。
2. 获取 store 实例。
3. **修改 store 的 state** (例如 `store.owner = '测试角色'`)。
4. **等待 DOM 更新**: 由于 Vue 的更新是异步的，必须使用 `await wrapper.vm.$nextTick()` 来等待组件重新渲染。
5. **断言渲染结果**: 使用 `expect(wrapper.text()).toContain('...')` 来检查文本内容是否符合预期。

**代码范例**:

```typescript
it('renders the owner name correctly', async () => {
  const wrapper = mount(ActionPanel, { /* ... */ });
  const store = useActionStore();

  store.owner = '测试角色';
  await wrapper.vm.$nextTick(); // 等待更新

  expect(wrapper.text()).toContain('测试角色的行动选项');
});
```

### 3. 测试用户交互

测试的关键在于模拟用户行为，并验证组件或 store 是否作出了正确的响应。

**流程**:

1. 挂载组件并设置好初始状态。
2. 使用 `wrapper.find()` 或 `wrapper.findAll()` 定位到目标元素 (例如按钮、输入框)。
3. 使用 `.trigger()` 方法模拟事件 (例如 `.trigger('click')`, `.trigger('change')`)。
4. **断言结果**:
    - 如果交互调用了 store 的 action，则断言 `expect(store.myAction).toHaveBeenCalled()`。
    - 如果交互改变了组件内部状态或UI，则断言 `wrapper.html()` 或 `wrapper.text()` 的变化。

**代码范例 (点击事件)**:

```typescript
it('calls handleOptionClick when an option is clicked', async () => {
  const wrapper = mount(ActionPanel, { /* ... */ });
  const store = useActionStore();
  store.options = ['点击我'];
  await wrapper.vm.$nextTick();

  await wrapper.find('li').trigger('click'); // 模拟点击

  expect(store.handleOptionClick).toHaveBeenCalledWith('点击我', 0); // 断言 action 被调用
});
```

**代码范例 (输入事件)**:

```typescript
it('shows custom action modal and calls confirm', async () => {
    const wrapper = mount(ActionPanel, { /* ... */ });
    const store = useActionStore();
    store.isCustomActionModalVisible = true;
    await wrapper.vm.$nextTick();

    // 模拟输入
    await wrapper.find('textarea').setValue('自定义的一个动作');
    
    // 找到并点击确认按钮
    const confirmButton = wrapper.findAll('button').find(b => b.text() === '确认行动');
    await confirmButton?.trigger('click');
    
    // 断言 action 被调用
    expect(store.handleCustomActionConfirm).toHaveBeenCalled();
});
```

### 4. 测试组件的响应式

一个重要的测试场景是验证当 store 的状态在组件挂载后发生变化时，组件视图是否能正确地同步更新。这通常用于模拟数据刷新或页面切换的场景。

**流程**:

1. 挂载组件，设置并断言初始状态 (State A)。
2. 再次修改 store 的 state，模拟数据变化 (变为 State B)。
3. `await wrapper.vm.$nextTick()` 等待 DOM 更新。
4. 断言组件的视图现在反映的是 State B。

**代码范例**:

```typescript
it('should update the view when store state changes after a swipe', async () => {
  const wrapper = mount(ActionPanel, { /* ... */ });
  const store = useActionStore();

  // 初始状态 A
  store.owner = '角色A';
  store.options = ['行动A1'];
  await wrapper.vm.$nextTick();
  expect(wrapper.text()).toContain('角色A');

  // 模拟状态变化到 B
  store.owner = '角色B';
  store.options = ['行动B1', '行动B2'];
  await wrapper.vm.$nextTick();

  // 断言视图已更新为状态 B
  expect(wrapper.text()).toContain('角色B');
  expect(wrapper.text()).toContain('行动B1');
});
```

## 高级测试套路

通过分析更复杂的组件，我们发现了一些更强大和灵活的测试技巧。

### 5. 设置复杂的初始状态 (`initialState`)

当组件依赖一个结构复杂的 store (例如，一个深层嵌套的 `world` 对象) 时，在挂载时直接提供一个完整的 `initialState` 会比事后逐一修改 state 更清晰、更高效。

**代码范例 (`AchievementPanel.test.ts`)**:

```typescript
it('renders panel with correct initial data', async () => {
  const wrapper = mount(AchievementPanel, {
    global: {
      plugins: [createTestingPinia({
        initialState: {
          // 直接为 world store 设置初始状态
          world: { world: { 成就: mockAchievementState } },
          // 还可以同时设置其他 store 的状态
          time: { day: 1 },
        },
      })],
    },
  });
  // ... 断言
});
```

### 6. Mock 外部依赖和全局对象

组件的依赖并不总是只有 Pinia store。

- **Mock 其他 Store (`vi.mock`)**: 当组件A依赖StoreA，但同时会调用StoreB的action时（例如，一个通用弹窗Store），我们需要mock StoreB以隔离测试。

  **代码范例 (`AchievementPanel.test.ts`)**:

  ```typescript
  // 在文件顶部 mock 整个 detailsStore 模块
  const mockShowDetails = vi.fn();
  vi.mock('../../../stores/ui/detailsStore', () => ({
    useDetailsStore: () => ({
      showDetails: mockShowDetails,
    }),
  }));

  it('calls detailsStore.showDetails when an achievement is clicked', async () => {
    // ... mount component
    await wrapper.find('li').trigger('click');
    expect(mockShowDetails).toHaveBeenCalledTimes(1); // 断言被mock的函数
  });
  ```

- **Mock 全局对象 (`vi.stubGlobal`)**: 如果组件依赖一个挂载在 `window` 或 `global` 上的对象。

  **代码范例 (`BarterPanel.test.ts`)**:

  ```typescript
  vi.stubGlobal('pokedexManager', {
    calculateItemValue: vi.fn(item => item.价值),
  });
  ```

### 7. 精细化 Action 和 Getter 控制

`createTestingPinia` 提供了不同的方式来控制 action 和 getter 的行为。

- **`stubActions: false`**: 默认情况下，action 被 stubbed (替换为空函数)。设置 `false` 将允许 action 的原始逻辑执行，这在测试 action 引发的一系列 state 变化时非常有用。
- **手动 Mock Store 属性**: 有时，直接覆写 store 的 state 或 getter 比模拟 action 更简单，特别是当 getter 逻辑复杂时。

  **代码范例 (`SkillPanel.test.ts`)**:

  ```typescript
  const skillStore = useSkillStore(pinia);
  const skillList = Object.values(skills);
  
  // 手动覆写 state 和 getter
  // @ts-ignore
  skillStore.skills = skillList;
  // @ts-ignore
  skillStore.gongfaSkills = skillList.filter(s => s.类别 === '功法');
  ```

- **监视单个 Action (`vi.spyOn`)**: 如果你不想 mock 掉所有 action，只想监视某一个，`vi.spyOn` 是最佳选择。

  **代码范例 (`SignInPanel.test.ts`)**:

  ```typescript
  const store = useSignInStore(pinia);
  // 只监视 signIn action，但不改变其原有实现
  vi.spyOn(store, 'signIn').mockImplementation(async () => {});
  ```

### 8. 封装挂载逻辑 (`createWrapper`)

对于复杂的组件，每个测试用例的挂载逻辑可能非常相似且冗长。将其封装到一个辅助函数中可以极大提高测试代码的可读性和可维护性。

**代码范例 (`BarterPanel.test.ts`)**:

```typescript
const createWrapper = (worldState: any) => {
  const pinia = createTestingPinia({ stubActions: false });
  setActivePinia(pinia);
  
  const worldStore = useWorldStore(pinia);
  worldStore.world = worldState;

  return mount(BarterPanel, {
    global: {
      plugins: [pinia],
    },
  });
};

it('renders panel with correct initial data', async () => {
  const wrapper = createWrapper(world); // 一行代码完成挂载
  // ...
});
```

### 9. Stubbing 子组件

如果一个组件包含了复杂的子组件，而我们只想测试父组件本身，可以使用 `global.stubs` 来将子组件替换为一个简单的占位符。

**代码范例 (`SignInPanel.test.ts`)**:

```typescript
const wrapper = mount(SignInPanel, {
  global: {
    plugins: [pinia],
    stubs: {
      // 将 RetroactiveSignInPanel 组件替换为一个简单的 div
      RetroactiveSignInPanel: {
        template: '<div data-testid="retroactive-panel-mock"></div>',
      },
    },
  },
});
```

## 总结

| 场景 | 核心步骤 | 关键代码 |
| :--- | :--- | :--- |
| **基础设置** | 挂载组件，并用 `createTestingPinia` mock store | `mount(Component, { global: { plugins: [createTestingPinia({ createSpy: vi.fn })] } })` |
| **测试渲染** | 修改 store state -> `await nextTick()` -> 断言 `wrapper.text()` | `store.prop = value; await wrapper.vm.$nextTick(); expect(wrapper.text())...` |
| **测试点击** | `find(selector).trigger('click')` -> 断言 store action 被调用 | `await wrapper.find('button').trigger('click'); expect(store.action).toHaveBeenCalled()` |
| **测试输入** | `find(selector).setValue(value)` -> 断言 | `await wrapper.find('input').setValue('test');` |
| **测试响应式** | 设置 state A -> 断言 A -> 设置 state B -> `await nextTick()` -> 断言 B | `store.prop = 'A'; ...; store.prop = 'B'; await nextTick(); ...` |
| **高级：复杂初始状态** | 在 `createTestingPinia` 中提供 `initialState` 对象 | `createTestingPinia({ initialState: { storeName: { ... } } })` |
| **高级：Mock外部依赖** | 使用 `vi.mock` 或 `vi.stubGlobal` 在测试文件顶部设置 | `vi.mock('path/to/store', ...)` |
| **高级：封装挂载** | 创建一个 `createWrapper` 辅助函数来处理重复的 `mount` 逻辑 | `const createWrapper = (state) => { return mount(...) }` |
| **高级：Stub子组件** | 在 `mount` 的 `global.stubs` 选项中提供替代组件 | `mount(C, { global: { stubs: { ChildComponent: true } } })` |

遵循以上模式，可以为你的 Vue 组件编写出清晰、健壮且易于维护的单元测试。
