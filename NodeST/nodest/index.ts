import { NodeSTCore } from './core/node-st-core';
import { 
    RoleCardJson, 
    WorldBookJson, 
    PresetJson, 
    AuthorNoteJson, 
    Character,
    GlobalSettings,
    ChatHistoryEntity,
    UserCustomSetting
} from '../../shared/types';
import { CircleManager, CirclePostOptions, CircleResponse } from './managers/circle-manager';
import { GroupManager } from '../../src/group/group-manager';
import { GeminiAdapter } from './utils/gemini-adapter';
import { OpenRouterAdapter } from './utils/openrouter-adapter';
import { OpenAIAdapter } from './utils/openai-adapter';
import { CharacterUtils } from './utils/character-utils';


export interface ProcessChatResponse {
    success: boolean;
    response?: string;
    error?: string;
}

export interface ProcessChatRequest {
    userMessage: string;
    conversationId: string;
    status: "更新人设" | "新建角色" | "同一角色继续对话";
    apiKey: string;
    apiSettings?: Partial<GlobalSettings['chat']>; // 修改为 Partial
    jsonString?: string;
    isCradleGeneration?: boolean; 
    characterId?: string;
    customUserName?: string;
    useToolCalls?: boolean;
    geminiOptions?: {
        geminiPrimaryModel?: string;
        geminiBackupModel?: string;
        retryDelay?: number;
    };
    onStream?: (delta: string) => void; // 新增
}

// 新增：请求日志接口
export interface RequestLogData {
    request: any;
    response?: string;
    timestamp: number;
    adapter: string;
    statusCode: number;
    error?: string;
    errorMessage?: string;
    statusText?: string;

}

export class NodeST {
    private nodeSTCore: NodeSTCore | null = null;
    private circleManager: CircleManager;
    private groupManager: GroupManager | null = null;
    private apiKey: string = '';
    private geminiAdapter: GeminiAdapter | null = null;
    private openRouterAdapter: OpenRouterAdapter | null = null;
    private openAICompatibleAdapter: OpenAIAdapter | null = null; // 新增

    constructor(apiKey: string = '') {
        this.apiKey = apiKey;
        console.log(`【NodeST】创建新实例，apiKey存在: ${!!apiKey}`);
        // Initialize CircleManager with apiKey
        this.circleManager = new CircleManager(apiKey);
        
        // Initialize adapters for direct content generation
        if (apiKey) {
            this.geminiAdapter = new GeminiAdapter(apiKey);
        }
    }
  
    setApiKey(apiKey: string): void {
        console.log(`【NodeST】设置API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'undefined'}`);
        this.apiKey = apiKey;
        
        // 如果已经存在核心实例，也更新它的API Key
        if (this.nodeSTCore) {
            this.nodeSTCore.updateApiKey(apiKey);
        }
        
        // 如果已经存在圈子管理器，也更新它的API Key
        // Note: We maintain any existing OpenRouter config when just setting API key
        if (this.circleManager) {
            const existingOpenRouterConfig = this.circleManager['openRouterConfig'];
            this.circleManager.updateApiKey(apiKey, existingOpenRouterConfig);
        }
        
        // Update adapters
        if (this.geminiAdapter) {
            this.geminiAdapter = new GeminiAdapter(apiKey);
        } else if (apiKey) {
            this.geminiAdapter = new GeminiAdapter(apiKey);
        }
    }

