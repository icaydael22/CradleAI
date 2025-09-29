import type { IWorldviewDefinition } from './worldview-data';

export const PERFECT_WORLD_PRESET: IWorldviewDefinition = {
  worldName: '大荒界',
  description: '这是一个万族林立，天骄并起的世界。修士通过观摩天地间的符文，领悟至强宝术，淬炼己身，踏上修行之路。',
  powerSystem: {
    name: '符文',
    description: '天地间最本源的力量载体，交织成秩序与法则。强大的生灵天生便掌控有符文，演化为“宝术”。',
  },
  cultivationRanks: [
    { name: '搬血境', description: '淬炼肉身，气血如烘炉，力达十万斤。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '洞天境', description: '开辟体内洞天，夺天地之造化，反哺己身。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '化灵境', description: '精神与肉体蜕变，超凡脱俗，初步掌控符文。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '铭纹境', description: '将符文铭刻于身，初步掌控法则之力。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '列阵境', description: '以身为阵，或布下滔天大阵，神威盖世。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '尊者境', description: '修成一方大能，受万灵敬仰，为一域至尊。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '神火境', description: '点燃神火，超脱凡俗，生命层次跃迁。', levels: ['初期', '中期', '后期', '圆满'] },
    { name: '真神境', description: '凝聚神格，不朽不灭，为神道领域的强者。', levels: ['初期', '中期', '后期', '圆满'] },
  ],
  professions: [
    { category: '战斗之道', list: '宝术师、体修、阵法师、剑修' },
    { category: '百工之艺', list: '药师、炼器师、符文师' },
    { category: '奇门之术', list: '源师、寻龙师、占卜师' },
  ],
  itemRankSystems: [
    {
      systemName: '通用',
      ranks: [
        { name: '凡器', description: '凡铁俗物打造，无甚出奇。', levels: ['下品', '中品', '上品'] },
        { name: '法器', description: '蕴含基础符文，能引动天地之力。', levels: ['下品', '中品', '上品', '绝品'] },
        { name: '宝具', description: '由强大符文交织而成，威力巨大，为尊者所用。', levels: ['下品', '中品', '上品', '绝品'] },
        { name: '神器', description: '神火境强者祭炼的无上兵刃，蕴含神性。', levels: ['下品', '中品', '上品', '绝品'] },
        { name: '仙器', description: '传说中真仙遗留的器物，内含完整的法则。', levels: ['残缺', '完整'] },
      ],
    },
  ],
};

export const BATTLE_THROUGH_THE_HEAVENS_PRESET: IWorldviewDefinition = {
  worldName: '斗气大陆',
  description: '这里是属于斗气的世界，没有花俏艳丽的魔法，有的，仅仅是繁衍到巅峰的斗气！',
  powerSystem: {
    name: '斗气',
    description: '大陆的核心能量，通过修炼斗之气旋吸收和炼化，是施展斗技、炼药、驱动异火的根本。',
  },
  cultivationRanks: [
    { name: '斗之气', description: '温养气旋，凝聚斗气种子。', levels: ['一段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段'] },
    { name: '斗者', description: '凝聚斗之气旋，化气为液，方可称为真正的修炼者。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '斗师', description: '斗气化铠，实力大增，是家族的中坚力量。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '大斗师', description: '斗气化翼，初步具备飞行能力。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '斗灵', description: '斗气凝物，实力强横，足以开宗立派。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '斗王', description: '斗气化翼，翱翔天际，是一方豪强。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '斗皇', description: '可调动外界空间之力，实力恐怖。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '斗宗', description: '掌握空间之力，踏空而行，开辟空间之门。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星'] },
    { name: '斗尊', description: '能够掌控空间，移山填海，是大陆的顶尖强者。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星', '巅峰'] },
    { name: '斗圣', description: '开辟空间，从虚无中创造生命，举手投足间毁天灭地。', levels: ['一星', '二星', '三星', '四星', '五星', '六星', '七星', '八星', '九星', '巅峰'] },
    { name: '斗帝', description: '大陆的至高主宰，千年难得一见，拥有源气，可号令天地。', levels: [] },
  ],
  professions: [
    { category: '核心职业', list: '炼药师' },
    { category: '战斗流派', list: '斗技、灵魂力量、异火、毒师' },
    { category: '特殊身份', list: '远古八族、魔兽家族、丹塔' },
  ],
  itemRankSystems: [
    {
      systemName: '斗技',
      ranks: [
        { name: '黄阶', description: '斗技的基础，威力有限。', levels: ['低级', '中级', '高级'] },
        { name: '玄阶', description: '较为稀有的斗技，威力不俗。', levels: ['低级', '中级', '高级'] },
        { name: '地阶', description: '大陆罕见的强大斗技，足以引动天地异象。', levels: ['低级', '中级', '高级'] },
        { name: '天阶', description: '传说中的斗技，拥有毁天灭地之威。', levels: ['低级', '中级', '高级'] },
      ],
    },
    {
      systemName: '丹药',
      ranks: [
        { name: '一品', description: '最初级的丹药，药效微弱。', levels: [] },
        { name: '二品', description: '炼药师学徒的产物。', levels: [] },
        { name: '三品', description: '正式炼药师的标志。', levels: [] },
        { name: '四品', description: '能引发天地异象的丹药。', levels: [] },
        { name: '五品', description: '具备灵性，甚至能化为人形。', levels: [] },
        { name: '六品', description: '丹成时会引来丹雷。', levels: [] },
        { name: '七品', description: '拥有自主意识，懂得趋吉避凶。', levels: [] },
        { name: '八品', description: '丹药之王，拥有逆天改命之效。', levels: [] },
        { name: '九品', description: '传说中的帝品丹药，可助人成帝。', levels: ['宝丹', '玄丹', '金丹'] },
      ],
    },
    {
      systemName: '魔核',
      ranks: [
        { name: '一阶', description: '最低级的魔兽核心。', levels: [] },
        { name: '二阶', description: '相当于斗师级别的魔兽。', levels: [] },
        { name: '三阶', description: '相当于大斗师级别的魔兽。', levels: [] },
        { name: '四阶', description: '相当于斗灵级别的魔兽。', levels: [] },
        { name: '五阶', description: '相当于斗王级别的魔兽。', levels: [] },
        { name: '六阶', description: '相当于斗皇级别的魔兽，可化人形。', levels: [] },
        { name: '七阶', description: '相当于斗宗级别的魔兽。', levels: [] },
        { name: '八阶', description: '相当于斗尊级别的魔兽。', levels: [] },
        { name: '九阶', description: '相当于斗圣级别的魔兽。', levels: [] },
      ],
    },
  ],
};

