/**
 * 湖泊生成器
 * 
 * 本模块负责处理地图中的湖泊系统，包括：
 * - 湖泊高度计算
 * - 湖泊开放性检测（是否为封闭湖泊）
 * - 湖泊出水口定义
 * - 湖泊气候数据处理
 * 
 * 移植自 lakes.js，保持算法一致性
 */

import { Pack, Feature, Cells } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * 湖泊配置参数
 */
export interface LakeConfig {
  /** 湖泊高度变化量 */
  elevationDelta: number;
  /** 湖泊高度限制 */
  elevationLimit: number;
  /** 最大搜索迭代次数 */
  maxIterations: number;
}

/**
 * 湖泊数据
 */
export interface LakeData {
  /** 湖泊出水口单元格数组 */
  outletCells: Uint16Array;
  /** 湖泊是否封闭 */
  closedLakes: Set<number>;
}

/**
 * 湖泊生成器类
 */
export class LakesGenerator {
  private rng: DeterministicRNG;
  private config: LakeConfig;

  constructor(rng: DeterministicRNG, config: Partial<LakeConfig> = {}) {
    this.rng = rng;
    this.config = {
      elevationDelta: 0.1,
      elevationLimit: 20,
      maxIterations: 1000,
      ...config
    };
  }

  /**
   * 检测封闭湖泊
   * 判断湖泊是否位于深度凹陷中，无法流出
   */
  detectCloseLakes(pack: Pack, heights: Float32Array): Set<number> {
    const closedLakes = new Set<number>();
    const { features, cells } = pack;

    if (!features) return closedLakes;

    for (const feature of features) {
      if (feature.type !== 'lake') continue;
      
      const featureId = feature.i;
      const maxElevation = feature.height! + this.config.elevationLimit;

      // 如果最大高度超过99，认为是开放湖泊
      if (maxElevation > 99) {
        continue;
      }

      let isDeep = true;
      
      // 从最低的岸线单元格开始搜索
      const shoreline = this.getLakeShoreline(pack, feature);
      if (shoreline.length === 0) continue;

      const lowestShorelineCell = shoreline.sort((a, b) => heights[a] - heights[b])[0];
      const queue = [lowestShorelineCell];
      const checked = new Set<number>();
      checked.add(lowestShorelineCell);

      // 广度优先搜索，查找是否能到达海洋
      while (queue.length > 0 && isDeep) {
        const cellId = queue.pop()!;

        for (const neighborId of cells.c[cellId]) {
          if (checked.has(neighborId)) continue;
          if (heights[neighborId] >= maxElevation) continue;

                     // 如果到达水域
           if (heights[neighborId] < 20) {
             const neighborFeatureId = cells.f?.[neighborId];
             if (neighborFeatureId !== undefined && features[neighborFeatureId]) {
               const neighborFeature = features[neighborFeatureId];
               
               // 如果到达海洋，或者到达更低的湖泊，则不是封闭湖泊
               if (neighborFeature.type === 'ocean' || feature.height! > neighborFeature.height!) {
                 isDeep = false;
                 break;
               }
             }
           }

          checked.add(neighborId);
          queue.push(neighborId);
        }
      }

      if (isDeep) {
        closedLakes.add(featureId);
      }
    }

    return closedLakes;
  }

  /**
   * 定义湖泊气候数据
   * 计算湖泊的出水口和相关气候影响
   */
  defineClimateData(pack: Pack, heights: Float32Array): Uint16Array {
    const { cells, features } = pack;
    const lakeOutCells = new Uint16Array(cells.i.length);

    if (!features) return lakeOutCells;

    for (const feature of features) {
      if (feature.type !== 'lake') continue;

      const lakeCells = this.getLakeCells(pack, feature);
      let minHeight = Infinity;
      let outletCell = -1;

      // 寻找湖泊的最低出水口
      for (const cellId of lakeCells) {
        const neighbors = cells.c[cellId];
        
        for (const neighborId of neighbors) {
          // 检查邻居是否为陆地
          if (heights[neighborId] >= 20) {
            if (heights[neighborId] < minHeight) {
              minHeight = heights[neighborId];
              outletCell = neighborId;
            }
          }
        }
      }

      // 设置出水口
      if (outletCell !== -1) {
        for (const cellId of lakeCells) {
          lakeOutCells[cellId] = outletCell;
        }
      }
    }

    return lakeOutCells;
  }

