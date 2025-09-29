/**
 * 城镇和国家生成器
 * 
 * 本模块负责生成地图的政治系统，包括：
 * - 首都城市选址
 * - 国家边界划分
 * - 城镇分布计算
 * - 政治制度分配
 * 
 * 移植自 burgs-and-states.js，去除UI依赖并参数化配置
 */

import { Pack, State, Burg, Culture, Cells } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * 城镇和国家生成配置
 */
export interface BurgsAndStatesConfig {
  /** 国家数量 */
  statesCount: number;
  /** 城镇密度（每个国家的平均城镇数） */
  townDensity: number;
  /** 最小国家间距离 */
  minStateDistance: number;
  /** 国家扩张迭代次数 */
  expansionIterations: number;
  /** 城市规模范围 */
  cityScaleRange: [number, number];
}

/**
 * 四叉树类型（简化版）
 */
interface QuadTree {
  add: (point: [number, number]) => void;
  find: (x: number, y: number, radius: number) => [number, number] | undefined;
}

/**
 * 城镇和国家生成器类
 */
export class BurgsAndStatesGenerator {
  private rng: DeterministicRNG;
  private config: BurgsAndStatesConfig;

  constructor(rng: DeterministicRNG, config: BurgsAndStatesConfig) {
    this.rng = rng;
    this.config = config;
  }

  /**
   * 生成城镇和国家系统
   */
  generate(pack: Pack): { states: State[], burgs: Burg[] } {
    console.time('generateBurgsAndStates');

    const { cells } = pack;
    
    // 初始化城镇数组
    cells.burg = new Uint16Array(cells.i.length);
    
    // 创建首都和国家
    const burgs = this.placeCapitals(pack);
    const states = this.createStates(pack, burgs);
    
    // 放置其他城镇
    this.placeTowns(pack, burgs, states);
    
    // 扩张国家边界
    this.expandStates(pack, states);
    
    // 规范化国家边界
    this.normalizeStates(pack, states);
    
    // 指定城镇类型
    this.specifyBurgs(burgs, states);
    
    // 收集统计数据
    this.collectStatistics(pack, states, burgs);
    
    // 分配颜色
    this.assignColors(states);

    console.timeEnd('generateBurgsAndStates');
    return { states, burgs };
  }

  /**
   * 放置首都城市
   */
  private placeCapitals(pack: Pack): Burg[] {
    console.time('placeCapitals');
    
    const { cells } = pack;
    const burgs: Burg[] = [
      // 占位符（ID 0）
      {
        i: 0,
        name: '',
        cell: 0,
        x: 0,
        y: 0,
        state: 0,
        population: 0,
        type: '',
        capital: 0,
        feature: 0,
        port: 0
      }
    ];

    let count = this.config.statesCount;

    // 计算单元格分数（基于人口密度）
    const score = new Int16Array(cells.i.length);
    for (let i = 0; i < cells.i.length; i++) {
      if (cells.s && cells.culture && cells.s[i] > 0 && cells.culture[i] > 0) {
        score[i] = cells.s[i] * (0.5 + this.rng.random() * 0.5);
      }
    }

    // 过滤和排序候选位置
    const sorted = cells.i
      .filter(i => score[i] > 0)
      .sort((a, b) => score[b] - score[a]);

    if (sorted.length < count * 10) {
      count = Math.floor(sorted.length / 10);
      if (count === 0) {
        console.warn('No populated cells found. Cannot generate states');
        console.timeEnd('placeCapitals');
        return burgs;
      }
      console.warn(`Insufficient populated cells (${sorted.length}). Generating only ${count} states`);
    }

    // 创建简化的四叉树
    const burgsTree = this.createSimpleQuadTree();
    const spacing = this.config.minStateDistance;

    for (let i = 0; burgs.length <= count && i < sorted.length; i++) {
      const cell = sorted[i];
      const [x, y] = cells.p[cell];

      // 检查与现有首都的距离
      if (burgsTree.find(x, y, spacing)) continue;

      // 创建新首都
      const burgId = burgs.length;
      const burg: Burg = {
        i: burgId,
        name: this.generateBurgName(),
        cell: cell,
        x: x,
        y: y,
        state: burgId, // 首都的state ID与burg ID相同
        population: this.calculateCapitalPopulation(cells.s![cell]),
        type: 'city',
        capital: 1,
        feature: cells.f ? cells.f[cell] : 0,
        port: this.isPort(cell, cells) ? 1 : 0
      };

      burgs.push(burg);
      if (cells.burg) {
        cells.burg[cell] = burgId;
      }
      burgsTree.add([x, y]);
    }

    console.timeEnd('placeCapitals');
    return burgs;
  }

