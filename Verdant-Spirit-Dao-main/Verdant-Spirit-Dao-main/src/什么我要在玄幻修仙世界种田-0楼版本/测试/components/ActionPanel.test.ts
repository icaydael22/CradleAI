import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ActionPanel from '../../components/action/ActionPanel.vue';
import { useActionStore } from '../../stores/ui/actionStore';
import { createTestingPinia } from '@pinia/testing';

describe('ActionPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the owner name correctly', async () => {
    const wrapper = mount(ActionPanel, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const store = useActionStore();
    store.owner = '测试角色';
    await wrapper.vm.$nextTick(); // Wait for the component to re-render
    expect(wrapper.text()).toContain('测试角色的行动选项');
  });

  it('displays action options when available', async () => {
    const wrapper = mount(ActionPanel, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const store = useActionStore();
    store.options = ['行动一', '行动二'];
    await wrapper.vm.$nextTick();

    const options = wrapper.findAll('li');
    expect(options.length).toBe(3); // 2 options + 1 custom action
    const wrapperText = wrapper.text();
    expect(wrapperText).toContain('行动一');
    expect(wrapperText).toContain('行动二');
  });

  it('calls handleOptionClick when an option is clicked', async () => {
    const wrapper = mount(ActionPanel, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const store = useActionStore();
    store.options = ['点击我'];
    await wrapper.vm.$nextTick();

    await wrapper.find('li').trigger('click');
    expect(store.handleOptionClick).toHaveBeenCalledWith('点击我', 0);
  });

  it('calls toggleInputMode when the switch is clicked', async () => {
    const wrapper = mount(ActionPanel, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const store = useActionStore();
    await wrapper.find('.switch input').trigger('change');
    expect(store.toggleInputMode).toHaveBeenCalled();
  });

  it('shows custom action modal and calls confirm', async () => {
    const wrapper = mount(ActionPanel, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const store = useActionStore();
    store.isCustomActionModalVisible = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('textarea').exists()).toBe(true);

    await wrapper.find('textarea').setValue('自定义的一个动作');
    
    const confirmButton = wrapper.findAll('button').find(b => b.text() === '确认行动');
    await confirmButton?.trigger('click');
    
    expect(store.handleCustomActionConfirm).toHaveBeenCalled();
  });

  it('should update the view when store state changes after a swipe', async () => {
    const wrapper = mount(ActionPanel, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const store = useActionStore();

    // 1. Initial state with Message A
    store.owner = '角色A';
    store.options = ['行动A1'];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('角色A');
    expect(wrapper.text()).toContain('行动A1');

    // 2. Simulate a swipe by updating the store's state to Message B
    store.owner = '角色B';
    store.options = ['行动B1', '行动B2'];
    await wrapper.vm.$nextTick();

    // 4. Assert the UI now shows content from Message B
    expect(wrapper.text()).toContain('角色B');
    expect(wrapper.text()).toContain('行动B1');
    expect(wrapper.text()).toContain('行动B2');
  });
});