/**
 * 体验管理器 (ExpManager) 的AI提示模板
 * 
 * 该模块负责生成用于体验管理的AI提示，用于在剧本内容生成后
 * 进行额外的变量系统操作和体验增强。
 */

export interface ExpPromptParams {
  /** 剧本ID */
  scriptId: string;
  /** 用户名称 */
  userName: string;
  /** 最后一次用户消息 */
  lastUserMessage: string;
  /** 上一次AI响应内容 */
  lastAiResponse: string;
  /** 当前剧本上下文（可选） */
  scriptContext?: string;
  /** 角色信息（可选） */
  characterInfo?: string;
  /** 变量提示内容数组 */
  variablePrompt?: Array<{ role: string; content: string }>;
  /** 剧本摘要 */
  scriptSummary?: string;
  /** 私聊摘要 */
  privateSummary?: string;
  /** 当前聊天指导 */
  guidanceCurrentChat?: string;
  /** 当前剧本指导 */
  guidanceCurrentScript?: string;
  /** 最近剧本历史 */
  scriptHistoryRecent?: string;
  /** 最近角色聊天历史 */
  characterChatRecent?: string;
  /** ToDoList JSON 字符串（可选，未注册时为空字符串） */
  ToDoList?: string;
}

/**
 * 构建体验管理器的AI提示
 * 
 * 该提示的目的是：
 * 1. 基于刚生成的剧本内容，分析当前情境
 * 2. 生成适当的变量操作命令，增强玩家体验
 * 3. 可能包括设置隐藏变量、更新角色关系、调整剧情标记等
 * 
 * @param params 提示参数
 * @returns 格式化的消息数组
 */
