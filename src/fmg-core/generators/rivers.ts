/**
 * 河流生成器
 * 
 * 本模块负责生成地图的河流系统，包括：
 * - 水流计算和排水系统
 * - 河流路径生成
 * - 河流汇合点计算
 * - 河床侵蚀模拟
 * 
 * 移植自 river-generator.js，保持算法一致性
 */

import { Pack, Grid, Cells, River } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * 河流生成配置
 */
export interface RiverConfig {
  /** 是否允许河床侵蚀 */
  allowErosion: boolean;
  /** 形成河流的最小水流量 */
  minFluxToFormRiver: number;
  /** 单元格数量修正因子 */
  cellsModifier: number;
  /** 最大河流迭代次数 */
  maxIterations: number;
}

/**
 * 河流数据
 */
export interface RiverData {
  /** 河流ID -> 经过的单元格数组 */
  riversData: Record<number, number[]>;
  /** 河流父级关系 */
  riverParents: Record<number, number>;
  /** 水流量数组 */
  flux: Uint16Array;
  /** 河流ID数组 */
  rivers: Uint16Array;
  /** 河流汇合点数组 */
  confluences: Uint8Array;
}

/**
 * 河流生成器类
 */
export class RiversGenerator {
  private rng: DeterministicRNG;
  private config: RiverConfig;
  private pack!: Pack;
  private grid!: Grid;

  constructor(rng: DeterministicRNG, config: Partial<RiverConfig> = {}) {
    this.rng = rng;
    this.config = {
      allowErosion: true,
      minFluxToFormRiver: 30,
      cellsModifier: 1,
      maxIterations: 1000,
      ...config
    };
  }

  /**
   * 生成河流系统
   */
  generate(pack: Pack, grid: Grid): RiverData {
    console.time('generateRivers');
    
    this.pack = pack;
    this.grid = grid;
    
    const { cells } = pack;
    const cellsCount = cells.i.length;

    // 初始化河流数据
    const riverData: RiverData = {
      riversData: {},
      riverParents: {},
      flux: new Uint16Array(cellsCount),
      rivers: new Uint16Array(cellsCount),
      confluences: new Uint8Array(cellsCount)
    };

    let riverNext = 1; // 第一个河流ID是1

    // 高度修正
    const modifiedHeights = this.alterHeights();
    
    // 检测湖泊
    this.detectCloseLakes(modifiedHeights);
    
    // 解决地形凹陷
    this.resolveDepressions(modifiedHeights);
    
    // 排水计算
    this.drainWater(riverData, modifiedHeights);
    
    // 定义河流
    this.defineRivers(riverData, modifiedHeights);
    
    // 计算汇合点水流量
    this.calculateConfluenceFlux(riverData);
    
    // 应用侵蚀效果
    if (this.config.allowErosion) {
      cells.h = new Uint8Array(modifiedHeights);
      this.downcutRivers(riverData, modifiedHeights);
    }

    // 更新Pack数据
    cells.fl = riverData.flux;
    cells.r = riverData.rivers;
    cells.conf = riverData.confluences;

    console.timeEnd('generateRivers');
    return riverData;
  }

  /**
   * 修正高度数据
   * 为河流生成创建平滑的地形
   */
  private alterHeights(): Float32Array {
    const { cells } = this.pack;
    const { h: heights } = cells;
    const modifiedHeights = new Float32Array(heights.length);

    // 复制原始高度并应用小幅随机变化
    for (let i = 0; i < heights.length; i++) {
      const randomOffset = (this.rng.random() - 0.5) * 0.1;
      modifiedHeights[i] = heights[i] + randomOffset;
    }

    return modifiedHeights;
  }

  /**
   * 检测临近湖泊
   */
  private detectCloseLakes(heights: Float32Array): void {
    const { cells } = this.pack;
    const { t: distance, haven } = cells;

    // 标记湖泊附近的单元格
    for (let i = 0; i < cells.i.length; i++) {
      if (haven && haven[i] && distance[i] > 0) {
        // 这是湖泊岸边的陆地单元格
        heights[i] = Math.max(heights[i], 20); // 确保湖泊岸边不会太低
      }
    }
  }

  /**
   * 解决地形凹陷
   * 确保水流能够正常流动
   */
  private resolveDepressions(heights: Float32Array): void {
    const { cells } = this.pack;
    const { c: neighbors } = cells;
    let changed = true;
    let iterations = 0;

    while (changed && iterations < this.config.maxIterations) {
      changed = false;
      iterations++;

      for (let i = 0; i < cells.i.length; i++) {
        if (heights[i] < 20) continue; // 跳过水域

        const neighborHeights = neighbors[i]
          .filter(nId => heights[nId] >= 20) // 只考虑陆地邻居
          .map(nId => heights[nId]);

        if (neighborHeights.length === 0) continue;

        const minNeighborHeight = Math.min(...neighborHeights);
        
        // 如果当前单元格比所有邻居都低，则提升高度
        if (heights[i] < minNeighborHeight) {
          heights[i] = minNeighborHeight + 0.1;
          changed = true;
        }
      }
    }
  }

