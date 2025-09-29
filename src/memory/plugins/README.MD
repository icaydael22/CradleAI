# 表格记忆增强插件 - Mem0系统集成指南

## 插件概述

表格记忆增强插件是Mem0记忆系统的扩展组件，它允许智能助手以结构化表格的形式组织和管理用户信息，使得信息检索更加高效和精准。该插件采用模块化设计，与现有Mem0系统无缝集成。

## 核心功能

- **结构化数据管理**：将对话信息组织为表格形式，支持多种数据类型
- **模板定制**：提供可自定义的表格模板，适用于不同场景
- **实时更新**：根据对话内容自动更新表格数据
- **上下文感知**：理解对话上下文，准确定位更新位置
- **持久化存储**：使用SQLite数据库可靠存储表格数据

## 集成流程

### 步骤 1: 初始化插件

```typescript
import { initializeTableMemory } from '@/src/memory/integration/table-memory-integration';

// 初始化表格记忆插件
await initializeTableMemory({
  dbPath: '/path/to/database.db',  // 可选：指定数据库路径
  defaultTemplates: true,          // 可选：是否创建默认模板
  enabled: true                    // 可选：是否默认启用插件
});
```

### 步骤 2: 处理聊天消息

```typescript
import { processChat } from '@/src/memory/integration/table-memory-integration';

// 处理聊天消息，更新表格
const result = await processChat(messages, {
  characterId: 'character-123',    // 角色ID
  conversationId: 'conv-456',      // 会话ID
  userName: '用户',                 // 可选：用户称呼
  aiName: 'AI助手'                 // 可选：AI称呼
});

// result.updatedSheets 包含已更新的表格ID列表
```

### 步骤 3: 表格数据获取

```typescript
import { TableMemory } from '@/src/memory';

// 获取角色的所有表格
const sheets = await TableMemory.API.getCharacterSheets(
  'character-123',    // 角色ID
  'conv-456'          // 可选：限定特定会话
);

// 获取表格内容（用于提示词构建）
const tableText = TableMemory.toText(sheets[0]);
```

## 工作原理

表格记忆插件与Mem0系统并行工作，当用户发送消息时：

1. Mem0系统正常处理向量记忆
2. 表格记忆插件分析消息内容
3. LLM生成表格操作指令
4. 插件执行表格操作（创建、更新、删除行）
5. 更新后的表格可用于后续对话

### LLM响应格式

插件通过特定的JSON格式与LLM通信：

```json
{
  "facts": [
    "用户提到的事实1",
    "用户提到的事实2"
  ],
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "sheet-123",
      "rowData": {"0": "第一列的值", "1": "第二列的值"}
    },
    {
      "action": "update",
      "sheetId": "sheet-123",
      "rowIndex": 1,
      "rowData": {"0": "更新的值", "1": "更新的值"}
    }
  ]
}
```

## 常见场景

### 场景1: 项目跟踪

用户与AI助手讨论项目进度时，插件可以维护一个项目时间表，记录关键事件、截止日期和责任人。

### 场景2: 个人喜好管理

在闲聊过程中，用户提到自己的喜好，插件可以自动更新"用户偏好"表格，便于AI助手在后续对话中参考。

### 场景3: 关系网络维护

用户提及朋友、家人或同事时，插件可以构建关系网络表格，帮助AI助手理解用户的社交环境。

## 常见问题

**Q: 插件会如何处理不确定的信息？**
A: 插件配置的提示词指导LLM在遇到不确定信息时留空，而非猜测。

**Q: 如何自定义表格模板？**
A: 可以通过TableMemory.API.createTemplate()创建自定义模板。

**Q: 表格数据存储在哪里？**
A: 默认存储在应用数据目录的SQLite数据库中，可通过初始化参数自定义路径。

## 技术注意事项

- 插件使用SQLite数据库，确保移动平台有适当的权限
- 处理大量数据时，考虑设置更高的处理间隔，以减少LLM调用频率
- 表格模板应根据实际场景需求设计，避免过于复杂的结构

## 版本兼容性

- 当前插件版本兼容Mem0系统v1.0及以上版本
- 推荐使用LLM模型：GPT-4、ChatGLM-4、Claude 3以获得最佳表格理解能力

