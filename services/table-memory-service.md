# TableMemoryService 独立表格记忆服务说明

`TableMemoryService` 提供了与 MobileMemory/向量记忆完全解耦的表格记忆全流程服务。外部组件可通过调用该服务，实现表格记忆的独立获取、提示词生成、LLM调用、解析与表格操作，无需依赖向量存储或嵌入器。

---

## 主要特性

- **独立于 MobileMemory/向量存储**：不依赖任何向量检索、嵌入器或 MobileMemory 实例。
- **全流程封装**：包括聊天内容获取、表格专用提示词生成、LLM 独立调用、表格操作 JSON 解析、表格数据写入。
- **可直接集成到任何业务流程**：如自定义对话机器人、外部自动化脚本、批量表格处理等。

---

## 典型使用场景

- 只需表格记忆，不需要向量记忆的场合
- 需要自定义表格记忆流程或与其他业务系统集成
- 需要独立调用 LLM 处理表格相关内容

---

## 快速开始

### 1. 导入服务

```typescript
import { TableMemoryService } from '../services/table-memory-service';
```

### 2. 构造参数

```typescript
const options = {
  characterId: '角色ID',
  conversationId: '会话ID',
  userName: '用户昵称',      // 可选
  aiName: 'AI昵称',         // 可选
  messages: [               // 消息数组或字符串
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，有什么可以帮您？' }
  ],
  chatContent: '',          // 可选，优先于 messages
  isMultiRound: false       // 可选
};
```

### 3. 调用全流程处理

```typescript
const result = await TableMemoryService.process(options);
// result.updatedSheets 为本次被更新的表格ID数组
```

---

## 主要API说明

### 1. 全流程处理

```typescript
TableMemoryService.process(options: TableMemoryServiceOptions): Promise<{ updatedSheets: string[] }>
```
- 自动完成：聊天内容获取 → 生成表格专用提示词 → LLM 调用 → 解析表格操作 → 执行表格操作

### 2. 单独调用各环节

- 获取聊天内容
  ```typescript
  const chatContent = await TableMemoryService.getChatContent(options);
  ```
- 获取表格数据
  ```typescript
  const tableData = await TableMemoryService.getTableData(characterId, conversationId);
  ```
- 构建表格专用提示词
  ```typescript
  const { systemPrompt, userPrompt } = await TableMemoryService.buildPrompts(chatContent, tableData);
  ```
- 独立调用LLM
  ```typescript
  const llmResponse = await TableMemoryService.callLLM(systemPrompt, userPrompt);
  ```
- 解析表格操作
  ```typescript
  const tableActions = TableMemoryService.parseTableActions(llmResponse);
  ```
- 执行表格操作
  ```typescript
  const updatedSheets = await TableMemoryService.applyTableActions(tableActions);
  ```

---

## 注意事项

- 该服务不依赖 MobileMemory、向量存储、嵌入器等，仅依赖表格记忆插件本身。
- 需要确保表格记忆插件已初始化（通常由主系统自动完成）。
- LLM 实例由表格记忆插件自动获取，无需外部传入。
- 支持多表格、多轮对话、批量表格操作。

---

## 典型集成方式

- **业务系统直接调用**：如在业务流程中直接调用 `TableMemoryService.process` 实现表格记忆自动维护。
- **与外部对话系统集成**：可将对话内容直接传递给该服务，实现表格记忆的独立维护与更新。
- **批量表格数据处理**：可循环调用 `applyTableActions` 实现批量表格数据导入、同步等。

---

## 示例：自定义表格记忆处理流程

```typescript
import { TableMemoryService } from '../services/table-memory-service';

async function handleTableMemory(characterId, conversationId, messages) {
  // 1. 获取聊天内容
  const chatContent = await TableMemoryService.getChatContent({ characterId, conversationId, messages });

  // 2. 获取表格数据
  const tableData = await TableMemoryService.getTableData(characterId, conversationId);

  // 3. 构建提示词
  const { systemPrompt, userPrompt } = await TableMemoryService.buildPrompts(chatContent, tableData);

  // 4. 调用LLM
  const llmResponse = await TableMemoryService.callLLM(systemPrompt, userPrompt);

  // 5. 解析表格操作
  const tableActions = TableMemoryService.parseTableActions(llmResponse);

  // 6. 执行表格操作
  const updatedSheets = await TableMemoryService.applyTableActions(tableActions);

  return updatedSheets;
}
```

---

## 类型定义

```typescript
interface TableMemoryServiceOptions {
  characterId: string;
  conversationId?: string;
  userName?: string;
  aiName?: string;
  messages?: Message[] | string;
  chatContent?: string;
  isMultiRound?: boolean;
}
```

---

## 结论

`TableMemoryService` 适用于任何需要独立表格记忆处理的场景，极大提升了表格记忆的灵活性和可集成性。推荐在需要与向量记忆解耦的业务流程中优先使用本服务。

