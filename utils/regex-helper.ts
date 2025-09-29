import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';

/**
 * 对开场白文本应用全局/角色绑定的正则脚本（placement=2, AI输出）
 * - 自动读取全局正则启用开关
 * - 自动筛选绑定类型（all/character）与当前角色ID匹配的脚本
 * - 兼容脚本 flags 及 /pattern/flags 格式
 */
export async function applyRegexToGreetingForCharacter(
  text: string,
  characterId: string
): Promise<string> {
  try {
    if (!text) return text;

    // 开关：全局正则是否启用
    const enabledVal = await AsyncStorage.getItem('nodest_global_regex_enabled');
    const enabled = enabledVal === 'true';
    if (!enabled) return text;

    // 读取脚本组并筛选绑定到全部或该角色的脚本
    const groups = await StorageAdapter.loadGlobalRegexScriptGroups?.();
    const targetScripts = (groups || [])
      .filter(
        (g: any) => g.bindType === 'all' || (g.bindType === 'character' && g.bindCharacterId === characterId)
      )
      .flatMap((g: any) =>
        Array.isArray(g.scripts)
          ? g.scripts.map((s: any) => ({
              ...s,
              groupBindType: g.bindType,
              groupBindCharacterId: g.bindCharacterId,
            }))
          : []
      )
      .filter((s: any) => !s.disabled);

    if (targetScripts.length === 0) return text;

    // 应用 placement=2 到 AI 输出（开场白属于AI）
    const processed = NodeSTCore.applyGlobalRegexScripts(text, targetScripts, 2, characterId);
    return processed;
  } catch (e) {
    // 出错时返回原文，避免阻断主流程
    return text;
  }
}

/**
 * 批量处理多开场白数组
 */
export async function applyRegexToGreetings(
  greetings: string[],
  characterId: string
): Promise<string[]> {
  const results: string[] = [];
  for (const g of greetings) {
    results.push(await applyRegexToGreetingForCharacter(g, characterId));
  }
  return results;
}


