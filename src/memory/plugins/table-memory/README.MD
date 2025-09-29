# TableMemory 记忆增强插件

TableMemory 是为 Mem0 记忆系统设计的表格记忆增强插件，通过结构化表格存储和组织角色相关信息，提升聊天机器人的长期记忆能力。

---

## 最新特性与优化

- ✅ **表格操作与向量记忆解耦**：即使嵌入失败（如API密钥无效），表格操作指令也能被独立执行，不受向量流程影响。
- ✅ **表格内容为空时插入标题行**：增强提示词时，若表格存在但内容为空，将插入表格标题行而非“空表格”，确保LLM理解表结构。
- ✅ **无重试快速失败机制**：嵌入服务（如ZhipuEmbedder）遇到任何错误立即抛出异常，无重试，避免拖慢整体流程。
- ✅ **表格插件兜底**：在嵌入不可用时，Mem0Service 会主动调用表格插件处理，保证表格记忆功能不受影响。
- ✅ **表格操作指令优先处理**：LLM返回表格操作指令后，无论后续嵌入是否失败，都会立即异步处理表格操作，确保表格数据及时更新。
- ✅ **日志优化**：所有表格相关操作均有详细日志，便于排查和追踪。

---

## 开发进度

### 已完成功能
- ✅ 基础表格管理（创建、查询、更新、删除）
- ✅ 表格模板系统
- ✅ 与 Mem0 记忆系统的集成
- ✅ 多表格同时编辑支持
- ✅ 批处理和顺序处理模式
- ✅ LLM 响应解析与表格操作执行
- ✅ JSON 格式的表格操作支持
- ✅ 提供外部系统访问表格数据的 API
- ✅ 处理重复调用 LLM 更新表格的问题

### 正在优化
- 🔄 改进表格数据的版本控制和历史记录
- 🔄 进一步提高批量表格处理的效率

### 计划中功能
- 📝 表格数据可视化及编辑界面
- 📝 更多表格模板和处理策略
- 📝 表格数据导入/导出功能增强

---

## 文件结构和功能

### 核心文件

```
src/memory/plugins/table-memory/
├── index.ts              # 插件主入口和初始化逻辑
├── api.ts                # 公共API接口定义
├── README.MD             # 插件文档
│
├── models/               # 数据模型定义
│   ├── sheet.ts          # 表格模型和操作
│   ├── cell.ts           # 单元格模型和操作
│   └── template.ts       # 模板模型和操作
│
└── services/             # 核心服务实现
    ├── sheet-manager.ts  # 表格管理服务
    ├── template-manager.ts # 模板管理服务
    └── storage-service.ts # 数据存储服务
```

### 模块功能说明

1. **主入口模块 (index.ts)**
   - 插件初始化、配置管理
   - API 统一导出
   - 默认模板创建

2. **公共API模块 (api.ts)**
   - 对外提供统一的调用接口
   - 处理聊天消息更新表格
   - 表格创建、查询和操作
   - 模板管理接口

3. **表格管理服务 (sheet-manager.ts)**
   - 表格实例的创建、查询、更新和删除
   - 处理对话内容更新表格的核心逻辑
   - 与 LLM 交互生成表格更新操作
   - 批量和顺序处理表格的实现

4. **模板管理服务 (template-manager.ts)**
   - 表格模板的创建和管理
   - 模板设置的存储和查询

5. **数据存储服务 (storage-service.ts)**
   - SQLite 数据库操作封装
   - 表格、单元格和模板的持久化
   - 队列化处理以避免并发冲突

6. **数据模型 (models/)**
   - 表格和单元格的数据结构定义
   - 表格模板的结构和操作
   - 工具函数和辅助方法

---

## 集成与调用流程

### 1. 向量与表格记忆协同

- `addToVectorStore` 方法已集成表格记忆处理，无论向量嵌入是否成功，表格操作指令都会被优先处理。
- 表格插件的 `processLLMResponseForTableMemory` 会在 LLM 返回表格操作指令后立即执行。

### 2. 嵌入失败兜底

- `ZhipuEmbedder` 遇到任何嵌入失败（如401/网络错误）立即抛出异常，不再重试。
- `Mem0Service` 和 `MobileMemory` 检测到嵌入不可用时，会主动调用表格插件的 `processChat`，只要表格插件启用且角色有表格，表格记忆功能始终可用。

### 3. 提示词增强

- `enhancePromptsWithTableMemory` 优化：表格存在但内容为空时，插入表格标题行，确保LLM理解表结构和可操作性。

### 4. 表格操作指令处理

- LLM返回的`tableActions`会被立即异步处理，日志中可见 `[MobileMemory] 处理X条表格操作指令`。
- 即使后续流程（如嵌入）失败，表格操作不会丢失。

---

## 功能概述

