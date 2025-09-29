/**
 * 地图生成引擎
 * 
 * 这是FMG核心库的主要入口点，整合了所有生成器来创建完整的地图。
 * 提供了分阶段的地图生成功能，支持渐进式生成和中间结果检查。
 */

import { Grid, Pack, MapConfig, GenerationStep, PerformanceStats } from '../types/core';
import { DeterministicRNG } from '../utils/rng';
import { generateGrid } from '../generators/voronoi';
import { HeightmapGenerator, HeightmapConfig } from '../generators/heightmap';
import { FeaturesGenerator, markupGridFeatures, markupPackFeatures } from '../generators/features';
import { RiversGenerator, RiverConfig } from '../generators/rivers';
import { LakesGenerator } from '../generators/lakes';
import { CulturesGenerator, CultureConfig } from '../generators/cultures';
import { BurgsAndStatesGenerator, BurgsAndStatesConfig } from '../generators/burgs-and-states';

/**
 * 地图生成引擎类
 */
export class MapEngine {
  private rng: DeterministicRNG;
  private config: MapConfig;
  private grid: Grid | null = null;
  private pack: Pack | null = null;
  private performanceStats: PerformanceStats[] = [];

  constructor(config: MapConfig) {
    this.config = config;
    this.rng = new DeterministicRNG(config.seed);
  }

  /**
   * 生成完整的地图
   */
  async generateMap(): Promise<{ grid: Grid; pack: Pack; stats: PerformanceStats[] }> {
    console.time('generateMap');
    this.performanceStats = [];

    // 阶段1: 生成网格
    await this.generateStage(GenerationStep.GRID, () => {
      this.grid = generateGrid(
        this.config.cellsNumber,
        this.config.mapWidth,
        this.config.mapHeight,
        this.rng
      );
    });

    // 阶段2: 生成高度图
    await this.generateStage(GenerationStep.HEIGHTMAP, () => {
      const heightmapConfig: HeightmapConfig = {
        templateId: this.config.heightmapTemplate
      };
      const generator = new HeightmapGenerator(this.rng);
      const heights = generator.fromTemplate(this.grid!, heightmapConfig);
      this.grid!.cells.h = heights;
    });

    // 阶段2: 标记特征
    await this.generateStage(GenerationStep.FEATURES, () => {
      markupGridFeatures(this.grid!, this.rng);
      
      // 创建Pack数据结构
      this.pack = this.createPackFromGrid(this.grid!);
      markupPackFeatures(this.pack, this.grid!, this.rng);
    });

    // 阶段3: 生成河流
    await this.generateStage(GenerationStep.RIVERS, () => {
      const riverConfig: RiverConfig = {
        allowErosion: true,
        minFluxToFormRiver: 30,
        cellsModifier: (this.config.cellsNumber / 10000) ** 0.25,
        maxIterations: 1000
      };
      const generator = new RiversGenerator(this.rng, riverConfig);
      const riverData = generator.generate(this.pack!, this.grid!);
      
      // 将河流数据转换为Pack格式
      this.pack!.rivers = this.convertRiverData(riverData);
    });

    // 阶段4: 生成文化
    await this.generateStage(GenerationStep.CULTURES, () => {
      const cultureConfig: CultureConfig = {
        culturesCount: this.config.culturesCount,
        cultureSet: 'generic',
        minPopulationDensity: 1,
        expansionIterations: 10,
        expansionismRange: [0, 3]
      };
      const generator = new CulturesGenerator(this.rng, cultureConfig);
      this.pack!.cultures = generator.generate(this.pack!);
    });

    // 阶段4: 生成国家和城镇
    await this.generateStage(GenerationStep.STATES, () => {
      const statesConfig: BurgsAndStatesConfig = {
        statesCount: this.config.statesCount,
        townDensity: 3,
        minStateDistance: 50,
        expansionIterations: 15,
        cityScaleRange: [1, 5]
      };
      const generator = new BurgsAndStatesGenerator(this.rng, statesConfig);
      const { states, burgs } = generator.generate(this.pack!);
      this.pack!.states = states;
      this.pack!.burgs = burgs;
    });

    console.timeEnd('generateMap');
    return {
      grid: this.grid!,
      pack: this.pack!,
      stats: this.performanceStats
    };
  }

