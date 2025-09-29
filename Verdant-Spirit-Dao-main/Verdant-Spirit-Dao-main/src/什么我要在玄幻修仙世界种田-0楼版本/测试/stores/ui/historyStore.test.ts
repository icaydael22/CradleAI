import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useHistoryStore } from '../../../stores/ui/historyStore';
import type { ChatHistoryManager, Branch } from '../../../core/history';

// Mocking global objects
const mockToastr = {
  warning: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
};
vi.stubGlobal('toastr', mockToastr);

const mockHistoryManager: Partial<ChatHistoryManager> = {
  loadHistory: vi.fn().mockResolvedValue(undefined),
  getBranches: vi.fn().mockReturnValue([]),
  getActiveBranchId: vi.fn().mockReturnValue(null),
  deleteTurn: vi.fn().mockResolvedValue(undefined),
  updateMessagePageContent: vi.fn().mockResolvedValue(undefined),
  getMessagesForPrompt: vi.fn().mockReturnValue([]),
  // @ts-ignore
  history: { branches: {} },
};

const mockStoryRenderer = {
  getHistoryManager: () => mockHistoryManager as ChatHistoryManager,
  init: vi.fn(),
};

// @ts-ignore
global.window.storyRenderer = mockStoryRenderer;
// @ts-ignore
global.CustomEvent = class CustomEvent extends Event {
  detail: any;
  constructor(type: string, options?: CustomEventInit) {
    super(type, options);
    this.detail = options?.detail;
  }
};