export function buildExpPrompt(params: ExpPromptParams): Array<{ role: string; content: string }> {
  const {
    userName,
    lastUserMessage,
    lastAiResponse,
    variablePrompt,
    scriptHistoryRecent,
    characterChatRecent,
    ToDoList,
  } = params;

  const messages: Array<{ role: string; content: string }> = [];

  // 1. 插入 variablePrompt 消息数组（带分隔符包装）
  if (variablePrompt && variablePrompt.length > 0) {
    // 添加开始分隔符
    messages.push({
      role: 'user',
      content: '======剧本设定内容开始======'
    });
    
    // 插入 variablePrompt 消息数组
    messages.push(...variablePrompt);
    
    // 添加结束分隔符
    messages.push({
      role: 'user',
      content: '======剧本设定内容结束======'
    });
  }

  // 2. 插入 scriptHistoryRecent 作为 assistant 消息（带分隔符包装）
  if (scriptHistoryRecent && scriptHistoryRecent.trim() !== '' && scriptHistoryRecent !== '暂无剧本历史') {
    // 添加开始分隔符
    messages.push({
      role: 'user',
      content: '======近期剧本历史开始======'
    });
    
    // 插入 scriptHistoryRecent 内容
    messages.push({
      role: 'assistant',
      content: scriptHistoryRecent
    });
    
    // 添加结束分隔符
    messages.push({
      role: 'user',
      content: '======近期剧本历史结束======'
    });
  }

  // 3. 主要的体验管理器提示内容
  const mainPromptContent = `# 你的核心使命
你是一个体验管理器。你的核心使命是维护叙事的一致性、沉浸感和作者意图。你通过一个结构化的推理过程（Chain of Thought）来分析现状，并最终输出对剧情的**描述性指导**。

## 最近各角色和用户的聊天历史
${characterChatRecent || '暂无聊天历史'}

## 当前用户信息
- 用户名: ${userName}
- 用户最后消息: ${lastUserMessage}

## 刚生成的剧本内容
${lastAiResponse}

# 工作流程：强制结构化思考（CoT）
**在输出任何指令前，你必须严格地在<thinking>标签内完成以下推理步骤：**

\`\`\`xml
<thinking>
1.  【状态感知】：
    - 回顾【ToDo List数据结构】：当前叙事处于什么阶段？哪些节点已完成？哪些正在进行？哪些尚未触发？
    - 分析【用户画像】：玩家最近的行为表明TA是什么风格？（探索型/目标驱动型/混乱型）
    - 评估当前上下文：刚刚发生的事件对剧情核心推动力是什么？

2.  【问题检测与优先级排序】：
    - **角色一致性检查（三维度）**：
        a. **外观与设定**：角色的外观是否与设定不符？
        b. **言行与对话**：对话的语气、用词、知识范围是否符合其身份、年龄、背景和当前情绪状态？
        c. **动机与决策**：角色的行为选择是否与其核心目标、信念和人际关系一致？
    - **情节连贯性检查**：当前剧情是否自然地从上一个事件衍生？是否意外地触发了未来才能发生的【TO DO】节点？是否完全遗漏了当前应推动的节点？
    - **信息披露检查**：对照【信息索引】，当前是否到了披露某条关键信息的最佳时机？是否有信息被提前剧透？

3.  【决策制定】：
    - 基于以上分析，决定需要采取哪几类干预措施（角色校正、情节引导、信息管理、情感调整）。
    - 为每类干预设计具体、可执行的方案。

4.  【输出格式化】：
    - 将决策转化为清晰的XML指令。
</thinking>
\`\`\`

# **ToDo List** (剧情里程碑清单)

## 当前 ToDoList 状态（如果下面没有看到ToDoList的JSON结构，请按要求注册）
${ToDoList || '""'}

## ToDoList 数据结构规范

## ToDoList 生成策略与规则

- 如果 ToDoList 变量尚未注册（显示为空字符串），你必须创建完整的初始结构
- 如果已存在但内容不完整，补充缺失的字段
- 确保所有数组字段都被正确初始化（即使为空数组 []）

ToDoList 必须严格遵循以下 JSON 结构：

\`\`\`json
{
  "chapterList": [],        // AI从剧情中提炼的章节标题列表
  "currentChapter": [],     // 当前所在章节名称（初次注册时为第一个章节）
  "currentToDoList": [],    // 当前章节的待办事项列表
  "completed": [],          // 已完成的待办事项
  "in_progress": [],        // 正在进行的待办事项（通常只有1-2项）
  "pending": []             // 尚未开始的待办事项
}
\`\`\`


## 状态分类规则
- **completed**: 剧情中已明确完成的任务（有明显完成标志）
- **in_progress**: 当前剧情正在推进的任务（通常1-2个）
- **pending**: 已知但尚未开始的任务

## ToDoList输出格式要求
ToDoList 必须输出为完整的 JSON 字符串，使用以下 XML 格式：

**完整注册语法：**
\`\`\`xml
<setVar name="ToDoList" value="{"chapterList":["章节1","章节2"],"currentChapter":"章节1","currentToDoList":[{"id":"task1","title":"任务描述"}],"completed":[],"in_progress":["task1"],"pending":[]}"></setVar>
\`\`\`

**部分修改语法（支持点号路径）：**
\`\`\`xml
<setVar name="ToDoList.chapterList.0" value="新章节名">修改第一章节</setVar>
<setVar name="ToDoList.in_progress.0" value="新任务ID">修改进行中任务</setVar>
<setVar name="ToDoList.currentToDoList.1.title" value="新任务标题">修改任务标题</setVar>
\`\`\`


# 最终输出指令格式
你的输出必须是且只是xml：

\`\`\`xml
 <setVar name="guidanceCurrentScript" value="值"></setVar> //为剧情提供描述性指导
 <setVar name="privateSummary" value="值"></setVar> //生成私聊摘要
 <setVar name="scriptSummary" value="值"></setVar> //生成剧情摘要
 <setVar name="ToDoList" value="值"></setVar> //注册或更新值为JSON对象的ToDoList，提供给剧本
\`\`\``;

  // 4. 添加主要提示内容作为 user 消息
  messages.push({
    role: 'user',
    content: mainPromptContent
  });

  return messages;
}

/**
 * 验证提示参数的完整性
 * 
 * @param params 提示参数
 * @returns 验证结果和错误信息
 */
export function validateExpPromptParams(params: ExpPromptParams): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!params.scriptId || params.scriptId.trim() === '') {
    errors.push('scriptId 不能为空');
  }

  if (!params.userName || params.userName.trim() === '') {
    errors.push('userName 不能为空');
  }

  if (!params.lastUserMessage || params.lastUserMessage.trim() === '') {
    errors.push('lastUserMessage 不能为空');
  }

  if (!params.lastAiResponse || params.lastAiResponse.trim() === '') {
    errors.push('lastAiResponse 不能为空');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
