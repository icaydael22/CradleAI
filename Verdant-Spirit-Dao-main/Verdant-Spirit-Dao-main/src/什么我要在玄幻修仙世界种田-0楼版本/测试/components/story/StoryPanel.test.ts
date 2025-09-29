import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import StoryPanel from '../../../components/story/StoryPanel.vue';
import { useStoryStore } from '../../../stores/ui/storyStore';
import { useHistoryStore } from '../../../stores/ui/historyStore';
import { useSettingsStore } from '../../../stores/ui/settingsStore';

describe('StoryPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders story html when not editing and no error', () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: { storyHtml: '<p>故事内容</p>', isEditing: false, hasError: false },
          },
          stubActions: false,
        })],
      },
    });
    expect(wrapper.find('#story-content').html()).toContain('<p>故事内容</p>');
  });

  it('renders textarea when editing', async () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: { isEditing: true, editText: '编辑中的文本' },
          },
          stubActions: false,
        })],
      },
    });
    const textarea = wrapper.find('textarea');
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('编辑中的文本');
  });

  it('shows error message when hasError is true', () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: { hasError: true, isEditing: false },
          },
          stubActions: false,
        })],
      },
    });
    expect(wrapper.text()).toContain('生成或解析内容时出错。');
    expect(wrapper.find('.btn-primary').exists()).toBe(true);
  });

  it('calls storyStore.retryGeneration when retry button is clicked', async () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: { hasError: true, isEditing: false },
          },
          stubActions: false,
        })],
      },
    });
    const storyStore = useStoryStore();
    storyStore.retryGeneration = vi.fn();
    await wrapper.find('.btn-primary').trigger('click');
    expect(storyStore.retryGeneration).toHaveBeenCalled();
  });

  it('displays correct swipe counter text', () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: {
              currentSwipe: 0,
              totalSwipes: 3,
            },
          },
        })],
      },
    });
    expect(wrapper.find('.font-mono').text()).toBe('1 / 3');
  });

  it('calls previousSwipe and nextSwipe when swipe buttons are clicked', async () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: {
              currentSwipe: 1, // Set to 1 to enable the 'previous' button
              totalSwipes: 2,
            },
          },
          stubActions: false,
        })],
      },
    });
    const storyStore = useStoryStore();
    const prevSpy = vi.spyOn(storyStore, 'previousSwipe');
    const nextSpy = vi.spyOn(storyStore, 'nextSwipe');

    await wrapper.find('button[title="上一个回应"]').trigger('click');
    expect(prevSpy).toHaveBeenCalled();

    await wrapper.find('button[title="下一个回应"]').trigger('click');
    expect(nextSpy).toHaveBeenCalled();
  });

  it('disables swipe buttons based on store state', () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: {
              currentSwipe: 0,
              totalSwipes: 1,
              isAiGenerating: true, // for isNextSwipeDisabled
            },
          },
        })],
      },
    });
    expect((wrapper.find('button[title="上一个回应"]').element as HTMLButtonElement).disabled).toBe(true);
    // isNextSwipeDisabled only depends on isAiGenerating
    expect((wrapper.find('button[title="下一个回应"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows spinner when AI is generating', () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({
          initialState: {
            story: { isAiGenerating: true },
          },
        })],
      },
    });
    expect(wrapper.find('.fa-spinner.fa-spin').exists()).toBe(true);
  });

  it('calls historyStore.showModal when history button is clicked', async () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({ stubActions: false })],
      },
    });
    const historyStore = useHistoryStore();
    historyStore.showModal = vi.fn();
    await wrapper.find('button[title="查看历史消息"]').trigger('click');
    expect(historyStore.showModal).toHaveBeenCalled();
  });

  it('calls settingsStore.openModal when settings button is clicked', async () => {
    const wrapper = mount(StoryPanel, {
      global: {
        plugins: [createTestingPinia({ stubActions: false })],
      },
    });
    const settingsStore = useSettingsStore();
    settingsStore.openModal = vi.fn();
    await wrapper.find('button[title="设置"]').trigger('click');
    expect(settingsStore.openModal).toHaveBeenCalled();
  });

  describe('Editing controls', () => {
    it('shows edit button when not editing', () => {
      const wrapper = mount(StoryPanel, {
        global: {
          plugins: [createTestingPinia({ initialState: { story: { isEditing: false } } })],
        },
      });
      expect(wrapper.find('button[title="编辑"]').exists()).toBe(true);
      expect(wrapper.find('button[title="保存"]').exists()).toBe(false);
      expect(wrapper.find('button[title="取消"]').exists()).toBe(false);
    });

    it('shows save and cancel buttons when editing', () => {
      const wrapper = mount(StoryPanel, {
        global: {
          plugins: [createTestingPinia({ initialState: { story: { isEditing: true } } })],
        },
      });
      expect(wrapper.find('button[title="编辑"]').exists()).toBe(false);
      expect(wrapper.find('button[title="保存"]').exists()).toBe(true);
      expect(wrapper.find('button[title="取消"]').exists()).toBe(true);
    });

    it('calls startEditing when edit button is clicked', async () => {
      const wrapper = mount(StoryPanel, {
        global: {
          plugins: [createTestingPinia({ initialState: { story: { isEditing: false } }, stubActions: false })],
        },
      });
      const storyStore = useStoryStore();
      storyStore.startEditing = vi.fn();
      await wrapper.find('button[title="编辑"]').trigger('click');
      expect(storyStore.startEditing).toHaveBeenCalled();
    });

    it('calls saveEditing when save button is clicked', async () => {
      const wrapper = mount(StoryPanel, {
        global: {
          plugins: [createTestingPinia({ initialState: { story: { isEditing: true } }, stubActions: false })],
        },
      });
      const storyStore = useStoryStore();
      storyStore.saveEditing = vi.fn();
      await wrapper.find('button[title="保存"]').trigger('click');
      expect(storyStore.saveEditing).toHaveBeenCalled();
    });

    it('calls cancelEditing when cancel button is clicked', async () => {
      const wrapper = mount(StoryPanel, {
        global: {
          plugins: [createTestingPinia({ initialState: { story: { isEditing: true } }, stubActions: false })],
        },
      });
      const storyStore = useStoryStore();
      storyStore.cancelEditing = vi.fn();
      await wrapper.find('button[title="取消"]').trigger('click');
      expect(storyStore.cancelEditing).toHaveBeenCalled();
    });
  });
});