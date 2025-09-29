/**
 * 文化生成器
 * 
 * 本模块负责生成地图的文化系统，包括：
 * - 文化起源点选择
 * - 文化扩张算法
 * - 文化属性定义
 * - 文化边界计算
 * 
 * 移植自 cultures-generator.js，去除UI依赖并参数化配置
 */

import { Pack, Culture, Cells } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * 文化生成配置
 */
export interface CultureConfig {
  /** 文化数量 */
  culturesCount: number;
  /** 文化集合名称 */
  cultureSet: string;
  /** 最小人口密度阈值 */
  minPopulationDensity: number;
  /** 扩张迭代次数 */
  expansionIterations: number;
  /** 文化扩张性范围 */
  expansionismRange: [number, number];
}

/**
 * 文化基础数据
 */
interface CultureBase {
  name: string;
  i: number;
  base: number;
  color: string;
  expansionism: number;
}

/**
 * 文化生成器类
 */
export class CulturesGenerator {
  private rng: DeterministicRNG;
  private config: CultureConfig;

  constructor(rng: DeterministicRNG, config: CultureConfig) {
    this.rng = rng;
    this.config = config;
  }

  /**
   * 生成文化系统
   */
  generate(pack: Pack): Culture[] {
    console.time('generateCultures');

    const { cells } = pack;
    const cultureIds = new Uint16Array(cells.i.length);
    
    // 获取有人口的单元格
    const populated = cells.i.filter(i => cells.s && cells.s[i] > 0);
    
    if (populated.length === 0) {
      console.warn('No populated cells found. Cannot generate cultures');
      const wildlands: Culture = {
        i: 0,
        name: 'Wildlands',
        base: 1,
        color: '#808080',
        expansionism: 0
      };
      
      cells.culture = cultureIds;
      console.timeEnd('generateCultures');
      return [wildlands];
    }

    // 计算实际文化数量
    let culturesCount = Math.min(this.config.culturesCount, Math.floor(populated.length / 25));
    if (culturesCount === 0) {
      culturesCount = 1;
      console.warn(`Insufficient populated cells (${populated.length}). Generating only 1 culture`);
    }

    // 生成文化
    const cultures = this.createCultures(culturesCount, populated, cells);
    
    // 分配文化到单元格
    this.assignCultures(cultures, populated, cells, cultureIds);
    
    // 扩张文化
    this.expandCultures(cultures, cells, cultureIds);

    cells.culture = cultureIds;
    
    console.timeEnd('generateCultures');
    return cultures;
  }

  /**
   * 创建文化对象
   */
  private createCultures(count: number, populated: number[], cells: Cells): Culture[] {
    const cultures: Culture[] = [];
    
    // 添加野地文化（ID 0）
    cultures.push({
      i: 0,
      name: 'Wildlands',
      base: 1,
      color: '#808080',
      expansionism: 0
    });

    // 选择文化起源点
    const origins = this.selectCultureOrigins(count, populated, cells);

    for (let i = 0; i < count; i++) {
      const cultureBase = this.getCultureBase(i);
      const origin = origins[i];

      const culture: Culture = {
        i: i + 1,
        name: this.generateCultureName(cultureBase),
        base: cultureBase.base,
        color: this.generateCultureColor(i),
        expansionism: this.rng.range(...this.config.expansionismRange),
        origin: origin,
        rural: 0,
        urban: 0
      };

      cultures.push(culture);
    }

    return cultures;
  }

  /**
   * 选择文化起源点
   */
  private selectCultureOrigins(count: number, populated: number[], cells: Cells): number[] {
    const origins: number[] = [];
    const candidates = [...populated];

    // 按人口密度排序，优先选择人口密集区域
    candidates.sort((a, b) => (cells.s![b] || 0) - (cells.s![a] || 0));

    for (let i = 0; i < count && candidates.length > 0; i++) {
      let selectedIndex = 0;
      
      if (i > 0) {
        // 为后续文化选择距离已选择起源点较远的位置
        selectedIndex = this.findMostDistantCell(candidates, origins, cells);
      }

      const origin = candidates[selectedIndex];
      origins.push(origin);
      candidates.splice(selectedIndex, 1);

      // 移除起源点附近的候选者，避免文化过于集中
      this.removeCandidatesNearOrigin(candidates, origin, cells, 5);
    }

    return origins;
  }

  /**
   * 查找距离现有起源点最远的单元格
   */
  private findMostDistantCell(candidates: number[], origins: number[], cells: Cells): number {
    let maxMinDistance = -1;
    let bestIndex = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidatePos = cells.p[candidate];
      
      let minDistance = Infinity;
      for (const origin of origins) {
        const originPos = cells.p[origin];
        const distance = Math.hypot(
          candidatePos[0] - originPos[0],
          candidatePos[1] - originPos[1]
        );
        minDistance = Math.min(minDistance, distance);
      }

      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * 移除起源点附近的候选者
   */
  private removeCandidatesNearOrigin(
    candidates: number[],
    origin: number,
    cells: Cells,
    minDistance: number
  ): void {
    const originPos = cells.p[origin];
    
    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = candidates[i];
      const candidatePos = cells.p[candidate];
      const distance = Math.hypot(
        candidatePos[0] - originPos[0],
        candidatePos[1] - originPos[1]
      );

      if (distance < minDistance) {
        candidates.splice(i, 1);
      }
    }
  }