  /**
   * 创建国家
   */
  private createStates(pack: Pack, burgs: Burg[]): State[] {
    console.time('createStates');
    
    const { cells } = pack;
    const states: State[] = [
      // 占位符（ID 0 - 中性区域）
      {
        i: 0,
        name: 'Neutrals',
        fullName: 'Neutral Lands',
        color: '#808080',
        culture: 0,
        form: 'Neutrals',
        capital: 0,
        center: 0
      }
    ];

    // 为每个首都创建对应的国家
    for (let i = 1; i < burgs.length; i++) {
      const capital = burgs[i];
      const cultureId = cells.culture![capital.cell];
      
      const state: State = {
        i: i,
        name: this.generateStateName(),
        fullName: this.generateStateFullName(),
        color: this.generateStateColor(i),
        culture: cultureId,
        form: this.generateStateForm(),
        capital: capital.i,
        center: capital.cell,
        area: 0,
        rural: 0,
        urban: 0
      };

      states.push(state);
    }

    // 初始化国家分配
    cells.state = new Uint16Array(cells.i.length);
    for (let i = 1; i < burgs.length; i++) {
      const capital = burgs[i];
      cells.state[capital.cell] = i;
    }

    console.timeEnd('createStates');
    return states;
  }

  /**
   * 放置其他城镇
   */
  private placeTowns(pack: Pack, burgs: Burg[], states: State[]): void {
    console.time('placeTowns');
    
    const { cells } = pack;
    const targetTownsPerState = this.config.townDensity;

    for (let stateId = 1; stateId < states.length; stateId++) {
      const state = states[stateId];
      const stateCells = cells.i.filter(i => cells.state![i] === stateId);
      
      if (stateCells.length === 0) continue;

      // 计算该国家需要的城镇数量
      const townsNeeded = Math.floor(stateCells.length / 50) + 1;
      const actualTownsNeeded = Math.min(townsNeeded, targetTownsPerState);

      // 选择城镇位置
      const townCandidates = stateCells
        .filter(cellId => !cells.burg?.[cellId] && cells.s![cellId] > 0)
        .sort((a, b) => (cells.s![b] || 0) - (cells.s![a] || 0));

      for (let t = 0; t < actualTownsNeeded && t < townCandidates.length; t++) {
        const cell = townCandidates[t];
        const [x, y] = cells.p[cell];
        
        const burgId = burgs.length;
        const burg: Burg = {
          i: burgId,
          name: this.generateBurgName(),
          cell: cell,
          x: x,
          y: y,
          state: stateId,
          population: this.calculateTownPopulation(cells.s![cell]),
          type: this.determineBurgType(cells.s![cell]),
          capital: 0,
          feature: cells.f ? cells.f[cell] : 0,
          port: this.isPort(cell, cells) ? 1 : 0
        };

        burgs.push(burg);
        if (cells.burg) {
          cells.burg[cell] = burgId;
        }
      }
    }

    console.timeEnd('placeTowns');
  }

