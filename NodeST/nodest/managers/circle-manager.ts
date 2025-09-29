import { Character } from '../../../shared/types';
import { CircleRFramework, CirclePostOptions, CircleResponse } from '@/shared/types/circle-types';
import { GeminiAdapter } from '../utils/gemini-adapter';
import { OpenRouterAdapter } from '../utils/openrouter-adapter';
import { OpenAIAdapter } from '../utils/openai-adapter'; // 新增导入
import { MessageBoxItem, RelationshipMapData } from '../../../shared/types/relationship-types';
import { PromptBuilderService, DEntry, RFrameworkEntry } from '../services/prompt-builder-service';
import CirclePrompts, { defaultScenePrompt, ScenePromptParams } from '@/prompts/circle-prompts';
import { StorageAdapter } from '../utils/storage-adapter';
import { getCloudServiceStatus, getApiSettings } from '../../../utils/settings-helper';
import * as FileSystem from 'expo-file-system'; // Add this import
import * as ImageManipulator from 'expo-image-manipulator'; // Add this import

export { CirclePostOptions, CircleResponse };
export class CircleManager {
    
    private geminiAdapter: GeminiAdapter | null = null;
    private openRouterAdapter: OpenRouterAdapter | null = null;
    private openAIAdapter: OpenAIAdapter | null = null; // 新增openai-compatible适配器
    private apiKey?: string;
    private openRouterConfig?: {
        apiKey?: string;
        model?: string;
    };
    // Add rate limiting variables
    private static requestQueue: Array<{
        resolve: (value: string) => void;
        reject: (error: any) => void;
        prompt: string;
    }> = [];
    private static isProcessing = false;
    private static requestInterval = 2000; // 2 seconds between requests
    private static lastRequestTime = 0;
    // Add cloud service flag
    private useCloudService: boolean = false;
    
    constructor(
        apiKey?: string,
        openRouterConfig?: {
            apiKey?: string;
            model?: string;
        }
    ) {
        this.apiKey = apiKey || '';
        this.openRouterConfig = openRouterConfig;
        
        // Check cloud service status from global settings
        this.useCloudService = getCloudServiceStatus();
        
        console.log(`【CircleManager】创建实例，apiKey存在: ${!!apiKey}, openRouter配置:`, 
            openRouterConfig ? {
                hasKey: !!openRouterConfig.apiKey,
                model: openRouterConfig.model
            } : 'none',
            `云服务状态: ${this.useCloudService ? '启用' : '禁用'}`
        );
        
        // 初始化适配器
        if (openRouterConfig?.apiKey) {
            this.openRouterAdapter = new OpenRouterAdapter(
                openRouterConfig.apiKey,
                openRouterConfig.model || 'openai/gpt-3.5-turbo'
            );
            console.log('【CircleManager】已初始化 OpenRouter 适配器');
        } else if (apiKey) {
            this.geminiAdapter = new GeminiAdapter(apiKey);
            console.log('【CircleManager】已初始化 Gemini 适配器');
        }

        // 检查 openai-compatible 配置
        const apiSettings = getApiSettings();
        if (apiSettings.apiProvider === 'openai-compatible' && apiSettings.OpenAIcompatible?.enabled) {
            this.openAIAdapter = new OpenAIAdapter({
                endpoint: apiSettings.OpenAIcompatible.endpoint || '',
                apiKey: apiSettings.OpenAIcompatible.apiKey || '',
                model: apiSettings.OpenAIcompatible.model || 'gpt-3.5-turbo'
            });
            console.log('【CircleManager】已初始化 OpenAI-compatible 适配器');
        }
    }

    updateApiKey(
        apiKey: string,
        openRouterConfig?: {
            apiKey?: string;
            model?: string;
        }
    ): void {
        // Check cloud service status from global settings
        this.useCloudService = getCloudServiceStatus();
        
        console.log(`【CircleManager】更新API Key和配置`, {
            hasGeminiKey: !!apiKey,
            hasOpenRouterKey: !!openRouterConfig?.apiKey,
            openRouterModel: openRouterConfig?.model,
            useCloudService: this.useCloudService
        });
        
        this.apiKey = apiKey;
        
        // Clear existing adapters to prevent conflicts
        this.geminiAdapter = null;
        this.openRouterAdapter = null;
        this.openAIAdapter = null; // 清理openAIAdapter
        
        // Only update OpenRouter configuration if explicitly provided
        if (openRouterConfig && openRouterConfig.apiKey) {
            this.openRouterConfig = openRouterConfig;
            
            // If OpenRouter config is provided, use it
            this.openRouterAdapter = new OpenRouterAdapter(
                openRouterConfig.apiKey,
                openRouterConfig.model || 'openai/gpt-3.5-turbo'
            );
            console.log('【CircleManager】已初始化/更新 OpenRouter 适配器，模型:', openRouterConfig.model);
        } 
        // Otherwise, use Gemini adapter
        else {
            this.geminiAdapter = new GeminiAdapter(apiKey);
            console.log('【CircleManager】已初始化/更新 Gemini 适配器');
        }

        // 检查 openai-compatible 配置
        const apiSettings = getApiSettings();
        if (apiSettings.apiProvider === 'openai-compatible' && apiSettings.OpenAIcompatible?.enabled) {
            this.openAIAdapter = new OpenAIAdapter({
                endpoint: apiSettings.OpenAIcompatible.endpoint || '',
                apiKey: apiSettings.OpenAIcompatible.apiKey || '',
                model: apiSettings.OpenAIcompatible.model || 'gpt-3.5-turbo'
            });
            console.log('【CircleManager】已初始化/更新 OpenAI-compatible 适配器');
        }
    }

    private getStorageKey(conversationId: string, suffix: string = ''): string {
        return `nodest_${conversationId}${suffix}`;
    }

    // Replace AsyncStorage with FileSystem for JSON storage
    private async saveJson(key: string, data: any): Promise<void> {
        try {
            const jsonString = JSON.stringify(data);
            // Save as a file in the nodest_characters directory, using the key as filename
            const dir = FileSystem.documentDirectory + 'nodest_characters/';
            // Ensure directory exists
            const dirInfo = await FileSystem.getInfoAsync(dir);
            if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
            }
            const filePath = dir + key + '.json';
            await FileSystem.writeAsStringAsync(filePath, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
            console.log(`【CircleManager】保存数据到 ${filePath}, 数据大小: ${jsonString.length} 字符`);
        } catch (error) {
            console.error(`【CircleManager】保存数据失败，键名: ${key}:`, error);
            throw error;
        }
    }

