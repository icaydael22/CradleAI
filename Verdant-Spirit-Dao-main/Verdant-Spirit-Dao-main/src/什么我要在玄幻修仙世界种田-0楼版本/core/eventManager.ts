/**
 * @file 事件管理器 (EventManager)
 * @description 集中处理所有由LLM生成的事件，以模块化、可追溯的方式更新游戏状态。
 */

import { ICharacter, IWorld } from '../types';
import { logger } from './logger';
import { PokedexManager } from './pokedex';


/**
 * v2.0 事件数据契约
 * @interface GameEvent
 * @property {string} eventId - 事件的全局唯一ID (例如: "evt_1672531200_abc")
 * @property {string} sourceMessageId - 产生此事件的 MessagePage 的ID
 * @property {string} type - 事件类型 (例如: "物品变化", "新成就")
 * @property {any} payload - 事件的具体数据
 */
export interface GameEvent {
  eventId: string;
  sourceMessageId: string;
  type: string;
  payload: any;
}

/**
 * 事件处理器接口
 * @interface EventHandler
 * @property {function} execute - 处理事件并返回对聊天变量的增量更新
 * @property {function} [undo] - (可选) 撤销事件效果，用于状态回滚
 */
export interface EventHandler {
  execute: (payload: any, currentVars: { '角色': ICharacter, '世界': IWorld }, eventManager?: EventManager, pokedexManager?: PokedexManager) => Promise<Partial<{ '角色': Partial<ICharacter>, '世界': Partial<IWorld> }>> | Partial<{ '角色': Partial<ICharacter>, '世界': Partial<IWorld> }>;
  undo?: (payload: any, currentVars: { '角色': ICharacter, '世界': IWorld }, pokedexManager?: PokedexManager) => Promise<Partial<{ '角色': Partial<ICharacter>, '世界': Partial<IWorld> }>> | Partial<{ '角色': Partial<ICharacter>, '世界': Partial<IWorld> }>;
}

/**
 * 事件管理器类
 * @class EventManager
 */
export class EventManager {
  private handlers: { [key: string]: EventHandler } = {};
  private pokedexManager: PokedexManager;

  private eventListeners: { [key: string]: Function[] } = {};

  constructor(pokedexManager: PokedexManager) {
    this.pokedexManager = pokedexManager;
  }

