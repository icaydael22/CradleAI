import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorldStore } from '@/stores/core/worldStore';
import { useTimeStore } from '@/stores/systems/timeStore';
import { ITimeState } from '@/types';

// Mock the dependency: worldStore
vi.mock('@/stores/core/worldStore');

describe('useTimeStore', () => {
  let worldStore: ReturnType<typeof useWorldStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Provide a default mock implementation for worldStore
    worldStore = {
      // Mock the reactive part of the store
      world: {
        时间: undefined,
      },
      // Make `time` a getter to simulate computed property
      get time() {
        return this.world.时间;
      },
      updateWorldState: vi.fn(),
    } as any;

    vi.mocked(useWorldStore).mockReturnValue(worldStore);
  });

  describe('Getters', () => {
    it('should return default values when worldStore.time is undefined', () => {
      // Ensure worldStore.time is undefined by setting the source state
      worldStore.world.时间 = undefined;

      const timeStore = useTimeStore();

      expect(timeStore.state).toBeUndefined();
      expect(timeStore.day).toBe(1);
      expect(timeStore.timeOfDay).toBe('卯时');
      expect(timeStore.currentDateString).toBe('第 1 天 卯时');
      expect(timeStore.dayOfYear).toBe(0);
    });

    it('should return correct derived values when worldStore.time is populated', () => {
      const mockTimeState: ITimeState = {
        day: 125,
        timeOfDay: '申时',
        year: 1,
        month: 5,
        dayOfMonth: 5,
        season: '夏',
        solarTerm: '夏至',
        weather: '晴朗',
      };
      worldStore.world.时间 = mockTimeState;

      const timeStore = useTimeStore();

      expect(timeStore.state).toEqual(mockTimeState);
      expect(timeStore.day).toBe(125);
      expect(timeStore.timeOfDay).toBe('申时');
      expect(timeStore.currentDateString).toBe('第 125 天 申时');
      // (125 - 1) % 360 = 124
      expect(timeStore.dayOfYear).toBe(124);
    });
  });

  describe('Actions', () => {
    describe('updateTime', () => {
      it('should not call updateWorldState if the initial state is undefined', () => {
        worldStore.world.时间 = undefined;
        const timeStore = useTimeStore();

        timeStore.updateTime({ toDay: 10, toTimeOfDay: '午时' });

        expect(worldStore.updateWorldState).not.toHaveBeenCalled();
      });

      it('should call worldStore.updateWorldState with the new time state', () => {
        const initialTimeState: ITimeState = {
          day: 5,
          timeOfDay: '辰时',
          year: 1,
          month: 1,
          dayOfMonth: 5,
          season: '春',
          solarTerm: '清明',
          weather: '多云',
        };
        worldStore.world.时间 = initialTimeState;
        const timeStore = useTimeStore();

        const payload = { toDay: 6, toTimeOfDay: '巳时' };
        timeStore.updateTime(payload);

        const expectedNewState: ITimeState = {
          ...initialTimeState,
          day: payload.toDay,
          timeOfDay: payload.toTimeOfDay,
        };

        expect(worldStore.updateWorldState).toHaveBeenCalledOnce();
        expect(worldStore.updateWorldState).toHaveBeenCalledWith('时间', expectedNewState);
      });
    });
  });
});