    private async loadJson<T>(key: string): Promise<T | null> {
        try {
            const dir = FileSystem.documentDirectory + 'nodest_characters/';
            const filePath = dir + key + '.json';
            // Check if file exists
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) {
                console.log(`【CircleManager】未找到数据文件，键名: ${key}`);
                return null;
            }
            const data = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
            if (!data) {
                console.log(`【CircleManager】数据文件为空，键名: ${key}`);
                return null;
            }
            console.log(`【CircleManager】加载数据成功，键名: ${key}, 数据大小: ${data.length} 字符`);
            return JSON.parse(data);
        } catch (error) {
            console.error(`【CircleManager】加载数据失败，键名: ${key}:`, error);
            return null;
        }
    }

    // 实现真实的API调用
    private async getChatResponse(prompt: string): Promise<string> {
        try {
            // Check if cloud service is enabled, and handle accordingly
            if (this.useCloudService) {
                console.log('【朋友圈】云服务已启用，将使用云端API');
                // In a real implementation, we would use a cloud service API here
                // For now, we'll fall back to local adapters
            }
            
            console.log('【朋友圈】发送请求到LLM, 使用适配器:', 
                this.openRouterAdapter ? 'OpenRouter' : 'Gemini'
            );
            

            
            // Return a promise that will be resolved when the request is processed
            return new Promise((resolve, reject) => {
                // Add request to queue
                CircleManager.requestQueue.push({
                    resolve,
                    reject,
                    prompt
                });
                
                // Process queue if not already processing
                if (!CircleManager.isProcessing) {
                    this.processRequestQueue();
                }
            });
        } catch (error) {
            console.error('【朋友圈】获取AI回复失败:', error);
            console.log('【朋友圈】API调用失败，使用备用模拟数据');
            return this.getMockResponse();
        }
    }
    
    // Update the processRequestQueue method to better handle adapter selection and image support
    private async processRequestQueue(): Promise<void> {
        // Set processing flag
        CircleManager.isProcessing = true;
        
        // Get latest settings in case they changed
        const apiSettings = getApiSettings();
        const currentCloudStatus = getCloudServiceStatus();
        
        // Update local status if it changed
        if (this.useCloudService !== currentCloudStatus) {
            console.log(`【朋友圈】云服务状态已变更: ${this.useCloudService} -> ${currentCloudStatus}`);
            this.useCloudService = currentCloudStatus;
        }
        
        while (CircleManager.requestQueue.length > 0) {
            const now = Date.now();
            const timeSinceLastRequest = now - CircleManager.lastRequestTime;
            
            // If we need to wait, do so
            if (timeSinceLastRequest < CircleManager.requestInterval) {
                const waitTime = CircleManager.requestInterval - timeSinceLastRequest;
                console.log(`【朋友圈】API速率限制：等待 ${waitTime}ms 后发送下一个请求`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            // Get next request from queue
            const request = CircleManager.requestQueue.shift();
            if (!request) continue;
            
            try {
                // Check if the request contains image references
                const containsImage = request.prompt.includes('![') || 
                                     request.prompt.includes('image_url') ||
                                     request.prompt.includes('图片') || 
                                     request.prompt.includes('图像');
                
                // Create message content
                const message = {
                    role: "user",
                    parts: [{ text: request.prompt }]
                };
                
                let response: string;

                // 优先判断 openai-compatible
                if (
                    apiSettings.apiProvider === 'openai-compatible' &&
                    this.openAIAdapter
                ) {
                    console.log('【朋友圈】使用OpenAI-compatible适配器发送请求');
                    // 判断是否为多模态请求
                    if (containsImage) {
                        // 这里只处理文本+图片的简单情况
                        // 你可以根据实际需求扩展图片提取逻辑
                        const multimodalMessages = [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: request.prompt
                                    }
                                    // 图片部分由circlePost处理
                                ]
                            }
                        ];
                        // 这里只返回文本内容
                        const multimodalResult = await this.openAIAdapter.generateMultiModalContent(request.prompt, {});
                        response = multimodalResult.text || '';
                    } else {
                        // 普通文本请求
                        response = await this.openAIAdapter.chatCompletion([
                            { role: "user", content: request.prompt }
                        ]).then(res => res.choices?.[0]?.message?.content || '');
                    }
                    CircleManager.lastRequestTime = Date.now();
                    request.resolve(response);
                    continue;
                }

                // Check if cloud service is enabled first
                if (this.useCloudService) {
                    console.log('【朋友圈】云服务已启用，尝试使用云端API');
                    
                    try {
                        // Import CloudServiceProvider if not already imported
                        const { CloudServiceProvider } = require('@/services/cloud-service-provider');
                        
                        if (CloudServiceProvider.isEnabled()) {
                            console.log(`【朋友圈】通过CloudServiceProvider发送请求${containsImage ? '（包含图片内容）' : ''}`);
                            
                            if (containsImage) {
                                // For image content, use the multimodal API
                                console.log('【朋友圈】检测到图片内容，使用多模态API');
                                
                                // This is a placeholder - in a real implementation, we would:
                                // 1. Extract image URLs or base64 data from the prompt
                                // 2. Convert local URLs to base64 data if needed
                                // 3. Format according to the required structure
                                
                                // Example of how we should format the image data
                                const exampleImageData = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD..."; // This should be actual base64 data
                                
                                const multimodalMessages = [
                                    {
                                        role: "user",
                                        content: [
                                            {
                                                type: "text",
                                                text: request.prompt
                                            },
                                            // Properly formatted image data for the cloud API
                                            {
                                                type: "image_url",
                                                image_url: {
                                                    url: exampleImageData // base64 data with MIME type
                                                }
                                            }
                                        ]
                                    }
                                ];
                                
                                const cloudResponse = await CloudServiceProvider.generateMultiModalContent(
                                    multimodalMessages,
                                    {
                                        model: CloudServiceProvider.getMultiModalModel(),
                                        temperature: 0.7,
                                        max_tokens: 2048
                                    }
                                );
                                
                                if (cloudResponse.ok) {
                                    const result = await cloudResponse.json();
                                    if (result.choices && result.choices.length > 0) {
                                        // Extract text content from the response
                                        let responseContent = result.choices[0].message?.content;
                                        
                                        // Handle both string and array format responses
                                        if (typeof responseContent === 'string') {
                                            response = responseContent;
                                        } else if (Array.isArray(responseContent)) {
                                            // Extract all text parts
                                            response = responseContent
                                                .filter((part: any) => part.type === 'text')
                                                .map((part: any) => part.text)
                                                .join('\n');
                                        } else {
                                            response = "未能获取有效的AI回复";
                                        }
                                        
                                        console.log('【朋友圈】成功从云服务获取多模态响应');
                                        
                                        // Update last request time
                                        CircleManager.lastRequestTime = Date.now();
                                        
                                        // Resolve the promise
                                        request.resolve(response);
                                        continue; // Continue to next request
                                    }
                                }
                            } else {
                                // For text-only content, use the chat completion API
                                const cloudResponse = await CloudServiceProvider.generateChatCompletion(
                                    [{ role: "user", content: request.prompt }],
                                    {
                                        model: CloudServiceProvider.getPreferredModel(),
                                        temperature: 0.7,
                                        max_tokens: 2048
                                    }
                                );
                                
                                if (cloudResponse.ok) {
                                    const result = await cloudResponse.json();
                                    if (result.choices && result.choices.length > 0) {
                                        response = result.choices[0].message?.content || "";
                                        console.log('【朋友圈】成功从云服务获取响应');
                                        
                                        // Update last request time
                                        CircleManager.lastRequestTime = Date.now();
                                        
                                        // Resolve the promise
                                        request.resolve(response);
                                        continue; // Continue to next request
                                    }
                                }
                            }
                            
                            console.log('【朋友圈】云服务请求失败，尝试使用本地适配器');
                        }
                    } catch (cloudError) {
                        console.error('【朋友圈】云服务请求出错:', cloudError);
                        console.log('【朋友圈】云服务请求失败，尝试使用本地适配器');
                    }
                }
                
                // If we reach here, either cloud service is disabled or failed
                // Prioritize OpenRouter adapter if available
                if (this.openRouterAdapter) {
                    console.log('【朋友圈】使用OpenRouter适配器发送请求');
                    response = await this.openRouterAdapter.generateContent([message]);
                } else if (this.geminiAdapter) {
                    console.log('【朋友圈】使用Gemini适配器发送请求');
                    response = await this.geminiAdapter.generateContent([message]);
                } else if (this.useCloudService) {
                    // If cloud service is enabled but we couldn't use it earlier and no local adapters are available,
                    // log that cloud service failed and use mock data
                    console.log('【朋友圈】云服务调用失败且没有配置本地API适配器，使用模拟数据');
                    response = this.getMockResponse();
                } else {
                    // No cloud service and no adapters
                    console.log('【朋友圈】没有启用云服务且无可用的API适配器，使用模拟数据');
                    response = this.getMockResponse();
                }
                
                // Update last request time
                CircleManager.lastRequestTime = Date.now();
                
                // Resolve the promise
                request.resolve(response);
            } catch (error) {
                console.error('【朋友圈】API请求失败:', error);
                request.reject(error);
            }
        }
        
        // Clear processing flag
        CircleManager.isProcessing = false;
    }

    // 获取模拟响应作为备选方案
    private getMockResponse(): string {
        const mockResponseTypes = [
            // 普通JSON响应
            JSON.stringify({
                action: {
                    like: Math.random() > 0.3,
                    comment: Math.random() > 0.4 ? "看到这些小狗真可爱，我也很喜欢小动物呢！" : undefined
                },
                emotion: {
                    type: "positive",
                    intensity: 0.8
                }
            }),
            // 带前缀的JSON响应
            `好的，这是我的朋友圈回应：\n${JSON.stringify({
                action: {
                    like: true,
                    comment: "小狗狗好可爱！我最喜欢小动物了。"
                },
                emotion: {
                    type: "positive",
                    intensity: 0.9
                }
            })}`,
            // 带解释和后缀的JSON响应
            `我的角色会喜欢这个帖子。\n\n${JSON.stringify({
                action: {
                    like: true,
                    comment: "我也喜欢狗狗！它们总是那么忠诚可爱~"
                },
                emotion: {
                    type: "positive",
                    intensity: 0.7
                }
            })}\n\n希望这样的回应符合预期。`
        ];
        
        // 随机选择一种响应类型
        return mockResponseTypes[Math.floor(Math.random() * mockResponseTypes.length)];
    }

    // 添加 updateCircleMemory 方法
    private async updateCircleMemory(
        responderId: string,  
        options: CirclePostOptions,
        response: CircleResponse
    ): Promise<void> {
        try {
            const key = this.getStorageKey(responderId, '_circle_memory');
            const existingMemory = await this.loadJson<any[]>(key) || [];

            const newMemory = {
                role: "system",
                parts: [{
                    text: `${options.type}: ${options.content.text}\nResponse: ${JSON.stringify(response)}`
                }],
                timestamp: Date.now()
            };

            existingMemory.push(newMemory);

            // 保存更新后的记忆
            await this.saveJson(key, existingMemory);
            console.log(`【朋友圈】更新了角色 ${responderId} 的朋友圈记忆`);
        } catch (error) {
            console.error('【朋友圈】更新角色记忆失败:', error);
            throw new Error('保存角色社交互动记忆失败');
        }
    }

    async initCharacterCircle(characterId: string): Promise<boolean> {
        try {
            console.log(`【CircleManager】初始化角色朋友圈: ${characterId}, apiKey存在: ${!!this.apiKey}`);
            
            // Load character data first (we need the full Character object)
            const characterData = await this.loadJson<Character>(
                this.getStorageKey(characterId, '_character_data')
            );
            
            if (!characterData) {
                console.log(`【CircleManager】未找到角色 ${characterId} 的数据，尝试创建空的基础数据`);
                
                // Create minimal character data if it doesn't exist
                const minimalCharacter: Character = {
                    id: characterId,
                    name: "Unknown Character",
                    avatar: null,
                    backgroundImage: null,
                    description: "",
                    personality: "",
                    interests: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                
                // Save minimal character data
                await this.saveJson(
                    this.getStorageKey(characterId, '_character_data'),
                    minimalCharacter
                );
                
                // Initialize circle framework with minimal data
                return await this.circleInit(minimalCharacter);
            }
            
            // Initialize circle framework with loaded character data
            return await this.circleInit(characterData);
        } catch (error) {
            console.error(`【CircleManager】初始化角色朋友圈失败:`, error);
            return false;
        }
    }    

    // CircleManager specific methods
    async circleInit(character: Character): Promise<boolean> {
        try {
            console.log(`【朋友圈】开始初始化角色 ${character.name} 的朋友圈框架`);
            
            // 新增：从 characters.json 加载持久化角色数据，优先使用持久化数据
            let persistentCharacter: Character | undefined = undefined;
            try {
                const charactersStr = await FileSystem.readAsStringAsync(
                    FileSystem.documentDirectory + 'characters.json',
                    { encoding: FileSystem.EncodingType.UTF8 }
                ).catch(() => '[]');
                const allCharacters: Character[] = JSON.parse(charactersStr);
                persistentCharacter = allCharacters.find(c => c.id === character.id);
                if (persistentCharacter) {
                    console.log(`【朋友圈】已从文件系统加载到角色 ${persistentCharacter.name} 的持久化数据`);
                } else {
                    console.warn(`【朋友圈】文件系统中未找到角色 ${character.id}，将使用传入的character对象`);
                }
            } catch (fsError) {
                console.error('【朋友圈】加载 characters.json 失败:', fsError);
            }
            const characterToUse = persistentCharacter || character;

            // 从角色的 role_card 中获取正确的描述和性格
            const roleCard = await this.loadJson<any>(
                this.getStorageKey(characterToUse.id, '_role')
            );

            if (!roleCard) {
                console.error(`【朋友圈】未找到角色 ${characterToUse.name} 的角色卡`);
                throw new Error(`未找到角色 ${characterToUse.name} 的角色卡`);
            }

            console.log(`【朋友圈】成功加载角色 ${characterToUse.name} 的角色卡`);

            // 构建朋友圈场景的R框架，使用默认的场景提示词
            const circleRFramework: CircleRFramework = {
                base: {
                    charDescription: roleCard.description || '',
                    charPersonality: roleCard.personality || ''
                },
                circle: {
                    scenePrompt: defaultScenePrompt,
                    responseFormat: {
                        action: {
                            like: false,
                            comment: undefined
                        },
                        emotion: {
                            type: "neutral",
                            intensity: 0.5
                        }
                    }
                }
            };

            // 保存R框架到storage
            await this.saveJson(
                this.getStorageKey(characterToUse.id, '_circle_framework'),
                circleRFramework
            );
            
            // 保存角色数据以便后续处理
            await this.saveJson(
                this.getStorageKey(characterToUse.id, '_character_data'),
                characterToUse
            );
            
            console.log(`【朋友圈】成功为角色 ${characterToUse.name} 初始化朋友圈框架`);

            return true;
        } catch (error) {
            console.error('【朋友圈】初始化朋友圈失败:', error);
            return false;
        }
    }

    // 新增：获取角色与用户的聊天历史记录
    private async getCharacterUserChatHistory(characterId: string): Promise<string> {
        try {
            // 使用 StorageAdapter 获取最近的消息（限制为10条）
            const messages = await StorageAdapter.getRecentMessages(characterId, 10);
            
            if (!messages || messages.length === 0) {
                console.log(`【CircleManager】未找到角色 ${characterId} 的聊天历史记录`);
                return '';
            }
            
            console.log(`【CircleManager】获取到角色 ${characterId} 的最近 ${messages.length} 条聊天记录`);
            
            // 格式化消息为可读文本
            const formattedHistory = messages.map((msg, idx) => {
                const role = msg.role === 'user' ? '用户' : '角色';
                return `${idx + 1}. ${role}: ${msg.parts?.[0]?.text || ''}`;
            }).join('\n');
            
            return formattedHistory;
        } catch (error) {
            console.error(`【CircleManager】获取角色 ${characterId} 的聊天历史记录失败:`, error);
            return '';
        }
    }

    // 更新circlePost方法，支持apiKey参数和多种交互类型
    async circlePost(options: CirclePostOptions, apiKey?: string): Promise<CircleResponse> {
        try {
            console.log(`【朋友圈】处理互动，类型: ${options.type}，作者ID: ${options.content.authorId}，响应者ID: ${options.responderId}`);
            
            // 检查是否有图片需要处理
            const hasImages = options.content.images && options.content.images.length > 0;
            if (hasImages) {
                console.log(`【朋友圈】检测到帖子包含 ${options.content.images!.length} 张图片`);
            }
            
            // 1. 获取当前R框架 (使用responderId而非authorId)
            const framework = await this.loadJson<CircleRFramework>(
                this.getStorageKey(options.responderId, '_circle_framework')
            );

            if (!framework) {
                console.error(`【朋友圈】未找到角色框架，响应者ID: ${options.responderId}`);
                throw new Error('朋友圈框架未初始化');
            }

            // 2. 获取角色数据以进行关系处理
            const characterData = await this.loadJson<Character>(
                this.getStorageKey(options.responderId, '_character_data')
            );
            
            if (!characterData) {
                console.error(`【朋友圈】未找到角色数据，响应者ID: ${options.responderId}`);
                throw new Error('角色数据未找到');
            }
            
            // 3. 构建R框架条目
            const updatedFramework = await this.getScenePromptByType(framework, options);
            const rFramework: RFrameworkEntry[] = [
              // 角色描述
              PromptBuilderService.createRFrameworkEntry({
                name: "Character Description",
                content: framework.base.charDescription,
                identifier: "charDescription"
              }),
              // 角色性格
              PromptBuilderService.createRFrameworkEntry({
                name: "Character Personality",
                content: framework.base.charPersonality,
                identifier: "charPersonality"
              }),
              // 聊天历史容器
              PromptBuilderService.createChatHistoryContainer("circleHistory"),
              // 场景提示词
              PromptBuilderService.createRFrameworkEntry({
                name: "Scene Prompt",
                content: updatedFramework.circle.scenePrompt,
                identifier: "scenePrompt"
              })
            ];
            
            // 4. 构建D类条目
            const dEntries: DEntry[] = [];
            let relationshipReviewPrompt = '';
            
            // 消息盒子D类条目
            if (characterData.messageBox?.length) {
              const messagesText = this.formatMessageBoxForPrompt(characterData.messageBox);
              console.log(`【角色关系】为角色 ${characterData.name} 添加消息盒子D类条目，包含 ${characterData.messageBox.length} 条消息`);
              dEntries.push(PromptBuilderService.createDEntry({
                name: "Message Box",
                content: `【消息盒子】\n以下是你最近收到的互动消息:\n${messagesText}`,
                depth: 1,
                constant: true
              }));
            } else {
              console.log(`【角色关系】角色 ${characterData.name} 没有消息或消息盒子为空，跳过添加消息盒子D类条目`);
            }
            
            // 关系图谱D类条目
            if (characterData.relationshipMap?.relationships) {
              const relationshipsText = this.formatRelationshipMapForPrompt(characterData.relationshipMap);
              console.log(`【角色关系】为角色 ${characterData.name} 添加关系图谱D类条目，包含 ${Object.keys(characterData.relationshipMap.relationships).length} 个关系`);
              dEntries.push(PromptBuilderService.createDEntry({
                name: "Relationship Map",
                content: `【关系图谱数据】\n你与其他角色的当前关系:\n${relationshipsText}`,
                depth: 1,
                constant: true
              }));
            } else {
              console.log(`【角色关系】角色 ${characterData.name} 没有关系图谱或关系为空，跳过添加关系图谱D类条目`);
            }
            
            // 状态检视提示词D类条目
            if (characterData.relationshipEnabled && characterData.messageBox) {
              console.log(`【角色关系】检查角色 ${characterData.name} 是否需要关系状态检视，关系系统已启用: ${characterData.relationshipEnabled}`);
              const unreadMessages = characterData.messageBox.filter(msg => !msg.read);
              if (unreadMessages.length > 0) {
                console.log(`【角色关系】角色 ${characterData.name} 有 ${unreadMessages.length} 条未读消息，生成关系状态检视提示词`);
                relationshipReviewPrompt = await this.generateRelationshipStateReviewPrompt(characterData);
                if (relationshipReviewPrompt) {
                  console.log(`【角色关系】成功为角色 ${characterData.name} 添加关系状态检视D类条目，长度: ${relationshipReviewPrompt.length}`);
                  
                  // 修改：直接添加到文本中，而不是作为D类条目 - 这是临时解决方案
                  const reviewEntry = PromptBuilderService.createDEntry({
                    name: "Relationship State Review",
                    content: relationshipReviewPrompt,
                    depth: 1,
                    constant: true
                  });
                  dEntries.push(reviewEntry);
                  
                  // 添加诊断日志
                  console.log(`【角色关系】关系状态检视D类条目已创建，名称: ${reviewEntry.name}, 深度: ${reviewEntry.depth}, 内容长度: ${reviewEntry.content.length}`);
                }
              } else {
                console.log(`【角色关系】角色 ${characterData.name} 没有未读消息，跳过关系状态检视`);
              }
            }

            // 5. 处理图片和用户消息
            let pictureDescription = '';
            let imageInput = null;
            let allMessages = [];
            
            // 6. 构建基本用户消息
            let userMessage = `【内容】${options.content.text}\n【上下文】${options.content.context || ''}`;

            // 7. 使用PromptBuilderService构建消息数组
            const messages = PromptBuilderService.buildPrompt({
              rFramework,
              dEntries,
              userMessage
            });
            
            console.log(`【朋友圈】角色 ${characterData.name} 的请求构建完成，R框架条目数: ${rFramework.length}, D类条目数: ${dEntries.length}`);
            
            let response;
            
            // 8. 统一处理图片和请求 - 修改这部分以确保图片和请求在同一个API调用中
            if (hasImages) {
                try {
                    console.log(`【朋友圈】处理包含图片的帖子`);
                    
                    // 获取第一张图片
                    const imageUrl = options.content.images![0];
                    
                    // Convert image URL to base64 data with proper MIME type
                    let imageData: { data: string, mimeType: string };
                    try {
                        imageData = await this.fetchImageAsBase64(imageUrl);
                        console.log(`【朋友圈】成功转换图片为base64格式，MIME类型: ${imageData.mimeType}`);
                    } catch (imageError) {
                        console.error(`【朋友圈】图片转换失败:`, imageError);
                        throw new Error(`无法处理图片: ${imageError instanceof Error ? imageError.message : '未知错误'}`);
                    }
                    
                    // Format the base64 data with MIME type for API request
                    const formattedImageData = `data:${imageData.mimeType};base64,${imageData.data}`;
                    
                    // 准备图片输入（正确格式化的base64数据）
                    const imageInput = { url: formattedImageData };
                    
                    // 将消息转换为文本格式
                    let promptText = PromptBuilderService.messagesToText(messages);
                    
                    // 如果有关系状态检查提示词，添加到提示文本
                    if (relationshipReviewPrompt && promptText.indexOf("关系状态检查") === -1) {
                        promptText += "\n\n" + relationshipReviewPrompt;
                    }
                    
                    console.log(`【朋友圈】发送包含图片的请求，提示文本长度: ${promptText.length}`);
                    
                    // 检查 openai-compatible
                    const apiSettings = getApiSettings();
                    if (
                        apiSettings.apiProvider === 'openai-compatible' &&
                        this.openAIAdapter
                    ) {
                        // 只取第一张图片
                        const imageUrl = options.content.images![0];
                        let imageData: { data: string, mimeType: string };
                        try {
                            imageData = await this.fetchImageAsBase64(imageUrl);
                        } catch (imageError) {
                            throw new Error(`无法处理图片: ${imageError instanceof Error ? imageError.message : '未知错误'}`);
                        }
                        const formattedImageData = {
                            data: imageData.data,
                            mimeType: imageData.mimeType
                        };
                        // 使用OpenAIAdapter的多模态方法
                        const multimodalResult = await this.openAIAdapter.generateMultiModalContent(
                            promptText,
                            {
                                images: [{ data: formattedImageData.data, mimeType: formattedImageData.mimeType }]
                            }
                        );
                        response = multimodalResult.text || '';
                    } else if (this.useCloudService) {
                        try {
                            // Import CloudServiceProvider if not already imported
                            const { CloudServiceProvider } = require('@/services/cloud-service-provider');
                            
                            if (CloudServiceProvider.isEnabled()) {
                                console.log('【朋友圈】使用云服务处理图片请求');
                                
                                // 准备多模态消息格式
                                const multimodalMessages = [
                                    {
                                        role: "user",
                                        content: [
                                            {
                                                type: "text",
                                                text: promptText
                                            },
                                            {
                                                type: "image_url",
                                                image_url: {
                                                    url: formattedImageData // Use formatted base64 data
                                                }
                                            }
                                        ]
                                    }
                                ];
                                
                                // 使用云服务的多模态API
                                const cloudResponse = await CloudServiceProvider.generateMultiModalContent(
                                    multimodalMessages,
                                    {
                                        model: CloudServiceProvider.getMultiModalModel(),
                                        temperature: 0.7,
                                        max_tokens: 2048
                                    }
                                );
                                
                                if (cloudResponse.ok) {
                                    const result = await cloudResponse.json();
                                    if (result.choices && result.choices.length > 0) {
                                        // Extract text content from the response
                                        let responseContent = result.choices[0].message?.content;
                                        
                                        // Handle both string and array format responses
                                        if (typeof responseContent === 'string') {
                                            response = responseContent;
                                        } else if (Array.isArray(responseContent)) {
                                            // Extract all text parts
                                            response = responseContent
                                                .filter((part: any) => part.type === 'text')
                                                .map((part: any) => part.text)
                                                .join('\n');
                                        } else {
                                            response = "未能获取有效的AI回复";
                                        }
                                        
                                        console.log('【朋友圈】成功从云服务获取多模态响应');
                                    } else {
                                        console.error('【朋友圈】云服务响应格式无效');
                                        throw new Error('云服务返回了无效的响应格式');
                                    }
                                } else {
                                    console.error(`【朋友圈】云服务请求失败: ${cloudResponse.status} ${cloudResponse.statusText}`);
                                    throw new Error('云服务请求失败');
                                }
                            } else {
                                // 云服务未启用或不可用，尝试本地适配器
                                if (this.geminiAdapter) {
                                    // 使用带图像的multimodal请求
                                    const multimodalResponse = await this.geminiAdapter.generateMultiModalContent(
                                        promptText,
                                        {
                                            images: [imageInput]
                                        }
                                    );
                                    
                                    response = multimodalResponse.text || '';
                                } else {
                                    throw new Error('没有可用的图片处理适配器');
                                }
                            }
                        } catch (cloudError) {
                            console.error('【朋友圈】云服务处理图片请求失败:', cloudError);
                            
                            // 如果云服务失败，尝试使用本地适配器
                            if (this.geminiAdapter) {
                                console.log('【朋友圈】尝试使用本地Gemini适配器处理图片请求');
                                const multimodalResponse = await this.geminiAdapter.generateMultiModalContent(
                                    promptText,
                                    {
                                        images: [imageInput]
                                    }
                                );
                                
                                response = multimodalResponse.text || '';
                            } else {
                                throw new Error('没有可用的图片处理适配器');
                            }
                        }
                    } else {
                        // 云服务未启用，直接使用本地适配器
                        if (this.geminiAdapter) {
                            // 使用带图像的multimodal请求
                            const multimodalResponse = await this.geminiAdapter.generateMultiModalContent(
                                promptText,
                                {
                                    images: [imageInput]
                                }
                            );
                            
                            response = multimodalResponse.text || '';
                        } else {
                            throw new Error('没有可用的图片处理适配器');
                        }
                    }
                    
                    // 日志
                    if (response) {
                        console.log(`【朋友圈】成功接收包含图片的响应，响应长度: ${response.length}`);
                        console.log(`【朋友圈】响应前100个字符: ${response.substring(0, 100)}...`);
                    } else {
                        console.log(`【朋友圈】响应为空，可能发生问题`);
                    }
                } catch (error) {
                    console.error(`【朋友圈】处理图片请求时出错:`, error);
                    return {
                        success: false,
                        error: `图片分析失败: ${error instanceof Error ? error.message : '未知错误'}`
                    };
                }
            } else {
                // 处理不包含图片的请求
                // 使用现有流程
                console.log(`【朋友圈】处理不含图片的标准请求`);
                
                // 8. 转换为文本格式并发送请求
                const prompt = PromptBuilderService.messagesToText(messages);

                // 如果日志中没有检测到状态检视提示词，但我们确实创建了它，那么手动添加它
                if (prompt.indexOf("关系状态检查") === -1 && relationshipReviewPrompt) {
                    console.warn(`【角色关系】警告：关系状态检视提示词没有被包含在最终请求中，手动添加`);
                    const modifiedPrompt = prompt + "\n\n" + relationshipReviewPrompt;
                    
                    // 新增日志：打印完整的请求体内容
                    console.log(`【朋友圈】角色 ${characterData.name} 的完整请求体(手动添加了关系状态检视):\n${'-'.repeat(80)}\n${modifiedPrompt}\n${'-'.repeat(80)}`);
                    console.log(`【朋友圈】角色 ${characterData.name} 的最终提示词长度: ${modifiedPrompt.length}`);
                    
                    // 检查 openai-compatible
                    const apiSettings = getApiSettings();
                    if (
                        apiSettings.apiProvider === 'openai-compatible' &&
                        this.openAIAdapter
                    ) {
                        response = await this.openAIAdapter.chatCompletion([
                            { role: "user", content: modifiedPrompt }
                        ]).then(res => res.choices?.[0]?.message?.content || '');
                    } else {
                        // 使用修改后的提示词
                        response = await this.getChatResponse(modifiedPrompt);
                    }
                } else {
                    // 原来的流程
                    // 新增日志：打印完整的请求体内容
                    console.log(`【朋友圈】角色 ${characterData.name} 的完整请求体:\n${'-'.repeat(80)}\n${prompt}\n${'-'.repeat(80)}`);
                    console.log(`【朋友圈】角色 ${characterData.name} 的最终提示词长度: ${prompt.length}`);
                    
                    // 检查 openai-compatible
                    const apiSettings = getApiSettings();
                    if (
                        apiSettings.apiProvider === 'openai-compatible' &&
                        this.openAIAdapter
                    ) {
                        response = await this.openAIAdapter.chatCompletion([
                            { role: "user", content: prompt }
                        ]).then(res => res.choices?.[0]?.message?.content || '');
                    } else {
                        response = await this.getChatResponse(prompt);
                    }
                }
            }
            
            // 9. 解析响应
            const circleResponse = this.parseCircleResponse(response);
            
            // 10. 如果包含关系状态检查，则解析关系更新
            if (relationshipReviewPrompt && characterData && circleResponse.success) {
                console.log(`【角色关系】角色 ${characterData.name} 检测到关系状态检视提示词，开始解析关系更新`);
                const relationshipUpdates = this.parseRelationshipReviewResponse(response);
                
                // 存储关系更新以便稍后应用
                if (relationshipUpdates.length > 0) {
                    console.log(`【角色关系】角色 ${characterData.name} 解析出 ${relationshipUpdates.length} 条关系更新，将添加到响应中`);
                    circleResponse.relationshipUpdates = relationshipUpdates;
                } else {
                    console.log(`【角色关系】角色 ${characterData.name} 未解析到关系更新或解析失败`);
                }
            }

            // 11. 更新记忆
            await this.updateCircleMemory(
                options.responderId,
                options,
                circleResponse
            );

            // 如果是用户互动，保存到聊天历史记录
            if ((options.content.authorId === 'user-1' || options.type === 'replyToComment') && 
                circleResponse.success && options.responderId && 
                (circleResponse.action?.comment || circleResponse.response)) {
                
                const userMessage = options.content.text;
                const aiResponse = circleResponse.action?.comment || circleResponse.response || '';
                
                if (userMessage && aiResponse) {
                    try {
                        await StorageAdapter.storeMessageExchange(
                            options.responderId,
                            userMessage,
                            aiResponse
                        );
                        console.log(`【朋友圈】已保存用户-角色对话到聊天历史记录`);
                    } catch (storageError) {
                        console.error(`【朋友圈】保存对话到聊天历史记录失败:`, storageError);
                    }
                }
            }

            console.log(`【朋友圈】成功处理互动，结果:`, circleResponse);
            return circleResponse;
        } catch (error) {
            console.error('【朋友圈】处理朋友圈互动失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    // 新增：根据互动类型获取适当的场景提示词
    private async getScenePromptByType(framework: CircleRFramework, options: CirclePostOptions): Promise<CircleRFramework> {
        const updatedFramework = { ...framework };
        
        // 准备要显示的内容
        const contentText = options.content.text.length > 100 ? 
            `${options.content.text.substring(0, 100)}...` : 
            options.content.text;
            
        // 检查是否有图片
        const hasImages: boolean = !!(options.content.images && options.content.images.length > 0);
            
        // 检查是否为自己发布的帖子（发帖者和响应者是同一角色）
        const isOwnPost = options.content.authorId === options.responderId;
        
        // 检查是否是用户对角色帖子的评论（用户ID为'user-1'）
        const isUserComment = options.content.authorId === 'user-1';
        
        // 获取用户自定义称呼 (针对用户回复)
        let userIdentification = options.content.authorName || '某人';
        // 优先 customUserName
        if (isUserComment && options.responderCharacter?.customUserName) {
            userIdentification = options.responderCharacter.customUserName;
        }
        
        // 获取角色名称 - 添加这一段以确保角色名称传递给提示词
        const charName = options.responderCharacter?.name || '';
        
        // 获取聊天历史记录
        let chatHistory = '';
        if (isUserComment && options.responderId) {
            chatHistory = await this.getCharacterUserChatHistory(options.responderId);
            console.log(`【CircleManager】为用户-角色互动添加聊天历史记录，长度: ${chatHistory.length}`);
        }
        
        // 新增：收集原帖全部评论内容（仅 continuedConversation 类型需要）
        let allCommentsText = '';
        if (options.type === 'continuedConversation' && options.content.postComments && Array.isArray(options.content.postComments)) {
            allCommentsText = options.content.postComments.map((c: any, idx: number) => {
                const replyPrefix = c.replyTo ? `回复${c.replyTo.userName}: ` : '';
                return `${idx + 1}. ${c.userName}: ${replyPrefix}${c.content}`;
            }).join('\n');
        }

        // 准备场景参数
        const params: ScenePromptParams = {
            contentText,
            authorName: options.content.authorName,
            context: options.content.context,
            hasImages,
            charDescription: framework.base.charDescription,
            charName, // 添加角色名称
            userIdentification,
            conversationHistory: chatHistory || options.content.conversationHistory,
            characterJsonData: options.content.characterJsonData,
            allCommentsText // 新增：全部评论内容
        };

        // 根据互动类型选择合适的提示词模板
        let scenePrompt: string;
        
        switch (options.type) {
            case 'continuedConversation': // Add support for continuous conversation
                scenePrompt = CirclePrompts.continuedConversation(params);
                break;
                
            case 'forwardedPost':
                scenePrompt = CirclePrompts.forwardedPost(params);
                break;
                
            case 'newPost':
                scenePrompt = CirclePrompts.createNewPost(params);
                break;
                
                case 'replyToPost':
                // 修正逻辑：用户发朋友圈时（authorId === 'user-1'），始终用 replyToPost/WithImage
                if (hasImages) {
                    scenePrompt = CirclePrompts.replyToPostWithImage(params);
                } else if (isOwnPost) {
                    scenePrompt = CirclePrompts.selfPost(params);
                } else if (isUserComment && options.content.authorId !== 'user-1') {
                    // 只有当是用户评论角色帖子时才用 replyToComment
                    scenePrompt = CirclePrompts.replyToComment(params);
                } else {
                    // 用户发朋友圈（authorId === 'user-1'）或普通角色发帖
                    scenePrompt = CirclePrompts.replyToPost(params);
                }
                    break;
                
            case 'replyToComment':
                if (hasImages) {
                    scenePrompt = CirclePrompts.replyToCommentWithImage(params);
                } else {
                    scenePrompt = CirclePrompts.replyToComment(params);
                }
                break;
                
            default:
                scenePrompt = defaultScenePrompt;
        }

        // 更新场景提示词
        updatedFramework.circle.scenePrompt = scenePrompt;
        return updatedFramework;
    }

    /**
     * 改进的响应解析方法，确保 thoughts 字段被正确保存
     */
    private parseCircleResponse(response: string): CircleResponse {
        try {
            console.log('【朋友圈】开始解析响应');
            
            const extractedJson = this.extractJson(response);
            if (!extractedJson) {
                throw new Error('无法从响应中提取JSON');
            }

            console.log('【朋友圈】成功提取JSON:', extractedJson);
            
            // 存储内心想法，如果存在
            const thoughts = extractedJson.thoughts || '';
            if (thoughts) {
                console.log(`【朋友圈思考】角色的想法: "${
                    thoughts.substring(0, 100) + (thoughts.length > 100 ? '...' : '')
                }"`);
            }
            
            // Handle different response formats based on what fields exist in the JSON
            if (extractedJson.post) {
                // 处理新帖子创建的返回格式
                return {
                    success: true,
                    post: extractedJson.post,
                    thoughts: thoughts, // 保存思考内容
                    action: {
                        like: false, // No like for own post
                        comment: extractedJson.post // Use post content as comment
                    },
                    emotion: extractedJson.emotion // Preserve emotion data
                };
            } else if (extractedJson.thoughts && extractedJson.response) {
                // 处理selfPost格式 - 包含thoughts和response
                return {
                    success: true,
                    thoughts: extractedJson.thoughts,
                    response: extractedJson.response,
                    action: {
                        like: false, // 不能给自己点赞
                        comment: extractedJson.response // 使用response作为评论内容
                    },
                    emotion: extractedJson.emotion
                };
            } else if (extractedJson.action) {
                // 处理标准的互动响应格式
                return {
                    success: true,
                    thoughts: thoughts, // 保存思考内容
                    action: {
                        like: Boolean(extractedJson.action.like),
                        comment: extractedJson.action.comment
                    },
                    emotion: extractedJson.emotion
                };
            } else if (extractedJson.reflection) {
                // 处理反思格式
                return {
                    success: true,
                    thoughts: thoughts, // 保存思考内容
                    action: {
                        like: false, // Can't like own post
                        comment: extractedJson.reflection // Use reflection as comment
                    },
                    emotion: extractedJson.emotion
                };
            }
            
            // If we can't determine the format but have something, try to adapt it
            if (typeof extractedJson === 'object' && extractedJson !== null) {
                // Look for any useful fields we might use
                const possibleComment = 
                    extractedJson.comment || 
                    extractedJson.content || 
                    extractedJson.message || 
                    extractedJson.text;
                    
                return {
                    success: true,
                    thoughts: thoughts, // 保存思考内容
                    action: {
                        like: Boolean(extractedJson.like || false),
                        comment: typeof possibleComment === 'string' ? possibleComment : undefined
                    }
                };
            }

            throw new Error('无法识别的响应格式');
        } catch (error) {
            console.error('【朋友圈】解析响应失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '解析AI回复失败'
            };
        }
    }

    /**
     * 从文本中提取JSON对象
     */
    private extractJson(text: string): any {
        try {
            // 第1步：预处理文本
            let cleanText = this.cleanResponseText(text);
            
            // 第2步：直接尝试解析清理后的文本
            try {
                const directParsed = JSON.parse(cleanText);
                
                // Modified: Accept different valid structures instead of just action
                if (this.isValidJsonStructure(directParsed)) {
                    return directParsed;
                }
            } catch (e) {
                // 直接解析失败，继续尝试其他方法
            }
            
            // 第3步：使用正则提取JSON对象
            const jsonPattern = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
            const matches = cleanText.match(jsonPattern);
            
            if (!matches || matches.length === 0) {
                console.error('【朋友圈】未找到JSON格式内容');
                return null;
            }
            
            // 第4步：尝试解析每个匹配的JSON对象
            for (const match of matches) {
                try {
                    const parsed = JSON.parse(match);
                    if (this.isValidJsonStructure(parsed)) {
                        return parsed;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Fallback: try to return any valid JSON, even if it doesn't match our expected structure
            for (const match of matches) {
                try {
                    return JSON.parse(match);
                } catch (e) {
                    continue;
                }
            }
            
            console.error('【朋友圈】所有提取的JSON都未通过验证');
            return null;
            
        } catch (error) {
            console.error('【朋友圈】提取JSON时出错:', error);
            return null;
        }
    }

    /**
     * 验证JSON结构是否符合预期的任一格式
     */
    private isValidJsonStructure(json: any): boolean {
        // 1. 必须是对象
        if (!json || typeof json !== 'object') {
            return false;
        }

        // 2. 检查是否是"post"格式回复（用于创建新帖子）
        if (typeof json.post === 'string' && json.post.trim().length > 0) {
            return true;
        }

        // 3. 检查是否是"thoughts/response"格式（用于selfPost回复）
        if (typeof json.thoughts === 'string' && 
            typeof json.response === 'string' &&
            json.thoughts.trim().length > 0 &&
            json.response.trim().length > 0) {
            return true;
        }

        // 4. 检查是否是"reflection"格式（用于自我帖子反思）
        if (typeof json.reflection === 'string' && json.reflection.trim().length > 0) {
            return true;
        }

        // 5. 检查是否是标准的"action"格式回复
        if (json.action && typeof json.action === 'object') {
            // action必须包含like字段
            if (typeof json.action.like !== 'boolean') {
                return false;
            }

            // 如果有comment字段，必须是字符串
            if ('comment' in json.action && typeof json.action.comment !== 'string') {
                return false;
            }

            return true;
        }

        // 6. 检查是否有其他可用字段（宽松检验，用作最后的尝试）
        const hasUsableField = 
            (typeof json.comment === 'string') || 
            (typeof json.content === 'string') ||
            (typeof json.message === 'string') ||
            (typeof json.text === 'string');
        
        if (hasUsableField) {
            return true;
        }

        return false;
    }

    /**
     * 清理响应文本，移除无关内容
     */
    private cleanResponseText(text: string): string {
        // 1. 移除所有```json和```标记
        text = text.replace(/```json\n?|\n?```/g, '');
        
        // 2. 移除常见的AI礼貌用语前缀
        const prefixesToRemove = [
            /^好的，(这是)?我的朋友圈回应：\s*/i,
            /^好的，(我)?(明白|理解)了。\s*/i,
            /^请给我看朋友圈(的)?动态内容，.*?(?=\{)/i,
            /^作为[^{]*?(?=\{)/i,
            /^我将(会)?根据[^{]*?(?=\{)/i,
            /^以下是[^{]*?(?=\{)/i,
            /^这是我为.*创作的朋友圈[^{]*?(?=\{)/i
        ];
        
        for (const prefix of prefixesToRemove) {
            text = text.replace(prefix, '');
        }
        
        // 3. 移除末尾的注释和说明
        const suffixesToRemove = [
            /\n*希望[^}]*$/,
            /\n*这样的回[复应][^}]*$/,
            /\n*[请让]?我知道[^}]*$/
        ];
        
        for (const suffix of prefixesToRemove) {
            text = text.replace(suffix, '');
        }
        
        // 4. 移除多余的空白字符
        text = text.trim().replace(/\s+/g, ' ');
        
        return text;
    }

    // 新增：生成关系状态检查提示词的方法
    async generateRelationshipStateReviewPrompt(character: Character): Promise<string> {
        if (!character.relationshipMap || !character.messageBox) {
            return '';
        }

        // 仅获取未读消息
        const unreadMessages = character.messageBox.filter((msg: any) => !msg.read);
        if (unreadMessages.length === 0) {
            return '';
        }

        // 创建关系检查提示词
        const prompt = `
【关系状态检查】
以下是你最近收到的互动消息，请分析这些消息，并针对每个互动者更新你对他们的印象和关系强度。

消息列表:
${unreadMessages.map((msg: any, idx: number) => 
  `${idx + 1}. ${msg.senderName}${msg.type === 'like' ? '点赞了你的内容' : 
    msg.type === 'comment' ? '评论了你的内容' : 
    msg.type === 'reply' ? '回复了你的评论' : '给你发送了消息'}: "${msg.content}"`
).join('\n')}

你当前的关系图谱:
${Object.entries(character.relationshipMap.relationships).map(([id, rel]: [string, any]) => 
  `- ${id}: 关系类型=${rel.type}, 关系强度=${rel.strength}`
).join('\n')}

请分析以上消息，根据内容的情感色彩和互动频率，更新你与每个互动者的关系强度(-100到100，负数表示负面关系)。
如果某人的关系强度超过特定阈值，也请考虑更新关系类型(如从陌生人变为熟人或朋友)。

请以以下格式回复:
关系更新:
[互动者ID]-[关系强度变化]-[可选:新关系类型]
[互动者ID]-[关系强度变化]-[可选:新关系类型]
...

例如:
关系更新:
user123-+5
user456--3-rival
user789-+10-friend
`;

        return prompt;
    }

    // 新增：处理关系检查结果的方法
    parseRelationshipReviewResponse(response: string): { 
        targetId: string, strengthDelta: number, newType?: string 
    }[] {
        try {
            const results: { targetId: string, strengthDelta: number, newType?: string }[] = [];
            
            // 提取关系更新部分
            const updateSection = response.match(/关系更新:([\s\S]*?)(?:\n\n|$)/);
            if (!updateSection || !updateSection[1]) {
                console.log('【角色关系】未找到关系更新部分');
                
                // 尝试查看响应是否包含了潜在的关系更新信息
                if (response.includes('+') || response.includes('-')) {
                    console.log('【角色关系】响应中可能包含关系更新信息，但格式不符合预期');
                    console.log('【角色关系】响应片段:', response.substring(0, 200) + '...');
                }
                
                return results;
            }
            
            console.log(`【角色关系】找到关系更新部分: "${updateSection[1].trim().substring(0, 100)}${updateSection[1].trim().length > 100 ? '...' : ''}"`);
            
            // 解析每一行
            const lines = updateSection[1].trim().split('\n');
            console.log(`【角色关系】发现 ${lines.length} 行待解析内容`);
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                // 尝试匹配模式：id-delta-type
                const match = line.match(/([^-]+)-([+-]\d+)(?:-([a-z_]+))?/);
                if (match) {
                    const [, targetId, deltaStr, newType] = match;
                    const strengthDelta = parseInt(deltaStr);
                    
                    if (!isNaN(strengthDelta)) {
                        results.push({
                            targetId: targetId.trim(),
                            strengthDelta,
                            newType: newType ? newType.trim() : undefined
                        });
                        console.log(`【角色关系】解析关系更新: 目标=${targetId.trim()}, 强度变化=${strengthDelta}${newType ? ', 新类型=' + newType.trim() : ''}`);
                    } else {
                        console.log(`【角色关系】无法解析强度变化值: ${deltaStr}`);
                    }
                } else {
                    console.log(`【角色关系】无法匹配行内容: "${line.trim()}"`);
                }
            }
            
            console.log(`【角色关系】成功解析 ${results.length}/${lines.length} 条关系更新`);
            return results;
        } catch (error) {
            console.error('Error parsing relationship review response:', error);
            return [];
        }
    }


    // 格式化消息盒子内容
    private formatMessageBoxForPrompt(messageBox: MessageBoxItem[]): string {
        return messageBox
          .slice(0, 15) // 限制显示最近15条消息
          .sort((a, b) => b.timestamp - a.timestamp) // 从新到旧排序
          .map(msg => {
            return `- 来自: ${msg.senderName} (${msg.type})
    内容: ${msg.content}
    时间: ${new Date(msg.timestamp).toLocaleString()}
    ${msg.contextContent ? `上下文: ${msg.contextContent}` : ''}
    ---`;
          }).join('\n');
    }

    // 格式化关系图谱内容
    private formatRelationshipMapForPrompt(relationshipMap: RelationshipMapData): string {
        return Object.entries(relationshipMap.relationships)
          .map(([id, rel]: [string, any]) => {
            return `- 角色ID: ${id}
    关系类型: ${rel.type}
    关系强度: ${rel.strength}
    描述: ${rel.description}
    最后更新: ${new Date(rel.lastUpdated).toLocaleString()}
    互动次数: ${rel.interactions || 0}`;
          }).join('\n\n');
    }

    // Changed from postInteraction to circlePost to match existing method
    async processInteraction(options: CirclePostOptions): Promise<CircleResponse> {
        // Check if we have images in the options
        const hasImages = options.content.images && options.content.images.length > 0;
        if (hasImages && options.content.images) {
          console.log(`【CircleManager】处理带图片的朋友圈互动，图片数量: ${options.content.images.length}`);
        }
        
        return this.circlePost(options, this.apiKey);
    }

    // Add a utility function to fetch and convert image to base64
    private async fetchImageAsBase64(imageUrl: string): Promise<{data: string, mimeType: string}> {
        try {
            console.log(`【CircleManager】正在从URL获取图片: ${imageUrl}`);
            
            // 新增：如果是data:URL，直接解析
            if (imageUrl.startsWith('data:')) {
                const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    // 新增：判断是否需要压缩
                    const mimeType = matches[1];
                    let base64Data = matches[2];
                    // 如果图片过大，进行压缩
                    if (base64Data.length > 400000) { // 约300KB
                        try {
                            // 先将base64转为临时文件
                            const tempFileUri = FileSystem.cacheDirectory + `temp_image_${Date.now()}.jpg`;
                            await FileSystem.writeAsStringAsync(tempFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
                            // 使用expo-image-manipulator压缩
                            const manipResult = await ImageManipulator.manipulateAsync(
                                tempFileUri,
                                [{ resize: { width: 1024 } }],
                                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                            );
                            base64Data = manipResult.base64 || base64Data;
                            console.log(`【CircleManager】已压缩base64图片，压缩后大小: ${base64Data.length} 字节`);
                            return {
                                mimeType: 'image/jpeg',
                                data: base64Data
                            };
                        } catch (compressErr) {
                            console.warn('【CircleManager】base64图片压缩失败，使用原始数据:', compressErr);
                        }
                    }
                    return {
                        mimeType,
                        data: base64Data
                    };
                } else {
                    throw new Error('无效的data:URL格式');
                }
            }
            
            // If it's a remote URL or local file path
            const response = await fetch(imageUrl);
            
            if (!response.ok) {
                throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
            }
            
            // Get content type
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            
            // Get image data and convert to base64
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            
            // Convert to base64 string
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            let base64Data = btoa(binaryString);

            // 新增：如果图片过大，进行压缩
            if (base64Data.length > 400000) { // 约300KB
                try {
                    // 先将base64写入临时文件
                    const tempFileUri = FileSystem.cacheDirectory + `temp_image_${Date.now()}.jpg`;
                    await FileSystem.writeAsStringAsync(tempFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
                    // 使用expo-image-manipulator压缩
                    const manipResult = await ImageManipulator.manipulateAsync(
                        tempFileUri,
                        [{ resize: { width: 1024 } }],
                        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                    );
                    base64Data = manipResult.base64 || base64Data;
                    console.log(`【CircleManager】已压缩图片，压缩后大小: ${base64Data.length} 字节`);
                    return {
                        data: base64Data,
                        mimeType: 'image/jpeg'
                    };
                } catch (compressErr) {
                    console.warn('【CircleManager】图片压缩失败，使用原始数据:', compressErr);
                }
            }

            console.log(`【CircleManager】成功获取并编码图片，MIME类型: ${contentType}, 大小: ${base64Data.length} 字节`);
            
            return {
                data: base64Data,
                mimeType: contentType
            };
        } catch (error) {
            console.error(`【CircleManager】从URL获取图片失败:`, error);
            throw error;
        }
    }
}