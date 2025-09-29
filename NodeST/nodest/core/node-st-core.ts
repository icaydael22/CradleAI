import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeminiAdapter } from '../utils/gemini-adapter';
import { OpenRouterAdapter } from '../utils/openrouter-adapter';
import { OpenAIAdapter } from '../utils/openai-adapter';
import { CharacterUtils } from '../utils/character-utils';
import { 
    RoleCardJson,
    WorldBookJson,
    PresetJson,
    AuthorNoteJson,
    ChatMessage,
    ChatHistoryEntity,
    GeminiMessage,
    RegexScript,
    GlobalSettings,GlobalPresetConfig, GlobalWorldbookConfig,
} from '../../../shared/types';
import { MessagePart } from '@/shared/types';
import { memoryService } from '@/services/memory-service';
import { StorageAdapter } from '../utils/storage-adapter';
import { getApiSettings } from '@/utils/settings-helper';

export class NodeSTCore {

    // 添加静态属性用于存储最新请求/响应
    private static latestRequestData: {
        request: any;
        response?: string;
        timestamp: number;
        adapter: string;
        statusCode?: number;
        statusText?: string;
        errorMessage?: string;
    } | null = null;

    // 添加静态属性用于存储当前的 AbortController
    private static currentAbortController: AbortController | null = null;

    // 添加静态方法用于中止当前请求
    public static abortCurrentRequest(): boolean {
        if (NodeSTCore.currentAbortController) {
            NodeSTCore.currentAbortController.abort();
            NodeSTCore.currentAbortController = null;
            console.log('[NodeSTCore] 已中止当前请求');
            return true;
        }
        console.log('[NodeSTCore] 没有正在进行的请求可以中止');
        return false;
    }

    // 添加静态方法用于检查是否有正在进行的请求
    public static hasActiveRequest(): boolean {
        return NodeSTCore.currentAbortController !== null;
    }

    // 添加静态方法用于获取最新请求/响应
    public static getLatestRequestData() {
        // 新增：结构化解析响应，提取状态码、状态文本、错误信息

        return NodeSTCore.latestRequestData;
    }

    // 添加静态方法用于记录请求/响应
    public static logRequestResponse(request: any, response: string | null, adapter: string) {
        let statusCode: number | undefined = undefined;
        let statusText: string | undefined = undefined;
        let errorMessage: string | undefined = undefined;
       if (response) {
            try {
                let respObj: any = response;
                if (typeof response === 'string') {
                    // 可能是JSON字符串
                    if (response.trim().startsWith('{') || response.trim().startsWith('[')) {
                        respObj = JSON.parse(response);
                    }
                }
                // OpenAI/Gemini/OpenRouter 错误结构
                if (respObj && typeof respObj === 'object') {
                    // OpenAI: { error: { code, message, type } }
                    if (respObj.error) {
                        statusCode = respObj.error.code && typeof respObj.error.code === 'number'
                            ? respObj.error.code
                            : undefined;
                        statusText = respObj.error.type || respObj.error.code || 'error';
                        errorMessage = respObj.error.message || undefined;
                    }
                    // Gemini: { status: { code, message }, error: { message } }
                    if (respObj.status && typeof respObj.status === 'object') {
                        statusCode = respObj.status.code;
                        statusText = respObj.status.message;
                        if (respObj.error && respObj.error.message) {
                            errorMessage = respObj.error.message;
                        }
                    }
                    // OpenRouter: { detail, status_code }
                    if (respObj.status_code) {
                        statusCode = respObj.status_code;
                        statusText = respObj.detail || 'error';
                        errorMessage = respObj.detail || undefined;
                    }
                }
            } catch (e) {
                // ignore parse error
            }
        }
        NodeSTCore.latestRequestData = {
            request,
            response: response || undefined,
            timestamp: Date.now(),
            adapter
        };
        console.log(`[NodeSTCore][RequestLog] 已记录请求/响应，适配器: ${adapter}, 请求长度: ${JSON.stringify(request).length}, 响应长度: ${response?.length || 0}`);
    }    // 已知标签白名单（从ChatDialog.tsx同步）


    /**
     * 应用全局正则脚本到文本
     * @param text 输入文本
     * @param regexScripts 正则脚本数组
     * @param placement 1=用户输入, 2=AI输出
     */
    public static applyGlobalRegexScripts(
        text: string,
        regexScripts: any[],
        placement: 1 | 2,
        characterId?: string
        
    ): string {        // console.log(`[全局正则] 应用脚本，文本长度: ${text.length}, 脚本数量: ${regexScripts?.length || 0}, 位置: ${placement}`);
        if (!Array.isArray(regexScripts) || typeof text !== 'string') return text;
        
        let result = text;
        
        // 对于AI输出（placement = 2），首先应用默认的未知标签清理
        if (placement === 2) {
            console.log(`[NodeSTCore][DefaultTagCleaner] 跳过未知标签清理，原长度: ${text.length}, 清理后长度: ${result.length}`);
        }
        
        for (const script of regexScripts) {
            try {
                // =只应用与当前角色绑定或全部绑定的脚本 ===
                // 支持脚本带 groupBindType/bindCharacterId 字段（由前端注入或后端组装）
                // groupBindType: 'all' | 'character' | undefined
                // groupBindCharacterId: string | undefined
                // 兼容旧数据：如果没有groupBindType，默认全部可用
                if (script.groupBindType === 'all') {
                //  console.log(`[全局正则][绑定检查] 脚本${script.scriptName} 绑定类型=all，允许应用`);
                    
                    // 全部绑定，允许
                } else if (script.groupBindType === 'character') {
                    if (!characterId || script.groupBindCharacterId !== characterId) {
                // console.log(`[全局正则][绑定检查] 跳过脚本${script.scriptName}，绑定角色ID=${script.groupBindCharacterId}，当前角色ID=${characterId}`);

                        continue;
                    }
                } else if (typeof script.groupBindType !== 'undefined') {
                    // console.log(`[全局正则][绑定检查] 跳过脚本${script.scriptName}，未知绑定类型=${script.groupBindType}`);
                    // 其它未知类型，跳过
                    continue;
                }else {
            // === 新增：groupBindType为undefined时也输出日志 ===
            // console.log(`[全局正则][绑定检查] 脚本${script.scriptName} 未指定绑定类型（groupBindType=undefined），默认允许应用`);
        }
                if (script.disabled) continue;
                if (!script.placement || !script.placement.includes(placement)) continue;
                let findRegex = script.findRegex;
                const replaceString = script.replaceString ?? '';
                if (!findRegex) continue;

                // 支持 /pattern/flags 格式
                let pattern = findRegex;
                let flags = script.flags || '';
                
                // 如果 findRegex 形如 /xxx/gi，解析出 pattern 和 flags
                const regexMatch = /^\/(.+)\/([a-z]*)$/i.exec(findRegex);
                if (regexMatch) {
                    pattern = regexMatch[1];
                    const regexFlags = regexMatch[2];
                    
                    // 优先使用 findRegex 中的 flags，如果为空才使用 script.flags
                    if (regexFlags && regexFlags.trim() !== '') {
                        flags = regexFlags;
                    }
                    // 否则保持使用 script.flags
                }

                // 修正：flags 为空时自动补全为 'g'
                if (!flags || flags.trim() === '') flags = 'g';

                // 增加详细日志
                const before = result;
                console.log(`[NodeSTCore][GlobalRegex] 脚本${script.scriptName}: pattern="${pattern}", flags="${flags}", originalFindRegex="${findRegex}"`);
                const regex = new RegExp(pattern, flags);
                result = result.replace(regex, replaceString);
                if (before !== result) {
                    console.log(`[NodeSTCore][GlobalRegex] 脚本${script.scriptName} 匹配成功，替换前长度: ${before.length}, 替换后长度: ${result.length}`);
                }
            } catch (e) {
                console.warn('[NodeSTCore][GlobalRegex] 正则脚本执行异常:', script?.scriptName, e);
                continue;
            }
        }
        return result;
    }

    // 角色数据文件存储目录
    private static characterDataDir = FileSystem.documentDirectory + 'nodest_characters/';
        // 辅助方法：获取角色数据文件路径
    private getCharacterDataFilePath(key: string): string {
        // key 形如 nodest_{conversationId}_{suffix}
        return NodeSTCore.characterDataDir + key + '.json';
    }
    private geminiAdapter: GeminiAdapter | null = null;
    private openRouterAdapter: OpenRouterAdapter | null = null;
    private openAICompatibleAdapter: OpenAIAdapter | null = null;
    private currentContents: ChatMessage[] | null = null;
    private apiKey: string;
    private apiSettings: Partial<GlobalSettings['chat']> = {
        apiProvider: 'gemini'
    };
    private geminiPrimaryModel?: string;
    private geminiBackupModel?: string;
    private retryDelay?: number;

    // 立即总结记忆方法
    async summarizeMemoryNow(
        conversationId: string,
        characterId: string,
        apiKey: string,
        summaryRange?: { start: number, end: number },
        apiSettings?: Partial<GlobalSettings['chat']>
    ): Promise<boolean> {
        // 直接调用 memoryService 的 summarizeMemoryNow
        try {
            // 适配 apiSettings 结构
            let apiProvider: 'gemini' | 'openrouter' = 'gemini';
            let openrouter: any = undefined;
            if (apiSettings?.apiProvider === 'openrouter') {
                apiProvider = 'openrouter';
                openrouter = apiSettings.openrouter;
            }
            return await (memoryService as any).summarizeMemoryNow(
                conversationId,
                characterId,
                apiKey,
                {
                    apiProvider,
                    openrouter
                },
                summaryRange
            );
        } catch (e) {
            // console.error('[NodeSTCore] summarizeMemoryNow error:', e);
            return false;
        }
    }


    constructor(
        apiKey: string,
        apiSettings?: Partial<GlobalSettings['chat']>,
        // 新增参数
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ) {       
        this.apiKey = apiKey;
        this.apiSettings = getApiSettings();
        // 新增：保存gemini模型和retryDelay
        if (geminiOptions) {
            this.geminiPrimaryModel = geminiOptions.geminiPrimaryModel;
            this.geminiBackupModel = geminiOptions.geminiBackupModel;
            this.retryDelay = geminiOptions.retryDelay;
        }
        this.initAdapters(apiKey, this.apiSettings, geminiOptions);
    }

    updateApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        this.apiSettings = getApiSettings();
        
        // Initialize Gemini adapter with load balancing settings if available
        this.geminiAdapter = new GeminiAdapter(
            apiKey, 
            {
                useModelLoadBalancing: this.apiSettings?.useGeminiModelLoadBalancing || false,
                useKeyRotation: this.apiSettings?.useGeminiKeyRotation || false,
                additionalKeys: this.apiSettings?.additionalGeminiKeys || []
            }
        );

