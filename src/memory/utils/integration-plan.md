# Mem0 与 SillyTavern 记忆增强插件集成方案

## 1. 概述

本文档详细阐述了将 SillyTavern 记忆增强插件集成到 Mem0 记忆系统的完整技术方案。该方案采用模块化设计，确保与现有 Mem0 系统的向后兼容性，同时通过插件机制扩展 Mem0 的功能。

## 2. 架构设计

### 2.1 模块结构

```
f:\my-app\src\memory\
├── plugins/
│   └── table-memory/                   # 表格记忆增强插件
│       ├── api.ts                      # 公共 API 接口
│       ├── models/                     # 数据模型
│       │   ├── sheet.ts                # 表格模型
│       │   ├── template.ts             # 表格模板模型
│       │   └── cell.ts                 # 单元格模型
│       ├── services/                   # 服务层
│       │   ├── sheet-manager.ts        # 表格管理服务
│       │   ├── template-manager.ts     # 模板管理服务
│       │   └── storage-service.ts      # 存储服务
│       ├── utils/                      # 工具函数
│       │   ├── formatter.ts            # 格式化工具
│       │   └── prompt-builder.ts       # 提示词构建工具
│       ├── components/                 # React 组件
│       │   ├── TableView.tsx           # 表格视图
│       │   ├── TemplateEditor.tsx      # 模板编辑器
│       │   └── TableMemoryPanel.tsx    # 记忆面板
│       └── index.ts                    # 插件入口点
└── integration/                        # 集成层
    └── table-memory-integration.ts     # Mem0 与表格记忆的集成
```

### 2.2 集成架构

```
+----------------------+      +------------------------+
|  Mem0 记忆系统        |----->|  表格记忆增强集成层     |
+----------------------+      +------------------------+
                                        |
                                        v
                             +------------------------+
                             |  表格记忆增强插件        |
                             +------------------------+
                                        |
                                        v
                             +------------------------+
                             |  SQLite 存储            |
                             +------------------------+
```

## 3. 实现策略

### 3.1 数据流程

1. **并行处理模式**
   - Mem0 正常处理向量记忆
   - 同时将用户消息传递给表格记忆处理器
   - 两个系统并行工作，互不阻塞

2. **数据流向**
   ```
   用户消息 -----> Mem0 处理 -----> 向量记忆存储
         \
          \----> 表格记忆处理 -----> 表格更新与存储
   ```

### 3.2 LLM 调用优化

为避免重复 LLM 调用，采用以下策略：

1. **复用 LLM 响应**
   - 设计特定提示词格式，使 LLM 同时返回向量记忆和表格操作指令
   - 解析 LLM 响应，分别处理向量记忆和表格更新

2. **批量处理机制**
   - 多轮对话积累后再处理表格，减少 LLM 调用频率
   - 使用 Mem0 相同的处理间隔规则

### 3.3 存储策略

1. **独立存储**
   - 表格数据存储在单独的 SQLite 表中
   - 表结构设计支持高效查询和更新

2. **数据模型**
   ```typescript
   // 表格模板
   interface SheetTemplate {
     uid: string;
     name: string;
     type: 'free' | 'dynamic' | 'fixed' | 'static';
     columns: ColumnDefinition[];
     rows: number;
     note: string;
     initPrompt: string;
     insertPrompt: string;
     deletePrompt: string;
     updatePrompt: string;
   }

   // 表格实例
   interface Sheet {
     uid: string;
     templateId: string;
     name: string;
     characterId: string;
     conversationId: string;
     cells: Cell[];
     createdAt: string;
     updatedAt: string;
   }

   // 单元格
   interface Cell {
     uid: string;
     sheetId: string;
     rowIndex: number;
     colIndex: number;
     value: string;
     history: CellHistory[];
   }
   ```

## 4. 集成实现

### 4.1 扩展 `addToVectorStore` 方法

在 `mobile-memory.ts` 中扩展 `addToVectorStore` 方法，增加表格处理功能：

```typescript
private async addToVectorStore(messages: Message[], metadata: Record<string, any>, filters: SearchFilters, isMultiRound: boolean = false): Promise<MemoryItem[]> {
  
  // 已有的向量记忆处理代码
  // ...

  // 并行处理表格记忆
  if (this.isTableMemoryEnabled()) {
    try {
      const tableMemoryService = await this.getTableMemoryService();
      // 异步处理表格记忆，不阻塞主流程
      tableMemoryService.processChat(messages, {
        characterId: filters.agentId,
        conversationId: filters.runId,
        userName: metadata.userName,
        aiName: metadata.aiName
      }).catch(error => {
        console.error("[MobileMemory] 处理表格记忆时出错:", error);
      });
    } catch (error) {
      console.error("[MobileMemory] 获取表格记忆服务失败:", error);
    }
  }

  // 返回向量记忆处理结果
  return results;
}
```

