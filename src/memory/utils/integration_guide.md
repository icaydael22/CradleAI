## SillyTavern 记忆增强插件 - 集成指南

本文档概述了如何将 SillyTavern 记忆增强插件与一个基于 TypeScript 的外部系统集成，该系统已经处理了定期的聊天历史记录处理和 LLM 调用。

## 目录

1. [AI 表格操作的 API 集成](#ai-表格操作的-api-集成)
   - [表格初始化](#表格初始化)
   - [行插入](#行插入)
   - [行删除](#行删除)
   - [行更新](#行更新)
   
2. [用户手册模板创建](#用户手册模板创建)
   - [模板创建流程](#模板创建流程)
   - [模板配置选项](#模板配置选项)

3. [用户手册表格编辑](#用户手册表格编辑)
   - [编辑现有表格](#编辑现有表格)
   - [单元格操作](#单元格操作)
   - [表格刷新操作](#表格刷新操作)

4. [AI 表格操作提示示例](#ai-表格操作提示示例)
   - [基础重建提示](#基础重建提示)
   - [兼容重建提示](#兼容重建提示)
   - [表格数据修复和简化提示](#表格数据修复和简化提示)

## AI 表格操作的 API 集成

### 表格初始化

要在您的 TypeScript 应用程序中初始化表格系统：

```typescript
import { BASE, USER } from 'st-memory-enhancement/manager';
import { buildSheetsByTemplates } from 'st-memory-enhancement/index';

// 从选定的模板初始化表格
function initializeTablesForChat(chatPiece: any): void {
  // 检查用户是否选择了表格模板
  const selectedTemplates = USER.getSettings().table_selected_sheets || [];
  
  if (selectedTemplates.length > 0) {
    // 基于选定的模板构建表格
    buildSheetsByTemplates(chatPiece);
    
    // 保存聊天以持久化初始化的表格
    USER.saveChat();
    
    console.log('表格已为聊天片段初始化');
  }
}
```

### 行插入

要将新行插入到特定表格中：

```typescript
import { BASE } from 'st-memory-enhancement/manager';

/**
 * 将新行插入到特定表格中
 * @param sheetUid - 表格的唯一标识符
 * @param rowData - 包含列值的对象 (键是列索引，值是单元格内容)
 */
function insertTableRow(sheetUid: string, rowData: Record<number, string>): void {
  // 获取表格实例
  const sheet = new BASE.Sheet(sheetUid);
  
  if (!sheet) {
    console.error(`未找到表格: ${sheetUid}`);
    return;
  }
  
  try {
    // 获取表格中的最后一行
    const lastRow = sheet.getRowCount() - 1;
    
    // 在末尾插入新行
    const originCell = sheet.findCellByPosition(0, 0);
    originCell.newAction('insertDownRow');
    
    // 将数据填充到新行中
    Object.entries(rowData).forEach(([colIndexStr, value]) => {
      const colIndex = parseInt(colIndexStr) + 1; // +1 因为第一列是行索引
      const cell = sheet.findCellByPosition(lastRow + 1, colIndex);
      if (cell) {
        cell.data.value = String(value).replace(/,/g, '/'); // 将逗号替换为斜杠
      }
    });
    
    // 保存更改
    sheet.save();
    console.log(`行成功插入到表格: ${sheet.name}`);
  } catch (error) {
    console.error('插入行时出错:', error);
  }
}
```

### 行删除

要从特定表格中删除一行：

```typescript
import { BASE } from 'st-memory-enhancement/manager';

/**
 * 从特定表格中删除一行
 * @param sheetUid - 表格的唯一标识符
 * @param rowIndex - 要删除的行的索引 (从 0 开始，不包括标题行)
 */
function deleteTableRow(sheetUid: string, rowIndex: number): void {
  const sheet = new BASE.Sheet(sheetUid);
  
  if (!sheet) {
    console.error(`未找到表格: ${sheetUid}`);
    return;
  }
  
  try {
    // 调整 rowIndex 以考虑标题行
    const actualRowIndex = rowIndex + 1;
    
    // 验证行索引是否有效
    if (actualRowIndex <= 0 || actualRowIndex >= sheet.getRowCount()) {
      console.error(`无效的行索引: ${rowIndex}`);
      return;
    }
    
    // 获取指定行的单元格并触发删除操作
    const cell = sheet.findCellByPosition(actualRowIndex, 0);
    if (cell) {
      cell.newAction('deleteSelfRow');
      console.log(`从表格 ${sheet.name} 中删除了行 ${rowIndex}`);
    }
  } catch (error) {
    console.error('删除行时出错:', error);
  }
}
```

### 行更新

要更新特定表格中的现有行：

```typescript
import { BASE } from 'st-memory-enhancement/manager';

/**
 * 更新特定表格中的现有行
 * @param sheetUid - 表格的唯一标识符
 * @param rowIndex - 要更新的行的索引 (从 0 开始，不包括标题行)
 * @param rowData - 要更新的列值的对象 (键是列索引，值是单元格内容)
 */
function updateTableRow(sheetUid: string, rowIndex: number, rowData: Record<number, string>): void {
  const sheet = new BASE.Sheet(sheetUid);
  
  if (!sheet) {
    console.error(`未找到表格: ${sheetUid}`);
    return;
  }
  
  try {
    // 调整 rowIndex 以考虑标题行
    const actualRowIndex = rowIndex + 1;
    
    // 验证行索引是否有效
    if (actualRowIndex <= 0 || actualRowIndex >= sheet.getRowCount()) {
      console.error(`无效的行索引: ${rowIndex}`);
      return;
    }
    
    // 更新每个指定的单元格
    Object.entries(rowData).forEach(([colIndexStr, value]) => {
      const colIndex = parseInt(colIndexStr) + 1; // +1 因为第一列是行索引
      const cell = sheet.findCellByPosition(actualRowIndex, colIndex);
      if (cell) {
        cell.data.value = String(value).replace(/,/g, '/'); // 将逗号替换为斜杠
      }
    });
    
    // 保存更改
    sheet.save();
    console.log(`在表格 ${sheet.name} 中更新了行 ${rowIndex}`);
  } catch (error) {
    console.error('更新行时出错:', error);
  }
}
```

## 用户创建表格模板

### 模板创建流程

为了让用户能够创建表格模板，请实现以下 UI 流程：

1. 在您的界面中提供一个“创建模板”按钮
2. 单击后，创建一个新的 SheetTemplate 实例：

```typescript
import { BASE } from 'st-memory-enhancement/manager';

function createNewTemplate(): void {
  // 创建一个具有 2 列和 2 行的新模板
  const newTemplate = new BASE.SheetTemplate().createNewTemplate(2, 2, true);
  
  // 获取新模板的 ID
  const newTemplateUid = newTemplate.uid;
  
  // 默认选择新模板
  const currentSelectedTemplates = USER.getSettings().table_selected_sheets || [];
  USER.getSettings().table_selected_sheets = [...currentSelectedTemplates, newTemplateUid];
  USER.saveSettings();
  
  // 刷新模板视图（如果使用插件的 UI）
  BASE.refreshTempView();
  
  // 或者提供您自己的 UI 更新机制
  refreshTemplatesList();
}
```

### 模板配置选项

用户可以配置的模板属性：

1. **基本属性**:
   - 模板名称
   - 表格类型（动态、静态等）
   - 自定义样式

2. **列和行配置**:
   - 带有描述的列标题
   - 带有描述的行标题
   - 值唯一性约束

3. **表格规则**:
   - 初始化提示
   - 插入提示
   - 删除提示
   - 更新提示

示例 UI 表单配置可在 `tableTemplateEditView.js` 中找到：

```typescript
interface TemplateConfig {
  name: string;
  type: 'free' | 'dynamic' | 'fixed' | 'static';
  note: string;
  initNode: string;
  insertNode: string;
  deleteNode: string;
  updateNode: string;
}

interface ColumnConfig {
  value: string;
  valueIsOnly: boolean;
  columnDataType: 'text' | 'number' | 'option';
  columnNote: string;
}

// 为这些配置实现表单验证和提交
```

## 用户编辑表格

### 编辑现有表格

用户可以通过以下方法手动编辑表格：

1. **直接单元格编辑**:
   - 单击单元格以打开编辑对话框
   - 直接编辑单元格内容
   - 保存更改

```typescript
import { BASE } from 'st-memory-enhancement/manager';

async function editCellContent(sheetUid: string, rowIndex: number, colIndex: number, newValue: string): Promise<void> {
  const sheet = new BASE.Sheet(sheetUid);
  
  if (!sheet) {
    console.error(`未找到表格: ${sheetUid}`);
    return;
  }
  
  try {
    const cell = sheet.findCellByPosition(rowIndex, colIndex);
    if (cell) {
      // 更新单元格值
      cell.data.value = newValue;
      
      // 刷新表格视图
      BASE.refreshContextView(true);
    }
  } catch (error) {
    console.error('编辑单元格时出错:', error);
  }
}
```

### 单元格操作

用户可以使用以下单元格操作：

1. **单元格编辑** - 修改单个单元格的内容
2. **行操作**:
   - 在上方/下方插入行
   - 删除行
3. **列操作**:
   - 在左侧/右侧插入列
   - 删除列
4. **查看单元格历史记录** - 查看单元格的先前值

上下文菜单的示例实现：

```typescript
function showCellContextMenu(sheet, cell, rowIndex, colIndex): void {
  const menu = new PopupMenu();
  
  // 常规单元格选项
  if (rowIndex > 0 && colIndex > 0) {
    menu.add('<i class="fa fa-i-cursor"></i> 编辑单元格', async () => {
      // 打开单元格编辑对话框
      await cellDataEdit(cell);
    });
    
    menu.add('<i class="fa-solid fa-clock-rotate-left"></i> 查看历史记录', async () => {
      // 打开单元格历史记录对话框
      await cellHistoryView(cell);
    });
  }
  
  // 第一列（行标题）选项
  else if (colIndex === 0 && rowIndex > 0) {
    menu.add('<i class="fa fa-arrow-up"></i> 在上方插入行', () => {
      cell.newAction('insertUpRow');
    });
    
    menu.add('<i class="fa fa-arrow-down"></i> 在下方插入行', () => {
      cell.newAction('insertDownRow');
    });
    
    menu.add('<i class="fa fa-trash-alt"></i> 删除行', () => {
      cell.newAction('deleteSelfRow');
    });
  }
  
  // 显示菜单
  menu.show(x, y);
}
```

### 表格刷新操作

用户可以使用在 `profile_prompts.js` 中定义的各种策略来刷新表格：

```typescript
import { rebuildSheets } from 'st-memory-enhancement/core/runtime/absoluteRefresh';

function refreshTablesWithStrategy(strategyKey: string): void {
  // 设置刷新策略
  document.getElementById('table_refresh_type_selector').value = strategyKey;
  
  // 触发重建
  rebuildSheets();
}
```

可用的刷新策略包括：
- `rebuild_base`: 使用自动修复更新（推荐）
- `rebuild_compatible`: 兼容自定义表格的模式
- `rebuild_fix_all`: 修复错误而不添加新内容
- `rebuild_simplify_all`: 修复错误并简化冗长的内容

## AI 表格操作提示示例

以下示例展示了如何基于 `profile_prompts.js` 构建用于不同表格操作的提示。

### 基础重建提示

这是使用自动修复更新表格的标准提示：

```typescript
const baseRebuildPrompt = {
  systemPrompt: `你是一名专业的表格整理助手。请严格遵守用户指示和格式要求来处理表格数据。`,
  
  userPrompt: `请根据 <处理规则> 和 <聊天记录> 处理 <当前表格>，并以完全相同的格式回复 <新表格>。回复必须是中文，仅包含 <新表格> 内容，不包含额外的解释或想法。`,
  
  processingRules: `
  {
    "TableProcessingProtocol": {
      "LanguageSpecification": {
        "OutputLanguage": "Chinese",
        "FormatRequirements": {
          "ProhibitedContent": ["comments", "redundant Markdown markup"]
        }
      },
      "StructuralProtection": {
        "TableFrameworkPolicy": {
          "ProhibitedOperations": ["column addition/deletion", "header modification"],
          "AllowedOperations": ["row insertion", "cell update"]
        }
      },
      "ProcessingWorkflow": ["Supplement", "Simplify", "Correct"],

      "Supplement": {
        "NewRowRules": {
          "ApplicableScope": "all tables except 时空表格",
          "TriggerCondition": "existence of unrecorded valid events",
          "InsertionLimitation": "batch insertion permitted"
        },
        "CellCompletionRules": {
          "InformationSourceRestriction": "explicitly mentioned in chat logs only",
          "NullValueHandling": "prohibit speculative content"
        }
      },

      "Simplify": {
        "TextCompressionRules": {
          "ActivationCondition": "cell character count >20",
          "ProcessingMethods": ["remove redundant terms", "merge synonymous items"],
          "ProhibitedActions": ["omit core facts", "alter data semantics"]
        }
      },

      "Correct": {
        "FormatStandardization": {
          "DelimiterStandard": "/",
          "StringSpecification": {
            "ForbiddenCharacters": ["double quotes"],
            "EscapeHandling": "direct removal"
          }
        },
        "ContentCheck": {
          "General Rule": {
              "Processing Steps": [
                  "1. Split cell content by '/' into individual elements",
                  "2. For each element:",
                  "   a. Check against current column's exclusion list",
                  "   b. If element contains excluded attributes:",
                  "      i. Identify target column in same row that allows this attribute",
                  "      ii. Move element to identified target column",
                  "      iii. Remove from original column",
                  "3. Rejoin elements with '/' in both original and target columns"
              ],
              "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
          },
          "Example_Column Rules": {
              "Personality": {"Excluded Attributes": ["attitudes", "emotions", "thoughts"]},
              "Character Information": {"Excluded Attributes": ["attitudes", "personality", "thoughts"]},
              "Attitude": {"Excluded Attributes": ["personality", "status"]}
          }
        },
        "ContentUnificationRules": {
          "FormatInheritanceStrategy": {
            "TimeFormat": "inherit dominant format from existing table",
            "LocationFormat": "maintain existing hierarchical structure",
            "NumericalFormat": "preserve current measurement scale"
          }
        },
        "TableSpecificRules": {
          "时空表格": "retain only the latest row when multiple exist",
          "角色特征表格": "merge duplicate character entries",
          "角色与<user>社交表格": "delete rows containing <user>",
          "FeatureUpdateLogic": "synchronize latest status descriptions"
        },
        "GlobalCleanupRules": {
          "DuplicateDataPurge": "remove fully identical rows"
        }
      }
    }
  }
  `
};
```

### 兼容重建提示

此提示适用于自定义表格：

```typescript
const compatibleRebuildPrompt = {
  systemPrompt: `你是一名专业的表格整理助手。请严格遵守用户指示和格式要求来处理表格数据。`,
  
  userPrompt: `请根据 <处理规则> 和 <聊天记录> 处理 <当前表格>，并以完全相同的格式回复 <新表格>。回复必须是中文，仅包含 <新表格> 内容，不包含额外的解释或想法。`,
  
  // 与基础重建相同的核心规则，但对自定义表格结构的处理方式不同
  processingRules: `
  {
    "TableProcessingProtocol": {
      // 与基础重建类似，但对自定义结构更灵活
      "StructuralProtection": {
        "TableFrameworkPolicy": {
          "ProhibitedOperations": ["column addition/deletion", "header modification"],
          "AllowedOperations": ["row insertion", "cell update"]
        }
      },
      // 其余规则与 baseRebuildPrompt 类似
    }
  }
  `
};
```

### 表格数据修复和简化提示

此提示侧重于修复错误和简化内容，而不添加新信息：

```typescript
const fixAndSimplifyPrompt = {
  systemPrompt: `你是一名专业的表格整理助手。请严格遵守用户指示和格式要求来处理表格数据。`,
  
  userPrompt: `请根据 <处理规则> 处理 <当前表格>，并以完全相同的格式回复 <新表格>。回复必须是中文，仅包含 <新表格> 内容，不包含额外的解释或想法。`,
  
  processingRules: `
  {
    "ProcessingRules": {
      "MandatoryRules": {
        "Language": "使用中文回复",
        "TableStructure": "不要添加/删除/修改表格结构或标题",
        "CellFormatting": "单元格中不能有逗号，使用 / 进行语义分隔",
        "StringFormat": "字符串中不能有双引号",
        "Markdown": "没有注释或额外的 Markdown 标签"
      },
      "FormatChecks": {
        "Standardization": "统一时间/地点/好感度格式",
        "TableSpecific": {
          "时空表格": "如果存在多个，则仅保留最新一行",
          "角色特征表格": "合并重复的角色条目",
          "角色与<user>社交表格": {
            "DuplicateHandling": "删除包含 <user> 的行"
          }
        },
        "ContentMaintenance": {
          "ExpiredUpdates": "刷新过时的角色特征",
          "DuplicateRemoval": "删除相同的行"
        }
      },
      "ContentChecks": {
        "ColumnValidation": {
          "Target": "验证数据是否与列类别匹配",
          "General Rule": {
            "Processing Steps": [
              "1. Split cell content by '/' into individual elements",
              "2. For each element:",
              "   a. Check against current column's exclusion list",
              "   b. If element contains excluded attributes:",
              "      i. Identify target column in same row that allows this attribute",
              "      ii. Move element to identified target column",
              "      iii. Remove from original column",
              "3. Rejoin elements with '/' in both original and target columns"
            ],
            "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
          }
        },
        "ConflictResolution": {
          "DataConsistency": "解决矛盾的描述",
          "ConflictHandling": "优先考虑表格内部的证据"
        },
        "SimplificationCheck": {
          "Check cells exceeding 15 characters": "如果可能，将内容简化到 15 个字符以下"
        }
      },
      "FinalRequirement": "保留没有问题的内容，不做修改"
    }
  }
  `
};
```

在您的系统中实现这些提示时，通过组合系统提示、用户提示、处理规则，并附加当前表格和相关的聊天历史记录来构建最终提示。

---

## TypeScript 集成注意事项

1. **错误处理**: 在所有 API 调用周围实现 try-catch 块以正确处理异常。

2. **类型定义**: 为所有数据结构创建 TypeScript 接口，以确保类型安全。

3. **事件系统**: 考虑使用事件系统在表格更改时通知您的应用程序。

4. **异步操作**: 将所有表格操作作为异步操作处理，以防止 UI 卡顿。

5. **用户权限**: 在允许表格修改之前，实施适当的权限检查。

通过遵循本集成指南，您将能够在基于 TypeScript 的系统中充分利用 SillyTavern 记忆增强插件的全部功能。