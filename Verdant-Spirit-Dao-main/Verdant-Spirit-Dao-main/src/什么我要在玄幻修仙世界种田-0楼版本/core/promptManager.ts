import _ from 'lodash';
import { watch } from 'vue';
import { PROMPTS } from '../data/prompts';
import * as C from '../modules/setup/data';
import { usePromptStore } from '../stores/modules/promptStore';
import { useSmartContextStore } from '../stores/modules/smartContextStore';
import { useAdventureStore } from '../stores/systems/adventureStore';
import { useQuestStore } from '../stores/systems/questStore';
import { ChatHistoryManager, MessagePage } from './history';
import { logger } from './logger';
import { MarketPriceInfo, PokedexManager } from './pokedex';
import { extractJsonFromStatusBar } from './utils';
import { findPaths } from './utils/pathfinder';
import { getRecalculationInputs } from './variables';
import { checkForDiscovery } from './discovery';

declare const getVariables: (options: any) => any;
declare const uninjectPrompts:(ids: string[])=>void;

/**
 * PromptManager 负责根据当前游戏状态动态构建和管理发送给LLM的系统指令。
 */
export class PromptManager {
    private basePrompt: string = PROMPTS.BASE;
    private systemPrompts: Map<string, string> = new Map();
    private pokedexManager: PokedexManager;
    private forceInjectKnowledgeIds: Set<string> = new Set();
    private dynamicFragments: Map<string, string> = new Map(); // Legacy fragments, will be migrated
    private lastGeneratedSystemPrompt: string = '尚未生成任何提示词。';
    private promptStore: ReturnType<typeof usePromptStore>;
    private smartContextStore: ReturnType<typeof useSmartContextStore>;
    private adventureStore: ReturnType<typeof useAdventureStore>;
    private questStore: ReturnType<typeof useQuestStore>;

    constructor(pokedexManager: PokedexManager) {
        this.pokedexManager = pokedexManager;
        this.promptStore = usePromptStore();
        this.smartContextStore = useSmartContextStore();
        this.adventureStore = useAdventureStore();
        this.questStore = useQuestStore();
        this.initializeListeners();

        // 响应式缓存失效
        watch(() => this.promptStore.dynamicFragments, () => {
            logger('log', 'PromptManager', 'Detected change in promptStore fragments, clearing system prompt cache.');
            this.systemPrompts.clear();
        }, { deep: true });
    }

    /**
     * 初始化事件监听器，订阅 messageBus 中的相关事件。
     * v2.0 迁移后，此方法将逐步清空。
     */
    public initializeListeners(): void {
        // adventureHintUpdate 和 shelterDamaged 已迁移到 Pinia stores
    }

    /**
     * 根据系统ID获取组合后的系统指令。
     * @param systemId - 当前激活的系统ID。
     * @returns 组合了基础和特定系统规则的系统指令字符串。
     */
    private getSystemInstructions(systemId: string | null): string {
        const systemKey = systemId ? `SYSTEM_${systemId.replace('system-', '').toUpperCase().replace(/-/g, '_')}` : 'SYSTEM_NONE';
        
        if (this.systemPrompts.has(systemKey)) {
            return this.systemPrompts.get(systemKey) as string;
        }

        let systemSpecificPrompt = '';
        if (systemKey === 'SYSTEM_NONE') {
            systemSpecificPrompt = PROMPTS.SYSTEM_NONE;
        } else if (Object.prototype.hasOwnProperty.call(PROMPTS, systemKey)) {
            systemSpecificPrompt = (PROMPTS as any)[systemKey];
        } else {
            logger('warn', 'PromptManager', `No specific prompt for system ID "${systemId}". Using base prompt only.`);
        }

        let finalPrompt = `${this.basePrompt}\n\n---\n\n${systemSpecificPrompt}`;
        const adventureHint = this.adventureStore.adventureHint;
        finalPrompt = finalPrompt.replace('{{adventure_hint}}', adventureHint);
        logger('info', 'PromptManager', `[ADVENTURE HINT] Injected hint into prompt: "${adventureHint}"`);
        this.systemPrompts.set(systemKey, finalPrompt);
        return finalPrompt;
    }

