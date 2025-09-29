import _ from 'lodash';
import { pokedexDataSource } from '../data/pokedex-data';
import { logger } from './logger';
import { getIsRecalculatingState } from './state';
import { safeInsertOrAssignVariables } from './variables';

// Global declarations for Tavern's built-in functions
declare const getVariables: (options: any) => any;
declare const toastr: any;

// --- Type Definitions ---
export interface Value {
  基础价值: number;
  价值标签: string[];
}
export interface MarketPriceInfo {
  标签: string;
  涨跌幅: number;
  风闻: string;
}
export type PokedexEntry = { [key: string]: any; 名称: string; 价值?: Value };
export type PokedexType = '妖兽' | '植物' | '物品' | '书籍';
export type ShareableType = PokedexType | '成就';
export interface Pokedex {
  妖兽: PokedexEntry[];
  植物: PokedexEntry[];
  物品: PokedexEntry[];
  书籍: PokedexEntry[];
}
export type RemotePokedexData = Pokedex & {
  成就: PokedexEntry[];
};

const ACHIEVEMENT_VARIABLE_PATH = '世界.系统';

// --- Remote Sync Configuration ---
// NOTE: This is a simple Base64 encoding to obscure the URL, NOT for security.
const encodedUrl = 'aHR0cHM6Ly93d3ctYXBpLWZvcnVtLnJjNnMzd2N1ZS5ueWF0LmFwcDo1OTY5MC9hcGkvcG9rZWRleA==';
const getRemoteUrl = () => atob(encodedUrl);

// --- PokedexManager Class ---
export class PokedexManager {
  private pokedexData: Pokedex;

  constructor() {
    this.pokedexData = _.cloneDeep(pokedexDataSource);
    if (!this.pokedexData.书籍) {
      this.pokedexData.书籍 = [];
    }
    logger('info', 'Pokedex', 'Initialized with data from TS module.');
  }

  public getPokedexData(): Pokedex {
    return this.pokedexData;
  }

  /**
   * (vFuture 新增) 获取所有图鉴条目的Map，键为完整的变量路径ID。
   * @returns {Map<string, PokedexEntry>}
   */
  public getAllEntriesAsMap(): Map<string, PokedexEntry> {
    const entriesMap = new Map<string, PokedexEntry>();
    for (const category in this.pokedexData) {
      if (Array.isArray(this.pokedexData[category as PokedexType])) {
        for (const item of this.pokedexData[category as PokedexType]) {
          const itemId = `世界.图鉴.${category}.${item.名称}`;
          entriesMap.set(itemId, item);
        }
      }
    }
    return entriesMap;
  }

  // --- Value Calculation ---

  private getMarketModifier(tags: string[]): number {
    const worldState = getVariables({ type: 'global' });
    const marketPrices: MarketPriceInfo[] = _.get(worldState, '世界.时价', []);
    let totalModifier = 1.0;

    logger('log', 'Pokedex', '[getMarketModifier] Calculating modifier for tags:', { tags, marketPrices: _.cloneDeep(marketPrices) });

    if (!marketPrices || marketPrices.length === 0) {
      logger('log', 'Pokedex', '[getMarketModifier] No market prices found. Returning base modifier 1.0.');
      return totalModifier;
    }

    tags.forEach(tag => {
      const priceInfo = marketPrices.find(p => p.标签 === tag);
      if (priceInfo) {
        totalModifier += priceInfo.涨跌幅;
        logger('log', 'Pokedex', `[getMarketModifier] Found matching price for tag "${tag}". Modifier changed by ${priceInfo.涨跌幅}. New total: ${totalModifier}`);
      }
    });

    logger('info', 'Pokedex', `[getMarketModifier] Final modifier calculated: ${totalModifier}`);
    return totalModifier;
  }

  public calculateItemValue(entry: PokedexEntry): number {
    if (!entry.价值) {
      return 0;
    }
    const baseValue = entry.价值.基础价值;
    const tags = entry.价值.价值标签 || [];
    const modifier = this.getMarketModifier(tags);
    const finalValue = Math.round(baseValue * modifier);
    
    logger('log', 'Pokedex', `Calculated value for "${entry.名称}"`, { baseValue, tags, modifier, finalValue });
    return finalValue;
  }
  
  // --- CRUD for Pokedex Entries ---

  public createPokedexEntry(type: PokedexType, entryData: PokedexEntry): boolean {
    logger('log', 'Pokedex', `Attempting to create entry in "${type}"`, entryData);
    if (!entryData.名称) {
      logger('error', 'Pokedex', 'Create failed: Entry is missing "名称" field.');
      toastr.error('创建失败：条目必须包含“名称”字段。');
      return false;
    }
    if (this.pokedexData[type].some(entry => entry.名称 === entryData.名称)) {
      logger('warn', 'Pokedex', `Create failed: Entry "${entryData.名称}" already exists in "${type}".`);
      //toastr.warning(`创建失败：名为“${entryData.名称}”的${type}已存在。`);
      return false;
    }
    this.pokedexData[type].push(entryData);
    logger('info', 'Pokedex', `Successfully created entry "${entryData.名称}" in memory.`);
    if (!getIsRecalculatingState()) {
    toastr.success(`成功在内存中添加【${entryData.名称}】。`);
    }
    return true;
  }

