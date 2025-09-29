/**
 * 高度图生成器
 * 
 * 本模块负责生成地图的高度数据，支持：
 * - 基于模板的算法生成（移植自 heightmap-generator.js）
 * - 多种地形工具：山丘、山脉、峡谷、海峡等
 * - 确定性生成，支持种子控制
 * 
 * 设计原则：
 * - 去除所有 DOM 依赖
 * - 参数化所有配置输入
 * - 保持与原算法的一致性
 */

import { Grid, Cells } from '../types/core';
import { DeterministicRNG } from '../utils/rng';

/**
 * 高度图配置参数
 */
export interface HeightmapConfig {
  /** 高度图模板ID */
  templateId: string;
  /** 斑点功率参数 */
  blobPower?: number;
  /** 线条功率参数 */
  linePower?: number;
  /** 最大高度值 */
  maxHeight?: number;
}

/**
 * 高度图模板步骤
 */
interface HeightmapStep {
  tool: string;
  params: (string | number)[];
}

/**
 * 高度图生成器类
 */
export class HeightmapGenerator {
  private grid: Grid | null = null;
  private heights: Uint8Array | null = null;
  private blobPower: number = 0.98;
  private linePower: number = 0.35;
  private maxHeight: number = 100;
  private rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /**
   * 设置网格数据
   */
  setGrid(grid: Grid): void {
    this.grid = grid;
    const cellsCount = grid.cells.i.length;
    
    // 初始化高度数组
    this.heights = grid.cells.h 
      ? new Uint8Array(grid.cells.h) 
      : new Uint8Array(cellsCount);
    
    // 计算功率参数
    this.blobPower = this.getBlobPower(grid.cellsDesired);
    this.linePower = this.getLinePower(grid.cellsDesired);
  }

  /**
   * 从模板生成高度图
   */
  fromTemplate(grid: Grid, config: HeightmapConfig): Uint8Array {
    if (!this.heightmapTemplates[config.templateId]) {
      throw new Error(`Unknown heightmap template: ${config.templateId}`);
    }

    const template = this.heightmapTemplates[config.templateId];
    const steps = this.parseTemplate(template);

    if (steps.length === 0) {
      throw new Error(`Heightmap template has no steps: ${config.templateId}`);
    }

    this.setGrid(grid);
    
    // 应用配置参数
    if (config.blobPower !== undefined) this.blobPower = config.blobPower;
    if (config.linePower !== undefined) this.linePower = config.linePower;
    if (config.maxHeight !== undefined) this.maxHeight = config.maxHeight;

    // 执行模板步骤
    for (const step of steps) {
      this.executeStep(step);
    }

    return this.heights!;
  }

  /**
   * 解析模板字符串
   */
  private parseTemplate(template: string): HeightmapStep[] {
    const lines = template.split('\n').filter(line => line.trim());
    const steps: HeightmapStep[] = [];

    for (const line of lines) {
      const elements = line.trim().split(/\s+/);
      if (elements.length < 2) continue;

      const [tool, ...params] = elements;
      steps.push({
        tool,
        params: params.map(p => isNaN(Number(p)) ? p : Number(p))
      });
    }

    return steps;
  }

  /**
   * 执行模板步骤
   */
  private executeStep(step: HeightmapStep): void {
    const { tool, params } = step;

    switch (tool) {
      case 'Hill':
        this.addHill(params[0] as number, params[1] as number, params[2] as number, params[3] as number);
        break;
      case 'Pit':
        this.addPit(params[0] as number, params[1] as number, params[2] as number, params[3] as number);
        break;
      case 'Range':
        this.addRange(params[0] as number, params[1] as number, params[2] as number, params[3] as number);
        break;
      case 'Trough':
        this.addTrough(params[0] as number, params[1] as number, params[2] as number, params[3] as number);
        break;
      case 'Strait':
        this.addStrait(params[0] as number, params[1] as number);
        break;
      case 'Mask':
        this.mask(params[0] as number);
        break;
      case 'Invert':
        this.invert(params[0] as number, params[1] as number);
        break;
      case 'Add':
        this.modify(params[2] as number, params[0] as number, 1);
        break;
      case 'Multiply':
        this.modify(params[2] as number, 0, params[0] as number);
        break;
      case 'Smooth':
        this.smooth(params[0] as number);
        break;
      default:
        console.warn(`Unknown heightmap tool: ${tool}`);
    }
  }