  /**
   * 扩张国家边界
   */
  private expandStates(pack: Pack, states: State[]): void {
    console.time('expandStates');
    
    const { cells } = pack;
    
    for (let iteration = 0; iteration < this.config.expansionIterations; iteration++) {
      const queue: Array<{cellId: number, stateId: number, priority: number}> = [];

      // 收集扩张候选
      for (let cellId = 0; cellId < cells.i.length; cellId++) {
        if (cells.state![cellId] > 0) continue; // 已分配给国家
        if (!cells.s || cells.s[cellId] === 0) continue; // 无人口
        if (!cells.culture || cells.culture[cellId] === 0) continue; // 无文化

        // 检查邻居国家
        const neighborStates = new Map<number, number>();
        for (const neighborId of cells.c[cellId]) {
          const neighborState = cells.state![neighborId];
          if (neighborState > 0) {
            const count = neighborStates.get(neighborState) || 0;
            neighborStates.set(neighborState, count + 1);
          }
        }

        // 选择影响最大的国家
        for (const [stateId, count] of neighborStates) {
          const state = states[stateId];
          const culturalAffinity = (cells.culture[cellId] === state.culture) ? 2 : 1;
          const priority = count * culturalAffinity * (cells.s[cellId] || 0);
          
          queue.push({ cellId, stateId, priority });
        }
      }

      // 按优先级排序
      queue.sort((a, b) => b.priority - a.priority);

      // 应用扩张
      let expansions = 0;
      for (const expansion of queue) {
        if (cells.state![expansion.cellId] === 0) {
          cells.state![expansion.cellId] = expansion.stateId;
          expansions++;
        }
      }

      if (expansions === 0) break; // 没有新扩张，停止
    }

    console.timeEnd('expandStates');
  }

  /**
   * 规范化国家边界
   */
  private normalizeStates(pack: Pack, states: State[]): void {
    const { cells } = pack;

    // 计算每个国家的统计数据
    for (const state of states) {
      if (state.i === 0) continue;

      const stateCells = cells.i.filter(i => cells.state![i] === state.i);
      state.area = stateCells.length;

      // 重新计算中心点
      if (stateCells.length > 0) {
        const centerX = stateCells.reduce((sum, cellId) => sum + cells.p[cellId][0], 0) / stateCells.length;
        const centerY = stateCells.reduce((sum, cellId) => sum + cells.p[cellId][1], 0) / stateCells.length;
        
        // 找到最接近中心的单元格
        let closestCell = stateCells[0];
        let minDistance = Infinity;
        
        for (const cellId of stateCells) {
          const [x, y] = cells.p[cellId];
          const distance = Math.hypot(x - centerX, y - centerY);
          if (distance < minDistance) {
            minDistance = distance;
            closestCell = cellId;
          }
        }
        
        state.center = closestCell;
      }
    }
  }

  /**
   * 指定城镇类型
   */
  private specifyBurgs(burgs: Burg[], states: State[]): void {
    for (const burg of burgs) {
      if (burg.i === 0) continue;

      // 根据人口和地位确定类型
      if (burg.capital === 1) {
        burg.type = 'city';
      } else if (burg.population > 5000) {
        burg.type = 'city';
      } else if (burg.population > 1000) {
        burg.type = 'town';
      } else {
        burg.type = 'village';
      }
    }
  }

  /**
   * 收集统计数据
   */
  private collectStatistics(pack: Pack, states: State[], burgs: Burg[]): void {
    const { cells } = pack;

    // 重置统计数据
    for (const state of states) {
      state.rural = 0;
      state.urban = 0;
    }

    // 计算农村人口
    for (let i = 0; i < cells.i.length; i++) {
      const stateId = cells.state![i];
      if (stateId > 0 && stateId < states.length) {
        const population = cells.pop ? cells.pop[i] : (cells.s ? cells.s[i] * 1000 : 0);
        states[stateId].rural = (states[stateId].rural || 0) + population;
      }
    }

    // 计算城市人口
    for (const burg of burgs) {
      if (burg.i === 0) continue;
      
      const stateId = burg.state;
      if (stateId > 0 && stateId < states.length) {
        states[stateId].urban = (states[stateId].urban || 0) + burg.population;
      }
    }
  }

