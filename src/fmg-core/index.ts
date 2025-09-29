/**
 * Fantasy Map Generator 核心库
 * 
 * 这是 FMG 核心算法库的主要入口点，提供了地图生成的所有核心功能。
 * 
 * 主要模块：
 * - 类型定义：完整的 TypeScript 类型系统
 * - RNG：确定性随机数生成器  
 * - Voronoi：网格生成器
 * - MapEngine：地图生成引擎（后续实现）
 */

// 导出核心类型
export * from './types/core';

// 导出工具类
export * from './utils/rng';

// 导出生成器
export * from './generators/voronoi';
export * from './generators/heightmap';
export * from './generators/features';
export * from './generators/rivers';
export * from './generators/lakes';
export * from './generators/cultures';
export * from './generators/burgs-and-states';

// 导出主要的地图引擎类
export * from './engine/map-engine';

/**
 * 库版本信息
 */
export const VERSION = '0.1.0';

/**
 * 库信息
 */
export const LIB_INFO = {
  name: '@app/fmg-core',
  version: VERSION,
  description: 'Fantasy Map Generator 核心算法库 - React Native 原生移植版本',
  author: 'CradleAI Team'
};

/**
 * 快速开始函数
 * 使用默认参数生成一个简单的地图网格
 * 
 * @param seed 随机种子
 * @param cellsCount 单元格数量，默认 10000
 * @param width 地图宽度，默认 1000
 * @param height 地图高度，默认 1000
 * @returns 生成的网格对象
 */
export function quickStart(
  seed: string = 'default',
  cellsCount: number = 10000,
  width: number = 1000,
  height: number = 1000
) {
  // 导入依赖
  const { DeterministicRNG } = require('./utils/rng');
  const { generateGrid } = require('./generators/voronoi');
  
  // 创建随机数生成器
  const rng = new DeterministicRNG(seed);
  
  // 生成网格
  return generateGrid(cellsCount, width, height, rng);
}
