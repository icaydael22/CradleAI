import { defineStore } from 'pinia';
import { z } from 'zod';
import { generateAndParseJson } from '../../core/generation';
import { logger } from '../../core/logger';
import type { IRegion, Rumor } from '../../types';
import { useWorldStore } from '../core/worldStore';
import { useCharacterStore } from '../facades/characterStore';
import { useTimeStore } from './timeStore';

declare const toastr: any;

const MODULE_NAME = 'rumorStore';

// The response can now contain worldview updates.
const RumorResponseSchema = z.array(z.object({
  content: z.string(),
  source_location: z.string(),
  related_entities: z.array(z.string()),
  type: z.enum(['flavor', 'lore', 'hook', 'worldview']),
}));

export const useRumorStore = defineStore('rumor', () => {
  const worldStore = useWorldStore();
  const timeStore = useTimeStore();
  const characterStore = useCharacterStore();

  /**
   * Checks for and generates new rumors or worldview updates based on a daily chance.
   * This function is triggered by a change in the game's day.
   */
  async function checkForRumorGeneration() {
    if (Math.random() > 0.05) {
      logger('info', MODULE_NAME, 'Rumor generation check failed (rolled > 0.05). Skipping.');
      return;
    }

    logger('info', MODULE_NAME, 'Rumor generation check passed. Starting generation process...');

    try {
      // 1. Context Collection
      const mainCharacterName = characterStore.mainCharacterName;
      const mainCharacter = mainCharacterName ? (characterStore.characters as { [key: string]: any })[mainCharacterName] : null;

      const worldContext = {
        地点: worldStore.location,
        天气: worldStore.weather?.当前天气,
        季节: worldStore.weather?.季节,
        节气: worldStore.weather?.节气,
        地图区域: Object.values(worldStore.world?.地图?.regions || {}).map((r: IRegion) => r.name),
      };
      const characterContext = {
        姓名: mainCharacter?.姓名,
        最近动向: `在 ${worldStore.location} 活动`,
      };

      // Add a pre-check to ensure essential context is available
      if (!worldStore.location || worldStore.location === '未知') {
        logger('warn', MODULE_NAME, 'Skipping rumor generation due to missing essential context (e.g., location).');
        return;
      }

      // 2. Prompt Construction
      const prompt = `
# 角色
你是一位经验丰富的文字冒险游戏（MUD）的地下城主（DM），负责动态演化游戏世界。

# 任务
你的任务是根据当前的世界状态，生成1-2条发生在玩家视野之外的背景事件。这些事件可以是普通的“传闻”，也可以是直接改变世界状态的“世界观更新”。

## 规则
1.  **严格的JSON格式**: 你的回复必须是一个完整的、可被解析的JSON数组，不能包含任何JSON格式之外的解释性文字。
2.  **事件类型**: 你必须根据事件的性质，正确设置 \`type\` 字段。
    -   \`'flavor', 'lore', 'hook'\`: 用于普通的叙事性传闻。
    -   \`'worldview'\`: 用于那些应该直接、永久性地改变游戏世界状态的重大事件。
3.  **世界观更新格式**: 当 \`type\` 为 \`'worldview'\` 时，\`content\` 字段必须是一个**JSON字符串**，其内容为一个包含 \`path\` 和 \`value\` 的对象，用于精确地更新世界数据。

---

## 输入信息

### 世界状态
\`\`\`json
${JSON.stringify(worldContext, null, 2)}
\`\`\`

### 玩家近期状态
\`\`\`json
${JSON.stringify(characterContext, null, 2)}
\`\`\`

---

## 输出要求
请根据以上输入信息，生成一个包含1-2个事件对象的JSON数组。
- 严格遵循以下数据结构：
  \`\`\`json
  [
    {
      "content": "如果type是 'flavor', 'lore', 'hook'，这里是传闻的文本内容。如果type是 'worldview'，这里是描述世界变化的JSON字符串，例如 '{\\"path\\":\\"地图.regions.forest_01.description\\",\\"value\\":\\"森林里最近出现了神秘的雾气。\\"}'。",
      "source_location": "事件的缘由或最可能发源的地点名。",
      "related_entities": ["事件关联的实体，如NPC名, 地点名"],
      "type": "事件类型，必须是 'flavor', 'lore', 'hook', 'worldview' 中的一种"
    }
  ]
  \`\`\`

---

请现在开始生成完整的JSON输出。
`;

      // 3. Call the robust JSON generation utility
      const validationResult = await generateAndParseJson(
        {
          method: 'generateRaw',
          config: {
            user_input: prompt,
            ordered_prompts: [{ role: 'system', content: '你是一个JSON生成器。' }, 'user_input'],
          },
          generationId: `rumor-generation-${crypto.randomUUID()}`,
        },
        RumorResponseSchema,
      );

      // 4. Process and commit results to worldStore
      const standardRumors: Rumor[] = [];
      for (const result of validationResult) {
        if (result.type === 'worldview') {
          try {
            const updateInstruction = JSON.parse(result.content);
            if (updateInstruction.path && updateInstruction.value !== undefined) {
              await worldStore.updateWorldState(updateInstruction.path, updateInstruction.value);
              logger('info', MODULE_NAME, `Worldview updated via rumor: path='${updateInstruction.path}'`);
              logger('info', MODULE_NAME, `timeStore.currentDateString in rumorStore: ${timeStore.currentDateString}`); // Change to info log
              // Optionally, create a standard rumor to log this event for the player
              standardRumors.push({
                id: crypto.randomUUID(),
                content: `听说${result.source_location}发生了些变化。`,
                source_location: result.source_location,
                related_entities: result.related_entities,
                type: 'lore',
                created_date: timeStore.currentDateString,
                expiry_date: '',
                status: 'active',
              });
            } else {
              logger('error', MODULE_NAME, 'Invalid worldview update instruction.', { instruction: updateInstruction });
              toastr.error('收到了格式不正确的“世界观更新”传闻，缺少路径或数值。');
            }
          } catch (e) {
            logger('error', MODULE_NAME, 'Failed to parse worldview update content.', { content: result.content, error: e });
            toastr.error('收到了格式不正确的“世界观更新”传闻，内容无法被解析为JSON。');
          }
        } else {
          standardRumors.push({
            ...result,
            id: crypto.randomUUID(),
            created_date: timeStore.currentDateString,
            expiry_date: '', // TODO: Add expiry logic
            status: 'active',
          });
        }
      }

      if (standardRumors.length > 0) {
        worldStore.updateWorldview({ rumors: standardRumors });
        logger('info', MODULE_NAME, 'Successfully generated and added new rumors.', standardRumors);
      }

    } catch (error) {
      logger('error', MODULE_NAME, 'Rumor generation process failed.', error);
      toastr.error(`传闻生成失败: ${error}`, '错误');
    }
  }

  /**
   * Handles the start of a new day.
   * This is called by the store orchestrator in response to the 'newDayStarted' event.
   * @param payload - The event payload.
   */
  function onNewDay(payload: { newDay: number }) {
    logger('info', MODULE_NAME, `New day event received for day ${payload.newDay}. Checking for rumor generation.`);
    return checkForRumorGeneration();
  }

  function initialize() {
    logger('info', MODULE_NAME, 'Rumor generation service initialized.');
  }

  return {
    initialize,
    onNewDay,
  };
});
