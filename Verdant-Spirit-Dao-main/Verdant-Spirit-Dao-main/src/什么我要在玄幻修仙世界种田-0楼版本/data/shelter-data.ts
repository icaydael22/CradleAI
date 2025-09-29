// 位于 data/shelter-data.ts

// 数值到描述性文字的映射配置
export const SHELTER_DESCRIPTIVE_MAPPING = {
  defense: {
    0: "无",
    10: "微弱",
    20: "显著", 
    30: "强大",
    50: "坚不可摧"
  },
  efficiency: {
    0: "无",
    0.1: "轻微",
    0.3: "中等",
    0.5: "高效",
    1.0: "极效"
  },
  durability: {
    0: "毁坏",
    30: "严重受损",
    60: "轻微受损",
    80: "基本完好",
    100: "完好无损"
  },
  durability_v2: {
    0: "毁坏",
    20: "濒临失效",
    50: "功能受损",
    80: "功能齐全",
    100: "完好无损"
  }
};

export const SHELTER_COMPONENTS_DATA = {
  "围墙": {
    name: "围墙",
    "upgrades": {
      "木墙": {
        "materials": [{ "name": "潮汐木芯", "quantity": 10 }],
        "baseDefense": 5,
        "description": "提供基础的物理防御。"
      },
      "石墙": {
        "materials": [{ "name": "石块", "quantity": 20 }],
        "baseDefense": 15,
        "description": "坚固的石墙，提供更强的防御。"
      }
    }
  },
  "农田": {
    name: "农田",
    "upgrades": {
      "0": { "materials": [], "description": "未建造" },
      "1": { 
        "materials": [{ "name": "泥土", "quantity": 5 }], 
        "efficiencyBonus": 0.1, // 数值型效率加成
        "description": "开辟一片小农田。" 
      }
    },
    "production": {
      "type": "continuous",
      "resource": "谷物",
      "baseRate": 1, // 每小时产出1单位
    }
  },
  "水渠": {
    name: "水渠",
    "baseEfficiency": 1.0,
    "upgrades": {
      "0": { "materials": [], "description": "未建造" },
      "1": { 
        "materials": [{ "name": "石块", "quantity": 10 }], 
        "efficiencyBonus": 0.2,
        "description": "挖掘一条简单的水渠，引导水源。" 
      }
    },
    "production": {
      "type": "continuous",
      "resource": "净水",
      "baseRate": 2, // 每小时产出2单位
    }
  },
  "池塘": {
    name: "池塘",
    "baseEfficiency": 1.0,
    "upgrades": {
      "0": { "materials": [], "description": "未建造" },
      "1": { 
        "materials": [{ "name": "泥土", "quantity": 10 }, { "name": "石块", "quantity": 5 }], 
        "efficiencyBonus": 0.1,
        "description": "挖掘一个小型池塘，养殖鱼类。" 
      }
    },
    "production": {
      "type": "continuous",
      "resource": "鲜鱼",
      "baseRate": 0.5, // 每小时产出0.5单位
    }
  },
  "工坊": {
    name: "工坊",
    "upgrades": {
      "初级工坊": {
        "materials": [],
        "baseDefense": 5,
        "description": "可以制造基础的工具和物品。"
      },
      "中级工坊": {
        "materials": [],
        "baseDefense": 10,
        "description": "可以制造更复杂的工具和设备。"
      }
    }
  },
  "瞭望塔": {
    name: "瞭望塔",
    "upgrades": {
      "木制塔楼": {
        "materials": [],
        "baseDefense": 5,
        "description": "扩大视野，预警危险。"
      },
      "石制塔楼": {
        "materials": [],
        "baseDefense": 10,
        "description": "更坚固的塔楼，提供更好的视野和预警。"
      }
    }
  }
};

// 状态转换规则定义
export const SHELTER_STATUS_RULES = {
  // 整体状态转换
  overallStatus: {
    "稳固": { minDefense: 30, minComfort: 70 },
    "受损": { minDefense: 10, maxDefense: 29, minComfort: 30 },
    "废弃": { maxDefense: 9, maxComfort: 29 }
  },
  // 组件状态转换
  componentStatus: {
    "完好无损": { minDurability: 80 },
    "轻微受损": { minDurability: 60, maxDurability: 79 },
    "严重受损": { minDurability: 30, maxDurability: 59 },
    "毁坏": { maxDurability: 29 }
  }
};
