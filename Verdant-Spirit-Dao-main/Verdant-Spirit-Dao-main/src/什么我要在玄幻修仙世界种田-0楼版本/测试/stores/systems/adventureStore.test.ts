import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorldStore } from '@/stores/core/worldStore';
import { useAdventureStore } from '@/stores/systems/adventureStore';

describe('useAdventureStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should have cooldown active by default when no data is present', () => {
    const adventureStore = useAdventureStore();
    expect(adventureStore.isCooldownActive).toBe(true);
  });

  it('should correctly determine if cooldown is active', () => {
    const worldStore = useWorldStore();
    const adventureStore = useAdventureStore();

    // Case 1: Cooldown is active
    worldStore.world = {
      奇遇: { 冷却至天数: 100 },
      时间: { day: 50 },
    } as any;
    expect(adventureStore.isCooldownActive).toBe(true);

    // Case 2: Cooldown is over
    worldStore.world = {
      奇遇: { 冷却至天数: 100 },
      时间: { day: 100 },
    } as any;
    expect(adventureStore.isCooldownActive).toBe(false);
    
    // Case 3: Cooldown is well over
    worldStore.world = {
      奇遇: { 冷却至天数: 100 },
      时间: { day: 150 },
    } as any;
    expect(adventureStore.isCooldownActive).toBe(false);
  });

  it('should return correct cooldown days remaining', () => {
    const worldStore = useWorldStore();
    const adventureStore = useAdventureStore();

    worldStore.world = {
      奇遇: { 冷却至天数: 120 },
      时间: { day: 100 },
    } as any;
    expect(adventureStore.cooldownDaysRemaining).toBe(20);
  });

  it('should return 0 cooldown days if cooldown is over', () => {
    const worldStore = useWorldStore();
    const adventureStore = useAdventureStore();

    worldStore.world = {
      奇遇: { 冷却至天数: 90 },
      时间: { day: 100 },
    } as any;
    expect(adventureStore.cooldownDaysRemaining).toBe(0);
  });

  it('should reactively update when time passes', async () => {
    const worldStore = useWorldStore();
    const adventureStore = useAdventureStore();

    worldStore.world = {
      奇遇: { 冷却至天数: 100 },
      时间: { day: 90 },
    } as any;

    expect(adventureStore.isCooldownActive).toBe(true);
    expect(adventureStore.cooldownDaysRemaining).toBe(10);

    // Simulate time passing
    if (worldStore.world?.时间) {
      worldStore.world.时间.day = 100;
    }
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(adventureStore.isCooldownActive).toBe(false);
    expect(adventureStore.cooldownDaysRemaining).toBe(0);
  });

  describe('isAdventureReady', () => {
    it('should be true when cooldown is over, regardless of celestial events', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      worldStore.world = {
        奇遇: { 冷却至天数: 100 },
        时间: { day: 101 },
        天气: { 特殊天象: undefined },
      } as any;
      expect(adventureStore.isAdventureReady).toBe(true);
    });

    it('should be true when a celestial event is active, even if on cooldown', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      worldStore.world = {
        奇遇: { 冷却至天数: 100 },
        时间: { day: 50 },
        天气: { 特殊天象: '血月' },
      } as any;
      expect(adventureStore.isAdventureReady).toBe(true);
    });

    it('should be false when on cooldown and no celestial event is active', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      worldStore.world = {
        奇遇: { 冷却至天数: 100 },
        时间: { day: 50 },
        天气: { 特殊天象: undefined },
      } as any;
      expect(adventureStore.isAdventureReady).toBe(false);
    });
  });

  describe('adventureHint', () => {
    it('should return "非奇遇时机。" when adventure is not ready', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      worldStore.world = {
        奇遇: { 冷却至天数: 100 },
        时间: { day: 50 },
        天气: {},
      } as any;
      expect(adventureStore.adventureHint).toBe('非奇遇时机。');
    });

    it('should return a hint with the celestial event name when it is active', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      worldStore.world = {
        奇遇: { 冷却至天数: 100 },
        时间: { day: 50 },
        天气: { 特殊天象: '日食' },
      } as any;
      expect(adventureStore.adventureHint).toBe('特殊天象出现：日食，正是奇遇发生之时！');
    });

    it('should return a generic hint when cooldown is ready and no celestial event', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      worldStore.world = {
        奇遇: { 冷却至天数: 100 },
        时间: { day: 101 },
        天气: { 当前天气: '晴朗' },
      } as any;
      const expectedHint = '奇遇事件的CD已经好了，请酌情考虑在某个时间段触发奇遇事件。当前天气为晴朗，当前可用的传闻为暂无可用传闻。';
      expect(adventureStore.adventureHint).toBe(expectedHint);
    });
  });

  describe('_handleAdventureEvent', () => {
    it('should not do anything if cooldown is active', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      
      worldStore.world = {
        时间: { day: 50 },
        奇遇: { 冷却至天数: 100, 上次奇遇天数: 10 },
      } as any;
      
      const originalState = JSON.parse(JSON.stringify(worldStore.world.奇遇));
      
      // Manually call the handler via initialize and a mock dispatcher
      const redispatchSpy = vi.spyOn(worldStore, 'redispatchEvent');
      const registerSpy = vi.spyOn(worldStore, 'registerEventHandler');
      adventureStore.initialize();

      // Get the handler function that was registered
      const handler = registerSpy.mock.calls[0][1] as Function;
      handler({ payload: { 事件: 'test' } }, worldStore.world);

      expect(worldStore.world.奇遇).toEqual(originalState);
      expect(redispatchSpy).not.toHaveBeenCalled();
    });

    it('should update cooldown and re-dispatch event when ready', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      
      worldStore.world = {
        时间: { day: 150 },
        奇遇: { 冷却至天数: 100, 上次奇遇天数: 10 },
      } as any;
      
      const redispatchSpy = vi.spyOn(worldStore, 'redispatchEvent');
      const registerSpy = vi.spyOn(worldStore, 'registerEventHandler');
      adventureStore.initialize();
      
      const handler = registerSpy.mock.calls[0][1] as Function;
      handler({ payload: { 事件: 'inner_event' } }, worldStore.world);

      // The redispatch logic is now handled by the worldStore's main event loop,
      // so the adventureStore handler is no longer responsible for it.
      expect(redispatchSpy).not.toHaveBeenCalled();
      if (worldStore.world?.奇遇) {
        expect(worldStore.world.奇遇.上次奇遇天数).toBe(150);
        expect(worldStore.world.奇遇.冷却至天数).toBeGreaterThan(150);
      } else {
        // Fail the test if world.奇遇 is not defined
        expect(worldStore.world?.奇遇).toBeDefined();
      }
    });
  });

  describe('initialize', () => {
    it('should register the adventure event handler', () => {
      const worldStore = useWorldStore();
      const adventureStore = useAdventureStore();
      const spy = vi.spyOn(worldStore, 'registerEventHandler');
      
      adventureStore.initialize();
      
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith('奇遇', expect.any(Function));
    });
  });
});