- **结构化记忆存储**：通过表格形式组织角色信息、事件历史等
- **表格模板系统**：预设多种表格模板，如角色特征表、时空表格、事件历史表等
- **自动表格维护**：基于对话内容自动更新表格信息
- **Mem0系统集成**：与Mem0向量记忆系统无缝协作，共同提升AI记忆体验
- **多表格同时编辑**：支持同时选择和编辑多个表格，实现信息的全面记录

---

## 安装与初始化

TableMemory 插件已集成到 Mem0 系统中，初始化方式如下：

```typescript
// 从 MobileMemory 或 Mem0Service 初始化
import { initializeTableMemory } from './memory/integration/table-memory-integration';

// 初始化表格记忆插件
await initializeTableMemory({
  dbPath: 'path/to/table_memory.db',  // 数据库路径
  defaultTemplates: true,             // 是否创建默认模板
  enabled: true                       // 是否启用插件
});
```

## Mem0 与 TableMemory 集成方案

TableMemory 插件通过两种方式与 Mem0 系统集成：

### 1. 扩展 addToVectorStore 方法

通过 `extendAddToVectorStore` 函数包装原始的 `addToVectorStore` 方法，在处理向量记忆后自动调用表格记忆处理。

```typescript
// mobile-memory.ts 中的集成示例
private addToVectorStore = extendAddToVectorStore(async function(
  // 原始方法实现
) {...});
```

### 2. 提示词增强

表格记忆插件通过 `enhancePromptsWithTableMemory` 函数增强 Mem0 系统的提示词，添加表格相关的指令：

```typescript
// 增强提示词示例
const [enhancedSystemPrompt, enhancedUserPrompt] = enhancePromptsWithTableMemory(
  systemPrompt,
  userPrompt,
  tableData,
  { userName, aiName }
);
```

### 3. 表格操作处理

当 LLM 返回包含表格操作指令的 JSON 时，通过 `processLLMResponseForTableMemory` 函数处理这些操作：

```typescript
// 处理表格操作
await processLLMResponseForTableMemory(
      llmResponse,
characterId,
conversationId
    );
```

## 默认表格模板

插件提供以下默认表格模板：

1. **角色特征表格**：记录角色的基本特征、外貌、性格等信息
2. **角色与用户社交表格**：记录角色与用户的关系、态度等信息
3. **时空表格**：记录当前场景的时间、地点等信息
4. **重要事件历史表格**：记录对话中发生的重要事件
5. **重要物品表格**：记录对话中提到的重要物品信息
6. **任务、命令或约定表格**：记录对话中提到的任务、命令或约定

## 多表格编辑功能

TableMemory 插件现已支持同时管理多个表格：

```typescript
// 选择多个模板创建表格
await TableMemory.API.selectTemplates([
  'template-id-1',  // 角色特征表
  'template-id-2',  // 社交关系表
  'template-id-3'   // 时空表格
]);

// 使用批处理模式更新多个表格
await TableMemory.API.processChat(messages, {
  characterId: 'character-id',
  conversationId: 'conversation-id',
  processMode: 'batch' // 使用批处理模式同时处理多个表格
});
```

## 关键数据流

### 1. 对话内容处理和表格更新流程

```
用户输入 → 对话内容 → processChat() API → 
SheetManager.processSheets() → [判断处理策略] →
    ┌── [批量处理] → SheetManager.processSheetsInBatch() → LLM 批量生成表格操作 → 执行操作
    └── [顺序处理] → SheetManager.processSheetWithChat() → LLM 逐个处理表格 → 执行操作
```

### 2. 表格操作流程

```
表格操作指令(JSON) → 解析操作类型(insert/update/delete) →
    ┌── [插入行] → SheetManager.insertRow() → 创建新单元格 → 保存更新
    ├── [更新行] → SheetManager.updateRow() → 更新单元格值 → 保存更新
    └── [删除行] → SheetManager.deleteRow() → 标记单元格删除 → 保存更新
```

### 3. 表格数据存储流程

```
表格操作 → StorageService.safeExecute() → 
    操作入队 → 顺序执行 → SQLite事务操作 → 
        保存表格元数据 → 保存单元格数据
```

### 4. 优化的 LLM 调用流程

```
processChat() → [检查初始操作] → 
    ┌── [有初始操作] → 直接执行初始操作 → 更新表格
    └── [无初始操作] → 
        ┌── [多表格] → 尝试批量处理 → [批处理成功] → 更新表格
        │               └─ [批处理失败] → 回退到顺序处理
        └── [单表格] → 直接顺序处理 → 更新表格
```

## API 参考

插件主要 API：

- `initialize(options)`: 初始化插件
- `setEnabled(value)`: 设置插件启用状态
- `isEnabled()`: 获取插件启用状态
- `processChat(messages, options)`: 处理聊天消息，更新表格
- `getSelectedTemplates()`: 获取已选择的表格模板
- `selectTemplates(templateIds)`: 选择要使用的模板列表
- `createSheetsFromTemplates(templates, characterId, conversationId)`: 从模板创建表格