    // Add new method for updating API settings
    updateApiSettings(
        apiKey: string, 
        apiSettings?: Partial<GlobalSettings['chat']> // 修改为 Partial
    ): void {
        // Set API key first
        this.setApiKey(apiKey);
        
        // Update NodeSTCore settings if it exists
        if (this.nodeSTCore) {
            this.nodeSTCore.updateApiSettings(apiKey, apiSettings);
        }

        // Update CircleManager settings if it exists
        if (this.circleManager) {
            const openRouterConfig = apiSettings?.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled
                ? {
                    apiKey: apiSettings.openrouter.apiKey,
                    model: apiSettings.openrouter.model
                }
                : undefined;
                
            this.circleManager.updateApiKey(apiKey, openRouterConfig);
        }
        
        // Update adapters
        if (apiSettings?.apiProvider === 'openai-compatible' && apiSettings.OpenAIcompatible?.enabled) {
            this.openAICompatibleAdapter = new OpenAIAdapter({
                endpoint: apiSettings.OpenAIcompatible.endpoint || '',
                apiKey: apiSettings.OpenAIcompatible.apiKey || '',
                model: apiSettings.OpenAIcompatible.model || 'gpt-3.5-turbo'
            });
            // 清除其它适配器避免冲突
            this.geminiAdapter = null;
            this.openRouterAdapter = null;
        } else if (apiSettings?.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled) {
            this.openRouterAdapter = new OpenRouterAdapter(
                apiSettings.openrouter.apiKey || '',
                apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
            );
            // Clear gemini adapter to avoid conflicts
            this.geminiAdapter = null;
            this.openAICompatibleAdapter = null;
        } else {
            this.geminiAdapter = new GeminiAdapter(apiKey);
            // Clear other adapters to avoid conflicts
            this.openRouterAdapter = null;
            this.openAICompatibleAdapter = null;
        }
    }

    private getCoreInstance(
        apiKey: string = "",
        apiSettings?: Partial<GlobalSettings['chat']>, // 修改为 Partial
        geminiOptions?: {
            geminiPrimaryModel?: string;
            geminiBackupModel?: string;
            retryDelay?: number;
        }
    ): NodeSTCore {
        // 确保使用最新的API Key - could be empty string
        const effectiveApiKey = this.apiKey || apiKey;
        
        // 使用核心 API 设置初始化或更新 NodeSTCore
        if (!this.nodeSTCore) {
            console.log("[NodeST] Creating new NodeSTCore instance with API settings:", {
                provider: apiSettings?.apiProvider || 'gemini',
                hasOpenRouter: !!apiSettings?.openrouter,
                useGeminiModelLoadBalancing: apiSettings?.useGeminiModelLoadBalancing,
                useGeminiKeyRotation: apiSettings?.useGeminiKeyRotation,
                additionalKeysCount: apiSettings?.additionalGeminiKeys?.length,
                apiKeyLength: effectiveApiKey?.length || 0,
                usingCloudFallback: !effectiveApiKey
            });
            this.nodeSTCore = new NodeSTCore(effectiveApiKey, apiSettings, geminiOptions);
        } else {
            console.log("[NodeST] Updating existing NodeSTCore with API settings:", {
                provider: apiSettings?.apiProvider || 'gemini',
                hasOpenRouter: !!apiSettings?.openrouter,
                useGeminiModelLoadBalancing: apiSettings?.useGeminiModelLoadBalancing,
                useGeminiKeyRotation: apiSettings?.useGeminiKeyRotation,
                usingCloudFallback: !effectiveApiKey
            });
            this.nodeSTCore.updateApiSettings(effectiveApiKey, apiSettings, geminiOptions);
        }
        
        return this.nodeSTCore;
    }