    /**
     * 准备用于发送给LLM的提示词组件。
     * @param historyManager - ChatHistoryManager的实例。
     * @param userInput - 用户的输入文本。
     * @param excludeLastAssistant - 是否在历史记录中排除最后一条AI消息。
     * @returns 一个包含 userInput, chatHistory 和 injects 的对象。
     */
    public async preparePromptComponents(historyManager: ChatHistoryManager, userInput: string, excludeLastAssistant: boolean = false): Promise<{ userInput: string, chatHistory: any[], injects: any[] }> {
        let contextVariables;
        let shouldInjectMapContext = false;
        let regionInfoToInject: any = null;
        let pathsToInject: any = null;
        let discoveryHint: string | null = null;

        // 检查上一条消息是否请求了地图上下文或特定区域信息
        const lastMessage = historyManager.getMessagesForPrompt().slice(-1)[0];
        if (lastMessage && lastMessage.role === 'assistant') {
            const statusBarJsonString = extractJsonFromStatusBar(lastMessage.content);
            if (statusBarJsonString) {
                try {
                    const statusBar = JSON.parse(statusBarJsonString);
                    const events = statusBar['事件列表'] || [];

                    // 检查是否有可揭示的传闻
                    const actionOptions = statusBar['行动选项']?.['📜 可选行动'];
                    if (actionOptions) {
                        discoveryHint = checkForDiscovery(actionOptions);
                    }

                    for (const event of events) {
                        if (event.type === '指令' && event.payload) {
                            const currentVars = getVariables({ type: 'chat' });
                            const mapData = currentVars?.世界?.地图;

                            if (event.payload.指令 === '请求地图上下文') {
                                shouldInjectMapContext = true;
                                logger('info', 'PromptManager', 'Map context request detected. Will inject full map data.');
                                break;
                            }
                            if (event.payload.指令 === '请求区域信息') {
                                const regionIdentifier = event.payload.区域;
                                if (mapData && regionIdentifier) {
                                    const region = mapData.regions[regionIdentifier] || Object.values(mapData.regions).find((r: any) => r.name === regionIdentifier);
                                    if (region) {
                                        regionInfoToInject = region;
                                        logger('info', 'PromptManager', `Region info request detected for "${regionIdentifier}". Will inject region data.`);
                                    }
                                }
                                break;
                            }
                            if (event.payload.指令 === '请求路径信息') {
                                const destinationIdentifier = event.payload.目的地;
                                if (mapData && destinationIdentifier) {
                                    const startRegionId = mapData.currentPlayerLocation;
                                    const endRegion = mapData.regions[destinationIdentifier] || Object.values(mapData.regions).find((r: any) => r.name === destinationIdentifier);
                                    if (startRegionId && endRegion) {
                                        pathsToInject = findPaths(mapData, startRegionId, endRegion.region_id);
                                        logger('info', 'PromptManager', `Path info request detected for "${destinationIdentifier}". Will inject calculated paths.`);
                                    }
                                }
                                break;
                            }
                        }
                    }
                } catch (e) {
                    // JSON解析失败，忽略
                }
            }
        }

        if (excludeLastAssistant) {
            logger('log', 'PromptManager', 'Rollback requested for Retry/Swipe. Preparing state from the previous turn.');
            const lastMessage = historyManager.getMessagesForPrompt().slice(-1)[0];
            if (lastMessage) {
                const previousTurnMessage = historyManager.getPreviousTurnMessage(lastMessage.id);
                if (previousTurnMessage) {
                    logger('log', 'PromptManager', `Found previous turn message: ${previousTurnMessage.id}. Calculating its state...`);
                    const inputs = await getRecalculationInputs(historyManager, previousTurnMessage.id);
                    contextVariables = inputs ? inputs.startState : null;
                    if (contextVariables) {
                        logger('info', 'PromptManager', `Successfully calculated state of previous turn ${previousTurnMessage.id}. Using it for prompt context.`);
                    } else {
                        logger('error', 'PromptManager', `State calculation for previous turn ${previousTurnMessage.id} failed. Falling back to current state.`);
                        contextVariables = getVariables({ type: 'chat' }) || {};
                    }
                } else {
                    logger('info', 'PromptManager', 'This is the first turn, no previous turn to roll back to. Using current state.');
                    contextVariables = getVariables({ type: 'chat' }) || {};
                }
            } else {
                 logger('warn', 'PromptManager', 'No last message found in history. Using current state.');
                contextVariables = getVariables({ type: 'chat' }) || {};
            }
        } else {
            logger('log', 'PromptManager', 'New turn detected. Using current active state for prompt.');
            contextVariables = getVariables({ type: 'chat' }) || {};
        }
        
        // 智能上下文系统：处理用户输入
        if (this.smartContextStore.isEnabled) {
            this.smartContextStore.processUserInput(userInput);
        }
        const turnCount = historyManager.getTurnCount();


        // 1. 格式化聊天记录
        const chatHistory = await this.formatChatHistoryForSillyTavern(historyManager, contextVariables, excludeLastAssistant);

        // 2. 获取系统指令 (v2.0)
        const systemName = _.get(contextVariables, '世界.当前激活系统.名称', '无系统');
        // 将中文名转换为ID, e.g., "成就系统" -> "system-achievement"
        const systemId = C.systems.find((s: any) => s.name === systemName)?.id || null;
        const systemInstructions = this.getSystemInstructions(systemId);

        // 3. 格式化变量
        const explainedVariables = this.explainVariables(contextVariables, systemId, turnCount, shouldInjectMapContext, regionInfoToInject, pathsToInject, discoveryHint);

        // 4. 组合系统提示词
        const preamble = `[OOC: 以下是发送给你的、用于驱动剧情的完整游戏状态和规则。请仔细阅读并严格遵守。]\n\n**当前游戏状态**:\n这是游戏世界的完整快照，请将其作为你生成回应的唯一真实来源。`;
        let systemPrompt = `<SystemInstructions>\n${systemInstructions}\n</SystemInstructions>\n\n<Variables>\n${preamble}\n\n${explainedVariables}\n</Variables>`;
        
        // 保底机制：强制替换所有“灵力”和“灵气”为自定义力量名称
        const worldviewSettings = _.get(contextVariables, '世界.世界观.固定世界信息');
        if (worldviewSettings && worldviewSettings.powerSystem.name !== '灵力') {
            const powerSystemName = worldviewSettings.powerSystem.name;
            logger('info', 'PromptManager', `Applying fallback replacement for '灵力' and '灵气' with '${powerSystemName}' in the entire system prompt.`);
            systemPrompt = systemPrompt.replace(/灵力|灵气/g, powerSystemName);
        }

        this.lastGeneratedSystemPrompt = systemPrompt; // 缓存生成的提示词
        uninjectPrompts(["injection"]);//清理聊天文件中指定的提示词，以免缓存过多
        const injects = [{ id:"injection",role: 'system', content: systemPrompt, position: 'in_chat',depth: 0, should_scan: true }];

        logger('info', 'PromptManager', 'Prompt components prepared:', { userInput, chatHistory, injects });
        return { userInput, chatHistory, injects };
    }

