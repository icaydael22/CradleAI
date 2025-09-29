import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import _ from 'lodash';
import BarterPanel from '@/components/system/BarterPanel.vue';
import { useBarterStore } from '../../../stores/systems/barterStore';
import { useWorldStore } from '../../../stores/core/worldStore';
import { useCharacterStore } from '../../../stores/facades/characterStore';

// Mock dependencies

// Mock the pokedexManager global
vi.stubGlobal('pokedexManager', {
  calculateItemValue: vi.fn((item: any) => _.get(item, '价值.基础价值', _.get(item, '价值')) || 0),
});

const getMockWorld = () => ({
  以物换物: {
    名称: '以物换物',
    可换取的物品: [
      { 名称: '小刀', 描述: '一把锋利的小刀', 库存: 2, 价值: { 基础价值: 15 } },
      { 名称: '面包', 描述: '可以充饥', 库存: 5, 价值: { 基础价值: 5 } },
      { 名称: '空储物袋', 描述: '可以储存物品', 库存: 0, 价值: { 基础价值: 100 } },
    ],
    上次刷新天数: 0,
  },
  角色: {
    '主控角色名': '主角',
    '主角': {
      姓名: '主角',
      物品: [
        { 名称: '草药', 数量: 10, 价值: { 基础价值: 2 } },
        { 名称: '铁矿', 数量: 5, 价值: { 基础价值: 5 } },
      ],
    },
  },
  时间: { day: 1 },
});

describe('BarterPanel.vue', () => {
  let world: any;

  beforeEach(() => {
    world = _.cloneDeep(getMockWorld());
    vi.clearAllMocks();
  });

  const createWrapper = (worldState: any) => {
    const pinia = createTestingPinia({
      stubActions: false,
    });
    setActivePinia(pinia); // Set the active pinia instance for this test
    
    // Manually set the world state before mounting the component
    const worldStore = useWorldStore(pinia);
    worldStore.world = worldState;

    return mount(BarterPanel, {
      global: {
        plugins: [pinia],
      },
    });
  };

  it('renders panel with correct initial data', async () => {
    const wrapper = createWrapper(world);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('h3').text()).toContain('以物换物');

    const myItemsList = wrapper.findAll('[data-testid="my-items-list"] li');
    expect(myItemsList.length).toBe(2);
    expect(wrapper.text()).toContain('草药');
    expect(wrapper.text()).toContain('铁矿');

    const availableItemsList = wrapper.findAll('[data-testid="trader-items-list"] li');
    expect(availableItemsList.length).toBe(3);
    expect(wrapper.text()).toContain('小刀');
    expect(wrapper.text()).toContain('面包');

    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined();
  });

  it('shows message when no items are available', async () => {
    world.以物换物.可换取的物品 = [];
    world.角色.主角.物品 = [];
    const wrapper = createWrapper(world);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('你没有可用于交换的物品。');
    expect(wrapper.text()).toContain('当前没有可换取的物品。');
  });

  it('selects items and updates offer values', async () => {
    const wrapper = createWrapper(world);
    const store = useBarterStore();
    await wrapper.vm.$nextTick();

    // Select my item
    const myItemCheckbox = wrapper.find('[data-testid="my-items-list"] li:nth-child(1) input[type="checkbox"]');
    await myItemCheckbox.setValue(true);

    expect(store.mySelectedItems['草药']).toBe(true);
    expect(wrapper.text()).toContain('我方出价:20');

    // Select trader item
    const traderItemCheckbox = wrapper.find('[data-testid="trader-items-list"] li:nth-child(1) input[type="checkbox"]');
    await traderItemCheckbox.setValue(true);

    expect(store.traderSelectedItems['小刀']).toBe(true);
    expect(wrapper.text()).toContain('对方要价:15');
  });

  it('enables trade button when trade is balanced', async () => {
    const wrapper = createWrapper(world);
    await wrapper.vm.$nextTick();

    // Initially disabled
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.text-center.text-xs').text()).toBe('');

    // Select items to make an unbalanced trade
    const traderItemCheckbox = wrapper.find('[data-testid="trader-items-list"] li:nth-child(1) input[type="checkbox"]'); // Value 15
    await traderItemCheckbox.setValue(true);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.text-center.text-xs').text()).toContain('我方出价需大于等于对方要价');

    // Select another item to balance the trade
    const myItemCheckbox = wrapper.find('[data-testid="my-items-list"] li:nth-child(1) input[type="checkbox"]'); // Value 20
    await myItemCheckbox.setValue(true);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('.text-center.text-xs').text()).toBe('');
  });

  it('calls executeTrade when trade button is clicked', async () => {
    const wrapper = createWrapper(world);
    const store = useBarterStore();
    store.executeTrade = vi.fn(); // Spy on the action
    await wrapper.vm.$nextTick();

    // Make trade balanced
    await wrapper.find('[data-testid="my-items-list"] li:nth-child(1) input[type="checkbox"]').setValue(true); // My offer: 20
    await wrapper.find('[data-testid="trader-items-list"] li:nth-child(1) input[type="checkbox"]').setValue(true); // Trader request: 15
    await wrapper.vm.$nextTick();

    await wrapper.find('.btn-primary').trigger('click');
    expect(store.executeTrade).toHaveBeenCalledTimes(1);
  });

  it('handles refresh button state and action', async () => {
    const wrapper = createWrapper(world);
    const store = useBarterStore();
    store.refreshItems = vi.fn(); // Spy on the action
    const worldStore = useWorldStore();
    await wrapper.vm.$nextTick();

    // Day 1, last refresh day 0 -> can refresh
    const refreshBtn = wrapper.find('.text-sm.text-accent');
    expect(refreshBtn.attributes('disabled')).toBeUndefined();
    expect(refreshBtn.text()).toContain('刷新');

    await refreshBtn.trigger('click');
    expect(store.refreshItems).toHaveBeenCalledTimes(1);

    // Simulate refresh cooldown by updating the world state in the store
    (worldStore.world as any).以物换物.上次刷新天数 = 1;
    await wrapper.vm.$nextTick();

    expect(refreshBtn.attributes('disabled')).toBeDefined();
    expect(refreshBtn.text()).toContain('明日再来');
  });
});