  /**
   * 添加山丘（增强版：添加噪声和变化）
   */
  private addHill(x: number, y: number, height: number, radius: number): void {
    if (!this.grid || !this.heights) return;

    const { cells } = this.grid;
    // 从网格实际范围计算边界
    const boundary = this.calculateBoundary(cells.p);
    
    // 模板中的 x、y、radius 均为百分比，需要换算到实际像素
    const px = (x / 100) * boundary.width;
    const py = (y / 100) * boundary.height;
    const pr = (radius / 100) * Math.min(boundary.width, boundary.height);
    const heightDiff = height / 100 * this.maxHeight;

    for (let i = 0; i < cells.i.length; i++) {
      const [cellX, cellY] = cells.p[i];
      const distance = Math.hypot(cellX - px, cellY - py);
      
      if (distance <= pr) {
        // 基础因子
        const baseFactor = Math.pow(1 - distance / pr, this.blobPower);
        
        // 添加多层噪声以增加复杂性
        const noiseScale1 = 0.01; // 大尺度噪声
        const noiseScale2 = 0.05; // 中尺度噪声
        const noiseScale3 = 0.1;  // 小尺度噪声
        
        const noise1 = this.rng.noise2D(cellX, cellY, noiseScale1) * 0.4;
        const noise2 = this.rng.noise2D(cellX, cellY, noiseScale2) * 0.3;
        const noise3 = this.rng.noise2D(cellX, cellY, noiseScale3) * 0.2;
        
        const combinedNoise = (noise1 + noise2 + noise3) * 0.5 + 0.5; // 归一化到 [0,1]
        
        // 结合基础因子和噪声
        const finalFactor = baseFactor * (0.7 + 0.6 * combinedNoise); // 0.7-1.3 范围
        
        this.heights[i] = Math.min(this.maxHeight, this.heights[i] + heightDiff * finalFactor);
      }
    }
  }

  /**
   * 添加凹坑（增强版：添加噪声和变化）
   */
  private addPit(x: number, y: number, depth: number, radius: number): void {
    if (!this.grid || !this.heights) return;

    const { cells } = this.grid;
    const boundary = this.calculateBoundary(cells.p);
    const px = (x / 100) * boundary.width;
    const py = (y / 100) * boundary.height;
    const pr = (radius / 100) * Math.min(boundary.width, boundary.height);
    const depthDiff = depth / 100 * this.maxHeight;

    for (let i = 0; i < cells.i.length; i++) {
      const [cellX, cellY] = cells.p[i];
      const distance = Math.hypot(cellX - px, cellY - py);
      
      if (distance <= pr) {
        // 基础因子
        const baseFactor = Math.pow(1 - distance / pr, this.blobPower);
        
        // 添加噪声以增加复杂性
        const noise1 = this.rng.noise2D(cellX, cellY, 0.02) * 0.4;
        const noise2 = this.rng.noise2D(cellX, cellY, 0.08) * 0.3;
        const combinedNoise = (noise1 + noise2) * 0.5 + 0.5;
        
        const finalFactor = baseFactor * (0.8 + 0.4 * combinedNoise);
        
        this.heights[i] = Math.max(0, this.heights[i] - depthDiff * finalFactor);
      }
    }
  }

  /**
   * 添加山脉
   */
  private addRange(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.grid || !this.heights) return;

    const { cells } = this.grid;
    const boundary = this.calculateBoundary(cells.p);
    const sx = (x1 / 100) * boundary.width;
    const sy = (y1 / 100) * boundary.height;
    const ex = (x2 / 100) * boundary.width;
    const ey = (y2 / 100) * boundary.height;
    const lineLength = Math.hypot(ex - sx, ey - sy);
    
