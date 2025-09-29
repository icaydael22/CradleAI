/**
 * Fantasy Map Generator 核心类型定义
 * 
 * 本文件定义了 FMG 系统中的核心数据结构，包括：
 * - Grid: 基础网格系统，用于 Voronoi 图的底层计算
 * - Pack: 地图数据包，包含所有地图生成的结果数据  
 * - Cells: 单元格数据，是地图的基本构成单位
 * - Vertices: 顶点数据，用于多边形几何计算
 * 
 * 这些类型确保了数据结构的一致性和类型安全。
 */

/**
 * 二维坐标点
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 坐标数组形式 [x, y]
 */
export type Coordinate = [number, number];

/**
 * 网格顶点数据结构
 * 包含顶点的坐标、邻接关系和所属单元格信息
 */
export interface Vertices {
  /** 顶点坐标数组，每个元素是 [x, y] */
  p: Coordinate[];
  /** 每个顶点的邻接顶点索引数组 */
  v: number[][];
  /** 每个顶点所属的单元格索引数组 */
  c: number[][];
}

/**
 * 单元格数据结构
 * 每个单元格代表地图上的一个区域，包含地理、政治、文化等各种属性
 */
export interface Cells {
  /** 单元格索引数组 */
  i: number[];
  /** 单元格中心坐标，每个元素是 [x, y] */
  p: Coordinate[];
  /** 每个单元格的顶点索引数组 */
  v: number[][];
  /** 每个单元格的邻接单元格索引数组 */
  c: number[][];
  /** 边界标记：1表示边界单元格，0表示内部单元格 */
  b: Uint8Array;
  
  // 地理属性
  /** 海拔高度 (0-100) */
  h: Uint8Array;
  /** 地形类型：1=陆地, 0=水域, -1=深海 */
  t: Int8Array;
  /** 是否为湖泊：1=是，0=否 */
  haven?: Uint8Array;
  /** 河流ID，0表示无河流 */
  r?: Uint16Array;
  /** 道路等级 */
  road?: Uint16Array;
  
  // 气候属性  
  /** 温度 (0-100) */
  temp?: Uint8Array;
  /** 降水量 (0-100) */
  prec?: Uint8Array;
  /** 生物群系ID */
  biome?: Uint16Array;
  
  // 政治文化属性
  /** 文化ID */
  culture?: Uint16Array;
  /** 宗教ID */
  religion?: Uint16Array;
  /** 国家ID */
  state?: Uint16Array;
  /** 省份ID */
  province?: Uint16Array;
  /** 城镇ID，0表示无城镇 */
  burg?: Uint16Array;
  
  // 人口和经济
  /** 人口密度 */
  s?: Uint8Array;
  /** 人口数量 */
  pop?: Float32Array;
  
  // 四叉树用于空间查询
  q?: any; // d3-quadtree 类型
  
  // 特征和映射属性
  /** 特征ID */
  f?: Uint16Array;
  /** 网格单元格映射 */
  g?: number[];
  /** 水流量 */
  fl?: Uint16Array;
  /** 汇合点 */
  conf?: Uint8Array;
}

/**
 * 基础网格结构
 * 包含 Voronoi 图的基本几何信息和空间划分数据
 */