export const THE_GREAT_RULER_PRESET: IWorldviewDefinition = {
  worldName: '大千世界',
  description: '位面交汇，万族林立，群雄荟萃，一位位来自下位面的天之至尊，在这无尽世界，演绎着令人向往的传奇，追求着那主宰之路。',
  powerSystem: {
    name: '灵力',
    description: '大千世界修炼的根本，通过观想、吸收天地灵气化为己用，是催动灵诀、灵阵、炼制丹药的基础。',
  },
  cultivationRanks: [
    { name: '感应境', description: '感知天地灵气。', levels: ['初期', '后期'] },
    { name: '灵动境', description: '引灵气入体，初步运用。', levels: ['初期', '后期'] },
    { name: '灵轮境', description: '在体内开辟气海，形成灵轮。', levels: ['初期', '后期'] },
    { name: '神魄境', description: '灵力与魂魄相融，可内视己身。', levels: ['初期', '后期'] },
    { name: '三魄境', description: '天、地、人三魄，魄魄惊天。', levels: ['天魄', '地魄', '人魄'] },
    { name: '至尊境', description: '踏入大千世界强者之列，分为九品。', levels: ['一品', '二品', '三品', '四品', '五品', '六品', '七品', '八品', '九品'] },
    { name: '地至尊', description: '对灵力的掌控登峰造极，一方霸主。', levels: ['下位', '上位', '大圆满'] },
    { name: '天至尊', description: '屹立于大千世界顶峰的存在，分为灵、仙、圣三品。', levels: ['灵品', '仙品', '圣品'] },
    { name: '主宰境', description: '万古不朽，超脱圣品，为大千世界之主宰。', levels: [] },
  ],
  professions: [
    { category: '核心职业', list: '灵阵师、炼丹师、战阵师' },
    { category: '战斗流派', list: '灵诀、炼体、血脉神通' },
    { category: '特殊身份', list: '五大古族、超级神兽、审判之主' },
  ],
  itemRankSystems: [
    {
      systemName: '灵器',
      ranks: [
        { name: '凡品', description: '普通材质打造，无灵力波动。', levels: [] },
        { name: '灵品', description: '蕴含灵力，分为上中下三品。', levels: ['下品', '中品', '上品'] },
        { name: '神器', description: '拥有器灵，威力强大。', levels: ['低阶', '中阶', '高阶'] },
        { name: '圣物', description: '天至尊所用的神兵，蕴含天地法则。', levels: ['低阶', '中阶', '高阶'] },
        { name: '绝世圣物', description: '圣物中的极致，拥有毁天灭地之能。', levels: [] },
      ],
    },
    {
      systemName: '灵阵',
      ranks: [
        { name: '一级', description: '最初级的灵阵。', levels: [] },
        { name: '二级', description: '灵阵师的入门。', levels: [] },
        { name: '三级', description: '相当于神魄境强者。', levels: [] },
        { name: '四级', description: '相当于三魄境强者。', levels: [] },
        { name: '五级', description: '相当于至尊境强者。', levels: [] },
        { name: '大师级', description: '相当于地至尊。', levels: [] },
        { name: '宗师级', description: '相当于天至尊。', levels: ['灵品', '仙品', '圣品'] },
      ],
    },
  ],
};