  public readPokedexEntry(type: PokedexType, name: string): PokedexEntry | undefined {
    const entry = this.pokedexData[type].find(entry => entry.名称 === name);
    logger('log', 'Pokedex', `Read attempt for "${name}" in "${type}": ${entry ? 'Found' : 'Not Found'}.`);
    return entry ? _.cloneDeep(entry) : undefined;
  }

  public updatePokedexEntry(type: PokedexType, originalName: string, updatedData: PokedexEntry): boolean {
    logger('log', 'Pokedex', `Attempting to update entry [${type}] from "${originalName}" to "${updatedData.名称}"`, { originalName, updatedData });
    if (!updatedData.名称) {
      logger('error', 'Pokedex', 'Update failed: Entry is missing "名称" field.');
      toastr.error('更新失败：条目必须包含“名称”字段。');
      return false;
    }
    const entryIndex = this.pokedexData[type].findIndex(entry => entry.名称 === originalName);

    if (entryIndex === -1) {
      logger('error', 'Pokedex', `Update failed: Could not find entry named "${originalName}" in "${type}".`);
      toastr.error(`更新失败：未找到名为“${originalName}”的${type}。`);
      return false;
    }

    if (originalName !== updatedData.名称 && this.pokedexData[type].some(entry => entry.名称 === updatedData.名称)) {
      //toastr.warning(`更新失败：名为“${updatedData.名称}”的${type}已存在。`);
      return false;
    }

    this.pokedexData[type][entryIndex] = updatedData;
    logger('info', 'Pokedex', `Successfully updated entry in memory. New data for "${updatedData.名称}":`, updatedData);
    if (!getIsRecalculatingState()) {
    toastr.success(`成功在内存中更新【${updatedData.名称}】。`);
    }
    return true;
  }

  public deletePokedexEntry(type: PokedexType, name: string): boolean {
    logger('warn', 'Pokedex', `Attempting to delete entry [${type}] "${name}"`);
    const initialLength = this.pokedexData[type].length;
    this.pokedexData[type] = this.pokedexData[type].filter((entry: PokedexEntry) => entry.名称 !== name);
    
    if (this.pokedexData[type].length < initialLength) {
      logger('info', 'Pokedex', `Successfully deleted "${name}" from "${type}" in memory.`);
      toastr.success(`成功从内存中删除【${name}】。`);
      return true;
    } else {
      logger('error', 'Pokedex', `Delete failed: Could not find entry named "${name}" in "${type}".`);
      toastr.warning(`删除失败：未找到名为“${name}”的${type}。`);
      return false;
    }
  }

  // --- Remote Sync ---

  public async submitToHuggingFace(type: ShareableType, entryData: PokedexEntry, provider?: string): Promise<void> {
    console.warn('[PokedexManager] submitToHuggingFace is a placeholder and does not actually submit data.');
    toastr.warning('提交功能尚未实现，数据未发送到服务器。请联系开发者配置提交API。');
    // Placeholder for actual submission logic, e.g., a POST request to a backend API.
    // For now, we'll just simulate a successful operation for UI flow.
    return Promise.resolve();
  }

  public async getRemotePokedex(): Promise<RemotePokedexData | null> {
    const url = getRemoteUrl();
    logger('info', 'Pokedex', `Fetching remote pokedex from ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      logger('info', 'Pokedex', 'Successfully fetched and parsed remote pokedex.');
      return data;
    } catch (error) {
      logger('error', 'Pokedex', 'Failed to fetch remote pokedex.', error);
      toastr.error("获取社区图鉴失败，请检查网络连接或URL配置。");
      return null;
    }
  }

  // --- Achievements ---
  
  public async getSystemData(): Promise<any> {
    const variables = getVariables({ type: 'global' });
    return _.get(variables, ACHIEVEMENT_VARIABLE_PATH, { 已完成: [], 成就点数: 0 });
  }

  private async saveSystemData(data: any): Promise<void> {
    await safeInsertOrAssignVariables({ [ACHIEVEMENT_VARIABLE_PATH]: data }, { type: 'global' });
  }

  public async getAchievements(): Promise<PokedexEntry[]> {
    const systemData = await this.getSystemData();
    return systemData.已完成 || [];
  }

  public async createAchievement(entryData: PokedexEntry): Promise<boolean> {
    const systemData = await this.getSystemData();
    if (!systemData.已完成.some((ach: PokedexEntry) => ach.名称 === entryData.名称)) {
        systemData.已完成.push(entryData);
        await this.saveSystemData(systemData);
        toastr.success(`新成就【${entryData.名称}】已添加！`);
        return true;
    }
    //toastr.warning(`成就【${entryData.名称}】已存在。`);
    return false;
  }

  public async updateAchievement(originalName: string, updatedData: PokedexEntry): Promise<boolean> {
    const systemData = await this.getSystemData();
    const achIndex = systemData.已完成.findIndex((ach: PokedexEntry) => ach.名称 === originalName);
    if (achIndex > -1) {
        systemData.已完成[achIndex] = updatedData;
        await this.saveSystemData(systemData);
        toastr.success(`成就【${updatedData.名称}】已更新！`);
        return true;
    }
    return false;
  }

  public async deleteAchievement(name: string): Promise<boolean> {
    const systemData = await this.getSystemData();
    const initialLength = systemData.已完成.length;
    systemData.已完成 = systemData.已完成.filter((ach: PokedexEntry) => ach.名称 !== name);
    if (systemData.已完成.length < initialLength) {
        await this.saveSystemData(systemData);
        toastr.success(`成就【${name}】已删除。`);
        return true;
    }
    return false;
  }

}
