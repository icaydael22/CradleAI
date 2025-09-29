import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import SignInPanel from '@/components/system/SignInPanel.vue';
import { useSignInStore } from '@/stores/systems/signInStore';
import { useItemStore } from '@/stores/facades/itemStore';
import RetroactiveSignInPanel from '@/components/system/RetroactiveSignInPanel.vue';

describe('SignInPanel.vue', () => {
  const createWrapper = (storeOverrides: any = {}) => {
    const pinia = createTestingPinia({
      stubActions: false,
    });

    const store = useSignInStore(pinia);

    // Default values for all computed properties and state
    const defaultStoreState = {
      isLoading: false,
      currentDate: { 年: 1, 月: 5, 日: 4 },
      systemName: '签到系统',
      hasSignedInToday: false,
      consecutiveDays: 0,
      monthlyCard: { 状态: '未激活', 剩余天数: 0 },
      calendarData: { year: 1, month: 5, days: [] },
      ...storeOverrides,
    };

    // Override the store's properties
    Object.assign(store, defaultStoreState);

    // Spy on actions
    vi.spyOn(store, 'signIn').mockImplementation(async () => {});
    vi.spyOn(store, 'activateMonthlyCard').mockImplementation(async () => {});

    const wrapper = mount(SignInPanel, {
      global: {
        plugins: [pinia],
        stubs: {
          RetroactiveSignInPanel: {
            template: '<div data-testid="retroactive-panel-mock">Retroactive Panel Mock</div>',
          },
        },
      },
    });
    return { wrapper, store };
  };

  it('renders loading state correctly', () => {
    const { wrapper } = createWrapper({ isLoading: true });
    expect(wrapper.text()).toContain('正在加载签到数据...');
  });

  it('renders error state when date is not available', () => {
    const { wrapper } = createWrapper({ currentDate: null });
    expect(wrapper.text()).toContain('无法获取当前游戏日期');
  });

  it('renders calendar and stats correctly', () => {
    const { wrapper } = createWrapper({
      systemName: '签到系统',
      calendarData: {
        year: 1,
        month: 5,
        days: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, isToday: false, isSignedIn: false })),
      },
      consecutiveDays: 3,
      monthlyCard: { 状态: '未激活', 剩余天数: 0 },
    });
    expect(wrapper.text()).toContain('🗓️ 签到系统');
    expect(wrapper.text()).toContain('第1年 - 第5月');
    expect(wrapper.findAll('.grid-cols-7 > div').length).toBe(30);
    expect(wrapper.text()).toContain('连续签到: 3 天');
    expect(wrapper.text()).toContain('月卡状态: 未激活');
  });

  it('displays today and signed-in days with correct classes', () => {
    const { wrapper } = createWrapper({
      calendarData: {
        year: 1,
        month: 5,
        days: [
          { day: 3, isToday: false, isSignedIn: true },
          { day: 4, isToday: true, isSignedIn: false },
        ],
      },
    });
    const days = wrapper.findAll('.grid-cols-7 > div');
    const day3 = days[0];
    const day4 = days[1];

    expect(day3.classes()).toContain('bg-green-500/50');
    expect(day3.find('i.fa-check').exists()).toBe(true);
    expect(day3.attributes('title')).toBe('第3天：已签到');

    expect(day4.classes()).toContain('ring-2');
    expect(day4.classes()).toContain('bg-accent/30');
    expect(day4.text()).toBe('4');
    expect(day4.attributes('title')).toBe('第4天：未签到');
  });

  it('calls store.signIn when "今日签到" button is clicked', async () => {
    const { wrapper, store } = createWrapper({ hasSignedInToday: false });
    const signInButton = wrapper.find('button.btn-primary');
    expect(signInButton.text()).toContain('今日签到');
    expect((signInButton.element as HTMLButtonElement).disabled).toBe(false);

    await signInButton.trigger('click');
    expect(store.signIn).toHaveBeenCalledTimes(1);
  });

  it('disables sign-in button when already signed in today', () => {
    const { wrapper } = createWrapper({ hasSignedInToday: true });
    const signInButton = wrapper.find('button.btn-primary');
    expect(signInButton.text()).toContain('今日已签到');
    expect((signInButton.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows and calls activate monthly card button', async () => {
    const { wrapper, store } = createWrapper({ monthlyCard: { 状态: '未激活' } });
    const activateButton = wrapper.find('button[title="向AI询问激活月卡的条件"]');
    expect(activateButton.exists()).toBe(true);
    expect(activateButton.text()).toBe('激活');

    await activateButton.trigger('click');
    expect(store.activateMonthlyCard).toHaveBeenCalledTimes(1);
  });

  it('hides activate button when monthly card is active', () => {
    const { wrapper } = createWrapper({ monthlyCard: { 状态: '已激活', 剩余天数: 25 } });
    const activateButton = wrapper.find('button[title="向AI询问激活月卡的条件"]');
    expect(activateButton.exists()).toBe(false);
    expect(wrapper.text()).toContain('激活中 (剩余25天)');
  });

  it('toggles the retroactive sign-in panel', async () => {
    const { wrapper } = createWrapper();
    const toggleButton = wrapper.find('button.btn-secondary');

    expect(wrapper.find('[data-testid="retroactive-panel-mock"]').exists()).toBe(false);
    expect(toggleButton.text()).toContain('打开补签');

    await toggleButton.trigger('click');
    expect(wrapper.find('[data-testid="retroactive-panel-mock"]').exists()).toBe(true);
    expect(toggleButton.text()).toContain('关闭补签');

    await toggleButton.trigger('click');
    expect(wrapper.find('[data-testid="retroactive-panel-mock"]').exists()).toBe(false);
    expect(toggleButton.text()).toContain('打开补签');
  });
});

