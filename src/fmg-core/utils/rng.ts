/**
 * 确定性随机数生成器
 * 
 * 基于 alea 算法的可种子化随机数生成器，确保相同种子产生相同的随机序列。
 * 这对于地图生成的可重现性至关重要。
 */

import alea from 'alea';

/**
 * 确定性随机数生成器类
 * 
 * 提供了多种随机数生成方法，所有方法都基于同一个种子，
 * 确保在相同种子下生成的随机序列完全一致。
 */
export class DeterministicRNG {
  private rng: () => number;
  private _seed: string;

  /**
   * 构造函数
   * @param seed 随机种子字符串
   */
  constructor(seed: string) {
    this._seed = seed;
    this.rng = alea(seed);
  }

  /**
   * 获取当前种子
   */
  get seed(): string {
    return this._seed;
  }

  /**
   * 生成 [0, 1) 范围内的随机浮点数
   * @returns 0到1之间的随机数（不包括1）
   */
  next(): number {
    return this.rng();
  }

  /**
   * 生成指定范围内的随机整数
   * @param min 最小值（包含）
   * @param max 最大值（包含）
   * @returns 指定范围内的随机整数
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * 生成指定范围内的随机整数 [min, max] - 别名方法
   */
  range(min: number, max: number): number {
    return this.nextInt(min, max);
  }

  /**
   * 生成0到1之间的随机浮点数
   */
  random(): number {
    return this.next();
  }

  /**
   * 生成指定范围内的随机浮点数
   * @param min 最小值（包含）
   * @param max 最大值（不包含）
   * @returns 指定范围内的随机浮点数
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * 根据概率返回布尔值
   * @param probability 概率值，0-1之间
   * @returns 随机布尔值
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * 从数组中随机选择一个元素
   * @param array 输入数组
   * @returns 随机选择的元素
   */
  choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    const index = this.nextInt(0, array.length - 1);
    return array[index];
  }

  /**
   * 从数组中随机选择多个不重复的元素
   * @param array 输入数组
   * @param count 选择数量
   * @returns 随机选择的元素数组
   */
  sample<T>(array: T[], count: number): T[] {
    if (count > array.length) {
      throw new Error('Sample count cannot exceed array length');
    }
    
    const result: T[] = [];
    const indices = new Set<number>();
    
    while (result.length < count) {
      const index = this.nextInt(0, array.length - 1);
      if (!indices.has(index)) {
        indices.add(index);
        result.push(array[index]);
      }
    }
    
    return result;
  }

  /**
   * 打乱数组顺序（Fisher-Yates洗牌算法）
   * @param array 输入数组
   * @returns 打乱顺序的新数组
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }

  /**
   * 生成正态分布随机数（Box-Muller变换）
   * @param mean 均值，默认为0
   * @param stdDev 标准差，默认为1
   * @returns 正态分布的随机数
   */
  normal(mean: number = 0, stdDev: number = 1): number {
    // 使用Box-Muller变换生成正态分布
    const u1 = this.next();
    const u2 = this.next();
    
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * 根据权重数组进行加权随机选择
   * @param weights 权重数组
   * @returns 选中的索引
   */
  weightedChoice(weights: number[]): number {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new Error('Total weight must be positive');
    }
    
    let random = this.next() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return i;
      }
    }
    
    // 如果由于浮点精度问题没有选中，返回最后一个
    return weights.length - 1;
  }

  /**
   * 生成随机的噪声值（用于地形生成）
   * @param x X坐标
   * @param y Y坐标
   * @param scale 缩放因子
   * @returns 噪声值
   */
  noise2D(x: number, y: number, scale: number = 1): number {
    // 简单的伪随机噪声生成
    const px = Math.floor(x * scale);
    const py = Math.floor(y * scale);
    
    // 创建基于坐标的临时种子
    const tempSeed = `${this._seed}_${px}_${py}`;
    const tempRng = alea(tempSeed);
    
    return tempRng();
  }

  /**
   * 重置随机数生成器到初始状态
   */
  reset(): void {
    this.rng = alea(this._seed);
  }

  /**
   * 使用新种子重新初始化随机数生成器
   * @param newSeed 新的种子字符串
   */
  reseed(newSeed: string): void {
    this._seed = newSeed;
    this.rng = alea(newSeed);
  }
}

/**
 * 全局随机数生成器实例
 * 可以在整个应用中共享使用
 */
let globalRNG: DeterministicRNG | null = null;

/**
 * 初始化全局随机数生成器
 * @param seed 随机种子
 */
export function initGlobalRNG(seed: string): void {
  globalRNG = new DeterministicRNG(seed);
}

/**
 * 获取全局随机数生成器实例
 * @returns 全局RNG实例
 * @throws 如果未初始化则抛出错误
 */
export function getGlobalRNG(): DeterministicRNG {
  if (!globalRNG) {
    throw new Error('Global RNG not initialized. Call initGlobalRNG() first.');
  }
  return globalRNG;
}

/**
 * 便捷函数：生成随机数
 * @returns 0-1之间的随机数
 */
export function random(): number {
  return getGlobalRNG().next();
}

/**
 * 便捷函数：生成随机整数
 * @param min 最小值
 * @param max 最大值
 * @returns 随机整数
 */
export function randomInt(min: number, max: number): number {
  return getGlobalRNG().nextInt(min, max);
}

/**
 * 便捷函数：根据概率返回布尔值
 * @param probability 概率值
 * @returns 随机布尔值
 */
export function chance(probability: number): boolean {
  return getGlobalRNG().chance(probability);
}
