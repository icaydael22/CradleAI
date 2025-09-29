import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import ShelterInfo from '../../../components/world/ShelterInfo.vue';

// Mock the child component
const ShelterComponent = {
  template: '<div class="mock-shelter-component"></div>',
  props: ['name', 'component'],
};

// Mock the logger
vi.mock('../../../core/logger', () => ({
  logger: vi.fn(),
}));

describe('ShelterInfo.vue', () => {
  const mockShelter = {
    名称: '我的庇护所',
    规模: '中型',
    状态: '稳定',
    舒适度: 80,
    防御力: 150,
    功能: ['休息', '储物'],
    组件: {
      '木屋': { 状态: '完好', 规模: '小型' },
      '篱笆': { 状态: '完好', 规模: '小型' },
      '农田': { 状态: '未建造', 规模: '未开垦' },
      '仓库': { 状态: '完好', 规模: '未布置' },
    },
  };

  it('renders "暂无庇护所信息。" when shelter prop is null', () => {
    const wrapper = mount(ShelterInfo, {
      props: {
        shelter: null,
      },
    });
    expect(wrapper.text()).toContain('暂无庇护所信息。');
  });

  it('renders shelter information correctly', () => {
    const wrapper = mount(ShelterInfo, {
      props: {
        shelter: mockShelter,
      },
      global: {
        stubs: {
          ShelterComponent,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain('我的庇护所');
    expect(text).toContain('规模: 中型');
    expect(text).toContain('状态: 稳定');
    expect(text).toContain('舒适度: 80');
    expect(text).toContain('防御力: 150');
  });

  it('renders shelter functions', () => {
    const wrapper = mount(ShelterInfo, {
      props: {
        shelter: mockShelter,
      },
    });
    const functionsDiv = wrapper.find('.list-disc');
    const functionItems = functionsDiv.findAll('li');
    expect(functionItems.length).toBe(2);
    expect(wrapper.text()).toContain('休息');
    expect(wrapper.text()).toContain('储物');
  });

  it('filters and renders only built components', async () => {
    const wrapper = mount(ShelterInfo, {
      props: {
        shelter: mockShelter,
      },
      global: {
        stubs: {
          ShelterComponent,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const components = wrapper.findAllComponents(ShelterComponent);
    expect(components.length).toBe(2);

    const propsData = components.map(c => c.props());
    expect(propsData).toContainEqual({
      name: '木屋',
      component: mockShelter.组件.木屋,
    });
    expect(propsData).toContainEqual({
      name: '篱笆',
      component: mockShelter.组件.篱笆,
    });
    expect(propsData).not.toContainEqual({
      name: '农田',
      component: mockShelter.组件.农田,
    });
     expect(propsData).not.toContainEqual({
      name: '仓库',
      component: mockShelter.组件.仓库,
    });
  });

  it('does not render component section if no components are built', () => {
    const shelterWithNoBuiltComponents = {
      ...mockShelter,
      组件: {
        '农田': { 状态: '未建造', 规模: '未开垦' },
      },
    };
    const wrapper = mount(ShelterInfo, {
      props: {
        shelter: shelterWithNoBuiltComponents,
      },
    });
    expect(wrapper.text()).not.toContain('组件详情');
  });
});