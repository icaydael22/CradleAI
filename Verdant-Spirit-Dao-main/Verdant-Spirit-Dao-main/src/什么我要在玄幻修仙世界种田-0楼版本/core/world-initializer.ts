import { useGenerationStore } from '../stores/app/generationStore';
import { IWorldviewDefinition } from '../data/worldview-data';
import { logger } from './logger';

// @ts-ignore
declare const toastr: any;
// @ts-ignore
declare const generateRaw: (options: any) => Promise<void>;
// @ts-ignore
declare const eventOn: (event: string, callback: (...args: any[]) => void) => void;
// @ts-ignore
declare const iframe_events: any;

/**
 * 调用LLM生成初始世界地图和世界观细节。
 * @param playerSetup 玩家在开局时选择的设定对象。
 * @param worldview 玩家当前激活的世界观设定。
 * @returns 一个包含 initial_map 和 worldview_details 的对象。
 */
export const generateInitialWorld = async (playerSetup: any, worldview: IWorldviewDefinition): Promise<any> => {
  logger('info', 'Generation', '`generateInitialWorld` called.', { playerSetup, worldview });
  const generationStore = useGenerationStore();
  generationStore.isGeneratingWorld = true;

  try {
    // 1. 根据传入的世界观动态定义核心世界观
    const core_worldview = `你将要构建的世界名为‘${worldview.worldName}’，世界观简述为：“${worldview.description}”。其核心力量体系是“${worldview.powerSystem.name}”，具体描述为：“${worldview.powerSystem.description}”。玩家扮演一位意外穿越到此的现代农学学生，流落到一个名为‘洄潮屿’的神秘海岛上。核心玩法围绕‘种田’、‘生存’和‘探索’展开，风格为慢节奏养成。弱化战斗，强调利用知识和智慧创造生活。`;

    // 2. 构建完整的Prompt
    const worldGenerationPrompt = `
# 角色
你是一位经验丰富的文字冒险游戏（MUD）的世界构建大师和地下城主（DM）。

# 任务
你的任务是为一个名为《什么？我要在玄幻修仙世界种田？》的游戏生成个性化的开局世界。你必须严格根据我提供的【核心世界观】、【详细世界观设定】和【玩家开局设定】，生成一个结构化的JSON对象作为回复。

## 规则
1.  **严格的JSON格式**: 你的回复必须是一个完整的、可被解析的JSON对象，不能包含任何JSON格式之外的解释性文字。
2.  **叙事驱动**: 所有生成的内容都应服务于叙事，并与玩家的选择和世界观紧密相连。
3.  **创造力与一致性**: 在遵循设定的前提下，发挥你的创造力，让每个开局都充满独特的魅力和神秘感。
4.  **设定一致性**: 对于力量体系，我们严格遵守核心世界观中的设定，即使下方的玩家开局设定的信息与之不符（主要为异世力量的不符）。

---

## 思维链指南 (世界生成)

/*
<thinking>
1.  **解析核心设定**: 首先，我需要仔细阅读并理解【核心世界观】、【详细世界观设定】和【玩家开局设定】。这是我所有创造的基础。
    *   世界的核心力量体系是什么？（例如：符文、斗气）
    *   玩家的初始地点、环境、心态和特长是什么？这些将直接影响地图和叙事元素的生成。
2.  **构思初始地图 (initial_map)**:
    *   **确定起点**: 玩家的 currentPlayerLocation 必须是【玩家开局设定】中选择的地点。我会以此为中心构建地图。
    *   **设计关联区域**: 我需要创造2到4个与起点直接或间接相连的区域。这些区域的设计必须反映【环境】设定。例如，如果环境是“火山”，那么周围就应该有“熔岩河”、“地热洞穴”等地貌。
    *   **描绘区域细节**: 为每个区域编写独特的 description，并打上合适的 tags。risk_level 和 reward_potential 需要根据描述和世界观来合理设定。
    *   **建立连接**: 设计 connections，确保地图的连通性。连接的描述和风险等级也需要符合逻辑。
3.  **构思世界观细节 (worldview_details)**:
    *   **生成传闻 (rumors)**: 基于【核心世界观】和玩家的【环境】选择，构思1-2条宏大且神秘的长期传闻线索。例如，如果玩家在“孤岛”，传闻可以是关于这座岛的起源或隐藏的秘密。
    *   **创造图鉴条目 (pokedex_entries)**: 根据【环境】设定，创造1-2个独特的生物或植物。它们的“习性”和“描述”必须与环境相匹配。例如，“危机四伏”的环境就应该有更具攻击性的生物。
    *   **设计奇遇线索 (adventure_hooks)**: 这条线索必须与玩家的【心态】或【凡人特长】挂钩。例如，如果玩家是“探究者”，线索可以是一个神秘的古代遗迹或一段无法解读的铭文，其触发条件应明确指向玩家的特质。
4.  **构建最终JSON**: 我将严格按照【输出要求】中定义的 initial_map 和 worldview_details 数据结构，将以上所有构思填充进去，形成一个完整、无误的JSON对象。我会仔细检查所有ID的唯一性和关联性。
</thinking>
*/

---

## 输入信息

### 核心世界观
${core_worldview}

### 详细世界观设定
\`\`\`json
${JSON.stringify(worldview, null, 2)}
\`\`\`

### 玩家开局设定
\`\`\`json
${JSON.stringify(playerSetup, null, 2)}
\`\`\`

---

## 输出要求

请根据以上输入信息，生成一个包含 \`initial_map\` 和 \`worldview_details\` 两个顶级键的JSON对象。

### 1. \`initial_map\`

生成一个包含3到5个互相关联区域的初始地图。

- 玩家的初始位置（\`currentPlayerLocation\`）必须是【玩家开局设定】中选择的地点。
- 地图区域的特征应反映玩家选择的【环境】设定。例如，如果玩家选择了“深海海沟”，初始区域附近就应该有一个通往海边的连接，且描述中可以暗示深海的危险。
- 严格遵循以下数据结构：

    \`\`\`json
    {
      "regions": {
        "region_unique_id": {
          "region_id": "region_unique_id",
          "name": "区域名称",
          "description": "区域的详细描述",
          "status": "unvisited",
          "tags": ["标签1", "标签2"],
          "properties": {
            "reward_potential": 5
          },
          "risk_level": 2
        }
      },
      "connections": [
        {
          "from_region": "region_unique_id_1",
          "to_region": "region_unique_id_2",
          "description": "连接的描述",
          "direction": "方向",
          "is_visible": true,
          "conditions": [],
          "travel_time": 1,
          "risk_level": 1
        }
      ],
      "currentPlayerLocation": "玩家所在的region_id"
    }
    \`\`\`

### 2. \`worldview_details\`

生成一系列“待发现”的叙事元素，用于丰富世界。这些内容将作为背景资料供后续游戏参考，不会立即展示给玩家。

- 所有内容都必须与【玩家开局设定】紧密相关。
- **\`rumors\`**: 生成1-2条长期传闻线索。
  - 如果玩家选择了“孤岛”，可以生成一条关于“为何此地是唯一陆地”的古老传说。
  - 传闻类型应为 \`'hook'\`，为玩家提供长期的探索目标。
- **\`pokedex_entries\`**: 生成1-2个独特的图鉴条目。
  - 必须与玩家选择的【环境】（生物、海底等）相关。例如，选择了“危机四伏”，就创造一种独特的攻击性生物。
- **\`adventure_hooks\`**: 生成1条奇遇线索。
  - 必须与玩家选择的【心态】或【凡人特长】相关。例如，选择了“探究者”，可以设计一个关于古代遗迹或神秘符号的发现之旅的开端。
- 严格遵循以下数据结构：

    \`\`\`json
    {
      "rumors": [
        {
          "id": "rumor_unique_id",
          "content": "传闻内容",
          "type": "hook",
          "source_location": "（可选）传闻最可能发源的地点",
          "related_entities": ["相关实体"],
          "created_date": "1-1-1",
          "status": "active"
        }
      ],
      "pokedex_entries": [
        {
          "名称": "...",
          "类别": "妖兽 | 植物",
          "描述": "...",
          "习性": "..."
        }
      ],
      "adventure_hooks": [
        {
          "描述": "...",
          "触发条件": "当玩家表现出[探究者]特质时（例如：研究未知物品）"
        }
      ]
    }
    \`\`\`

---

请现在开始生成完整的JSON输出。
\`\`\`json
`;

    logger('info','Generation','The world generate prompt is:',worldGenerationPrompt);

    // 3. 调用主LLM API
    const generationId = `world-gen-${crypto.randomUUID()}`;
    const response = await new Promise<string>((resolve, reject) => {
      const handleGenerationEnd = (text: string, id: string) => {
        if (id === generationId) {
          // 移除监听器以避免内存泄漏
          // 注意：旧版eventOn没有提供移除单个监听器的标准方法，这里假设一次性监听
          logger('info', 'Generation', 'Received GENERATION_ENDED event for world generation.', { id });
          resolve(text);
        }
      };

      // 注册一次性事件监听器
      eventOn(iframe_events.GENERATION_ENDED, handleGenerationEnd);

      // 发送生成请求
      generateRaw({
        ordered_prompts: [
          { role: 'system', content: worldGenerationPrompt },
        ],
        should_stream: false, // 即使不使用流，结果也通过事件返回
        generation_id: generationId,
      }).catch(err => {
        // 如果generateRaw本身在发送时就失败了，则直接reject
        logger('error', 'Generation', 'generateRaw call failed before completion.', err);
        reject(err);
      });
    });

    // 4. 解析并返回结果
    logger('info', 'Generation', 'Received raw response for initial world.', { response });
    
    // 提取被 ```json 包裹的内容
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = response.match(jsonRegex);

    if (!match || !match[1]) {
      throw new Error('无法在LLM的回复中找到有效的JSON代码块。');
    }

    const jsonString = match[1];

    try {
      let parsedResult = JSON.parse(jsonString);
      logger('info', 'Generation', 'Successfully parsed initial world data.', { parsedResult });

      // 保底机制：强制替换所有“灵气”为自定义力量名称
      const powerSystemName = worldview.powerSystem.name;
      if (powerSystemName !== '灵气') {
        logger('info', 'Generation', `Applying fallback replacement for '灵气' with '${powerSystemName}'.`);
        let resultString = JSON.stringify(parsedResult);
        // 使用正则表达式进行全局替换
        resultString = resultString.replace(/灵气/g, powerSystemName);
        parsedResult = JSON.parse(resultString);
        logger('info', 'Generation', 'Fallback replacement applied successfully.', { parsedResult });
      }

      return parsedResult;
    } catch (parseError) {
      logger('error', 'Generation', 'Failed to parse JSON response from LLM.', { jsonString, parseError });
      throw new Error('解析LLM返回的JSON数据时失败。');
    }

  } catch (error) {
    logger('error', 'Generation', 'Initial world generation failed.', error);
    toastr.error('初始世界生成失败，请查看控制台获取详细信息。');
    throw error; // 将错误继续向上抛出，以便调用者可以处理
  } finally {
    generationStore.isGeneratingWorld = false;
  }
};
