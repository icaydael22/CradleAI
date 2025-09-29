import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import PokedexViewList from '../../../components/pokedex/PokedexViewList.vue';
import type { PokedexEntry, PokedexType } from '../../../core/pokedex';

describe('PokedexViewList.vue', () => {
  const mockEntries: PokedexEntry[] = [
    { 名称: '妖兽一', 描述: '描述一', 数量: 1, 详情: {} },
    { 名称: '妖兽二', 描述: '描述二', 数量: 2, 详情: {} },
  ];

  const type: PokedexType = '妖兽';

  it('renders title and entry count correctly', () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: mockEntries,
        modelValue: [],
      },
    });
    expect(wrapper.find('summary').text()).toContain('测试标题 (2)');
  });

  it('shows "暂无条目" when entries are empty', () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: [],
        modelValue: [],
      },
    });
    expect(wrapper.text()).toContain('暂无条目');
  });

  it('renders list of entries', () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: mockEntries,
        modelValue: [],
      },
    });
    const listItems = wrapper.findAll('li');
    expect(listItems.length).toBe(2);
    const text = wrapper.text();
    expect(text).toContain('妖兽一');
    expect(text).toContain('妖兽二');
  });

  it('emits view event with correct payload when view button is clicked', async () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: mockEntries,
        modelValue: [],
      },
    });
    const firstEntryActions = wrapper.findAll('li').at(0)!;
    await firstEntryActions.find('button[title="查看"]').trigger('click');
    expect(wrapper.emitted('view')).toBeTruthy();
    // @ts-ignore
    expect((wrapper.emitted('view'))[0][0]).toEqual([[mockEntries][0][0]][0]);
  });

  it('emits edit event with correct payload when edit button is clicked', async () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: mockEntries,
        modelValue: [],
      },
    });
    const firstEntryActions = wrapper.findAll('li').at(0)!;
    await firstEntryActions.find('button[title="编辑"]').trigger('click');
    expect(wrapper.emitted('edit')).toBeTruthy();
    // @ts-ignore
    expect((wrapper.emitted('edit'))[0][0]).toEqual([[mockEntries][0][0]][0]);
  });

  it('emits delete event with correct payload when delete button is clicked', async () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: mockEntries,
        modelValue: [],
      },
    });
    const firstEntryActions = wrapper.findAll('li').at(0)!;
    await firstEntryActions.find('button[title="删除"]').trigger('click');
    expect(wrapper.emitted('delete')).toBeTruthy();
    // @ts-ignore
    expect((wrapper.emitted('delete'))[0][0]).toEqual([[mockEntries][0][0]][0]);
  });

  it('updates modelValue with correct payload when a checkbox is clicked', async () => {
    const wrapper = mount(PokedexViewList, {
      props: {
        title: '测试标题',
        type,
        entries: mockEntries,
        modelValue: [],
      },
    });
    const checkbox = wrapper.find('input[type="checkbox"]');
    await checkbox.setValue(true);
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    // @ts-ignore
    expect((wrapper.emitted('update:modelValue'))[0][0][0]).toEqual({
      "name": "妖兽一",
      "type": "妖兽",
    });
  });
});