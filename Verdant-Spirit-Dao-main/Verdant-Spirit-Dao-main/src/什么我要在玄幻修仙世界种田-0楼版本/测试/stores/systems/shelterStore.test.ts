import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { useWorldStore } from '@/stores/core/worldStore';
import { useShelterStore } from '@/stores/systems/shelterStore';

// @ts-ignore
global.toastr = {
  error: vi.fn(),
};

// This is a realistic data structure, aligned with game data.
const getInitialWorldState = () => _.cloneDeep({
  庇护所: {
    名称: "望海崖居",
    防御力: '无', // Initial value, will be recalculated
    功能: [], // Initial value, will be recalculated
    组件: {
      围墙: { 规模: '石墙', 状态: '完好无损', 耐久度: '100.00%' },
      农田: { 规模: '未开垦', 状态: '未启用', 耐久度: undefined },
      工坊: { 规模: '初级工坊', 状态: '轻微受损', 耐久度: '75.50%' },
      瞭望塔: { 规模: '木制塔楼', 状态: '严重受损', 耐久度: '20.00%' },
    },
  },
});

describe('useShelterStore', () => {
  let shelterStore: ReturnType<typeof useShelterStore>;
  let worldStore: ReturnType<typeof useWorldStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    shelterStore = useShelterStore();
    worldStore = useWorldStore();
    
    // Initialize with a clean state for most tests
    worldStore.world = getInitialWorldState() as any;
    
    // Perform dependency injection
    shelterStore.initialize(worldStore);
    
    vi.clearAllMocks();
  });

  describe('Getters', () => {
    it('should return undefined when worldStore has no shelter data', () => {
      worldStore.world = {}; // Set world to an empty object
      shelterStore.initialize(worldStore); // Re-initialize with the empty worldStore
      expect(shelterStore.shelter).toBeNull();
      expect(shelterStore.totalDefense).toBe('无');
      expect(shelterStore.totalComfort).toBe('未实现');
    });

    it('should derive shelter data from worldStore', () => {
      // State is already set in beforeEach
      expect(shelterStore.shelter).toEqual(getInitialWorldState().庇护所);
    });
  });

  describe('_handleShelterEvent', () => {
    let worldState: any;

    beforeEach(() => {
      // The stores are already initialized, just grab a fresh copy of the state
      worldState = getInitialWorldState();
    });

    it('should do nothing if shelter is not in world state', () => {
      const event = { type: '庇护所攻击', payload: { 数量: 10 } };
      const emptyWorldState = {};
      shelterStore._handleShelterEvent(event, emptyWorldState);
      expect(emptyWorldState).not.toHaveProperty('庇护所');
    });

    describe('庇护所建造/升级', () => {
      it('should upgrade a component and reset its durability', () => {
        const event = { type: '庇护所升级', payload: { 组件ID: '工坊', 等级: '中级工坊' } };
        shelterStore._handleShelterEvent(event, worldState);
        const component = worldState.庇护所.组件.工坊;
        expect(component.规模).toBe('中级工坊');
        expect(component.状态).toBe('完好无损');
        expect(component.耐久度).toBe('100.00%');
      });

      it('should show error for invalid payload', () => {
        const event = { type: '庇护所建造', payload: { 组件ID: '不存在的组件', 等级: '中级工坊' } };
        shelterStore._handleShelterEvent(event, worldState);
        expect(toastr.error).toHaveBeenCalledWith('收到了格式不正确的“庇护所建造/升级”事件。');
      });
    });

    describe('庇护所修复', () => {
      it('should repair a component correctly', () => {
        const event = { type: '庇护所修复', payload: { 组件ID: '工坊', 数量: 10 } }; // 75.50% -> 85.50%
        shelterStore._handleShelterEvent(event, worldState);
        expect(worldState.庇护所.组件.工坊.耐久度).toBe('85.50%');
      });

      it('should not repair beyond 100%', () => {
        const event = { type: '庇护所修复', payload: { 组件ID: '工坊', 数量: 50 } }; // 75.50% -> 100.00%
        shelterStore._handleShelterEvent(event, worldState);
        expect(worldState.庇护所.组件.工坊.耐久度).toBe('100.00%');
      });
    });

    describe('庇护所受损', () => {
      it('should damage a component correctly', () => {
        const event = { type: '庇护所受损', payload: { 组件ID: '工坊', 数量: 15.5 } }; // 75.50% -> 60.00%
        shelterStore._handleShelterEvent(event, worldState);
        expect(worldState.庇护所.组件.工坊.耐久度).toBe('60.00%');
        expect(shelterStore.recentlyDamagedComponent).toBe('工坊');
      });

      it('should not damage below 0%', () => {
        const event = { type: '庇护所受损', payload: { 组件ID: '工坊', 数量: 100 } }; // 75.50% -> 0.00%
        shelterStore._handleShelterEvent(event, worldState);
        expect(worldState.庇护所.组件.工坊.耐久度).toBe('0.00%');
      });
    });

    describe('庇护所攻击', () => {
      it('should distribute attack damage evenly among damageable components', () => {
        const event = { type: '庇护所攻击', payload: { 数量: 60 } };
        const damagePerComponent = 60 / 3; // 20
        shelterStore._handleShelterEvent(event, worldState);
        expect(worldState.庇护所.组件.围墙.耐久度).toBe('80.00%');
        expect(worldState.庇护所.组件.工坊.耐久度).toBe('55.50%');
        expect(worldState.庇护所.组件.瞭望塔.耐久度).toBe('0.00%');
      });
    });
  });

  describe('calculateCompositeAttributes (via _handleShelterEvent)', () => {
    it('should calculate total defense based on SHELTER_COMPONENTS_DATA', () => {
      const worldState = getInitialWorldState();
      shelterStore._handleShelterEvent({ type: 'any', payload: {} }, worldState);
      // Defense: 石墙(15) + 初级工坊(5) + 木制塔楼(5) = 25
      // According to mapping, 25 is '显著'
      expect(worldState.庇护所.防御力).toBe('显著');
    });

    it('should generate a list of functions', () => {
      const worldState = getInitialWorldState();
      shelterStore._handleShelterEvent({ type: 'any', payload: {} }, worldState);
      const functions = worldState.庇护所.功能;
      expect(functions).toContain('[围墙] 坚固的石墙，提供更强的防御。');
      expect(functions).toContain('[工坊] 可以制造基础的工具和物品。');
      expect(functions).toContain('[瞭望塔] 扩大视野，预警危险。');
      expect(functions).not.toContain('农田'); // Because it's 未开垦
    });

    it('should update component status based on durability', () => {
      const worldState = getInitialWorldState();
      shelterStore._handleShelterEvent({ type: 'any', payload: {} }, worldState);
      expect(worldState.庇护所.组件.围墙.状态).toBe('完好无损'); // 100%
      expect(worldState.庇护所.组件.工坊.状态).toBe('轻微受损'); // 75.5%
      expect(worldState.庇护所.组件.瞭望塔.状态).toBe('毁坏'); // 20%
    });
  });
});