### 4.2 优化 LLM 调用

为避免重复调用 LLM，我们可以通过以下方式扩展提示词系统：

```typescript
// 扩展后的提示词生成函数
export function getFactRetrievalAndTableUpdateMessages(
  content: string,
  tableData: any,
  isMultiRound: boolean = false,
  options: { userName?: string; aiName?: string } = {}
): [string, string] {
  // 基础的事实提取提示词
  const [baseSystemPrompt, baseUserPrompt] = getFactRetrievalMessages(content, isMultiRound, options);
  
  // 如果表格记忆未启用，直接返回基础提示词
  if (!tableData) {
    return [baseSystemPrompt, baseUserPrompt];
  }
  
  // 扩展系统提示词，增加表格处理指令
  const extendedSystemPrompt = `${baseSystemPrompt}

此外，你还需要根据对话内容更新用户的表格记忆。

${tableData ? `当前表格数据:
${JSON.stringify(tableData, null, 2)}` : '目前没有表格数据，需要根据对话创建新表格。'}

请按照以下规则处理表格:
1. 保持表格结构不变，不要添加或删除列
2. 基于对话内容添加新行或更新现有行
3. 将相关信息分类到正确的列中
4. 如果信息不确定，使用空值而非猜测`;

  // 扩展用户提示词，要求返回JSON格式响应
  const extendedUserPrompt = `${baseUserPrompt}

请以JSON格式返回两部分内容:
1. "facts": 从对话中提取的事实数组
2. "tableActions": 表格更新操作数组，每个操作包含:
   - "action": "insert"/"update"/"delete" 之一
   - "sheetId": 表格ID
   - 其它操作所需参数

示例响应格式:
{
  "facts": ["用户喜欢民族歌手", "用户的名字是李明"],
  "tableActions": [
    {
      "action": "insert",
      "sheetId": "sheet-123",
      "rowData": {"0": "李明", "1": "用户喜欢民族歌手"}
    }
  ]
}

请仅返回有效的JSON格式，不要添加解释或描述。`;

  return [extendedSystemPrompt, extendedUserPrompt];
}
```

### 4.3 表格操作响应处理

```typescript
// 解析LLM响应，处理表格操作
async function processTableActions(actions: any[], characterId: string, conversationId: string) {
  const tableMemoryService = await getTableMemoryService();
  
  for (const action of actions) {
    try {
      switch (action.action) {
        case "insert":
          await tableMemoryService.insertRow(
            action.sheetId,
            action.rowData
          );
          break;
        case "update":
          await tableMemoryService.updateRow(
            action.sheetId,
            action.rowIndex,
            action.rowData
          );
          break;
        case "delete":
          await tableMemoryService.deleteRow(
            action.sheetId,
            action.rowIndex
          );
          break;
      }
    } catch (error) {
      console.error(`表格操作失败: ${action.action}`, error);
    }
  }
}
```

## 5. 用户界面集成

### 5.1 组件集成

在记忆管理界面中添加表格记忆标签页：

```typescript
// 在 MemoryProcessingControl.tsx 中新增表格记忆标签页
<Tab.Screen 
  name="tableMemory" 
  component={TableMemoryPanel} 
  options={{ 
    tabBarLabel: "表格记忆",
    tabBarIcon: ({ color }) => (
      <MaterialCommunityIcons name="table" color={color} size={24} />
    ),
  }} 
/>
```

### 5.2 开关控制

在设置界面中添加表格记忆控制选项：

```typescript
// 在设置界面中添加表格记忆开关
<Switch
  value={tableMemoryEnabled}
  onValueChange={(value) => {
    setTableMemoryEnabled(value);
    memory?.setTableMemoryEnabled(value);
  }}
/>
<Text>启用表格记忆</Text>
```

## 6. 基于用户反馈的迭代计划

### 6.1 第一阶段：基础集成（1-2周）

- 实现基本的表格模板创建和管理功能
- 实现表格数据的存储和检索
- 构建与Mem0的基础集成点

### 6.2 第二阶段：功能完善（2-3周）

- 完善表格编辑UI
- 优化LLM提示词和响应处理
- 添加批量操作和历史记录功能

### 6.3 第三阶段：性能优化与扩展（3-4周）

- 优化表格数据加载性能
- 支持表格数据导入/导出
- 添加高级筛选和检索功能

## 7. 风险评估与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|--------|
| LLM响应解析失败 | 表格更新失败 | 实现健壮的解析器和错误恢复机制 |
| 表格数据过大导致性能问题 | 应用响应缓慢 | 实现分页加载和数据压缩 |
| 用户体验不连贯 | 用户满意度下降 | 确保UI一致性，提供充分的反馈 |
| 存储冲突 | 数据丢失 | 实现事务和备份机制 |

通过以上策略，我们可以有效地将SillyTavern记忆增强插件集成到Mem0系统中，同时保持现有功能的稳定性和一致性。


