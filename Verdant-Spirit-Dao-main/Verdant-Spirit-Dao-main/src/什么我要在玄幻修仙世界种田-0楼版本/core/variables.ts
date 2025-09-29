// core/variables.ts

import type { ChatHistoryManager } from './history';
import { logger } from './logger';
// Import other plugin stores here as they are created, e.g., useSummaryStore
import { extractJsonFromStatusBar, findNonCloneable } from './utils';
import { LOCAL_VERSION } from './version';

// #region 外部依赖声明
// @ts-ignore
declare const _: any;
// @ts-ignore
declare const toastr: any;
// @ts-ignore
declare const replaceVariables: (variables: Record<string, any>, options?: any) => Promise<Record<string, any>>;
// @ts-ignore
declare const updateVariablesWith: (updater: (vars: any) => any, options: any) => Promise<void>;
// @ts-ignore
declare const insertOrAssignVariables: (updates: any, options: any) => Promise<void>;
// #endregion

// #region 类型定义
/**
 * 定义了游戏中所有事件对象的标准结构。
 */
export interface GameEvent {
    type: string;
    payload: any;
    sourceMessageId: string;
    eventId: string;
}

/**
 * (新增) 定义了物品对象的基本结构。
 */
interface Item {
    名称: string;
    数量?: number;
    [key: string]: any;
}
// #endregion

// #region 导出包装函数 (v3.4)
/**
 * 从 Tavern 环境中获取聊天变量的包装函数。
 * @param options - 传递给底层 API 的选项。
 * @returns 当前的聊天变量。
 */
export function getVariables(options?: any): any {
    // @ts-ignore
    return (window as any).getVariables(options);
}

/**
 * 一个简化的变量更新函数，用于合并部分更新。
 * @param updates - 一个包含要更新的键和值的对象。
 */
export async function updateVariables(updates: Record<string, any>) {
    try {
        // (v4.2.1) 统一API，使用 safeInsertOrAssignVariables 来保证深度合并
        await safeInsertOrAssignVariables(updates, { type: 'chat' });
    } catch (error) {
        logger('error', 'Variables', 'Failed to update variables with simplified updater.', { updates, error });
    }
}

/**
 * 一个简化的变量赋值函数，用于直接替换指定路径的值。
 * @param updates - 一个包含要赋值的路径和值的对象。
 * @param options - 传递给底层 API 的选项。
 */
export async function assignVariables(updates: Record<string, any>, options: any = { type: 'chat' }) {
    try {
        // (v4.2.1) 统一API，使用 safeInsertOrAssignVariables 来保证深度合并
        await safeInsertOrAssignVariables(updates, options);
    } catch (error) {
        logger('error', 'Variables', 'Failed to assign variables.', { updates, error });
    }
}

/**
 * (v4.2 新增) `insertOrAssignVariables` 的安全版本，确保始终执行深度合并。
 * 这是为了应对 Tavern Helper v3.5.1 中 `insertOrAssignVariables` 对数组行为的破坏性更新。
 * 此函数保证无论底层 API 如何变化，其行为都是可预测的深度合并。
 * @param updates - 要合并到变量中的对象。
 * @param options - 传递给底层 API 的选项。
 */
export async function safeInsertOrAssignVariables(updates: Record<string, any>, options: any = { type: 'chat' }) {
    try {
        // 核心修复：在将数据传递给 Tavern API 之前，进行深度克隆以移除任何响应式代理 (Proxy)。
        const plainUpdates = _.cloneDeep(updates);

        const problems = findNonCloneable(plainUpdates);
        if (problems.length > 0) {
            logger('error', 'Variables', 'CRITICAL: Non-cloneable properties found in variables before calling safeInsertOrAssignVariables!', { updates: plainUpdates, problems });
        }
        // 根据用户反馈，直接调用原生 insertOrAssignVariables，因为它能更好地处理插入和赋值两种情况
        await insertOrAssignVariables(plainUpdates, options);
    } catch (error) {
        logger('error', 'Variables', 'Failed to safely insert or assign variables.', { updates, error });
    }
}
// #endregion

// #region 全局状态与事件存储
const activeMessageId: string | null = null;
let initialChatVariables: any = null; // 用于存储初始状态快照

/**
 * 初始化状态。
 * @param initialVars - 初始的聊天变量。
 */
