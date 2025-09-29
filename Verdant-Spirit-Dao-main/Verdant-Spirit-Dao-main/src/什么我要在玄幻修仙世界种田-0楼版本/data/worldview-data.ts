import { DEFAULT_CULTIVATION_RANKS, DEFAULT_ITEM_RANK_SYSTEMS, ICultivationRank, IItemRankSystem } from './ranks-data';

/**
 * @interface IWorldviewDefinition
 * @description 定义了玩家可自定义的世界观结构。
 */
export interface IWorldviewDefinition {
  /**
   * 世界的名称，例如“元初界”。
   */
  worldName: string;

  /**
   * 对世界观的简短描述。
   */
  description: string;

  /**
   * 异世力量体系的定义。
   */
  powerSystem: {
    /**
     * 力量名称，例如“灵气”、“魔能”、“元力”。
     */
    name: string;
    /**
     * 对该力量的简短描述。
     */
    description: string;
  };

  /**
   * 修炼的核心境界定义。
   */
  cultivationRanks: ICultivationRank[];

  /**
   * 职业体系定义。
   */
  professions: { category: string; list: string }[];

  /**
   * 物品和图鉴的等阶体系定义。
   */
  itemRankSystems: IItemRankSystem[];
}

/**
 * 默认的世界观设定。
 */
export const DEFAULT_WORLDVIEW: IWorldviewDefinition = {
  worldName: '元初界',
  description: '这是一个以“灵气”为万物本源与唯一修炼能量的玄幻修仙世界。大道至简，修行者专注于“道”与“法”的感悟，而非繁杂的等级突破。',
  powerSystem: {
    name: '灵气',
    description: '构成万物、驱动法则的基础能量。修士通过吐纳、炼化灵气来提升修为，施展神通。',
  },
  cultivationRanks: DEFAULT_CULTIVATION_RANKS,
  professions: [
    { category: '战斗类', list: '剑修、法修、体修、魂修' },
    { category: '辅佐类', list: '丹师、器师、阵师' },
    { category: '奇门类', list: '符师、灵植师、御兽师' },
  ],
  itemRankSystems: DEFAULT_ITEM_RANK_SYSTEMS,
};
