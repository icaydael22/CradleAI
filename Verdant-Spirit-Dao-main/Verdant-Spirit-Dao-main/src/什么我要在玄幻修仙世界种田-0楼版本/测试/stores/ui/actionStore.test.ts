import { setActivePinia, createPinia } from 'pinia';
import _ from 'lodash';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useActionStore, initializeActionStoreDependencies } from '../../../stores/ui/actionStore';
import type { ChatHistoryManager } from '../../../core/history';
import type { StoryRenderer } from '../../../core/renderer';
import type { Summarizer } from '../../../core/summarizer';
import type { PromptManager } from '../../../core/promptManager';

// Mock core dependencies
const mockStoryRenderer = {} as StoryRenderer;
const mockSummarizer = {} as Summarizer;
const mockPromptManager = {} as PromptManager;

const mockHistoryManager = {
  getLastAssistantMessage: vi.fn(),
} as unknown as ChatHistoryManager;

const mockTriggerActionFn = vi.fn();

describe('useActionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Mock lodash global
    vi.stubGlobal('_', _);
    // Reset mocks before each test
    vi.resetAllMocks();
    // Initialize the store with mock dependencies
    initializeActionStoreDependencies(
      mockStoryRenderer,
      mockHistoryManager,
      mockSummarizer,
      mockPromptManager,
      mockTriggerActionFn
    );
  });

  describe('fetchData', () => {
    it('should parse action options from the last assistant message', async () => {
      const store = useActionStore();
      const mockMessageContent = `
        一些游戏文本...
        <statusbar>
        {
          "状态总览": {
            "行动选项": {
              "🧝‍♀️ 行动人": "测试角色",
              "📜 可选行动": [
                "行动一",
                "行动二"
              ]
            }
          }
        }
        </statusbar>
      `;
      (mockHistoryManager.getLastAssistantMessage as any).mockReturnValue({
        content: mockMessageContent,
      });

      await store.fetchData();

      expect(store.owner).toBe('测试角色');
      expect(store.options).toEqual(['行动一', '行动二']);
    });

    it('should handle cases where no status bar is present', async () => {
      const store = useActionStore();
      (mockHistoryManager.getLastAssistantMessage as any).mockReturnValue({
        content: '这里没有状态栏。',
      });

      await store.fetchData();

      expect(store.owner).toBe('你');
      expect(store.options).toEqual([]);
    });

    it('should handle JSON parsing errors gracefully', async () => {
        const store = useActionStore();
        const mockMessageContent = `
          <statusbar>
          {
            "状态总览": {
              "行动选项": "这是一个无效的格式"
            }
          }
          </statusbar>
        `;
        (mockHistoryManager.getLastAssistantMessage as any).mockReturnValue({
          content: mockMessageContent,
        });
  
        await store.fetchData();
  
        expect(store.owner).toBe('错误');
        expect(store.options).toEqual(['解析JSON失败']);
      });
  });

  describe('handleOptionClick', () => {
    it('should call triggerActionFn with the correct parameters', async () => {
      const store = useActionStore();
      const actionText = '选择这个选项';
      const optionIndex = 1;

      await store.handleOptionClick(actionText, optionIndex);

      expect(mockTriggerActionFn).toHaveBeenCalledOnce();
      expect(mockTriggerActionFn).toHaveBeenCalledWith(
        actionText,
        optionIndex,
        mockStoryRenderer,
        mockHistoryManager,
        mockSummarizer,
        mockPromptManager
      );
    });

    it('should not do anything if isLoading is true', async () => {
        const store = useActionStore();
        store.isLoading = true;
  
        await store.handleOptionClick('some action', 0);
  
        expect(mockTriggerActionFn).not.toHaveBeenCalled();
      });
  });

  describe('handleCustomActionConfirm', () => {
    it('should call triggerActionFn for a custom action', async () => {
        const store = useActionStore();
        const customAction = '做一个自定义动作';
        store.customActionInput = customAction;

        await store.handleCustomActionConfirm();

        expect(mockTriggerActionFn).toHaveBeenCalledOnce();
        expect(mockTriggerActionFn).toHaveBeenCalledWith(
            customAction,
            -1, // Custom actions use index -1
            mockStoryRenderer,
            mockHistoryManager,
            mockSummarizer,
            mockPromptManager
        );
    });
  });

  describe('Event Handling', () => {
    it('should refetch data when uiShouldUpdate event is received', async () => {
      const store = useActionStore();
      
      // 1. Initial state with Message A
      const messageA = { content: '<statusbar>{"行动选项":{"🧝‍♀️ 行动人":"角色A", "📜 可选行动":["行动A1"]}}</statusbar>' };
      (mockHistoryManager.getLastAssistantMessage as any).mockReturnValue(messageA);
      await store.fetchData();
      expect(store.owner).toBe('角色A');
      expect(store.options).toEqual(['行动A1']);

      // 2. Simulate a swipe, historyManager now points to Message B
      const messageB = { content: '<statusbar>{"行动选项":{"🧝‍♀️ 行动人":"角色B", "📜 可选行动":["行动B1"]}}</statusbar>' };
      (mockHistoryManager.getLastAssistantMessage as any).mockReturnValue(messageB);

      // 3. Simulate the event trigger by calling fetchData again, as our manual setup does
      await store.fetchData();

      // 4. Assert the store now holds content from Message B
      expect(store.owner).toBe('角色B');
      expect(store.options).toEqual(['行动B1']);
    });
  });
});