describe('useHistoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Reset mock return values to a default state
    mockHistoryManager.getBranches = vi.fn().mockReturnValue([]);
    mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue(null);
    // @ts-ignore
    mockHistoryManager.history = { branches: {} };
    mockHistoryManager.getMessagesForPrompt = vi.fn().mockReturnValue([]);
  });

  it('initializes with correct default values', () => {
    const store = useHistoryStore();
    expect(store.branches).toEqual([]);
    expect(store.activeBranchId).toBeNull();
    expect(store.turns).toEqual([]);
    expect(store.isModalVisible).toBe(false);
    expect(store.activeTab).toBe('messages');
    expect(store.activeBranch).toBeUndefined();
  });

  it('showModal sets visibility and active tab correctly', async () => {
    const store = useHistoryStore();
    // Setup mock data to prevent crash in loadHistoryData
    mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue('main');
    // @ts-ignore
    mockHistoryManager.history = { branches: { main: {} } };

    await store.showModal();
    expect(store.isModalVisible).toBe(true);
    expect(store.activeTab).toBe('messages');
  });

  it('showModal calls loadHistoryData', async () => {
    const store = useHistoryStore();
     // Setup mock data to prevent crash in loadHistoryData
    mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue('main');
     // @ts-ignore
    mockHistoryManager.history = { branches: { main: {} } };
    await store.showModal();
    expect(mockHistoryManager.loadHistory).toHaveBeenCalledOnce();
  });

  it('hideModal sets visibility to false', () => {
    const store = useHistoryStore();
    store.isModalVisible = true;
    store.hideModal();
    expect(store.isModalVisible).toBe(false);
  });

  describe('loadHistoryData', () => {
    it('loads branches, active branch, and turns from the manager', async () => {
      const store = useHistoryStore();
      const mockBranches: Branch[] = [{ id: 'main', name: 'Main Branch', isActive: true, lastModified: Date.now(), messageCount: 2 }];
      const mockTurns = {
        0: { id: 'turn0', messages: [{ id: 'msg0', content: 'Hello' }] },
        1: { id: 'turn1', messages: [{ id: 'msg1', content: 'World' }] },
      };

      mockHistoryManager.getBranches = vi.fn().mockReturnValue(mockBranches);
      mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue('main');
      // @ts-ignore
      mockHistoryManager.history = { branches: { main: mockTurns } };

      await store.loadHistoryData();

      expect(mockHistoryManager.loadHistory).toHaveBeenCalledOnce();
      expect(store.branches).toEqual(mockBranches);
      expect(store.activeBranchId).toBe('main');
      expect(store.turns).toHaveLength(2);
      expect(store.turns).toEqual(expect.arrayContaining([
        expect.objectContaining({ turnIndex: 0 }),
        expect.objectContaining({ turnIndex: 1 }),
      ]));
    });
  });

  it('deleteTurn calls manager and reloads data', async () => {
    const store = useHistoryStore();
    const mockConfirm = vi.fn(() => true);
    const mockRenderer = { init: vi.fn() };

    // Setup mock data for the subsequent loadHistoryData call
    mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue('main');
    // @ts-ignore
    mockHistoryManager.history = { branches: { main: {} } };

    await store.deleteTurn(5, mockConfirm, mockRenderer as any);

    expect(mockConfirm).toHaveBeenCalledWith('确定要删除第 6 回合吗？\n此操作在当前分支上不可逆！');
    expect(mockHistoryManager.deleteTurn).toHaveBeenCalledWith(5);
    expect(mockToastr.success).toHaveBeenCalledWith('回合已成功删除！');
    expect(mockHistoryManager.loadHistory).toHaveBeenCalledOnce();
    expect(mockRenderer.init).toHaveBeenCalledOnce();
  });

  it('deleteTurn does not proceed if user cancels', async () => {
    const store = useHistoryStore();
    const mockConfirm = vi.fn(() => false);

    await store.deleteTurn(5, mockConfirm);

    expect(mockHistoryManager.deleteTurn).not.toHaveBeenCalled();
    expect(mockToastr.success).not.toHaveBeenCalled();
  });

  it('updateMessageContent calls manager, dispatches event, and reloads data', async () => {
    const store = useHistoryStore();
    const lastMessage = { id: 'last-msg' };
    mockHistoryManager.getMessagesForPrompt = vi.fn().mockReturnValue([ {id: 'first-msg'}, lastMessage ]);
    mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue('main');
    // @ts-ignore
    mockHistoryManager.history = { branches: { main: {} } };
    const mockDispatchEvent = vi.fn();

    await store.updateMessageContent('msg1', 'new content', mockDispatchEvent);

    expect(mockHistoryManager.updateMessagePageContent).toHaveBeenCalledWith('msg1', 'new content');
    expect(mockDispatchEvent).toHaveBeenCalledOnce();
    
    const dispatchedEvent = mockDispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(dispatchedEvent.type).toBe('branchChanged');
    expect(dispatchedEvent.detail).toEqual({ targetMessageId: lastMessage.id });

    expect(mockToastr.success).toHaveBeenCalledWith('消息已保存！正在重新计算状态...');
    expect(mockHistoryManager.loadHistory).toHaveBeenCalledOnce();
  });

  it('shows warning if no last message is found after updating content', async () => {
    const store = useHistoryStore();
    mockHistoryManager.getMessagesForPrompt = vi.fn().mockReturnValue([]); // No messages
    // Setup mock data to prevent crash in loadHistoryData
    mockHistoryManager.getActiveBranchId = vi.fn().mockReturnValue('main');
    // @ts-ignore
    mockHistoryManager.history = { branches: { main: {} } };

    await store.updateMessageContent('msg1', 'new content');

    expect(mockHistoryManager.updateMessagePageContent).toHaveBeenCalledWith('msg1', 'new content');
    expect(mockToastr.warning).toHaveBeenCalledWith('消息已保存，但无法找到最新消息来进行状态重算。');
    expect(mockHistoryManager.loadHistory).toHaveBeenCalledOnce();
  });

  // --- Branch functions are not yet implemented, tests are commented out ---
  /*
  it('switchBranch shows a warning toast', async () => {
    const store = useHistoryStore();
    await store.switchBranch('branch-id', 'Branch Name');
    expect(mockToastr.warning).toHaveBeenCalledWith('分支功能暂未开放，敬请期待！');
  });

  it('renameBranch shows a warning toast', async () => {
    const store = useHistoryStore();
    await store.renameBranch('branch-id', 'Old Name');
    expect(mockToastr.warning).toHaveBeenCalledWith('分支功能暂未开放，敬请期待！');
  });

  it('deleteBranch shows a warning toast', async () => {
    const store = useHistoryStore();
    await store.deleteBranch('branch-id', 'Branch Name');
    expect(mockToastr.warning).toHaveBeenCalledWith('分支功能暂未开放，敬请期待！');
  });

  it('createBranchFromTurn shows a warning toast', async () => {
    const store = useHistoryStore();
    await store.createBranchFromTurn(3);
    expect(mockToastr.warning).toHaveBeenCalledWith('分支功能暂未开放，敬请期待！');
  });
  */
});