export const MORTAL_JOURNEY_PRESET: IWorldviewDefinition = {
  worldName: '人界',
  description: '一个看似平凡的凡人世界，却隐藏着通往长生大道的残酷修仙之路。资源匮乏，人心叵测，唯有心智坚韧、步步为营者方能脱颖而出。',
  powerSystem: {
    name: '灵气',
    description: '天地间游离的能量，修仙者吐纳炼化以提升修为，是施展法术、催动法宝、炼丹制符的根本。',
  },
  cultivationRanks: [
    { name: '炼气期', description: '引气入体，滋养经脉，为修仙之始。共分十三层。', levels: ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层', '十层', '十一层', '十二层', '十三层'] },
    { name: '筑基期', description: '灵力化液，开辟丹田，寿元大增，神识诞生。', levels: ['初期', '中期', '后期'] },
    { name: '结丹期', description: '液化结丹，凝聚金丹，实力发生质的飞跃。', levels: ['初期', '中期', '后期'] },
    { name: '元婴期', description: '丹破婴生，元神出窍，拥有第二生命。', levels: ['初期', '中期', '后期'] },
    { name: '化神期', description: '元婴与神合，神识通天，可遨游太虚。', levels: ['初期', '中期', '后期'] },
    { name: '炼虚期', description: '炼神返虚，初步掌握法则之力。', levels: ['初期', '中期', '后期'] },
    { name: '合体期', description: '法体合一，万法归宗，举手投足皆是神通。', levels: ['初期', '中期', '后期'] },
    { name: '大乘期', description: '法则大成，渡劫飞升，为凡间界的顶点。', levels: ['初期', '中期', '后期'] },
  ],
  professions: [
    { category: '修仙百艺', list: '炼丹师、炼器师、制符师、阵法师' },
    { category: '战斗方式', list: '法修、体修、剑修、魔修、鬼道' },
    { category: '特殊能力', list: '傀儡术、驱虫术、占卜术' },
  ],
  itemRankSystems: [
    {
      systemName: '法器',
      ranks: [
        { name: '法器', description: '炼气期修士所用，威力有限。', levels: ['下品', '中品', '上品', '顶阶'] },
        { name: '法宝', description: '结丹期以上修士方可驱使，分为普通法宝和古宝。', levels: ['普通', '古宝'] },
        { name: '通天灵宝', description: '天地孕育或上古流传，拥有莫大威能，有仿制灵宝和通天灵宝之分。', levels: ['仿制', '完整'] },
        { name: '玄天之宝', description: '仙界遗落的至宝，蕴含界面法则，威力无穷。', levels: [] },
      ],
    },
    {
      systemName: '丹药',
      ranks: [
        { name: '普通丹药', description: '用于辅助炼气、筑基期修士修炼。', levels: [] },
        { name: '上古丹方', description: '结丹、元婴期所需，药效强大，材料珍稀。', levels: [] },
        { name: '灵丹妙药', description: '化神期以上修士所用，有逆天改命之效。', levels: [] },
      ],
    },
    {
      systemName: '符箓',
      ranks: [
        { name: '低级符', description: '炼气期修士制作，一次性消耗品。', levels: ['初级', '中级', '高级'] },
        { name: '中级符', description: '筑基期修士制作，威力相当于筑基期修士一击。', levels: [] },
        { name: '高级符', description: '结丹期修士制作，威力巨大。', levels: [] },
        { name: '符宝', description: '元婴期修士将法宝一丝威能封印其中，可多次使用。', levels: [] },
      ],
    },
  ],
};

export const worldviewPresets: { name: string; worldview: IWorldviewDefinition }[] = [
  { name: '完美世界', worldview: PERFECT_WORLD_PRESET },
  { name: '斗破苍穹', worldview: BATTLE_THROUGH_THE_HEAVENS_PRESET },
  { name: '大主宰', worldview: THE_GREAT_RULER_PRESET },
  { name: '凡人修仙传', worldview: MORTAL_JOURNEY_PRESET },
];
