import { IPointOption, IChoiceOption, IItem, ISystem, ITrait, ISeason } from './types';

export const farmlands: IPointOption[] = [
    { id: 'farmland-large', name: '十五亩', description: '一片广阔而完整的灵田，适宜规模化种植。', extraPoints: 0 },
    { id: 'farmland-medium', name: '十亩', description: '灵田被分割成数块，分布在不同区域。', extraPoints: 3 },
    { id: 'farmland-small', name: '三亩', description: '灵田细碎且分散，难以进行规模化种植。', extraPoints: 6 },
];

export const waterSources: IPointOption[] = [
    { id: 'water-rich', name: '灵泉充沛', description: '岛上有多处蕴含灵气的淡水泉眼，取用方便。', extraPoints: 0 },
    { id: 'water-normal', name: '水源普通', description: '淡水资源充足，但灵气含量微乎其微。', extraPoints: 2 },
    { id: 'water-scarce', name: '水源稀缺', description: '需要净化海水或收集雨水才能获得淡水。', extraPoints: 4 },
];

export const creatures: IPointOption[] = [
    { id: 'creature-peaceful', name: '生灵友好', description: '岛上生物大多性情温和，不会主动攻击你。', extraPoints: 0 },
    { id: 'creature-neutral', name: '中立观察', description: '生物们对你保持警惕，互不侵犯。', extraPoints: 1 },
    { id: 'creature-hostile', name: '危机四伏', description: '部分生物具有较强的领地意识和攻击性。', extraPoints: 3 },
];

export const seabeds: IPointOption[] = [
    { id: 'seabed-calm', name: '浅海大陆架', description: '海底平坦，资源贫乏，但相对安全。', extraPoints: 0 },
    { id: 'seabed-trench', name: '深海海沟', description: '地形复杂，暗藏着古代遗迹和强大的海兽。', extraPoints: 2 },
    { id: 'seabed-volcano', name: '海底火山群', description: '灵气狂暴，盛产火属性与金石类天材地宝，但也极度危险。', extraPoints: 4 },
];

export const storms: IPointOption[] = [
    { id: 'storm-rare', name: '风和日丽', description: '风暴罕见，大部分时间都适合出海。', extraPoints: 0 },
    { id: 'storm-common', name: '季节风暴', description: '特定季节会频繁出现风暴，限制出海时间。', extraPoints: 1 },
    { id: 'storm-frequent', name: '风暴频发', description: '天气变幻莫测，随时可能出现毁灭性的风暴。', extraPoints: 3 },
];

export const islands: IPointOption[] = [
    { id: 'islands-five', name: '五座岛屿', description: '周边有五座大小不一的岛屿可供探索。', extraPoints: 0 },
    { id: 'islands-three', name: '三座岛屿', description: '周边有三座岛屿，探索范围有限。', extraPoints: 2 },
    { id: 'islands-solitary', name: '孤岛', description: '你所在的岛屿是这片海域唯一陆地。', extraPoints: 4 },
];

export const mindsets: IChoiceOption[] = [
    { id: 'mindset-survivor', name: '求生者', description: '活下去是不变的真理。你对环境中的危险和机遇有更强的直觉。' },
    { id: 'mindset-explorer', name: '探究者', description: '解析世界是最大的乐趣。你更容易从未知事物中获得感悟。' },
    { id: 'mindset-returner', name: '归乡者', description: '这里只是垫脚石。你对空间、星辰相关的线索有特殊感应。' },
];

export const defaultTrait: ITrait = { id: 'trait-farmer', name: '农学世家', description: '你出身于农业世家，对植物的习性有天生的亲和力。' };
export const optionalTraits: ITrait[] = [
    { id: 'trait-athlete', name: '运动健将', description: '你曾是运动健将，拥有更强的体能和耐力。' },
    { id: 'trait-handy', name: '动手达人', description: '你热爱手工，能更快地制作和修复工具。' },
    { id: 'trait-chef', name: '厨艺特长', description: '你对烹饪有独到的见解，能更好地处理食材，制作美味佳肴。' },
    { id: 'trait-survivalist', name: '生存大师', description: '你拥有丰富的野外生存知识，能更好地辨识可食用植物和危险生物。' },
    { id: 'trait-scholar', name: '学霸', description: '你拥有过目不忘的记忆力和强大的逻辑思维能力，更容易学习和理解新知识。' },
    { id: 'trait-none', name: '无', description: '你没有其他特别的凡人特长。' },
];

