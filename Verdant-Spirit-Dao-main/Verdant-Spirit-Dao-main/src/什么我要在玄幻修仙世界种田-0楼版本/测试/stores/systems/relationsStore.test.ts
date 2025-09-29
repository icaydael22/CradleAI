import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useRelationsStore } from '../../../stores/systems/relationsStore';
import { useWorldStore } from '../../../stores/core/worldStore';
import type { GameEvent } from '../../../stores/core/eventLogStore';
import type { WorldState } from '../../../stores/core/worldStore';

describe('Relations Module (relationsStore & worldStore integration)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const mockInitialWorldState: any = {
    角色: {
      主控角色名: '萧栖雪',
      萧栖雪: {
        姓名: '萧栖雪',
        关系: {
          李云: 50,
        },
      },
      李云: {
        姓名: '李云',
        关系: {
          萧栖雪: 50,
        },
      },
      神秘商人: {
        姓名: '神秘商人',
        关系: {},
      },
    },
  };

  it('relationsStore should correctly derive relations from worldStore', () => {
    // 1. Setup
    const worldStore = useWorldStore();
    // Directly set the state for testing purposes
    worldStore.world = JSON.parse(JSON.stringify(mockInitialWorldState));

    // 2. Action
    const relationsStore = useRelationsStore();
    const relations = relationsStore.relations;

    // 3. Assert
    expect(relations).toBeDefined();
    expect(relations.length).toBe(3);

    const xiao = relations.find(c => c.姓名 === '萧栖雪');
    const li = relations.find(c => c.姓名 === '李云');

    expect(xiao).toBeDefined();
    expect(li).toBeDefined();
    expect((xiao?.关系 as any)?.李云).toBe(50);
    expect((li?.关系 as any)?.萧栖雪).toBe(50);
  });

  it('worldStore should process "关系变化" event and update relations reactively', () => {
    // 1. Setup
    const worldStore = useWorldStore();
    const relationsStore = useRelationsStore();
    worldStore.world = JSON.parse(JSON.stringify(mockInitialWorldState));
    
    // Manually register the event handler as `initialize` is heavy
    worldStore.registerEventHandler('关系变化', (event, worldState) => {
      const { 角色, 目标, 变化值 } = event.payload;
      if (!worldState.角色?.[角色]) return;
      if (!worldState.角色[角色].关系) {
        worldState.角色[角色].关系 = {};
      }
      const currentRelation = worldState.角色[角色].关系[目标] || 0;
      worldState.角色[角色].关系[目标] = currentRelation + 变化值;
    });

    // Initial state verification
    const xiaoBefore = relationsStore.relations.find(c => c.姓名 === '萧栖雪');
    expect((xiaoBefore?.关系 as any)?.李云).toBe(50);

    // 2. Action: Create and process an event
    const relationChangeEvent: GameEvent = {
      type: '关系变化',
      payload: {
        角色: '萧栖雪',
        目标: '李云',
        变化值: 10,
      },
      eventId: 'test-event-1',
      sourceMessageId: 'test-message-1',
    };
    worldStore.processEvent(relationChangeEvent);

    // 3. Assert
    const xiaoAfter = relationsStore.relations.find(c => c.姓名 === '萧栖雪');
    expect((xiaoAfter?.关系 as any)?.李云).toBe(60);

    // Test decreasing relationship
     const relationChangeEventNegative: GameEvent = {
      type: '关系变化',
      payload: {
        角色: '李云',
        目标: '萧栖雪',
        变化值: -20,
      },
      eventId: 'test-event-2',
      sourceMessageId: 'test-message-2',
    };
    worldStore.processEvent(relationChangeEventNegative);
    const liAfter = relationsStore.relations.find(c => c.姓名 === '李云');
    expect((liAfter?.关系 as any)?.萧栖雪).toBe(30);

    // Test adding a new relationship
     const relationChangeEventNew: GameEvent = {
      type: '关系变化',
      payload: {
        角色: '萧栖雪',
        目标: '神秘商人',
        变化值: -5,
      },
      eventId: 'test-event-3',
      sourceMessageId: 'test-message-3',
    };
    worldStore.processEvent(relationChangeEventNew);
    const xiaoAfterNew = relationsStore.relations.find(c => c.姓名 === '萧栖雪');
    expect((xiaoAfterNew?.关系 as any)?.神秘商人).toBe(-5);
  });

  describe('Getters Robustness', () => {
    it('should return an empty array when characters object is empty', () => {
      // 1. Setup
      const worldStore = useWorldStore();
      worldStore.world = {
        角色: {},
      };

      // 2. Action
      const relationsStore = useRelationsStore();
      const relations = relationsStore.relations;

      // 3. Assert
      expect(relations).toEqual([]);
    });

    it('should filter out invalid entries in characters object', () => {
      // 1. Setup
      const worldStore = useWorldStore();
      worldStore.world = {
        角色: {
          主控角色名: '萧栖雪',
          萧栖雪: { 姓名: '萧栖雪', 关系: {} },
          无效条目1: null,
          无效条目2: undefined,
          无效条目3: 'just a string',
          李云: { 姓名: '李云', 关系: {} },
        },
      } as any;

      // 2. Action
      const relationsStore = useRelationsStore();
      const relations = relationsStore.relations;

      // 3. Assert
      expect(relations.length).toBe(2);
      expect(relations.find(c => c.姓名 === '萧栖雪')).toBeDefined();
      expect(relations.find(c => c.姓名 === '李云')).toBeDefined();
      expect(relations.find(c => c.姓名 === '无效条目1')).toBeUndefined();
    });
  });
});