describe('RetroactiveSignInPanel.vue', () => {
  const mountComponent = (itemStoreState: any = {}, signInStoreState: any = {}) => {
    const pinia = createTestingPinia({
      stubActions: false,
    });
    setActivePinia(pinia);

    // Mock itemStore
    const itemStore = useItemStore(pinia);
    // @ts-ignore
    itemStore.items = itemStoreState.items || [];

    // Mock signInStore
    const signInStore = useSignInStore(pinia);
    const defaultSignInState = {
      calendarData: { year: 0, month: 0, days: [] },
      ...signInStoreState,
    };
    Object.assign(signInStore, defaultSignInState);

    const retroSignInSpy = vi.spyOn(signInStore, 'retroactiveSignIn').mockImplementation(async () => {});

    const wrapper = mount(RetroactiveSignInPanel, {
      global: {
        plugins: [pinia],
      },
    });

    return { wrapper, retroSignInSpy };
  };

  it('displays the correct number of retro cards', () => {
    const { wrapper } = mountComponent({ items: [{ 名称: '补签卡', 数量: 5 }] });
    expect(wrapper.text()).toContain('你当前拥有 5 张补签卡。');
  });

  it('shows days that can be retroactively signed', () => {
    const { wrapper } = mountComponent({}, {
      calendarData: {
        year: 1,
        month: 1,
        days: [
          { day: 1, isSignedIn: true, isToday: false },
          { day: 2, isSignedIn: false, isToday: false },
          { day: 3, isSignedIn: false, isToday: true },
          { day: 4, isSignedIn: false, isToday: false },
        ],
      },
    });
    const days = wrapper.findAll('.grid-cols-7 > div');
    expect(days.length).toBe(2); // Day 2 and 4
    const dayTexts = days.map(d => d.text());
    expect(dayTexts).toContain('2');
    expect(dayTexts).toContain('4');
  });

  it('selects a day on click and updates button text', async () => {
    const { wrapper } = mountComponent(
      { items: [{ 名称: '补签卡', 数量: 1 }] },
      {
        calendarData: {
          year: 1,
          month: 1,
          days: [{ day: 5, isSignedIn: false, isToday: false }],
        },
      }
    );
    const dayButton = wrapper.find('.grid-cols-7 > div');
    const actionButton = wrapper.find('button.btn-primary');

    expect(actionButton.text()).toBe('请选择补签日期');
    expect((actionButton.element as HTMLButtonElement).disabled).toBe(true);

    await dayButton.trigger('click');

    expect(dayButton.classes()).toContain('bg-accent');
    expect(actionButton.text()).toBe('消耗补签卡 (补签第 5 天)');
    expect((actionButton.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls retroactiveSignIn action when button is clicked', async () => {
    const { wrapper, retroSignInSpy } = mountComponent(
      { items: [{ 名称: '补签卡', 数量: 1 }] },
      {
        calendarData: {
          year: 1,
          month: 5,
          days: [{ day: 10, isSignedIn: false, isToday: false }],
        },
      }
    );

    await wrapper.find('.grid-cols-7 > div').trigger('click'); // Select day 10
    await wrapper.find('button.btn-primary').trigger('click');

    expect(retroSignInSpy).toHaveBeenCalledTimes(1);
    expect(retroSignInSpy).toHaveBeenCalledWith('第1年5月10日');
  });

  it('disables button if no retro cards are available', () => {
    const { wrapper } = mountComponent(
      { items: [] }, // No cards
      {
        calendarData: {
          year: 1,
          month: 1,
          days: [{ day: 5, isSignedIn: false, isToday: false }],
        },
      }
    );
    const actionButton = wrapper.find('button.btn-primary');

    expect(wrapper.text()).toContain('你当前拥有 0 张补签卡。');
    expect(actionButton.text()).toBe('补签卡不足');
    expect((actionButton.element as HTMLButtonElement).disabled).toBe(true);
  });
});