    async processChatMessage(params: ProcessChatRequest): Promise<ProcessChatResponse> {
        try {
            // console.log("[NodeST] Processing chat message:", { 
            //     messageLength: params.userMessage.length,
            //     status: params.status,
            //     conversationId: params.conversationId,
            //     apiProvider: params.apiSettings?.apiProvider || 'gemini',
            //     useGeminiModelLoadBalancing: params.apiSettings?.useGeminiModelLoadBalancing,
            //     useGeminiKeyRotation: params.apiSettings?.useGeminiKeyRotation,
            //     additionalKeysCount: params.apiSettings?.additionalGeminiKeys?.length,
            //     hasJsonString: !!params.jsonString,
            //     useToolCalls: params.useToolCalls || false,
            //     apiKeyProvided: !!params.apiKey,
            //     characterId: params.characterId
            // });

            // Note: We pass the API key even if it's empty
            // 获取 NodeSTCore 实例，并传递 API 设置和 geminiOptions
            const core = this.getCoreInstance(params.apiKey || "", params.apiSettings, params.geminiOptions);

            if (params.status === "新建角色") {
                if (!params.jsonString) {
                    throw new Error("Character data is required for creating a new character");
                }

                // 解析角色数据并详细记录，帮助诊断问题
                try {
                    console.log("[NodeST] 解析角色JSON数据...");
                    const characterData = this.parseCharacterJson(params.jsonString);
                    
                    // 验证所有必要的数据都存在
                    // console.log("[NodeST] 验证角色数据完整性:", {
                    //     hasRoleCard: !!characterData.roleCard,
                    //     hasWorldBook: !!characterData.worldBook,
                    //     hasPreset: !!characterData.preset,
                    //     roleCardName: characterData.roleCard?.name,
                    //     worldBookEntries: Object.keys(characterData.worldBook?.entries || {}).length,
                    //     hasChatHistory: !!characterData.chatHistory,
                    //     chatHistoryMessagesCount: characterData.chatHistory?.parts.length || 0,
                    //     isCradleGeneration: params.isCradleGeneration || false
                    // });
                    
                    // 创建新角色
                    console.log("[NodeST] 开始创建新角色...");
                    const created = await core.createNewCharacter(
                        params.conversationId,
                        characterData.roleCard,
                        characterData.worldBook,
                        characterData.preset,
                        characterData.authorNote,
                        characterData.chatHistory,
                        { isCradleGeneration: params.isCradleGeneration || false }
                    );

                    if (!created) {
                        console.error("[NodeST] 创建新角色失败");
                        throw new Error("Failed to create new character");
                    }

                    // 返回角色的第一条消息
                    const response = characterData.roleCard.first_mes || "Hello!";
                    console.log("[NodeST] 角色创建成功，返回第一条消息");
                    return { 
                        success: true, 
                        response: response 
                    };
                } catch (parseError) {
                    console.error("[NodeST] 解析或创建角色时出错:", parseError);
                    throw parseError;
                }
            }
            else if (params.status === "更新人设") {
                if (!params.jsonString) {
                    throw new Error("Character data is required for updating a character");
                }

                console.log("[NodeST] Updating character settings for conversationId:", params.conversationId);
                const characterData = this.parseCharacterJson(params.jsonString);
                
                const updated = await core.updateCharacter(
                    params.conversationId,
                    characterData.roleCard,
                    characterData.worldBook,
                    characterData.preset,
                    characterData.authorNote
                );

                if (!updated) {
                    throw new Error("Failed to update character");
                }

                return { 
                    success: true,
                    response: "Character updated successfully"
                };
            }
            else if (params.status === "同一角色继续对话") {
                // 确认OpenAIcompatible参数已传递
                if (
                    params.apiSettings?.apiProvider === 'openai-compatible' &&
                    params.apiSettings?.OpenAIcompatible?.enabled
                ) {
                    console.log('[NodeST] OpenAIcompatible参数:', {
                        endpoint: params.apiSettings.OpenAIcompatible.endpoint,
                        model: params.apiSettings.OpenAIcompatible.model,
                        apiKey: params.apiSettings.OpenAIcompatible.apiKey
                    });
                }
                const response = await core.continueChat(
                    params.conversationId,
                    params.userMessage,
                    params.apiKey || "", // Pass empty string if not provided
                    params.characterId,
                    params.customUserName,
                    params.useToolCalls,
                    params.onStream // 新增，透传onStream
                );

                if (response) {
                    return { 
                        success: true, 
                        response: response 
                    };
                } else {
                    return { 
                        success: false, 
                        error: "Failed to generate response" 
                    };
                }
            }

            return { 
                success: false, 
                error: "Unknown status" 
            };
        }
        catch (error) {
            console.error("[NodeST] Error processing chat message:", error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : "Unknown error" 
            };
        }
    }

