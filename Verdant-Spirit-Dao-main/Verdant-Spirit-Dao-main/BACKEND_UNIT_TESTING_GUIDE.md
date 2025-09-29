# 后端逻辑与 Pinia Store 单元测试指南

本文档通过分析项目中的核心业务逻辑 (`core/`) 和 Pinia store (`stores/`) 的测试文件，总结了一套针对 TypeScript/JavaScript 后端逻辑单元测试的最佳实践和通用“套路”。

## 核心理念

与前端组件测试不同，后端测试的核心在于 **逻辑隔离** 和 **状态验证**。我们不关心UI渲染，而是聚焦于：

1.  **输入与输出**：一个函数或 action 在接收特定输入后，是否返回了预期的输出？
2.  **状态变更**：一个 action 执行后，相关的 state 是否发生了正确的变化？
3.  **副作用**：一个函数或 action 是否正确地调用了外部依赖（例如，其他 store、API、全局服务）？

## 核心技术栈

-   **测试运行器**: `Vitest` (`describe`, `it`, `expect`, `vi`)
-   **依赖注入/Mocking**: `Vitest` 的 `vi.mock` 和 `vi.spyOn` 是实现逻辑隔离的基石。
-   **状态管理**: `Pinia` (`createPinia`, `setActivePinia`) 用于提供一个干净的测试环境。
-   **辅助库**: `lodash` 用于深度克隆和操作数据。

## 测试模式详解

### 模式一：纯逻辑函数测试 (无 Pinia 依赖)

这种模式适用于独立的、无状态的工具函数或核心算法。

**套路**:
1.  **隔离依赖**: 使用 `vi.mock` 将所有从外部导入的模块（stores, utils, apis）替换为 mock 实现。
2.  **模拟全局对象**: 如果函数依赖全局变量（如 `_`, `toastr`），使用 `vi.stubGlobal` 或 `global.` 进行模拟。
3.  **AAA 结构**:
    *   **Arrange (安排)**: 准备输入数据。精心设计 mock 函数的返回值，可以使用 `.mockReturnValueOnce()` 来模拟多次调用的不同结果。
    *   **Act (执行)**: 调用被测试的函数。
    *   **Assert (断言)**: 验证函数的返回值是否符合预期，以及它是否以正确的参数调用了其外部依赖。

**代码范例 (`stateUpdater.test.ts`)**:
```typescript
// 1. 隔离所有依赖
vi.mock('../../core/variables');
vi.mock('../../stores/core/worldStore');
// ... 其他 mock

describe('stateUpdater: recalculateAndApplyState', () => {
  let mockGetVariables: Mock;
  // ... 其他 mock 变量

  beforeEach(() => {
    vi.resetAllMocks(); // 每个测试前重置 mock
    mockGetVariables = vi.mocked(variables.getVariables);
    // ...
  });

  it('should successfully recalculate from genesis state', async () => {
    // Arrange: 准备复杂的输入数据和 mock 返回值
    const genesisState = { /* ... */ };
    const eventsToReplay = [{ /* ... */ }];
    mockGetRecalculationInputs.mockResolvedValue({ startState: genesisState, eventsToReplay });
    mockGetVariables.mockReturnValueOnce(genesisState); // 模拟第一次调用
    
    // Act: 执行函数
    const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

    // Assert: 验证返回值和副作用
    expect(result).toEqual(finalStateForReturn);
    expect(mockOverwriteAllChatVariables).toHaveBeenCalledTimes(1);
    expect(toastr.success).toHaveBeenCalledWith('...');
  });
});
```

### 模式二：Pinia Store Action 测试

这是最常见的 store 测试类型，专注于验证 action 的逻辑。

**套路**:
1.  **创建干净的 Pinia 环境**: 在 `beforeEach` 中使用 `setActivePinia(createPinia())`。
2.  **Mock 外部依赖**: 使用 `vi.mock` mock 掉该 store 依赖的其他 stores 或服务。
3.  **设置初始状态**: 直接修改 store 实例的 state (`store.stateProperty = ...`) 或通过 mock 的上游 store (如 `worldStore`) 来提供初始数据。
4.  **执行 Action**: 调用 `store.myAction()`。
5.  **断言**:
    *   **状态变更**: 检查 action 执行后 `store.stateProperty` 的值是否正确。
    *   **副作用**: 检查 action 是否调用了被 mock 的外部依赖。