  /**
   * 分配颜色
   */
  private assignColors(states: State[]): void {
    const colors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
      '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9',
      '#f8c471', '#82e0aa', '#aed6f1', '#f7b6d3', '#d5a6bd'
    ];

    for (let i = 1; i < states.length; i++) {
      states[i].color = colors[i % colors.length];
    }
  }

  /**
   * 生成城镇名称
   */
  private generateBurgName(): string {
    const prefixes = ['North', 'South', 'East', 'West', 'New', 'Old', 'Great', 'Little'];
    const bases = ['ford', 'burg', 'stead', 'ton', 'ham', 'wick', 'thorpe', 'by'];
    const roots = ['Green', 'White', 'Red', 'Stone', 'Wood', 'Hill', 'River', 'Lake'];

    const usePrefix = this.rng.random() < 0.3;
    const root = roots[this.rng.range(0, roots.length - 1)];
    const base = bases[this.rng.range(0, bases.length - 1)];

    if (usePrefix) {
      const prefix = prefixes[this.rng.range(0, prefixes.length - 1)];
      return `${prefix} ${root}${base}`;
    }

    return `${root}${base}`;
  }

  /**
   * 生成国家名称
   */
  private generateStateName(): string {
    const adjectives = ['United', 'Great', 'Free', 'Royal', 'Imperial', 'Sacred', 'Noble'];
    const nouns = ['Kingdom', 'Republic', 'Empire', 'Principality', 'Duchy', 'Federation'];

    const adjective = adjectives[this.rng.range(0, adjectives.length - 1)];
    const noun = nouns[this.rng.range(0, nouns.length - 1)];

    return `${adjective} ${noun}`;
  }

  /**
   * 生成国家全名
   */
  private generateStateFullName(): string {
    return this.generateStateName(); // 简化版本
  }

  /**
   * 生成国家颜色
   */
  private generateStateColor(index: number): string {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
    return colors[index % colors.length];
  }

  /**
   * 生成国家政体
   */
  private generateStateForm(): string {
    const forms = ['Kingdom', 'Republic', 'Empire', 'Principality', 'Duchy'];
    return forms[this.rng.range(0, forms.length - 1)];
  }

  /**
   * 计算首都人口
   */
  private calculateCapitalPopulation(cellPopulation: number): number {
    return Math.floor(cellPopulation * 1000 * (2 + this.rng.random()));
  }

  /**
   * 计算城镇人口
   */
  private calculateTownPopulation(cellPopulation: number): number {
    return Math.floor(cellPopulation * 500 * (1 + this.rng.random()));
  }

  /**
   * 确定城镇类型
   */
  private determineBurgType(cellPopulation: number): string {
    if (cellPopulation > 50) return 'city';
    if (cellPopulation > 20) return 'town';
    return 'village';
  }

  /**
   * 检查是否为港口
   */
  private isPort(cellId: number, cells: Cells): boolean {
    // 检查是否有水域邻居
    return cells.c[cellId].some(neighborId => 
      cells.h[neighborId] < 20 // 水域
    );
  }

  /**
   * 创建简化的四叉树
   */
  private createSimpleQuadTree(): QuadTree {
    const points: Array<[number, number]> = [];

    return {
      add: (point: [number, number]) => {
        points.push(point);
      },
      find: (x: number, y: number, radius: number) => {
        return points.find(([px, py]) => 
          Math.hypot(x - px, y - py) < radius
        );
      }
    };
  }
}

/**
 * 便捷函数：生成城镇和国家
 */
export function generateBurgsAndStates(
  pack: Pack,
  rng: DeterministicRNG,
  config: BurgsAndStatesConfig
): { states: State[], burgs: Burg[] } {
  const generator = new BurgsAndStatesGenerator(rng, config);
  return generator.generate(pack);
}