    // 解析角色数据JSON
    private parseCharacterJson(jsonString: string): {
        roleCard: RoleCardJson;
        worldBook: WorldBookJson;
        preset: PresetJson;
        authorNote?: AuthorNoteJson;
        chatHistory?: ChatHistoryEntity;  // Add chatHistory to return type
    } {
        try {
            console.log("[NodeST] 开始解析角色JSON数据，长度:", jsonString.length);
            
            // 尝试解析JSON
            const data = JSON.parse(jsonString);
            
            // 检查并确保关键字段存在
            if (!data.roleCard || !data.worldBook || !data.preset) {
                console.error("[NodeST] 角色数据缺少必要字段:", {
                    hasRoleCard: !!data.roleCard,
                    hasWorldBook: !!data.worldBook,
                    hasPreset: !!data.preset
                });
                
                // 创建基础数据
                const safeRoleCard = data.roleCard || {
                    name: "未命名角色",
                    first_mes: "你好，很高兴认识你！",
                    description: "这是一个角色",
                    personality: "友好",
                    scenario: "",
                    mes_example: ""
                };
                
                const safeWorldBook = data.worldBook || {
                    entries: {
                        "Alist": {
                            "comment": "Character Attributes List",
                            "content": `<attributes>\n  <personality>友好、随和</personality>\n  <appearance>未指定</appearance>\n  <likes>聊天</likes>\n  <dislikes>未指定</dislikes>\n</attributes>`,
                            "disable": false,
                            "position": 4,
                            "constant": true,
                            "key": [],
                            "order": 1,
                            "depth": 1,
                            "vectorized": false
                        }
                    }
                };
                
                const safePreset = data.preset || this.createDefaultPreset();
                
                // Create default chatHistory entity with first message
                const chatHistoryEntity: ChatHistoryEntity = {
                    name: "Chat History",
                    role: "system",
                    parts: safeRoleCard.first_mes ? [
                        {
                            role: "model",
                            parts: [{ text: safeRoleCard.first_mes }],
                            is_first_mes: true
                        }
                    ] : [],
                    identifier: "chatHistory"
                };
                
                return {
                    roleCard: safeRoleCard,
                    worldBook: safeWorldBook,
                    preset: safePreset,
                    authorNote: data.authorNote,
                    chatHistory: chatHistoryEntity
                };
            }
            
            // Verify preset has proper structure and add missing properties if needed
            if (data.preset) {
                console.log("[NodeST] 验证preset数据结构...");
                // If no prompts array, create it
                if (!Array.isArray(data.preset.prompts)) {
                    console.log("[NodeST] 创建默认的prompts数组");
                    data.preset.prompts = this.createDefaultPreset().prompts;
                }
                
                // If no prompt_order array, create it  
                if (!data.preset.prompt_order || !Array.isArray(data.preset.prompt_order) || 
                    data.preset.prompt_order.length === 0) {
                    console.log("[NodeST] 创建默认的prompt_order");
                    data.preset.prompt_order = this.createDefaultPreset().prompt_order;
                }
                
                // Check prompt_order structure and fix if needed
                if (data.preset.prompt_order && data.preset.prompt_order.length > 0) {
                    const firstOrder = data.preset.prompt_order[0];
                    if (!firstOrder || typeof firstOrder !== 'object') {
                        console.log("[NodeST] 修复空的prompt_order[0]对象");
                        data.preset.prompt_order[0] = { order: [] };
                    } else if (!firstOrder.order) {
                        console.log("[NodeST] 为prompt_order[0]添加缺失的order数组");
                        firstOrder.order = [];
                    } else if (!Array.isArray(firstOrder.order)) {
                        console.log("[NodeST] prompt_order[0].order不是数组，修复为空数组");
                        firstOrder.order = [];
                    }
                    
                    // Log the structure to help diagnose issues
                    console.log("[NodeST] prompt_order结构:", {
                        length: data.preset.prompt_order.length,
                        firstItemType: typeof data.preset.prompt_order[0],
                        hasOrderProp: firstOrder && 'order' in firstOrder,
                        orderType: firstOrder && firstOrder.order ? typeof firstOrder.order : 'undefined',
                        isOrderArray: firstOrder && firstOrder.order ? Array.isArray(firstOrder.order) : false,
                        orderLength: firstOrder && Array.isArray(firstOrder.order) ? firstOrder.order.length : 0
                    });
                }
                
                // Check that required system prompts exist
                const requiredPrompts = [
                    {name: "Character System", identifier: "characterSystem", role: "user"},
                    {name: "Character Confirmation", identifier: "characterConfirmation", role: "model"},
                    {name: "Character Introduction", identifier: "characterIntro", role: "user"},
                    {name: "Context Instruction", identifier: "contextInstruction", role: "user"},
                    {name: "Continue", identifier: "continuePrompt", role: "user"}
                ];
                
                // Add any missing required prompts
                for (const required of requiredPrompts) {
                    interface RequiredPrompt {
                        name: string;
                        identifier: string;
                        role: string;
                    }
                    
                    interface Prompt {
                        name: string;
                        content: string;
                        enable: boolean;
                        identifier: string;
                        role: string;
                        injection_position?: number;
                        injection_depth?: number;
                    }

                    // Check if the prompt exists using safe type checking
                    const hasPrompt = Array.isArray(data.preset.prompts) && 
                        data.preset.prompts.some((p: any) => 
                            p && typeof p === 'object' && p.identifier === required.identifier
                        );

                    if (!hasPrompt) {
                        console.log(`[NodeST] 添加缺失的必要prompt: ${required.identifier}`);
                        const defaultPrompt: Prompt | undefined = this.createDefaultPreset().prompts.find(
                            (p: Prompt) => p.identifier === required.identifier
                        );
                        if (defaultPrompt) {
                            data.preset.prompts.push(defaultPrompt);
                        }
                    }
                }
                
                // Ensure chatHistory is in the prompt_order
                const firstOrder = data.preset.prompt_order[0];
                if (firstOrder && Array.isArray(firstOrder.order)) {
                    // Define interfaces for the order entries
                    interface PromptOrderEntry {
                        identifier: string;
                        enabled: boolean;
                    }

                    // Check using safe type checking and add if missing
                    const hasChatHistory = firstOrder.order.some((o: any) => 
                        o && typeof o === 'object' && o.identifier === "chatHistory"
                    );
                    
                    if (!hasChatHistory) {
                        console.log("[NodeST] 在prompt_order中添加chatHistory");
                        // Find where to insert chatHistory (typically before contextInstruction)
                        const contextInstructionIndex: number = firstOrder.order.findIndex(
                            (o: any) => o && typeof o === 'object' && o.identifier === "contextInstruction"
                        );
                        
                        if (contextInstructionIndex !== -1) {
                            firstOrder.order.splice(contextInstructionIndex, 0, 
                                {identifier: "chatHistory", enabled: true} as PromptOrderEntry);
                        } else {
                            // Add it near the end
                            firstOrder.order.push({identifier: "chatHistory", enabled: true} as PromptOrderEntry);
                        }
                    }
                }
            }
            
            // If JSON data exists but doesn't have chatHistory, create it
            let chatHistory: ChatHistoryEntity ;
            
            if (!data.chatHistory) {
                console.log("[NodeST] 角色数据中未找到chatHistory，创建默认的chatHistory");
                
                // Look for a Chat History entry in the preset
                let chatHistoryIdentifier = "chatHistory";
                let chatHistoryName = "Chat History";
                
                // Try to find the chatHistory identifier in the preset
                if (data.preset && data.preset.prompt_order && data.preset.prompt_order[0]) {
                    const order = data.preset.prompt_order[0].order || [];
                    interface PromptOrderEntry {
                        identifier: string;
                        enabled: boolean;
                    }
                    const chatHistoryEntry: PromptOrderEntry | undefined = order.find((entry: any) => 
                        entry && typeof entry === 'object' && 
                        typeof entry.identifier === 'string' && 
                        entry.identifier.toLowerCase().includes('chathistory')
                    );
                    if (chatHistoryEntry) {
                        chatHistoryIdentifier = chatHistoryEntry.identifier;
                    }
                }
                
                // Create a chatHistory entity with the character's first message
                chatHistory = {
                    name: chatHistoryName,
                    role: "system",
                    parts: data.roleCard.first_mes ? [
                        {
                            role: "model",
                            parts: [{ text: data.roleCard.first_mes }],
                            is_first_mes: true
                        }
                    ] : [],
                    identifier: chatHistoryIdentifier
                };
                
                console.log("[NodeST] 已创建默认chatHistory，包含角色第一条消息");
            } else {
                // Use existing chatHistory but ensure it has the first message
                chatHistory = data.chatHistory;
                
                // Check if first message exists, if not add it
                const hasFirstMessage = Array.isArray(chatHistory.parts) && 
                    chatHistory.parts.some(msg => msg && typeof msg === 'object' && msg.is_first_mes);
                    
                if (!hasFirstMessage && data.roleCard && data.roleCard.first_mes) {
                    if (!Array.isArray(chatHistory.parts)) {
                        chatHistory.parts = [];
                    }
                    
                    chatHistory.parts.unshift({
                        role: "model",
                        parts: [{ text: data.roleCard.first_mes }],
                        is_first_mes: true
                    });
                    console.log("[NodeST] 在chatHistory中添加了缺失的first_mes");
                }
            }
            
            console.log("[NodeST] 角色JSON数据解析成功，chatHistory状态:", {
                exists: !!chatHistory,
                messagesCount: chatHistory?.parts?.length || 0,
                hasFirstMessage: Array.isArray(chatHistory.parts) && 
                    chatHistory.parts.some(p => p && typeof p === 'object' && p.is_first_mes) || false
            });
            
            return {
                roleCard: data.roleCard,
                worldBook: data.worldBook,
                preset: data.preset,
                authorNote: data.authorNote,
                chatHistory: chatHistory  // Return the processed chatHistory
            };
        } catch (error) {
            console.error("[NodeST] Error parsing character JSON:", error);
            throw new Error("Invalid character data");
        }
    }

