/**
 * @file Type definitions for the application.
 * @description This file contains the core type definitions for the application.
 */

import { z } from 'zod';

// #region Item / Character Schemas
export const ItemSchema = z.object({
  名称: z.string(),
  品阶: z.string().optional(),
  描述: z.string().optional(),
  数量: z.number().optional(),
}).passthrough();
export type Item = z.infer<typeof ItemSchema>;

export const CharacterSchema = z.object({
  姓名: z.string(),
  等级: z.number().optional(),
  职业: z.string().optional(),
  种族: z.string().optional(),
  年龄: z.number().optional(),
  特质: z.array(z.string()).optional(),
  天赋: z.union([
    z.object({
      根骨: z.number(),
      悟性: z.number(),
      气运: z.number(),
    }),
    z.array(z.string()),
  ]).optional(),
  状态: z.record(z.string(), z.object({
    value: z.number(),
    max: z.number(),
  })).optional(),
  籍贯: z.string().optional(),
  外貌特征: z.string().optional(),
  身份背景: z.object({
    前世: z.string(),
    现世: z.string(),
  }).optional(),
  性格特点: z.object({
    核心: z.string(),
    习惯: z.string(),
  }).optional(),
  物品: z.array(ItemSchema).optional(),
}).passthrough();

export const CharactersContainerSchema = z.object({
  主控角色名: z.string().optional(),
}).catchall(CharacterSchema);

export type ICharacter = z.infer<typeof CharacterSchema>;
export type ICharacters = z.infer<typeof CharactersContainerSchema>;
// #endregion


export interface IWeatherInfluence {
  类型: string;      // 例如 '祈雨', '干旱'
  强度: number;      // 0.0 to 1.0
  剩余时长: number;  // 单位：时辰
  来源: string;      // 例如 '角色法术:甘霖术'
  描述?: string;      // 给玩家的反馈
}

export interface IRegion {
  region_id: string;
  name: string;
  description: string;
  status: 'visited' | 'unvisited';
  tags: string[];
  properties: {
    has_npc?: boolean;
    weather_influence?: string;
    reward_potential: number;
    [key: string]: any;
  };
  risk_level: number;
}

export interface IConnection {
  from_region: string;
  to_region: string;
  description: string;
  direction: string;
  is_visible: boolean;
  conditions: string[];
  travel_time: number;
  risk_level: number;
}

export interface IMap {
  regions: Record<string, IRegion>;
  connections: IConnection[];
  currentPlayerLocation: string;
}

export interface IWorld {
  天气: IWeatherState;
  当前日期: {
    年: number;
    月: number;
    日: number;
  };
  当前时辰: number; // 0-11, 对应 SHICHEN_MAP
  时间: string; // LLM生成的原始时间字符串
  // 其他世界属性
  [key: string]: any;
  庇护所: IShelter;
  地图?: IMap;
}

export interface ShelterComponent {
  id?: string;
  规模: string;
  状态: string;
  耐久度?: string;
  材料?: string;
  防御加成?: string;
  防雨加成?: string;
  作物?: string | null;
  药材?: string | null;
  产出效率?: string;
  灵力消耗?: string;
}

export interface IShelter {
  名称: string;
  规模: string;
  状态: string;
  舒适度: string;
  防御力: string;
  功能: string[];
  组件: {
    围墙: ShelterComponent;
    屋顶: ShelterComponent;
    农田: ShelterComponent;
    药园: ShelterComponent;
    防御阵法: ShelterComponent;
    [key: string]: ShelterComponent;
  };
  事件日志: {
    天数: number;
    类型: string;
    摘要: string;
  }[];
}

export interface IBarterItem {
    名称: string;
    数量?: number;
    描述?: string;
    价值?: { 基础价值: number } | number;
    库存?: number;
}


export type Rumor = {
  id: string;
  content: string;
  source_location?: string;
  related_entities: string[];
  type: 'flavor' | 'lore' | 'hook' | 'worldview';
  created_date: string;
  expiry_date?: string | '';
  status: 'active' | 'inactive' | 'resolved';
};


// #region Zod Schemas
export const TimeStateSchema = z.object({
  day: z.number().default(1),
  timeOfDay: z.string().default('子时'),
  season: z.enum(['春', '夏', '秋', '冬']).default('春'),
  solarTerm: z.string().default('立春'),
  weather: z.string().default('晴朗'),
}).passthrough();
export type ITimeState = z.infer<typeof TimeStateSchema>;

const WeatherInfluenceSchema = z.object({
  类型: z.string(),
  来源: z.string(),
  强度: z.number(),
  剩余时长: z.number(),
  描述: z.string().optional(),
});

export const WeatherSchema = z.object({
  当前天气: z.string(),
  天气描述: z.string(),
  季节: z.string(),
  节气: z.string(),
  特殊天象: z.string().optional().nullable(),
  效果: z.array(z.string()),
  天气影响: z.array(WeatherInfluenceSchema).optional().nullable(),
}).passthrough();
export type IWeatherState = z.infer<typeof WeatherSchema>;

export const ShelterComponentSchema = z.object({
  规模: z.string().optional(),
  材料: z.string().optional(),
  耐久度: z.string().optional(),
  防御加成: z.string().optional(),
  防雨加成: z.string().optional(),
  状态: z.string().optional(),
  作物: z.any().nullable().optional(),
  产出效率: z.string().optional(),
}).passthrough();

export const ShelterSchema = z.object({
  名称: z.string(),
  规模: z.string(),
  状态: z.string(),
  舒适度: z.string(),
  防御力: z.string(),
  功能: z.array(z.string()),
  组件: z.object({
    围墙: ShelterComponentSchema,
    屋顶: ShelterComponentSchema,
    农田: ShelterComponentSchema,
    药园: ShelterComponentSchema,
    防御阵法: ShelterComponentSchema,
  }).passthrough(),
  事件日志: z.array(z.any()),
}).passthrough();

export const AdventureStateSchema = z.object({
  冷却至天数: z.number().default(0),
  上次奇遇天数: z.number().default(0),
  历史奇遇记录: z.array(z.any()).default([]),
}).passthrough();
export type IAdventureState = z.infer<typeof AdventureStateSchema>;
// #endregion