export function initializeState(initialVars: any) {
    // 如果世界对象存在但缺少时价信息，则为其生成初始时价
    if (initialVars.世界 && !initialVars.世界.时价) {
        logger('info', 'Variables', '`世界.时价` not found. Generating initial market price.');
        initialVars.世界.时价 = generateInitialMarketPrice();
    }

    initialChatVariables = _.cloneDeep(initialVars);
    logger('info', 'Variables', 'State initialized.', {
        initialVars: _.cloneDeep(initialChatVariables),
    });
}
// #endregion

// #region 辅助工具函数

/**
 * 生成随机的初始市场时价信息。
 * @returns 一个随机生成的时价对象。
 */
function generateInitialMarketPrice(): object {
    const allTags = [
        "消耗品", "食物", "药品", "建筑材料", "炼器材料", "炼丹材料",
        "修炼材料_初期", "修炼材料_中期", "任务物品", "剧情关键",
        "稀有", "传说", "唯一", "工具", "书籍", "知识", "法器", "奇物"
    ];

    const demandTags: { [key: string]: number } = {};
    const numTags = _.random(1, 3); // 随机选择1-3个标签

    const selectedTags = _.sampleSize(allTags, numTags);

    for (const tag of selectedTags) {
        // 生成0.7到1.5之间的随机乘数，保留两位小数
        const multiplier = parseFloat(_.random(0.7, 1.5).toFixed(2));
        demandTags[tag] = multiplier;
    }

    return {
        需求旺盛的标签: demandTags,
        过期时间: _.random(10, 30) // 10到30天的随机过期时间
    };
}

/**
 * 递归地查找两个对象之间的差异。
 * @param obj1 第一个对象 (例如: a)
 * @param obj2 第二个对象 (例如: b)
 * @returns 一个描述差异的对象，或在没有差异时返回 null。
 */
function getObjectDiff(obj1: any, obj2: any): any {
    if (_.isEqual(obj1, obj2)) {
        return null;
    }

    if (!_.isObject(obj1) || !_.isObject(obj2) || _.isArray(obj1) || _.isArray(obj2)) {
        return {
            calculated: obj1,
            written: obj2,
        };
    }

    const diff: Record<string, any> = {};
    const allKeys = _.union(Object.keys(obj1), Object.keys(obj2));

    for (const key of allKeys) {
        const nestedDiff = getObjectDiff(obj1[key], obj2[key]);
        if (nestedDiff) {
            diff[key] = nestedDiff;
        }
    }

    return diff;
}

/**
 * 适配器函数，用于将旧格式的事件对象（使用“事件”和“数据”）
 * 标准化为新格式（使用“type”和“payload”）。
 * @param event - 任何格式的事件对象。
 * @returns 一个符合GameEvent规范的、标准化的事件对象。
 */
export function normalizeEvent(event: any): Partial<GameEvent> {
    const type = event.type || event['事件'];
    let payload = event.payload || event['数据'];

    // 兼容性修复：处理旧的、扁平化的“新图鉴发现”事件格式
    if (type === '新图鉴发现' && event['类型'] && event['数据']) {
        payload = {
            '类型': event['类型'],
            '数据': event['数据']
        };
    }
    
    // 只返回标准化的核心字段，防止意外的属性污染
    return {
        type,
        payload,
    };
}
// #endregion

/**
 * 从历史记录中提取并返回截至指定消息ID的所有事件。
 * @param historyManager ChatHistoryManager 的实例。
 * @param targetMessageId 目标消息ID。
 * @param startMessageId (可选) 起始消息ID，函数将只获取此消息之后发生的事件。
 * @returns {GameEvent[]} 一个包含所有相关事件的数组。
 */