    private async formatChatHistoryForSillyTavern(
        historyManager: ChatHistoryManager, 
        variables: any, 
        excludeLastAssistant: boolean = false
      ): Promise<any[]> {
        await historyManager.loadHistory(); // Ensure history is loaded
      
        const chatVars = getVariables({ type: 'chat' }) || {};
        const settings = _.get(chatVars, 'plugin_settings.context_management', { contextLimit: 20 });
        const messageCount = settings.contextLimit;
      
        let messages = historyManager.getMessagesForPrompt();
      
        if (excludeLastAssistant) {
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            messages = messages.slice(0, -1);
          }
        }
      
        messages = messages.slice(-messageCount);
        if (messages.length === 0) {
          return [];
        }
      
        const mainCharacterName = variables['角色']?.['主控角色名'] || '玩家';
        let aiCharacterName = 'AI';
        if (variables['角色']) {
          const characterNames = Object.keys(variables['角色']);
          const otherCharacter = characterNames.find(name => name !== '主控角色名' && name !== mainCharacterName);
          if (otherCharacter) {
            aiCharacterName = otherCharacter;
          }
        }
      
        const formattedMessages = messages.map((msg: MessagePage) => {
          let role: 'user' | 'assistant' | 'summary' | 'system' = msg.role;
          let content: string | undefined;
      
          if (msg.role === 'summary') {
            role = 'system';
            content = `[之前的剧情概要]: ${msg.content}`;
          } else {
            const roleName = msg.role === 'user' ? mainCharacterName : aiCharacterName;
            content = msg.content.replace(/<statusbar>[\s\S]*?<\/statusbar>/g, '').trim();
            content = `${roleName}: ${content}`;
          }
          
          if (content) {
            return { role, content };
          }
          return null;
        }).filter(Boolean);
      
