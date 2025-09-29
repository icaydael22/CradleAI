/**
 * @interface ICultivationRank
 * @description 定义了修炼境界的结构。
 */
export interface ICultivationRank {
  /**
   * 境界名称。
   * @example "炼气境"
   */
  name: string;
  /**
   * 对该境界的简要描述。
   */
  description: string;
  /**
   * 该大境界下的子层级列表。
   * @example ["初期", "中期", "后期", "圆满"]
   */
  levels: string[];
}

/**
 * @interface IItemRank
 * @description 定义了物品等阶体系中单个等阶的结构。
 */
export interface IItemRank {
  /**
   * 等阶的名称。
   * @example "凡品", "灵品", "仙品"
   */
  name: string;

  /**
   * 该等阶下的子层级列表。
   * @example ["下阶", "中阶", "上阶", "绝品"]
   */
  levels: string[];

  /**
   * 对该等阶的简要描述。
   */
  description: string;
}

/**
 * @interface IItemRankSystem
 * @description 定义了一个完整的物品等阶体系（例如法宝、丹药、功法等）。
 *              一个世界观可以包含多个独立的物品等阶体系。
 */
export interface IItemRankSystem {
  /**
   * 该体系的名称。
   * @example "通用", "丹药", "斗技"
   */
  systemName: string;

  /**
   * 属于该体系的等阶列表。
   */
  ranks: IItemRank[];
}

/**
 * 默认的修仙世界修炼境界定义。
 */
export const DEFAULT_CULTIVATION_RANKS: ICultivationRank[] = [
  { name: '淬体境', description: '凡躯打磨，仙凡之隔。', levels: ['一重', '二重', '三重', '四重', '五重', '六重', '七重', '八重', '九重', '圆满'] },
  { name: '炼气境', description: '引气入体，初窥门径。', levels: ['初期', '中期', '后期', '圆满'] },
  { name: '筑基境', description: '铸就道基，神识初醒。', levels: ['初期', '中期', '后期', '圆满'] },
  { name: '金丹境', description: '丹成大道，御器飞行。', levels: ['初期', '中期', '后期', '圆满'] },
  { name: '元婴境', description: '婴变不灭，瞬移千里。', levels: ['初期', '中期', '后期', '圆满'] },
  { name: '化神境', description: '法则言随，神游太虚。', levels: ['初期', '中期', '后期', '圆满'] },
];

/**
 * 默认的修仙世界物品等阶体系。
 * 这是游戏的基础设定，可以被玩家的自定义设置覆盖。
 */
export const DEFAULT_ITEM_RANK_SYSTEMS: IItemRankSystem[] = [
  {
    systemName: '通用',
    ranks: [
      {
        name: '凡品',
        levels: ['下阶', '中阶', '上阶', '绝品'],
        description: '凡人所能接触到的物品，材质普通，效用有限，几乎不含灵力。',
      },
      {
        name: '灵品',
        levels: ['下阶', '中阶', '上阶', '绝品'],
        description: '蕴含稀薄灵气的物品，对初入仙途的修士大有裨益，是修炼前期的基础物资。',
      },
      {
        name: '法品',
        levels: ['下阶', '中阶', '上阶', '绝品'],
        description: '能够承载法术或具有特殊神通的物品，通常被称为“法器”，是修士的常用之物。',
      },
      {
        name: '宝品',
        levels: ['下阶', '中阶', '上阶', '绝品'],
        description: '天地灵气自行孕育或经大能之手炼制的珍贵物品，被称为“法宝”，威力远超法器。',
      },
      {
        name: '道品',
        levels: ['下阶', '中阶', '上阶', '绝品'],
        description: '蕴含一丝大道法则的物品，极为稀有，拥有种种不可思议之能，也被称为“道器”。',
      },
      {
        name: '仙品',
        levels: ['下阶', '中阶', '上阶', '绝品'],
        description: '仙界之物，凡间难觅，蕴含仙灵之气，对凡间修士而言是传说中的存在。',
      },
    ],
  },
];
