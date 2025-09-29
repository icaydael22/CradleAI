import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ShelterComponent from '../../../components/world/ShelterComponent.vue';

describe('ShelterComponent.vue', () => {
  const mockComponentData = {
    规模: '小型',
    材料: '木材',
    耐久度: '100/100',
    防御加成: '+10',
    状态: '完好',
  };

  it('renders component data correctly', () => {
    const wrapper = mount(ShelterComponent, {
      props: {
        name: '测试组件',
        component: mockComponentData,
      },
    });

    const text = wrapper.text();
    expect(text).toContain('测试组件');
    expect(text).toContain('(小型)');
    expect(text).toContain('材料: 木材');
    expect(text).toContain('耐久度: 100/100');
    expect(text).toContain('防御加成: +10');
    expect(text).toContain('状态: 完好');
  });

  it('does not render fields that are not provided', () => {
    const partialComponentData = {
      规模: '大型',
      // Missing other fields
    };
    const wrapper = mount(ShelterComponent, {
      props: {
        name: '部分组件',
        component: partialComponentData,
      },
    });

    const text = wrapper.text();
    expect(text).toContain('部分组件');
    expect(text).toContain('(大型)');
    expect(text).not.toContain('材料:');
    expect(text).not.toContain('耐久度:');
    expect(text).not.toContain('防御加成:');
    expect(text).not.toContain('状态:');
  });

  it('renders icons for each property', () => {
    const wrapper = mount(ShelterComponent, {
      props: {
        name: '测试组件',
        component: mockComponentData,
      },
    });

    expect(wrapper.find('.fa-gem').exists()).toBe(true);
    expect(wrapper.find('.fa-heart').exists()).toBe(true);
    expect(wrapper.find('.fa-shield-alt').exists()).toBe(true);
    expect(wrapper.find('.fa-info-circle').exists()).toBe(true);
  });
});