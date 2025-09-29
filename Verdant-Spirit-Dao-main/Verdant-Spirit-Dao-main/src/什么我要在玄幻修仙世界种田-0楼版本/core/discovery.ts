/**
 * @file 揭示系统 (Discovery System)
 * @description 负责处理世界观条目从 "undiscovered" 到 "known" 状态的转变逻辑。
 */

import { useWorldStore } from '../stores/core/worldStore';
import { logger } from './logger';

import { useSearchStore } from '../stores/modules/searchStore';

/**
 * 检查玩家的行动选项是否与任何未揭示的传闻相关联。
 * @param actionOptions - 从状态栏解析出的玩家可选行动描述数组。
 * @returns 一个准备注入到Prompt中的提示字符串，或者在没有匹配时返回null。
 */
export function checkForDiscovery(actionOptions: string[]): string | null {
  if (!actionOptions || actionOptions.length === 0) {
    return null;
  }

  const worldStore = useWorldStore();
  const searchStore = useSearchStore();
  
  const undiscoveredRumors = (worldStore.world?.世界观?.rumors || []).filter(r => r.status === 'undiscovered');

  if (undiscoveredRumors.length === 0) {
    return null;
  }

  // 确保传闻搜索索引存在
  if (!searchStore.fuseInstances.has('rumors')) {
    logger('warn', 'Discovery', '传闻搜索索引 (rumors) 尚未初始化。跳过揭示检查。');
    return null;
  }

  const hints = new Set<string>();

  for (const option of actionOptions) {
    // 对每个行动选项在“未揭示的传闻”中进行模糊搜索
    const results = searchStore.search('rumors', option);
    
    // 检查搜索结果是否包含任何真正未揭示的传闻
    const matchedUndiscoveredRumors = results
      .map(result => result.item)
      .filter(rumor => undiscoveredRumors.some(ur => ur.id === rumor.id));

    if (matchedUndiscoveredRumors.length > 0) {
      for (const rumor of matchedUndiscoveredRumors) {
        logger('info', 'Discovery', `行动选项 "${option}" 匹配到未揭示的传闻: "${rumor.content}"`);
        hints.add(rumor.content);
      }
    }
  }

  if (hints.size > 0) {
    const hintContent = Array.from(hints).map(h => `'${h}'`).join('、');
    return `[系统提示] 玩家当前的某些行动选项可能与以下信息点相关：${hintContent}。如果叙事时机合适，请自然地引出这些信息，并生成对应的“世界观条目状态更新”事件将其状态更新为 "known"。`;
  }

  return null;
}