  /**
   * 排水计算
   * 计算每个单元格的水流量
   */
  private drainWater(riverData: RiverData, heights: Float32Array): void {
    const { cells } = this.pack;
    const { c: neighbors, prec } = cells;
    const { flux } = riverData;

    // 获取所有陆地单元格，按高度降序排列
    const landCells = cells.i
      .filter(i => heights[i] >= 20)
      .sort((a, b) => heights[b] - heights[a]);

    // 为每个陆地单元格添加降水
    for (const cellId of landCells) {
      if (prec) {
        flux[cellId] += prec[cellId] / this.config.cellsModifier;
      } else {
        // 如果没有降水数据，使用默认值
        flux[cellId] += 10 / this.config.cellsModifier;
      }

      // 将水流向最低的邻居
      this.flowToLowest(cellId, heights, neighbors, flux);
    }
  }

  /**
   * 将水流导向最低邻居
   */
  private flowToLowest(
    cellId: number,
    heights: Float32Array,
    neighbors: number[][],
    flux: Uint16Array
  ): void {
    const currentHeight = heights[cellId];
    let lowestNeighbor = -1;
    let lowestHeight = currentHeight;

    for (const neighborId of neighbors[cellId]) {
      if (heights[neighborId] < lowestHeight) {
        lowestHeight = heights[neighborId];
        lowestNeighbor = neighborId;
      }
    }

    // 如果找到更低的邻居，将水流导向它
    if (lowestNeighbor !== -1) {
      flux[lowestNeighbor] += flux[cellId];
    }
  }

  /**
   * 定义河流
   * 根据水流量创建河流
   */
  private defineRivers(riverData: RiverData, heights: Float32Array): void {
    const { cells } = this.pack;
    const { flux, rivers, riversData } = riverData;
    let riverNext = 1;

    for (let i = 0; i < cells.i.length; i++) {
      if (flux[i] >= this.config.minFluxToFormRiver && heights[i] >= 20) {
        const riverId = riverNext++;
        rivers[i] = riverId;
        
        // 追踪河流路径
        const riverPath = this.traceRiverPath(i, heights, cells.c);
        riversData[riverId] = riverPath;
      }
    }
  }

  /**
   * 追踪河流路径
   */
  private traceRiverPath(startCellId: number, heights: Float32Array, neighbors: number[][]): number[] {
    const path = [startCellId];
    let currentCell = startCellId;
    const visited = new Set<number>();

    while (!visited.has(currentCell)) {
      visited.add(currentCell);
      
      // 找到最低的邻居
      let lowestNeighbor = -1;
      let lowestHeight = heights[currentCell];

      for (const neighborId of neighbors[currentCell]) {
        if (heights[neighborId] < lowestHeight && !visited.has(neighborId)) {
          lowestHeight = heights[neighborId];
          lowestNeighbor = neighborId;
        }
      }

      if (lowestNeighbor === -1 || heights[lowestNeighbor] >= 20) {
        break; // 到达海洋或没有更低的邻居
      }

      currentCell = lowestNeighbor;
      path.push(currentCell);
    }

    return path;
  }

  /**
   * 计算汇合点水流量
   */
  private calculateConfluenceFlux(riverData: RiverData): void {
    const { rivers, confluences, flux } = riverData;
    
    // 计算汇合点
    for (let i = 0; i < rivers.length; i++) {
      if (rivers[i] > 0) {
        let confluenceCount = 0;
        const neighbors = this.pack.cells.c[i];
        
        for (const neighborId of neighbors) {
          if (rivers[neighborId] > 0 && rivers[neighborId] !== rivers[i]) {
            confluenceCount++;
          }
        }
        
        confluences[i] = confluenceCount;
      }
    }
  }

  /**
   * 河床下切侵蚀
   * 模拟河流对地形的侵蚀作用
   */
  private downcutRivers(riverData: RiverData, heights: Float32Array): void {
    const { riversData, flux } = riverData;
    
    for (const [riverId, riverPath] of Object.entries(riversData)) {
      const id = parseInt(riverId);
      
      for (let i = 0; i < riverPath.length; i++) {
        const cellId = riverPath[i];
        const currentFlux = flux[cellId];
        
        // 基于水流量计算侵蚀强度
        const erosionPower = Math.min(currentFlux / 100, 5);
        heights[cellId] = Math.max(heights[cellId] - erosionPower, 1);
      }
    }
  }
}

/**
 * 便捷函数：生成河流
 */
export function generateRivers(
  pack: Pack,
  grid: Grid,
  rng: DeterministicRNG,
  config?: Partial<RiverConfig>
): RiverData {
  const generator = new RiversGenerator(rng, config);
  return generator.generate(pack, grid);
}
