# 集成测试计划

本文档旨在规划和定义项目的集成测试策略，确保各个独立的模块和系统能够按照 `CHAT_FLOW_SPEC.md` 中定义的规范正确协同工作。

## 一、 测试目标与策略

- **核心目标**: 验证从“LLM响应”到“多Store状态更新”的端到端数据流的正确性。
- **测试策略**:
    1. **模拟驱动**: 测试将由模拟的LLM响应驱动。每个测试用例都会定义一个包含特定叙事和事件组合的JSON字符串。
    2. **流程验证**: 测试的核心是调用核心事件处理流程（如 `onGenerationEnded`），并将模拟响应作为输入。
    3. **状态断言**: 在处理流程执行完毕后，断言（Assert）各个相关的Pinia Store的状态是否已按预期更新。
    4. **分类覆盖**: 测试用例将根据 `data/prompts` 中定义的系统模块进行分类，确保每个核心游戏系统的集成流程都得到覆盖。

## 二、 测试基础设施与样板代码

为了确保所有集成测试的一致性和可靠性，我们采用标准化的设置和清理流程。所有新的测试文件都应遵循以下模板。

### 1. 测试文件模板 (以 `none.integration.test.ts` 为例)

```typescript
/// <reference types="vitest/globals" />
 
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCharacterStore,
  useGenerationStore,
  useWorldStore,
  // ...导入其他需要的 store
} from '../__mocks__/stores';
import { createMockResponse, setupIntegrationTest } from './integrationTestSetup';
 
describe('集成测试: <你的系统名称>', () => {
  // 1. 在 describe 顶层声明所有需要的变量
  let handlers: ReturnType<typeof setupIntegrationTest>['handlers'];
  let worldStore: ReturnType<typeof useWorldStore>;
  let characterStore: ReturnType<typeof useCharacterStore>;
  // ...为其他 store 声明变量
  const generationStore = useGenerationStore(); // generationStore 是响应式的，可以提前获取
 
  // 2. 在 beforeEach 中完成所有设置工作
  beforeEach(() => {
    // a. 获取所有需要的 store 的全新实例
    worldStore = useWorldStore();
    characterStore = useCharacterStore();
 
    // b. 运行测试设置，并将关键的 worldStore 实例注入进去
    const setup = setupIntegrationTest({ worldStore });
    handlers = setup.handlers;

    if (handlers.setTestGenerationStore) {
      handlers.setTestGenerationStore(generationStore);
    }
 
    // c. (可选) 准备测试需要的特定状态
    generationStore._setTestState({
      isNewTurn: true,
      isAiGenerating: true,
    });
  });
 
  // 3. 在 afterEach 中清理所有 mocks
  afterEach(() => {
    vi.clearAllMocks();
  });
 
  // 4. 编写你的测试用例
  it('[<系统名称>] <测试用例描述>', async () => {
    // a. 准备模拟数据 (事件、LLM响应等)
    const events = [
      { type: "上下文更新", payload: { "时间": { "day": 2 } } },
      // ...
    ];
    const mockResponse = createMockResponse(events);
    generationStore.currentTurnSwipes = [mockResponse] as any;
 
    // b. 执行核心逻辑 (通常是调用一个 handler)
    await handlers.onGenerationEnded(mockResponse, 'test-gen-1');
 
    // c. 断言状态变化
    expect(worldStore.world.value.time.day).toBe(2);
    // ...其他断言
 
    // d. (可选) 断言某个 mock 函数是否被调用
    expect(useWorldStore()._dangerouslyProcessEvents).toHaveBeenCalled();
  });
});
```

### 2. 关键要点解释

- **依赖注入 (`beforeEach`)**: 最核心的改动是在 `beforeEach` 中调用 `setupIntegrationTest({ worldStore })`。这将测试文件作用域内的 `worldStore` 实例**注入**到应用的核心生命周期处理器中，确保了数据流两端操作的是**同一个对象**。
- **实例获取 (`beforeEach`)**: 必须在 `beforeEach` 内部调用 `useWorldStore()` 和 `useCharacterStore()` 来获取 store 实例。这确保了每个 `it` 测试用例都运行在一个干净、重置过的状态之上。
- **清理 (`afterEach`)**: 在每个测试结束后调用 `vi.clearAllMocks()`，可以重置所有 mock 函数的调用记录（如 `toHaveBeenCalled`），防止测试用例之间互相干扰。

---

## 三、 核心流程集成测试 (非系统特定)

这些测试用例旨在验证 `CHAT_FLOW_SPEC.md` 中定义的、与具体游戏系统无关的核心应用生命周期。

### 1. 新游戏初始化流程

- **测试用例**: `[新游戏] 应能正确处理创世消息并初始化所有核心Stores`
- **模拟场景**: 用户完成开局设置，生成初始状态和创世消息。
- **验证步骤**:
    1. 调用 `setupStore.generateInitialState()` 生成一个初始状态。
    2. 调用 `window.startGame(initialState)` 启动游戏。
    3. **断言**:
        - `historyManager` 中应包含一条创世消息。
        - `worldStore` 和 `characterStore` 的状态应与 `initialState` 完全一致。
        - 所有依赖于初始状态的UI Stores（如 `timeStore`, `mapStore`）应被正确初始化。

### 2. 状态恢复与切换流程

- **测试用例**: `[状态恢复] 应能从包含多个事件的历史记录中精确重建当前状态`
- **模拟场景**: 用户加载一个已进行多回合的游戏存档。
- **验证步骤**:
    1. 准备一个包含多条消息和复杂事件链（如物品增减、角色状态变化、任务更新）的 `mockHistory`。
    2. 使用此 `mockHistory` 初始化 `historyManager`。
    3. 调用 `recalculateAndApplyState` 指向最后一条消息。
    4. **断言**:
        - `worldStore`, `characterStore`, `questStore` 等所有相关Store的状态，应精确反映所有历史事件叠加后的最终结果。

