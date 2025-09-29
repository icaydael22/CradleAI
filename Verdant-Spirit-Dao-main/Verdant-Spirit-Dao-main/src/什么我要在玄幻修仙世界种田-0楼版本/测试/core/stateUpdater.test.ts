import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import _ from 'lodash';
import { recalculateAndApplyState } from '../../core/stateUpdater';
import { ChatHistoryManager } from '../../core/history';
import { useWorldStore } from '../../stores/core/worldStore';
import { useCharacterStore } from '../../stores/facades/characterStore';
import { useEventLogStore } from '../../stores/core/eventLogStore';
import * as variables from '../../core/variables';

// Mocking dependencies
vi.mock('../../core/logger', () => ({
  logger: vi.fn(),
}));

vi.mock('../../core/variables');
vi.mock('../../stores/core/worldStore');
vi.mock('../../stores/facades/characterStore');
vi.mock('../../stores/core/eventLogStore');

vi.mock('../../core/utils', () => ({
    findNonCloneable: vi.fn(() => []),
}));

// Mock global objects
// @ts-ignore
global._ = _; // Use real lodash
// @ts-ignore
global.toastr = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
};
// @ts-ignore
global.getChatMessages = vi.fn();


describe('stateUpdater: recalculateAndApplyState', () => {
    let mockGetVariables: Mock;
    let mockGetRecalculationInputs: Mock;
    let mockOverwriteAllChatVariables: Mock;
    let mockSaveStateSnapshot: Mock;

    let mockWorldStore: any;
    let mockCharacterStore: any;
    let mockEventLogStore: any;

    const mockHistoryManager = {
        getRawHistory: () => ({ metadata: { 'msg_test_001': { branchId: 'main' } } }),
        getMessageIndex: () => 21, // Simulate being past snapshot threshold
        getActiveMessagesUntil: () => [],
    } as unknown as ChatHistoryManager;
    const targetMessageId = 'msg_test_001';

    beforeEach(() => {
        vi.resetAllMocks();

        mockGetVariables = vi.mocked(variables.getVariables);
        mockGetRecalculationInputs = vi.mocked(variables.getRecalculationInputs);
        mockOverwriteAllChatVariables = vi.mocked(variables.overwriteAllChatVariables);
        mockSaveStateSnapshot = vi.mocked(variables.saveStateSnapshot);
        
        const mockUseWorldStore = vi.mocked(useWorldStore);
        const mockUseCharacterStore = vi.mocked(useCharacterStore);
        const mockUseEventLogStore = vi.mocked(useEventLogStore);

        mockWorldStore = {
            world: {},
            _dangerouslySetState: vi.fn(),
            _dangerouslyProcessEvents: vi.fn(),
        };
        mockCharacterStore = {
            characters: {},
        };
        mockEventLogStore = {
            addEvents: vi.fn(),
        };

        mockUseWorldStore.mockReturnValue(mockWorldStore as any);
        mockUseCharacterStore.mockReturnValue(mockCharacterStore as any);
        mockUseEventLogStore.mockReturnValue(mockEventLogStore as any);
    });

    it('should successfully recalculate from genesis state when no snapshots exist', async () => {
        // Arrange
        const genesisState = {
            世界: { 初始状态: { '世界': {}, '角色': { '主角': { '姓名': '初始主角' } } } },
            角色: { '主角': { 姓名: '初始主角' } },
            备份: { 初始状态备份: { '世界': {}, '角色': { '主角': { '姓名': '初始主角' } } } },
        };
        const eventsToReplay = [{ type: '属性变化', payload: { character: '主角', property: '等级', value: 2 } }];
        
        const finalCalculatedWorldState = _.cloneDeep(genesisState.世界);
        const finalCalculatedCharacterState = { '主角': { 姓名: '初始主角', 等级: 2 } };

        const finalStateForReturn = {
            '世界': finalCalculatedWorldState,
            '角色': finalCalculatedCharacterState,
            '备份': genesisState.备份,
        };
       
        mockGetVariables
            .mockReturnValueOnce(_.cloneDeep(genesisState))
            .mockReturnValueOnce(_.cloneDeep(genesisState))
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn))
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn));

        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(genesisState), eventsToReplay });
        
        mockWorldStore.world = finalCalculatedWorldState;
        mockCharacterStore.characters = finalCalculatedCharacterState;

        // Act
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        expect(mockWorldStore._dangerouslySetState).toHaveBeenCalledWith({ ...genesisState.世界, 角色: genesisState.角色 });
        expect(mockWorldStore._dangerouslyProcessEvents).toHaveBeenCalledWith(eventsToReplay);
        expect(mockOverwriteAllChatVariables).toHaveBeenCalledTimes(1);
        
        const finalStateWritten = mockOverwriteAllChatVariables.mock.calls[0][0];
        expect(finalStateWritten['世界']).toEqual(finalCalculatedWorldState);
        expect(finalStateWritten['角色']).toEqual(finalCalculatedCharacterState);
        expect(finalStateWritten['备份']).toEqual(genesisState.备份);
        expect(finalStateWritten['世界']['初始状态']).toEqual(genesisState.世界.初始状态);
        expect(toastr.success).toHaveBeenCalledWith('游戏状态已同步至当前消息页。');
        expect(result).toEqual(finalStateForReturn);
    });

    it('should recalculate from the latest snapshot (L2 cache) if available', async () => {
        // Arrange
        const snapshotState = {
            世界: { 初始状态: { 世界: {}, 角色: {} }, 状态快照: { main: { 'msg_snapshot_020': { '角色': { '姓名': '快照主角', '等级': 10 } } } } as Record<string, any> },
            角色: { '主角': { '姓名': '快照主角', '等级': 10 } },
            备份: { 初始状态备份: {} },
        };
        const eventsToReplay = [{ type: '属性变化', payload: { character: '主角', property: '等级', value: 11 } }];
        
        const finalCalculatedCharacterState = { '主角': { '姓名': '快照主角', '等级': 11 } };
        const finalCalculatedWorldState = _.cloneDeep(snapshotState.世界);
        finalCalculatedWorldState.状态快照.main = {}; // 预期快照被清空，而不是删除

        const finalStateForReturn = {
            '世界': finalCalculatedWorldState,
            '角色': finalCalculatedCharacterState,
            '备份': snapshotState.备份,
        };

        mockGetVariables
            .mockReturnValueOnce(_.cloneDeep(snapshotState))
            .mockReturnValueOnce(_.cloneDeep(snapshotState))
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn))
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn));
        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(snapshotState), eventsToReplay });
        mockWorldStore.world = finalCalculatedWorldState;
        mockCharacterStore.characters = finalCalculatedCharacterState;

        // Act
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        expect(mockWorldStore._dangerouslySetState).toHaveBeenCalledWith({ ...snapshotState.世界, 角色: snapshotState.角色 });
        expect(mockWorldStore._dangerouslyProcessEvents).toHaveBeenCalledWith(eventsToReplay);
        
        const finalStateWritten = mockOverwriteAllChatVariables.mock.calls[0][0];
        expect(finalStateWritten['角色']).toEqual(finalCalculatedCharacterState);
        expect(finalStateWritten['世界']['状态快照']['main']).toEqual({});
        expect(toastr.success).toHaveBeenCalledWith('游戏状态已同步至当前消息页。');
        expect(result).toEqual(finalStateForReturn);
    });

    it('should recover from backup (L3 cache) if initial state is missing', async () => {
        // Arrange
        const stateWithoutInitial: any = {
            世界: {},
            角色: { '主角': { 姓名: 'some dude' } },
            备份: { 初始状态备份: { '世界': {}, '角色': { '主角': { '姓名': '备份主角' } } } },
        };
        const recoveredState = _.cloneDeep(stateWithoutInitial);
        _.set(recoveredState, '世界.初始状态', stateWithoutInitial.备份.初始状态备份);

        const eventsToReplay = [{ type: '属性变化', payload: { character: '主角', property: '等级', value: 2 } }];
        
        const finalCharacterState = { '主角': { 姓名: '备份主角', 等级: 2 } };
        const finalWorldState = { 初始状态: recoveredState.世界.初始状态 };
        const finalStateForReturn = {
            '世界': finalWorldState,
            '角色': finalCharacterState,
            '备份': recoveredState.备份,
        };

        mockGetVariables
            .mockReturnValueOnce(_.cloneDeep(stateWithoutInitial))
            .mockReturnValueOnce(_.cloneDeep(recoveredState))
            .mockReturnValueOnce(_.cloneDeep(recoveredState))
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn))
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn));

        vi.mocked(global.getChatMessages).mockResolvedValue([{ id: 'genesis_msg', role: 'assistant', content: '...', variables: {
            '世界': { '初始状态': stateWithoutInitial.备份.初始状态备份 },
            '备份': stateWithoutInitial.备份,
        } } as any]);
        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(recoveredState), eventsToReplay });
        mockWorldStore.world = finalWorldState;
        mockCharacterStore.characters = finalCharacterState;

        // Act
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        expect(toastr.warning).toHaveBeenCalledWith('检测到并已自动修复了严重的状态数据丢失问题。');
        expect(mockOverwriteAllChatVariables).toHaveBeenCalledTimes(2);
        expect(mockWorldStore._dangerouslySetState).toHaveBeenCalledWith({ ...recoveredState.世界, 角色: recoveredState.角色 });
        expect(result).toEqual(finalStateForReturn);
    });

    it('should create a snapshot periodically at turn 20', async () => {
        // Arrange
        const state = {
            世界: { 初始状态: {}, 状态快照: {} },
            角色: {},
            备份: { 初始状态备份: {} },
        };
        // Simulate the sequence of getVariables calls within a standard recalculation
        mockGetVariables
            .mockReturnValueOnce(_.cloneDeep(state)) // initialVars
            .mockReturnValueOnce(_.cloneDeep(state)) // currentVars
            .mockReturnValueOnce(_.cloneDeep(state)) // writtenState
            .mockReturnValueOnce(_.cloneDeep(state)); // finalVars for return
        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(state), eventsToReplay: [] });
        
        const historyManagerWithSnapshotTurn = {
            ...mockHistoryManager,
            getMessageIndex: () => 20, // Exactly at snapshot turn
        } as unknown as ChatHistoryManager;

        // Act
        await recalculateAndApplyState(historyManagerWithSnapshotTurn, targetMessageId);

        // Assert
        expect(mockSaveStateSnapshot).toHaveBeenCalledTimes(1);
        expect(mockSaveStateSnapshot).toHaveBeenCalledWith(targetMessageId, expect.any(Object), historyManagerWithSnapshotTurn);
    });

    it('should retroactively create snapshots if they are missing', async () => {
        // Arrange
        const state = {
            世界: { 初始状态: {}, 状态快照: { main: {} } },
            角色: {},
            备份: { 初始状态备份: {} },
        };
        mockGetVariables.mockReturnValue(_.cloneDeep(state));
        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(state), eventsToReplay: [] });
        
        const mockMessages = Array.from({ length: 45 }, (_, i) => ({ id: `msg_${i}` } as any));

        const historyManagerWithMissingSnapshots = {
            ...mockHistoryManager,
            getMessageIndex: () => 45, // Way past snapshot turn, but snapshots are empty
            getActiveMessagesUntil: () => mockMessages,
        } as unknown as ChatHistoryManager;

        // Act
        await recalculateAndApplyState(historyManagerWithMissingSnapshots, targetMessageId);

        // Assert
        expect(mockSaveStateSnapshot).toHaveBeenCalledTimes(2); // For turn 20 and 40
        expect(mockSaveStateSnapshot).toHaveBeenCalledWith('msg_20', expect.any(Object), historyManagerWithMissingSnapshots);
        expect(mockSaveStateSnapshot).toHaveBeenCalledWith('msg_40', expect.any(Object), historyManagerWithMissingSnapshots);
    });

    it('should clear old snapshots for the current branch during recalculation', async () => {
        // Arrange
        // 增强测试数据，使其更接近真实场景
        const stateWithSnapshots = {
            世界: {
                时间: '当前纪元', // 修复：添加此字段以防止触发回退机制
                初始状态: { 世界: { 时间: '初始之日' }, 角色: { '主角': { '姓名': '创世英雄' } } },
                状态快照: {
                    main: { // 这个分支的快照应该被清除
                        'msg_old_snapshot': {
                            角色: { '主角': { '姓名': '旧日英雄', '等级': 10 } },
                            世界: { 时间: '旧纪元' }
                        }
                    },
                    other_branch: { // 其他分支的快照应该被保留
                        'msg_other': {
                            角色: { '主角': { '姓名': '分支英雄', '等级': 5 } },
                            世界: { 时间: '另一天' }
                        }
                    },
                }
            },
            角色: { '主角': { '姓名': '当前英雄', '等级': 15 } }, // 当前状态
            备份: { 初始状态备份: { 世界: { 时间: '初始之日' }, 角色: { '主角': { '姓名': '创世英雄' } } } },
        };

        // 修复：为 getVariables 的每次调用提供精确的、独立的返回值，以模拟状态的逐步变化
        const finalStateAfterWrite = _.cloneDeep(stateWithSnapshots);
        // 核心断言：main 分支的快照被清空
        _.set(finalStateAfterWrite, '世界.状态快照.main', {});

        mockGetVariables
            // 1. 第一次调用，获取初始状态
            .mockReturnValueOnce(_.cloneDeep(stateWithSnapshots))
            // 2. 第二次调用，获取当前变量以保留缓存
            .mockReturnValueOnce(_.cloneDeep(stateWithSnapshots))
            // 3. 第三次调用，获取写入后的状态（用于 saveStateSnapshot）
            .mockReturnValueOnce(finalStateAfterWrite)
            // 4. 第四次调用，获取最终返回给调用者的状态
            .mockReturnValueOnce(finalStateAfterWrite);

        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(stateWithSnapshots), eventsToReplay: [] });
        
        // 模拟 store 的状态：由于没有事件，最终状态应与起始状态相同
        mockWorldStore.world = _.cloneDeep(stateWithSnapshots.世界);
        mockCharacterStore.characters = _.cloneDeep(stateWithSnapshots.角色);

        // Act
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        expect(mockOverwriteAllChatVariables).toHaveBeenCalledTimes(1);
        const finalStateWritten: any = mockOverwriteAllChatVariables.mock.calls[0][0];

        // 验证快照处理是否正确
        expect(finalStateWritten['世界']['状态快照']['main']).toEqual({});
        expect(finalStateWritten['世界']['状态快照']['other_branch']).toEqual(stateWithSnapshots.世界.状态快照.other_branch);
        
        // 验证其他核心数据是否被正确保留
        expect(finalStateWritten['世界']['初始状态']).toEqual(stateWithSnapshots.世界.初始状态);
        expect(finalStateWritten['角色']).toEqual(stateWithSnapshots.角色);
        expect(finalStateWritten['备份']).toEqual(stateWithSnapshots.备份);

        // 验证函数返回值是否正确
        expect(result).toEqual(finalStateAfterWrite);
    });

    it('should handle corrupted events gracefully', async () => {
        // Arrange
        const genesisState = {
            世界: { 初始状态: { '世界': {}, '角色': { '主角': { '姓名': '初始主角' } } } },
            角色: { '主角': { 姓名: '初始主角' } },
            备份: { 初始状态备份: { '世界': {}, '角色': { '主角': { '姓名': '初始主角' } } } },
        };
        const eventsToReplay = [
            { type: '属性变化', payload: { character: '主角', property: '等级', value: 2 } },
            { type: '无效事件' }, // Corrupted event
            { type: '属性变化', payload: { character: '主角', property: '经验', value: 100 } },
        ];
        
        const finalCalculatedCharacterState = { '主角': { 姓名: '初始主角', 等级: 2, 经验: 100 } };
        const finalStateForReturn = {
            '世界': genesisState.世界,
            '角色': finalCalculatedCharacterState,
            '备份': genesisState.备份,
        };

        mockGetVariables
            .mockReturnValueOnce(_.cloneDeep(genesisState)) // initial check
            .mockReturnValueOnce(_.cloneDeep(genesisState)) // get caches
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn)) // for snapshot
            .mockReturnValueOnce(_.cloneDeep(finalStateForReturn)); // for return value

        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(genesisState), eventsToReplay });
        
        // 模拟事件处理过程
        mockWorldStore.world = genesisState.世界;
        mockCharacterStore.characters = _.cloneDeep(genesisState.角色); // 从初始状态开始
        mockWorldStore._dangerouslyProcessEvents.mockImplementation((events: any[]) => {
            events.forEach(event => {
                if (event.type === '属性变化' && event.payload.property === '等级') {
                    _.set(mockCharacterStore.characters, '主角.等级', event.payload.value);
                }
                if (event.type === '属性变化' && event.payload.property === '经验') {
                     _.set(mockCharacterStore.characters, '主角.经验', event.payload.value);
                }
            });
        });


        // Act
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        expect(result).not.toBeNull();
        expect(toastr.error).not.toHaveBeenCalled();
        expect(mockWorldStore._dangerouslyProcessEvents).toHaveBeenCalledWith(eventsToReplay);
        expect(result?.['角色']?.['主角']?.['经验']).toBe(100); // Verify that events after the corrupted one are still processed
    });

    it('should handle empty event history', async () => {
        // Arrange
        const genesisState = {
            世界: { 初始状态: { '世界': {}, '角色': { '主角': { '姓名': '初始主角' } } } },
            角色: { '主角': { 姓名: '初始主角' } },
            备份: { 初始状态备份: { '世界': {}, '角色': { '主角': { '姓名': '初始主角' } } } },
        };
        
        mockGetVariables.mockReturnValue(_.cloneDeep(genesisState));
        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(genesisState), eventsToReplay: [] });
        
        mockWorldStore.world = genesisState.世界;
        mockCharacterStore.characters = genesisState.角色;

        // Act
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        expect(mockWorldStore._dangerouslyProcessEvents).toHaveBeenCalledWith([]);
        const finalStateWritten = mockOverwriteAllChatVariables.mock.calls[0][0];
        expect(finalStateWritten['角色']).toEqual(genesisState.角色);
        expect(result).toEqual(genesisState);
    });

    it('should preserve snapshots from other branches', async () => {
        // Arrange
        const stateWithMultipleBranches = {
            世界: {
                时间: '当前纪元',
                初始状态: { 世界: { 时间: '初始之日' }, 角色: {} },
                状态快照: {
                    main: { 'msg_main': { 角色: { '姓名': '主角' } } },
                    branch_A: { 'msg_A': { 角色: { '姓名': '英雄A' } } },
                    branch_B: { 'msg_B': { 角色: { '姓名': '英雄B' } } },
                }
            },
            角色: { '姓名': '主角' },
            备份: { 初始状态备份: {} },
        };

        mockGetVariables.mockReturnValue(_.cloneDeep(stateWithMultipleBranches));
        mockGetRecalculationInputs.mockResolvedValue({ startState: _.cloneDeep(stateWithMultipleBranches), eventsToReplay: [] });
        mockWorldStore.world = stateWithMultipleBranches.世界;
        mockCharacterStore.characters = stateWithMultipleBranches.角色;

        // Act
        await recalculateAndApplyState(mockHistoryManager, targetMessageId);

        // Assert
        const finalStateWritten = mockOverwriteAllChatVariables.mock.calls[0][0];
        expect(finalStateWritten['世界']['状态快照']['main']).toEqual({});
        expect(finalStateWritten['世界']['状态快照']['branch_A']).toEqual(stateWithMultipleBranches.世界.状态快照.branch_A);
        expect(finalStateWritten['世界']['状态快照']['branch_B']).toEqual(stateWithMultipleBranches.世界.状态快照.branch_B);
    });

    it('should throw a critical error if L3 cache recovery fails', async () => {
        // Arrange
        const stateWithoutCache = { 世界: {}, 角色: {} };
        mockGetVariables.mockReturnValue(_.cloneDeep(stateWithoutCache));
        vi.mocked(global.getChatMessages).mockResolvedValue([]); // No genesis message available

        // Act & Assert
        const result = await recalculateAndApplyState(mockHistoryManager, targetMessageId);
        expect(result).toBeNull();
        expect(toastr.error).toHaveBeenCalledWith('检测到严重的状态数据丢失，且无法自动恢复！');
    });
});