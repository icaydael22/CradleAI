/**
 * 地形特征标记系统
 * 
 * 本模块负责标记和分析地图的地形特征，包括：
 * - 海洋、湖泊、岛屿的识别和标记
 * - 距离场计算（到海岸线的距离）
 * - 地形类型分类和边界检测
 * 
 * 移植自 features.js，保持算法一致性的同时去除 DOM 依赖
 */

import { Grid, Pack, Cells } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * 地形特征常量
 */
export const FEATURE_TYPES = {
  DEEPER_LAND: 3,
  LANDLOCKED: 2, 
  LAND_COAST: 1,
  UNMARKED: 0,
  WATER_COAST: -1,
  DEEP_WATER: -2
} as const;

/**
 * 地形特征数据
 */
export interface Feature {
  /** 特征ID */
  i: number;
  /** 是否为陆地特征 */
  land: boolean;
  /** 是否接触边界 */
  border: boolean;
  /** 包含的单元格数组 */
  cells: number[];
  /** 总面积 */
  area?: number;
}

/**
 * 特征标记配置
 */
export interface FeatureConfig {
  /** 陆地海拔阈值 */
  landHeightThreshold: number;
  /** 最大距离限制 */
  maxDistance: number;
}

/**
 * 地形特征生成器类
 */
export class FeaturesGenerator {
  private rng: DeterministicRNG;
  private config: FeatureConfig;

  constructor(rng: DeterministicRNG, config: FeatureConfig = { landHeightThreshold: 20, maxDistance: 127 }) {
    this.rng = rng;
    this.config = config;
  }

  /**
   * 标记网格特征
   * 识别海洋、湖泊、岛屿并计算距离场
   */
  markupGrid(grid: Grid): void {
    console.time('markupGrid');
    
    const { cells } = grid;
    const { h: heights, c: neighbors, b: borderCells, i } = cells;
    const cellsNumber = i.length;
    
    // 初始化距离场和特征ID数组
    const distanceField = new Int8Array(cellsNumber);
    const featureIds = new Uint16Array(cellsNumber);
    const features: Feature[] = [{ i: 0, land: false, border: false, cells: [] }]; // 占位符

    const queue: number[] = [0];
    
    for (let featureId = 1; queue[0] !== -1; featureId++) {
      const firstCell = queue[0];
      featureIds[firstCell] = featureId;

      const land = heights[firstCell] >= this.config.landHeightThreshold;
      let border = false;
      const cells: number[] = [];

      // 广度优先搜索连通区域
      while (queue.length) {
        const cellId = queue.pop()!;
        cells.push(cellId);
        
        if (!border && borderCells[cellId]) {
          border = true;
        }

        for (const neighborId of neighbors[cellId]) {
          if (featureIds[neighborId]) continue;
          
          const neighborLand = heights[neighborId] >= this.config.landHeightThreshold;
          if (neighborLand !== land) continue;

          featureIds[neighborId] = featureId;
          queue.push(neighborId);
        }
      }

      // 创建特征对象
      features.push({
        i: featureId,
        land,
        border,
        cells,
        area: cells.length
      });

      // 寻找下一个未标记的单元格
      queue[0] = -1;
      for (let cellId = 0; cellId < cellsNumber; cellId++) {
        if (!featureIds[cellId]) {
          queue[0] = cellId;
          break;
        }
      }
    }

    // 计算距离场
    this.calculateDistanceField(grid, distanceField, neighbors, heights, borderCells);

    // 更新网格数据
    cells.t = distanceField;
    cells.f = featureIds;
    (grid as any).features = features;

    console.timeEnd('markupGrid');
  }

