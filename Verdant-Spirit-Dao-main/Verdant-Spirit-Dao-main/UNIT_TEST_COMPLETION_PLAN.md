# 单元测试补充计划

本文档总结了在对项目进行全面审查后，需要补充的单元测试任务。

## `adventureStore`

### `isAdventureReady` 计算属性测试
- [x] 测试当冷却未结束但有“特殊天象”时，返回 `true`
- [x] 测试当冷却结束但没有“特殊天象”时，返回 `true`
- [x] 测试当冷却未结束且没有“特殊天象”时，返回 `false`

### `adventureHint` 计算属性测试
- [x] 测试在 `isAdventureReady` 为 `false` 时，返回“非奇遇时机”
- [x] 测试有“特殊天象”时，返回包含天象名称的提示
- [x] 测试冷却就绪时，返回通用的包含天气和传闻占位符的提示

### `_handleAdventureEvent` 事件处理器测试
- [x] 测试在冷却期间收到事件时，不进行任何操作
- [x] 测试在冷却结束后收到事件时，正确调用 `worldStore.redispatchEvent`
- [x] 测试在冷却结束后收到事件时，正确更新 `上次奇遇天数` 和 `冷却至天数`

### `initialize` 方法测试
- [x] Mock `worldStore`，验证 `registerEventHandler` 是否被以正确的参数（'奇遇' 和处理器函数）调用

## `utils/pathfinder.ts`

### 创建单元测试文件 `pathfinder.test.ts`

### Dijkstra 算法健壮性测试
- [x] 测试简单线性路径
- [x] 测试带分支的多路径选择
- [x] 测试起点和终点不连通时返回 `null`
- [x] 测试包含环路的地图能正常工作
- [x] 测试起点即终点时返回单节点路径

### `findPaths` 函数集成测试
- [x] 创建一个包含不同权重（时间、风险、回报）的复杂地图 mock
- [x] 验证 `shortestPath` 结果正确性
- [x] 验证 `safestPath` 结果正确性
- [x] 验证 `adventurousPath` 结果正确性
- [x] 确保三种路径在特定地图下能产生不同结果

## `questStore`

### 边缘场景测试补充
- [x] 测试事件处理器能通过**任务名称**成功更新任务
- [x] 测试兼容性事件别名（如 `任务接收`）能被正确处理
- [x] 测试当 `任务列表` 初始为 `undefined` 时处理器能正常工作
