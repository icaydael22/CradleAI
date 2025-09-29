import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { useWorldStore } from '@/stores/core/worldStore';
import { useWeatherStore } from '@/stores/systems/weatherStore';
import { useTimeStore } from '@/stores/systems/timeStore';
import * as reactiveMessageBus from '@/core/reactiveMessageBus';
import { IWeatherState, ITimeState } from '@/types';

// Mock dependencies
vi.mock('@/stores/core/worldStore');
vi.mock('@/stores/systems/timeStore');
vi.mock('@/core/reactiveMessageBus');

// @ts-ignore
global.toastr = {
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
};

const getInitialWeatherState = (): IWeatherState => _.cloneDeep({
  当前天气: '晴朗',
  天气描述: '天气很好',
  季节: '夏',
  节气: '夏至',
  特殊天象: null,
  效果: [],
  天气影响: [],
});

const getInitialTimeState = (): ITimeState => _.cloneDeep({
  day: 100,
  timeOfDay: '午时',
  year: 1,
  month: 4,
  dayOfMonth: 10,
  season: '夏',
  solarTerm: '夏至',
  weather: '晴朗',
});

describe('useWeatherStore', () => {
  let worldStore: ReturnType<typeof useWorldStore>;
  let timeStore: ReturnType<typeof useTimeStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    worldStore = {
      world: {
        天气: getInitialWeatherState(),
        时间: getInitialTimeState(),
      },
      get weather() {
        return this.world.天气;
      },
      registerEventHandler: vi.fn(),
    } as any;

    timeStore = {
      day: 100,
    } as any;

    vi.mocked(useWorldStore).mockReturnValue(worldStore);
    vi.mocked(useTimeStore).mockReturnValue(timeStore);
  });

  describe('_handleWeatherEvent Robustness', () => {
    let weatherStore: ReturnType<typeof useWeatherStore>;
    let worldState: any;

    beforeEach(() => {
      weatherStore = useWeatherStore();
      worldState = { 天气: getInitialWeatherState() };
    });

    it('should handle malformed payload for "施加天气影响" and show an error', () => {
      const event = {
        type: '施加天气影响',
        payload: { 影响类型: '祈雨', 强度: '很强' }, // 强度 should be a number
      };
      weatherStore._handleWeatherEvent(event, worldState);
      expect(toastr.error).toHaveBeenCalledWith('收到了格式不正确的“施加天气影响”事件，缺少关键字段。');
      expect(worldState.天气.天气影响).toHaveLength(0);
    });

    it('should correctly add a weather influence with a valid payload', () => {
      const event = {
        type: '施加天气影响',
        payload: { 影响类型: '祈雨', 强度: 0.5, 持续时间: 24, 来源: '测试' },
      };
      weatherStore._handleWeatherEvent(event, worldState);
      expect(worldState.天气.天气影响).toHaveLength(1);
      // Use arrayContaining with objectContaining for more robust checking
      expect(worldState.天气.天气影响).toEqual(expect.arrayContaining([
        expect.objectContaining({
          类型: '祈雨',
          强度: 0.5,
          剩余时长: 24,
        }),
      ]));
    });
  });

  describe('updateWeatherOnTimeChange Robustness', () => {
    let weatherStore: ReturnType<typeof useWeatherStore>;

    beforeEach(() => {
      weatherStore = useWeatherStore();
      // Mock Math.random to make tests deterministic
      vi.spyOn(Math, 'random').mockReturnValue(0.45); // Adjusted to fall into rain probability
    });

    it('should correctly stack probabilities for multiple weather influences', async () => {
      const emitSpy = vi.spyOn(reactiveMessageBus, 'emit');
      if (!worldStore.world.天气) throw new Error('Weather state not initialized');
      worldStore.world.天气.天气影响 = [
        { 类型: '祈雨', 强度: 0.5, 剩余时长: 48, 来源: 'A', 描述: '' },
        { 类型: '灵气浓郁', 强度: 0.8, 剩余时长: 48, 来源: 'B', 描述: '' },
      ];

      await weatherStore.updateWeatherOnTimeChange(101, 100);

      expect(emitSpy).toHaveBeenCalled();
      // Final attempt: Access the first call, then its second argument (the payload)
      const emittedPayload = emitSpy.mock.calls[0][1] as { newState: IWeatherState };
      const emittedState = emittedPayload.newState;

      // With Math.random at 0.45, it should now reliably pick a rain type.
      // Base summer probs: 烈日: 0.5, 雷阵雨: 0.4, 闷热: 0.1
      // After '祈雨' (0.5): 烈日: 0.5, 雷阵雨: 0.4 + (1-0.4)*0.5 = 0.7, ...
      // Normalized, 雷阵雨 will have a high chance.
      expect(['雷阵雨', '微雨', '小雨', '灵气雨']).toContain(emittedState.当前天气);
      expect(emittedState.效果).toContain('灵气充裕');
    });

    it('should force weather to "晴朗" when "双月临空" occurs', async () => {
      const emitSpy = vi.spyOn(reactiveMessageBus, 'emit');
      if (!worldStore.world.时间) throw new Error('Time state not initialized');
      // Mock time to be night by setting the correct property '时辰'
      worldStore.world.时间.时辰 = '亥';
      // Mock random to trigger the phenomenon
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      await weatherStore.updateWeatherOnTimeChange(101, 100);

      expect(emitSpy).toHaveBeenCalled();
      const emittedPayload = emitSpy.mock.calls[0][1] as { newState: IWeatherState };
      const emittedState = emittedPayload.newState;

      expect(emittedState.特殊天象).toBe('双月临空');
      expect(emittedState.当前天气).toBe('晴朗');
    });
  });
});