- **测试用例**: `[状态切换] 在同一回合内切换Swipe应能正确回溯并重算状态`
- **模拟场景**: 在第N回合，用户对AI生成的回复A不满意，切换到了同一回合的回复B。
- **验证步骤**:
    1. 准备一个历史，其中第N-1回合的状态为 `State_N-1`。第N回合有两个并行的Swipe：`Swipe_A` (事件 `Event_A`) 和 `Swipe_B` (事件 `Event_B`)。
    2. 首先激活 `Swipe_A`，断言当前状态为 `State_N-1 + Event_A`。
    3. 模拟用户切换到 `Swipe_B`，触发 `recalculateAndApplyState`。
    4. **断言**:
        - 状态重算应基于 `State_N-1`。
        - 最终的游戏状态应精确等于 `State_N-1 + Event_B`，完全不受 `Event_A` 的影响。

- **测试用例**: `[分支创建] 从历史节点创建新分支应能正确复制并建立新的状态起点`
- **模拟场景**: 用户从第N回合的消息创建一个新的分支。
- **验证步骤**:
    1. 准备一个至少有N+5回合的单一分支历史。
    2. 调用 `historyManager.createBranch` 从第N回合的消息创建新分支。
    3. **断言**:
        - 新分支的起点状态应与原分支第N回合的状态完全一致。
        - 在新分支上进行的后续操作，不应影响原分支的状态。

## 三、 系统模块集成测试

这些测试用例根据 `data/prompts` 进行分类，每个用例模拟一次包含特定系统事件的LLM响应。

### 1. `无系统 (None)`

- **测试用例**: `[无系统] 处理一次不含任何特殊系统事件的标准交互`
- **模拟LLM响应**: 包含 `"上下文更新"` 和 `"物品变化"` 事件。
- **验证**:
  - `worldStore` 的时间和地点被更新。
  - `characterStore` 的物品栏被正确修改。
  - `achievementStore`, `questStore`, `signInStore` 等系统Store的状态**不发生**任何变化。

### 2. `成就系统 (Achievement)`

- **测试用例**: `[成就] 解锁新成就并获得点数`
- **模拟LLM响应**: 包含 `"新成就"` 事件。
- **验证**:
  - `achievementStore` 的成就列表应新增一个成就。
  - `achievementStore` 的总点数应增加相应数值。

### 3. `以物换物系统 (Barter)`

- **测试用例**: `[交易] 成功执行一次交易`
- **模拟LLM响应**: 包含一个复杂的 `"物品变化"` 事件，其中同时有 `失去` 和 `获得` 字段。
- **验证**:
  - `characterStore` 的物品栏应精确地移除 `失去` 的物品，并添加 `获得` 的物品。
  - `barterStore` 中用于交易的选中物品状态应被清空。

### 4. `任务系统 (Quest)`

- **测试用例**: `[任务] 接收新任务 -> 更新进度 -> 完成任务`
- **模拟LLM响应 (分三步)**:
    1. 第一次响应包含 `"新任务接收"` 事件。
    2. 第二次响应包含 `"任务进度更新"` 事件。
    3. 第三次响应包含 `"任务完成"` 事件和奖励（如 `"物品变化"`）。
- **验证**:
    1. `questStore` 中新增一个状态为“正在进行”的任务。
    2. 该任务的进度被成功更新。
    3. 该任务的状态变为“已完成”，同时 `characterStore` 获得相应奖励。

### 5. `签到系统 (SignIn)`

- **测试用例**: `[签到] 执行每日签到并获得奖励`
- **模拟LLM响应**: 包含 `"签到"` 事件和一个 `"物品变化"` (奖励) 事件。
- **验证**:
  - `signInStore` 的 `今日已签到` 状态变为 `true`，`连续签到天数` 增加。
  - `characterStore` 的物品栏获得签到奖励。

### 6. `技能面板 (SkillPanel)`

- **测试用例**: `[技能] 使用技能提升熟练度并消耗资源`
- **模拟LLM响应**: 包含 `"技能更新"` (提升熟练度) 和 `"角色更新"` (消耗灵力/体力) 事件。
- **验证**:
  - `skillStore` 中对应技能的 `熟练度` 增加。
  - `characterStore` 中主角的 `灵力` 或 `体力` 减少。

## 四、 复合事件流与压力测试

此部分旨在测试系统在一次响应中处理大量、多类型、有依赖关系的事件时的稳定性和准确性。

### 1. 复杂剧情推进场景

- **测试用例**: `[压力测试] 应能正确处理包含多种关联事件的复杂响应`
- **模拟LLM响应**: 设计一个包含以下事件的单一响应：
    1. `"上下文更新"` (推进时间)
    2. `"奇遇"` (发现一个宝箱)
    3. `"物品变化"` (消耗一把钥匙)
    4. `"物品变化"` (从宝箱中获得多种新物品)
    5. `"新图鉴发现"` (对应宝箱中的新物品)
    6. `"新任务接收"` (获得物品后触发新任务)
    7. `"角色更新"` (因开启宝箱消耗体力)
    8. `"技能更新"` (因鉴定物品提升了“鉴定”技能熟练度)
- **验证**:
  - 断言所有事件都按顺序被正确处理。
  - `characterStore` 的物品栏最终状态正确（钥匙消失，新物品出现）。
  - `pokedexStore` 包含了所有新物品的图鉴。
  - `questStore` 出现了一个新的任务。
  - `characterStore` 的体力值减少。
  - `skillStore` 的技能熟练度增加。
  - 整个过程不应产生任何错误，所有Store的状态应与预期完全一致。