  /**
   * 分配文化到单元格
   */
  private assignCultures(
    cultures: Culture[],
    populated: number[],
    cells: Cells,
    cultureIds: Uint16Array
  ): void {
    // 首先为起源点分配文化
    for (let i = 1; i < cultures.length; i++) {
      const culture = cultures[i];
      if (culture.origin !== undefined) {
        cultureIds[culture.origin] = culture.i;
      }
    }

    // 为剩余人口单元格分配最近的文化
    for (const cellId of populated) {
      if (cultureIds[cellId] > 0) continue; // 已分配

      let nearestCulture = 1; // 默认第一个文化
      let minDistance = Infinity;

      const cellPos = cells.p[cellId];

      for (let i = 1; i < cultures.length; i++) {
        const culture = cultures[i];
        if (culture.origin === undefined) continue;

        const originPos = cells.p[culture.origin];
        const distance = Math.hypot(
          cellPos[0] - originPos[0],
          cellPos[1] - originPos[1]
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestCulture = culture.i;
        }
      }

      cultureIds[cellId] = nearestCulture;
    }
  }

  /**
   * 扩张文化
   */
  private expandCultures(
    cultures: Culture[],
    cells: Cells,
    cultureIds: Uint16Array
  ): void {
    for (let iteration = 0; iteration < this.config.expansionIterations; iteration++) {
      const newAssignments: Array<{cellId: number, cultureId: number}> = [];

      for (let cellId = 0; cellId < cells.i.length; cellId++) {
        if (cultureIds[cellId] > 0) continue; // 已有文化
        if (!cells.s || cells.s[cellId] === 0) continue; // 无人口

        // 检查邻居的文化
        const neighborCultures = new Map<number, number>();
        
        for (const neighborId of cells.c[cellId]) {
          const neighborCulture = cultureIds[neighborId];
          if (neighborCulture > 0) {
            const count = neighborCultures.get(neighborCulture) || 0;
            neighborCultures.set(neighborCulture, count + 1);
          }
        }

        if (neighborCultures.size === 0) continue;

        // 选择影响最大的文化
        let dominantCulture = 0;
        let maxInfluence = 0;

        for (const [cultureId, count] of neighborCultures) {
          const culture = cultures[cultureId];
          const influence = count * (culture.expansionism + 1);
          
          if (influence > maxInfluence) {
            maxInfluence = influence;
            dominantCulture = cultureId;
          }
        }

        if (dominantCulture > 0) {
          newAssignments.push({ cellId, cultureId: dominantCulture });
        }
      }

      // 应用新分配
      for (const assignment of newAssignments) {
        cultureIds[assignment.cellId] = assignment.cultureId;
      }

      if (newAssignments.length === 0) break; // 没有新分配，停止扩张
    }
  }

  /**
   * 获取文化基础数据
   */
  private getCultureBase(index: number): CultureBase {
    // 这里可以根据 cultureSet 返回不同的文化基础数据
    // 为简化起见，使用默认数据
    const baseCultures = [
      { name: 'Generic', i: 1, base: 1, color: '#ff0000', expansionism: 1 },
      { name: 'Nordic', i: 2, base: 2, color: '#00ff00', expansionism: 2 },
      { name: 'Mediterranean', i: 3, base: 3, color: '#0000ff', expansionism: 1 },
      { name: 'Oriental', i: 4, base: 4, color: '#ffff00', expansionism: 2 },
      { name: 'Slavic', i: 5, base: 5, color: '#ff00ff', expansionism: 1 }
    ];

    return baseCultures[index % baseCultures.length];
  }

  /**
   * 生成文化名称
   */
  private generateCultureName(base: CultureBase): string {
    const nameVariants = [
      'culture', 'people', 'folk', 'tribe', 'clan', 'nation'
    ];
    
    const variant = nameVariants[this.rng.range(0, nameVariants.length - 1)];
    return `${base.name} ${variant}`;
  }

  /**
   * 生成文化颜色
   */
  private generateCultureColor(index: number): string {
    const colors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
      '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9'
    ];
    
    return colors[index % colors.length];
  }

  /**
   * 计算文化统计数据
   */
  calculateCultureStats(cultures: Culture[], cells: Cells): void {
    // 重置统计数据
    for (const culture of cultures) {
      culture.rural = 0;
      culture.urban = 0;
    }

    // 计算每个文化的人口
    for (let i = 0; i < cells.i.length; i++) {
      const cultureId = cells.culture![i];
      if (cultureId > 0 && cultureId < cultures.length) {
        const culture = cultures[cultureId];
        const population = cells.pop ? cells.pop[i] : (cells.s ? cells.s[i] : 0);
        
        // 简化：将所有人口视为农村人口
        culture.rural = (culture.rural || 0) + population;
      }
    }
  }
}

/**
 * 便捷函数：生成文化
 */
export function generateCultures(
  pack: Pack,
  rng: DeterministicRNG,
  config: CultureConfig
): Culture[] {
  const generator = new CulturesGenerator(rng, config);
  const cultures = generator.generate(pack);
  generator.calculateCultureStats(cultures, pack.cells);
  return cultures;
}
