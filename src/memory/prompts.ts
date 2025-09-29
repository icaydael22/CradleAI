/**
 * 获取事实提取提示词
 * @param content 要分析的内容
 * @param isMultiRound 是否为多轮对话（默认为false）
 * @param options 提示词选项，包括自定义用户称呼和AI称呼
 * @returns [系统提示词, 用户提示词]
 */
export function getFactRetrievalMessages(
  content: string, 
  isMultiRound: boolean = false,
  options: { userName?: string; aiName?: string } = {}
): [string, string] {
  const userName = options.userName || '用户';
  const aiName = options.aiName || 'AI';

  const systemPrompt = `你是一位个人信息组织者，专门负责准确地提取和存储${userName}的事实、记忆和偏好。
你的任务是从对话中提取相关的个人信息并将其组织成不同的、易于管理的事实。
这些信息应该准确、简洁地反映${userName}所说的内容，不要添加推测或想象的细节。

需要关注的信息类型:
1. 个人偏好: ${userName}表达的喜好、厌恶和偏好（例如，"我喜欢民族歌手"）
2. 个人详细信息: 名字、关系、重要日期等
3. ${userName}的观点和意见: 记录${userName}对特定主题的看法
4. ${userName}的经历和回忆: ${userName}分享的过去经历
5. ${userName}的习惯和行为: 常规活动、习惯等

指导原则:
- 提取独立的、原子化的事实（一个事实对应一个明确的信息点）
- 只提取${userName}明确表达的信息，不要推断或假设
- 保持事实简洁，但确保包含足够的上下文
- 以第三人称记录事实（例如"${userName}喜欢民族歌手"而非"我喜欢民族歌手"）
- 优先提取具体而非笼统的信息
- 避免复制完整的对话或不相关的细节
- 忽略打招呼、感谢等社交客套语
- 忽略无信息价值的内容（如"我不知道"）
${isMultiRound ? `
- 这是一次多轮对话分析，你将收到多个${userName}和${aiName}之间的对话轮次
- 请综合分析所有对话内容，提取关键事实
- 避免重复提取相同的事实
- 如果存在矛盾的信息，请以最新的信息为准` : ''}

请以JSON格式返回提取的事实:
{
  "facts": [
    "${userName}喜欢民族歌手",
    "${userName}的名字是李明"
  ]
}

尽可能使事实与${userName}的原始表述保持一致，仅在必要时重新措辞以符合第三人称格式。

请注意，你会收到完整的对话上下文，包括${userName}和${aiName}之间的${isMultiRound ? '多轮' : '最近'}交流。这些上下文可以帮助你更好地理解${userName}表达的信息，但只提取${userName}表达的事实，不要从${aiName}回复中提取信息。`;

  const userPrompt = `以下是${userName}和${aiName}之间的${isMultiRound ? '多轮' : ''}对话，${isMultiRound ? '包含了多次交流' : '包括最近的聊天记录和当前用户的消息'}。请从对话中提取有关${userName}的相关事实和偏好（如果有），并以JSON格式返回它们，如上所示。

${content}

请以有效的JSON格式响应。`;

  return [systemPrompt, userPrompt];
}

/**
 * 获取记忆更新提示词
 * @param retrievedOldMemory 已有记忆
 * @param newRetrievedFacts 新提取的事实
 * @returns 更新提示词
 */
