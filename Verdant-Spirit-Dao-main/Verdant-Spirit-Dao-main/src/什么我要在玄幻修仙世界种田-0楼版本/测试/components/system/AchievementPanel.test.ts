import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import AchievementPanel from '@/components/system/AchievementPanel.vue';
import { useAchievementStore } from '../../../stores/systems/achievementStore';
import { useDetailsStore } from '../../../stores/ui/detailsStore';
import { useTimeStore } from '../../../stores/systems/timeStore';
import { useWorldStore } from '../../../stores/core/worldStore'

// Mock the details store
const mockShowDetails = vi.fn();
vi.mock('../../../stores/ui/detailsStore', () => ({
  useDetailsStore: () => ({
    showDetails: mockShowDetails,
  }),
}));

describe('AchievementPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockShowDetails.mockClear();
  });

  const mockCompletedAchievements = {
    ach1: { id: 'ach1', 名称: '初出茅庐', 描述: '完成第一个任务', 完成时间: '第1天' },
    ach2: { id: 'ach2', 名称: '小有成就', 描述: '完成十个任务', 完成时间: '第10天' },
  };

  const mockRewards = [
    { id: 'rew1', 名称: '灵石', 描述: '一块普通的灵石', 消耗点数: 10, 库存: 5 },
    { id: 'rew2', 名称: '丹药', 描述: '一瓶疗伤丹药', 消耗点数: 50, 库存: 1 },
    { id: 'rew3', 名称: '法宝', 描述: '一件下品法宝', 消耗点数: 100, 库存: 0 },
  ];

  const mockAchievementState = {
    成就点数: 100,
    completed: mockCompletedAchievements,
    奖励列表: mockRewards,
    上次刷新天数: 0,
  };

  it('renders loading state when achievement data is null', () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: {
              world: {
                成就: null, // Simulate loading state
              },
            },
          },
        })],
      },
    });
    expect(wrapper.text()).toContain('正在加载成就数据...');
  });

  it('renders panel with correct initial data', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: { world: { 成就: mockAchievementState } },
            time: { day: 1 },
          },
        })],
      },
    });

    await wrapper.vm.$nextTick();

    expect(wrapper.find('h3').text()).toContain('成就系统');
    expect(wrapper.find('.text-accent').text()).toContain('100');
    expect(wrapper.find('#achievement-tab-achievements').classes()).toContain('active');

    const achievements = wrapper.findAll('#achievement-tab-achievements li');
    expect(achievements.length).toBe(2);
    const achievementsText = wrapper.find('#achievement-tab-achievements').text();
    expect(achievementsText).toContain('初出茅庐');
    expect(achievementsText).toContain('小有成就');
  });

  it('switches to rewards tab on click', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: { world: { 成就: mockAchievementState } },
            time: { day: 1 },
          },
        })],
      },
    });

    await wrapper.find('button[aria-label="奖励"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#achievement-tab-rewards').classes()).toContain('active');
    const rewards = wrapper.findAll('#achievement-tab-rewards li');
    expect(rewards.length).toBe(3);
    const rewardsText = wrapper.find('#achievement-tab-rewards').text();
    expect(rewardsText).toContain('灵石');
  });

  it('calls detailsStore.showDetails when an achievement is clicked', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: { world: { 成就: mockAchievementState } },
          },
        })],
      },
    });

    await wrapper.find('#achievement-tab-achievements li').trigger('click');
    expect(mockShowDetails).toHaveBeenCalledTimes(1);
    expect(mockShowDetails).toHaveBeenCalledWith(mockCompletedAchievements.ach1);
  });

  it('calls store.redeemReward when redeem button is clicked', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          stubActions: false,
          initialState: {
            world: { world: { 成就: mockAchievementState } },
          },
        })],
      },
    });
    const store = useAchievementStore();
    store.redeemReward = vi.fn();

    await wrapper.find('button[aria-label="奖励"]').trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.find('.redeem-btn').trigger('click');
    expect(store.redeemReward).toHaveBeenCalledTimes(1);
    expect(store.redeemReward).toHaveBeenCalledWith('rew1');
  });

  it('disables redeem button based on points and stock', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: {
             world: {
               成就: {
                 ...mockAchievementState,
                 成就点数: 40,
               },
             },
           },
         },
        })],
      },
    });

    await wrapper.find('button[aria-label="奖励"]').trigger('click');
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('.redeem-btn');
    expect(buttons.length).toBe(3);

    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(false);
    expect(buttons[0].text()).toBe('兑换');

    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[1].text()).toBe('兑换');

    expect((buttons[2].element as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[2].text()).toBe('无货');
  });

  it('calls store.refreshRewards and handles disabled state', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          stubActions: false,
          initialState: {
            world: {
              world: {
                成就: { ...mockAchievementState, 上次刷新天数: 0, 奖励列表: [] },
                时间: { day: 13 },
              },
            },
          },
        })],
      },
    });
    const achievementStore = useAchievementStore();
    achievementStore.refreshRewards = vi.fn();
    const worldStore = useWorldStore();

    // Switch to rewards tab
    await wrapper.find('button[aria-label="奖励"]').trigger('click');
    await wrapper.vm.$nextTick();

    const refreshBtn = wrapper.find('#refresh-rewards-btn');

    // Initially at Day 13: Button should be disabled
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(refreshBtn.text()).toContain('还需 1 天');

    // Advance to Day 14: Button should be enabled
    // @ts-ignore
    worldStore.world!.时间.day = 14;
    await wrapper.vm.$nextTick();
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(false);
    expect(refreshBtn.text()).toContain('刷新奖励列表');

    // Click refresh
    await refreshBtn.trigger('click');
    expect(achievementStore.refreshRewards).toHaveBeenCalledTimes(1);
  });

  it('shows message when no achievements or rewards are available', async () => {
    const wrapper = mount(AchievementPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            world: {
              world: {
                成就: {
                  成就点数: 0,
                  completed: {},
                  奖励列表: [],
                },
              },
            },
          },
        })],
      },
    });

    expect(wrapper.text()).toContain('尚未解锁任何成就。');

    await wrapper.find('button[aria-label="奖励"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('当前没有可兑换的奖励。');
  });
});