        return formattedMessages as any[];
      }

    private explainVariables(variables: any, systemId: string | null, currentTurn: number, shouldInjectMapContext: boolean, regionInfoToInject: any, pathsToInject: any, discoveryHint: string | null): string {
        const mainCharacterName = variables['角色']?.['主控角色名'];
        const parts = [];

        // 0. (新增) 注入玩家自定义的世界观设定
        const worldviewSettings = _.get(variables, '世界.世界观.固定世界信息');
        if (worldviewSettings) {
            let worldviewPart = `  // 玩家自定义的核心世界观设定\n`;
            worldviewPart += `  "世界观设定": ${JSON.stringify(worldviewSettings, null, 2)}`;
            parts.push(worldviewPart);
        }

        // 1. 注入动态世界状态摘要 (从 promptStore 获取)
        const worldStateSummary: string[] = [];
        const fragmentsFromStore = this.promptStore.dynamicFragments;
        
        fragmentsFromStore.forEach((value, key) => {
            worldStateSummary.push(value);
        });

        if (worldStateSummary.length > 0) {
            let summaryPart = `  // 来自游戏世界的实时动态信息\n`;
            summaryPart += `  "世界状态摘要": [\n    "${worldStateSummary.join('",\n    "')}"\n  ]`;
            parts.push(summaryPart);
        }
    
        // 1. Generate Value Analysis Report if in Barter mode
        if (systemId === 'system-barter') {
            const marketPrices: MarketPriceInfo[] = _.get(variables, '世界.时价', []);
            if (marketPrices.length > 0) {
                let report = `  // 当前影响交易价值的【时价风闻】\n`;
                report += `  "价值分析报告": ${JSON.stringify(marketPrices, null, 2)}`;
                parts.push(report);
            }
        }
    
        // 1. Main Character Info (Core Context)
        if (mainCharacterName && variables['角色']?.[mainCharacterName]) {
            const charData = variables['角色'][mainCharacterName];
            const items = charData['物品'];
            const skills = charData['技能'];
            
            // 根据 SPEC 5.1, 只保留核心状态和物品
            const coreStatusData: any = {
                姓名: charData['姓名'],
                种族: charData['种族'],
                职业: charData['职业'],
                等级: charData['等级'],
                状态: charData['状态'],
            };
    
            let coreStatus = `  // 主控角色'${mainCharacterName}'的核心状态。注意，口渴度是值越低就越口渴\n`;
            coreStatus += `  "角色状态": ${JSON.stringify(coreStatusData, null, 2)}`;
            parts.push(coreStatus);
    
            if (skills && !_.isEmpty(skills)) {
                let skillsPart = `  // 主控角色当前掌握的技能\n`;
                skillsPart += `  "角色技能": ${JSON.stringify(skills, null, 2)}`;
                parts.push(skillsPart);
            }
    
            if (items && !_.isEmpty(items)) {
                let itemsPart = `  // 主控角色当前持有的物品\n`;
                itemsPart += `  "角色物品": ${JSON.stringify(items, null, 2)}`;
                parts.push(itemsPart);
            }
        }
    
        // 2. World Info
        if (variables['世界']) {
            const worldParts = [];
            
            // --- 核心世界状态 ---
            const worldCoreState: any = {};
            if (variables['世界']?.['时间']?.['day']) worldCoreState['天数'] = variables['世界']['时间']['day'];
            if (variables['世界']?.['时间']?.['timeOfDay']) worldCoreState['时辰'] = variables['世界']['时间']['timeOfDay'];
            if (variables['世界']['地点']) worldCoreState['地点'] = variables['世界']['地点'];

            if (!_.isEmpty(worldCoreState)) {
                let coreStatePart = `    // 世界核心状态\n`;
                coreStatePart += `    "核心状态": ${JSON.stringify(worldCoreState, null, 2)}`;
                worldParts.push(coreStatePart);
            }

            // --- 智能上下文注入逻辑 (v2.0, 响应式) ---
            if (this.smartContextStore.isEnabled) {
                const injectedKnowledge = this.smartContextStore.injectedKnowledge;
                if (injectedKnowledge.length > 0) {
                    // TODO: The injectedKnowledge is just a list of items. We need to group them by category.
                    // This logic should ideally be inside the smartContextStore getter itself.
                    // For now, we'll just stringify the flat list.
                    let pokedexPart = `    // 根据上下文动态选择的图鉴知识\n`;
                    pokedexPart += `    "图鉴": ${JSON.stringify(injectedKnowledge, null, 2)}`;
                    worldParts.push(pokedexPart);
                }
            } else if (variables['世界']['图鉴'] && !_.isEmpty(variables['世界']['图鉴'])) {
                // Fallback to old logic if smart context is disabled
                let pokedexPart = `    // 玩家已发现的图鉴条目，代表其知识\n`;
                pokedexPart += `    "图鉴": ${JSON.stringify(variables['世界']['图鉴'], null, 2)}`;
                worldParts.push(pokedexPart);
            }
    
            // --- 其他世界信息 (根据 SPEC 移除) ---
            // '庇护所', '成就', '技能', '签到', '任务列表' 等不再发送完整对象

            // --- 世界观细节注入 (v4.1) ---
            const worldview = variables['世界']?.['世界观'];
            if (worldview && !_.isEmpty(worldview)) {
                const worldviewParts = [];
                // 只注入当前激活的传闻
                if (worldview.rumors && worldview.rumors.length > 0) {
                    const activeRumors = worldview.rumors.filter((r: any) => r.status === 'active');
                    if (activeRumors.length > 0) {
                        worldviewParts.push(`"当前传闻": ${JSON.stringify(activeRumors, null, 2)}`);
                    }
                }
                // 注入所有未发现的奇遇和图鉴条目作为背景知识
                if (worldview.adventure_hooks && worldview.adventure_hooks.length > 0) {
                    worldviewParts.push(`"奇遇线索": ${JSON.stringify(worldview.adventure_hooks, null, 2)}`);
                }
                if (worldview.pokedex_entries && worldview.pokedex_entries.length > 0) {
                    worldviewParts.push(`"背景知识": ${JSON.stringify(worldview.pokedex_entries, null, 2)}`);
                }

                if (worldviewParts.length > 0) {
                    let worldviewString = `    // 动态演化的世界观背景\n`;
                    worldviewString += `    "世界观细节": {\n      ${worldviewParts.join(',\n      ')}\n    }`;
                    worldParts.push(worldviewString);
                }
            }
            
            if (worldParts.length > 0) {
                let worldString = `  // 关于游戏世界的信息\n`;
                worldString += `  "世界信息": {\n${worldParts.join(',\n')}\n  }`;
                parts.push(worldString);
            }
        }
    
        // --- 任务系统注入 ---
        if (variables['世界']?.['当前激活系统']?.['名称'] === '任务系统') {
            const ongoingQuests = this.questStore.ongoingQuests;
            if (ongoingQuests && ongoingQuests.length > 0) {
                let questPart = `  // 当前正在进行的任务\n`;
                questPart += `  "任务列表": ${JSON.stringify(ongoingQuests, null, 2)}`;
                parts.push(questPart);
            }
        }

        // --- 签到系统注入 ---
        if (systemId === 'system-signIn') {
            const signInData = _.get(variables, '世界.签到');
            if (signInData) {
                const signInStatus = {
                    今日已签到: signInData.今日已签到,
                    连续签到天数: signInData.连续签到天数,
                    月卡状态: signInData.月卡?.状态,
                    月卡激活日期: signInData.月卡?.activatedDate,
                };
                let signInPart = `  // 当前签到系统的状态\n`;
                signInPart += `  "签到状态": ${JSON.stringify(signInStatus, null, 2)}`;
                parts.push(signInPart);
            }
        }

        // 3. Player's chosen action
        if (variables['行动选择']) {
            let actionPart = `  // 玩家本回合选择的行动\n`;
            actionPart += `  "玩家行动": {\n`;
            actionPart += `    "行动序号": ${variables['行动选择'].index},\n`;
            actionPart += `    "行动描述": "${variables['行动选择'].text}"\n`;
            actionPart += `  }`;
            parts.push(actionPart);
        }

        // 4. (新增) 注入地图、区域或路径上下文
        if (shouldInjectMapContext && variables['世界']?.['地图']) {
            const mapData = variables['世界']['地图'];
            let mapPart = `  // 根据你的请求，以下是当前完整的地图信息\n`;
            mapPart += `  "地图上下文": ${JSON.stringify(mapData, null, 2)}`;
            parts.push(mapPart);
        } else if (regionInfoToInject) {
            let regionPart = `  // 根据你的请求，以下是关于区域【${regionInfoToInject.name}】的最新信息\n`;
            regionPart += `  "区域上下文": ${JSON.stringify(regionInfoToInject, null, 2)}`;
            parts.push(regionPart);
        } else if (pathsToInject) {
            let pathPart = `  // 根据你的请求，以下是从当前位置到目的地的可选路径\n`;
            pathPart += `  "路径信息": ${JSON.stringify(pathsToInject, null, 2)}`;
            parts.push(pathPart);
        }

        // 5. (新增) 注入揭示提示
        if (discoveryHint) {
            let hintPart = `  // 根据玩家的行动选项，系统发现以下潜在的可揭示信息\n`;
            hintPart += `  "系统提示": "${discoveryHint}"`;
            parts.push(hintPart);
        }

        // (新增) 注入特殊天象提示
        const weather = _.get(variables, '世界.天气');
        if (weather?.特殊天象 === '双月临空') {
            let eventHint = `  // 因特殊天象“双月临空”触发的特殊事件\n`;
            eventHint += `  "特殊事件提示": "今夜双月临空，这似乎对现实世界的物理法则产生了奇妙的扰动。如果玩家的手机有电且处于开机状态，它可能会奇迹般地接收到信号并能上网。这是一个绝佳的机会，你可以利用网络做些什么，或者选择忽略这个现象。"`;
            parts.push(eventHint);
        }
    
        let finalJsonString = `{\n${parts.join(',\n')}\n}`;

        return finalJsonString;
    }

    /**
     * 获取最后一次生成的系统提示词。
     * @returns 提示词字符串。
     */
    public getLastGeneratedSystemPrompt(): string {
        return this.lastGeneratedSystemPrompt;
    }
}
