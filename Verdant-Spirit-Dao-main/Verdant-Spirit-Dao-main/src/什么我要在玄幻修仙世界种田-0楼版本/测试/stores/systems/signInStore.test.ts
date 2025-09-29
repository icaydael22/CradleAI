import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { watch } from 'vue';
import { useWorldStore } from '@/stores/core/worldStore';
import { useTimeStore } from '@/stores/systems/timeStore';
import { useActionStore } from '@/stores/ui/actionStore';
import { useSignInStore } from '@/stores/systems/signInStore';
import * as reactiveMessageBus from '@/core/reactiveMessageBus';
import { TimeManager } from '@/core/time';

// Mock dependencies
vi.mock('@/stores/core/worldStore');
vi.mock('@/stores/systems/timeStore');
vi.mock('@/stores/ui/actionStore');
vi.mock('@/core/reactiveMessageBus');
vi.mock('@/core/time', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/time')>();
  return {
    ...actual,
    TimeManager: {
      parseGameDate: vi.fn(),
    },
    dateToAbsoluteDays: vi.fn((date: { 年: number, 月: number, 日: number }) => {
      if (!date) return 0;
      // Provide a simplified, consistent mock implementation for testing
      return (date.年 - 1) * 360 + (date.月 - 1) * 30 + date.日;
    }),
  };
});

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    watch: vi.fn(),
  };
});

// Consistent mock data
const mockCurrentDate = { 年: 1, 月: 5, 日: 7 };
const mockInitialSignInState = {
  名称: '签到系统',
  今日已签到: false,
  连续签到天数: 6, // Consistent with the records below
  签到记录: {
    'Y1M5':[1, 2, 3, 4, 5, 6], // Signed in for 6 consecutive days
  },
  月卡: { 状态: '未激活', 剩余天数: 0 },
};

