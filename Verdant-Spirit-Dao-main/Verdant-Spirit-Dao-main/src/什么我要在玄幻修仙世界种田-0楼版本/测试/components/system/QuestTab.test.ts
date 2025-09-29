import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import QuestTab from '../../../components/system/QuestTab.vue';
import { useWorldStore } from '../../../stores/core/worldStore';
import type { Quest } from '../../../stores/systems/questStore';

// Mock QuestItem component
const QuestItemMock = {
  template: '<li class="quest-item-mock">{{ quest.名称 }}</li>',
  props: ['quest'],
};

// Helper to create mock quests
const createMockQuest = (id: string, name: string, status: Quest['状态']): Quest => ({
  id,
  名称: name,
  描述: `Description for ${name}`,
  状态: status,
});

const allQuests: Quest[] = [
  createMockQuest('ongoing-1', 'Ongoing Quest 1', '进行中'),
  createMockQuest('ongoing-2', 'Ongoing Quest 2', '进行中'),
  createMockQuest('completed-1', 'Completed Quest 1', '已完成'),
  createMockQuest('completed-2', 'Completed Quest 2', '已完成'),
  createMockQuest('completed-3', 'Completed Quest 3', '已完成'),
  createMockQuest('not-completed-1', 'NotCompleted Quest 1', '未完成'),
];

describe('QuestTab.vue', () => {
  const createWrapper = (quests: Quest[] = []) => {
    const pinia = createTestingPinia({ stubActions: false });
    const worldStore = useWorldStore(pinia);
    
    // Quest data is derived from worldStore, so we set it there.
    worldStore.world = {
      ...worldStore.world,
      任务列表: quests,
    };

    return mount(QuestTab, {
      global: {
        plugins: [pinia],
        stubs: {
          QuestItem: QuestItemMock,
        },
      },
    });
  };

  it('应该能正确渲染初始状态和各个标签页的任务数量', async () => {
    const wrapper = createWrapper(allQuests);

    // 验证标签文本和数量
    const tabsContainer = wrapper.find('.quest-tabs');
    const textContent = tabsContainer.text();
    expect(textContent).toContain('进行中');
    expect(textContent).toContain('2');
    expect(textContent).toContain('已完成');
    expect(textContent).toContain('3');
    expect(textContent).toContain('未完成');
    expect(textContent).toContain('1');
    expect(textContent).toContain('失败');
    expect(textContent).toContain('0');

    // 默认显示 "进行中" 标签页
    expect(wrapper.findAll('.quest-item-mock')).toHaveLength(2);
    expect(wrapper.text()).toContain('Ongoing Quest 1');
  });

  it('点击标签页时应该能切换到对应的内容', async () => {
    const wrapper = createWrapper(allQuests);

    // 初始状态
    expect(wrapper.findAll('.quest-item-mock')).toHaveLength(2);

    // 点击 "已完成" 标签页
    const completedTabButton = wrapper.findAll('.quest-tab-btn').find(b => b.text().includes('已完成'));
    await completedTabButton?.trigger('click');

    // 验证内容已切换
    expect(wrapper.findAll('.quest-item-mock')).toHaveLength(3);
    expect(wrapper.text()).toContain('Completed Quest 1');
    expect(wrapper.text()).toContain('Completed Quest 2');
  });

  it('在搜索框输入内容时应该能正确过滤任务列表', async () => {
    const wrapper = createWrapper([
      createMockQuest('q1', '收集草药', '进行中'),
      createMockQuest('q2', '击败史莱姆', '进行中'),
    ]);

    expect(wrapper.findAll('.quest-item-mock')).toHaveLength(2);

    // 模拟输入
    const searchInput = wrapper.find('input[type="search"]');
    await searchInput.setValue('草药');

    // 验证列表已被过滤
    expect(wrapper.findAll('.quest-item-mock')).toHaveLength(1);
    expect(wrapper.text()).toContain('收集草药');
    expect(wrapper.text()).not.toContain('击败史莱姆');
  });

  it('当某个分类下没有任务时，应该显示提示信息', async () => {
    const wrapper = createWrapper([createMockQuest('ongoing-1', 'Ongoing Quest 1', '进行中')]);

    // 点击 "已完成" 标签页
    const completedTabButton = wrapper.findAll('.quest-tab-btn').find(b => b.text().includes('已完成'));
    await completedTabButton?.trigger('click');

    expect(wrapper.findAll('.quest-item-mock')).toHaveLength(0);
    expect(wrapper.text()).toContain('该分类下没有任务。');
  });
});