## 典型使用流程

1. **初始化阶段**：
   - 系统启动时初始化 TableMemory 插件
   - 选择需要使用的表格模板（可同时选择多个模板）

2. **对话处理阶段**：
   - 用户发送消息后，同时调用向量记忆和表格记忆处理
   - LLM 分析对话内容，返回提取的事实和表格操作指令
   - 系统执行表格操作，更新对应表格

3. **记忆检索阶段**：
   - 在生成回复前，系统将表格数据添加到提示词中
   - AI 助手基于向量记忆和表格记忆生成回复

## 外部系统访问表格数据

现在支持其他组件根据 characterId 获取所有表格数据：

```typescript
import { getCharacterTablesData } from './memory/plugins/table-memory';

// 获取角色的所有表格数据
const result = await getCharacterTablesData('characterId', 'conversationId');

// 返回的数据格式
interface TablesData {
  success: boolean;
  tables: Array<{
    id: string;
    name: string;
    headers: string[];
    rows: string[][];
    text: string; // 文本表示形式
  }>;
  error?: string;
}
```

## 数据库锁死（database is locked）排查与解锁方法

在 Expo 或 React Native 环境下，SQLite 数据库出现 `database is locked` 错误，通常是由于：
- 有未完成或未关闭的事务/连接
- 多个进程/标签页/应用实例同时访问同一个数据库文件
- 某次写入操作异常中断，导致数据库长时间持有锁

### 处理建议

1. **完全关闭 App 并重启**
   - 彻底关闭你的 App（包括所有前台和后台进程），然后重新启动。
   - 这会释放所有未关闭的数据库连接和锁。

2. **确保没有多实例访问**
   - 检查是否有多个 Expo/Metro 进程、模拟器、真机或浏览器标签页同时运行同一个 App。
   - 只保留一个实例，避免并发访问同一数据库文件。

3. **重启 Expo 开发服务器**
   - 关闭所有终端中的 `expo start` 或 `npx expo start` 进程。
   - 重新启动开发服务器。

4. **清理 SQLite 数据库文件（仅开发环境）**
   - 如果数据库一直无法解锁，可尝试删除本地数据库文件（如 `table_memory.db`），让应用重新初始化数据库。
   - 路径通常在 `FileSystem.documentDirectory` 下，或你自定义的路径。
   - **注意：此操作会丢失所有表格数据，仅适用于开发测试环境！**

5. **代码层面建议**
   - 确保所有数据库操作都通过 StorageService 队列串行化，避免绕过队列直接访问数据库。
   - 避免在事务中执行耗时操作或 await 其他异步任务。
   - 遇到锁死时，建议重启 App，或调用 `StorageService.close()` 主动关闭数据库连接。

### 参考代码：主动关闭数据库连接

```typescript
// 在 App 退出或切换账号等场景调用
import { StorageService } from './memory/plugins/table-memory/services/storage-service';

await StorageService.close();
```

---

**如果上述方法仍无法解锁数据库，请重启开发环境或清理数据库文件。生产环境请避免多进程/多实例并发访问同一数据库。**

## 故障排查

如果表格记忆功能不正常工作：

1. 检查插件是否正确初始化：`TableMemory.isEnabled()` 应返回 `true`
2. 确认提示词是否包含表格指令：查看发送给 LLM 的系统提示词中是否包含表格相关内容
3. 检查 LLM 是否返回了正确格式的表格操作指令
4. 查看控制台日志中是否有与 `[TableMemory]` 相关的错误信息

## 当前优化重点

根据日志分析，我们发现存在重复调用 LLM 更新表格的问题，主要体现在以下几个方面：

1. **初始事实提取和表格操作** - 在对话处理过程中，首次 LLM 调用已经提取了事实和表格操作指令
2. **批量处理尝试** - 如果上一步的表格操作未覆盖所有表格，系统会进行批量处理尝试
3. **顺序处理回退** - 如果批量处理失败，系统会回退到顺序处理模式

其中，我们已识别并优化了以下关键问题：

1. **重复处理表格** - 通过 `processedSheets` 集合来跟踪已处理的表格，避免重复处理
2. **优化处理策略** - 根据表格数量和操作特点，智能选择批量或顺序处理模式
3. **重用初始操作** - 支持传入 `initialTableActions`，允许重用已有的表格操作指令

---

## 注意事项

- 表格记忆功能与向量记忆功能结合使用效果最佳
- 默认表格模板可根据实际需求进行调整或扩展
- 表格数据存储在独立的 SQLite 数据库中，与向量记忆分开管理
- 批处理模式可大幅提升多表格编辑的效率，但在复杂场景下可能需要回退到顺序处理模式
