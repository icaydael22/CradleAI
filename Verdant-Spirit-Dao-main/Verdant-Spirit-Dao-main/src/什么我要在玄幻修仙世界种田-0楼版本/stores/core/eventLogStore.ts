/**
 * @file 事件日志 Store (EventLogStore)
 * @description 作为所有源自LLM的GameEvent的单一事实来源和事件总线。
 */

import { defineStore } from 'pinia';
import { ref, readonly } from 'vue';
import { getVariables, assignVariables } from '../../core/variables';
import type { GameEvent } from '../../core/eventManager';
export type { GameEvent };
import type { IWorld } from '../../types';
import { logger } from '../../core/logger';

export const useEventLogStore = defineStore('eventLog', () => {
  // --- State ---
  const events = ref<GameEvent[]>([]);

  // --- Getters ---
  const allEvents = readonly(events);

  // --- Actions ---

  /**
   * 从酒馆变量中获取最新的事件列表来初始化或同步Store。
   */
  async function fetchEvents() {
    try {
      let world;
      try {
        world = (await getVariables({ name: '世界' })) as IWorld;
      } catch (error: any) {
        if (error.name === 'DataCloneError') {
          logger('warn', 'EventLogStore', 'Failed to get variables due to a DataCloneError. This might happen during branch switching. Aborting fetch.', error);
          return;
        }
        throw error;
      }
      if (world && Array.isArray(world.事件列表)) {
        events.value = [...world.事件列表];
      } else {
        events.value = [];
        logger('warn', 'EventLogStore', '无法从变量中找到有效的事件列表，已初始化为空数组。');
      }
    } catch (error) {
      logger('error', 'EventLogStore', '获取事件列表失败:', error);
      events.value = [];
    }
  }

  /**
   * 将新的事件追加到事件日志中，并持久化到酒馆变量。
   * @param newEvents - 从LLM新生成的事件数组。
   */
  async function addEvents(newEvents: GameEvent[]) {
    if (!newEvents || newEvents.length === 0) {
      return;
    }

    // 关键修复：总是从酒馆变量中读取最新的事件列表作为“真实来源”
    // 以防止内存中的状态（events.value）与持久化状态不同步导致事件丢失。
    let currentEvents: GameEvent[] = [];
    try {
      const world = (await getVariables({ name: '世界' })) as IWorld;
      if (world && Array.isArray(world.事件列表)) {
        currentEvents = [...world.事件列表];
      }
    } catch (error) {
      logger('error', 'EventLogStore', 'addEvents: 获取当前事件列表失败:', error);
      // 即使获取失败，也尝试使用内存中的版本，但发出警告
      currentEvents = [...events.value];
      logger('warn', 'EventLogStore', 'addEvents: 将回退到使用内存中的事件列表。');
    }

    const existingEventIds = new Set(currentEvents.map(e => e.eventId));
    const uniqueNewEvents = newEvents.filter(e => !existingEventIds.has(e.eventId));

    if (uniqueNewEvents.length > 0) {
      const updatedEvents = [...currentEvents, ...uniqueNewEvents];
      // 同步内存状态并持久化
      events.value = updatedEvents;
      await persistEvents(updatedEvents);
    }
  }

  /**
   * (用于状态重算) 使用给定的事件列表完全替换当前的事件日志。
   * @param allEvents - 用于构成新状态的完整事件列表。
   */
  async function setEvents(allEvents: GameEvent[]) {
    const newEvents = allEvents || [];
    events.value = [...newEvents];
    // 关键修复：确保全量替换事件列表时，也将结果完整持久化。
    await persistEvents(newEvents);
  }

  /**
   * 将单个事件标记为已处理
   * @param eventId - 要标记的事件的ID
   */
  async function markEventAsProcessed(eventId: string) {
    const event = events.value.find(e => e.eventId === eventId);
    if (event) {
      // @ts-ignore
      event.processed = true;
      await persistEvents(events.value);
    }
  }

  /**
   * 将事件列表持久化到 `世界.事件列表` 变量中。
   * @param eventsToPersist - 要保存的事件数组。
   */
  async function persistEvents(eventsToPersist: GameEvent[]) {
    try {
      await assignVariables({
        '世界': {
          '事件列表': eventsToPersist
        }
      });
    } catch (error) {
      logger('error', 'EventLogStore', '持久化事件列表失败:', error);
    }
  }

  return {
    // Getters
    allEvents,
    // Actions
    fetchEvents,
    addEvents,
    setEvents,
    markEventAsProcessed,
  };
});
