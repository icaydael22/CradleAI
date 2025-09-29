import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import PokedexTab from '@/components/pokedex/PokedexTab.vue';
import { useWorldStore } from '../../../stores/core/worldStore';
import { useItemStore } from '../../../stores/facades/itemStore';
import { createTestingPinia } from '@pinia/testing';

// Mock the child component
const PokedexList = {
  template: '<div></div>',
  props: ['title', 'items', 'listType', 'pokedexType'],
};

describe('PokedexTab.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders PokedexList components with correct props from stores', async () => {
    const mockPokedex = {
      妖兽: [{ 名称: '妖兽一', 描述: '描述', 数量: 1, 详情: {}, 类别: '妖兽', status: 'known' }],
      植物: [{ 名称: '灵植一', 描述: '描述', 数量: 1, 详情: {}, 类别: '植物', status: 'known' }],
      书籍: [{ 名称: '书籍一', 描述: '描述', 数量: 1, 详情: {}, 类别: '书籍', status: 'known' }],
    };
    const mockItems = [{ 名称: '物品一', 描述: '描述', 数量: 1 }];

    const wrapper = mount(PokedexTab, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: {
              world: {
                图鉴: mockPokedex,
                角色: {
                  主控角色名: '主角',
                  主角: {
                    姓名: '主角',
                    物品: mockItems,
                  },
                },
              },
            },
          },
        })],
        stubs: {
          PokedexList,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const lists = wrapper.findAllComponents(PokedexList);
    expect(lists.length).toBe(4);

    // Check props for each PokedexList instance
    const propsData = lists.map(list => list.props());
    
    expect(propsData).toContainEqual({
      title: '妖兽',
      items: mockPokedex.妖兽,
      listType: 'pokedex',
      pokedexType: '妖兽',
    });

    expect(propsData).toContainEqual({
      title: '灵植',
      items: mockPokedex.植物,
      listType: 'pokedex',
      pokedexType: '植物',
    });

    expect(propsData).toContainEqual({
      title: '书籍',
      items: mockPokedex.书籍,
      listType: 'pokedex',
      pokedexType: '书籍',
    });

    expect(propsData).toContainEqual({
      title: '物品',
      items: mockItems,
      listType: 'item',
      pokedexType: undefined,
    });
  });
});