  /**
   * 标记Pack数据的特征
   * 基于网格特征数据生成Pack级别的特征信息
   */
  markupPack(pack: Pack, grid: Grid): void {
    console.time('markupPack');

    const { cells } = pack;
    const { i, g } = cells; // g 是对网格单元格的映射
    const gridCells = grid.cells;
    
    if (!g) {
      console.warn('Grid mapping not found in pack cells');
      return;
    }
    
    // 复制网格特征数据到Pack
    cells.t = new Int8Array(i.length);
    cells.f = new Uint16Array(i.length);
    cells.haven = new Uint8Array(i.length); // 湖泊标记

    for (let packCellId = 0; packCellId < i.length; packCellId++) {
      const gridCellId = g[packCellId];
      if (gridCellId !== undefined) {
        cells.t[packCellId] = gridCells.t[gridCellId];
        if (gridCells.f && cells.f) {
          cells.f[packCellId] = gridCells.f[gridCellId];
        }
      }
    }

    // 标记湖泊
    this.markLakes(pack, grid);

    console.timeEnd('markupPack');
  }

  /**
   * 计算距离场
   * 使用广度优先搜索计算每个单元格到海岸线的距离
   */
  private calculateDistanceField(
    grid: Grid,
    distanceField: Int8Array,
    neighbors: number[][],
    heights: Uint8Array,
    borderCells: Uint8Array
  ): void {
    const { landHeightThreshold, maxDistance } = this.config;

    // 初始化海岸线
    for (let cellId = 0; cellId < heights.length; cellId++) {
      const isLand = heights[cellId] >= landHeightThreshold;
      const hasWaterNeighbor = neighbors[cellId].some(nId => 
        heights[nId] < landHeightThreshold
      );
      const hasLandNeighbor = neighbors[cellId].some(nId => 
        heights[nId] >= landHeightThreshold
      );

      if (isLand && hasWaterNeighbor) {
        distanceField[cellId] = FEATURE_TYPES.LAND_COAST;
      } else if (!isLand && hasLandNeighbor) {
        distanceField[cellId] = FEATURE_TYPES.WATER_COAST;
      }
    }

    // 向陆地方向扩展
    this.markupDistance({
      distanceField,
      neighbors,
      start: FEATURE_TYPES.LAND_COAST,
      increment: 1,
      limit: maxDistance
    });

    // 向海洋方向扩展
    this.markupDistance({
      distanceField,
      neighbors,
      start: FEATURE_TYPES.WATER_COAST,
      increment: -1,
      limit: -maxDistance
    });
  }

  /**
   * 距离标记算法
   * 从起始距离开始，逐步向外扩展标记距离值
   */
  private markupDistance({
    distanceField,
    neighbors,
    start,
    increment,
    limit
  }: {
    distanceField: Int8Array;
    neighbors: number[][];
    start: number;
    increment: number;
    limit: number;
  }): void {
    for (let distance = start, marked = Infinity; marked > 0 && distance !== limit; distance += increment) {
      marked = 0;
      const prevDistance = distance - increment;
      
      for (let cellId = 0; cellId < neighbors.length; cellId++) {
        if (distanceField[cellId] !== prevDistance) continue;

        for (const neighborId of neighbors[cellId]) {
          if (distanceField[neighborId] !== FEATURE_TYPES.UNMARKED) continue;
          
          distanceField[neighborId] = distance;
          marked++;
        }
      }
    }
  }

  /**
   * 标记湖泊
   * 识别内陆水体并标记为湖泊
   */
  private markLakes(pack: Pack, grid: Grid): void {
    const { cells } = pack;
    const { t: distance, h: heights, haven } = cells;

    if (!distance || !heights || !haven) {
      console.warn('Required arrays not initialized in markLakes');
      return;
    }

    // 简化版湖泊标记：基于地形类型直接标记
    // 找到所有被陆地包围的水域单元格
    for (let i = 0; i < distance.length; i++) {
      if (heights[i] < 20) { // 水域
        const neighbors = cells.c[i];
        if (!neighbors) continue;

        // 检查是否被陆地包围（简化判断）
        let landNeighbors = 0;
        for (const neighborId of neighbors) {
          if (neighborId < heights.length && heights[neighborId] >= 20) {
            landNeighbors++;
          }
        }

        // 如果大部分邻居都是陆地，则标记为湖泊
        if (landNeighbors >= neighbors.length * 0.6) {
          haven[i] = 1;
        }
      }
    }
  }