export interface Grid {
  /** 目标单元格数量 */
  cellsDesired: number;
  /** 网格宽度 */
  cellsX: number;
  /** 网格高度 */
  cellsY: number;
  /** 种子点坐标数组 */
  points: Coordinate[];
  /** 单元格数据 */
  cells: Cells;
  /** 顶点数据 */
  vertices: Vertices;
  /** 边界框 */
  boundary: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 文化数据结构
 */
export interface Culture {
  /** 文化ID */
  i: number;
  /** 文化名称 */
  name: string;
  /** 基础类型 */
  base: number;
  /** 颜色 */
  color: string;
  /** 扩张性 (0-3) */
  expansionism: number;
  /** 起源单元格 */
  origin?: number;
  /** 人口数量 */
  rural?: number;
  urban?: number;
  /** 是否已移除 */
  removed?: boolean;
}

/**
 * 宗教数据结构  
 */
export interface Religion {
  /** 宗教ID */
  i: number;
  /** 宗教名称 */
  name: string;
  /** 宗教类型 */
  type: string;
  /** 宗教形式 */
  form: string;
  /** 所属文化ID */
  culture: number;
  /** 颜色 */
  color: string;
  /** 起源单元格 */
  origin?: number;
  /** 是否已移除 */
  removed?: boolean;
}

/**
 * 国家数据结构
 */
export interface State {
  /** 国家ID */
  i: number;
  /** 国家名称 */
  name: string;
  /** 全名 */
  fullName: string;
  /** 颜色 */
  color: string;
  /** 所属文化ID */
  culture: number;
  /** 政治制度 */
  form: string;
  /** 首都城镇ID */
  capital: number;
  /** 中心单元格ID */
  center: number;
  /** 领土面积 */
  area?: number;
  /** 人口数量 */
  rural?: number;
  urban?: number;
  /** 是否已移除 */
  removed?: boolean;
}

/**
 * 城镇数据结构
 */
export interface Burg {
  /** 城镇ID */
  i: number;
  /** 城镇名称 */
  name: string;
  /** 所在单元格ID */
  cell: number;
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
  /** 所属国家ID */
  state: number;
  /** 人口数量 */
  population: number;
  /** 城镇类型 */
  type: string;
  /** 是否为首都：1=是，0=否 */
  capital: number;
  /** 地理特征ID */
  feature: number;
  /** 是否为港口：1=是，0=否 */
  port: number;
  /** 是否已移除 */
  removed?: boolean;
}

/**
 * 河流数据结构
 */
export interface River {
  /** 河流ID */
  i: number;
  /** 源头单元格ID */
  source: number;
  /** 河流经过的单元格数组 */
  cells: number[];
  /** 河流类型 */
  type: string;
  /** 河流宽度 */
  width?: number;
}

/**
 * 标记数据结构
 */
export interface Marker {
  /** 标记ID */
  i: number;
  /** 所在单元格ID */
  cell: number;
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
  /** 标记类型 */
  type: string;
  /** 大小 */
  size: number;
  /** X偏移 */
  dx: number;
  /** Y偏移 */
  dy: number;
}

/**
 * 注释数据结构
 */
export interface Note {
  /** 注释ID */
  id: string;
  /** 注释名称 */
  name: string;
  /** 图例信息 */
  legend: string;
}

/**
 * 地形特征数据
 */
export interface Feature {
  /** 特征ID */
  i: number;
  /** 特征类型 */
  type: string;
  /** 是否为陆地特征 */
  land: boolean;
  /** 是否接触边界 */
  border: boolean;
  /** 包含的单元格数组 */
  cells?: number[];
  /** 总面积 */
  area?: number;
  /** 高度（用于湖泊） */
  height?: number;
  /** 岸线单元格（用于湖泊） */
  shoreline?: number[];
  /** 顶点数组 */
  vertices?: number[];
  /** 第一个单元格 */
  firstCell?: number;
}

/**
 * 地图数据包
 * 包含完整的地图生成结果，是系统的核心数据结构
 */
export interface Pack {
  /** 单元格数据 */
  cells: Cells;
  /** 文化数据数组 */
  cultures: Culture[];
  /** 宗教数据数组 */
  religions: Religion[];
  /** 国家数据数组 */
  states: State[];
  /** 城镇数据数组 */
  burgs: Burg[];
  /** 河流数据数组 */
  rivers: River[];
  /** 标记数据数组 */
  markers: Marker[];
  /** 地形特征数组 */
  features?: Feature[];
  /** 省份数据数组 */
  provinces?: any[];
  /** 路径数据数组 */
  routes?: any[];
}

/**
 * 地图生成配置参数
 */
export interface MapConfig {
  /** 随机种子 */
  seed: string;
  /** 单元格数量 */
  cellsNumber: number;
  /** 地图宽度 */
  mapWidth: number;
  /** 地图高度 */
  mapHeight: number;
  /** 高度图模板ID */
  heightmapTemplate: string;
  /** 文化数量 */
  culturesCount: number;
  /** 国家数量 */
  statesCount: number;
  /** 宗教数量 */
  religionsCount: number;
}

/**
 * 生成器步骤枚举
 * 定义地图生成的各个阶段
 */
export enum GenerationStep {
  GRID = 'grid',
  HEIGHTMAP = 'heightmap', 
  FEATURES = 'features',
  CLIMATES = 'climates',
  CULTURES = 'cultures',
  STATES = 'states',
  RIVERS = 'rivers',
  MARKERS = 'markers'
}

/**
 * 性能统计数据
 */
export interface PerformanceStats {
  step: GenerationStep;
  duration: number;
  memoryUsed: number;
  cellsProcessed: number;
}