**代码范例 (`actionStore.test.ts`)**:
```typescript
// 1. Mock 核心依赖
const mockTriggerActionFn = vi.fn();

describe('useActionStore', () => {
  beforeEach(() => {
    // 2. 创建干净环境并注入依赖
    setActivePinia(createPinia());
    initializeActionStoreDependencies(..., mockTriggerActionFn);
  });

  it('should call triggerActionFn with the correct parameters', async () => {
    const store = useActionStore();
    const actionText = '选择这个选项';

    // 3. (隐式) 初始状态是默认值

    // 4. 执行 Action
    await store.handleOptionClick(actionText, 1);

    // 5. 断言副作用
    expect(mockTriggerActionFn).toHaveBeenCalledOnce();
    expect(mockTriggerActionFn).toHaveBeenCalledWith(actionText, 1, ...);
  });
});
```

### 模式三：Pinia Store Getter/Computed 测试

这种模式用于测试从 state 派生出的计算属性 (getters)。

**套路**:
1.  **创建干净的 Pinia 环境**。
2.  **设置依赖的 State**: Getter 是从 state 计算而来的，因此测试的核心是为其提供不同的 state 场景。通常通过 mock 其依赖的 store (如 `worldStore`) 来实现。
3.  **实例化 Store**: `const myStore = useMyStore()`。
4.  **断言 Getter**: 直接访问 `myStore.myGetter` 并断言其返回值。
5.  **(可选) 测试响应式**: 修改依赖的 state，然后再次断言 getter 的值是否已更新。

**代码范例 (`characterStore.test.ts`)**:
```typescript
describe('useCharacterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should identify the main character correctly', () => {
    // 2. 设置依赖的 worldStore 的 state
    const worldStore = useWorldStore();
    worldStore.world = {
      角色: {
        '主控角色名': '主角',
        '主角': { 姓名: '主角' },
      },
    } as any;

    // 3. 实例化 store
    const characterStore = useCharacterStore();

    // 4. 断言 getters
    expect(characterStore.mainCharacter).toBeDefined();
    expect(characterStore.mainCharacter?.姓名).toBe('主角');
    expect(characterStore.mainCharacterName).toBe('主角');
  });
});
```

### 模式四：事件驱动型 Store 测试

对于像 `worldStore` 这样通过事件处理器来改变状态的 store，测试重点是验证事件是否被正确注册和处理。

**套路**:
1.  **直接测试事件处理器逻辑**: 将 store 中的事件处理函数单独导出或在测试中复制出来，像测试纯逻辑函数一样测试它。
2.  **集成测试**:
    *   **注册**: 调用 `store.registerEventHandler('事件名', mockHandler)`。
    *   **触发**: 调用 `store.processEvent(eventObject)`。
    *   **断言**: 验证 `mockHandler` 是否被调用，以及 store 的 state 是否被 `mockHandler` 正确修改。

**代码范例 (`worldStore.test.ts`)**:
```typescript
describe('useWorldStore', () => {
  // ... setup

  it('should process a registered event and update the world state', () => {
    const worldStore = useWorldStore();
    const mockWeatherHandler = vi.fn((event, world) => {
      world.天气 = event.payload.天气;
    });
    
    // 注册
    worldStore.registerEventHandler('天气变化', mockWeatherHandler);
    const weatherEvent = { type: '天气变化', payload: { 天气: '晴朗' } };

    // 触发
    worldStore.processEvent(weatherEvent);

    // 断言
    expect(mockWeatherHandler).toHaveBeenCalledTimes(1);
    expect(worldStore.world.天气).toBe('晴朗');
  });
});
```

## 总结与最佳实践

| 测试目标 | 核心策略 | 关键 Vitest API |
| :--- | :--- | :--- |
| **独立业务逻辑** | 全面 Mock 外部依赖，遵循 AAA 模式 | `vi.mock`, `vi.spyOn`, `.mockReturnValue()` |
| **Store Actions** | Mock 依赖，设置初始 state，执行 action，断言 state 变化和副作用 | `setActivePinia`, `vi.mock`, `store.action()` |
| **Store Getters** | Mock 依赖，设置不同的 state 场景，直接断言 getter 的返回值 | `setActivePinia`, `worldStore.world = ...`, `expect(store.getter)` |
| **事件驱动逻辑** | 注册 mock handler，触发事件，断言 handler 被调用且 state 改变 | `store.registerEventHandler`, `store.processEvent` |

-   **隔离，隔离，再隔离**: 单元测试的黄金法则是只测试一个单元。使用 `vi.mock` 大胆地 mock 掉所有不属于当前测试范围的东西。
-   **`beforeEach` 很关键**: 使用 `beforeEach` 来重置 mocks (`vi.resetAllMocks()`) 和 Pinia 实例 (`setActivePinia(createPinia())`)，确保测试用例之间互不影响。
-   **数据深拷贝**: 当操作复杂的 mock state 对象时，使用 `_.cloneDeep()` 来避免在测试中断言原始数据被意外修改。