  /**
   * 根据网格单元格ID查找对应的Pack单元格ID
   */
  private findPackCellByGridCell(pack: Pack, gridCellId: number): number {
    const { g } = pack.cells;
    if (!g) return -1;
    
    for (let i = 0; i < g.length; i++) {
      if (g[i] === gridCellId) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 指定特征类型
   * 根据距离场值确定每个单元格的具体特征类型
   */
  specifyFeatures(cells: Cells): void {
    const { t: distance, h: heights } = cells;
    
    for (let i = 0; i < distance.length; i++) {
      const dist = distance[i];
      const height = heights[i];

      if (dist > 0) {
        // 陆地区域
        if (dist === 1) {
          cells.t[i] = FEATURE_TYPES.LAND_COAST;
        } else if (dist >= 2 && dist <= 5) {
          cells.t[i] = FEATURE_TYPES.LANDLOCKED;
        } else {
          cells.t[i] = FEATURE_TYPES.DEEPER_LAND;
        }
      } else if (dist < 0) {
        // 水域区域
        if (dist === -1) {
          cells.t[i] = FEATURE_TYPES.WATER_COAST;
        } else {
          cells.t[i] = FEATURE_TYPES.DEEP_WATER;
        }
      } else {
        // 未标记区域
        cells.t[i] = height >= 20 ? FEATURE_TYPES.LAND_COAST : FEATURE_TYPES.WATER_COAST;
      }
    }
  }
}

/**
 * 便捷函数：标记网格特征
 */
export function markupGridFeatures(grid: Grid, rng: DeterministicRNG, config?: FeatureConfig): void {
  const generator = new FeaturesGenerator(rng, config);
  generator.markupGrid(grid);
}

/**
 * 便捷函数：标记Pack特征
 */
export function markupPackFeatures(pack: Pack, grid: Grid, rng: DeterministicRNG, config?: FeatureConfig): void {
  const generator = new FeaturesGenerator(rng, config);
  generator.markupPack(pack, grid);
  generator.specifyFeatures(pack.cells);
  
  // 生成基础特征数组
  generatePackFeatures(pack, grid);
}

/**
 * 生成Pack的特征数组
 */
export function generatePackFeatures(pack: Pack, grid: Grid): void {
  const features: any[] = [];
  const { cells } = pack;
  const { h: heights, t: terrainType } = cells;
  
  // 创建海洋特征
  const oceanFeature = {
    i: 0,
    type: 'ocean',
    vertices: [],
    land: false,
    border: true
  };
  features.push(oceanFeature);
  
  // 查找连续的陆地区域和湖泊
  const visited = new Set<number>();
  let featureId = 1;
  
  for (let i = 0; i < heights.length; i++) {
    if (visited.has(i)) continue;
    
    const isLand = heights[i] >= 20;
    const isLake = heights[i] < 20 && cells.haven && cells.haven[i] === 1;
    
    if (isLand || isLake) {
      // 使用BFS找到连续区域
      const featureCells = [];
      const queue = [i];
      visited.add(i);
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        featureCells.push(current);
        
        const neighbors = cells.c[current];
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              const neighborIsLand = heights[neighbor] >= 20;
              const neighborIsLake = heights[neighbor] < 20 && cells.haven && cells.haven[neighbor] === 1;
              
              if ((isLand && neighborIsLand) || (isLake && neighborIsLake)) {
                visited.add(neighbor);
                queue.push(neighbor);
              }
            }
          }
        }
      }
      
      // 创建特征
      if (featureCells.length > 0) {
        const feature = {
          i: featureId++,
          type: isLake ? 'lake' : 'land',
          vertices: generateVerticesForCells(featureCells, cells),
          land: isLand,
          border: false,
          cells: featureCells
        };
        features.push(feature);
      }
    }
  }
  
  pack.features = features;
}

/**
 * 为单元格组生成顶点数组
 */
function generateVerticesForCells(cellIds: number[], cells: any): number[] {
  const vertexSet = new Set<number>();
  
  // 收集所有单元格的顶点
  for (const cellId of cellIds) {
    const cellVertices = cells.v[cellId];
    if (cellVertices) {
      for (const vertex of cellVertices) {
        vertexSet.add(vertex);
      }
    }
  }
  
  return Array.from(vertexSet);
}
