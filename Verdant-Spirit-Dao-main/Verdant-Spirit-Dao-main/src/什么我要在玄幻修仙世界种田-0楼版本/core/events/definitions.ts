/**
 * @file 中心化的应用事件契约定义
 *
 * 该文件是整个模块通信总线的核心，定义了所有系统内部事件的名称及其对应的载荷（payload）类型。
 * 它是代码中事件通信的唯一真实来源（Single Source of Truth）。
 *
 * 设计目标：
 * 1.  **类型安全**: 确保事件发送方和监听方对载荷结构有相同的、编译时强制执行的理解。
 * 2.  **可发现性**: 开发者可以通过查看此文件快速了解系统中所有可用的内部事件。
 * 3.  **易于重构**: 修改事件名称或载荷结构时，TypeScript 编译器能自动标出所有需要修改的地方。
 */

import type { IWorld, IWeatherInfluence } from '../../types'; // 修正了 types.ts 的相对路径

// =================================================================
// 载荷（Payload）接口定义
// =================================================================

/**
 * 时间变更事件 (`timeChanged`) 的载荷
 */
export interface TimeChangedPayload {
  fromDay: number;
  toDay: number;
  fromTimeOfDay: string;
  toTimeOfDay: string;
}

/**
 * 天气变更事件 (`weatherChanged`) 的载荷
 */
export interface WeatherChangedPayload {
  weatherData: IWorld['天气'];
}

/**
 * 季节变更事件 (`seasonChanged`) 的载荷
 */
export interface SeasonChangedPayload {
  seasonName: string;
}

/**
 * 节气变更事件 (`solarTermChanged`) 的载荷
 */
export interface SolarTermChangedPayload {
  solarTermName: string;
}

/**
 * 特殊天象开始事件 (`celestialEventStarted`) 的载荷
 */
export interface CelestialEventStartedPayload {
  eventName: string;
}

/**
 * 庇护所组件升级事件 (`shelterUpgraded`) 的载荷
 */
export interface ShelterUpgradedPayload {
  componentId: string;
  newLevel: number;
}

/**
 * 庇护所组件受损事件 (`shelterDamaged`) 的载荷
 */
export interface ShelterDamagedPayload {
  componentId: string;
  damageAmount: number;
}

/**
 * 庇护所组件修复事件 (`shelterRepaired`) 的载荷
 */
export interface ShelterRepairedPayload {
  componentId: string;
  repairAmount: number;
}

/**
 * 庇护所遭受攻击事件 (`shelterAttacked`) 的载荷
 */
export interface ShelterAttackedPayload {
  attacker: string;
  attackDetails: string; // 可以根据需要扩展为更复杂的对象
}

/**
 * 庇护所产出资源事件 (`shelterResourceProduced`) 的载荷
 */
export interface ShelterResourceProducedPayload {
  resourceId: string;
  quantity: number;
}

/**
 * 庇护所整体状态变更事件 (`shelterStatusChanged`) 的载荷
 */
export interface ShelterStatusChangedPayload {
  newStatus: string;
}

/**
 * 奇遇冷却提示更新事件 (`adventureHintUpdate`) 的载荷
 */
export interface AdventureHintUpdatePayload {
  hint: string;
}

/**
 * 天气影响移除事件 (`weatherInfluenceRemoved`) 的载荷
 */
export interface WeatherInfluenceRemovedPayload {
  influence: IWeatherInfluence;
}

/**
 * 变量同步完成事件 (`variablesSynced`) 的载荷
 * 这个事件在核心变量 `syncVariables` 函数成功执行后触发。
 * 它不携带具体的数据，只作为一个通知。
 */
export type VariablesSyncedPayload = void;


// =================================================================
// 应用事件映射表 (AppEventMap)
// =================================================================

/**
 * 应用程序事件的中央映射表。
 *
 * 这是整个类型安全事件系统的核心。
 * - **Key**: 事件的唯一名称 (字符串字面量类型)。
 * - **Value**: 该事件对应的载荷（payload）的类型。
 *
 * 所有新的系统内部事件都必须在此处注册，才能被新的消息总线识别。
 */
export interface AppEventMap {
  'timeChanged': TimeChangedPayload;
  'weatherChanged': WeatherChangedPayload;
  'seasonChanged': SeasonChangedPayload;
  'solarTermChanged': SolarTermChangedPayload;
  'celestialEventStarted': CelestialEventStartedPayload;
  'shelterUpgraded': ShelterUpgradedPayload;
  'shelterDamaged': ShelterDamagedPayload;
  'shelterRepaired': ShelterRepairedPayload;
  'shelterAttacked': ShelterAttackedPayload;
  'shelterResourceProduced': ShelterResourceProducedPayload;
  'shelterStatusChanged': ShelterStatusChangedPayload;
  'adventureHintUpdate': AdventureHintUpdatePayload;
  'weatherInfluenceRemoved': WeatherInfluenceRemovedPayload;
  'variablesSynced': VariablesSyncedPayload;
}