    // Add a helper method to create the default preset structure
    private createDefaultPreset(): PresetJson {
        return {
            prompts: [
                {
                    name: "Character System",
                    content: "You are a Roleplayer who is good at playing various types of roles. Regardless of the genre, you will ensure the consistency and authenticity of the role based on the role settings I provide, so as to better fulfill the role.",
                    enable: true,
                    identifier: "characterSystem", 
                    role: "user"
                },
                {
                    name: "Character Confirmation",
                    content: "[Understood]",
                    enable: true,
                    identifier: "characterConfirmation",
                    role: "model"
                },
                {
                    name: "Character Introduction",
                    content: "The following are some information about the character you will be playing. Additional information will be given in subsequent interactions.",
                    enable: true,
                    identifier: "characterIntro",
                    role: "user"
                },
                {
                    name: "Enhance Definitions",
                    content: "",
                    enable: true,
                    identifier: "enhanceDefinitions",
                    injection_position: 1,
                    injection_depth: 3,
                    role: "user"
                },
                {
                    name: "Context Instruction",
                    content: "推荐以下面的指令&剧情继续：\n{{lastMessage}}",
                    enable: true,
                    identifier: "contextInstruction",
                    role: "user"
                },
                {
                    name: "Continue",
                    content: "继续",
                    enable: true,
                    identifier: "continuePrompt", 
                    role: "user"
                }
            ],
            prompt_order: [{
                order: [
                    { identifier: "characterSystem", enabled: true },
                    { identifier: "characterConfirmation", enabled: true },
                    { identifier: "characterIntro", enabled: true },
                    { identifier: "enhanceDefinitions", enabled: true },
                    { identifier: "worldInfoBefore", enabled: true },
                    { identifier: "charDescription", enabled: true },
                    { identifier: "charPersonality", enabled: true },
                    { identifier: "scenario", enabled: true },
                    { identifier: "worldInfoAfter", enabled: true },
                    { identifier: "dialogueExamples", enabled: true },
                    { identifier: "chatHistory", enabled: true },
                    { identifier: "contextInstruction", enabled: true },
                    { identifier: "continuePrompt", enabled: true }
                ]
            }]
        };
    }