  /**
   * 计算湖泊高度
   * 基于周围地形计算湖泊的水位
   */
  getHeight(feature: Feature, pack: Pack, heights: Float32Array): number {
    if (feature.type !== 'lake') return 0;

    const shoreline = this.getLakeShoreline(pack, feature);
    if (shoreline.length === 0) return 20;

    // 计算岸线的最低高度
    const shorelineHeights = shoreline.map(cellId => heights[cellId]);
    const minShorelineHeight = Math.min(...shorelineHeights);

    // 湖泊水位稍低于最低岸线
    return Math.max(minShorelineHeight - this.config.elevationDelta, 1);
  }

  /**
   * 获取湖泊的岸线单元格
   */
  private getLakeShoreline(pack: Pack, feature: Feature): number[] {
    const { cells } = pack;
    const shoreline: number[] = [];
    const lakeCells = this.getLakeCells(pack, feature);

    for (const cellId of lakeCells) {
      const neighbors = cells.c[cellId];
      
      // 检查是否有陆地邻居
      const hasLandNeighbor = neighbors.some(neighborId => 
        cells.h[neighborId] >= 20
      );

      if (hasLandNeighbor) {
        // 将所有陆地邻居添加到岸线
        neighbors.forEach(neighborId => {
          if (cells.h[neighborId] >= 20 && !shoreline.includes(neighborId)) {
            shoreline.push(neighborId);
          }
        });
      }
    }

    return shoreline;
  }

  /**
   * 获取湖泊包含的所有单元格
   */
  private getLakeCells(pack: Pack, feature: Feature): number[] {
    const { cells } = pack;
    const lakeCells: number[] = [];

         // 遍历所有单元格，找到属于该湖泊特征的单元格
     for (let i = 0; i < cells.i.length; i++) {
       if (cells.f?.[i] === feature.i) {
         lakeCells.push(i);
       }
     }

    return lakeCells;
  }

  /**
   * 清理湖泊数据
   * 移除临时数据和优化内存使用
   */
  cleanupLakeData(pack: Pack): void {
    const { features } = pack;
    
    if (!features) return;

    // 清理临时属性
    for (const feature of features) {
      if (feature.type === 'lake') {
        // 保留必要属性，清理临时计算数据
        delete (feature as any).tempData;
      }
    }
  }

  /**
   * 更新湖泊高度
   * 重新计算所有湖泊的水位
   */
  updateLakeHeights(pack: Pack, heights: Float32Array): void {
    const { features } = pack;
    
    if (!features) return;

    for (const feature of features) {
      if (feature.type === 'lake') {
        feature.height = this.getHeight(feature, pack, heights);
      }
    }
  }

  /**
   * 检查湖泊连通性
   * 确定湖泊之间的连接关系
   */
  checkLakeConnectivity(pack: Pack): Map<number, number[]> {
    const { features, cells } = pack;
    const connectivity = new Map<number, number[]>();

    if (!features) return connectivity;

    const lakeFeatures = features.filter(f => f.type === 'lake');

    for (const lake of lakeFeatures) {
      const connectedLakes: number[] = [];
      const lakeCells = this.getLakeCells(pack, lake);

      for (const cellId of lakeCells) {
        const neighbors = cells.c[cellId];
        
                 for (const neighborId of neighbors) {
           const neighborFeatureId = cells.f?.[neighborId];
           if (neighborFeatureId !== undefined && features[neighborFeatureId]) {
             const neighborFeature = features[neighborFeatureId];
             
             if (neighborFeature.type === 'lake' && 
                 neighborFeature.i !== lake.i &&
                 !connectedLakes.includes(neighborFeature.i)) {
               connectedLakes.push(neighborFeature.i);
             }
           }
         }
      }

      connectivity.set(lake.i, connectedLakes);
    }

    return connectivity;
  }
}

/**
 * 便捷函数：检测封闭湖泊
 */
export function detectCloseLakes(
  pack: Pack,
  heights: Float32Array,
  rng: DeterministicRNG,
  config?: Partial<LakeConfig>
): Set<number> {
  const generator = new LakesGenerator(rng, config);
  return generator.detectCloseLakes(pack, heights);
}

/**
 * 便捷函数：定义湖泊气候数据
 */
export function defineClimateData(
  pack: Pack,
  heights: Float32Array,
  rng: DeterministicRNG,
  config?: Partial<LakeConfig>
): Uint16Array {
  const generator = new LakesGenerator(rng, config);
  return generator.defineClimateData(pack, heights);
}

/**
 * 便捷函数：计算湖泊高度
 */
export function calculateLakeHeight(
  feature: Feature,
  pack: Pack,
  heights: Float32Array,
  rng: DeterministicRNG,
  config?: Partial<LakeConfig>
): number {
  const generator = new LakesGenerator(rng, config);
  return generator.getHeight(feature, pack, heights);
}