  /**
   * 注册一个通用事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName: string, callback: Function) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);
  }

  /**
   * 触发一个通用事件
   * @param {string} eventName - 事件名称
   * @param {any} [data] - 传递给回调的数据
   */
  emit(eventName: string, data?: any) {
    const listeners = this.eventListeners[eventName];
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger('error', 'EventManager', `Error in '${eventName}' listener:`, error);
        }
      });
    }
  }

  /**
   * 注册一个事件处理器
   * @param {string} eventType - 事件类型
   * @param {EventHandler} handler - 处理器对象
   */
  register(eventType: string, handler: EventHandler) {
    if (this.handlers[eventType]) {
      logger('warn', 'EventManager', `Event handler for "${eventType}" is being overwritten.`);
    }
    this.handlers[eventType] = handler;
    logger('log', 'EventManager', `Event handler for "${eventType}" registered.`);
  }

  /**
   * 处理事件数组，生成状态的增量更新和要记录的新事件列表
   * @param {GameEvent[]} events - 要处理的事件数组
   * @param {object} currentVars - 当前的游戏变量 (Character 和 World)
   * @returns {Promise<{updates: object, newEvents: GameEvent[]}>} - 返回一个包含增量更新和新事件数组的对象
   */
  async processEvents(
    events: GameEvent[],
    currentVars: { '角色': ICharacter; '世界': IWorld }
  ): Promise<{
    finalState: { '角色': ICharacter; '世界': IWorld },
    newEvents: GameEvent[]
  }> {
    const newEvents: GameEvent[] = [];
    // @ts-ignore
    const currentState = _.cloneDeep(currentVars); // 创建一个可变的状态副本
    const existingEventIds = new Set(currentState.世界.事件列表.map((e: GameEvent) => e.eventId));

    for (const event of events) {
      if (existingEventIds.has(event.eventId)) {
        logger('log', 'EventManager', `Event ${event.eventId} has already been processed. Skipping.`);
        continue;
      }

      const handler = this.handlers[event.type];
      const wildcardHandler = this.handlers['*'];

      const processHandler = async (h: EventHandler, e: GameEvent) => {
        if (!h) return;
        try {
          const update = await h.execute(e.payload, currentState, this, this.pokedexManager);
          // @ts-ignore
          _.merge(currentState, update);
        } catch (error) {
          logger('error', 'EventManager', `Error processing event ${e.eventId} of type ${e.type}:`, error);
        }
      };

      if (handler) {
        await processHandler(handler, event);
        newEvents.push(event);
      } else {
        logger('warn', 'EventManager', `No specific handler for event type: ${event.type}`);
      }

      // 始终运行通配符处理器
      if (wildcardHandler) {
        await processHandler(wildcardHandler, event);
      }
    }
    
    return { finalState: currentState, newEvents };
  }

  /**
   * 处理单个事件，主要用于事件的再分发。
   * @param {GameEvent} event - 要处理的单个事件。
   * @param {object} currentVars - 当前的游戏变量。
   * @returns {Promise<void>}
   */
  async processSingleEvent(
    event: GameEvent,
    currentVars: { '角色': ICharacter; '世界': IWorld }
  ): Promise<void> {
    const handler = this.handlers[event.type];
    if (handler) {
      try {
        // 注意：这里不返回update，因为调用者通常不关心内部事件的直接状态变更
        // 状态的最终一致性由主流程的 `syncVariables` 保证
        await handler.execute(event.payload, currentVars, this, this.pokedexManager);
      } catch (error) {
        logger('error', 'EventManager', `Error processing single event ${event.type}:`, error);
      }
    } else {
      logger('warn', 'EventManager', `No handler for single event type: ${event.type}`);
    }
  }

  /**
   * 计算两个事件列表之间的差异，并应用这些差异来更新状态。
   * @param {GameEvent[]} previousEvents - 上一个状态的事件列表。
   * @param {GameEvent[]} targetEvents - 目标状态的事件列表。
   * @param {{ Character: ICharacter; World: IWorld }} currentVars - 当前的游戏变量。
   * @returns {Promise<Partial<{ Character: Partial<ICharacter>, World: Partial<IWorld> }>>} - 返回一个包含最终状态更新的对象。
   */
  async calculateAndApplyStateDiff(
    previousEvents: GameEvent[],
    targetEvents: GameEvent[],
    currentVars: { '角色': ICharacter; '世界': IWorld }
  ): Promise<Partial<{ '角色': Partial<ICharacter>, '世界': Partial<IWorld> }>> {
    const previousEventIds = new Set(previousEvents.map(e => e.eventId));
    const targetEventIds = new Set(targetEvents.map(e => e.eventId));

    const eventsToUndo = previousEvents.filter(e => !targetEventIds.has(e.eventId));
    const eventsToApply = targetEvents.filter(e => !previousEventIds.has(e.eventId));

    const stateUpdates: Partial<{ '角色': Partial<ICharacter>, '世界': Partial<IWorld> }> = {};
    // @ts-ignore
    const tempState = _.cloneDeep(currentVars);

    // 1. 撤销不再需要的事件
    for (const event of eventsToUndo.reverse()) { // 从后往前撤销
      const handler = this.handlers[event.type];
      if (handler && handler.undo) {
        try {
          const undoUpdate = await handler.undo(event.payload, tempState, this.pokedexManager);
          // @ts-ignore
          _.merge(tempState, undoUpdate);
          // @ts-ignore
          _.merge(stateUpdates, undoUpdate);
        } catch (error) {
          logger('error', 'EventManager', `Error undoing event ${event.eventId}:`, error);
        }
      }
    }

    // 2. 应用新的事件
    for (const event of eventsToApply) { // 从前往后应用
      const handler = this.handlers[event.type];
      if (handler) {
        try {
          const applyUpdate = await handler.execute(event.payload, tempState, this, this.pokedexManager);
          // @ts-ignore
          _.merge(tempState, applyUpdate);
          // @ts-ignore
          _.merge(stateUpdates, applyUpdate);
        } catch (error) {
          logger('error', 'EventManager', `Error applying event ${event.eventId}:`, error);
        }
      }
    }

    return stateUpdates;
  }
}

// This file will no longer export a singleton instance.
// The instance will be created and managed in index.ts.