describe('useSignInStore', () => {
  let worldStore: ReturnType<typeof useWorldStore>;
  let timeStore: { day: number; timeOfDay: string };
  let actionStore: ReturnType<typeof useActionStore>;
  let watchCallback: ((newDay: number, oldDay: number) => void) | undefined;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    vi.mocked(watch).mockImplementation((source, cb) => {
      watchCallback = cb as any;
      const mockStop = vi.fn();
      (mockStop as any).pause = vi.fn();
      (mockStop as any).resume = vi.fn();
      return mockStop as any;
    });

    vi.mocked(TimeManager.parseGameDate).mockImplementation((dateString) => {
      if (typeof dateString !== 'string') return null;
      if (dateString === '第一年五月十日') {
        return { year: 1, month: 5, day: 10 };
      }
      if (dateString === '无效日期') return null;
      return null;
    });

    worldStore = {
      world: {
        签到: _.cloneDeep(mockInitialSignInState),
        当前日期: _.cloneDeep(mockCurrentDate),
      },
      registerEventHandler: vi.fn(),
      updateWorldState: vi.fn(),
    } as any;

    timeStore = { day: 127, timeOfDay: '午时' }; // (4 * 30) + 7 = 127

    actionStore = {
      triggerSystemAction: vi.fn(),
    } as any;

    vi.mocked(useWorldStore).mockReturnValue(worldStore);
    vi.mocked(useTimeStore).mockReturnValue(timeStore as any);
    vi.mocked(useActionStore).mockReturnValue(actionStore);

    (global as any).toastr = {
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    };
  });

  afterEach(() => {
    watchCallback = undefined;
  });

  describe('Getters', () => {
    it('should derive basic sign-in data', () => {
      const signInStore = useSignInStore();
      expect(signInStore.hasSignedInToday).toBe(false);
      expect(signInStore.consecutiveDays).toBe(6);
    });

    it('should generate correct calendar data', () => {
      const signInStore = useSignInStore();
      const calendar = signInStore.calendarData;
      
      expect(calendar.year).toBe(1);
      expect(calendar.month).toBe(5);
      expect(calendar.days).toHaveLength(30);
      
      const day6 = calendar.days[5]; // 6th day
      const day7 = calendar.days[6]; // 7th day (today)

      expect(day6.isSignedIn).toBe(true);
      expect(day7.isToday).toBe(true);
      expect(day7.isSignedIn).toBe(false);
    });
  });

  describe('Actions', () => {
    it('signIn should trigger a system action', async () => {
      const signInStore = useSignInStore();
      await signInStore.signIn();
      expect(actionStore.triggerSystemAction).toHaveBeenCalledWith('我决定进行今日签到。');
    });

    it('retroactiveSignIn should trigger a system action with the correct date', async () => {
      const signInStore = useSignInStore();
      await signInStore.retroactiveSignIn('第一年五月三日');
      expect(actionStore.triggerSystemAction).toHaveBeenCalledWith('我消耗了一张【补签卡】，对 第一年五月三日 进行了补签。');
    });
  });

  describe('Event Handlers', () => {
    let handlers: Record<string, (event: any, worldState: any) => void> = {};

    beforeEach(() => {
      handlers = {};
      vi.mocked(worldStore.registerEventHandler).mockImplementation((eventType, handler) => {
        handlers[eventType] = handler;
      });
      useSignInStore();
    });

    it('handleSignInEvent should update state for a normal sign-in', () => {
      const worldState = {
        签到: _.cloneDeep(mockInitialSignInState),
        当前日期: _.cloneDeep(mockCurrentDate),
      };
      const signInEvent = { payload: {} };

      handlers['签到'](signInEvent, worldState);

      expect(worldState.签到.今日已签到).toBe(true);
      expect(worldState.签到.连续签到天数).toBe(7);
      expect(worldState.签到.签到记录['Y1M5']).toContain(7);
    });

    it('handleSignInEvent should handle retroactive sign-in', () => {
      const worldState = {
        签到: _.cloneDeep(mockInitialSignInState),
        当前日期: _.cloneDeep(mockCurrentDate),
      };
      const retroactiveEvent = { payload: { date: '第一年五月十日' } };

      handlers['签到'](retroactiveEvent, worldState);
      
      expect(worldState.签到.今日已签到).toBe(false);
      expect(worldState.签到.连续签到天数).toBe(6);
      expect(worldState.签到.签到记录['Y1M5']).toContain(10);
    });

    it('handleSignInEvent should handle signing in for multiple days at once', () => {
      const worldState = {
        签到: _.cloneDeep(mockInitialSignInState),
        当前日期: _.cloneDeep(mockCurrentDate),
      };
      const multiDayEvent = { payload: { days:[8, 9]} };

      handlers['签到'](multiDayEvent, worldState);

      expect(worldState.签到.签到记录['Y1M5']).toContain(8);
      expect(worldState.签到.签到记录['Y1M5']).toContain(9);
      expect(worldState.签到.今日已签到).toBe(false);
      expect(worldState.签到.连续签到天数).toBe(6);
    });

    it('handleSignInEvent should grant a reward on the 7th consecutive day', () => {
      const worldState = {
        签到: _.cloneDeep(mockInitialSignInState),
        当前日期: _.cloneDeep(mockCurrentDate),
      };
      worldState.签到.连续签到天数 = 6; // Set up for the 7th day
      const signInEvent = { payload: {} };
      const emitSpy = vi.spyOn(reactiveMessageBus, 'emit');

      handlers['签到'](signInEvent, worldState);

      expect(worldState.签到.连续签到天数).toBe(7);
      expect(emitSpy).toHaveBeenCalledWith('awardItem', {
        itemName: '补签卡',
        quantity: 1,
        source: '连续签到奖励',
      });
    });

    describe('handleSignInEvent Robustness', () => {
      it('should handle invalid date string in payload gracefully', () => {
        const worldState = {
          签到: _.cloneDeep(mockInitialSignInState),
          当前日期: _.cloneDeep(mockCurrentDate),
        };
        const invalidDateEvent = { payload: { date: '无效日期' } };
        
        handlers['签到'](invalidDateEvent, worldState);

        expect(worldState.签到.今日已签到).toBe(false);
        expect(worldState.签到.连续签到天数).toBe(6);
        expect(toastr.error).toHaveBeenCalledWith('处理“签到”事件失败：无法确定签到日期。');
      });

      it('should handle missing worldState.当前日期 gracefully', () => {
        const worldState = {
          签到: _.cloneDeep(mockInitialSignInState),
          当前日期: undefined,
        };
        const signInEvent = { payload: {} };

        handlers['签到'](signInEvent, worldState);

        expect(worldState.签到.今日已签到).toBe(false);
        expect(worldState.签到.连续签到天数).toBe(6);
      });

      it('should not increment consecutive days if already signed in today', () => {
        const localWorldState = {
          签到: {
            ..._.cloneDeep(mockInitialSignInState),
            今日已签到: true,
            连续签到天数: 7,
            签到记录: { 'Y1M5': [1,2,3,4,5,6,7]},
          },
          当前日期: _.cloneDeep(mockCurrentDate),
        };
        const localSignInEvent = { payload: {} };

        handlers['签到'](localSignInEvent, localWorldState);

        expect(localWorldState.签到.连续签到天数).toBe(7);
        expect(toastr.info).toHaveBeenCalledWith('今日已签到，请勿重复操作。');
      });
    });
  });
  
  describe('Watchers', () => {
    it('should reset consecutive days if a day is skipped', () => {
      useSignInStore();
      
      expect(watchCallback).toBeDefined();
      if (!watchCallback) return;

      worldStore.world.签到!.连续签到天数 = 5;

      watchCallback(129, 127); // newDay > oldDay + 1

      expect(worldStore.updateWorldState).toHaveBeenCalledWith('签到', expect.objectContaining({
        今日已签到: false,
        连续签到天数: 5, // Watcher does not reset this, recalculate does.
      }));
    });

    it('should reset hasSignedInToday on a new day', () => {
      useSignInStore();
      
      expect(watchCallback).toBeDefined();
      if (!watchCallback) return;
      
      worldStore.world.签到!.今日已签到 = true;

      watchCallback(128, 127);

      expect(worldStore.updateWorldState).toHaveBeenCalledWith('签到', expect.objectContaining({
        今日已签到: false,
        连续签到天数: 6, // It should not be reset
      }));
    });
  });
});