export function getEventsUntil(historyManager: ChatHistoryManager, targetMessageId: string, startMessageId: string | null = null): GameEvent[] {
    const allEvents: GameEvent[] = [];
    logger('log', 'Variables', `[getEventsUntil] Called with targetId: ${targetMessageId}, startId: ${startMessageId}`);
    // 将 startMessageId 传递给 historyManager，以利用L2快照进行性能优化
    const activeMessages = historyManager.getActiveMessagesUntil(targetMessageId, startMessageId);

    if (!activeMessages) {
        logger('error', 'Variables', `[getEventsUntil] Could not find message path for targetId: ${targetMessageId}`);
        return [];
    }

    logger('log', 'Variables', `[getEventsUntil] Found ${activeMessages.length} active messages to scan for events.`);

    for (const message of activeMessages) {
        logger('log', 'Variables', `[getEventsUntil] Scanning message ${message.id}`);
        const jsonString = message.content ? extractJsonFromStatusBar(message.content) : null;
        if (jsonString) {
            try {
                const parsedJson = JSON.parse(jsonString);
                const eventList = parsedJson['事件列表'] || [];
                if (eventList.length > 0) {
                    logger('log', 'Variables', `[getEventsUntil] Found ${eventList.length} events in message ${message.id}`);
                    const eventsFromMessage = eventList
                        .map((event: any) => normalizeEvent(event))
                        .filter((event: Partial<GameEvent>): event is GameEvent => {
                            if (!event.type) {
                                logger('warn', 'Variables', `[getEventsUntil] Filtered out an event with no type.`, event);
                                return false;
                            }
                            return true;
                        });
                    allEvents.push(...eventsFromMessage as GameEvent[]);
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }
    }
    logger('log', 'Variables', `[getEventsUntil] Finished. Total events found: ${allEvents.length}`);
    return allEvents;
}


/**
 * 使用提供的对象完全覆盖所有聊天变量。
 * 主要用于从存档文件加载状态。
 * @param data - 要写入的完整聊天变量对象。
 */
export async function overwriteAllChatVariables(data: any) {
    logger('warn', 'Variables', 'Overwriting all chat variables with provided data.', data);
    try {
        // 读取当前变量以保留 plugin_storage
        const currentVars = getVariables({ type: 'chat' }) || {};
        const preservedStorage = currentVars.plugin_storage;

        // 创建一个全新的状态对象
        const newState = _.cloneDeep(data);

        // 如果存在需要保留的 plugin_storage，则将其附加到新状态上
        if (preservedStorage) {
            newState.plugin_storage = preservedStorage;
        }

        // 使用 replaceVariables 彻底替换，避免修改旧对象的复杂性
        const problems = findNonCloneable(newState);
        if (problems.length > 0) {
            logger('error', 'Variables', 'CRITICAL: Non-cloneable properties found in variables before calling overwriteAllChatVariables!', { newState, problems });
        }
        await replaceVariables(newState, { type: 'chat' });

        logger('info', 'Variables', 'Successfully overwrote chat variables.');
    } catch (error) {
        logger('error', 'Variables', 'Failed to overwrite chat variables.', error);
        toastr.error('加载状态失败，详情请查看控制台。');
    }
}

/**
 * 清除所有聊天变量，用于开始新游戏。
 * 此函数会保留 plugin_storage 容器，但会清空其中的 llm_history，
 * 以确保新游戏不会被旧的聊天记录污染。
 */
export async function clearAllChatVariables() {
    logger('warn', 'Variables', 'Clearing all chat variables for a new game.');
    try {
        const currentVars = getVariables({ type: 'chat' }) || {};
        const preservedStorage = currentVars.plugin_storage;
        const newVars: { plugin_storage?: any } = {};

        if (preservedStorage) {
            // 清除与游戏存档相关的历史记录
            if (preservedStorage.llm_history) {
                delete preservedStorage.llm_history;
                logger('info', 'Variables', 'Cleared llm_history from preserved plugin_storage.');
            }
            newVars.plugin_storage = preservedStorage;
        }

        // 使用 replaceVariables 替换为一个只包含 plugin_storage (如果存在) 的新对象
        const problems = findNonCloneable(newVars);
        if (problems.length > 0) {
            logger('error', 'Variables', 'CRITICAL: Non-cloneable properties found in variables before calling clearAllChatVariables!', { newVars, problems });
        }
        await replaceVariables(newVars, { type: 'chat' });

        logger('info', 'Variables', 'Successfully cleared all chat variables.');
    } catch (error) {
        logger('error', 'Variables', 'Failed to clear chat variables.', error);
        toastr.error('清除游戏数据失败，详情请查看控制台。');
    }
}

/**
 * (v2.7) 根据事件历史计算状态，但不将其应用到全局变量中。
 * 这是一个纯计算函数，用于获取特定历史点的状态快照。
 * @param historyManager ChatHistoryManager 的实例。
 * @param targetMessageId 目标消息ID，将计算到此消息为止的状态。
 * @returns 一个包含起始状态和事件列表的对象，如果失败则返回 null。
 */
export async function getRecalculationInputs(historyManager: ChatHistoryManager, targetMessageId: string): Promise<{ startState: any; eventsToReplay: GameEvent[] } | null> {
    const allVars = getVariables({ type: 'chat' });
    const coords = historyManager.getRawHistory().metadata[targetMessageId];
    if (!coords) {
        logger('error', 'StateCalc', `Could not find coordinates for target message ${targetMessageId}. Aborting.`);
        return null;
    }
    const branchId = coords.branchId;
    const branchSnapshots = _.get(allVars, `世界.状态快照.${branchId}`, {});
    let initialSnapshot = _.cloneDeep(_.get(allVars, '世界.初始状态'));

    if (!initialSnapshot) {
        initialSnapshot = _.cloneDeep(_.get(allVars, '备份.初始状态备份'));
        if (!initialSnapshot) {
            logger('error', 'Variables', '[Recalc Inputs] Genesis snapshot and backup are both missing. Aborting.');
            return null;
        }
    }

    const targetMessageIndex = historyManager.getMessageIndex(targetMessageId);
    let bestSnapshotMessageId: string | null = null;
    let bestSnapshotIndex = -1;

    for (const messageId in branchSnapshots) {
        const snapshot = branchSnapshots[messageId];
        if (snapshot && snapshot.version === LOCAL_VERSION) {
            const snapshotIndex = historyManager.getMessageIndex(messageId);
            if (snapshotIndex !== -1 && snapshotIndex < targetMessageIndex && snapshotIndex > bestSnapshotIndex) {
                bestSnapshotIndex = snapshotIndex;
                bestSnapshotMessageId = messageId;
            }
        }
    }

    let startState;
    let startMessageId;
    // 核心修复：为确保状态绝对准确，无条件从创世状态开始重算，忽略所有L2快照
    startState = initialSnapshot;
    startMessageId = null;
    logger('warn', 'Variables', '[Recalc Inputs] Forced recalculation from genesis state, ignoring L2 snapshots for accuracy.');

    const eventsToReplay = getEventsUntil(historyManager, targetMessageId, startMessageId);
    return { startState, eventsToReplay };
}

/**
 * 将指定的状态保存为L2缓存（状态快照）。
 * @param messageId - 作为快照索引的消息ID。
 * @param stateToSave - 要保存的完整状态对象。
 * @param historyManager - ChatHistoryManager的实例，用于获取分支ID。
 */
export async function saveStateSnapshot(messageId: string, stateToSave: any, historyManager: ChatHistoryManager) {
    const coords = historyManager.getRawHistory().metadata[messageId];
    if (!coords) {
        logger('error', 'Variables', `[saveStateSnapshot] Cannot save snapshot, no coordinates found for message ${messageId}.`);
        return;
    }
    const branchId = coords.branchId;
    const snapshotPath = `世界.状态快照.${branchId}.${messageId}`;

    // 为快照添加版本信息
    const cleanStateToSave = _.cloneDeep(stateToSave);
    // 安全修复：确保 plugin_storage 不会被保存到任何状态快照中
    if (cleanStateToSave.plugin_storage) {
        delete cleanStateToSave.plugin_storage;
        logger('warn', 'Variables', '[L2 Cache] Removed `plugin_storage` before saving snapshot to maintain state purity.');
    }

    // v4.2 核心修复：从要保存的状态中移除初始状态和状态快照本身，防止递归嵌套和数据冗余
    if (_.has(cleanStateToSave, '世界.初始状态')) {
        delete cleanStateToSave.世界.初始状态;
        logger('warn', 'Variables', '[L2 Cache] Removed `世界.初始状态` before saving snapshot to prevent recursion.');
    }
    if (_.has(cleanStateToSave, '世界.状态快照')) {
        delete cleanStateToSave.世界.状态快照;
        logger('warn', 'Variables', '[L2 Cache] Removed `世界.状态快照` before saving snapshot to prevent recursion.');
    }

    const snapshotWithVersion = {
        ...cleanStateToSave,
        version: LOCAL_VERSION,
    };

    try {
        // 核心修复：弃用 updateVariablesWith，因为它可能传递响应式代理。
        // 改为手动的“读取-修改-写入”模式，并确保在写入前进行深拷贝。
        const currentVars = getVariables({ type: 'chat' }) || {};
        const newVars = _.cloneDeep(currentVars);

        // 健壮性修复：确保路径上的所有对象都存在
        if (!newVars.世界) {
            newVars.世界 = {};
        }
        if (!newVars.世界.状态快照) {
            newVars.世界.状态快照 = {};
        }
        if (!newVars.世界.状态快照[branchId]) {
            newVars.世界.状态快照[branchId] = {};
        }

        _.set(newVars, snapshotPath, snapshotWithVersion);

        await assignVariables(newVars, { type: 'chat' });
        
        logger('info', 'Variables', `[L2 Cache] Successfully saved state snapshot for message ${messageId} in branch ${branchId}.`);
    } catch (error) {
        logger('error', 'Variables', `[L2 Cache] Failed to save snapshot for message ${messageId}.`, error);
    }
}
