import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WorldTab from '../../../components/world/WorldTab.vue';
import { useWorldStore } from '../../../stores/core/worldStore';
import { createTestingPinia } from '@pinia/testing';

// Mock child components
const ShelterInfo = {
  template: '<div></div>',
  props: ['shelter'],
};

const MapDisplay = {
  template: '<div></div>',
};

// Mock logger
vi.mock('../../../core/logger', () => ({
  logger: vi.fn(),
}));

describe('WorldTab.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows loading message when world data is not available', () => {
    const wrapper = mount(WorldTab, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: { world: null },
          },
        })],
      },
    });
    expect(wrapper.text()).toContain('正在加载世界信息...');
  });

  it('renders world information when data is available', async () => {
    const pinia = createTestingPinia({ stubActions: false });
    const worldStore = useWorldStore(pinia);

    // Directly set the world state with a fully schema-compliant mock object
    worldStore.world = {
      时间: {
        day: 1,
        timeOfDay: '上午',
        season: '春',
        solarTerm: '惊蛰',
        weather: '晴朗', // Required by TimeStateSchema
      },
      天气: {
        当前天气: '晴朗',
        天气描述: '阳光明媚',
        季节: '春',
        节气: '惊蛰',
        效果: [],
        特殊天象: null,
        天气影响: [],
      },
      地点: '新手村',
      庇护所: {
        名称: '我的小屋',
        规模: '小型',
        状态: '完好',
        舒适度: '舒适',
        防御力: '10',
        功能: [],
        组件: { // All components must be present
          围墙: { 状态: '未建造' },
          屋顶: { 状态: '未建造' },
          农田: { 状态: '未建造' },
          药园: { 状态: '未建造' },
          防御阵法: { 状态: '未建造' },
        },
        事件日志: [],
      },
    };

    const wrapper = mount(WorldTab, {
      global: {
        plugins: [pinia],
        stubs: { ShelterInfo, MapDisplay },
      },
    });

    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('第 1 天');
    expect(text).toContain('上午');
    expect(text).toContain('春 · 惊蛰');
    expect(text).toContain('晴朗');
    expect(text).toContain('新手村');
    expect(wrapper.findComponent(ShelterInfo).exists()).toBe(true);
    expect(wrapper.findComponent(MapDisplay).exists()).toBe(true);
  });

  it('calls worldStore.initialize on mount if world is not set', () => {
    const pinia = createTestingPinia({
      initialState: {
        world: { world: null }, // Start with a null world
      },
      stubActions: false, // Ensure actions are not stubbed
    });
    const worldStore = useWorldStore(pinia);
    const initializeSpy = vi.spyOn(worldStore, 'initialize');

    mount(WorldTab, {
      global: {
        plugins: [pinia],
      },
    });

    expect(initializeSpy).toHaveBeenCalled();
  });
});