  /**
   * 生成指定阶段
   */
  private async generateStage(step: GenerationStep, generator: () => void): Promise<void> {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    generator();

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();

    const stats: PerformanceStats = {
      step,
      duration: endTime - startTime,
      memoryUsed: endMemory - startMemory,
      cellsProcessed: this.grid?.cells.i.length || 0
    };

    this.performanceStats.push(stats);
    console.log(`${step} completed in ${stats.duration.toFixed(2)}ms`);
  }

  /**
   * 从网格创建Pack数据结构
   */
  private createPackFromGrid(grid: Grid): Pack {
    const { cells } = grid;
    const cellsCount = cells.i.length;

    // 简化版Pack创建 - 直接复制网格数据
    const pack: Pack = {
      cells: {
        i: new Array(cellsCount).fill(0).map((_, i) => i),
        p: [...cells.p],
        v: [...cells.v],
        c: [...cells.c],
        b: new Uint8Array(cells.b),
        h: new Uint8Array(cells.h),
        t: new Int8Array(cellsCount), // 地形类型，将在特征标记时填充
        f: new Uint16Array(cellsCount), // 特征ID，将在特征标记时填充
        g: new Array(cellsCount).fill(0).map((_, i) => i), // 映射到网格单元格
        s: this.generatePopulation(cellsCount), // 生成基础人口
        haven: new Uint8Array(cellsCount) // 湖泊标记
      },
      cultures: [],
      religions: [],
      states: [],
      burgs: [],
      rivers: [],
      markers: [],
      features: [] // 初始化特征数组
    };

    return pack;
  }

  /**
   * 生成基础人口分布
   */
  private generatePopulation(cellsCount: number): Uint8Array {
    const population = new Uint8Array(cellsCount);
    
    for (let i = 0; i < cellsCount; i++) {
      // 基于地形特征生成人口
      const height = this.grid!.cells.h[i];
      if (height >= 20 && height <= 60) {
        // 适宜居住的海拔范围
        population[i] = Math.floor(this.rng.random() * 50);
      } else if (height > 60) {
        // 高海拔地区人口较少
        population[i] = Math.floor(this.rng.random() * 10);
      }
      // 水域人口为0（默认值）
    }

    return population;
  }

  /**
   * 转换河流数据为Pack格式
   */
  private convertRiverData(riverData: any): any[] {
    const rivers: any[] = [];
    
    for (const [riverId, riverPath] of Object.entries(riverData.riversData)) {
      const path = riverPath as number[];
      rivers.push({
        i: parseInt(riverId),
        source: path[0],
        cells: path,
        type: 'river'
      });
    }

    return rivers;
  }

  /**
   * 获取内存使用情况（简化版）
   */
  private getMemoryUsage(): number {
    // 在React Native环境中，这可能需要原生实现
    // 这里返回估算值
    return (performance as any).memory?.usedJSHeapSize || 0;
  }

  /**
   * 重置引擎状态
   */
  reset(): void {
    this.grid = null;
    this.pack = null;
    this.performanceStats = [];
    this.rng = new DeterministicRNG(this.config.seed);
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<MapConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.seed) {
      this.rng = new DeterministicRNG(newConfig.seed);
    }
  }

  /**
   * 获取当前生成进度
   */
  getProgress(): number {
    const totalSteps = Object.keys(GenerationStep).length;
    return (this.performanceStats.length / totalSteps) * 100;
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): PerformanceStats[] {
    return [...this.performanceStats];
  }

  /**
   * 获取生成结果
   */
  getResults(): { grid: Grid | null; pack: Pack | null } {
    return {
      grid: this.grid,
      pack: this.pack
    };
  }
}

/**
 * 便捷函数：快速生成地图
 */
export async function quickGenerateMap(config: MapConfig): Promise<{ grid: Grid; pack: Pack; stats: PerformanceStats[] }> {
  const engine = new MapEngine(config);
  return await engine.generateMap();
}

/**
 * 便捷函数：创建默认配置
 */
export function createDefaultConfig(seed: string = 'default', preset?: any): MapConfig {
  const baseConfig: MapConfig = {
    seed,
    cellsNumber: 10000,
    mapWidth: 1000,
    mapHeight: 1000,
    heightmapTemplate: 'Continents',
    culturesCount: 5,
    statesCount: 3,
    religionsCount: 3
  };

  if (preset) {
    return {
      ...baseConfig,
      ...preset,
      seed // 确保种子不被覆盖
    };
  }

  return baseConfig;
}
