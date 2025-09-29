// src/data/time-data.ts

/**
 * @file 定义与时间、季节、节气相关的静态数据。
 * 本文件旨在为天气和时间系统提供权威、不可变的数据源。
 */

/**
 * 二十四节气定义接口
 */
export interface SolarTerm {
  /** 节气名称，如 '立春' */
  name: string;
  /** 所属季节，'春' | '夏' | '秋' | '冬' */
  season: '春' | '夏' | '秋' | '冬';
  /** 在一年中的起始日（从1开始） */
  startDay: number;
}

/**
 * 全年二十四节气列表
 * 假设一年为360天，每个节气持续15天。
 */
export const SOLARTERMS: SolarTerm[] = [
  // 春季 (Spring)
  { name: '立春', season: '春', startDay: 1 },    // ~Feb 4
  { name: '雨水', season: '春', startDay: 16 },   // ~Feb 19
  { name: '惊蛰', season: '春', startDay: 31 },   // ~Mar 5
  { name: '春分', season: '春', startDay: 46 },   // ~Mar 20
  { name: '清明', season: '春', startDay: 61 },   // ~Apr 4
  { name: '谷雨', season: '春', startDay: 76 },   // ~Apr 19

  // 夏季 (Summer)
  { name: '立夏', season: '夏', startDay: 91 },   // ~May 5
  { name: '小满', season: '夏', startDay: 106 },  // ~May 20
  { name: '芒种', season: '夏', startDay: 121 },  // ~Jun 5
  { name: '夏至', season: '夏', startDay: 136 },  // ~Jun 21
  { name: '小暑', season: '夏', startDay: 151 },  // ~Jul 6
  { name: '大暑', season: '夏', startDay: 166 },  // ~Jul 22

  // 秋季 (Autumn)
  { name: '立秋', season: '秋', startDay: 181 },  // ~Aug 7
  { name: '处暑', season: '秋', startDay: 196 },  // ~Aug 22
  { name: '白露', season: '秋', startDay: 211 },  // ~Sep 7
  { name: '秋分', season: '秋', startDay: 226 },  // ~Sep 22
  { name: '寒露', season: '秋', startDay: 241 },  // ~Oct 8
  { name: '霜降', season: '秋', startDay: 256 },  // ~Oct 23

  // 冬季 (Winter)
  { name: '立冬', season: '冬', startDay: 271 },  // ~Nov 7
  { name: '小雪', season: '冬', startDay: 286 },  // ~Nov 22
  { name: '大雪', season: '冬', startDay: 301 },  // ~Dec 6
  { name: '冬至', season: '冬', startDay: 316 },  // ~Dec 21
  { name: '小寒', season: '冬', startDay: 331 },  // ~Jan 5
  { name: '大寒', season: '冬', startDay: 346 },  // ~Jan 20
];
