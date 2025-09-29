// core/generation.ts
import { useGenerationStore } from '../stores/app/generationStore';
import { logger } from './logger';

// #region 外部依赖声明
// @ts-ignore
declare const toastr: any;
// @ts-ignore
declare const $: any;
// @ts-ignore
declare const generate: (options: any) => Promise<void>;
// @ts-ignore
declare const getVariables: (options?: any) => any;
// @ts-ignore
declare const _: any;
// @ts-ignore
import { z } from 'zod';
import { generateWithSecondaryApi, SecondaryLlmPayload } from './secondaryLlmApi';
declare const generateRaw: (options: any) => Promise<void>;
// #endregion

/**
 * A robust wrapper for `generateWithSecondaryApi` that handles JSON parsing and validation.
 * It includes a retry mechanism for parsing or validation failures.
 *
 * @param payload - The payload for the `generateWithSecondaryApi` call.
 * @param schema - A Zod schema to validate the parsed JSON object.
 * @param maxRetries - The maximum number of retries for parsing/validation failures. Defaults to 3.
 * @returns A promise that resolves to the validated data object.
 * @throws Throws an error if the generation, parsing, or validation fails after all retries.
 */
export async function generateAndParseJson<T extends z.ZodTypeAny>(
  payload: SecondaryLlmPayload,
  schema: T,
  maxRetries = 3,
): Promise<z.infer<T>> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Step 1: Get the raw string response from the LLM.
      // This already includes its own retry logic for API calls and response completion validation.
      const responseJson = await generateWithSecondaryApi(payload);

      // Step 2: Try to parse the string as JSON.
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(responseJson);
      } catch (error) {
        throw new Error(`JSON parsing failed on attempt ${attempt}: ${(error as Error).message}`);
      }

      // Step 3: Validate the parsed JSON against the Zod schema.
      const validationResult = schema.safeParse(parsedJson);
      if (validationResult.success) {
        logger('info', 'generateAndParseJson', `JSON response parsed and validated successfully on attempt ${attempt}.`);
        return validationResult.data;
      } else {
        throw new Error(`Zod validation failed on attempt ${attempt}: ${validationResult.error.toString()}`);
      }
    } catch (error) {
      lastError = error;
      logger('warn', 'generateAndParseJson', `Attempt ${attempt}/${maxRetries} failed.`, error);
      if (attempt < maxRetries) {
        // Optional: Add a small delay before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  logger('error', 'generateAndParseJson', `All ${maxRetries} attempts failed.`, lastError);
  throw new Error(`Failed to generate and parse valid JSON after ${maxRetries} attempts: ${lastError.message}`);
}


/**
 * 发送最终构建好的生成请求给AI。
 * @param userInput - 用户的输入文本。
 * @param chatHistory - 格式化后的聊天记录数组。
 * @param injects - 要注入的提示词数组。
 * @param generationId - 本次生成的唯一ID。
 */
export const sendGenerationRequest = async (userInput: string, chatHistory: any[], injects: any[], generationId: string) => {
  logger('info', 'Generation', '`sendGenerationRequest` called.', { generationId });
  // UI加载状态现在由storyStore在接收到`GENERATION_STARTED`事件时响应式地处理。

  try {
    // 2. 读取流式设置
    const currentVars = getVariables({ type: 'chat' });
    const shouldStream = _.get(currentVars, 'plugin_settings.context_management.shouldStream', true);
    logger('info', 'Generation', `Streaming mode is ${shouldStream ? 'enabled' : 'disabled'}.`);

    // 3. 调用核心生成函数
    await generate({
      user_input: userInput,
      should_stream: shouldStream,
      injects: injects,
      overrides: {
        chat_history: {
          prompts: chatHistory,
        },
      },
      generation_id: generationId,
    });

  } catch (error) {
    logger('error', 'Generation', 'AI generation failed.', error);
    toastr.error('生成请求失败，请查看控制台。');
    
    // 在`GENERATION_ENDED`事件未能触发的情况下，作为后备重置生成状态。
    // 这也会更新store。
    const generationStore = useGenerationStore();
    generationStore.isAiGenerating = false;
    // updateSwipeUI(); // 现在由Vue组件响应式地处理。
  }
};

/**
 * 调用LLM为一个未知的探索方向生成一个新的区域。
 * @param direction - 玩家探索的方向 (e.g., "东方")。
 * @param currentLocation - 玩家当前所在的区域对象。
 * @param recentEventsSummary - 近期事件的摘要。
 */
export const generateNewRegion = async (direction: string, currentLocation: any, recentEventsSummary: string) => {
  logger('info', 'Generation', '`generateNewRegion` called.', { direction, currentLocation });

  const newRegionPrompt = `
# 角色
你是一个充满想象力的游戏叙事引擎和地下城主（DM）。

# 任务
玩家正尝试从一个已知区域向一个全新的、未知的方向探索。你的任务是生成一个“初遇场景”，包括一个新区域的详细信息和连接两个区域的路径。

## 规则
1.  **严格的JSON格式**: 你的回复必须是一个完整的、可被解析的JSON对象，其中只包含一个顶级键 "type"，值为 "新区域发现"。
2.  **叙事连贯性**: 新区域的描述、名称和特征必须与玩家当前的位置和最近的经历保持逻辑上的一致性。
3.  **赋予生命力**: 为新区域和路径赋予合理的风险、潜在回报和旅行时间，让世界感觉更加真实和动态。

---

## 输入信息

### 当前位置信息
\`\`\`json
${JSON.stringify(currentLocation, null, 2)}
\`\`\`

### 玩家意图
- **探索方向**: ${direction}

### 近期事件摘要
${recentEventsSummary}

---

## 输出要求
请以一个JSON对象的形式返回结果，严格遵循以下事件结构：

\`\`\`json
{
  "type": "新区域发现",
  "payload": {
    "new_region": {
      "region_id": "请生成一个独特的ID (例如: forest_02)",
      "name": "请为新区域命名",
      "description": "请详细描述玩家初次进入该区域时看到的景象、感受和氛围",
      "status": "unvisited",
      "tags": ["请根据区域特点生成标签"],
      "properties": {
        "reward_potential": 2 // 请在0-10之间为此区域的潜在回报赋值
      },
      "risk_level": 1 // 请在0-10之间为此区域的危险等级赋值
    },
    "connection": {
      "from_region": "${currentLocation.region_id}",
      "to_region": "请使用上面生成的new_region.region_id",
      "description": "请描述连接两个区域的路径，例如一条小径、一座桥或一个山洞",
      "direction": "${direction}",
      "is_visible": true,
      "conditions": [],
      "travel_time": 1, // 请为此路径的旅行时间赋值 (整数)
      "risk_level": 1 // 请在0-10之间为此路径的危险等级赋值
    }
  }
}
\`\`\`

---

请现在开始生成完整的JSON输出。
\`\`\`json
`;

  try {
    const generationId = `new-region-${crypto.randomUUID()}`;
    await generateRaw({
      ordered_prompts: [
        { role: 'system', content: newRegionPrompt },
      ],
      should_stream: false,
      generation_id: generationId,
    });
    logger('info', 'Generation', `New region generation request sent for direction: ${direction}.`);
  } catch (error) {
    logger('error', 'Generation', 'Failed to send new region generation request.', error);
    toastr.error('生成新区域失败，请查看控制台。');
  }
};
