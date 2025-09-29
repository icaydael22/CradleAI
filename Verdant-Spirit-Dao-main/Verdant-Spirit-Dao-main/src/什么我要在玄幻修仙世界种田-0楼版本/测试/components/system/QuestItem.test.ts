import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import QuestItem from '../../../components/system/QuestItem.vue';
import type { Quest } from '../../../stores/systems/questStore';

// 创建一个基础的 mock quest 对象
const createMockQuest = (overrides: Partial<Quest> = {}): Quest => ({
  id: 'test-quest-1',
  名称: '测试任务',
  描述: '这是一个测试任务的描述。',
  状态: '进行中',
  ...overrides,
});

describe('QuestItem.vue', () => {
  it('应该能正确渲染任务的基本信息', () => {
    const quest = createMockQuest();
    const wrapper = mount(QuestItem, {
      props: { quest },
    });

    expect(wrapper.text()).toContain('测试任务');
    expect(wrapper.text()).toContain('这是一个测试任务的描述。');
  });

  it('当任务状态为 "进行中" 时，应该显示详细信息', () => {
    const quest = createMockQuest({
      状态: '进行中',
      目标: [{ 描述: '目标1', 完成: false }],
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });
    // 详细信息区域应该可见
    expect(wrapper.find('.mt-2').exists()).toBe(true);
    expect(wrapper.text()).toContain('目标1');
  });

  it('当任务状态为 "已完成" 时，不应该显示详细信息', () => {
    const quest = createMockQuest({
      状态: '已完成',
      目标: [{ 描述: '目标1', 完成: true }],
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });
    // 详细信息区域（目标、进度等）不应该存在
    expect(wrapper.find('.mt-2').exists()).toBe(false);
  });

  it('应该能正确渲染任务目标', async () => {
    const quest = createMockQuest({
      目标: [
        { 描述: '已完成的目标', 完成: true },
        { 描述: '未完成的目标', 完成: false },
      ],
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });

    const objectives = wrapper.findAll('ul.list-disc li');
    expect(objectives).toHaveLength(2);
    
    const completedObjective = objectives.find(o => o.text() === '已完成的目标');
    expect(completedObjective?.classes()).toContain('line-through');
    expect(completedObjective?.classes()).toContain('text-green-400');

    const inProgressObjective = objectives.find(o => o.text() === '未完成的目标');
    expect(inProgressObjective?.classes()).toContain('text-secondary');
  });

  it('应该能正确渲染进度条', async () => {
    const quest = createMockQuest({
      进度: { label: '收集物品', value: 5, max: 10 },
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });

    expect(wrapper.text()).toContain('收集物品');
    expect(wrapper.text()).toContain('5 / 10');
    const progressBar = wrapper.find('.progress-bar-fg');
    expect(progressBar.attributes('style')).toContain('width: 50%');
  });

  it('应该能正确渲染多个进度条', async () => {
    const quest = createMockQuest({
      进度: [
        { label: '进度A', value: 1, max: 4 },
        { label: '进度B', value: 3, max: 5 },
      ],
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });

    const progressBars = wrapper.findAll('.progress-bar-fg');
    expect(progressBars).toHaveLength(2);
    // `findAll` returns an array, so we need to access elements by index
    expect(progressBars[0].attributes('style')).toContain('width: 25%');
    expect(progressBars[1].attributes('style')).toContain('width: 60%');
  });

  it('应该能正确渲染奖励信息', async () => {
    const quest = createMockQuest({
      奖励: [
        '100 灵石',
        { 名称: '火焰丹', 数量: 2 },
      ],
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });

    expect(wrapper.text()).toContain('奖励');
    const rewards = wrapper.findAll('.mt-2 .pt-2 li');
    expect(rewards).toHaveLength(2);
    // `findAll` returns an array, we map it to get the text of each element
    const rewardsText = rewards.map(r => r.text());
    expect(rewardsText).toContain('100 灵石');
    expect(rewardsText).toContain('火焰丹 x2');
  });

  it('应该能正确渲染条件信息', async () => {
    const quest = createMockQuest({
      条件: ['等级需要达到10级', '必须先完成前置任务'],
    });
    const wrapper = mount(QuestItem, {
      props: { quest },
    });

    const conditions = wrapper.findAll('li.text-yellow-400\\/80');
    expect(conditions).toHaveLength(2);
    const conditionsText = conditions.map(c => c.text());
    expect(conditionsText).toContain('等级需要达到10级');
    expect(conditionsText).toContain('必须先完成前置任务');
  });
});