        if (this.apiSettings?.apiProvider === 'openrouter' && 
            this.apiSettings.openrouter?.enabled &&
            this.apiSettings.openrouter?.apiKey) {
            this.openRouterAdapter = new OpenRouterAdapter(
                this.apiSettings.openrouter.apiKey,
                this.apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
            );
        }
    }

    // Update method to handle API settings
    updateApiSettings(
        apiKey: string,
        apiSettings?: Partial<GlobalSettings['chat']>,
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ): void {
        this.apiKey = apiKey;
        this.apiSettings = getApiSettings();
        // 新增：保存gemini模型和retryDelay
        if (geminiOptions) {
            this.geminiPrimaryModel = geminiOptions.geminiPrimaryModel;
            this.geminiBackupModel = geminiOptions.geminiBackupModel;
            this.retryDelay = geminiOptions.retryDelay;
        }
        this.initAdapters(apiKey, this.apiSettings, geminiOptions);
    }

    private initAdapters(
        apiKey: string | null = null,
        apiSettings?: Partial<GlobalSettings['chat']>,        
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ) {
        const settings = getApiSettings();
        apiSettings = settings;
        // 不再为空 API 密钥抛出错误，而是记录一条消息
        if (!apiKey) {
            // console.log('[NodeSTCore] No API key provided, will attempt to use cloud service if available');
        }
    
        // 初始化 Gemini，允许 apiKey 为 null 或 empty，便于回退到云服务
        this.geminiAdapter = new GeminiAdapter(
            apiKey || "", // Pass empty string if null
            {
                useModelLoadBalancing: apiSettings?.useGeminiModelLoadBalancing || false,
                useKeyRotation: apiSettings?.useGeminiKeyRotation || false,
                additionalKeys: apiSettings?.additionalGeminiKeys || [],
                primaryModel: geminiOptions?.geminiPrimaryModel || this.geminiPrimaryModel,
                backupModel: geminiOptions?.geminiBackupModel || this.geminiBackupModel,
                retryDelay: geminiOptions?.retryDelay || this.retryDelay
            }
        );

        
        // 初始化 OpenRouter 如果已启用且有 API 密钥
        if (apiSettings?.apiProvider === 'openrouter' && 
            apiSettings.openrouter?.enabled && 
            apiSettings.openrouter?.apiKey) {
            this.openRouterAdapter = new OpenRouterAdapter(
                apiSettings.openrouter.apiKey,
                apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
            );
        } else {
            this.openRouterAdapter = null;
            console.log('[NodeSTCore] OpenRouter not enabled, using Gemini adapter only');
        }

        // 初始化 OpenAIAdapter（OpenAIcompatible）
        if (
            apiSettings?.apiProvider === 'openai-compatible' &&
            apiSettings.OpenAIcompatible?.enabled &&
            apiSettings.OpenAIcompatible?.apiKey &&
            apiSettings.OpenAIcompatible?.endpoint &&
            apiSettings.OpenAIcompatible?.model
        ) {
            this.openAICompatibleAdapter = new OpenAIAdapter({
                endpoint: apiSettings.OpenAIcompatible.endpoint,
                apiKey: apiSettings.OpenAIcompatible.apiKey,
                model: apiSettings.OpenAIcompatible.model
            });
        } else {
            this.openAICompatibleAdapter = null;
        }

        if (apiSettings) {
            this.apiSettings = apiSettings;
        }
    }

    private getActiveAdapter() {
        // 检查是否使用 OpenRouter
        if (this.apiSettings?.apiProvider === 'openrouter' && 
            this.apiSettings.openrouter?.enabled && 
            this.openRouterAdapter) {
            // console.log('[NodeSTCore] Using OpenRouter adapter with model:', 
            //     this.apiSettings.openrouter.model || 'default');
            return this.openRouterAdapter;
        }
        
        // 检查是否使用 OpenAIcompatible provider
        if (
            this.apiSettings?.apiProvider === 'openai-compatible' &&
            this.apiSettings.OpenAIcompatible?.enabled &&
            this.openAICompatibleAdapter
        ) {
            // console.log('[NodeSTCore] Using OpenAIAdapter with endpoint:', this.apiSettings.OpenAIcompatible.endpoint);
            return this.openAICompatibleAdapter;
        }

        // 返回 Gemini adapter（可能为 null）
        // 这允许 generateContent 尝试使用云服务
        console.log('[NodeSTCore] Using Gemini adapter' + (!this.geminiAdapter ? ' (not initialized)' : ''));
        return this.geminiAdapter;
    }

    private getStorageKey(conversationId: string, suffix: string = ''): string {
        return `nodest_${conversationId}${suffix}`;
    }

    private async saveJson(key: string, data: any): Promise<void> {
        try {
            // 统一全部写入文件
            await FileSystem.makeDirectoryAsync(NodeSTCore.characterDataDir, { intermediates: true }).catch(() => {});
            const filePath = this.getCharacterDataFilePath(key);
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving data for key ${key}:`, error);
            throw error;
        }
    }

    private async loadJson<T>(key: string): Promise<T | null> {
        try {
            // 统一全部从文件读取
            const filePath = this.getCharacterDataFilePath(key);
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) return null;
            const content = await FileSystem.readAsStringAsync(filePath);
            return content ? JSON.parse(content) : null;
        } catch (error) {
            console.error(`Error loading data for key ${key}:`, error);
            return null;
        }
    }

    private async saveContents(contents: ChatMessage[], sessionId: string): Promise<void> {
        try {
            const cleanedContents = contents.filter(item => item !== null);
            await this.saveJson(this.getStorageKey(sessionId, '_contents'), cleanedContents);
            this.currentContents = cleanedContents;
        } catch (error) {
            console.error('Error saving contents:', error);
            throw error;
        }
    }

    // Character Creation Methods
    async createNewCharacter(
        conversationId: string,
        roleCard: RoleCardJson,
        worldBook: WorldBookJson,
        preset: PresetJson,
        authorNote?: AuthorNoteJson,
        chatHistory?: ChatHistoryEntity,  // Add parameter for chatHistory
        options?: { isCradleGeneration?: boolean }
    ): Promise<boolean> {
        try {
            // Log the input parameters fully to verify what we're getting
            console.log('[NodeSTCore] createNewCharacter received parameters:', {
                conversationId,
                roleCardDefined: roleCard !== undefined && roleCard !== null,
                roleCardType: typeof roleCard,
                roleCardKeys: roleCard ? Object.keys(roleCard) : 'undefined roleCard',
                worldBookDefined: worldBook !== undefined && worldBook !== null,
                presetDefined: preset !== undefined && preset !== null,
                authorNoteDefined: !!authorNote,
                chatHistoryDefined: !!chatHistory
            });

            // CRITICAL: Create a defensive copy of roleCard to prevent modification issues
            const safeRoleCard: RoleCardJson = roleCard ? {
                name: roleCard.name || "Unnamed Character",
                first_mes: roleCard.first_mes || "Hello!",
                description: roleCard.description || "",
                personality: roleCard.personality || "",
                scenario: roleCard.scenario || "",
                mes_example: roleCard.mes_example || "",
                background: roleCard.background,
                data: roleCard.data
            } : {
                name: "Unnamed Character",
                first_mes: "Hello! (Default message)",
                description: "This character was created with missing information.",
                personality: "Friendly",
                scenario: "",
                mes_example: ""
            };

            console.log('[NodeSTCore] Using safe roleCard:', {
                name: safeRoleCard.name,
                hasMesExample: !!safeRoleCard.mes_example,
                hasDescription: !!safeRoleCard.description
            });

            // Safety check for worldBook
            const safeWorldBook: WorldBookJson = worldBook || { entries: {} };
            
            // Safety check for preset
            const safePreset: PresetJson = preset || { 
                prompts: [],
                prompt_order: [{ order: [] }]
            };

            // 保存角色相关文件 - use safe versions
            await Promise.all([
                this.saveJson(this.getStorageKey(conversationId, '_role'), safeRoleCard),
                this.saveJson(this.getStorageKey(conversationId, '_world'), safeWorldBook),
                this.saveJson(this.getStorageKey(conversationId, '_preset'), safePreset)
            ]);

            if (authorNote) {
                await this.saveJson(this.getStorageKey(conversationId, '_note'), authorNote);
            }

            // 初始化聊天历史
            if (chatHistory) {
                try {
                    console.log('[NodeSTCore] 初始化聊天历史，使用传入的聊天历史');
                    
                    // Ensure chatHistory has all required fields
                    const historyEntity: ChatHistoryEntity = {
                        name: chatHistory.name || "Chat History",
                        role: chatHistory.role || "system",
                        parts: chatHistory.parts || [],
                        identifier: chatHistory.identifier || "chatHistory"
                    };
                    
                    // If no first_mes in chatHistory but roleCard has it, add it
                    if (safeRoleCard.first_mes && 
                        !historyEntity.parts.some(p => p.is_first_mes)) {
                        
                        console.log('[NodeSTCore] 添加缺失的first_mes到聊天历史');
                        historyEntity.parts.unshift({
                            role: "model",
                            parts: [{ text: safeRoleCard.first_mes }],
                            is_first_mes: true
                        });
                    }
                    
                    // Extract D-entries to ensure they're properly injected
                    const dEntries = CharacterUtils.extractDEntries(
                        safePreset,
                        safeWorldBook,
                        authorNote
                    );
                    
                    // Insert D-entries if there are any
                    if (dEntries.length > 0) {
                        console.log('[NodeSTCore] 向聊天历史注入D类条目，数量:', dEntries.length);
                        const updatedHistory = this.insertDEntriesToHistory(
                            historyEntity,
                            dEntries,
                            ""  // No user message for initial history
                        );
                        
                        // Save the updated history with D-entries
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_history'),
                            updatedHistory
                        );
                        
                        console.log('[NodeSTCore] 聊天历史（含D类条目）初始化成功');
                    } else {
                        // Save the history without D-entries
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_history'),
                            historyEntity
                        );
                        
                        console.log('[NodeSTCore] 聊天历史（无D类条目）初始化成功');
                    }
                } catch (historyError) {
                    console.error('[NodeSTCore] Error initializing chat history:', historyError);
                    // Create default chat history as a fallback
                    this.createDefaultChatHistory(conversationId, safeRoleCard, safePreset, safeWorldBook, authorNote);
                }
            } else {
                console.log('[NodeSTCore] 未提供聊天历史，创建默认聊天历史');
                // Create default chat history when none is provided
                this.createDefaultChatHistory(conversationId, safeRoleCard, safePreset, safeWorldBook, authorNote);
            }

            try {
                // 构建初始框架 - wrap in try/catch to isolate errors
                console.log('[NodeSTCore] Building initial framework...');
                const [rFramework, chatHistory] = CharacterUtils.buildRFramework(
                    safePreset,
                    safeRoleCard,
                    safeWorldBook,
                    { isCradleGeneration: options?.isCradleGeneration || false }
                );
                
                console.log('[NodeSTCore] Framework built successfully:', {
                    rFrameworkLength: rFramework?.length || 0,
                    hasChatHistory: !!chatHistory
                });

                // 确保保存完整的框架内容
                await this.saveJson(
                    this.getStorageKey(conversationId, '_contents'),
                    rFramework
                );

                // Safely extract D-entries
                const dEntries = CharacterUtils.extractDEntries(safePreset, safeWorldBook, authorNote);

                // 初始化聊天历史
                if (chatHistory) {
                    try {
                        // 添加开场白
                        let historyParts: ChatMessage[] = [];
                        
                        if (safeRoleCard.first_mes) {
                            historyParts.push({
                                role: "model",
                                parts: [{ text: safeRoleCard.first_mes }],
                                is_first_mes: true
                            });
                        }

                        const historyEntity: ChatHistoryEntity = {
                            name: chatHistory.name || "Chat History",
                            role: chatHistory.role || "system",
                            parts: historyParts,
                            identifier: chatHistory.identifier
                        };

                        // 插入D类条目
                        const updatedHistory = this.insertDEntriesToHistory(
                            historyEntity,
                            dEntries,
                            ""
                        );
                        
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_history'),
                            updatedHistory
                        );
                        
                        console.log('[NodeSTCore] Chat history initialized successfully');
                    } catch (historyError) {
                        console.error('[NodeSTCore] Error initializing chat history:', historyError);
                        // Continue even if history initialization fails
                    }
                }

                return true;
            } catch (frameworkError) {
                console.error('[NodeSTCore] Error in framework creation:', frameworkError);
                
                // Try a minimal framework as fallback
                try {
                    console.log('[NodeSTCore] Attempting to create minimal framework as fallback...');
                    
                    // Create very simple framework
                    const minimalFramework: ChatMessage[] = [
                        {
                            name: "Character Info",
                            role: "user",
                            parts: [{ text: `Name: ${safeRoleCard.name}\nPersonality: ${safeRoleCard.personality}\nDescription: ${safeRoleCard.description}` }]
                        },
                        {
                            name: "Chat History",
                            role: "system",
                            parts: [{
                                role: "model", 
                                parts: [{ text: safeRoleCard.first_mes || "Hello!" }],
                                is_first_mes: true
                            } as unknown as MessagePart]
                        }
                    ];
                    
                    await this.saveJson(
                        this.getStorageKey(conversationId, '_contents'),
                        minimalFramework
                    );
                    
                    const minimalHistoryEntity: ChatHistoryEntity = {
                        name: "Chat History",
                        role: "system",
                        parts: [{
                            role: "model",
                            parts: [{ text: safeRoleCard.first_mes || "Hello!" }],
                            is_first_mes: true
                        } as ChatMessage],
                        identifier: "chatHistory"
                    };
                    
                    await this.saveJson(
                        this.getStorageKey(conversationId, '_history'),
                        minimalHistoryEntity
                    );
                    
                    console.log('[NodeSTCore] Minimal framework created as fallback');
                    return true;
                } catch (fallbackError) {
                    console.error('[NodeSTCore] Even fallback framework creation failed:', fallbackError);
                    throw frameworkError; // Throw the original error
                }
            }
        } catch (error) {
            console.error('[NodeSTCore] Error creating new character:', error);
            return false;
        }
    }
    
    // Helper method to create a default chat history
    private async createDefaultChatHistory(
        conversationId: string, 
        roleCard: RoleCardJson,
        preset: PresetJson,
        worldBook: WorldBookJson,
        authorNote?: AuthorNoteJson
    ): Promise<void> {
        try {
            console.log('[NodeSTCore] 创建默认聊天历史...');
            
            // Find Chat History identifier from preset if available
            let chatHistoryIdentifier = "chatHistory";
            if (preset && preset.prompt_order && preset.prompt_order[0]) {
                const order = preset.prompt_order[0].order || [];
                const chatHistoryEntry = order.find(entry => 
                    entry.identifier.toLowerCase().includes('chathistory'));
                if (chatHistoryEntry) {
                    chatHistoryIdentifier = chatHistoryEntry.identifier;
                }
            }
            
            // Create messages array with first_mes if available
            const historyParts: ChatMessage[] = [];
            if (roleCard.first_mes) {
                historyParts.push({
                    role: "model",
                    parts: [{ text: roleCard.first_mes }],
                    is_first_mes: true
                });
                console.log('[NodeSTCore] 添加角色第一条消息到默认聊天历史');
            }
            
            const historyEntity: ChatHistoryEntity = {
                name: "Chat History",
                role: "system",
                parts: historyParts,
                identifier: chatHistoryIdentifier
            };
            
            // Extract and insert D-entries (worldbook entries)
            const dEntries = CharacterUtils.extractDEntries(preset, worldBook, authorNote);
            
            if (dEntries.length > 0) {
                console.log('[NodeSTCore] 向默认聊天历史注入D类条目，数量:', dEntries.length);
                const updatedHistory = this.insertDEntriesToHistory(
                    historyEntity,
                    dEntries,
                    ""  // No user message for initial history
                );
                
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );
            } else {
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    historyEntity
                );
            }
            
            console.log('[NodeSTCore] 默认聊天历史创建完成');
        } catch (error) {
            console.error('[NodeSTCore] Error creating default chat history:', error);
            throw error;
        }
    }

    async updateCharacter(
        conversationId: string,
        roleCard: RoleCardJson,
        worldBook: WorldBookJson,
        preset: PresetJson,
        authorNote?: AuthorNoteJson
    ): Promise<boolean> {
        try {
            // 1. 保存原有聊天历史
            const existingHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );

            // 2. 强制重建框架内容
            const [rFramework, _] = CharacterUtils.buildRFramework(
                preset,
                roleCard,  // 使用最新的角色卡数据
                worldBook  // 使用最新的世界书信息
            );

            // 3. 重新提取D类条目
            const dEntries = CharacterUtils.extractDEntries(
                preset,
                worldBook,
                authorNote
            );

            // 4. 立即保存更新的文件和框架内容
            await Promise.all([
                this.saveJson(this.getStorageKey(conversationId, '_role'), roleCard),
                this.saveJson(this.getStorageKey(conversationId, '_world'), worldBook),
                this.saveJson(this.getStorageKey(conversationId, '_preset'), preset),
                this.saveJson(this.getStorageKey(conversationId, '_contents'), rFramework), // 保存新的框架内容
                authorNote ? 
                    this.saveJson(this.getStorageKey(conversationId, '_note'), authorNote) : 
                    Promise.resolve()
            ]);

            // 5. 如果存在原有聊天历史，立即应用新的D类条目
            if (existingHistory) {
                // 清除旧的D类条目
                existingHistory.parts = existingHistory.parts.filter(
                    msg => !msg.is_d_entry
                );

                // 重新插入新的D类条目
                const updatedHistory = this.insertDEntriesToHistory(
                    existingHistory,
                    dEntries,
                    existingHistory.parts[existingHistory.parts.length - 1]?.parts[0]?.text || ''
                );

                // 保存更新后的历史
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );

                console.log('[NodeSTCore] Updated character data:', {
                    hasNewFramework: !!rFramework?.length,
                    frameworkSize: rFramework?.length,
                    dEntriesCount: dEntries.length,
                    historyMessagesCount: updatedHistory.parts.length
                });
            }

            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error updating character:', error);
            return false;
        }
    }

    /**
     * 删除指定 aiIndex 的 AI 消息及其对应的用户消息
     * @param conversationId 会话ID
     * @param messageIndex aiIndex+1
     * @returns true/false
     */
    async deleteAiMessageByIndex(
        conversationId: string,
        messageIndex: number
    ): Promise<boolean> {
        try {
            // 加载历史
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            if (!chatHistory) {
                console.error('[NodeSTCore] deleteAiMessageByIndex: 未找到聊天历史');
                return false;
            }
            // 只保留非D类条目
            const realMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
            // 找到所有AI消息（非first_mes）
            const aiMessages = realMessages.filter(msg =>
                (msg.role === "model" || msg.role === "assistant") && !msg.is_first_mes
            );
            if (messageIndex < 1 || messageIndex > aiMessages.length) {
                console.error('[NodeSTCore] deleteAiMessageByIndex: messageIndex超出范围');
                return false;
            }
            // 目标AI消息
            const targetAiMsg = aiMessages[messageIndex - 1];
            // 找到其在realMessages中的索引
            const aiIdxInReal = realMessages.findIndex(msg => msg === targetAiMsg);
            if (aiIdxInReal === -1) {
                console.error('[NodeSTCore] deleteAiMessageByIndex: 找不到AI消息在realMessages中的索引');
                return false;
            }
            // 向前找到对应的用户消息
            let userIdxInReal = -1;
            for (let i = aiIdxInReal - 1; i >= 0; i--) {
                if (realMessages[i].role === "user") {
                    userIdxInReal = i;
                    break;
                }
            }
            if (userIdxInReal === -1) {
                console.error('[NodeSTCore] deleteAiMessageByIndex: 找不到对应的用户消息');
                return false;
            }
            // 记录要删除的消息内容
            const aiMsgToDelete = realMessages[aiIdxInReal];
            const userMsgToDelete = realMessages[userIdxInReal];
            // 构建新的parts（只移除这两条，保留D类条目）
            const newParts = chatHistory.parts.filter(msg =>
                // 保留D类条目
                msg.is_d_entry ||
                // 保留非目标AI和用户消息
                (msg !== aiMsgToDelete && msg !== userMsgToDelete)
            );
            // 更新历史
            const updatedHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: newParts
            };
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                updatedHistory
            );
            // 可选：日志
            console.log(`[NodeSTCore] 已删除AI消息及其用户消息，aiIndex=${messageIndex}, 新消息数=${updatedHistory.parts.length}`);
            return true;
        } catch (error) {
            console.error('[NodeSTCore] deleteAiMessageByIndex error:', error);
            return false;
        }
    }

    /**
      * 编辑指定 aiIndex 的 AI 消息内容
     * @param conversationId 会话ID
     * @param messageIndex aiIndex+1
     * @param newContent 新内容
     * @returns true/false
     */
    async editAiMessageByIndex(
        conversationId: string,
        messageIndex: number,
        newContent: string
    ): Promise<boolean> {
        try {
            // 加载历史
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            if (!chatHistory) {
                console.error('[NodeSTCore] editAiMessageByIndex: 未找到聊天历史');
                return false;
            }
            // 只保留非D类条目
            const realMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
            // 找到所有AI消息（非first_mes）
            const aiMessages = realMessages.filter(msg =>
                (msg.role === "model" || msg.role === "assistant") && !msg.is_first_mes
            );
            if (messageIndex < 1 || messageIndex > aiMessages.length) {
                console.error('[NodeSTCore] editAiMessageByIndex: messageIndex超出范围');
                return false;
            }
            // 目标AI消息
            const targetAiMsg = aiMessages[messageIndex - 1];

            // 在parts中的索引（必须用 === 判断对象引用）
            const aiMsgIdxInParts = chatHistory.parts.findIndex(msg => msg === targetAiMsg);
            if (aiMsgIdxInParts === -1) {
                console.error('[NodeSTCore] editAiMessageByIndex: 找不到AI消息在parts中的索引');
                return false;
            }

            // 直接替换目标AI消息的内容
            const updatedParts = [...chatHistory.parts];
            updatedParts[aiMsgIdxInParts] = {
                ...targetAiMsg,
                parts: [{ text: newContent }]
            };

            // 构建新的历史对象
            const updatedHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: updatedParts
            };

            // 立即保存
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                updatedHistory
            );
            console.log(`[NodeSTCore] 已编辑AI消息内容，aiIndex=${messageIndex}，新内容已保存`);

            // 不再自动重建D类条目，直接返回
            return true;
        } catch (error) {
            console.error('[NodeSTCore] editAiMessageByIndex error:', error);
            return false;
        }
    }

    async continueChat(
        conversationId: string,
        userMessage: string,
        apiKey: string | null = null, 
        characterId: string, // 改为必需参数
        customUserName?: string,
        useToolCalls: boolean = false,
        onStream?: (delta: string) => void ,
        summaryRange?: { start: number, end: number } 
    ): Promise<string | null> {
        try {
            // 创建新的 AbortController
            const abortController = new AbortController();
            NodeSTCore.currentAbortController = abortController;

            // 检查是否已被中止
            if (abortController.signal.aborted) {
                console.log('[NodeSTCore] 请求在开始前已被中止');
                return null;
            }
    
            // 确保 Adapter 已初始化 - 传递 apiKey 即使它是 null
            if (!this.geminiAdapter || !this.openRouterAdapter || !this.openAICompatibleAdapter) {
                this.initAdapters(apiKey, this.apiSettings);
            }
    
            // 获取正确的 adapter
            const adapter = this.getActiveAdapter();
            
            // 移除严格检查，允许接口回退到云服务
            if (!adapter) {
                console.warn("[NodeSTCore] API adapter not properly initialized - will attempt to use cloud service");
                // 不再抛出错误
            }

            // 确保加载最新的角色数据
            const roleCard = await this.loadJson<RoleCardJson>(
                this.getStorageKey(conversationId, '_role')
            );
            const worldBook = await this.loadJson<WorldBookJson>(
                this.getStorageKey(conversationId, '_world')
            );
            // === 新增：全局正则脚本处理（支持绑定） ===
            let globalRegexScripts: any[] = [];
            let globalRegexEnabled = false;
            try {
                // 读取所有正则脚本组，筛选全部绑定和当前角色绑定的组
                const regexGroups = await StorageAdapter.loadGlobalRegexScriptGroups?.() || [];
                console.log('[全局正则][筛选前] 所有脚本组:', regexGroups.map(g => ({
                            bindType: g.bindType,
                            bindCharacterId: g.bindCharacterId,
                            scriptsCount: Array.isArray(g.scripts) ? g.scripts.length : 0
                        })), '当前角色ID:', characterId);

                if (regexGroups.length > 0) {
    // === 修改点：flatMap 时赋值 groupBindType/groupBindCharacterId，并打印日志 ===
                        globalRegexScripts = regexGroups
                            .filter(g =>
                                g.bindType === 'all' ||
                                (g.bindType === 'character' && g.bindCharacterId && characterId && g.bindCharacterId === characterId)
                            )
                            .flatMap(g => {
                                if (Array.isArray(g.scripts)) {
                                    const scriptsWithBind = g.scripts.map(s => ({
                                        ...s,
                                        groupBindType: g.bindType,
                                        groupBindCharacterId: g.bindCharacterId
                                    }));
                                    console.log(`[全局正则] 处理脚本组，组bindType=${g.bindType}，组bindCharacterId=${g.bindCharacterId}，该组脚本数=${g.scripts.length}，已为每个脚本赋值绑定信息`);
                                    return scriptsWithBind;
                                }
                                return [];
                            });
                    // 新增：输出筛选后实际用到的脚本组日志
                    const usedGroups = regexGroups.filter(g =>
                        g.bindType === 'all' ||
                        (g.bindType === 'character' && g.bindCharacterId && characterId && g.bindCharacterId === characterId)
                    );
                    console.log('[全局正则][筛选后] 实际使用的脚本组:', usedGroups.map(g => ({
                        bindType: g.bindType,
                        bindCharacterId: g.bindCharacterId,
                        scriptsCount: Array.isArray(g.scripts) ? g.scripts.length : 0
                    })), '当前角色ID:', characterId);

                    
                } 
                const regexEnabledVal = await (await import('@react-native-async-storage/async-storage')).default.getItem('nodest_global_regex_enabled');
                globalRegexEnabled = regexEnabledVal === 'true';
            } catch (e) {
                console.warn('[NodeSTCore][GlobalRegex] 加载全局正则脚本失败:', e);
            }

            // 新增日志：全局正则启用与否及脚本列表
            if (globalRegexEnabled) {
                console.log(`[全局正则] 已启用，脚本数量: ${globalRegexScripts.length}`);
                globalRegexScripts.forEach((s, i) => {
                    console.log(`[全局正则] 脚本#${i+1}: 名称=${s.scriptName}，查找=${s.findRegex}，替换=${s.replaceString}，placement=${JSON.stringify(s.placement)}，flags=${s.flags||''}`);
                });
            } else {
                console.log('[全局正则] 未启用');
            }

            let processedUserMessage = userMessage;
            if (globalRegexEnabled && globalRegexScripts.length > 0) {
                // 仅应用 placement=1 的脚本
                processedUserMessage = NodeSTCore.applyGlobalRegexScripts(userMessage, globalRegexScripts, 1,characterId);
                if (processedUserMessage !== userMessage) {
                    console.log(`[全局正则] 已对用户输入应用正则处理，原文: ${userMessage}，结果: ${processedUserMessage}`);
                }
            }
            // === 新增：优先读取全局预设 ===
            let preset: PresetJson | null = null;
            const globalPresetConfig = await StorageAdapter.loadGlobalPresetConfig();
            if (globalPresetConfig && globalPresetConfig.enabled && globalPresetConfig.presetJson) {
                preset = globalPresetConfig.presetJson;
                console.log('[NodeSTCore] Using global preset for continueChat');
            } else {
                preset = await this.loadJson<PresetJson>(
                    this.getStorageKey(conversationId, '_preset')
                );
            }

            const authorNote = await this.loadJson<AuthorNoteJson>(
                this.getStorageKey(conversationId, '_note')
            );
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );

            console.log('[NodeSTCore] Character data loaded:', {
                hasRoleCard: !!roleCard,
                hasWorldBook: !!worldBook,
                hasPreset: !!preset,
                hasAuthorNote: !!authorNote,
                hasChatHistory: !!chatHistory,
                historyLength: chatHistory?.parts?.length
            });

            // Validate required data
            if (!roleCard || !worldBook || !preset || !chatHistory) {
                const missingData = [];
                if (!roleCard) missingData.push('roleCard');
                if (!worldBook) missingData.push('worldBook');
                if (!preset) missingData.push('preset');
                if (!chatHistory) missingData.push('chatHistory');

                const errorMessage = `Missing required data: ${missingData.join(', ')}`;
                console.error('[NodeSTCore]', errorMessage);
                return null;
            }

            // 重要：强制重新提取D类条目，确保使用最新的worldBook
            const dEntries = CharacterUtils.extractDEntries(
                preset!,
                worldBook!,
                authorNote ?? undefined
            );
            
            // NEW CODE: Load character data to check for custom user settings
            if (characterId) {
                try {
                    // Try to dynamically import AsyncStorage if not available directly
                    let AsyncStorage = null;
                    try {
                        AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                    } catch (importError) {
                        console.log('[NodeSTCore] Unable to import AsyncStorage:', importError);
                    }
                    
                    if (AsyncStorage) {
                        // Check for global custom user settings first (they're usually smaller)
                        const globalSettingsKey = 'global_user_custom_setting';
                        let globalCustomSetting = null;
                        
                        try {
                            const globalSettingsData = await AsyncStorage.getItem(globalSettingsKey);
                            if (globalSettingsData) {
                                globalCustomSetting = JSON.parse(globalSettingsData);
                                if (globalCustomSetting && !globalCustomSetting.disable) {
                                    console.log('[NodeSTCore] Found global custom user setting:', globalCustomSetting.comment);
                                    const formattedContent = `The following are some information about the character {{user}} I will be playing.\n\n<{{user}}'s_info>${globalCustomSetting.content}</{{user}}'s_info>`;

                                    // Convert global custom setting to D-entry format
                                    const globalCustomDEntry: ChatMessage = {
                                        role: "user",
                                        parts: [{ text: formattedContent }],
                                        name: globalCustomSetting.comment || "自设",
                                        is_d_entry: true,
                                        position: globalCustomSetting.position || 4,
                                        injection_depth: globalCustomSetting.depth || 1,
                                        constant: true
                                    };
                                    
                                    // Add to D-entries array
                                    dEntries.push(globalCustomDEntry);
                                    console.log('[NodeSTCore] Added global custom user setting to D-entries');
                                }
                            }
                        } catch (globalSettingError) {
                            console.error('[NodeSTCore] Error parsing global custom settings:', globalSettingError);
                        }
                        
                        // Check for character-specific custom user setting with error handling for large data
                        const characterKey = `character_${characterId}`;
                        try {
                            // First try the standard approach
                            const characterData = await AsyncStorage.getItem(characterKey);
                            if (characterData) {
                                const character = JSON.parse(characterData);
                                this.processCharacterCustomSetting(character, dEntries);
                            }
                        } catch (error) {
                            // Type check the error before using it
                            const largeRowError = error as Error;
                            // If we hit the "Row too big" error, try with a more specific approach
                            console.warn('[NodeSTCore] Error with standard character loading, trying alternative approach:', largeRowError.message);
                            
                            if (largeRowError instanceof Error && largeRowError.message.includes('Row too big')) {
                                try {
                                    // Create smaller keys specifically for the custom setting
                                    const customSettingKey = `character_${characterId}_custom_setting`;
                                    const hasCustomSettingKey = `character_${characterId}_has_custom`;
                                    
                                    // Get the specific custom setting data
                                    const customSettingData = await AsyncStorage.getItem(customSettingKey);
                                    const hasCustomSetting = await AsyncStorage.getItem(hasCustomSettingKey);
                                    
                                    if (customSettingData && hasCustomSetting === 'true') {
                                        const customSetting = JSON.parse(customSettingData);
                                        
                                        if (customSetting && !customSetting.disable && !customSetting.global) {
                                            console.log('[NodeSTCore] Found character-specific custom setting via alternative method:', 
                                                customSetting.comment);
                                            
                                                            // Format the custom setting content with the wrapper
                                                            const formattedContent = `The following are some information about the character {{user}} I will be playing.\n\n<{{user}}'s_info>${customSetting.content}</{{user}}'s_info>`;

                                                            // Convert to D-entry
                                                            const characterCustomDEntry: ChatMessage = {
                                                                role: "user",
                                                                parts: [{ text: formattedContent }],
                                                                name: customSetting.comment || "自设",
                                                                is_d_entry: true,
                                                                position: customSetting.position || 4,
                                                                injection_depth: customSetting.depth || 1,
                                                                constant: true
                                                            };
                                            
                                            dEntries.push(characterCustomDEntry);
                                            console.log('[NodeSTCore] Added character-specific custom setting to D-entries (alternative method)');
                                        }
                                    }
                                } catch (alternativeError) {
                                    console.error('[NodeSTCore] Alternative method for loading custom settings failed:', alternativeError);
                                }
                            }
                        }
                    }
                } catch (customSettingError) {
                    console.warn('[NodeSTCore] Error loading custom user settings:', customSettingError);
                    // Continue without custom settings if there's an error
                }
            }

            // 记忆搜索功能，在消息发送前尝试检索相关记忆
            let memorySearchResults = null;
            if (characterId) {
                try {
                    console.log('[NodeSTCore] 开始搜索角色相关记忆:', {
                        characterId,
                        conversationId,
                        queryLength: userMessage.length
                    });
                    
                    // 尝试导入并使用Mem0Service
                    let Mem0Service = null;
                    try {
                        // 动态导入以避免循环依赖
                        Mem0Service = (await import('@/src/memory/services/Mem0Service.ts')).default.getInstance();
                    } catch (importError) {
                        console.log('[NodeSTCore] 无法导入Mem0Service:', importError);
                    }
                    
                    if (Mem0Service) {
                        // 使用记忆服务搜索相关记忆
                        memorySearchResults = await Mem0Service.searchMemories(
                            userMessage,
                            characterId,
                            conversationId,
                            5 // 限制返回最相关的5条记忆
                        );
                        
                        console.log('[NodeSTCore] 记忆搜索完成:', {
                            resultsCount: memorySearchResults?.results?.length || 0,
                            success: !!memorySearchResults
                        });
                        
                        // 记录找到的记忆内容
                        if (memorySearchResults?.results?.length > 0) {
                            memorySearchResults.results.forEach((item: any, idx: number) => {
                                const memory = item.memory.substring(0, 100) + (item.memory.length > 100 ? '...' : '');
                                console.log(`[NodeSTCore] 记忆 #${idx+1}: ${memory} (相似度: ${item.score?.toFixed(4) || 'N/A'})`);
                            });
                        }
                    } else {
                        console.log('[NodeSTCore] 记忆服务不可用，跳过记忆搜索');
                    }
                } catch (memoryError) {
                    console.warn('[NodeSTCore] 记忆搜索失败，但不影响主要会话流程:', memoryError);
                    // 记忆搜索失败不应阻止对话继续
                }
            }

            // 修改：只在这里添加用户消息
            const updatedChatHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: [
                    ...(chatHistory.parts?.filter(msg => 
                        !msg.is_d_entry && 
                        msg.parts[0]?.text !== userMessage
                    ) || []),
                    {
                        role: "user",
                        parts: [{ text: userMessage }]
                    } as ChatMessage
                ]
            };

            // NEW: Check if we need to summarize the chat history
            if (characterId) {
                try {
                    console.log('[NodeSTCore] Checking if chat history needs summarization...');
                    // Only attempt summarization if we have an API key
                    const summarizedHistory = apiKey ? 
                        await memoryService.checkAndSummarize(
                            conversationId,
                            characterId,
                            updatedChatHistory,
                            apiKey,
                            {
                                apiProvider: this.apiSettings.apiProvider === 'openrouter' ? 'openrouter' : 'gemini',
                                openrouter: this.apiSettings.openrouter,
                            },
                            summaryRange
                        ) : updatedChatHistory;
                    
                    // Use the potentially summarized history
                    if (summarizedHistory !== updatedChatHistory) {
                        console.log('[NodeSTCore] Chat history was summarized');
                        updatedChatHistory.parts = summarizedHistory.parts;
                    }
                } catch (summaryError) {
                    console.error('[NodeSTCore] Error in chat summarization:', summaryError);
                    // Continue with unsummarized history
                }
            }

            // 处理对话
            console.log('[NodeSTCore] Processing chat...', {
                characterId_passed_to_processChat: characterId // <--- 记录传递给processChat的characterId
            });

            // 检查是否已被中止
            if (abortController.signal.aborted) {
                console.log('[NodeSTCore] 请求在处理对话时被中止');
                NodeSTCore.currentAbortController = null;
                return null;
            }

            const response = useToolCalls 
                ? await this.processChatWithTools(
                    userMessage,
                    updatedChatHistory,
                    dEntries,
                    conversationId,
                    roleCard,
                    characterId, // 必需参数移到前面
                    adapter || undefined,
                    customUserName,
                    memorySearchResults,
                    onStream,
                    abortController // 传递 abort controller
                )
                : await this.processChat(
                    userMessage,
                    updatedChatHistory,
                    dEntries,
                    conversationId,
                    roleCard,
                    characterId, // 必需参数移到前面
                    adapter || undefined,
                    customUserName,
                    memorySearchResults,
                    onStream,
                    abortController // 传递 abort controller
                );

            // === 新增：对AI响应应用全局正则脚本（placement=2） ===
            let processedResponse = response;
            if (globalRegexEnabled && globalRegexScripts.length > 0 && typeof response === 'string') {
                // 只筛选与当前characterId匹配的脚本组
                const filteredScripts = globalRegexScripts.filter(
                    s =>
                        s.groupBindType === 'all' ||
                        (s.groupBindType === 'character' && s.groupBindCharacterId && characterId && s.groupBindCharacterId === characterId)
                );
                const before = response;
                processedResponse = NodeSTCore.applyGlobalRegexScripts(response, filteredScripts, 2, characterId);
                if (processedResponse !== before) {
                    console.log(`[全局正则] 已对AI响应应用正则处理，原文: ${before}，结果: ${processedResponse}`);
                } else {
                    console.log('[全局正则] AI响应未被正则脚本修改。');
                }
            }

            // 如果收到响应，将AI回复也添加到历史记录
            if (processedResponse) {
                // 使用 updateChatHistory 方法
                const updatedHistory = this.updateChatHistory(
                    updatedChatHistory,
                    userMessage,
                    processedResponse, // 用正则处理后的响应
                    dEntries
                );

                // 保存更新后的历史
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );

                console.log('[NodeSTCore] Chat history saved:', {
                    totalMessages: updatedHistory.parts.length,
                    lastMessage: processedResponse.substring(0, 50) + '...'
                });
            }

            // Save updated history if we have a response
            if (processedResponse) {
                console.log('[NodeSTCore] Saving updated history...');
                
                // 检查是否已被中止
                if (abortController.signal.aborted) {
                    console.log('[NodeSTCore] 请求在保存历史前被中止，不保存历史');
                    NodeSTCore.currentAbortController = null;
                    return null;
                }

                const updatedHistory = this.updateChatHistory(
                    updatedChatHistory,
                    userMessage,
                    processedResponse, // 用正则处理后的响应
                    dEntries
                );
                
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );
                console.log('[NodeSTCore] History saved successfully');
            }

            // 清理 AbortController
            NodeSTCore.currentAbortController = null;
            
            return processedResponse;
        } catch (error) {
            console.error('[NodeSTCore] Error in continueChat:', error);
            // 确保在错误时也清理 AbortController
            NodeSTCore.currentAbortController = null;
            return null;
        }
    }

    private processCharacterCustomSetting(character: any, dEntries: ChatMessage[]): void {
        // Check for character-specific custom user setting
        if (character.hasCustomUserSetting && 
            character.customUserSetting && 
            !character.customUserSetting.disable &&
            !character.customUserSetting.global) { // Only use character-specific if not global
            
            console.log('[NodeSTCore] Found character-specific custom user setting:', character.customUserSetting.comment);
            
            // Format the custom setting content with the wrapper
            const formattedContent = `The following are some information about the character {{user}} I will be playing.\n\n<{{user}}'s_info>${character.customUserSetting.content}</{{user}}'s_info>`;
            
            // Convert character custom setting to D-entry format
            const characterCustomDEntry: ChatMessage = {
                role: "user",
                parts: [{ text: formattedContent }],
                name: character.customUserSetting.comment || "自设",
                is_d_entry: true,
                position: character.customUserSetting.position || 4,
                injection_depth: character.customUserSetting.depth || 1,
                constant: true
            };
            
            // Add to D-entries array
            dEntries.push(characterCustomDEntry);
            console.log('[NodeSTCore] Added character-specific custom user setting to D-entries');
        }
    }

    // Helper methods for processing and history management
    private shouldIncludeDEntry(
        entry: ChatMessage,
        messages: ChatMessage[]
    ): boolean {
        // 作者注释始终包含
        if (entry.is_author_note || entry.name === "Author Note") {
            return true;
        }

        // constant = true 的条目始终包含
        if (entry.constant === true) {
            console.log('[NodeSTCore] Including constant entry:', entry.name);
            return true;
        }

        // constant = false 的条目必须通过 key 匹配
        if (entry.constant === false) {
            if (!entry.key || entry.key.length === 0) {
                console.log('[NodeSTCore] Excluding entry - no keys defined:', entry.name);
                return false;
            }

            // 检查是否包含任何关键词
            const allText = messages
                .map(msg => msg.parts?.[0]?.text || '')
                .join(' ')
                .toLowerCase();

            const hasMatchingKey = entry.key.some(key => 
                allText.includes(key.toLowerCase())
            );

            console.log('[NodeSTCore] Key match check for entry:', {
                name: entry.name,
                keys: entry.key,
                matched: hasMatchingKey
            });

            return hasMatchingKey;
        }

        // 如果既不是 constant = true，也不是通过 key 匹配的，则不包含
        return false;
    }

    insertDEntriesToHistory(
        chatHistory: ChatHistoryEntity,
        dEntries: ChatMessage[],
        userMessage: string
    ): ChatHistoryEntity {
        console.log('[NodeSTCore] Starting D-entries insertion:', {
            chatHistoryMessages: chatHistory.parts.length,
            dEntriesCount: dEntries.length,
            baseMessage: userMessage.substring(0, 30)
        });

        // 1. 先移除所有旧的D类条目，确保不会重复
        const chatMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
        
        console.log(`[NodeSTCore] Removed ${chatHistory.parts.length - chatMessages.length} old D-entries`);

        // 2. 找到基准消息（最新的用户消息）的索引
        const baseMessageIndex = chatMessages.findIndex(
            msg => msg.role === "user" && msg.parts[0]?.text === userMessage
        );

        if (baseMessageIndex === -1) {
            console.warn('[NodeSTCore] Base message not found in history');
            return {
                ...chatHistory,
                parts: chatMessages // 返回没有D类条目的干净历史
            };
        }

        // 3. 先过滤符合条件的 D 类条目
        const validDEntries = dEntries.filter(entry => 
            this.shouldIncludeDEntry(entry, chatMessages)
        );

        console.log(`[NodeSTCore] Filtered D-entries: ${validDEntries.length} valid out of ${dEntries.length} total`);

        // 对过滤后的条目按注入深度分组，确保只在正确的位置插入
        const position4EntriesByDepth = validDEntries
            .filter(entry => entry.position === 4)
            .reduce((acc, entry) => {
                // 确保注入深度是有效数字，默认为0
                const depth = typeof entry.injection_depth === 'number' ? entry.injection_depth : 0;
                if (!acc[depth]) acc[depth] = [];
                acc[depth].push({
                    ...entry,
                    // 确保明确标记为D类条目，以便下一次更新时可以清除
                    is_d_entry: true
                });
                return acc;
            }, {} as Record<number, ChatMessage[]>);

        // 4. 构建新的消息序列
        const finalMessages: ChatMessage[] = [];
        
        // 4.1 从第一条消息开始，往后遍历插入消息和D类条目
        for (let i = 0; i < chatMessages.length; i++) {
            const msg = chatMessages[i];

            // 只有非基准消息（不是最新用户消息）且在基准消息之前的消息可能有D类条目插入前面
            if (i < baseMessageIndex) {
                // 计算与基准消息的深度差
                const depthFromBase = baseMessageIndex - i;
                // 只有深度大于0时才在消息前插入D类条目（depth=0的条目只在基准消息后插入）
                if (depthFromBase > 0 && position4EntriesByDepth[depthFromBase]) {
                    console.log(`[NodeSTCore] Inserting ${position4EntriesByDepth[depthFromBase].length} D-entries with depth=${depthFromBase} before message at position ${i}`);
                    finalMessages.push(...position4EntriesByDepth[depthFromBase]);
                }
            }

            // 插入当前消息
            finalMessages.push(msg);

            // 如果是基准消息（最新用户消息），在其后插入depth=0的条目
            if (i === baseMessageIndex && position4EntriesByDepth[0]) {
                console.log(`[NodeSTCore] Inserting ${position4EntriesByDepth[0].length} D-entries with depth=0 after base message`);
                finalMessages.push(...position4EntriesByDepth[0]);
            }
        }

        // 5. 处理其他position的条目（从validDEntries中筛选）
        const otherDEntries = validDEntries.filter(entry => entry.position !== 4).map(entry => ({
            ...entry,
            is_d_entry: true // 确保明确标记为D类条目
        }));
        
        for (const entry of otherDEntries) {
            // 对于authorNote相关条目（position=2或3），如果存在作者注释，则在前后插入
            const authorNoteIndex = finalMessages.findIndex(msg => msg.is_author_note);
            if (authorNoteIndex !== -1) {
                if (entry.position === 2) {
                    finalMessages.splice(authorNoteIndex, 0, entry);
                    console.log(`[NodeSTCore] Inserted position=2 entry before author note: ${entry.name}`);
                } else if (entry.position === 3) {
                    finalMessages.splice(authorNoteIndex + 1, 0, entry);
                    console.log(`[NodeSTCore] Inserted position=3 entry after author note: ${entry.name}`);
                }
            } else if (entry.is_author_note) {
                // 如果条目本身是作者注释且历史中尚不存在，添加到末尾
                finalMessages.push(entry);
                console.log(`[NodeSTCore] Added missing author note: ${entry.name}`);
            }
        }

        // 6. 检查最终的消息序列中的D类条目数量，确保正确标记
        const dEntryCount = finalMessages.filter(msg => msg.is_d_entry).length;
        console.log(`[NodeSTCore] Final message sequence has ${dEntryCount} D-entries out of ${finalMessages.length} total messages`);

        // 7. 添加详细的调试日志，显示消息顺序和类型以及D类条目的注入深度
        // console.log('[NodeSTCore] Message sequence after D-entry insertion:', 
        //     finalMessages.map((msg, idx) => ({
        //         index: idx,
        //         type: msg.is_d_entry ? 'D-entry' : 'chat',
        //         role: msg.role,
        //         depth: msg.is_d_entry ? msg.injection_depth || 0 : 'N/A',
        //         position: msg.position,
        //         isBaseMessage: msg.parts[0]?.text === userMessage,
        //         preview: msg.parts[0]?.text?.substring(0, 30)
        //     }))
        // );

        return {
            ...chatHistory,
            parts: finalMessages
        };
    }

    private updateChatHistory(
        chatHistory: ChatHistoryEntity,
        userMessage: string,
        aiResponse: string,
        dEntries: ChatMessage[]
    ): ChatHistoryEntity {
        console.log('[NodeSTCore] Updating chat history with new messages and D-entries');
        
        // 1. 保留非D类条目的历史消息
        const cleanHistory = chatHistory.parts.filter(msg => !msg.is_d_entry);
        console.log(`[NodeSTCore] Removed ${chatHistory.parts.length - cleanHistory.length} old D-entries from history`);

        // 2. 添加新的用户消息（如果不存在）
        const userMessageExists = cleanHistory.some(msg => 
            msg.role === "user" && msg.parts[0]?.text === userMessage
        );

        if (!userMessageExists) {
            cleanHistory.push({
                role: "user",
                parts: [{ text: userMessage }]
            });
            console.log('[NodeSTCore] Added new user message to history');
        }

        // 3. 添加AI响应（如果有且不存在）
        if (aiResponse) {
            const aiResponseExists = cleanHistory.some(msg =>
                msg.role === "model" && msg.parts[0]?.text === aiResponse
            );

            if (!aiResponseExists) {
                cleanHistory.push({
                    role: "model",
                    parts: [{ text: aiResponse }]
                });
                console.log('[NodeSTCore] Added new AI response to history');
            }
        }

        // 4. 使用最新的消息作为基准，重新插入D类条目
        // 确保传递的是干净历史（没有D类条目的）
        const updatedHistory = this.insertDEntriesToHistory(
            {
                ...chatHistory,
                parts: cleanHistory
            },
            dEntries,
            userMessage
        );

        console.log('[NodeSTCore] Updated chat history summary:', {
            originalMessagesCount: chatHistory.parts.length,
            cleanHistoryCount: cleanHistory.length,
            finalMessagesCount: updatedHistory.parts.length,
            dEntriesCount: updatedHistory.parts.filter(msg => msg.is_d_entry).length,
            hasUserMessage: userMessageExists,
            hasAiResponse: aiResponse ? true : false
        });

        return updatedHistory;
    }

    async processChat(
        userMessage: string,
        chatHistory: ChatHistoryEntity,
        dEntries: ChatMessage[],
        sessionId: string,
        roleCard: RoleCardJson,
        characterId: string, // 必需参数移到前面
        adapter?: GeminiAdapter | OpenRouterAdapter | OpenAIAdapter | null,
        customUserName?: string,
        memorySearchResults?: any,
        onStream?: (delta: string) => void,
        abortController?: AbortController
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting processChat with:', {
                userMessage: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
                chatHistoryMessagesCount: chatHistory?.parts?.length,
                dEntriesCount: dEntries.length,
                apiProvider: this.apiSettings?.apiProvider,
                hasCustomUserName: !!customUserName,
                characterId: characterId // <--- 记录characterId
            });

            // 检查是否已被中止
            if (abortController?.signal.aborted) {
                console.log('[NodeSTCore] processChat 被中止');
                return null;
            }

            // === 新增：优先读取全局预设 ===
            let preset: PresetJson | null = null;
            const globalPresetConfig = await StorageAdapter.loadGlobalPresetConfig();
            const isGlobalPreset = !!(globalPresetConfig && globalPresetConfig.enabled && globalPresetConfig.presetJson);
            if (isGlobalPreset) {
                preset = globalPresetConfig.presetJson;
                console.log('[NodeSTCore] Using global preset for processChat');
            } else {
                preset = await this.loadJson<PresetJson>(`nodest_${sessionId}_preset`);
            }

            const worldBook = await this.loadJson<WorldBookJson>(`nodest_${sessionId}_world`);
            if (!preset || !worldBook) {
                throw new Error('Required data not found');
            }

            let contents: ChatMessage[] = [];
            let needRebuildFramework = false;

            if (isGlobalPreset) {
                needRebuildFramework = true;
            } else {
                const existingContents = await this.loadJson<ChatMessage[]>(
                    this.getStorageKey(sessionId, '_contents')
                );
                if (!existingContents || existingContents.length === 0) {
                    needRebuildFramework = true;
                } else {
                    contents = [...existingContents];
                }
            }

            if (needRebuildFramework) {
                console.log('[NodeSTCore] Rebuilding framework due to global preset or missing contents...');
                const [rFramework, _] = CharacterUtils.buildRFramework(
                    preset,
                    roleCard,
                    worldBook
                );
                contents = [...rFramework];
                await this.saveContents(contents, sessionId);
            }

            // === 全局正则处理脚本准备 ===
            let globalRegexScripts: any[] = [];
            let globalRegexEnabled = false;
            try {
            } catch (e) {
                // console.warn('[NodeSTCore][GlobalRegex] 加载全局正则脚本失败:', e);
            }

            const applyAllRegex = (text: string) => {
                let t = text;
                if (roleCard?.data?.extensions?.regex_scripts) {
                    t = this.applyRegexScripts(t, roleCard.data.extensions.regex_scripts);
                }
                return t;
            };

            const regexProcessedContents: ChatMessage[] = contents.map(item => {
                if (item.name === "Chat History" && Array.isArray(item.parts)) {
                    return {
                        ...item,
                        parts: item.parts.map((msg: any) => ({
                            ...msg,
                            parts: msg.parts?.map((part: any) => ({
                                ...part,
                                text: applyAllRegex(part.text || "")
                            })) || []
                        }))
                    };
                } else {
                    return {
                        ...item,
                        parts: item.parts?.map(part => ({
                            ...part,
                            text: applyAllRegex(part.text || "")
                        })) || []
                    };
                }
            });

            // 3. 查找聊天历史占位符的位置
            const chatHistoryPlaceholderIndex = regexProcessedContents.findIndex(
                item => item.is_chat_history_placeholder ||
                       (item.identifier === chatHistory.identifier)
            );

            // === 关键修正：用最新 chatHistory（含 userMessage/AI 回复）插入 D-entries ===
            const historyWithDEntries = this.insertDEntriesToHistory(
                {
                    ...chatHistory,
                    parts: chatHistory.parts.filter(msg => !msg.is_d_entry)
                },
                dEntries,
                userMessage
            );

            if (chatHistoryPlaceholderIndex !== -1) {
                regexProcessedContents[chatHistoryPlaceholderIndex] = {
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                };
            } else {
                regexProcessedContents.push({
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                });
            }

            // 7. 去重
            const chatHistoryEntries = regexProcessedContents.filter(
                item => item.name === "Chat History" ||
                       (item.identifier && item.identifier.toLowerCase().includes('chathistory'))
            );
            if (chatHistoryEntries.length > 1) {
                regexProcessedContents.splice(
                    regexProcessedContents.findIndex((item, idx) =>
                        (item.name === "Chat History" ||
                        (item.identifier && item.identifier.toLowerCase().includes('chathistory'))) &&
                        idx !== chatHistoryPlaceholderIndex
                    ), 1
                );
            }

            // 8. cleanContentsForGemini 只做宏替换，不再做正则
            let cleanedContents = this.cleanContentsForGemini(
                regexProcessedContents,
                userMessage,
                roleCard.name,
                customUserName || "",
                roleCard
            );

            // === 新增：对rframework整体应用全局正则（placement=1），但不影响chathistory和D-entry逻辑 ===
            // if (globalRegexEnabled && globalRegexScripts.length > 0) {
            //     cleanedContents = cleanedContents.map(msg => {
            //         // 只对非chathistory的内容应用正则，且只对placement=1的脚本
            //         if (
            //             msg.role === "user" || msg.role === "model"
            //         ) {
            //             return {
            //                 ...msg,
            //                 parts: msg.parts.map(part => ({
            //                     ...part,
            //                     text: NodeSTCore.applyGlobalRegexScripts(part.text || "", globalRegexScripts, 1,characterId)
            //                 }))
            //             };
            //         }
            //         return msg;
            //     });
            // }

            // 添加最终请求内容的完整日志
            console.log('[NodeSTCore] Final Gemini request structure:', {
                totalMessages: cleanedContents.length,
                messageSequence: cleanedContents.map(msg => ({
                    role: msg.role,
                    type: msg.is_d_entry ? 'D-entry' : 'chat',
                    depth: msg.injection_depth,
                    preview: msg.parts[0]?.text?.substring(0, 30)
                }))
            });
            
            // 打印完整的请求内容以便检查
            // console.log('[NodeSTCore] COMPLETE API REQUEST CONTENT:');
            // cleanedContents.forEach((msg, i) => {
            //     // console.log(`[Message ${i+1}] Role: ${msg.role}`);
            //     msg.parts.forEach((part, j) => {
            //         // console.log(`[Message ${i+1}][Part ${j+1}] Content length: ${part.text?.length || 0} chars`);
            //     });
            // });

            // 验证是否还有消息要发送
            if (cleanedContents.length === 0) {
                throw new Error('No valid messages to send to Gemini API');
            }

            // 使用传入的适配器或获取活跃适配器
            const activeAdapter = adapter || this.getActiveAdapter();
            if (!activeAdapter) {
                console.warn("[NodeSTCore] No API adapter available - will attempt to use cloud service");
                // 不再抛出错误，让 generateContentWithTools 方法尝试云服务
            }

            // 添加适配器类型日志
            console.log('[NodeSTCore] Using adapter:', {
                type:
                    activeAdapter instanceof OpenRouterAdapter
                        ? 'OpenRouter'
                        : activeAdapter instanceof OpenAIAdapter
                        ? 'OpenAICompatible'
                        : 'Gemini',
                apiProvider: this.apiSettings?.apiProvider
            });
        // === 新增：记录请求体数据 ===
        NodeSTCore.logRequestResponse(cleanedContents, null, adapter ? adapter.constructor.name : 'unknown');
            // 发送到API
            let responseText: string | null = null;
            // === 修正：只在没有记忆搜索结果时才直接请求chatCompletion ===
            const shouldUseMemoryResults = memorySearchResults && 
                memorySearchResults.results && 
                memorySearchResults.results.length > 0;
            // === 修正：只调用一次 generateContent 或 generateContentWithTools，不再直接调用 chatCompletion ===
            if (activeAdapter instanceof OpenAIAdapter) {
                this.apiSettings = getApiSettings();
                if (shouldUseMemoryResults && activeAdapter.generateContentWithTools) {
                    // 有记忆搜索结果时，优先用 generateContentWithTools
                    responseText = await activeAdapter.generateContentWithTools(
                        cleanedContents, characterId, memorySearchResults, userMessage
                    );
                } else {
                // === 新增：支持流式回调 ===
                const openaiMessages = cleanedContents.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: msg.parts[0]?.text || ''
                }));
                const resp = await activeAdapter.chatCompletion(openaiMessages, {
                    temperature: this.apiSettings?.temperature,
                    max_tokens: this.apiSettings?.OpenAIcompatible?.max_tokens,
                    memoryResults: memorySearchResults,
                    characterId: characterId,
                    stream: this.apiSettings?.OpenAIcompatible?.stream,
                    onStream // 透传
                });
                if (resp && resp.choices && resp.choices[0]?.message?.content) {
                    responseText = resp.choices[0].message.content;
                }
            }
            } else if (shouldUseMemoryResults && activeAdapter) {
                // console.log('[NodeSTCore] 调用generateContentWithTools，传递characterId:', characterId); // <--- 记录
                const response = await activeAdapter.generateContentWithTools(cleanedContents as any, characterId, memorySearchResults, userMessage);
                console.log('[NodeSTCore] API response received:', {
                    hasResponse: !!response,
                    responseLength: response?.length || 0
                });
                            // === 新增：记录响应数据 ===
            NodeSTCore.logRequestResponse(cleanedContents, response, adapter ? adapter.constructor.name : 'unknown');
                if (response) {
                    console.log('[NodeSTCore] Saving updated history and framework...');
                    // 保存更新后的框架内容
                    await this.saveContents(contents, sessionId);
                    console.log('[NodeSTCore] Content framework and history saved successfully');
                }

                return response;
            } else {
                console.log('[NodeSTCore] 没有记忆搜索结果，使用标准generateContent方法');
                // 没有记忆搜索结果，使用标准方法
                if (!activeAdapter) {
                    // <--- 记录
                    console.warn('[NodeSTCore] No API adapter available - will attempt to use cloud service');
                    // Try with cloud service directly
                    return null;
                }
                // console.log('[NodeSTCore] 调用generateContent，传递characterId:', characterId); 
                const response = await activeAdapter.generateContent(cleanedContents as any, characterId);
                console.log('[NodeSTCore] API response received:', {
                    hasResponse: !!response,
                    responseLength: response?.length || 0
                });
                            // === 新增：记录响应数据 ===
            NodeSTCore.logRequestResponse(cleanedContents, response, adapter ? adapter.constructor.name : 'unknown');
                if (response) {
                    responseText = response;
                }
            }

                // === 新增：确保响应也被记录 ===
                if (responseText && NodeSTCore.latestRequestData) {
                    NodeSTCore.latestRequestData.response = responseText;
                }

            // === 新增：对AI响应应用全局正则脚本（placement=2） ===
            if (globalRegexEnabled && globalRegexScripts.length > 0 && typeof responseText === 'string') {
                // 只筛选与当前characterId匹配的脚本组
                const filteredScripts = globalRegexScripts.filter(
                    s =>
                        s.groupBindType === 'all' ||
                        (s.groupBindType === 'character' && s.groupBindCharacterId && characterId && s.groupBindCharacterId === characterId)
                );
                const before = responseText;
                responseText = NodeSTCore.applyGlobalRegexScripts(responseText, filteredScripts, 2, characterId);
                if (responseText !== before) {
                    console.log(`[全局正则] 已对AI响应应用正则处理，原文: ${before}，结果: ${responseText}`);
                } else {
                    console.log('[全局正则] AI响应未被正则脚本修改。');
                }
            }

            // 保存更新后的历史和框架
            if (responseText) {
                console.log('[NodeSTCore] Saving updated history and framework...');
                const updatedHistory = this.updateChatHistory(
                    chatHistory,
                    userMessage,
                    responseText,
                    dEntries
                );
                await this.saveJson(
                    this.getStorageKey(sessionId, '_history'),
                    updatedHistory
                );
                console.log('[NodeSTCore] Content framework and history saved successfully');
            }

            return responseText;
        } catch (error) {
            console.error('[NodeSTCore] Error in processChat:', error);
            return null;
        }
    }

    async processChatWithTools(
        userMessage: string,
        chatHistory: ChatHistoryEntity,
        dEntries: ChatMessage[],
        sessionId: string,
        roleCard: RoleCardJson,
        characterId: string, // 必需参数移到前面
        adapter?: GeminiAdapter | OpenRouterAdapter | OpenAIAdapter | null,
        customUserName?: string,
        memoryResults?: any,
        onStream?: (delta: string) => void,
        abortController?: AbortController
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting processChatWithTools with:', {
                userMessage: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
                chatHistoryMessagesCount: chatHistory?.parts?.length,
                dEntriesCount: dEntries.length,
                apiProvider: this.apiSettings?.apiProvider,
                hasCustomUserName: !!customUserName,
                hasMemoryResults: memoryResults?.results?.length > 0,
                characterId: characterId // <--- 记录characterId
            });

            // 检查是否已被中止
            if (abortController?.signal.aborted) {
                console.log('[NodeSTCore] processChatWithTools 被中止');
                return null;
            }

            // 新增：如果用工具调用，则自动为userMessage加前缀
            let toolUserMessage = userMessage;
            if (toolUserMessage && !toolUserMessage.startsWith('需要搜索：')) {
                toolUserMessage = '需要搜索：' + toolUserMessage;
            }

            // === 新增：优先读取全局预设 ===
            let preset: PresetJson | null = null;
            const globalPresetConfig = await StorageAdapter.loadGlobalPresetConfig();
            const isGlobalPreset = !!(globalPresetConfig && globalPresetConfig.enabled && globalPresetConfig.presetJson);
            if (isGlobalPreset) {
                preset = globalPresetConfig.presetJson;
                console.log('[NodeSTCore] Using global preset for processChatWithTools');
            } else {
                preset = await this.loadJson<PresetJson>(`nodest_${sessionId}_preset`);
            }

            const worldBook = await this.loadJson<WorldBookJson>(`nodest_${sessionId}_world`);
            if (!preset || !worldBook) {
                throw new Error('Required data not found');
            }

            let contents: ChatMessage[] = [];
            let needRebuildFramework = false;

            if (isGlobalPreset) {
                needRebuildFramework = true;
            } else {
                const existingContents = await this.loadJson<ChatMessage[]>(
                    this.getStorageKey(sessionId, '_contents')
                );
                if (!existingContents || existingContents.length === 0) {
                    needRebuildFramework = true;
                } else {
                    contents = [...existingContents];
                }
            }

            if (needRebuildFramework) {
                console.log('[NodeSTCore] Rebuilding framework due to global preset or missing contents...');
                const [rFramework, _] = CharacterUtils.buildRFramework(
                    preset,
                    roleCard,
                    worldBook
                );
                contents = [...rFramework];
                await this.saveContents(contents, sessionId);
            }

            // === 全局正则处理脚本准备 ===
            let globalRegexScripts: any[] = [];
            let globalRegexEnabled = false;
            try {
                // 只用新方法，移除旧方法
                const regexGroups = await StorageAdapter.loadGlobalRegexScriptGroups?.() || [];
                if (regexGroups.length > 0) {
                            globalRegexScripts = regexGroups
                                .filter(g =>
                                    g.bindType === 'all' ||
                                    (g.bindType === 'character' && g.bindCharacterId && characterId && g.bindCharacterId === characterId) ||
                                    typeof g.bindType === 'undefined'
                                )
                                .flatMap(g => {
                                    if (Array.isArray(g.scripts)) {
                                        const scriptsWithBind = g.scripts.map(s => ({
                                            ...s,
                                            groupBindType: g.bindType,
                                            groupBindCharacterId: g.bindCharacterId
                                        }));
                                        console.log(`[全局正则] 处理脚本组，组bindType=${g.bindType}，组bindCharacterId=${g.bindCharacterId}，该组脚本数=${g.scripts.length}，已为每个脚本赋值绑定信息`);
                                        return scriptsWithBind;
                                    }
                                    return [];
                                });
                        }
                // 不再 fallback 到 loadGlobalRegexScriptList
                const regexEnabledVal = await (await import('@react-native-async-storage/async-storage')).default.getItem('nodest_global_regex_enabled');
                globalRegexEnabled = regexEnabledVal === 'true';
            } catch (e) {
                console.warn('[NodeSTCore][GlobalRegex] 加载全局正则脚本失败:', e);
            }

            const applyAllRegex = (text: string) => {
                let t = text;
                if (globalRegexEnabled && globalRegexScripts.length > 0) {
                    t = NodeSTCore.applyGlobalRegexScripts(t, globalRegexScripts, 1, characterId);
                }
                if (roleCard?.data?.extensions?.regex_scripts) {
                    t = this.applyRegexScripts(t, roleCard.data.extensions.regex_scripts,
                    );
                }
                return t;
            };

            const regexProcessedContents: ChatMessage[] = contents.map(item => {
                if (item.name === "Chat History" && Array.isArray(item.parts)) {
                    return {
                        ...item,
                        parts: item.parts.map((msg: any) => ({
                            ...msg,
                            parts: msg.parts?.map((part: any) => ({
                                ...part,
                                text: applyAllRegex(part.text || "")
                            })) || []
                        }))
                    };
                } else {
                    return {
                        ...item,
                        parts: item.parts?.map(part => ({
                            ...part,
                            text: applyAllRegex(part.text || "")
                        })) || []
                    };
                }
            });

            // 3. 查找聊天历史占位符的位置
            const chatHistoryPlaceholderIndex = regexProcessedContents.findIndex(
                item => item.is_chat_history_placeholder ||
                       (item.identifier === chatHistory.identifier)
            );

            // === 关键修正：用最新 chatHistory（含 userMessage/AI 回复）插入 D-entries ===
            const historyWithDEntries = this.insertDEntriesToHistory(
                {
                    ...chatHistory,
                    parts: chatHistory.parts.filter(msg => !msg.is_d_entry)
                },
                dEntries,
                userMessage
            );

            if (chatHistoryPlaceholderIndex !== -1) {
                regexProcessedContents[chatHistoryPlaceholderIndex] = {
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                };
            } else {
                regexProcessedContents.push({
                    name: "Chat History",
                    role: "system",
                    parts: historyWithDEntries.parts,
                    identifier: chatHistory.identifier
                });
            }

            // 7. 去重
            const chatHistoryEntries = regexProcessedContents.filter(
                item => item.name === "Chat History" ||
                       (item.identifier && item.identifier.toLowerCase().includes('chathistory'))
            );
            if (chatHistoryEntries.length > 1) {
                regexProcessedContents.splice(
                    regexProcessedContents.findIndex((item, idx) =>
                        (item.name === "Chat History" ||
                        (item.identifier && item.identifier.toLowerCase().includes('chathistory'))) &&
                        idx !== chatHistoryPlaceholderIndex
                    ), 1
                );
            }

            // 8. cleanContentsForGemini 只做宏替换，不再做正则
            let cleanedContents = this.cleanContentsForGemini(
                regexProcessedContents,
                userMessage,
                roleCard.name,
                customUserName || "",
                roleCard
            );

            // 添加最终请求内容的完整日志
            console.log('[NodeSTCore] Final Gemini request structure:', {
                totalMessages: cleanedContents.length,
                messageSequence: cleanedContents.map(msg => ({
                    role: msg.role,
                    type: msg.is_d_entry ? 'D-entry' : 'chat',
                    depth: msg.injection_depth,
                    preview: msg.parts[0]?.text?.substring(0, 30)
                }))
            });
            
            // 打印完整的请求内容以便检查
            console.log('[NodeSTCore] COMPLETE API REQUEST CONTENT:');
            cleanedContents.forEach((msg, i) => {
                console.log(`[Message ${i+1}] Role: ${msg.role}`);
                msg.parts.forEach((part, j) => {
                    console.log(`[Message ${i+1}][Part ${j+1}] Content length: ${part.text?.length || 0} chars`);
                });
            });

            // 验证是否还有消息要发送
            if (cleanedContents.length === 0) {
                throw new Error('No valid messages to send to Gemini API');
            }

            // 使用传入的适配器或获取活跃适配器
            const activeAdapter = adapter || this.getActiveAdapter();
            if (!activeAdapter) {
                console.warn("[NodeSTCore] No API adapter available - will attempt to use cloud service");
                // 不再抛出错误，让 generateContentWithTools 方法尝试云服务
            }

            // 添加适配器类型日志
            // console.log('[NodeSTCore] Using adapter:', {
            //     type:
            //         activeAdapter instanceof OpenRouterAdapter
            //             ? 'OpenRouter'
            //             : activeAdapter instanceof OpenAIAdapter
            //             ? 'OpenAICompatible'
            //             : 'Gemini',
            //     apiProvider: this.apiSettings?.apiProvider
            // });
        // === 新增：记录请求体数据 ===
        NodeSTCore.logRequestResponse(cleanedContents, null, adapter ? adapter.constructor.name : 'unknown');
            // 发送到API，传递记忆搜索结果
        let responseText: string | null = null;
        const shouldUseMemoryResults = memoryResults && memoryResults.results && memoryResults.results.length > 0;
        if (activeAdapter instanceof OpenAIAdapter) {
            const openaiMessages = cleanedContents.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts[0]?.text || ''
            }));
            try {
                if (shouldUseMemoryResults) {
                    responseText = await activeAdapter.generateContentWithTools(
                        cleanedContents, characterId, memoryResults, toolUserMessage
                    );
                } else {
                    // === 新增：支持流式回调 ===
                    const resp = await activeAdapter.chatCompletion(openaiMessages, {
                        temperature: this.apiSettings?.OpenAIcompatible?.temperature ?? 0.7,
                        max_tokens: this.apiSettings?.OpenAIcompatible?.max_tokens,
                        memoryResults: memoryResults,
                        characterId: characterId,
                        stream: this.apiSettings?.OpenAIcompatible?.stream,
                        onStream // 透传
                    });
                    if (resp && resp.choices && resp.choices[0]?.message?.content) {
                        responseText = resp.choices[0].message.content;
                    }
                }
                } catch (err) {
                    console.error('[NodeSTCore] OpenAIAdapter chatCompletion error:', err);
                }
            } else if (activeAdapter) {
                console.log('[NodeSTCore] 调用generateContentWithTools，传递characterId:', characterId); // <--- 记录
                const response = await activeAdapter.generateContentWithTools(
                    cleanedContents as any, characterId, memoryResults, toolUserMessage
                );
                console.log('[NodeSTCore] API response received:', {
                    hasResponse: !!response,
                    responseLength: response?.length || 0
                });
                
                if (response) {
                    responseText = response;
                }
            }

                if (responseText && NodeSTCore.latestRequestData) {
            NodeSTCore.latestRequestData.response = responseText;
        }

            // === 新增：对AI响应应用全局正则脚本（placement=2） ===
            if (globalRegexEnabled && globalRegexScripts.length > 0 && typeof responseText === 'string') {
                // 只筛选与当前characterId匹配的脚本组
                const filteredScripts = globalRegexScripts.filter(
                    s =>
                        s.groupBindType === 'all' ||
                        (s.groupBindType === 'character' && s.groupBindCharacterId && characterId && s.groupBindCharacterId === characterId)
                );
                const before = responseText;
                responseText = NodeSTCore.applyGlobalRegexScripts(responseText, filteredScripts, 2, characterId);
                if (responseText !== before) {
                    console.log(`[全局正则] 已对AI响应应用正则处理，原文: ${before}，结果: ${responseText}`);
                } else {
                    console.log('[全局正则] AI响应未被正则脚本修改。');
                }
            }

            // 保存更新后的历史和框架
            if (responseText) {
                console.log('[NodeSTCore] Saving updated history and framework...');
                const updatedHistory = this.updateChatHistory(
                    chatHistory,
                    userMessage,
                    responseText,
                    dEntries
                );
                await this.saveJson(
                    this.getStorageKey(sessionId, '_history'),
                    updatedHistory
                );
                console.log('[NodeSTCore] Content framework and history saved successfully');
            }

            return responseText;
        } catch (error) {
            console.error('[NodeSTCore] Error in processChatWithTools:', error);
            return null;
        }
    }

    // Text processing utilities
    private cleanContentsForGemini(
        contents: ChatMessage[],
        userMessage: string = "",
        charName: string = "",
        userName: string = "",
        roleCard?: RoleCardJson
    ): GeminiMessage[] {
        console.log('[NodeSTCore] Starting cleanContentsForGemini:', {
            totalContents: contents.length
        });
        const cleanedContents: GeminiMessage[] = [];

        for (const content of contents) {
            if (!content || !content.parts?.[0]) continue;

            // 如果是聊天历史实体
            if (content.name === "Chat History") {
                // 确保 parts 存在且为数组
                const historyParts = Array.isArray(content.parts) ? content.parts : [];
                
                // 遍历历史消息
                for (const historyMessage of historyParts) {
                    if (!historyMessage.parts?.[0]?.text) continue;

                    let text = historyMessage.parts[0].text;

                    // Skip processing memory summary messages for role conversion
                    // but still include them in the API request
                    if (memoryService.isMemorySummary(historyMessage)) {
                        cleanedContents.push({
                            role: "user", // Memory summaries always go as "user" role (system)
                            parts: [{
                                text: historyMessage.parts[0].text
                            }]
                        });
                        continue;
                    }

                    // 转换角色映射
                    const role = (() => {
                        switch (historyMessage.role) {
                            case "assistant":
                            case "model":
                                return "model";
                            case "system":
                            case "user":
                            default:
                                return "user";
                        }
                    })();

                    const geminiMessage: GeminiMessage = {
                        role: (() => {
                            switch (historyMessage.role) {
                                case "assistant":
                                case "model":
                                    return "model";
                                case "system":
                                case "user":
                                default:
                                    return "user";
                            }
                        })(),
                        parts: [{
                            text: this.replacePlaceholders(
                                text,
                                userMessage,
                                charName,
                                userName,
                                roleCard
                            )
                        }]
                    };
                    cleanedContents.push(geminiMessage);
                }
            } else {
                let parts = content.parts.map(part => {
                    let text = part.text || "";
                    return {
                        text: this.replacePlaceholders(
                            text,
                            userMessage,
                            charName,
                            userName,
                            roleCard
                        )
                    };
                });
                // 处理常规消息
                const geminiMessage: GeminiMessage = {
                    role: content.role === "assistant" ? "model" :
                        content.role === "system" ? "user" :
                            content.role as "user" | "model",
                    parts
                };
                cleanedContents.push(geminiMessage);
            }
        }

        // 过滤掉空消息
        const filteredContents = cleanedContents.filter(msg => {
            const text = msg.parts[0]?.text;
            return text && text.trim() !== '';
        });

        console.log('[NodeSTCore] Final cleaned contents:', {
            originalCount: cleanedContents.length,
            filteredCount: filteredContents.length
        });

        return filteredContents;
    }

    private replacePlaceholders(
        text: string,
        userMessage: string,
        charName: string,
        userName: string,
        roleCard?: RoleCardJson
    ): string {
        if (typeof text !== 'string') {
            return text;
        }

        try {
            // 基础变量替换
            text = text
                .replace(/{{lastMessage}}/g, userMessage)
                .replace(/{{lastusermessage}}/g, userMessage) // 新增宏，等价于{{lastMessage}}
                .replace(/{{char}}/g, charName)
                .replace(/{{user}}/g, userName);

            // 应用正则替换规则
            // 新增: {{lastcharmessage}} - 获取最近一条AI消息
            if (text.includes('{{lastcharmessage}}') && this.currentContents) {
                let lastAiMessage = '';
                // 从聊天历史中搜索最新的AI消息
                const chatHistoryItem = this.currentContents.find(item => 
                    item.name === "Chat History" && Array.isArray(item.parts)
                );
                
                if (chatHistoryItem && Array.isArray(chatHistoryItem.parts)) {
                    // 反向查找第一条非D类条目的AI消息
                    for (let i = chatHistoryItem.parts.length - 1; i >= 0; i--) {
                        const msg = chatHistoryItem.parts[i];
                        if ((msg.role === "model" || msg.role === "assistant") && 
                            !msg.is_d_entry && 
                            msg.parts?.[0]?.text) {
                            lastAiMessage = msg.parts[0].text;
                            break;
                        }
                    }
                }
                text = text.replace(/{{lastcharmessage}}/g, lastAiMessage);
            }

            // 新增: {{random::A::B::C...}} - 从提供的值中随机选择
            text = text.replace(/{{random(::.*?)?}}/g, (match) => {
                // 检查是否提供了参数
                if (match === '{{random}}') {
                    // 无参数，返回0-1之间的随机数
                    return Math.random().toString();
                } else {
                    // 提取参数
                    const params = match.substring(9, match.length - 2).split('::').filter(Boolean);
                    if (params.length === 0) {
                        return Math.random().toString();
                    }
                    // 从参数中随机选择一个
                    const randomIndex = Math.floor(Math.random() * params.length);
                    return params[randomIndex];
                }
            });

            // 新增: {{roll::A}} - 返回1到A之间的随机数
            text = text.replace(/{{roll::(\d+|d\d+)}}/g, (match, value) => {
                let max: number;
                if (value.startsWith('d')) {
                    // 如果以d开头，移除d并解析为数字
                    max = parseInt(value.substring(1), 10);
                } else {
                    max = parseInt(value, 10);
                }
                
                if (isNaN(max) || max < 1) {
                    return '1'; // 最小值默认为1
                }
                
                // 生成1到max之间的随机整数
                return Math.floor(Math.random() * max + 1).toString();
            });
            

            // 应用正则替换规则
            if (roleCard?.data?.extensions?.regex_scripts) {
                text = this.applyRegexScripts(
                    text,
                    roleCard.data.extensions.regex_scripts
                );
            }

            return text;
        } catch (e) {
            console.warn('Text processing warning:', e);
            return text;
        }
    }

    private applyRegexScripts(text: string, regexScripts: RegexScript[]): string {
        if (typeof text !== 'string') {
            return text;
        }

        try {
            for (const script of regexScripts) {
                try {
                    let findRegex = script.findRegex;
                    const replaceString = script.replaceString;
                    if (!findRegex || !replaceString) {
                        continue;
                    }

                    // 去除正则表达式字符串的首尾斜杠
                    if (findRegex.startsWith('/') && findRegex.endsWith('/')) {
                        findRegex = findRegex.slice(1, -1);
                    }

                    // 构建正则表达式标志
                    const flags = script.flags || '';
                    const regex = new RegExp(findRegex, flags);

                    // 执行替换
                    text = text.replace(regex, replaceString);

                } catch (e) {
                    console.warn(
                        `Regex script warning - Script ${script.scriptName}:`,
                        e
                    );
                    continue;
                }
            }
            return text;
        } catch (e) {
            console.error('Error in regex replacement:', e);
            return text;
        }
    }

    async regenerateFromMessage(
        conversationId: string,
        messageIndex: number,
        apiKey: string,
        characterId?: string,
        customUserName?: string, // Add parameter for customUserName
        apiSettings?: Partial<GlobalSettings['chat']>,  // <--- 新增参数
        onStream?: (delta: string) => void // 新增参数
    ): Promise<string | null> {
        try {
            console.log('[NodeSTCore] Starting regenerateFromMessage:', {
                conversationId,
                messageIndex,
                hasCharacterId: !!characterId,
                hasCustomUserName: !!customUserName,
                apiSettings: !!apiSettings,
            });

             // === 修正点：始终用最新apiSettings初始化适配器 ===
            this.updateApiSettings(apiKey, apiSettings);

            // === 修正：根据apiProvider初始化对应适配器 ===
            if (apiKey) {
                const provider = (apiSettings?.apiProvider ?? this.apiSettings?.apiProvider);
                if (provider === 'openai-compatible' && !this.openAICompatibleAdapter) {
                    this.initAdapters(apiKey, apiSettings ?? this.apiSettings);
                } else if (provider === 'openrouter' && !this.openRouterAdapter) {
                    this.initAdapters(apiKey, apiSettings ?? this.apiSettings);
                } else if ((!provider || provider === 'gemini') && !this.geminiAdapter) {
                    this.initAdapters(apiKey, apiSettings ?? this.apiSettings);
                }
            }
            // 确保Adapter已初始化
            if ((!this.geminiAdapter || !this.openRouterAdapter || !this.openAICompatibleAdapter) && apiKey) {
                this.initAdapters(apiKey, apiSettings ?? this.apiSettings);
            }

            // 获取正确的 adapter
            const adapter = this.getActiveAdapter();
            
            if (!adapter) {
                throw new Error("API adapter not initialized - missing API key");
            }

            // 确保加载最新的角色数据
            const roleCard = await this.loadJson<RoleCardJson>(
                this.getStorageKey(conversationId, '_role')
            );
            const worldBook = await this.loadJson<WorldBookJson>(
                this.getStorageKey(conversationId, '_world')
            );

            // === 新增：优先读取全局预设 ===
            let preset: PresetJson | null = null;
            const globalPresetConfig = await StorageAdapter.loadGlobalPresetConfig();
            if (globalPresetConfig && globalPresetConfig.enabled && globalPresetConfig.presetJson) {
                preset = globalPresetConfig.presetJson;
                console.log('[NodeSTCore] Using global preset for regenerateFromMessage');
            } else {
                preset = await this.loadJson<PresetJson>(
                    this.getStorageKey(conversationId, '_preset')
                );
            }

            const authorNote = await this.loadJson<AuthorNoteJson>(
                this.getStorageKey(conversationId, '_note')
            );
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );

            console.log('[NodeSTCore] Character data loaded for regeneration:', {
                hasRoleCard: !!roleCard,
                hasWorldBook: !!worldBook,
                hasPreset: !!preset,
                hasAuthorNote: !!authorNote,
                hasChatHistory: !!chatHistory,
                historyLength: chatHistory?.parts?.length,
                requestedIndex: messageIndex
            });

            // Validate required data
            if (!roleCard || !worldBook || !preset || !chatHistory) {
                const missingData = [];
                if (!roleCard) missingData.push('roleCard');
                if (!worldBook) missingData.push('worldBook');
                if (!preset) missingData.push('preset');
                if (!chatHistory) missingData.push('chatHistory');

                const errorMessage = `Missing required data: ${missingData.join(', ')}`;
                console.error('[NodeSTCore]', errorMessage);
                return null;
            }

            // Get all real messages (not D-entries)
            const realMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
            console.log(`[NodeSTCore] Total real messages: ${realMessages.length}`);
            
            // Check if we're trying to regenerate the AI's first message (first_mes)
            const firstAiMessage = realMessages.find(msg => msg.is_first_mes && 
                (msg.role === "model" || msg.role === "assistant"));
            
            if (messageIndex === 0 && firstAiMessage) {
                console.log('[NodeSTCore] Detected request to regenerate first_mes');
                
                // For first_mes regeneration, just use the existing roleCard.first_mes
                if (roleCard.first_mes) {
                    console.log('[NodeSTCore] Reusing existing first_mes from roleCard');
                    
                    // Replace the first_mes in the history
                    const updatedHistory = {
                        ...chatHistory,
                        parts: chatHistory.parts.map(msg => {
                            if (msg.is_first_mes) {
                                return {
                                    ...msg,
                                    parts: [{ text: roleCard.first_mes }]
                                };
                            }
                            return msg;
                        })
                    };
                    
                    // Save the updated history
                    await this.saveJson(
                        this.getStorageKey(conversationId, '_history'),
                        updatedHistory
                    );
                    
                    console.log('[NodeSTCore] First message regenerated successfully using original first_mes');
                    return roleCard.first_mes;
                } else {
                    console.warn('[NodeSTCore] Cannot regenerate first_mes: roleCard.first_mes is missing');
                    return null;
                }
            }
                // === 修正：定义 aiMessages 变量 ===
        const aiMessages = realMessages.filter(msg => 
            (msg.role === "model" || msg.role === "assistant") && !msg.is_first_mes
        );

        // === 修正核心逻辑 ===
        if (messageIndex < 1 || messageIndex > aiMessages.length) {
            console.error(`[NodeSTCore] Invalid message index: ${messageIndex}. Available AI messages: ${aiMessages.length}`);
            return null;
        }
        // 找到目标AI消息
        const targetAiMessage = aiMessages[messageIndex - 1];
        if (!targetAiMessage) {
            console.error(`[NodeSTCore] Could not find AI message at index ${messageIndex}`);
            return null;
        }
        // 在realMessages中找到该AI消息的索引
        const aiIndexInReal = realMessages.findIndex(msg => msg === targetAiMessage);
        if (aiIndexInReal === -1) {
            console.error('[NodeSTCore] Could not locate target AI message in realMessages');
            return null;
        }
            
            console.log('[NodeSTCore] Target AI message to regenerate:', {
                role: targetAiMessage.role,
                preview: targetAiMessage.parts[0]?.text?.substring(0, 50) + '...',
            });
            
            // Now find the user message that came before this AI message
            // We need to search through the complete history to maintain the correct order
            let userMessageForRegeneration: ChatMessage | undefined;
            let userMessageIndex = -1;
            
            for (let j = aiIndexInReal - 1; j >= 0; j--) {
                if (realMessages[j].role === "user") {
                    userMessageForRegeneration = realMessages[j];
                    break;
                }
            }
            if (!userMessageForRegeneration) {
                console.error('[NodeSTCore] Could not find user message before target AI message');
                return null;
            }
            
            if (!userMessageForRegeneration) {
                console.error('[NodeSTCore] Could not find user message before target AI message');
                return null;
            }
            
            console.log('[NodeSTCore] Found user message for regeneration:', {
                index: userMessageIndex,
                preview: userMessageForRegeneration.parts[0]?.text?.substring(0, 50) + '...'
            });
            
            // Extract the user message text
            const userMessageText = userMessageForRegeneration.parts[0]?.text || "";
            
            if (!userMessageText) {
                console.error('[NodeSTCore] User message text is empty');
                return null;
            }
            
            // Create a truncated history that includes all messages up to and including our target user message
            const truncatedHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: []
            };
            
            // Find all messages up to and including the user message in the full history
            let foundUserMessage = false;
            
            // First add all messages including first_mes and D-entries up to the user message
            for (const msg of chatHistory.parts) {
                truncatedHistory.parts.push(msg);
                
                // If we've reached the user message we want to regenerate from, stop
                if (!msg.is_d_entry && msg === userMessageForRegeneration) {
                    foundUserMessage = true;
                    break;
                }
            }
            
            if (!foundUserMessage) {
                console.error('[NodeSTCore] Could not locate user message in full history');
                return null;
            }
            
            console.log('[NodeSTCore] Truncated history built:', {
                originalLength: chatHistory.parts.length,
                truncatedLength: truncatedHistory.parts.length,
                hasDEntries: truncatedHistory.parts.some(msg => msg.is_d_entry)
            });
            
            // Save the truncated history
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                truncatedHistory
            );
            
            // Re-extract D-entries to ensure we're using the latest world book data
            const dEntries = CharacterUtils.extractDEntries(
                preset!,
                worldBook!,
                authorNote ?? undefined
            );

            // New: Check if we need to summarize the chat history
            if (characterId) {
                try {
                    console.log('[NodeSTCore] Checking if truncated chat history needs summarization...');
                    const summarizedHistory = await memoryService.checkAndSummarize(
                        conversationId,
                        characterId,
                        truncatedHistory,
                        apiKey,
                        {
                            apiProvider: this.apiSettings.apiProvider === 'openrouter' ? 'openrouter' : 'gemini',
                            openrouter: this.apiSettings.openrouter,
                        }
                    );
                    
                    // Use the potentially summarized history
                    if (summarizedHistory !== truncatedHistory) {
                        console.log('[NodeSTCore] Truncated chat history was summarized');
                        truncatedHistory.parts = summarizedHistory.parts;
                    }
                } catch (summaryError) {
                    console.error('[NodeSTCore] Error in chat summarization:', summaryError);
                    // Continue with unsummarized history
                }
            }
            
            // Process the chat with the truncated history
            console.log('[NodeSTCore] Processing regeneration chat with target user message');
            const response = await this.processChat(
                userMessageText,
                truncatedHistory,
                dEntries,
                conversationId,
                roleCard,
                characterId!, // Pass characterId as required parameter - use ! since it's checked above
                adapter,
                customUserName, // Pass customUserName to processChat
                undefined, // memorySearchResults
                onStream // stream callback
            );

            // === 新增：记录请求体数据（与processChat保持一致） ===
            try {
                // 构造与 processChat 相同的 cleanedContents 作为请求体
                let presetForLog: PresetJson | null = null;
                const globalPresetConfigForLog = await StorageAdapter.loadGlobalPresetConfig();
                if (globalPresetConfigForLog && globalPresetConfigForLog.enabled && globalPresetConfigForLog.presetJson) {
                    presetForLog = globalPresetConfigForLog.presetJson;
                } else {
                    presetForLog = await this.loadJson<PresetJson>(this.getStorageKey(conversationId, '_preset'));
                }
                const worldBookForLog = await this.loadJson<WorldBookJson>(this.getStorageKey(conversationId, '_world'));
                let contentsForLog: ChatMessage[] = [];
                if (presetForLog && worldBookForLog) {
                    const [rFramework] = CharacterUtils.buildRFramework(
                        presetForLog,
                        roleCard,
                        worldBookForLog
                    );
                    contentsForLog = [...rFramework];
                }
                // 插入最新的聊天历史（truncatedHistory）到 contentsForLog
                const chatHistoryPlaceholderIndex = contentsForLog.findIndex(
                    item => item.is_chat_history_placeholder ||
                        (item.identifier === truncatedHistory.identifier)
                );
                if (chatHistoryPlaceholderIndex !== -1) {
                    contentsForLog[chatHistoryPlaceholderIndex] = {
                        name: "Chat History",
                        role: "system",
                        parts: truncatedHistory.parts,
                        identifier: truncatedHistory.identifier
                    };
                } else {
                    contentsForLog.push({
                        name: "Chat History",
                        role: "system",
                        parts: truncatedHistory.parts,
                        identifier: truncatedHistory.identifier
                    });
                }
                // cleanContentsForGemini 只做宏替换
                const cleanedContentsForLog = this.cleanContentsForGemini(
                    contentsForLog,
                    userMessageText,
                    roleCard.name,
                    customUserName || "",
                    roleCard
                );
                NodeSTCore.logRequestResponse(
                    cleanedContentsForLog,
                    null,
                    adapter ? adapter.constructor.name : 'unknown'
                );
            } catch (logErr) {
                console.warn('[NodeSTCore][regenerateFromMessage] 请求体记录异常:', logErr);
            }

            // === 新增：对AI响应应用全局正则脚本（placement=2，支持全部绑定和当前角色绑定的组） ===
            let processedResponse = response;
            try {
                // 读取所有正则脚本组，筛选全部绑定和当前角色绑定的组
                let globalRegexScripts: any[] = [];
                let globalRegexEnabled = false;
                const regexGroups = await StorageAdapter.loadGlobalRegexScriptGroups?.() || [];
                    if (regexGroups.length > 0) {
                        globalRegexScripts = regexGroups
                            .flatMap(g =>
                                (Array.isArray(g.scripts) ? g.scripts : []).map(s => ({
                                    ...s,
                                    groupBindType: g.bindType,
                                    groupBindCharacterId: g.bindCharacterId
                                }))
                            );
                        console.log(`[全局正则][regenerateFromMessage] 已为每个脚本赋值绑定信息，脚本组数=${regexGroups.length}，总脚本数=${globalRegexScripts.length}`);
                } else {
                    // 兼容旧格式
                    globalRegexScripts = await StorageAdapter.loadGlobalRegexScriptList?.() || [];
                }
                const regexEnabledVal = await (await import('@react-native-async-storage/async-storage')).default.getItem('nodest_global_regex_enabled');
                globalRegexEnabled = regexEnabledVal === 'true';

                    if (globalRegexEnabled && globalRegexScripts.length > 0 && typeof response === 'string') {
                        // 只筛选与当前characterId匹配的脚本组
                        const filteredScripts = globalRegexScripts.filter(
                            s =>
                                s.groupBindType === 'all' ||
                                (s.groupBindType === 'character' && s.groupBindCharacterId && characterId && s.groupBindCharacterId === characterId)
                        );
                        const before = response;
                        processedResponse = NodeSTCore.applyGlobalRegexScripts(response, filteredScripts, 2, characterId);
                        if (processedResponse !== before) {
                            console.log(`[全局正则][regenerateFromMessage] 已对AI响应应用正则处理，原文: ${before}，结果: ${processedResponse}`);
                        } else {
                            console.log('[全局正则][regenerateFromMessage] AI响应未被正则脚本修改。');
                        }
                    }
            } catch (e) {
                console.warn('[NodeSTCore][regenerateFromMessage][GlobalRegex] 正则脚本处理异常:', e);
            }

            // === 新增：记录响应体数据 ===
            try {
                if (NodeSTCore.latestRequestData && processedResponse) {
                    NodeSTCore.latestRequestData.response = processedResponse;
                }
            } catch (logRespErr) {
                console.warn('[NodeSTCore][regenerateFromMessage] 响应体记录异常:', logRespErr);
            }

            // If we got a response, add it to history
            if (processedResponse) {
                // Use updateChatHistory method to add the AI response
                const updatedHistory = this.updateChatHistory(
                    truncatedHistory,
                    userMessageText,
                    processedResponse,
                    dEntries
                );
                
                // Save the updated history
                await this.saveJson(
                    this.getStorageKey(conversationId, '_history'),
                    updatedHistory
                );
                
                console.log('[NodeSTCore] Regeneration complete, saved updated history:', {
                    totalMessages: updatedHistory.parts.length,
                    response: processedResponse.substring(0, 50) + '...'
                });
            }
            
            return processedResponse;
        } catch (error) {
            console.error('[NodeSTCore] Error in regenerateFromMessage:', error);
            return null;
        }
    }

    async restoreChatHistory(
        conversationId: string,
        chatHistory: ChatHistoryEntity
    ): Promise<boolean> {
        try {
            console.log('[NodeSTCore] Restoring chat history from save point:', {
                conversationId,
                messagesCount: chatHistory.parts.length
            });

                        // === 新增：打印即将恢复的聊天记录摘要 ===
            chatHistory.parts.slice(0, 3).forEach((msg, idx) => {
                console.log(`[NodeSTCore] 即将恢复的消息#${idx + 1}: ${msg.role} - ${msg.parts?.[0]?.text?.substring(0, 50)}`);
            });
            // ===

            // First, load the current history to preserve its identifier and structure
            const currentHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            
            if (!currentHistory) {
                console.error('[NodeSTCore] Cannot restore chat history - current history not found');
                return false;
            }

            // Create a new history entity that preserves the structure but uses saved messages
            const restoredHistory: ChatHistoryEntity = {
                ...currentHistory,
                parts: chatHistory.parts || []
            };
            
            console.log('[NodeSTCore] Saving restored chat history with', restoredHistory.parts.length, 'messages');
            
            // === 新增：打印恢复后将要保存的聊天记录摘要 ===
            restoredHistory.parts.slice(0, 3).forEach((msg, idx) => {
                console.log(`[NodeSTCore] 恢复后将保存的消息#${idx + 1}: ${msg.role} - ${msg.parts?.[0]?.text?.substring(0, 50)}`);
            });
            // ===
            // Save the restored history
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                restoredHistory
            );
            
            // Important: Also update the contents/framework to ensure proper integration
            try {
                // Load the current framework
                const currentContents = await this.loadJson<ChatMessage[]>(
                    this.getStorageKey(conversationId, '_contents')
                );
                
                if (currentContents) {
                    // Find the chat history placeholder in the framework
                    const chatHistoryIndex = currentContents.findIndex(
                        item => item.is_chat_history_placeholder || 
                               (item.identifier === restoredHistory.identifier)
                    );
                    
                    if (chatHistoryIndex !== -1) {
                        // Replace the chat history in the framework
                        console.log('[NodeSTCore] Updating chat history in framework at index', chatHistoryIndex);
                        currentContents[chatHistoryIndex] = {
                            name: "Chat History",
                            role: "system",
                            parts: restoredHistory.parts,
                            identifier: restoredHistory.identifier
                        };
                        
                        // Save the updated framework
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_contents'),
                            currentContents
                        );
                        
                        console.log('[NodeSTCore] Framework updated successfully');
                    } else {
                        console.warn('[NodeSTCore] Chat history placeholder not found in framework');
                    }
                }
            } catch (frameworkError) {
                console.error('[NodeSTCore] Error updating framework:', frameworkError);
                // Continue even if framework update fails - the chat history is still restored
            }
            
            console.log('[NodeSTCore] Chat history successfully restored');
            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error restoring chat history:', error);
            return false;
        }
    }

    async resetChatHistory(conversationId: string): Promise<boolean> {
        try {
            console.log('[NodeSTCore] Resetting chat history for conversation:', conversationId);
            
            // 1. Load the required data
            const roleCard = await this.loadJson<RoleCardJson>(
                this.getStorageKey(conversationId, '_role')
            );
            
            const worldBook = await this.loadJson<WorldBookJson>(
                this.getStorageKey(conversationId, '_world')
            );

            // === 新增：优先读取全局预设 ===
            let preset: PresetJson | null = null;
            const globalPresetConfig = await StorageAdapter.loadGlobalPresetConfig();
            if (globalPresetConfig && globalPresetConfig.enabled && globalPresetConfig.presetJson) {
                preset = globalPresetConfig.presetJson;
                console.log('[NodeSTCore] Using global preset for continueChat');
            } else {
                preset = await this.loadJson<PresetJson>(
                    this.getStorageKey(conversationId, '_preset')
                );
                // --- 新增: 回退为角色自身preset时，强制重建rframework ---
                if (preset && roleCard && worldBook) {
                    console.log('[NodeSTCore] Rebuilding rframework using character\'s own preset after global preset disabled');
                    const [rFramework, _] = CharacterUtils.buildRFramework(
                        preset,
                        roleCard,
                        worldBook
                    );
                    await this.saveJson(this.getStorageKey(conversationId, '_contents'), rFramework);
                }
            }

            const authorNote = await this.loadJson<AuthorNoteJson>(
                this.getStorageKey(conversationId, '_note')
            );
            
            const currentHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            
            // Check if we have necessary data
            if (!roleCard || !currentHistory) {
                console.error('[NodeSTCore] Cannot reset chat history - missing required data');
                return false;
            }
            
            // 2. Create a fresh history with only first_mes
            const resetHistory: ChatHistoryEntity = {
                ...currentHistory, // Preserve structure, name, identifier
                parts: [] // Start with empty parts array
            };
            
            // 3. Add first_mes if available
            if (roleCard.first_mes) {
                resetHistory.parts.push({
                    role: "model",
                    parts: [{ text: roleCard.first_mes }],
                    is_first_mes: true
                });
                console.log('[NodeSTCore] Added first_mes to reset history');
            }
            
            // 4. Process D-entries if needed
            if (preset && worldBook) {
                const dEntries = CharacterUtils.extractDEntries(
                    preset,
                    worldBook,
                    authorNote ?? undefined
                );
                
                if (dEntries.length > 0) {
                    // Insert D entries - we pass empty userMessage since we're resetting
                    const historyWithDEntries = this.insertDEntriesToHistory(
                        resetHistory,
                        dEntries,
                        ""  // No user message for reset history
                    );
                    
                    resetHistory.parts = historyWithDEntries.parts;
                    console.log(`[NodeSTCore] Added ${dEntries.length} D-entries to reset history`);
                }
            }
            
            // 5. Save the reset history
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                resetHistory
            );
            
            // 6. Also update the framework to maintain consistency
            try {
                const currentContents = await this.loadJson<ChatMessage[]>(
                    this.getStorageKey(conversationId, '_contents')
                );
                
                if (currentContents) {
                    // Find chat history in framework
                    const chatHistoryIndex = currentContents.findIndex(
                        item => item.is_chat_history_placeholder || 
                               (item.identifier === currentHistory.identifier)
                    );
                    
                    if (chatHistoryIndex !== -1) {
                        // Update the chat history in framework
                        currentContents[chatHistoryIndex] = {
                            name: "Chat History",
                            role: "system",
                            parts: resetHistory.parts,
                            identifier: currentHistory.identifier
                        };
                        
                        // Save updated framework
                        await this.saveJson(
                            this.getStorageKey(conversationId, '_contents'),
                            currentContents
                        );
                        
                        console.log('[NodeSTCore] Updated framework with reset chat history');
                    }
                }
            } catch (frameworkError) {
                console.error('[NodeSTCore] Error updating framework after reset:', frameworkError);
                // Continue even if framework update fails
            }
            
            console.log('[NodeSTCore] Chat history successfully reset');
            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error resetting chat history:', error);
            return false;
        }
    }
    /**
     * Delete all data associated with a specific conversation ID
     * Does not require an API key since it's only performing deletion operations
     * 
     * @param conversationId The conversation ID to delete data for
     * @returns true if deletion was successful, false otherwise
     */

    async deleteCharacterData(conversationId: string): Promise<boolean> {
        try {
            console.log('[NodeSTCore] Deleting all data for conversation:', conversationId);
            // 角色数据文件key列表
            const keys = [
                this.getStorageKey(conversationId, '_role'),
                this.getStorageKey(conversationId, '_world'),
                this.getStorageKey(conversationId, '_preset'),
                this.getStorageKey(conversationId, '_note'),
                this.getStorageKey(conversationId, '_history'),
                this.getStorageKey(conversationId, '_contents')
            ];
            // 删除文件
            await Promise.all(keys.map(async (key) => {
                const filePath = this.getCharacterDataFilePath(key);
                try {
                    const fileInfo = await FileSystem.getInfoAsync(filePath);
                    if (fileInfo.exists) {
                        await FileSystem.deleteAsync(filePath, { idempotent: true });
                        console.log(`[NodeSTCore] Deleted file: ${filePath}`);
                    }
                } catch (error) {
                    console.error(`[NodeSTCore] Error deleting file ${filePath}:`, error);
                }
            }));
            console.log('[NodeSTCore] Successfully deleted all data for conversation:', conversationId);
            return true;
        } catch (error) {
            console.error('[NodeSTCore] Error deleting character data:', error);
            return false;
        }
    }

    /**
     * 全局预设功能接口
     * @param switchStr "开启"|"关闭"
     * @param presetJsonStr JSON字符串
     */
    async setGlobalPreset(switchStr: string, presetJsonStr: string): Promise<boolean> {
        try {
            console.log(`[NodeSTCore][GlobalPreset] 操作: ${switchStr}`);
            if (switchStr === "开启") {
                console.log('[NodeSTCore][GlobalPreset] 传入数据:', presetJsonStr);
                let presetJson: PresetJson = JSON.parse(presetJsonStr);

                // === 新增：自动修正 prompt_order ===
                if (
                    !presetJson.prompt_order ||
                    !Array.isArray(presetJson.prompt_order) ||
                    !presetJson.prompt_order[0] ||
                    !Array.isArray(presetJson.prompt_order[0].order) ||
                    presetJson.prompt_order[0].order.length === 0
                ) {
                    // 自动生成 prompt_order，包含所有启用的 prompts
                    const enabledPrompts = (presetJson.prompts || []).filter(p => p.enable !== false);
                    presetJson.prompt_order = [
                        {
                            order: enabledPrompts.map(p => ({
                                identifier: p.identifier,
                                enabled: p.enable !== false
                            }))
                        }
                    ];
                    console.log('[NodeSTCore][GlobalPreset] 自动生成 prompt_order:', presetJson.prompt_order);
                }

                // 备份所有角色preset
                const backup = await StorageAdapter.backupAllPresets();
                await AsyncStorage.setItem('nodest_global_preset_backup', JSON.stringify(backup));
                console.log('[NodeSTCore][GlobalPreset] 已备份所有角色preset');
                // 替换所有角色preset
                const affectedIds = await StorageAdapter.replaceAllPresets(presetJson);
                console.log(`[NodeSTCore][GlobalPreset] 已批量替换preset，受影响角色ID:`, affectedIds);
                // 保存全局配置
                await StorageAdapter.saveGlobalPresetConfig({
                    enabled: true,
                    presetJson
                });
                console.log('[NodeSTCore][GlobalPreset] 全局预设配置已保存，功能已开启');
                return true;
            } else if (switchStr === "关闭") {
                // 恢复所有角色preset
                const backupStr = await AsyncStorage.getItem('nodest_global_preset_backup');
                if (backupStr) {
                    const backup = JSON.parse(backupStr);
                    await StorageAdapter.restoreAllPresets(backup);
                    console.log('[NodeSTCore][GlobalPreset] 已恢复所有角色preset');
                } else {
                    console.warn('[NodeSTCore][GlobalPreset] 未找到preset备份，跳过恢复');
                }
                await StorageAdapter.saveGlobalPresetConfig({
                    enabled: false,
                    presetJson: null
                });
                console.log('[NodeSTCore][GlobalPreset] 全局预设配置已保存，功能已关闭');
                return true;
            }
            console.warn('[NodeSTCore][GlobalPreset] 未知操作类型:', switchStr);
            return false;
        } catch (e) {
            console.error('[NodeSTCore][GlobalPreset] setGlobalPreset error:', e);
            return false;
        }
    }

    /**
     * 全局世界书功能接口
     * @param switchStr "开启"|"关闭"
     * @param priority "全局优先"|"角色优先"
     * @param worldbookJsonStr JSON字符串
     */
    async setGlobalWorldbook(switchStr: string, priority: '全局优先' | '角色优先', worldbookJsonStr: string): Promise<boolean> {
        try {
            console.log(`[NodeSTCore][GlobalWorldbook] 操作: ${switchStr}, 优先级: ${priority}`);
            if (switchStr === "开启") {
                console.log('[NodeSTCore][GlobalWorldbook] 传入数据:', worldbookJsonStr);
                const worldbookJson: WorldBookJson = JSON.parse(worldbookJsonStr);
                // 备份所有角色worldbook
                const backup = await StorageAdapter.backupAllWorldbooks();
                await AsyncStorage.setItem('nodest_global_worldbook_backup', JSON.stringify(backup));
                console.log('[NodeSTCore][GlobalWorldbook] 已备份所有角色worldbook');
                // 提取全局D类条目（position=4）
                const globalDEntries: Record<string, any> = {};
                Object.entries(worldbookJson.entries || {}).forEach(([k, v]) => {
                    if (v && v.position === 4) globalDEntries[k] = v;
                });
                console.log(`[NodeSTCore][GlobalWorldbook] 提取全局D类条目数量: ${Object.keys(globalDEntries).length}`);
                // 追加到所有角色
                const affectedIds = await StorageAdapter.appendGlobalDEntriesToAllWorldbooks(globalDEntries, priority);
                console.log(`[NodeSTCore][GlobalWorldbook] 已批量追加D类条目，受影响角色ID:`, affectedIds);
                // 保存全局配置
                await StorageAdapter.saveGlobalWorldbookConfig({
                    enabled: true,
                    priority,
                    worldbookJson
                });
                console.log('[NodeSTCore][GlobalWorldbook] 全局世界书配置已保存，功能已开启');
                return true;
            } else if (switchStr === "关闭") {
                // 恢复所有角色worldbook
                const backupStr = await AsyncStorage.getItem('nodest_global_worldbook_backup');
                if (backupStr) {
                    const backup = JSON.parse(backupStr);
                    await StorageAdapter.restoreAllWorldbooks(backup);
                    console.log('[NodeSTCore][GlobalWorldbook] 已恢复所有角色worldbook');
                } else {
                    console.warn('[NodeSTCore][GlobalWorldbook] 未找到worldbook备份，跳过恢复');
                }
                // 清除全局D类条目
                await StorageAdapter.removeGlobalDEntriesFromAllWorldbooks();
                console.log('[NodeSTCore][GlobalWorldbook] 已移除所有角色中的全局D类条目');
                await StorageAdapter.saveGlobalWorldbookConfig({
                    enabled: false,
                    priority,
                    worldbookJson: null
                });
                console.log('[NodeSTCore][GlobalWorldbook] 全局世界书配置已保存，功能已关闭');
                return true;
            }
            console.warn('[NodeSTCore][GlobalWorldbook] 未知操作类型:', switchStr);
            return false;
        } catch (e) {
            console.error('[NodeSTCore][GlobalWorldbook] setGlobalWorldbook error:', e);
            return false;
        }
    }

     /**
     * 构建rframework（prompt消息数组），并插入自定义chatHistory内容
     * @param inputText 聊天历史内容（字符串）
     * @param presetJsonStr 预设JSON字符串（标准格式）
     * @param adapterType 适配器类型："gemini" | "openrouter" | "openai-compatible"
     * @param worldBookJsonStr 世界书JSON字符串（可选）
     * @returns 格式化后的消息数组（最终发送给适配器的格式，不做正则替换）
     */
    static async buildRFrameworkWithChatHistory(
        inputText: string,
        presetJsonStr: string,
        adapterType: 'gemini' | 'openrouter' | 'openai-compatible',
        worldBookJsonStr?: string
    ): Promise<any[]> {
        // 1. 解析预设JSON
        let preset: any;
        try {
            preset = typeof presetJsonStr === 'string' ? JSON.parse(presetJsonStr) : presetJsonStr;
        } catch (e) {
            throw new Error('Invalid presetJsonStr: ' + (e instanceof Error ? e.message : String(e)));
        }
        if (!preset || !Array.isArray(preset.prompts) || !Array.isArray(preset.prompt_order)) {
            throw new Error('Invalid preset format');
        }

        // 2. 解析worldBookJson（可选）
        let worldBook: any = null;
        if (worldBookJsonStr) {
            try {
                worldBook = typeof worldBookJsonStr === 'string' ? JSON.parse(worldBookJsonStr) : worldBookJsonStr;
            } catch (e) {
                throw new Error('Invalid worldBookJsonStr: ' + (e instanceof Error ? e.message : String(e)));
            }
        }

        // 3. 查找chatHistory identifier
        const promptOrderArr = preset.prompt_order[0]?.order || [];
        let chatHistoryIdentifier = '';
        for (const item of promptOrderArr) {
            if (
                typeof item.identifier === 'string' &&
                (item.identifier.toLowerCase().includes('chathistory') ||
                 item.identifier.toLowerCase().includes('chat_history'))
            ) {
                chatHistoryIdentifier = item.identifier;
                break;
            }
        }
        if (!chatHistoryIdentifier) {
            // fallback: 尝试找第一个role为system或user的prompt
            const fallback = preset.prompts.find((p: any) =>
                typeof p.identifier === 'string' &&
                (p.identifier.toLowerCase().includes('chathistory') ||
                 p.identifier.toLowerCase().includes('chat_history'))
            );
            chatHistoryIdentifier = fallback?.identifier || 'chatHistory';
        }

        // 4. 构造chatHistory消息对象
        // 支持多轮对话（如输入为多行，偶数行为user，奇数行为assistant）
        let chatHistoryMessages: any[] = [];
        if (inputText.includes('\n')) {
            // 尝试按常见对话格式分割
            // 支持格式：用户: ...\n角色: ...\n
            const lines = inputText.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (/^(用户|user)[:：]/i.test(line)) {
                    chatHistoryMessages.push({
                        role: 'user',
                        content: line.replace(/^(用户|user)[:：]/i, '').trim()
                    });
                } else if (/^(角色|assistant|model|bot)[:：]/i.test(line)) {
                    chatHistoryMessages.push({
                        role: 'assistant',
                        content: line.replace(/^(角色|assistant|model|bot)[:：]/i, '').trim()
                    });
                } else {
                    // fallback: 交替分配
                    const last = chatHistoryMessages[chatHistoryMessages.length - 1];
                    chatHistoryMessages.push({
                        role: (!last || last.role === 'assistant') ? 'user' : 'assistant',
                        content: line
                    });
                }
            }
        } else {
            // 单条输入，默认为user
            chatHistoryMessages.push({
                role: 'user',
                content: inputText
            });
        }

        // 5. 按prompt_order组装rframework
        const promptMap = new Map<string, any>();
        for (const p of preset.prompts) {
            if (p.identifier) promptMap.set(p.identifier, p);
        }
        const rframework: any[] = [];
        for (const orderItem of promptOrderArr) {
            const identifier = orderItem.identifier;
            if (identifier === chatHistoryIdentifier) {
                // 插入chatHistory消息数组
                for (const msg of chatHistoryMessages) {
                    rframework.push({
                        role: msg.role,
                        content: msg.content
                    });
                }
            } else if (promptMap.has(identifier)) {
                const prompt = promptMap.get(identifier);
                if (prompt && prompt.content && prompt.content.trim() !== '') {
                    rframework.push({
                        role: prompt.role || 'user',
                        content: prompt.content
                    });
                }
            }
        }

        // 6. 如果没有worldBook，直接返回rframework（转换格式）
        if (!worldBook || !worldBook.entries || Object.keys(worldBook.entries).length === 0) {
            // 只构建rframework，不插入D类条目
            if (adapterType === 'gemini' || adapterType === 'openrouter') {
                return rframework.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : (msg.role === 'model' ? 'model' : 'user'),
                    parts: [{ text: msg.content }]
                }));
            } else if (adapterType === 'openai-compatible') {
                return rframework.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: msg.content
                }));
            } else {
                return rframework.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: msg.content
                }));
            }
        }

        // 7. 有worldBook时，插入D类条目（以inputText为基准，参考NodeSTCore.insertDEntriesToHistory）
        // 先组装chatHistoryEntity
        const chatHistoryParts = chatHistoryMessages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : (msg.role === 'model' ? 'model' : 'user'),
            parts: [{ text: msg.content }]
        }));
        const chatHistoryEntity = {
            name: "Chat History",
            role: "system",
            parts: chatHistoryParts,
            identifier: chatHistoryIdentifier
        };

        // 提取D类条目（仿照CharacterUtils.extractDEntries）
        const dEntries: any[] = [];
        // 只处理position=4的D类条目
        Object.values(worldBook.entries).forEach((entry: any) => {
            if (entry && entry.position === 4) {
                dEntries.push({
                    name: entry.name || '',
                    role: entry.role || 'user',
                    parts: [{ text: entry.content || '' }],
                    is_d_entry: true,
                    position: 4,
                    injection_depth: entry.depth || 0,
                    constant: entry.constant ?? true,
                    key: Array.isArray(entry.key) ? entry.key : []
                });
            }
        });

        // 插入D类条目（仿照NodeSTCore.insertDEntriesToHistory）
        function insertDEntriesToHistory(chatHistory: any, dEntries: any[], userMessage: string) {
            // 1. 先移除所有旧的D类条目
            const chatMessages = chatHistory.parts.filter((msg: any) => !msg.is_d_entry);
            // 2. 找到基准消息（最新的用户消息）的索引
            const baseMessageIndex = chatMessages.findIndex(
                (msg: any) => msg.role === "user" && msg.parts[0]?.text === userMessage
            );
            if (baseMessageIndex === -1) {
                return { ...chatHistory, parts: chatMessages };
            }
            // 3. 过滤 constant=true 的D类条目
            const validDEntries = dEntries.filter(entry => entry.constant === true);
            // 按注入深度分组
            const position4EntriesByDepth = validDEntries
                .filter(entry => entry.position === 4)
                .reduce((acc: Record<number, any[]>, entry) => {
                    const depth = typeof entry.injection_depth === 'number' ? entry.injection_depth : 0;
                    if (!acc[depth]) acc[depth] = [];
                    acc[depth].push({ ...entry, is_d_entry: true });
                    return acc;
                }, {});
            // 构建新消息序列
            const finalMessages: any[] = [];
            for (let i = 0; i < chatMessages.length; i++) {
                const msg = chatMessages[i];
                if (i < baseMessageIndex) {
                    const depthFromBase = baseMessageIndex - i;
                    if (depthFromBase > 0 && position4EntriesByDepth[depthFromBase]) {
                        finalMessages.push(...position4EntriesByDepth[depthFromBase]);
                    }
                }
                finalMessages.push(msg);
                if (i === baseMessageIndex && position4EntriesByDepth[0]) {
                    finalMessages.push(...position4EntriesByDepth[0]);
                }
            }
            return { ...chatHistory, parts: finalMessages };
        }

        // 以最后一条用户消息为基准
        let lastUserMsg = '';
        for (let i = chatHistoryMessages.length - 1; i >= 0; i--) {
            if (chatHistoryMessages[i].role === 'user') {
                lastUserMsg = chatHistoryMessages[i].content;
                break;
            }
        }
        const chatHistoryWithD = insertDEntriesToHistory(chatHistoryEntity, dEntries, lastUserMsg);

        // 重新组装rframework，替换chatHistory部分为插入D类条目的parts
        const finalMessages: any[] = [];
        for (const orderItem of promptOrderArr) {
            const identifier = orderItem.identifier;
            if (identifier === chatHistoryIdentifier) {
                // 插入chatHistoryWithD.parts
                for (const msg of chatHistoryWithD.parts) {
                    finalMessages.push({
                        role: msg.role,
                        parts: msg.parts,
                        is_d_entry: msg.is_d_entry
                    });
                }
            } else if (promptMap.has(identifier)) {
                const prompt = promptMap.get(identifier);
                if (prompt && prompt.content && prompt.content.trim() !== '') {
                    finalMessages.push({
                        role: prompt.role || 'user',
                        parts: [{ text: prompt.content }]
                    });
                }
            }
        }

        // 转换为适配器格式
        if (adapterType === 'gemini' || adapterType === 'openrouter') {
            return finalMessages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : (msg.role === 'model' ? 'model' : 'user'),
                parts: msg.parts
            }));
        } else if (adapterType === 'openai-compatible') {
            return finalMessages.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts?.[0]?.text || ''
            }));
        } else {
            return finalMessages.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts?.[0]?.text || ''
            }));
        }
    }
        
    /**
     * 删除指定 userIndex 的用户消息及其对应的AI消息
     * @param conversationId 会话ID
     * @param messageIndex userIndex+1
     * @returns true/false
     */
    async deleteUserMessageByIndex(
        conversationId: string,
        messageIndex: number
    ): Promise<boolean> {
        try {
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            if (!chatHistory) {
                console.error('[NodeSTCore] deleteUserMessageByIndex: 未找到聊天历史');
                return false;
            }
            const realMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
            const userMessages = realMessages.filter(msg =>
                msg.role === "user" && !msg.is_first_mes
            );
            if (messageIndex < 1 || messageIndex > userMessages.length) {
                console.error('[NodeSTCore] deleteUserMessageByIndex: messageIndex超出范围');
                return false;
            }
            const targetUserMsg = userMessages[messageIndex - 1];
            const userIdxInReal = realMessages.findIndex(msg => msg === targetUserMsg);
            if (userIdxInReal === -1) {
                console.error('[NodeSTCore] deleteUserMessageByIndex: 找不到用户消息在realMessages中的索引');
                return false;
            }
            // 向后找到对应的AI消息
            let aiIdxInReal = -1;
            for (let i = userIdxInReal + 1; i < realMessages.length; i++) {
                if (realMessages[i].role === "model" || realMessages[i].role === "assistant") {
                    aiIdxInReal = i;
                    break;
                }
            }
            // 构建新的parts（只移除这两条，保留D类条目）
            const aiMsgToDelete = aiIdxInReal !== -1 ? realMessages[aiIdxInReal] : null;
            const userMsgToDelete = realMessages[userIdxInReal];
            const newParts = chatHistory.parts.filter(msg =>
                msg.is_d_entry ||
                (msg !== userMsgToDelete && msg !== aiMsgToDelete)
            );
            const updatedHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: newParts
            };
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                updatedHistory
            );
            console.log(`[NodeSTCore] 已删除用户消息及其AI消息，userIndex=${messageIndex}, 新消息数=${updatedHistory.parts.length}`);
            return true;
        } catch (error) {
            console.error('[NodeSTCore] deleteUserMessageByIndex error:', error);
            return false;
        }
    }

    /**
     * 编辑指定 userIndex 的用户消息内容
     * @param conversationId 会话ID
     * @param messageIndex userIndex+1
     * @param newContent 新内容
     * @returns true/false
     */
    async editUserMessageByIndex(
        conversationId: string,
        messageIndex: number,
        newContent: string
    ): Promise<boolean> {
        try {
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            if (!chatHistory) {
                console.error('[NodeSTCore] editUserMessageByIndex: 未找到聊天历史');
                return false;
            }
            const realMessages = chatHistory.parts.filter(msg => !msg.is_d_entry);
            const userMessages = realMessages.filter(msg =>
                msg.role === "user" && !msg.is_first_mes
            );
            if (messageIndex < 1 || messageIndex > userMessages.length) {
                console.error('[NodeSTCore] editUserMessageByIndex: messageIndex超出范围');
                return false;
            }
            const targetUserMsg = userMessages[messageIndex - 1];
            const userMsgIdxInParts = chatHistory.parts.findIndex(msg => msg === targetUserMsg);
            if (userMsgIdxInParts === -1) {
                console.error('[NodeSTCore] editUserMessageByIndex: 找不到用户消息在parts中的索引');
                return false;
            }
            const updatedParts = [...chatHistory.parts];
            updatedParts[userMsgIdxInParts] = {
                ...targetUserMsg,
                parts: [{ text: newContent }]
            };
            const updatedHistory: ChatHistoryEntity = {
                ...chatHistory,
                parts: updatedParts
            };
            await this.saveJson(
                this.getStorageKey(conversationId, '_history'),
                updatedHistory
            );
            console.log(`[NodeSTCore] 已编辑用户消息内容，userIndex=${messageIndex}，新内容已保存`);
            return true;
        } catch (error) {
            console.error('[NodeSTCore] editUserMessageByIndex error:', error);
            return false;
        }
    }
            /**
     * 备份指定会话的聊天历史到带时间戳的备份文件
     * @param conversationId 会话ID
     * @param timestamp 备份时间戳（建议为Date.now()）
     * @returns true/false
     */
    async backupChatHistory(conversationId: string, timestamp: number): Promise<boolean> {
        try {
            // 加载当前聊天历史
            const chatHistory = await this.loadJson<ChatHistoryEntity>(
                this.getStorageKey(conversationId, '_history')
            );
            if (!chatHistory) {
                console.error('[NodeSTCore] backupChatHistory: 未找到聊天历史');
                return false;
            }
            // 构造备份文件路径
            const backupKey = `nodest_${conversationId}_history_backup_${timestamp}`;
            await FileSystem.makeDirectoryAsync(NodeSTCore.characterDataDir, { intermediates: true }).catch(() => {});
            const filePath = NodeSTCore.characterDataDir + backupKey + '.json';
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(chatHistory));
            console.log(`[NodeSTCore] 聊天历史已备份: ${filePath}`);
            return true;
        } catch (error) {
            console.error('[NodeSTCore] backupChatHistory error:', error);
            return false;
        }
    }
        /**
     * 静态方法：向指定会话的聊天历史末尾添加一条用户消息
     * @param conversationId 会话ID
     * @param userMessage 用户消息内容
     * @returns true/false
     */
    static async addUserMessage(conversationId: string, userMessage: string): Promise<boolean> {
        try {
            // 加载历史
            const filePath = NodeSTCore.characterDataDir + `nodest_${conversationId}_history.json`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) {
                console.error('[NodeSTCore] addUserMessage: 未找到聊天历史');
                return false;
            }
            const content = await FileSystem.readAsStringAsync(filePath);
            const chatHistory: ChatHistoryEntity = JSON.parse(content);

            // 追加用户消息，包含时间戳
            chatHistory.parts.push({
                role: "user",
                parts: [{ text: userMessage }],
                timestamp: Date.now() // 添加时间戳
            });

            // 保存
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(chatHistory));
            console.log('[NodeSTCore] addUserMessage: 用户消息已添加（含时间戳）');
            return true;
        } catch (error) {
            console.error('[NodeSTCore] addUserMessage error:', error);
            return false;
        }
    }

    /**
     * 静态方法：向指定会话的聊天历史末尾添加一条AI消息
     * @param conversationId 会话ID
     * @param aiMessage AI消息内容
     * @returns true/false
     */
    static async addAiMessage(conversationId: string, aiMessage: string): Promise<boolean> {
        try {
            // 加载历史
            const filePath = NodeSTCore.characterDataDir + `nodest_${conversationId}_history.json`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) {
                console.error('[NodeSTCore] addAiMessage: 未找到聊天历史');
                return false;
            }
            const content = await FileSystem.readAsStringAsync(filePath);
            const chatHistory: ChatHistoryEntity = JSON.parse(content);

            // 追加AI消息（role统一为model），包含时间戳
            chatHistory.parts.push({
                role: "model",
                parts: [{ text: aiMessage }],
                timestamp: Date.now() // 添加时间戳
            });

            // 保存
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(chatHistory));
            console.log('[NodeSTCore] addAiMessage: AI消息已添加（含时间戳）');
            return true;
        } catch (error) {
            console.error('[NodeSTCore] addAiMessage error:', error);
            return false;
        }
    }
        /**
     * 获取指定会话的角色开场白（first_mes）
     * @param conversationId 会话ID
     * @returns first_mes 字符串或 null
     */
    static async getFirstMes(conversationId: string): Promise<string | null> {
        try {
            const filePath = NodeSTCore.characterDataDir + `nodest_${conversationId}_role.json`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) return null;
            const content = await FileSystem.readAsStringAsync(filePath);
            const roleCard = JSON.parse(content);
            return roleCard && typeof roleCard.first_mes === 'string' ? roleCard.first_mes : null;
        } catch (error) {
            console.error('[NodeSTCore] getFirstMes error:', error);
            return null;
        }
    }
}