    // Circle 相关方法
    async initCharacterCircle(character: Character | string): Promise<boolean> {
        try {
            const characterId = typeof character === 'string' ? character : character.id;
            console.log(`【NodeST】初始化角色朋友圈: ${characterId}, apiKey存在: ${!!this.apiKey}`);
            const circleManager = this.getCircleManager();
            return await circleManager.initCharacterCircle(characterId);
        } catch (error) {
            console.error("[NodeST] Error initializing character circle:", error);
            return false;
        }
    }
    private getCircleManager(): CircleManager {
        if (!this.circleManager) {
            // When creating a new instance, respect any existing API settings
            console.log(`【NodeST】创建新的CircleManager实例，apiKey存在: ${!!this.apiKey}`);
            this.circleManager = new CircleManager(this.apiKey);
        }
        return this.circleManager;
    }

    async processCircleInteraction(options: CirclePostOptions): Promise<CircleResponse> {
        try {
            console.log(`【NodeST】处理朋友圈互动: ${options.type}, apiKey存在: ${!!this.apiKey}`);
            
            const circleManager = this.getCircleManager();
            
            // If we have responderId but the framework hasn't been initialized yet
            // First check if we have a valid character object in the options
            if (options.responderCharacter) {
                console.log(`【NodeST】使用提供的角色数据初始化朋友圈框架: ${options.responderCharacter.name}`);
                await circleManager.circleInit(options.responderCharacter);
            } else {
                // Otherwise initialize using just the ID
                console.log(`【NodeST】确保角色朋友圈已初始化: ${options.responderId}`);
                const initialized = await circleManager.initCharacterCircle(options.responderId);
                
                if (!initialized) {
                    console.error(`【NodeST】角色 ${options.responderId} 朋友圈初始化失败`);
                    return {
                        success: false,
                        error: "朋友圈框架初始化失败"
                    };
                }
            }
            
            // Now process the interaction
            return await circleManager.circlePost(options, this.apiKey);
        } catch (error) {
            console.error("[NodeST] Error processing circle interaction:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }

    /**
     * 从特定消息位置重新生成对话
     * @param conversationId 会话ID
     * @param messageIndex 要重新生成的消息索引
     * @param apiKey API密钥
     * @param characterId 可选的角色ID，用于记忆服务
     * @param customUserName 可选的自定义用户名
     * @param apiSettings 可选的API设置
     * @param onStream 可选的流式回调函数
     * @returns 新生成的回复或null
     */
    async regenerateFromMessage(
        conversationId: string,
        messageIndex: number,
        apiKey: string,
        characterId?: string,
        customUserName?: string, // Add parameter for customUserName
        apiSettings?: Partial<GlobalSettings['chat']>, // <-- 新增参数
        onStream?: (delta: string) => void // 新增参数
    ): Promise<string | null> {
        try {
            // 确保实例已初始化
            if (!this.nodeSTCore && apiKey) {
                this.nodeSTCore = new NodeSTCore(apiKey);
            }

            if (!this.nodeSTCore) {
                throw new Error('NodeSTCore未初始化');
            }

            // === 修复点：确保apiSettings已更新，adapter已切换 ===
            this.updateApiSettings(apiKey, apiSettings);

            console.log(`[NodeST] Regenerating message at index ${messageIndex} for conversation ${conversationId}`);
            
            // 调用NodeSTCore的regenerateFromMessage方法，传递apiSettings
            return await this.nodeSTCore.regenerateFromMessage(
                conversationId,
                messageIndex,
                apiKey,
                characterId,
                customUserName, // Pass customUserName to core.regenerateFromMessage
                apiSettings, // <-- 新增
                onStream // 新增
            );
        } catch (error) {
            console.error('[NodeST] regenerateFromMessage失败:', error);
            throw error;
        }
    }

    /**
     * 重置对话历史，只保留角色的开场白
     * @param conversationId 会话ID
     * @returns 是否成功重置
     */
    async resetChatHistory(conversationId: string): Promise<boolean> {
        try {
            // 允许无API key时初始化NodeSTCore
            if (!this.nodeSTCore) {
                // 不再要求this.apiKey存在
                console.log(`【NodeST】NodeSTCore未初始化，正在初始化实例: ${conversationId}`);
                this.nodeSTCore = new NodeSTCore(this.apiKey || "");
            }

            console.log(`【NodeST】重置对话历史: ${conversationId}`);
            return await this.nodeSTCore.resetChatHistory(conversationId);
        } catch (error) {
            console.error('[NodeST] Error resetting chat history:', error);
            return false;
        }
    }

    /**
     * Delete all data associated with a character/conversation
     * This operation doesn't require an API key since it's just deleting storage
     * 
     * @param conversationId The conversation ID to delete data for
     * @returns true if deletion was successful, false otherwise
     */
    async deleteCharacterData(conversationId: string): Promise<boolean> {
        try {
            // For deletion operations, we can create a nodeSTCore instance
            // even without an API key - it will just be limited in functionality
            if (!this.nodeSTCore) {
                console.log(`【NodeST】初始化NodeSTCore实例用于删除角色数据: ${conversationId}`);
                this.nodeSTCore = new NodeSTCore(this.apiKey || "");  // Empty string is ok for deletion
            }
            
            console.log(`【NodeST】删除角色数据: ${conversationId}`);
            return await this.nodeSTCore.deleteCharacterData(conversationId);
        } catch (error) {
            console.error('[NodeST] Error deleting character data:', error);
            return false;
        }
    }

    /**
     * 生成文本内容 - 供群聊等功能直接使用
     * @param prompt 提示词文本
     * @param characterId 可选，便于表格记忆
     * @returns 生成的内容
     */
    async generateContent(prompt: string, characterId?: string): Promise<string> {
        try {
            console.log(`【NodeST】生成内容，提示词长度: ${prompt.length}，使用提供商: ${this.openAICompatibleAdapter ? 'OpenAI-compatible' : this.openRouterAdapter ? 'OpenRouter' : 'Gemini'}`);
            
            // Initialize adapters if they don't exist - no API key check needed
            if (!this.openRouterAdapter && !this.geminiAdapter && !this.openAICompatibleAdapter) {
                // Create Gemini adapter - it can handle empty API key now
                this.geminiAdapter = new GeminiAdapter(this.apiKey || "");
            }
            
            // Create message content
            const message = {
                role: "user",
                parts: [{ text: prompt }]
            };
            
            let response: string;
            
            // 优先 openai-compatible
            if (this.openAICompatibleAdapter) {
                console.log('【NodeST】使用OpenAI-compatible适配器生成内容');
                response = await this.openAICompatibleAdapter.generateContent(
                    [message],
                    characterId
                );
            } else if (this.openRouterAdapter) {
                console.log('【NodeST】使用OpenRouter适配器生成内容');
                response = await this.openRouterAdapter.generateContent([message]);
            } else if (this.geminiAdapter) {
                console.log('【NodeST】使用Gemini适配器生成内容');
                response = await this.geminiAdapter.generateContent([message]);
            } else {
                throw new Error('没有可用的API适配器');
            }
            
            console.log(`【NodeST】内容生成成功，回复长度: ${response.length}`);
            return response;
        } catch (error) {
            console.error('【NodeST】生成内容失败:', error);
            throw error;
        }
    }

    /**
     * Sets a global custom user setting
     * @param customSetting The custom setting to apply globally
     * @returns Promise that resolves to true if successful
     */
    public async setGlobalCustomSetting(customSetting: UserCustomSetting): Promise<boolean> {
        try {
            return await CharacterUtils.saveGlobalCustomSetting(customSetting);
        } catch (error) {
            console.error('[NodeST] Error setting global custom setting:', error);
            return false;
        }
    }

    /**
     * Gets the current global custom user setting
     * @returns Promise that resolves to the custom setting or null
     */
    public async getGlobalCustomSetting(): Promise<UserCustomSetting | null> {
        try {
            return await CharacterUtils.getGlobalCustomSetting();
        } catch (error) {
            console.error('[NodeST] Error getting global custom setting:', error);
            return null;
        }
    }

    // 新增：立即总结记忆方法
    async processMemorySummaryNow(params: {
        conversationId: string;
        characterId: string;
        apiKey: string;
        apiSettings?: Partial<GlobalSettings['chat']>;
    }): Promise<{ success: boolean; error?: string }> {
        try {
            // 获取核心实例
            const core = this.getCoreInstance(params.apiKey, params.apiSettings);
            const ok = await core.summarizeMemoryNow(
                params.conversationId,
                params.characterId,
                params.apiKey,
                params.apiSettings
            );
            return ok ? { success: true } : { success: false, error: '记忆总结失败' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '未知错误' };
        }
    }

    /**
     * 获取最新的API请求和响应数据
     * @returns 最新的请求/响应数据，如果没有则返回null
     */
    getLatestApiRequestLog(): RequestLogData | null {
        const data = NodeSTCore.getLatestRequestData();
        if (!data) return null;
        
        return {
            ...data,
            statusCode: data.statusCode ?? 0, // Provide default value 0 if statusCode is undefined
            error: data.errorMessage // Map errorMessage to error property
        };
    }

    /**
     * 静态方法：构建rframework并插入自定义chatHistory内容，返回最终消息数组（适配器格式）
     * @param inputText 聊天历史内容
     * @param presetJsonStr 预设JSON字符串
     * @param adapterType 适配器类型
     * @param worldBookJsonStr 世界书JSON字符串（可选）
     */
    static async buildRFrameworkWithChatHistory(
        inputText: string,
        presetJsonStr: string,
        adapterType: 'gemini' | 'openrouter' | 'openai-compatible',
        worldBookJsonStr?: string
    ): Promise<any[]> {
        return await NodeSTCore.buildRFrameworkWithChatHistory(
            inputText,
            presetJsonStr,
            adapterType,
            worldBookJsonStr
        );
    }
}