export const inventoryItems: IItem[] = [
  { id: 'item-ju-ling-ping', name: '初级聚灵瓶', description: '可自动地缓慢聚集灵气，放水进去可让水携带灵气。', points: 5, 价值: { 基础价值: 50, 价值标签: ['法器', '辅助'] } },
  { id: 'item-chang-chun-jue', name: '《长春诀》拓本', description: '一部完整的炼气期木系功法，中正平和。', points: 4, 价值: { 基础价值: 100, 价值标签: ['功法', '木系'] } },
  { id: 'item-bi-shui-zhu', name: '避水珠', description: '能让人在水里自由呼吸的珠子，可由水性灵兽孕育。', points: 4, 价值: { 基础价值: 40, 价值标签: ['奇物', '水下'] } },
  { id: 'item-yang-yan-jingshi', name: '阳炎晶石', description: '一块能持续散发温暖热量的暖黄色晶石，小块，可当暖手宝。', points: 4, 价值: { 基础价值: 35, 价值标签: ['材料', '火系'] } },
  { id: 'item-cao-mu-tu-jian', name: '《元初草木图鉴》残本', description: '记录了大量海滨灵植的图鉴，灵植师的宝贵参考。', points: 3, 价值: { 基础价值: 80, 价值标签: ['书籍', '知识'] } },
  { id: 'item-nuan-yang-guo', name: '暖阳果', description: '生于背阴潮湿之地，果实性温，凡人食之可驱寒充饥,修士食之可略补真元。其核饱满，遇土即生。', points: 3, 价值: { 基础价值: 15, 价值标签: ['消耗品', '食物', '药材'] } },
  { id: 'item-pigu-dan', name: '一瓶辟谷丹', description: '十颗装，让你在前期无需为食物发愁。', points: 2, 价值: { 基础价值: 20, 价值标签: ['消耗品', '丹药'] } },
  { id: 'item-duan-jian', name: '断裂的飞剑（剑尖）', description: '由青玉精钢制成，可打造成锋利的小刀或箭头。', points: 2, 价值: { 基础价值: 25, 价值标签: ['材料', '金属'] } },
  { id: 'item-chu-wu-dai', name: '失效的储物袋', description: '空间已失，但可研究其符文结构，有修复的可能。', points: 2, 价值: { 基础价值: 60, 价值标签: ['法器', '空间', '损坏'] } },
];

export const bagItems: IItem[] = [
  { id: 'item-solar-charger', name: '太阳能充电器', description: '一块折叠式太阳能充电板，或许能让你那块板砖重新开机。', points: 5, 价值: { 基础价值: 5, 价值标签: ['工具', '现代'] } },
  { id: 'item-multi-tool', name: '多功能军刀', description: '瑞士军刀，集成了小刀、锯子、开罐器等多种工具。', points: 3, 价值: { 基础价值: 10, 价值标签: ['工具', '现代'] } },
  { id: 'item-antibiotics', name: '广谱抗生素', description: '一小瓶阿莫西林，用于紧急情况下的抗感染治疗。', points: 3, 价值: { 基础价值: 15, 价值标签: ['消耗品', '药品', '现代'] } },
  { id: 'item-seeds', name: '高产作物种子', description: '一小包精选的杂交水稻和土豆种子。', points: 2, 价值: { 基础价值: 5, 价值标签: ['消耗品', '种子'] } },
  { id: 'item-fire-starter', name: '打火石', description: '镁条打火石，在潮湿环境下也能生火。', points: 2, 价值: { 基础价值: 8, 价值标签: ['工具'] } },
  { id: 'item-fish-line', name: '高强度鱼线和鱼钩', description: '专业的钓鱼工具，让你更容易获取食物。', points: 1, 价值: { 基础价值: 8, 价值标签: ['工具'] } },
];

export const defaultBagItems: IItem[] = [
  { id: 'item-phone', name: '没电的手机', description: '你的智能手机，但它现在只是一块漂亮的板砖。', points: 0, 价值: { 基础价值: 1, 价值标签: ['奇物', '现代', '损坏'] } },
  { id: 'item-clothes', name: '一套换洗衣物', description: '来自你原来世界的普通衣物，至少能保持体面。', points: 0, 价值: { 基础价值: 2, 价值标签: ['衣物'] } },
];

export const seasons: ISeason[] = [
    { id: 'season-spring', name: '春', description: '万物复苏，生机盎然，适合播种与培育灵植。' },
    { id: 'season-summer', name: '夏', description: '烈日炎炎，灵气充裕，但需注意防暑与应对风暴。' },
    { id: 'season-autumn', name: '秋', description: '天高气爽，硕果累累，是收获的季节，也是储备资源的良机。' },
    { id: 'season-winter', name: '冬', description: '寒风凛冽，万物蛰伏，考验着你的生存智慧。' },
];

export const systems: ISystem[] = [
    { id: 'system-none', name: '无系统', description: '依靠自己的智慧和努力，走出一条独一无二的道路。', points: 0 },
    { id: 'system-quest', name: '任务系统', description: '“天道”会根据你的行为发布任务，提供清晰的目标和引导。', points: 10 },
    { id: 'system-sign-in', name: '签到系统', description: '每日签到即可获得随机奖励，轻松获取资源。', points: 9 },
    { id: 'system-barter', name: '以物换物', description: '可以与神秘商人进行交易，换取你需要的物品。', points: 8 },
    { id: 'system-achievement', name: '成就系统', description: '完成特定挑战可获得成就点数，兑换特殊奖励。', points: 7 },
    { id: 'system-skill-panel', name: '技能面板', description: '可以将重复的劳动转化为熟练度，解锁专属技能。', points: 5 },
];

export const initialLocations: IChoiceOption[] = [
    { id: 'location-beach', name: '海滩', description: '一片被月光照亮的广阔沙滩，连接着墨绿色的森林。' },
    { id: 'location-forest', name: '森林', description: '你在一片幽深的森林中醒来，四周是高耸的古树。' },
    { id: 'location-peak', name: '山顶', description: '孤高的山巅，云雾缭绕，视野开阔但危机四伏。' },
    { id: 'location-lake', name: '湖泊旁', description: '灵气氤氲的湖畔，宁静而富饶，但深处暗藏未知。' },
];