    for (let i = 0; i < cells.i.length; i++) {
      const [cellX, cellY] = cells.p[i];
      
      // 计算点到线段的距离
      const distance = this.pointToLineDistance(cellX, cellY, sx, sy, ex, ey);
      const maxDistance = lineLength * this.linePower;
      
      if (distance <= maxDistance) {
        const factor = Math.pow(1 - distance / maxDistance, 2);
        const heightIncrease = 30 * factor; // 基础高度增量
        this.heights[i] = Math.min(this.maxHeight, this.heights[i] + heightIncrease);
      }
    }
  }

  /**
   * 添加峡谷
   */
  private addTrough(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.grid || !this.heights) return;

    const { cells } = this.grid;
    const boundary = this.calculateBoundary(cells.p);
    const sx = (x1 / 100) * boundary.width;
    const sy = (y1 / 100) * boundary.height;
    const ex = (x2 / 100) * boundary.width;
    const ey = (y2 / 100) * boundary.height;
    const lineLength = Math.hypot(ex - sx, ey - sy);
    
    for (let i = 0; i < cells.i.length; i++) {
      const [cellX, cellY] = cells.p[i];
      
      const distance = this.pointToLineDistance(cellX, cellY, sx, sy, ex, ey);
      const maxDistance = lineLength * this.linePower;
      
      if (distance <= maxDistance) {
        const factor = Math.pow(1 - distance / maxDistance, 2);
        const heightDecrease = 20 * factor;
        this.heights[i] = Math.max(0, this.heights[i] - heightDecrease);
      }
    }
  }

  /**
   * 添加海峡
   */
  private addStrait(x: number, y: number): void {
    if (!this.grid || !this.heights) return;

    const { cells } = this.grid;
    const boundary = this.calculateBoundary(cells.p);
    const px = (x / 100) * boundary.width;
    const py = (y / 100) * boundary.height;
    const radius = Math.min(boundary.width, boundary.height) * 0.05; // 5% 的短半径

    for (let i = 0; i < cells.i.length; i++) {
      const [cellX, cellY] = cells.p[i];
      const distance = Math.hypot(cellX - px, cellY - py);
      
      if (distance <= radius) {
        const factor = 1 - distance / radius;
        this.heights[i] = Math.max(0, this.heights[i] * (1 - factor * 0.8));
      }
    }
  }

  /**
   * 应用高度掩码
   */
  private mask(threshold: number): void {
    if (!this.heights) return;

    for (let i = 0; i < this.heights.length; i++) {
      if (this.heights[i] < threshold) {
        this.heights[i] = 0;
      }
    }
  }

  /**
   * 反转高度
   */
  private invert(min: number, max: number): void {
    if (!this.heights) return;

    for (let i = 0; i < this.heights.length; i++) {
      if (this.heights[i] >= min && this.heights[i] <= max) {
        this.heights[i] = max - (this.heights[i] - min);
      }
    }
  }

  /**
   * 修改高度值
   */
  private modify(threshold: number, addValue: number, multiplyFactor: number): void {
    if (!this.heights) return;

    for (let i = 0; i < this.heights.length; i++) {
      if (this.heights[i] >= threshold) {
        this.heights[i] = Math.min(this.maxHeight, 
          Math.max(0, this.heights[i] * multiplyFactor + addValue));
      }
    }
  }

  /**
   * 平滑高度
   */
  private smooth(iterations: number): void {
    if (!this.grid || !this.heights) return;

    const { cells } = this.grid;
    
    for (let iter = 0; iter < iterations; iter++) {
      const newHeights: Uint8Array = new Uint8Array(this.heights.length);
      
      for (let i = 0; i < cells.i.length; i++) {
        const neighbors = cells.c[i];
        let sum = this.heights[i];
        let count = 1;
        
        for (const neighborId of neighbors) {
          if (neighborId < this.heights.length) {
            sum += this.heights[neighborId];
            count++;
          }
        }
        
        newHeights[i] = Math.round(sum / count);
      }
      
      this.heights = newHeights;
    }
  }

  /**
   * 计算点到线段的距离
   */
  private pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.hypot(A, B);

    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));

    const xx = x1 + param * C;
    const yy = y1 + param * D;

    return Math.hypot(px - xx, py - yy);
  }

  /**
   * 根据单元格数量计算斑点功率
   */
  private getBlobPower(cellsCount: number): number {
    const blobPowerMap: Record<number, number> = {
      1000: 0.93,
      2000: 0.95,
      5000: 0.97,
      10000: 0.98,
      20000: 0.99,
      30000: 0.991,
      40000: 0.993,
      50000: 0.994,
      60000: 0.995,
      70000: 0.996,
      80000: 0.997,
      90000: 0.998,
      100000: 0.999
    };

    // 找到最接近的值
    const keys = Object.keys(blobPowerMap).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
      if (cellsCount <= key) {
        return blobPowerMap[key];
      }
    }
    
    return 0.999; // 默认值
  }

  /**
   * 根据单元格数量计算线条功率
   */
  private getLinePower(cellsCount: number): number {
    const linePowerMap: Record<number, number> = {
      1000: 0.15,
      2000: 0.2,
      5000: 0.25,
      10000: 0.35,
      20000: 0.4,
      30000: 0.45,
      40000: 0.5,
      50000: 0.55,
      60000: 0.6,
      70000: 0.65,
      80000: 0.7,
      90000: 0.75,
      100000: 0.8
    };

    const keys = Object.keys(linePowerMap).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
      if (cellsCount <= key) {
        return linePowerMap[key];
      }
    }
    
    return 0.8; // 默认值
  }

  /**
   * 计算点集的边界框
   */
  private calculateBoundary(points: [number, number][]): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } {
    if (points.length === 0) {
      return { width: 1000, height: 1000, minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    }

    let minX = points[0][0];
    let maxX = points[0][0];
    let minY = points[0][1];
    let maxY = points[0][1];

    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    return {
      width: maxX - minX,
      height: maxY - minY,
      minX,
      minY,
      maxX,
      maxY
    };
  }

  /**
   * 高度图模板定义
   * 移植自原始 heightmapTemplates
   */
  private heightmapTemplates: Record<string, string> = {
    'Volcano': `Hill 50 50 100 35
Hill 50 50 20 15
Hill 50 50 35 5
Pit 50 50 100 5`,

    'High Island': `Hill 50 50 100 30
Hill 45 55 60 15
Hill 55 45 40 10`,

    'Low Island': `Hill 50 50 80 40
Hill 40 40 30 20
Hill 60 60 20 15`,

    'Continents': `Hill 25 25 60 35
Hill 75 75 50 30
Hill 15 70 40 25
Hill 85 30 45 20`,

    'Archipelago': `Hill 20 20 50 15
Hill 50 30 40 12
Hill 80 50 45 18
Hill 30 70 35 14
Hill 70 80 40 16`,

    'Atoll': `Hill 50 50 30 40
Pit 50 50 100 15`,

    'Mediterranean': `Hill 30 15 40 25
Hill 70 85 35 20
Hill 15 60 30 18
Hill 85 40 25 15`,

    'Peninsula': `Hill 20 50 70 40
Hill 40 30 50 25
Hill 35 70 40 20`,

    'Pangaea': `Hill 50 50 70 45`,

    'Shattered': `Hill 20 20 40 15
Hill 80 20 35 12
Hill 20 80 30 14
Hill 80 80 45 16
Hill 50 50 25 10`
  };
}

/**
 * 便捷函数：生成高度图
 */
export function generateHeightmap(grid: Grid, config: HeightmapConfig, rng: DeterministicRNG): Uint8Array {
  const generator = new HeightmapGenerator(rng);
  return generator.fromTemplate(grid, config);
}