export function getUpdateMemoryMessages(
  retrievedOldMemory: Array<{ id: string; text: string }>,
  newRetrievedFacts: string[],
): string {
  return `你是一个智能记忆管理器，负责控制系统的记忆。
你可以执行四种操作：(1) 添加到记忆, (2) 更新记忆, (3) 从记忆中删除, (4) 不做更改。

基于以上四种操作，记忆将会发生变化。

比较新提取的事实与现有记忆。对每个新事实，决定是否要：
- ADD: 将其作为新元素添加到记忆中
- UPDATE: 更新现有记忆元素
- DELETE: 删除现有记忆元素
- NONE: 不做任何更改（如果事实已经存在或不相关）

以下是选择执行哪种操作的具体指导：

1. **添加(ADD)**：如果提取的事实包含记忆中不存在的新信息，那么你需要添加它。
    - **示例**：
        - 旧记忆:
            [
                {
                    "id" : "0",
                    "text" : "用户是软件工程师"
                }
            ]
        - 提取的事实: ["用户的名字是李明"]
        - 新记忆:
            {
                "memory" : [
                    {
                        "id" : "0",
                        "text" : "用户是软件工程师",
                        "event" : "NONE"
                    },
                    {
                        "id" : "1",
                        "text" : "用户的名字是李明",
                        "event" : "ADD"
                    }
                ]
            }

2. **更新(UPDATE)**：如果提取的事实包含与记忆中已有信息相似但有所不同的内容，则需要更新它。
    如果提取的事实与记忆中的元素表达相同的内容，选择信息量更丰富的一项。
    示例(a)：如果记忆包含"用户喜欢打板球"，而提取的事实是"用户喜欢和朋友一起打板球"，则用提取的事实更新记忆。
    示例(b)：如果记忆包含"用户喜欢芝士披萨"，而提取的事实是"用户爱芝士披萨"，则不需要更新，因为它们表达相同的信息。
    如果指令是更新记忆，则必须更新。
    请注意在更新时保持相同的ID。
    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。
    - **示例**：
        - 旧记忆:
            [
                {
                    "id" : "0",
                    "text" : "用户真的喜欢芝士披萨"
                },
                {
                    "id" : "1",
                    "text" : "用户是软件工程师"
                },
                {
                    "id" : "2",
                    "text" : "用户喜欢打板球"
                }
            ]
        - 提取的事实: ["用户喜欢鸡肉披萨", "用户喜欢和朋友一起打板球"]
        - 新记忆:
            {
            "memory" : [
                    {
                        "id" : "0",
                        "text" : "用户喜欢芝士和鸡肉披萨",
                        "event" : "UPDATE",
                        "old_memory" : "用户真的喜欢芝士披萨"
                    },
                    {
                        "id" : "1",
                        "text" : "用户是软件工程师",
                        "event" : "NONE"
                    },
                    {
                        "id" : "2",
                        "text" : "用户喜欢和朋友一起打板球",
                        "event" : "UPDATE",
                        "old_memory" : "用户喜欢打板球"
                    }
                ]
            }

3. **删除(DELETE)**：如果提取的事实包含与记忆中的信息相矛盾的内容，则必须删除它。或者如果指令是删除记忆，则必须删除它。
    请注意返回输出中的ID应仅来自输入ID，不要生成任何新ID。
    - **示例**：
        - 旧记忆:
            [
                {
                    "id" : "0",
                    "text" : "用户的名字是李明"
                },
                {
                    "id" : "1",
                    "text" : "用户喜欢芝士披萨"
                }
            ]
        - 提取的事实: ["用户不喜欢芝士披萨"]
        - 新记忆:
            {
            "memory" : [
                    {
                        "id" : "0",
                        "text" : "用户的名字是李明",
                        "event" : "NONE"
                    },
                    {
                        "id" : "1",
                        "text" : "用户喜欢芝士披萨",
                        "event" : "DELETE"
                    }
            ]
            }

4. **无变更(NONE)**：如果提取的事实包含的信息已存在于记忆中，则不需要进行任何更改。
    - **示例**：
        - 旧记忆:
            [
                {
                    "id" : "0",
                    "text" : "用户的名字是李明"
                },
                {
                    "id" : "1",
                    "text" : "用户喜欢芝士披萨"
                }
            ]
        - 提取的事实: ["用户的名字是李明"]
        - 新记忆:
            {
            "memory" : [
                    {
                        "id" : "0",
                        "text" : "用户的名字是李明",
                        "event" : "NONE"
                    },
                    {
                        "id" : "1",
                        "text" : "用户喜欢芝士披萨",
                        "event" : "NONE"
                    }
                ]
            }

以下是我到目前为止所收集的记忆内容。你需要仅以下列格式更新它：

${JSON.stringify(retrievedOldMemory, null, 2)}

下面提到了新提取的事实。你需要分析这些新提取的事实，并确定这些事实是否应该在记忆中添加、更新或删除。

${JSON.stringify(newRetrievedFacts, null, 2)}

遵循以下指示：
- 不要从上面提供的自定义少数示例提示返回任何内容。
- 如果当前记忆为空，则需要将新提取的事实添加到记忆中。
- 你应该只以下面所示的JSON格式返回更新后的记忆。如果没有变更，记忆键应保持相同。
- 如果有添加，生成一个新的键并添加相应的新记忆。
- 如果有删除，则应从记忆中删除该记忆键值对。
- 如果有更新，ID键应保持不变，只需更新值。
- 不要返回JSON格式之外的任何内容。
- 不要在JSON字段中添加任何额外的文本或代码块，使其无效，如"\`\`\`json"或"\`\`\`"。

只返回JSON格式，不要返回其他任何内容。`;
}

/**
 * 解析消息
 * @param messages 消息数组
 * @returns 解析后的消息文本
 */
export function parseMessages(messages: string[]): string {
  return messages.join("\n");
}

/**
 * 从LLM响应中删除代码块标记，提取JSON内容
 * @param text LLM响应文本
 * @returns 清理后的JSON文本
 */
export function removeCodeBlocks(text: string): string {
  if (!text) return '';
  
  // First, try to extract content from markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = text.match(codeBlockRegex);
  
  if (match && match[1]) {
    console.log(`[removeCodeBlocks] 从Markdown代码块中提取JSON: ${match[1].substring(0, 50)}...`);
    return match[1].trim();
  }
  
  // If no code blocks found, remove any non-JSON parts at the start and end
  let cleaned = text;
  
  // Remove anything before the first {
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) {
    cleaned = cleaned.substring(firstBrace);
  }
  
  // Remove anything after the last }
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace >= 0 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.substring(0, lastBrace + 1);
  }
  
  console.log(`[removeCodeBlocks] 清理后的JSON: ${cleaned.substring(0, 50)}...`);
  return cleaned;
}
