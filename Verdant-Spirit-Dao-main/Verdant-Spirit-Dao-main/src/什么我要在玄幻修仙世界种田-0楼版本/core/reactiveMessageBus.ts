import { reactive, readonly } from 'vue';
import { logger } from './logger';
import type { IWeatherState } from '../types';

/**
 * @file 响应式消息总线 (ReactiveMessageBus)
 * @description 提供一个全局的、响应式的事件总线，用于模块间的解耦通信。
 * 它取代了旧的、基于回调的 messageBus，与 Pinia/Vue 的响应式系统无缝集成。
 */

/**
 * 定义事件载荷的结构。
 * 使用时间戳可以确保即使载荷内容相同，监听器也能被触发。
 */
interface EventPayload<T> {
  payload: T;
  timestamp: number;
}

/**
 * 所有事件主题的中央响应式状态。
 * 键是主题名称，值是对应的事件载荷。
 */
const topics = reactive<Record<string, EventPayload<any>>>({});

/**
 * 在指定主题上发布一个事件。
 * 此函数会更新响应式状态，从而触发任何监听该主题的 watcher。
 * @param topic 事件主题的名称。
 * @param payload 事件附带的数据。
 */
export function emit<T>(topic: string, payload: T) {
  logger('log', 'ReactiveMessageBus', `Event emitted on topic '${topic}'`, payload);
  topics[topic] = {
    payload,
    timestamp: Date.now(),
  };
}

/**
 * 提供对所有事件主题的只读、响应式视图。
 * 各个 Store 可以监听此对象的属性变化来响应事件。
 *
 * @example
 * import { watch } from 'vue';
 * import { events } from './reactiveMessageBus';
 *
 * // 在 Pinia store 或 Vue 组件中:
 * watch(() => events.timeChanged, (event) => {
 *   if (event) {
 *     console.log('时间已变化:', event.payload);
 *   }
 * }, { deep: true });
 */
export const events = readonly(topics) as KnownEvents;

/**
 * 为已知事件提供类型定义，以增强代码提示和类型安全。
 * 随着新事件的添加，应在此处扩展接口。
 */
export interface KnownEvents {
  timeChanged?: EventPayload<{ fromDay: number; toDay: number; fromTimeOfDay: string; toTimeOfDay: string; }>;
  newDayStarted?: EventPayload<{ newDay: number }>;
  variablesSynced?: EventPayload<undefined>;
  awardItem?: EventPayload<{ itemName: string; quantity: number; source: string; }>;
  worldStoreInitialized?: EventPayload<undefined>;
  weatherCalculated?: EventPayload<{ newState: IWeatherState }>;
  // 在此添加其他事件类型...
}
