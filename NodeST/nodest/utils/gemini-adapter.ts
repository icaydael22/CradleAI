import { ChatMessage } from '@/shared/types';
import { mcpAdapter } from './mcp-adapter';
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import { addCloudServiceStatusListener } from '@/utils/cloud-service-tracker';
import { getCloudServiceStatus, getApiSettings } from '@/utils/settings-helper';
import { getCharacterTablesData } from '@/src/memory/plugins/table-memory/api';

// Define interfaces for image handling
interface ContentPart {
    text?: string;
    inlineData?: {
        data: string;
        mimeType: string;
    };
    fileData?: {
        mimeType: string;
        fileUri: string;
    };
}

interface GeneratedContent {
    text?: string;
    images?: string[]; // Base64 encoded images
}

interface ImageInput {
    // Base64 encoded image data
    data?: string;
    // MIME type of the image (e.g., "image/jpeg", "image/png")
    mimeType?: string;
    // URL to fetch the image from
    url?: string;
}

// Enhanced interface for options including model configuration
interface GeminiAdapterOptions {
    useModelLoadBalancing?: boolean;
    useKeyRotation?: boolean;
    additionalKeys?: string[];
    primaryModel?: string;
    backupModel?: string;
    retryDelay?: number; // Delay in ms before trying backup model
}

export class GeminiAdapter {
    private readonly BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    private apiKeys: string[] = []; // Array to store multiple API keys
    private currentKeyIndex: number = 0; // Index of the currently used API key
    
  // Model configuration: 始终从 settings-helper 读取
    private get primaryModel(): string {
        const apiSettings = getApiSettings();
        return apiSettings.geminiPrimaryModel || "gemini-2.0-flash-exp";
    }
    private get backupModel(): string {
        const apiSettings = getApiSettings();
        return apiSettings.geminiBackupModel || "gemini-2.0-flash-exp";
    }
    private get useModelLoadBalancing(): boolean {
        const apiSettings = getApiSettings();
        return !!apiSettings.useGeminiModelLoadBalancing;
    }
    private get useKeyRotation(): boolean {
        const apiSettings = getApiSettings();
        return !!apiSettings.useGeminiKeyRotation;
    }
    private get retryDelay(): number {
        const apiSettings = getApiSettings();
        return typeof apiSettings.retryDelay === 'number' ? apiSettings.retryDelay : 5000;
    }
    

    
    private readonly headers = {
        "Content-Type": "application/json"
    };
    private useCloudService: boolean = false;
    private cloudStatusUnsubscribe: (() => void) | null = null;

    private conversationHistory: ChatMessage[] = [];

    constructor(apiKey: string, options?: GeminiAdapterOptions) {
        // Initialize cloud service status first to see if we can accept empty API key
        this.updateCloudServiceStatus();
        
        // Initialize with primary key and any additional keys
        
        if (apiKey) {
            // Add the primary key
            this.apiKeys = [apiKey];
            
            // Add additional keys if provided and they are non-empty
            if (options?.additionalKeys && Array.isArray(options.additionalKeys)) {
                this.apiKeys = [...this.apiKeys, ...options.additionalKeys.filter(key => key && key.trim() !== '')];
            }
        } else {
            // Empty API key but cloud service is enabled
            this.apiKeys = [];
            console.log(`[Gemini适配器] 未配置API密钥，将使用云服务`);
        }
        
      
        // console.log(`[Gemini适配器] 初始化完成，配置了 ${this.apiKeys.length} 个API密钥`);
        // console.log(`[Gemini适配器] API密钥轮换: ${this.useKeyRotation ? '已启用' : '未启用'}`);
        // console.log(`[Gemini适配器] 模型负载均衡: ${this.useModelLoadBalancing ? '已启用' : '未启用'}`);
        // console.log(`[Gemini适配器] 主模型: ${this.primaryModel}, 备用模型: ${this.backupModel}`);
        // console.log(`[Gemini适配器] 备用模型重试延迟: ${this.retryDelay}ms`);
        // console.log(`[Gemini适配器] 云服务状态: ${this.useCloudService ? '已启用' : '未启用'}`);
        
        // Subscribe to tracker updates
        this.cloudStatusUnsubscribe = addCloudServiceStatusListener((enabled) => {
            console.log(`[Gemini适配器] 云服务状态更新: ${enabled ? '启用' : '禁用'}`);
            this.useCloudService = enabled;
        });
    }
    
    
    
    /**
     * Update API keys and load balancing settings - useful when settings change
     */
    public updateSettings(options: GeminiAdapterOptions): void {
        // Update additional keys if provided
        if (options.additionalKeys && Array.isArray(options.additionalKeys)) {
            const validAdditionalKeys = options.additionalKeys.filter(key => key && key.trim() !== '');
            
            if (this.apiKeys.length > 0) {
                // Always keep the primary key (first in array) and add valid additional keys
                const primaryKey = this.apiKeys[0];
                this.apiKeys = [primaryKey, ...validAdditionalKeys];
            } else if (validAdditionalKeys.length > 0) {
                // No primary key but have valid additional keys
                this.apiKeys = [...validAdditionalKeys];
            }
            this.currentKeyIndex = 0; // Reset to first key
        }
        
        
        console.log(`[Gemini适配器] 设置已更新，共 ${this.apiKeys.length} 个密钥`);
        console.log(`[Gemini适配器] API密钥轮换: ${this.useKeyRotation ? '已启用' : '未启用'}`);
        console.log(`[Gemini适配器] 模型负载均衡: ${this.useModelLoadBalancing ? '已启用' : '未启用'}`);
        console.log(`[Gemini适配器] 主模型: ${this.primaryModel}, 备用模型: ${this.backupModel}`);
        console.log(`[Gemini适配器] 备用模型重试延迟: ${this.retryDelay}ms`);
    }
    
    /**
     * Gets the current active API key
     * Returns null if no API keys are configured
     */
    private get apiKey(): string | null {
        if (this.apiKeys.length === 0) {
            return null;
        }
        return this.apiKeys[this.currentKeyIndex];
    }
    
    /**
     * Rotates to the next available API key
     * @returns true if successfully rotated, false if no more keys available
     */
    private rotateApiKey(): boolean {
        // If we only have one key or key rotation is disabled, no point in rotating
        if (this.apiKeys.length <= 1 || !this.useKeyRotation) {
            return false;
        }
        
        const previousKeyIndex = this.currentKeyIndex;
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        
        // If we've gone through all keys and are back at the starting point, return false
        if (this.currentKeyIndex === previousKeyIndex) {
            console.log(`[Gemini适配器] 已尝试所有可用API密钥`);
            return false;
        }
        
        console.log(`[Gemini适配器] 已切换到下一个API密钥，当前位置: ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);
        return true;
    }
    
    /**
     * Update API keys - useful when settings change
     * Modified to handle empty primary key
     */
    public updateApiKeys(primaryKey: string, additionalKeys: string[] = []) {
        if (primaryKey && primaryKey.trim() !== '') {
            // If primary key is valid, use it plus any valid additional keys
            this.apiKeys = [primaryKey, ...additionalKeys.filter(key => key && key.trim() !== '')];
        } else if (additionalKeys && additionalKeys.some(key => key && key.trim() !== '')) {
            // No primary key but we have valid additional keys
            this.apiKeys = [...additionalKeys.filter(key => key && key.trim() !== '')];
        } else {
            // No valid keys at all
            this.apiKeys = [];
            console.log(`[Gemini适配器] 未配置任何有效的API密钥，将依赖云服务`);
        }
        
        this.currentKeyIndex = 0; // Reset to first key
        console.log(`[Gemini适配器] API密钥已更新，共 ${this.apiKeys.length} 个密钥`);
    }
    
    /**
     * Check if any valid API keys are configured
     */
    public isApiKeyConfigured(): boolean {
        return this.apiKeys.length > 0;
    }
    
    /**
     * Set model load balancing configuration
     */
    public setModelLoadBalancing(enabled: boolean) {
        console.log(`[Gemini适配器] 模型负载均衡已${enabled ? '启用' : '禁用'}`);
    }
    
    /**
     * Update model configuration
     */
    public setModelConfiguration(primaryModel: string, backupModel: string) {
        console.log(`[Gemini适配器] 模型配置已更新 - 主模型: ${this.primaryModel}, 备用模型: ${this.backupModel}`);
    }
    

    
    /**
     * Determine which model to use based on the request type and load balancing settings
     * @param isImageTask Whether the request involves image processing
     * @returns The model ID to use
     */
    private getModelForRequest(isImageTask: boolean = false): string {
        // Always use backup model for image tasks since only it supports multimodal
        if (isImageTask) {
            return this.backupModel;
        }
        
        // If load balancing is disabled, just use the backup model (as was default before)
        if (!this.useModelLoadBalancing) {
            return this.backupModel;
        }
        
        // Otherwise use the primary model
        return this.primaryModel;
    }

    /**
     * Check and update cloud service status from the tracker.
     */
    private updateCloudServiceStatus(): void {
        this.useCloudService = getCloudServiceStatus();
        // console.log(`[Gemini适配器] 初始化云服务状态: ${this.useCloudService ? '启用' : '禁用'}`);
    }
    
    /**
     * Clean up resources when adapter is no longer needed
     */
    public dispose(): void {
        // Unsubscribe from cloud service status changes
        if (this.cloudStatusUnsubscribe) {
            this.cloudStatusUnsubscribe();
            this.cloudStatusUnsubscribe = null;
        }
    }

    async generateContent(contents: ChatMessage[], characterId?: string): Promise<string> {

        // Always check cloud service status before making requests
        this.updateCloudServiceStatus();
        
        // Check if we have API keys or need to use cloud service
        const apiKeyAvailable = this.isApiKeyConfigured();
        const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
        
        // If no API key and cloud service is not available, throw error
        if (!apiKeyAvailable && !cloudServiceAvailable) {
            throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
        }
        
        // If no API key but cloud service is available, use cloud service
        if (!apiKeyAvailable && cloudServiceAvailable) {
            console.log(`[Gemini适配器] 未配置API密钥，自动切换到云服务`);
            return await this.executeGenerateContentWithCloudService(contents, characterId || '');
        }
        
        // Select the appropriate model (defaulting to text task)
        const modelToUse = this.getModelForRequest(false);
        console.log(`[Gemini适配器] 使用模型: ${modelToUse} 生成内容`);
        
        // Enhanced implementation with retry and key rotation logic
        try {
            // First attempt with primary model and first API key
            return await this.executeGenerateContentWithKeyRotation(contents, modelToUse, characterId);
        } catch (initialError) {
            console.error(`[Gemini适配器] 主模型(${modelToUse})请求失败, 错误:`, initialError);
            
            // If model load balancing is enabled and we're using the primary model,
            // try the backup model after a delay
            if (this.useModelLoadBalancing && modelToUse === this.primaryModel) {
                console.log(`[Gemini适配器] 主模型请求失败，将在 ${this.retryDelay}ms 后尝试使用备用模型: ${this.backupModel}`);
                
                // Wait for the specified delay
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                
                try {
                    // Reset to the first API key for backup model
                    this.currentKeyIndex = 0;
                    console.log(`[Gemini适配器] 正在使用备用模型重试: ${this.backupModel}`);
                    return await this.executeGenerateContentWithKeyRotation(contents, this.backupModel, characterId);
                } catch (backupError) {
                    console.error(`[Gemini适配器] 备用模型也请求失败:`, backupError);
                    
                    // If cloud service is available, try as last resort
                    if (cloudServiceAvailable) {
                        console.log(`[Gemini适配器] API请求失败，尝试使用云服务作为备选方案`);
                        return await this.executeGenerateContentWithCloudService(contents, characterId || '');
                    }
                    
                    throw backupError;
                }
            } else {
                // If cloud service is available, try it as fallback
                if (cloudServiceAvailable) {
                    console.log(`[Gemini适配器] API请求失败，尝试使用云服务作为备选方案`);
                    return await this.executeGenerateContentWithCloudService(contents,characterId || '');
                }
                
                // Otherwise throw the original error
                throw initialError;
            }
        }
    }
    
    /**
     * Execute content generation using cloud service
     */
 /**
 * Execute content generation using cloud service
 */
private async executeGenerateContentWithCloudService(contents: ChatMessage[], characterId: string): Promise<string> {
    console.log('[Gemini适配器] 使用云服务生成内容');
    try {
        // ==== 新增：获取角色表格记忆 ====
        let tableMemoryText = '';
        // 修复：记录实际值，而不是类型
        console.log('[Gemini适配器][表格记忆/云服务] characterId参数值:', characterId);
        
        if (characterId) {
            try {
                console.log('[Gemini适配器][表格记忆/云服务] 调用 getCharacterTablesData 前参数:', { characterId });
                const tableData = await getCharacterTablesData(characterId);
                console.log('[Gemini适配器][表格记忆/云服务] getCharacterTablesData 返回:', tableData);
                if (tableData.success && tableData.tables.length > 0) {
                    tableMemoryText += `[角色长期记忆表格]\n`;
                    tableData.tables.forEach(table => {
                        const headerRow = '| ' + table.headers.join(' | ') + ' |';
                        const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
                        const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
                        tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
                    });
                    
                    console.log('[Gemini适配器][表格记忆/云服务] 成功获取表格记忆数据');
                } else {
                    console.log('[Gemini适配器][表格记忆/云服务] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
                }
            } catch (e) {
                console.warn('[Gemini适配器][表格记忆/云服务] 获取角色表格记忆失败:', e);
            }
        } else {
            console.log('[Gemini适配器][表格记忆/云服务] 未提供有效的characterId，跳过表格记忆注入');
        }
        // ==== 表格记忆获取结束 ====
    
            // 检查是否需要将合成内容（如记忆/表格/搜索）单独插入为倒数第二条消息
            let standardMessages: { role: string; content: string }[] = [];
            
            if (contents.length >= 2) {
                // ...existing code for processing contents...
            } else {
                // 消息不足两条，按原有逻辑转换
                standardMessages = contents.map(msg => {
                    let contentText = '';
                    if (msg.parts && Array.isArray(msg.parts)) {
                        contentText = msg.parts.map(part => (typeof part === 'object' && part.text) ? part.text : '').join(' ').trim();
                    }
                    let role = msg.role;
                    return { role, content: contentText };
                });
            }
    
            // 如果获取到表格记忆，将其作为系统消息添加到标准消息中
            if (tableMemoryText) {
                console.log('[Gemini适配器][表格记忆/云服务] 将表格记忆注入到云服务请求中');
                
                // 创建一个新的系统消息，包含表格记忆和提示
                const tableMemoryPrompt = `${tableMemoryText}\n\n<response_guidelines>
    - 你会在回复中结合上面的表格记忆内容，表格中记录了角色相关的重要信息和事实。
    - 你会确保回复与表格中的信息保持一致，不会捏造表格中不存在的信息。
    - 你的回复会自然融入表格中的信息，不会生硬地提及"根据表格"之类的字眼。
    - 你会确保回复保持角色人设的一致性。
    </response_guidelines>`;
                
                // 保存最后一条用户消息（如果有的话）
                let lastUserMessage = null;
                if (standardMessages.length > 0) {
                    const lastMsg = standardMessages[standardMessages.length - 1];
                    if (lastMsg.role === 'user') {
                        lastUserMessage = lastMsg;
                        // 从标准消息中移除最后一条用户消息，稍后再添加回去
                        standardMessages.pop();
                    }
                }
                
                // 添加表格记忆作为系统/助手消息
                standardMessages.push({
                    role: "user", // 或者助手角色，以兼容云服务API
                    content: tableMemoryPrompt
                });
                
                // 如果有，将最后一条用户消息添加回去
                if (lastUserMessage) {
                    standardMessages.push(lastUserMessage);
                }
                
                console.log('[Gemini适配器][表格记忆/云服务] 表格记忆注入完成，共包含表格数据长度:', tableMemoryText.length);
            }
    
            console.log('[Gemini适配器] 转换后的消息格式:', JSON.stringify(standardMessages, null, 2));
            const startTime = Date.now();
    
            const response = await CloudServiceProvider.generateChatCompletion(
                standardMessages,
                {
                    model: CloudServiceProvider.getPreferredModel(),
                    temperature: 0.7,
                    max_tokens: 8192
                }
            );

            const endTime = Date.now();
            console.log(`[Gemini适配器] 云服务请求完成，耗时: ${endTime - startTime}ms`);
            console.log(`[Gemini适配器] 云服务响应状态: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Cloud service HTTP error! status: ${response.status}, details: ${errorText}`);
            }
            
            const result = await response.json();
            
            // Check for the expected format from cloud service
            if (result.choices && result.choices.length > 0) {
                const responseText = result.choices[0].message?.content || "";
                
                if (responseText) {
                    console.log(`[Gemini适配器] 成功接收云服务响应，长度: ${responseText.length}`);
                    console.log(`[Gemini适配器] 响应前100个字符: ${responseText.substring(0, 100)}...`);
                    
                    this.conversationHistory.push({
                        role: "model",
                        parts: [{ text: responseText }]
                    });
                    return responseText;
                }
            }
            
            console.error(`[Gemini适配器] 无效的云服务响应格式: ${JSON.stringify(result)}`);
            throw new Error("云服务返回了无效格式的响应");
        } catch (error) {
            console.error(`[Gemini适配器] 云服务请求失败:`, error);
            throw new Error(`云服务请求失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Execute generateContent with key rotation on failure
     * This implements the enhanced key rotation and retry strategy
     * Modified to handle no API keys case by using cloud service
     */
    
    private async executeGenerateContentWithKeyRotation(contents: ChatMessage[], modelId: string, characterId?: string): Promise<string> {
        // If no API keys are configured and cloud service is available, use cloud service
        if (this.apiKeys.length === 0) {
            if (this.useCloudService && CloudServiceProvider.isEnabled()) {
                console.log(`[Gemini适配器] 没有配置API密钥，使用云服务`);
                return await this.executeGenerateContentWithCloudService(contents,characterId || '');
            } else {
                throw new Error("未配置API密钥，且云服务未启用");
            }
        }
        
        let lastError: any = null;
        // Try with each available API key
        for (let keyIndex = 0; keyIndex < this.apiKeys.length; keyIndex++) {
            // Set the current key index
            this.currentKeyIndex = keyIndex;
            // console.log(`[Gemini适配器] 尝试使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 请求模型: ${modelId}`);
            
            try {
                // Try the request with this key
                return await this.executeGenerateContent(contents, modelId, characterId);
            } catch (error) {
                console.error(`[Gemini适配器] 使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 请求失败:`, error);
                lastError = error;
                // Continue to the next key in the loop
                continue;
            }
        }
        
        // If we get here, all keys have failed
        throw new Error(`所有API密钥请求模型 ${modelId} 均失败: ${lastError?.message || '未知错误'}`);
    }
    

/**
 * Core implementation of generateContent with specified model
 */
private async executeGenerateContent(contents: ChatMessage[], modelId: string, characterId?: string): Promise<string> {
    // Verify we have a valid API key
    const currentApiKey = this.apiKey;
    if (!currentApiKey) {
        if (this.useCloudService && CloudServiceProvider.isEnabled()) {
            return await this.executeGenerateContentWithCloudService(contents, characterId || '');
        }
        throw new Error("未配置API密钥，无法执行直接API调用");
    }
    
    let url = `${this.BASE_URL}/models/${modelId}:generateContent?key=${currentApiKey}`;
    
    // ==== 新增：获取角色表格记忆 ====
    let tableMemoryText = '';
    let effectiveCharacterId = characterId;
    
    // 修复：不要记录类型名称，而是记录实际值
    console.log('[Gemini适配器][表格记忆] characterId参数值:', effectiveCharacterId);
    
    if (effectiveCharacterId) {
        try {
            console.log('[Gemini适配器][表格记忆] 调用 getCharacterTablesData 前参数:', { characterId: effectiveCharacterId });
            const tableData = await getCharacterTablesData(effectiveCharacterId);
            console.log('[Gemini适配器][表格记忆] getCharacterTablesData 返回:', tableData);
            if (tableData.success && tableData.tables.length > 0) {
                tableMemoryText += `[角色长期记忆表格]\n`;
                tableData.tables.forEach(table => {
                    const headerRow = '| ' + table.headers.join(' | ') + ' |';
                    const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
                    const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
                    tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
                });
                
                console.log('[Gemini适配器][表格记忆] 成功获取表格记忆数据');
            } else {
                console.log('[Gemini适配器][表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
            }
        } catch (e) {
            console.warn('[Gemini适配器] 获取角色表格记忆失败:', e);
        }
    } else {
        console.log('[Gemini适配器][表格记忆] 未提供有效的characterId，跳过表格记忆注入');
    }
    // ==== 新增结束 ====
    
    // 准备请求内容
    let enhancedContents = [...contents];
    
    // 如果获取到有效的表格记忆，将其作为系统消息插入为倒数第二条model消息
    if (tableMemoryText) {
        // 构建表格记忆提示词，与云服务逻辑保持一致
        const tableMemoryPrompt = `${tableMemoryText}\n\n<response_guidelines>
    - 你会在回复中结合上面的表格记忆内容，表格中记录了角色相关的重要信息和事实。
    - 你会确保回复与表格中的信息保持一致，不会捏造表格中不存在的信息。
    - 你的回复会自然融入表格中的信息，不会生硬地提及"根据表格"之类的字眼。
    - 你会确保回复保持角色人设的一致性。
    </response_guidelines>`;

        // 查找最后一个user消息的索引
        let lastUserIdx = -1;
        for (let i = enhancedContents.length - 1; i >= 0; i--) {
            if (enhancedContents[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        // 查找倒数第二条model消息的索引
        let lastModelIdx = -1;
        let modelCount = 0;
        for (let i = enhancedContents.length - 1; i >= 0; i--) {
            if (enhancedContents[i].role === 'model') {
                modelCount++;
                if (modelCount === 1) continue; // 跳过最后一条model
                lastModelIdx = i;
                break;
            }
        }

        // 如果有user消息，插入到最后一个user消息前；否则插入到最后
        let insertIdx = lastUserIdx !== -1 ? lastUserIdx : enhancedContents.length;
        // 如果存在倒数第二条model消息，则插入到其后（即成为倒数第二条消息）
        if (lastModelIdx !== -1) {
            insertIdx = lastModelIdx + 1;
        }

        // 插入表格记忆消息
        enhancedContents.splice(insertIdx, 0, {
            role: "user",
            parts: [{ text: tableMemoryPrompt }]
        });

        console.log('[Gemini适配器][表格记忆] 已将表格记忆注入到倒数第二条model消息位置，插入索引:', insertIdx);
    } else {
        console.log('[Gemini适配器] 未获取到表格记忆数据，使用原始消息内容');
    }

    // 获取 temperature 和 max tokens
    const apiSettings = getApiSettings();
    const temperature = typeof apiSettings.geminiTemperature === 'number' ? apiSettings.geminiTemperature : 0.7;
    const maxTokens = typeof apiSettings.geminiMaxTokens === 'number' ? apiSettings.geminiMaxTokens : 2048;

    // config 参数
    const config = {
        temperature,
        maxOutputTokens: maxTokens
    };

    return this.executeDirectGenerateContent(enhancedContents, modelId, url, config);
}

            /**
             * 实际执行API调用的方法，从executeGenerateContent中抽取出来
             * 以便于在有无表格记忆的情况下复用
             */
            private async executeDirectGenerateContent(contents: ChatMessage[], modelId: string, url: string, config?: { temperature: number; maxOutputTokens: number }): Promise<string> {
                // 获取 temperature 和 max tokens
                const apiSettings = getApiSettings();
                const temperature = typeof apiSettings.geminiTemperature === 'number' ? apiSettings.geminiTemperature : 0.7;
                const maxTokens = typeof apiSettings.geminiMaxTokens === 'number' ? apiSettings.geminiMaxTokens : 2048;

                // 直接将 temperature 和 maxOutputTokens 与 model 参数并列
                const data = {
                    contents,
                    model: modelId,
                };

                // console.log(`[Gemini适配器] 发送请求到API: ${modelId}`);
                // console.log(`[Gemini适配器] 请求包含 ${contents.length} 条消息`);
                // console.log(`[Gemini适配器] 当前云服务状态: ${this.useCloudService ? '启用' : '禁用'}`);
                
                // Enhanced logging for each message in the request
                contents.forEach((msg, index) => {
                    const previewText = msg.parts?.[0]?.text || "";
                    // console.log(`[Gemini适配器] 消息 #${index + 1} (${msg.role}): ${previewText.substring(0, 100)}...`);
                    
                    // Special handling for messages that might contain VNDB data, appearance tags, or traits
                    if (previewText.includes("VNDB") || 
                        previewText.includes("角色参考") || 
                        previewText.includes("外观参考") || 
                        previewText.includes("标签") || 
                        previewText.includes("特征")) {
                        
                        // Log a more complete version of important data
                        const importantDataPreview = previewText.substring(0, 300);
                        console.log(`[Gemini适配器] 重要数据预览 #${index + 1}: ${importantDataPreview}...`);
                        
                        // Check for specific sections and log them
                        if (previewText.includes("正向标签")) {
                            const positiveTagsMatch = previewText.match(/正向标签[：:]\s*([\s\S]*?)(?=负向标签|$)/);
                            if (positiveTagsMatch && positiveTagsMatch[1]) {
                                console.log(`[Gemini适配器] 正向标签: ${positiveTagsMatch[1].trim()}`);
                            }
                        }
                        
                        if (previewText.includes("负向标签")) {
                            const negativeTagsMatch = previewText.match(/负向标签[：:]\s*([\s\S]*?)(?=\n\n|$)/);
                            if (negativeTagsMatch && negativeTagsMatch[1]) {
                                console.log(`[Gemini适配器] 负向标签: ${negativeTagsMatch[1].trim()}`);
                            }
                        }
                        
                        if (previewText.includes("特征")) {
                            const traitsMatch = previewText.match(/特征[：:]\s*([\s\S]*?)(?=\n\n|$)/);
                            if (traitsMatch && traitsMatch[1]) {
                                console.log(`[Gemini适配器] 角色特征: ${traitsMatch[1].trim()}`);
                            }
                        }
                        
                        if (previewText.includes("性别")) {
                            const genderMatch = previewText.match(/[角色|用户]性别[：:]\s*([\\s\S]*?)(?=\n\n|$)/);
                            if (genderMatch && genderMatch[1]) {
                                console.log(`[Gemini适配器] 性别信息: ${genderMatch[1].trim()}`);
                            }
                        }
                    }
                });

                // Check if cloud service should be used
                let response;
                
                // Double check with CloudServiceProvider directly as well
                const providerEnabled = CloudServiceProvider.isEnabled();
                const isCloudEnabled = this.useCloudService && providerEnabled;
                
                if (isCloudEnabled) {
                    console.log('[Gemini适配器] 检测到云服务已启用，使用云服务转发请求');
                    console.log(`[Gemini适配器] 原始请求URL: ${url.replace(/(\bkey=)([^&]{4})[^&]*/gi, '$1$2****')}`);
                    
                    try {
                        console.log('[Gemini适配器] 调用CloudServiceProvider.generateChatCompletion...');
                        const startTime = Date.now();
                        
                        // Convert Gemini-style messages to standard format 
                        const standardMessages = contents.map(msg => {
                            // Get text from message parts
                            let contentText = '';
                            if (msg.parts && Array.isArray(msg.parts)) {
                                contentText = msg.parts.map(part => {
                                    if (typeof part === 'object' && part.text) {
                                        return part.text;
                                    }
                                    return '';
                                }).join(' ').trim();
                            }
                            
                            // Map Gemini roles to standard roles
                            let role = msg.role;
                            
                            return {
                                role: role,
                                content: contentText
                            };
                        });
                        
                        console.log('[Gemini适配器] 转换后的消息格式:', JSON.stringify(standardMessages, null, 2));
                        
                        // Use the generateChatCompletion method for cloud service
                        response = await CloudServiceProvider.generateChatCompletion(
                            standardMessages,
                            {
                                model: CloudServiceProvider.getPreferredModel(),
                                temperature: 0.7,
                                max_tokens: 8192
                            }
                        );
                        
                        const endTime = Date.now();
                        console.log(`[Gemini适配器] 云服务请求完成，耗时: ${endTime - startTime}ms`);
                        console.log(`[Gemini适配器] 云服务响应状态: ${response.status} ${response.statusText}`);
                    } catch (cloudError) {
                        console.error('[Gemini适配器] 云服务请求失败:', cloudError);
                        console.error('[Gemini适配器] 尝试回退到直接API调用...');
                        
                        // Fall back to direct API call
                        const startTime = Date.now();
                        response = await fetch(url, {
                            method: 'POST',
                            headers: this.headers,
                            body: JSON.stringify(data)
                        });
                        const endTime = Date.now();
                        
                        console.log(`[Gemini适配器] 直接API调用完成，耗时: ${endTime - startTime}ms`);
                        console.log(`[Gemini适配器] API响应状态: ${response.status} ${response.statusText}`);
                    }
                } else {
                    if (this.useCloudService) {
                        console.log('[Gemini适配器] 云服务状态不一致: tracker显示已启用但CloudServiceProvider未启用');
                    }
                    
                    // console.log('[Gemini适配器] 云服务未启用，使用直接API调用');
                    // console.log(`[Gemini适配器] 直接调用URL: ${url.replace(/(\bkey=)([^&]{4})[^&]*/gi, '$1$2****')}`);
                    // console.log(`[Gemini适配器] 开始时间: ${new Date().toISOString()}`);
                    
                    const startTime = Date.now();
                    response = await fetch(url, {
                        method: 'POST',
                        headers: this.headers,
                        body: JSON.stringify(data)
                    });
                    const endTime = Date.now();
                    
                    console.log(`[Gemini适配器] 直接API调用完成，耗时: ${endTime - startTime}ms`);
                    console.log(`[Gemini适配器] API响应状态: ${response.status} ${response.statusText}`);
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[Gemini适配器] API响应错误 (${response.status}): ${errorText}`);
                    // Throw error for any status code - the caller will handle key rotation
                    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
                }

                console.log(`[Gemini适配器] 成功接收到API响应，开始解析JSON`);
                const result = await response.json();
                
                if (result.choices && result.choices.length > 0) {
                    // This is the standard OpenAI format
                    const responseText = result.choices[0].message?.content || "";
                    
                    if (responseText) {
                        console.log(`[Gemini适配器] 成功接收云服务响应，长度: ${responseText.length}`);
                        console.log(`[Gemini适配器] 响应前100个字符: ${responseText.substring(0, 100)}...`);
                        
                        this.conversationHistory.push({
                            role: "model",
                            parts: [{ text: responseText }]
                        });
                        return responseText;
                    }
                } else if (result.candidates?.[0]?.content) {
                    // This is the Gemini format
                    const responseText = result.candidates[0].content.parts?.[0]?.text || "";
                    if (responseText) {
                        console.log(`[Gemini适配器] 成功接收响应，长度: ${responseText.length}`);
                        console.log(`[Gemini适配器] 响应前100个字符: ${responseText.substring(0, 100)}...`);
                        
                        // Log potential JSON formatting issues
                        if (responseText.includes('"') && responseText.includes('\\')) {
                            console.warn('[Gemini适配器] 警告：响应中可能存在不正确的JSON转义字符');
                        }
                        
                        this.conversationHistory.push({
                            role: "model",
                            parts: [{ text: responseText }]
                        });
                        return responseText;
                    } else {
                        console.warn(`[Gemini适配器] 接收到空响应`);
                    }
                    return responseText;
                }
                
                console.error(`[Gemini适配器] 无效的响应格式: ${JSON.stringify(result)}`);
                return "";
            }

    /**
     * 生成包含文本和/或图片的内容
     * @param prompt 文本提示
     * @param options 生成选项
     * @returns 生成的内容（文本和图片）
     */
    async generateMultiModalContent(prompt: string, options: { 
        includeImageOutput?: boolean;
        temperature?: number;
        images?: ImageInput[]; // Support both base64 encoded images and URLs
    } = {}): Promise<GeneratedContent> {
        // Always check cloud service status before making requests
        this.updateCloudServiceStatus();
        
        // Check if we have API keys or need to use cloud service
        const apiKeyAvailable = this.isApiKeyConfigured();
        const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
        
        // If no API key and cloud service is not available, throw error
        if (!apiKeyAvailable && !cloudServiceAvailable) {
            throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
        }
        
        // If no API key but cloud service is available, use cloud service
        if (!apiKeyAvailable && cloudServiceAvailable) {
            console.log(`[Gemini适配器] 未配置API密钥，自动切换到云服务处理多模态请求`);
            return await this.executeMultiModalContentWithCloudService(prompt, options);
        }
        
        // 始终使用gemini-2.0-flash-exp，因为它是唯一支持图像生成的模型
        const modelToUse = this.backupModel;
        
        try {
            // First try with the first API key
            return await this.executeMultiModalContentWithKeyRotation(prompt, modelToUse, options);
        } catch (error) {
            console.error(`[Gemini适配器] 多模态内容生成失败:`, error);
            
            // If cloud service is available, try as fallback
            if (cloudServiceAvailable) {
                console.log(`[Gemini适配器] API多模态请求失败，尝试使用云服务作为备选方案`);
                return await this.executeMultiModalContentWithCloudService(prompt, options);
            }
            
            throw error;
        }
    }
    
    /**
     * Execute multimodal content generation using cloud service
     */
    private async executeMultiModalContentWithCloudService(
        prompt: string,
        options: { 
            includeImageOutput?: boolean;
            temperature?: number;
            images?: ImageInput[];
        }
    ): Promise<GeneratedContent> {
        console.log('[Gemini适配器] 使用云服务生成多模态内容');
        
        try {
            const startTime = Date.now();
            
            // Prepare messages for cloud service in the required format
            let messages = [];
            
            // If we have images, we need to handle them specially
            if (options.images && options.images.length > 0) {
                // Create a message that includes both text and images
                let messageContent = [];
                
                // Add text content first
                messageContent.push({
                    type: "text",
                    text: prompt
                });
                
                // Process and add each image
                for (const img of options.images) {
                    let imageData;
                    let mimeType;
                    
                    if (img.url) {
                        // Fetch the image from URL
                        const fetchedImg = await this.fetchImageAsBase64(img.url);
                        imageData = fetchedImg.data;
                        mimeType = fetchedImg.mimeType;
                    } else if (img.data && img.mimeType) {
                        // Use provided data directly
                        imageData = img.data;
                        mimeType = img.mimeType;
                    } else {
                        console.error('[Gemini适配器] 无效的图像输入');
                        continue;
                    }
                    
                    // Add image to content
                    messageContent.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${mimeType};base64,${imageData}`
                        }
                    });
                }
                
                messages.push({
                    role: "user",
                    content: messageContent
                });
            } else {
                // Simple text-only message
                messages.push({
                    role: "user",
                    content: prompt
                });
            }
            
            console.log(`[Gemini适配器] 向云服务发送${options.images ? '图文混合' : '纯文本'}消息`);
            

            
            const endTime = Date.now();
            console.log(`[Gemini适配器] 云服务多模态请求完成，耗时: ${endTime - startTime}ms`);
            

            
            // Process the response and extract text/images
            const generatedContent: GeneratedContent = {};
            
            
            console.log(`[Gemini适配器] 成功收到云服务的多模态响应`);
            if (generatedContent.text) {
                console.log(`[Gemini适配器] 响应包含文本，长度: ${generatedContent.text.length}`);
            }
            if (generatedContent.images) {
                console.log(`[Gemini适配器] 响应包含 ${generatedContent.images.length} 个图片`);
            }
            
            return generatedContent;
        } catch (error) {
            console.error(`[Gemini适配器] 云服务多模态内容生成失败:`, error);
            throw new Error(`云服务多模态请求失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Execute multimodal content generation with key rotation
     * Modified to handle no API keys case
     */
    private async executeMultiModalContentWithKeyRotation(
        prompt: string, 
        modelToUse: string,
        options: { 
            includeImageOutput?: boolean;
            temperature?: number;
            images?: ImageInput[];
        }
    ): Promise<GeneratedContent> {
        // If no API keys are configured but cloud service is available, use it
        if (this.apiKeys.length === 0) {
            if (this.useCloudService && CloudServiceProvider.isEnabled()) {
                console.log(`[Gemini适配器] 没有配置API密钥，使用云服务处理多模态请求`);
                return await this.executeMultiModalContentWithCloudService(prompt, options);
            } else {
                throw new Error("未配置API密钥，且云服务未启用");
            }
        }
        
        let lastError: any = null;
        
        // Try with each available API key
        for (let keyIndex = 0; keyIndex < this.apiKeys.length; keyIndex++) {
            // Set the current key index
            this.currentKeyIndex = keyIndex;
            console.log(`[Gemini适配器] 尝试使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 生成多模态内容`);
            
            try {
                const result = await this.executeMultiModalContent(prompt, modelToUse, options);
                return result;
            } catch (error) {
                console.error(`[Gemini适配器] 使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 多模态请求失败:`, error);
                lastError = error;
                // Continue to the next key in the loop
            }
        }
        
        // If we get here, all keys have failed
        throw new Error(`所有API密钥多模态请求均失败: ${lastError?.message || '未知错误'}`);
    }

    /**
     * Core implementation of multimodal content generation
     */
    private async executeMultiModalContent(
        prompt: string,
        modelToUse: string,
        options: { 
            includeImageOutput?: boolean;
            temperature?: number;
            images?: ImageInput[];
        }
    ): Promise<GeneratedContent> {
        // Verify we have a valid API key
        const currentApiKey = this.apiKey;
        if (!currentApiKey) {
            if (this.useCloudService && CloudServiceProvider.isEnabled()) {
                return await this.executeMultiModalContentWithCloudService(prompt, options);
            }
            throw new Error("未配置API密钥，无法执行直接API调用");
        }
        
        let url = `${this.BASE_URL}/models/${modelToUse}:generateContent?key=${currentApiKey}`;
        
        // Mask API key in URL for logging
        const maskedUrl = url.replace(/(\bkey=)([^&]{4})[^&]*/gi, '$1$2****');
        
        // 准备请求内容
        const contents: { role: string; parts: ContentPart[] }[] = [{
            role: "user",
            parts: [{ text: prompt }]
        }];

        // 如果提供了图片，需要处理并添加到请求中
        if (options.images && options.images.length > 0) {
            try {
                // 将文本部分移除，我们将在新数组中重新添加
                contents[0].parts = [];
                
                // 添加文本提示作为第一部分
                if (prompt) {
                    contents[0].parts.push({ text: prompt });
                }
                
                // 处理每一个图像输入（可能是URL或Base64数据）
                for (const img of options.images) {
                    // 通过URL获取图像的情况
                    if (img.url) {
                        const imageData = await this.fetchImageAsBase64(img.url);
                        contents[0].parts.push({
                            inlineData: {
                                data: imageData.data,
                                mimeType: imageData.mimeType || 'image/jpeg'
                            }
                        });
                    } 
                    // 直接提供Base64数据的情况
                    else if (img.data && img.mimeType) {
                        contents[0].parts.push({
                            inlineData: {
                                data: img.data,
                                mimeType: img.mimeType
                            }
                        });
                    }
                }
                
                console.log(`[Gemini适配器] 已处理 ${contents[0].parts.length - 1} 张图片`);
            } catch (error) {
                console.error("[Gemini适配器] 处理图片输入时出错:", error);
                throw new Error("处理图片输入失败: " + (error instanceof Error ? error.message : String(error)));
            }
        }

        // 准备请求数据
        const data: any = {
            contents,
            generationConfig: {
                temperature: options.temperature || 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,
            }
        };

        // 如果需要图片输出，添加正确的参数配置
        if (options.includeImageOutput) {
            // 根据文档使用正确的responseModalities参数
            data.generationConfig.responseModalities = ['TEXT', 'IMAGE'];
            console.log(`[Gemini适配器] 已配置图像生成选项，使用模型: ${modelToUse}`);
            console.log(`[Gemini适配器] 响应模态: ${JSON.stringify(data.generationConfig.responseModalities)}`);
        }

        console.log(`[Gemini适配器] 发送多模态请求到API: ${modelToUse}`);
        console.log(`[Gemini适配器] 请求是否包含图片输出: ${options.includeImageOutput ? '是' : '否'}`);
        console.log(`[Gemini适配器] 当前云服务状态: ${this.useCloudService ? '启用' : '禁用'}`);
        
        // Check if cloud service should be used
        let response;
        
        // Double check with CloudServiceProvider directly as well
        const providerEnabled = CloudServiceProvider.isEnabled();
        const isCloudEnabled = this.useCloudService && providerEnabled;
        
        if (isCloudEnabled) {
            console.log('[GeminiAdapter] Using cloud service for multimodal request');
            // 转换为 CloudServiceProvider 需要的消息格式
            let messages = [];
            if (options.images && options.images.length > 0) {
                let messageContent = [];
                if (prompt) {
                    messageContent.push({
                        type: "text",
                        text: prompt
                    });
                }
                for (const img of options.images) {
                    let imageUrl: string;
                    if (img.url) {
                        // 直接用URL
                        imageUrl = img.url;
                    } else if (img.data && img.mimeType) {
                        imageUrl = `data:${img.mimeType};base64,${img.data}`;
                    } else {
                        continue;
                    }
                    messageContent.push({
                        type: "image_url",
                        image_url: { url: imageUrl }
                    });
                }
                messages.push({
                    role: "user",
                    content: messageContent
                });
            } else {
                messages.push({
                    role: "user",
                    content: prompt
                });
            }
            response = await CloudServiceProvider.generateMultiModalContent(
                messages,
                {
                    model: modelToUse,
                    temperature: options.temperature || 0.7,
                    max_tokens: 8192,
                    ...(options.includeImageOutput ? { responseModalities: ['TEXT', 'IMAGE'] } : {})
                }
            );
        } else {
            console.log(`[Gemini适配器] 直接调用URL: ${maskedUrl}`);
            
            const startTime = Date.now();
            response = await fetch(url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            const endTime = Date.now();
            
            console.log(`[Gemini适配器] 直接API调用完成，耗时: ${endTime - startTime}ms`);
            console.log(`[Gemini适配器] API响应状态: ${response.status} ${response.statusText}`);
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Gemini适配器] 多模态API响应错误 (${response.status}): ${errorText}`);
            throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
        }

        const result = await response.json();
        
        // 解析响应
        if (result.candidates?.[0]?.content) {
            const parts = result.candidates[0].content.parts || [];
            const generatedContent: GeneratedContent = {};
            const images: string[] = [];
            
            // 处理每个部分（可能是文本或图片）
            parts.forEach((part: any) => {
                if (part.text) {
                    generatedContent.text = (generatedContent.text || '') + part.text;
                }
                if (part.inlineData) {
                    // 这是一个Base64编码的图片
                    images.push(part.inlineData.data);
                }
            });
            
            if (images.length > 0) {
                generatedContent.images = images;
            }
            
            console.log(`[Gemini适配器] 成功接收多模态响应`);
            if (generatedContent.text) {
                console.log(`[Gemini适配器] 响应包含文本，长度: ${generatedContent.text.length}`);
            }
            if (generatedContent.images) {
                console.log(`[Gemini适配器] 响应包含 ${generatedContent.images.length} 个图片`);
            }
            
            return generatedContent;
        }
        // 新增：支持处理OpenAI格式
        else if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            const msg = result.choices[0].message;
            // 判断role为assistant时，视为model角色
            if (msg.role === 'assistant' || msg.role === 'model') {
                const generatedContent: GeneratedContent = {};
                if (typeof msg.content === 'string') {
                    generatedContent.text = msg.content;
                } else if (Array.isArray(msg.content)) {
                    // 如果是数组，拼接所有text部分
                    generatedContent.text = msg.content
                        .filter((part: any) => part.type === 'text')
                        .map((part: any) => part.text)
                        .join('\n');
                }

                return generatedContent;
            }
        }
        
        console.error(`[Gemini适配器] 无效的多模态响应格式: ${JSON.stringify(result)}`);
        return {};
    }

    /**
     * 从URL获取图像并转换为Base64格式
     * @param imageUrl 图像URL
     * @returns 图像的Base64编码和MIME类型
     */
    async fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
        try {
            console.log(`[Gemini适配器] 正在从URL获取图片: ${imageUrl}`);
                        // 新增：如果是data:URL，直接解析
                        if (imageUrl.startsWith('data:')) {
                            // 解析data URL格式
                            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                            if (matches && matches.length === 3) {
                                const mimeType = matches[1];
                                const base64Data = matches[2];
                                // console.log(`[Gemini适配器] 检测到data:URL，直接提取base64数据，MIME类型: ${mimeType}, 大小: ${base64Data.length}字节`);
                                const previewLength = 10;
                                const base64Preview = base64Data.substring(0, previewLength) + '...';
                                console.log(`[Gemini适配器] 检测到data:URL，直接提取base64数据，MIME类型: ${mimeType}, 大小: ${base64Data.length}字节, 预览: ${base64Preview}`);
                                return {
                                    data: base64Data,
                                    mimeType
                                };
                            } else {
                                throw new Error('无效的data:URL格式');
                            }
                        }
            const response = await fetch(imageUrl);
            
            if (!response.ok) {
                throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
            }
            
            // 获取内容类型（MIME类型）
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            
            // 获取图像数据并转换为Base64
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            
            // 转换为Base64字符串
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            const base64Data = btoa(binaryString);
            
            // 修正: 不打印完整的base64字符串，只记录其长度和前10个字符
            const previewLength = 10;
            const base64Preview = base64Data.substring(0, previewLength) + '...';
            console.log(`[Gemini适配器] 成功获取并编码图片，MIME类型: ${contentType}, 大小: ${base64Data.length}字节, 预览: ${base64Preview}`);
            
            return {
                data: base64Data,
                mimeType: contentType
            };
        } catch (error) {
            console.error(`[Gemini适配器] 从URL获取图片失败:`, error);
            throw error;
        }
    }

    /**
     * 从本地文件创建Base64图像数据
     * @param fileUri 本地文件URI
     * @returns Promise<{data: string, mimeType: string}>
     */
    async getImageDataFromLocalFile(fileUri: string): Promise<{ data: string; mimeType: string }> {
        try {
            // 注意：这个方法需要根据不同平台实现
            // 在React Native中，可能会使用react-native-fs或expo-file-system
            // 为了保持适配器的通用性，这里我们返回一个未实现的错误
            // 实际实现应该在调用此方法的组件中完成
            throw new Error("从本地文件获取图像数据的方法需要在特定平台上实现");
        } catch (error) {
            console.error(`[Gemini适配器] 从本地文件获取图片失败:`, error);
            throw error;
        }
    }

    /**
     * 生成图片
     * @param prompt 图片生成提示
     * @param options 生成选项
     * @returns 生成的Base64编码图片数组
     */
    async generateImage(prompt: string, options: {
        temperature?: number;
        referenceImages?: ImageInput[];
    } = {}): Promise<string[]> {
        console.log(`[Gemini适配器] 请求生成图片，提示: ${prompt.substring(0, 50)}...`);
        // 只允许本地 API key 进行图片生成，不允许云服务
        const apiKeyAvailable = this.isApiKeyConfigured();
        if (!apiKeyAvailable) {
            throw new Error("图片生成功能仅支持本地API密钥，云服务暂不支持图片生成。请配置API密钥。");
        }
        try {
            // Always use the backup model (gemini-2.0-flash-exp) for image generation
            console.log(`[Gemini适配器] 使用${this.backupModel}模型生成图片`);
            let lastError: any = null;
            for (let keyIndex = 0; keyIndex < this.apiKeys.length; keyIndex++) {
                this.currentKeyIndex = keyIndex;
                console.log(`[Gemini适配器] 尝试使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 生成图片`);
                try {
                    const enhancedPrompt = `我需要一张基于以下描述的图片(请务必生成图像): ${prompt}`;
                    const result = await this.generateMultiModalContent(enhancedPrompt, {
                        includeImageOutput: true,
                        temperature: options.temperature || 0.7,
                    });
                    if (result.images && result.images.length > 0) {
                        console.log(`[Gemini适配器] 成功生成 ${result.images.length} 张图片`);
                        const processedImages = result.images.map(img => { /* ...existing code... */ return img; });
                        return processedImages;
                    }
                    console.log(`[Gemini适配器] 未能生成图片，尝试使用更明确的提示`);
                    const secondAttemptPrompt = 
                        `Generate an image of the following (please output an image in your response): ${prompt}`;
                    const result2 = await this.generateMultiModalContent(secondAttemptPrompt, {
                        includeImageOutput: true,
                        temperature: options.temperature || 0.9,
                    });
                    if (result2.images && result2.images.length > 0) {
                        console.log(`[Gemini适配器] 第二次尝试成功生成 ${result2.images.length} 张图片`);
                        const processedImages = result2.images.map(img => { /* ...existing code... */ return img; });
                        return processedImages;
                    }
                    lastError = new Error("尝试生成图片失败，未返回图像");
                } catch (error) {
                    console.error(`[Gemini适配器] 使用API密钥 ${keyIndex + 1} 生成图片失败:`, error);
                    lastError = error;
                }
            }
            console.log(`[Gemini适配器] 所有API密钥尝试都未能生成图片`);
            throw lastError || new Error("所有API密钥尝试生成图片均失败");
        } catch (error) {
            console.error("[Gemini适配器] 图像生成失败:", error);
            return [];
        }
    }


    /**
     * 分析图片内容
     * @param image 图片输入（URL或Base64数据）
     * @param prompt 询问图片的提示
     * @returns 分析结果文本
     */
    async analyzeImage(image: ImageInput, prompt: string): Promise<string> {
        // 检查是否有API密钥配置或者是否应该使用云服务
        const apiKeyAvailable = this.isApiKeyConfigured();
        const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
        
        // 如果没有API密钥且云服务不可用，抛出错误
        if (!apiKeyAvailable && !cloudServiceAvailable) {
            throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
        }
        
        // 如果没有API密钥但云服务可用，使用云服务
        if (!apiKeyAvailable && cloudServiceAvailable) {
            console.log(`[Gemini适配器] 未配置API密钥，自动切换到云服务分析图片`);
            return await this.analyzeImageWithCloudService(image, prompt);
        }
        
        // 增强图像分析提示词，以获得更全面的描述
        const enhancedPrompt = prompt || `请详细描述这张图片的内容。包括：
1. 图片中的主要人物/物体
2. 场景和环境
3. 颜色和氛围
4. 任何特殊或显著的细节
5. 图片可能传递的情感或意图

请提供全面但简洁的描述，控制在150字以内。`;

        // 确保我们有正确的图像数据格式
        let processedImage: ImageInput;
        
        if (image.url) {
            // 如果提供了URL，先获取图像数据
            try {
                const imageData = await this.fetchImageAsBase64(image.url);
                processedImage = imageData;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`无法处理图像URL: ${errorMessage}`);
            }
        } else {
            // 如果已经提供了Base64数据，直接使用
            processedImage = image;
        }
        
        // 修改：预览提示词的前50个字符而不是完整打印
        const promptPreview = enhancedPrompt.substring(0, 50) + (enhancedPrompt.length > 50 ? '...' : '');
        console.log(`[Gemini适配器] 使用增强提示词分析图片: "${promptPreview}"`);
        
        try {
            // Try with API key first
            const result = await this.generateMultiModalContent(enhancedPrompt, {
                images: [processedImage]
            });
            
            return result.text || '';
        } catch (error) {
            console.error(`[Gemini适配器] 分析图片失败:`, error);
            
            // If API request fails and cloud service is available, try cloud service
            if (cloudServiceAvailable) {
                console.log(`[Gemini适配器] API分析图片失败，尝试使用云服务`);
                return await this.analyzeImageWithCloudService(image, prompt);
            }
            
            throw new Error(`分析图片失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
    
    /**
     * 使用云服务分析图片
     */
    private async analyzeImageWithCloudService(image: ImageInput, prompt: string): Promise<string> {
        console.log(`[Gemini适配器] 使用云服务分析图片`);
        
        // 使用与传递给analyzeImage相同的增强提示词
        const enhancedPrompt = prompt || `请详细描述这张图片的内容。包括：
1. 图片中的主要人物/物体
2. 场景和环境
3. 颜色和氛围
4. 任何特殊或显著的细节
5. 图片可能传递的情感或意图

请提供全面但简洁的描述，控制在150字以内。`;
        
        try {
            // 处理图像输入为云服务所需的格式
            let imageUrl: string;
            
            if (image.url) {
                // 如果是外部URL，直接使用
                imageUrl = image.url;
                console.log(`[Gemini适配器] 使用图片URL: ${imageUrl.substring(0, 50)}...`);
            } else if (image.data && image.mimeType) {
                // 如果是Base64数据，需要创建Data URL
                imageUrl = `data:${image.mimeType};base64,${image.data}`;
                console.log(`[Gemini适配器] 使用Base64图片数据 (${image.data.length} 字节)`);
            } else {
                throw new Error("无效的图像输入格式");
            }
            
            const startTime = Date.now();
            
            // 使用CloudServiceProvider分析图片
            const messages = [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: enhancedPrompt
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ]
                }
            ];
            
            const response = await CloudServiceProvider.generateMultiModalContent(
                messages,
                {
                    model: CloudServiceProvider.getMultiModalModel(),
                    temperature: 0.7,
                    max_tokens: 2048
                }
            );
            
            const endTime = Date.now();
            console.log(`[Gemini适配器] 云服务图片分析请求完成，耗时: ${endTime - startTime}ms`);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`云服务HTTP错误! 状态: ${response.status}, 详情: ${errorText}`);
            }
            
            const result = await response.json();
            
            if (result.choices && result.choices.length > 0) {
                const content = result.choices[0].message?.content;
                
                if (typeof content === 'string') {
                    return content;
                } else if (Array.isArray(content)) {
                    // 提取所有文本部分
                    return content
                        .filter(part => part.type === 'text')
                        .map(part => part.text)
                        .join('\n');
                }
            }
            
            throw new Error("云服务返回了无效的响应格式");
        } catch (error) {
            console.error(`[Gemini适配器] 云服务分析图片失败:`, error);
            throw new Error(`云服务分析图片失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getChatHistory(): Array<{ role: string; text: string }> {
        return this.conversationHistory.map(msg => ({
            role: msg.role,
            text: msg.parts[0]?.text || ""
        }));
    }

    /**
     * 图片编辑 - 为了正确执行图像编辑操作，我们需要专门的方法
     * @param image 原始图片
     * @param prompt 编辑指令
     * @param options 编辑选项
     * @returns 编辑后的图片数据
     */
    async editImage(
        image: ImageInput, 
        prompt: string,
        options: {
            temperature?: number;
        } = {}
    ): Promise<string | null> {
        console.log(`[Gemini适配器] 请求编辑图片，提示: ${prompt}`);
        // 只允许本地 API key 进行图片编辑，不允许云服务
        const apiKeyAvailable = this.isApiKeyConfigured();
        if (!apiKeyAvailable) {
            throw new Error("图片编辑功能仅支持本地API密钥，云服务暂不支持图片编辑。请配置API密钥。");
        }
        try {
            let processedImage: {data: string; mimeType: string};
            if (image.url) {
                processedImage = await this.fetchImageAsBase64(image.url);
            } else if (image.data && image.mimeType) {
                processedImage = {
                    data: image.data,
                    mimeType: image.mimeType
                };
            } else {
                throw new Error("编辑图片需要有效的图像数据");
            }
            console.log(`[Gemini适配器] 处理的图像大小: ${processedImage.data.length} 字节, 类型: ${processedImage.mimeType}`);
            let lastError: any = null;
            for (let keyIndex = 0; keyIndex < this.apiKeys.length; keyIndex++) {
                this.currentKeyIndex = keyIndex;
                console.log(`[Gemini适配器] 尝试使用API密钥 ${keyIndex + 1}/${this.apiKeys.length} 编辑图片`);
                try {
                    const editPrompt = `请将这张图片${prompt}。输出编辑后的图片，保持原图的基本元素和构成。`;
                    const result = await this.generateMultiModalContent(editPrompt, {
                        includeImageOutput: true,
                        temperature: options.temperature || 0.7,
                        images: [{ 
                            data: processedImage.data,
                            mimeType: processedImage.mimeType
                        }]
                    });
                    if (result.images && result.images.length > 0) {
                        console.log(`[Gemini适配器] 图像编辑成功，输出图像大小: ${result.images[0].length} 字节`);
                        return result.images[0];
                    }
                    console.log(`[Gemini适配器] 第一次尝试未获得图像输出，尝试使用英文提示`);
                    const englishPrompt = `Edit this image to ${prompt}. Return the edited image maintaining the basic elements and composition of the original.`;
                    const secondAttempt = await this.generateMultiModalContent(englishPrompt, {
                        includeImageOutput: true,
                        temperature: options.temperature || 0.8,
                        images: [{ 
                            data: processedImage.data,
                            mimeType: processedImage.mimeType
                        }]
                    });
                    if (secondAttempt.images && secondAttempt.images.length > 0) {
                        console.log(`[Gemini适配器] 第二次尝试图像编辑成功，输出图像大小: ${secondAttempt.images[0].length} 字节`);
                        return secondAttempt.images[0];
                    }
                    lastError = new Error("图像编辑未返回图像");
                } catch (error) {
                    console.error(`[Gemini适配器] 使用API密钥 ${keyIndex + 1} 编辑图片失败:`, error);
                    lastError = error;
                }
            }
            console.log(`[Gemini适配器] 图像编辑失败，所有API密钥都未能生成图像`);
            return null;
        } catch (error) {
            console.error("[Gemini适配器] 编辑图片失败:", error);
            throw error;
        }
    }
    

    /**
     * 生成支持工具调用的内容
     * @param contents 消息内容
     * @param memoryResults 记忆搜索结果 (可选)
     * @returns 生成的内容
     */
    async generateContentWithTools(contents: ChatMessage[], characterId:string,memoryResults?: any, userMessage?: string): Promise<string> {
        // 检查是否有API密钥配置或者是否应该使用云服务
        
        const apiKeyAvailable = this.isApiKeyConfigured();
        const cloudServiceAvailable = this.useCloudService && CloudServiceProvider.isEnabled();
        
        // 如果没有API密钥且云服务不可用，抛出错误
        if (!apiKeyAvailable && !cloudServiceAvailable) {
            throw new Error("未配置API密钥，且云服务未启用。请配置API密钥或启用云服务。");
        }
        
        // 如果没有API密钥但云服务可用，使用云服务
        if (!apiKeyAvailable && cloudServiceAvailable) {
            console.log(`[Gemini适配器] 未配置API密钥，自动切换到云服务生成内容`);
            // 使用标准generateContent方法，它会自动切换到云服务
            return await this.generateContent(contents);
        }
        
        // 获取userMessage（优先参数，否则回退到最后一条消息）
        const analyzedUserMessage = typeof userMessage === 'string'
            ? userMessage
            : (contents[contents.length - 1]?.parts?.[0]?.text || "");
        
        // 添加详细的调试日志
        console.log(`[Gemini适配器] generateContentWithTools被调用，userMessage: "${analyzedUserMessage.substring(0, 50)}${analyzedUserMessage.length > 50 ? '...' : ''}"`);
        
        // 检查是否需要搜索（分析userMessage而不是最后一条消息）
        const wouldNeedSearching = this.messageNeedsSearching(analyzedUserMessage);
        console.log(`[Gemini适配器] userMessage是否适合搜索: ${wouldNeedSearching}`);
        
        try {
            // 检查是否同时存在记忆结果和搜索意图ff
            const hasMemoryResults = memoryResults && 
                                   memoryResults.results && 
                                   memoryResults.results.length > 0;
            
            // 解耦逻辑：根据情况处理不同类型的增强内容
            if (hasMemoryResults && wouldNeedSearching) {
                // 同时处理记忆和搜索
                console.log(`[Gemini适配器] 同时检测到记忆结果和搜索意图，使用组合增强处理`);
                return await this.handleCombinedMemoryAndSearch(contents, memoryResults, userMessage);
            } else if (hasMemoryResults) {
                // 如果只有记忆搜索结果，仅使用记忆增强
                console.log(`[Gemini适配器] 检测到记忆搜索结果，使用记忆增强处理`);
                return await this.handleWithMemoryResults(contents, memoryResults);
            } else if (wouldNeedSearching) {
                // 如果没有记忆结果但有搜索意图，使用网络搜索
                console.log(`[Gemini适配器] 检测到搜索意图，尝试使用网络搜索`);
                return await this.handleSearchIntent(contents, analyzedUserMessage);
            }
            
            // 如果没有搜索意图，使用普通对话方式
            console.log(`[Gemini适配器] 使用标准对话方式生成回复`);
            return await this.generateContent(contents, characterId);
        } catch (error) {
            console.error(`[Gemini适配器] 工具调用失败，回退到标准对话:`, error);
            // 如果工具调用失败，回退到标准对话
            return await this.generateContent(contents);
        }
    }
    /**
    /**
     * 处理同时具有记忆搜索结果和网络搜索意图的请求
     * @param contents 消息内容
     * @param memoryResults 记忆搜索结果
     * @returns 生成的融合回复
     */
    private async handleCombinedMemoryAndSearch(contents: ChatMessage[], memoryResults: any, userMessage?: string): Promise<string> {
        console.log(`[Gemini适配器] 开始处理记忆搜索和网络搜索的组合请求`);
        
        // userQuery 始终使用 userMessage 参数
        const userQuery = typeof userMessage === 'string'
            ? userMessage
            : '';
        
        try {
            // Step 1: 准备记忆部分
            console.log(`[Gemini适配器] 处理记忆部分，发现 ${memoryResults.results.length} 条记忆`);
            
            let memorySection = `<mem>\n[系统检索到的记忆内容]：\n`;
            // 格式化记忆结果
            memoryResults.results.forEach((item: any, index: number) => {
                memorySection += `${index + 1}. ${item.memory}\n`;
            });
            memorySection += `</mem>\n\n`;
            
            // ==== 新增：获取角色表格记忆 ====
            let tableMemoryText = '';
            try {
                // 日志：记录characterId/conversationId来源和类型
                let characterId =
                    memoryResults.characterId ||
                    memoryResults.agentId ||
                    memoryResults.results?.[0]?.characterId ||
                    memoryResults.results?.[0]?.agentId;
                let conversationId =
                    memoryResults.conversationId ||
                    memoryResults.results?.[0]?.conversationId;
                console.log('[Gemini适配器][表格记忆] memoryResults.characterId:', memoryResults.characterId, typeof memoryResults.characterId);
                console.log('[Gemini适配器][表格记忆] memoryResults.agentId:', memoryResults.agentId, typeof memoryResults.agentId);
                console.log('[Gemini适配器][表格记忆] memoryResults.results[0]?.characterId:', memoryResults.results?.[0]?.characterId, typeof memoryResults.results?.[0]?.characterId);
                console.log('[Gemini适配器][表格记忆] memoryResults.results[0]?.agentId:', memoryResults.results?.[0]?.agentId, typeof memoryResults.results?.[0]?.agentId);
                console.log('[Gemini适配器][表格记忆] memoryResults.conversationId:', memoryResults.conversationId, typeof memoryResults.conversationId);
                console.log('[Gemini适配器][表格记忆] memoryResults.results[0]?.conversationId:', memoryResults.results?.[0]?.conversationId, typeof memoryResults.results?.[0]?.conversationId);
                if (!characterId && contents.length > 0) {
                    characterId = contents[0]?.characterId;
                    console.log('[Gemini适配器][表格记忆] 尝试从contents[0]获取characterId:', characterId, typeof characterId);
                }
                console.log('[Gemini适配器][表格记忆] 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
                if (characterId) {
                    console.log('[Gemini适配器][表格记忆] 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
                    const tableData = await getCharacterTablesData(characterId, conversationId);
                    console.log('[Gemini适配器][表格记忆] getCharacterTablesData 返回:', tableData);
                    if (tableData.success && tableData.tables.length > 0) {
                        tableMemoryText += `[角色长期记忆表格]\n`;
                        tableData.tables.forEach(table => {
                            const headerRow = '| ' + table.headers.join(' | ') + ' |';
                            const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
                            const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
                            tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
                        });
                    } else {
                        console.log('[Gemini适配器][表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
                    }
                } else {
                    console.log('[Gemini适配器][表格记忆] 未能确定characterId，跳过表格记忆注入');
                }
            } catch (e) {
                console.warn('[Gemini适配器] 获取角色表格记忆失败:', e);
            }
            // ==== 新增结束 ====
            
            // Step 2: 准备网络搜索部分
            console.log(`[Gemini适配器] 为用户查询准备网络搜索: "${userQuery}"`);
            
            // 优先尝试通过云服务进行联网搜索
            if (this.useCloudService && CloudServiceProvider.isEnabled()) {
                try {
                    console.log(`[Gemini适配器] 优先通过云服务处理联网搜索请求`);
                    // 新增：打印请求内容
                    console.log(`[Gemini适配器][云服务搜索] 请求内容:`, userQuery);
                    const response = await CloudServiceProvider.generateSearchResult(userQuery, {
                        model: CloudServiceProvider.getMultiModalModel(),
                        temperature: 0.7,
                        max_tokens: 2048
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Cloud service search HTTP error! status: ${response.status}, details: ${errorText}`);
                    }
                    const result = await response.json();

                    let searchResultText = "";
                    if (result.choices && result.choices.length > 0) {
                        searchResultText = result.choices[0].message?.content || "";
                    } else if (typeof result === 'string') {
                        searchResultText = result;
                    }
                    // 新增：打印云服务返回的搜索结果
                    console.log(`[Gemini适配器][云服务搜索] 返回结果:`, searchResultText);
                    if (searchResultText) {
                        let searchSection = `<websearch>\n搜索引擎返回的联网检索结果：\n${searchResultText}\n</websearch>\n\n`;
                        
                        // 构建融合提示词
                        console.log(`[Gemini适配器] 构建融合提示词，结合记忆和网络搜索结果`);
                        
                        // 修改：将表格记忆添加到组合提示中，位置在memorySection之前
                        let combinedPrompt = '';
                        // 添加表格记忆（如果有）
                        if (tableMemoryText) {
                            combinedPrompt += tableMemoryText + '\n';
                        }
                        // 添加记忆部分
                        combinedPrompt += memorySection;
                        // 添加搜索部分
                        combinedPrompt += searchSection;
                        
                        combinedPrompt += `<response_guidelines>
                - 结合上面的记忆内容和联网搜索结果，全面回答{{user}}的问题。
                - 用<websearch></websearch>标签包裹我对网络搜索结果的解释和引用，例如:
                  <websearch>根据最新的网络信息，关于这个问题的专业观点是...</websearch>
                - 确保回复能够同时**有效整合记忆和网络信息**，让内容更加全面和有用。
                - 回复的语气和风格一定会与角色人设保持一致。
                </response_guidelines>`;
                        
                        // 记录融合提示词的长度
                        console.log(`[Gemini适配器] 融合提示词构建完成，长度: ${combinedPrompt.length}`);
                        
                        // 使用标准的生成内容方法生成最终回复
                        // 插入顺序：历史消息 + model(记忆/搜索内容) + 用户消息
                        const finalPrompt: ChatMessage[] = [
                            ...contents.slice(0, -1),
                            {
                                role: "user",
                                parts: [{ text: combinedPrompt }]
                            },
                            contents[contents.length - 1]
                        ];
                        
                        return await this.generateContent(finalPrompt);
                    }
                } catch (cloudSearchError) {
                    console.warn('[Gemini适配器] 云服务联网搜索失败，降级到本地BraveSearch:', cloudSearchError);
                    // 继续降级到本地bravesearch
                }
            }
            
            // 确保MCP适配器已连接
            if (!mcpAdapter.isReady()) {
                try {
                    await mcpAdapter.connect();
                } catch (e) {
                    console.error('[Gemini适配器] Brave本地搜索连接失败:', e);
                    // 返回友好提示
                    return await this.generateContent([
                        ...contents.slice(0, -1),
                        {
                            role: "model",
                            parts: [{ text: "（注意：搜索功能不可用。）" }]
                        },
                        contents[contents.length - 1]
                    ]);
                }
            }
            
            // 先使用Gemini分析消息，提取搜索关键词
            const extractionPrompt: ChatMessage[] = [
                {
                    role: "model",
                    parts: [{ text: "我将帮助你提取搜索关键词。请给我一个问题或搜索请求，我会提取出最适合用于搜索引擎的关键词。我只会返回关键词，不会有任何额外的解释。" }]
                },
                {
                    role: "user",
                    parts: [{ text: userQuery }]
                }
            ];
            
            const refinedQuery = await this.generateContent(extractionPrompt);
            const finalQuery = refinedQuery.trim() || userQuery;
            
            console.log(`[Gemini适配器] 提取的搜索关键词: ${finalQuery}`);
            
            // 使用MCP适配器执行搜索
            let searchResults;
            try {
                searchResults = await mcpAdapter.search({
                    query: finalQuery,
                    count: 5
                });
            } catch (e) {
                console.error('[Gemini适配器] Brave本地搜索执行失败:', e);
                // 返回友好提示
                return await this.generateContent([
                    ...contents.slice(0, -1),
                    {
                        role: "model",
                        parts: [{ text: "（注意：本地搜索功能不可用，请检查Brave API密钥配置。）" }]
                    },
                    contents[contents.length - 1]
                ]);
            }
            
            // 格式化搜索结果为可读文本
            const formattedResults = mcpAdapter.formatSearchResults(searchResults);
            
            let searchSection = `<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n`;
            
            // Step 3: 构建融合提示词
            console.log(`[Gemini适配器] 构建融合提示词，结合记忆和网络搜索结果`);
            
            // 修改：将表格记忆添加到组合提示中，位置在memorySection之前
            let combinedPrompt = '';
            // 添加表格记忆（如果有）
            if (tableMemoryText) {
                combinedPrompt += tableMemoryText + '\n';
            }
            // 添加记忆部分
            combinedPrompt += memorySection;
            // 添加搜索部分
            combinedPrompt += searchSection;
            
            combinedPrompt += `<response_guidelines>
            - 结合上面的记忆内容和联网搜索结果，全面回答用户的问题。
            - 用<websearch></websearch>标签包裹我对网络搜索结果的解释和引用，例如:
              <websearch>根据最新的网络信息，关于这个问题的专业观点是...</websearch>
            - 确保回复能够同时**有效整合记忆和网络信息**，让内容更加全面和有用。
            - 回复的语气和风格一定会与角色人设保持一致。
            - **不在回复中使用多组<websearch>标签，整个回复只能有一组<websearch>标签。**
      </response_guidelines>`;
            
            // 记录融合提示词的长度
            console.log(`[Gemini适配器] 融合提示词构建完成，长度: ${combinedPrompt.length}`);
            
            // 使用标准的生成内容方法生成最终回复
            // 插入顺序：历史消息 + model(记忆/搜索内容) + 用户消息
            const finalPrompt: ChatMessage[] = [
                ...contents.slice(0, -1),
                {
                    role: "user",
                    parts: [{ text: combinedPrompt }]
                },
                contents[contents.length - 1]
            ];
            
            return await this.generateContent(finalPrompt);
        } catch (error) {
            console.error(`[Gemini适配器] 组合处理记忆搜索和网络搜索时出错:`, error);
            
            // 如果组合处理失败，尝试退回到仅使用记忆搜索结果的方式
            console.log(`[Gemini适配器] 组合处理失败，回退到仅使用记忆结果模式`);
            try {
                return await this.handleWithMemoryResults(contents, memoryResults);
            } catch (fallbackError) {
                console.error(`[Gemini适配器] 记忆处理也失败，回退到标准对话:`, fallbackError);
                // 如最终都失败，使用标准方式
                return await this.generateContent(contents);
            }
        }
    }

    /**
     * 使用记忆搜索结果处理请求
     * @param contents 消息内容
     * @param memoryResults 记忆搜索结果
     * @returns 生成的回复
     */
    private async handleWithMemoryResults(contents: ChatMessage[], memoryResults: any): Promise<string> {
        // 获取最后一条消息的内容
        const lastMessage = contents[contents.length - 1];
        const userQuery = lastMessage.parts?.[0]?.text || "";

        try {
            // Add more detailed logging of memory result structure
            console.log(`[Gemini适配器] 处理记忆增强请求，发现 ${memoryResults.results.length} 条记忆`);
            console.log('[Gemini适配器] 记忆结果结构:', {
                hasResults: !!memoryResults.results,
                resultCount: memoryResults.results?.length || 0,
                firstMemoryFields: memoryResults.results && memoryResults.results.length > 0 
                    ? Object.keys(memoryResults.results[0]) 
                    : 'No memories',
                firstMemoryScore: memoryResults.results?.[0]?.score,
                hasMetadata: memoryResults.results?.[0]?.metadata !== undefined
            });

            // ==== 新增：获取角色表格记忆 ====
            let tableMemoryText = '';
            try {
                // 日志：记录characterId/conversationId来源和类型
                let characterId =
                    memoryResults.characterId ||
                    memoryResults.agentId ||
                    memoryResults.results?.[0]?.characterId ||
                    memoryResults.results?.[0]?.agentId;
                let conversationId =
                    memoryResults.conversationId ||
                    memoryResults.results?.[0]?.conversationId;
                console.log('[Gemini适配器][表格记忆] memoryResults.characterId:', memoryResults.characterId, typeof memoryResults.characterId);
                console.log('[Gemini适配器][表格记忆] memoryResults.agentId:', memoryResults.agentId, typeof memoryResults.agentId);
                console.log('[Gemini适配器][表格记忆] memoryResults.results[0]?.characterId:', memoryResults.results?.[0]?.characterId, typeof memoryResults.results?.[0]?.characterId);
                console.log('[Gemini适配器][表格记忆] memoryResults.results[0]?.agentId:', memoryResults.results?.[0]?.agentId, typeof memoryResults.results?.[0]?.agentId);
                console.log('[Gemini适配器][表格记忆] memoryResults.conversationId:', memoryResults.conversationId, typeof memoryResults.conversationId);
                console.log('[Gemini适配器][表格记忆] memoryResults.results[0]?.conversationId:', memoryResults.results?.[0]?.conversationId, typeof memoryResults.results?.[0]?.conversationId);
                if (!characterId && contents.length > 0) {
                    characterId = contents[0]?.characterId;
                    console.log('[Gemini适配器][表格记忆] 尝试从contents[0]获取characterId:', characterId, typeof characterId);
                }
                console.log('[Gemini适配器][表格记忆] 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
                if (characterId) {
                    console.log('[Gemini适配器][表格记忆] 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
                    const tableData = await getCharacterTablesData(characterId, conversationId);
                    console.log('[Gemini适配器][表格记忆] getCharacterTablesData 返回:', tableData);
                    if (tableData.success && tableData.tables.length > 0) {
                        tableMemoryText += `[角色长期记忆表格]\n`;
                        tableData.tables.forEach(table => {
                            const headerRow = '| ' + table.headers.join(' | ') + ' |';
                            const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
                            const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
                            tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
                        });
                    } else {
                        console.log('[Gemini适配器][表格记忆] 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
                    }
                } else {
                    console.log('[Gemini适配器][表格记忆] 未能确定characterId，跳过表格记忆注入');
                }
            } catch (e) {
                console.warn('[Gemini适配器] 获取角色表格记忆失败:', e);
            }
            // ==== 新增结束 ====

            // 构建包含记忆搜索结果的提示
            let combinedPrompt = `${userQuery}\n\n`;

            // 插入表格记忆内容（如有）
            if (tableMemoryText) {
                combinedPrompt = `${tableMemoryText}\n${combinedPrompt}`;
            }

            // 添加记忆搜索结果
            combinedPrompt += `<mem>\n系统检索到的记忆内容：\n`;

            // 格式化记忆结果
            memoryResults.results.forEach((item: any, index: number) => {
                combinedPrompt += `${index + 1}. ${item.memory}\n`;
            });
            combinedPrompt += `</mem>\n\n`;

            // 添加响应指南
            combinedPrompt += `<response_guidelines>
- 除了对{{user}}消息的回应之外，结合记忆内容进行回复。
- 结合表格记忆的内容回复（如果有），但不输出表格的具体内容，仅将表格作为内心记忆。
</response_guidelines>`;

            // Log prepared prompt
            console.log('[Gemini适配器] 准备了带记忆结果的提示:', combinedPrompt.substring(0, 200) + '...');

            // 使用标准的生成内容方法生成最终回复
            // 插入顺序：历史消息 + model(记忆内容) + 用户消息
            const finalPrompt: ChatMessage[] = [
                ...contents.slice(0, -1),
                {
                    role: "user",
                    parts: [{ text: combinedPrompt }]
                },
                contents[contents.length - 1]
            ];

            return await this.generateContent(finalPrompt);
        } catch (error) {
            console.error(`[Gemini适配器] 记忆增强处理失败:`, error);
            // 如果记忆处理失败，回退到标准方式
            return await this.generateContent(contents);
        }
    }

    /**
     * 处理搜索意图
     * @param contents 消息内容
     * @returns 搜索结果和回复
     */
    /**
     * 处理搜索意图
     * @param contents 消息内容
     * @param userMessage 可选，用户真实输入
     * @returns 搜索结果和回复
     */
    private async handleSearchIntent(contents: ChatMessage[], userMessage?: string): Promise<string> {
        // 优先使用 userMessage 参数
        const searchQuery = typeof userMessage === 'string'
        ? userMessage
        : (contents[contents.length - 1]?.parts?.[0]?.text || "");
        
        try {
            // 优先尝试通过云服务进行联网搜索
            if (this.useCloudService && CloudServiceProvider.isEnabled()) {
                try {
                    console.log(`[Gemini适配器] 优先通过云服务处理联网搜索请求`);
                    // 新增：打印请求内容
                    console.log(`[Gemini适配器][云服务搜索] 请求内容:`, searchQuery);
                    const response = await CloudServiceProvider.generateSearchResult(searchQuery, {
                        model: CloudServiceProvider.getMultiModalModel(),
                        temperature: 0.7,
                        max_tokens: 2048
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Cloud service search HTTP error! status: ${response.status}, details: ${errorText}`);
                    }
                    const result = await response.json();

                    let searchResultText = "";
                    if (result.choices && result.choices.length > 0) {
                        searchResultText = result.choices[0].message?.content || "";
                    } else if (typeof result === 'string') {
                        searchResultText = result;
                    }
                    // 新增：打印云服务返回的搜索结果
                    console.log(`[Gemini适配器][云服务搜索] 返回结果:`, searchResultText);
                    if (searchResultText) {
                        // 构建带有搜索结果的修改版提示
                        let combinedPrompt = `我在对用户消息：${searchQuery}\n\n进行联网搜索`;
                        
                        // 添加网络搜索结果
                        combinedPrompt += `<websearch>\n搜索引擎返回的联网检索结果：\n${searchResultText}\n</websearch>\n\n`;
                        
                        // 添加响应指南
                        combinedPrompt += `<response_guidelines>
- 除了对用户消息的回应之外，我**一定** 会结合联网搜索内容进行回复。
- **我会根据角色设定和聊天上下文**，输出我对联网检索结果的解释，并用<websearch></websearch>包裹。
  - 示例: <websearch>根据网络信息，[相关领域的专家]认为... 这可能对您有帮助。</websearch>
- 我会确保回复保持角色人设的一致性。
</response_guidelines>`;
                        
                        // 使用标准的生成内容方法生成最终回复
                        // 插入顺序：历史消息 + model(搜索内容) + 用户消息
                        const finalPrompt: ChatMessage[] = [
                            ...contents.slice(0, -1),
                            {
                                role: "model",
                                parts: [{ text: combinedPrompt }]
                            },
                            contents[contents.length - 1]
                        ];
                        
                        return await this.generateContent(finalPrompt);
                    }
                } catch (cloudSearchError) {
                    console.warn('[Gemini适配器] 云服务联网搜索失败，降级到本地BraveSearch:', cloudSearchError);
                    // 继续降级到本地bravesearch
                }
            }

            // 确保MCP适配器已连接
            if (!mcpAdapter.isReady()) {
                await mcpAdapter.connect();
            }
            
            // 先使用Gemini分析消息，提取搜索关键词
            const extractionPrompt: ChatMessage[] = [
                {
                    role: "model",
                    parts: [{ text: "我将帮助你提取搜索关键词。请给我一个问题或搜索请求，我会提取出最适合用于搜索引擎的关键词。我只会返回关键词，不会有任何额外的解释。" }]
                },
                {
                    role: "user",
                    parts: [{ text: searchQuery }]
                }
            ];
            
            const refinedQuery = await this.generateContent(extractionPrompt);
            const finalQuery = refinedQuery.trim() || searchQuery;
            
            console.log(`[Gemini适配器] 提取的搜索关键词: ${finalQuery}`);
            
            // 使用MCP适配器执行搜索
            const searchResults = await mcpAdapter.search({
                query: finalQuery,
                count: 5
            });
            
            // 格式化搜索结果为可读文本
            const formattedResults = mcpAdapter.formatSearchResults(searchResults);
            
            console.log(`[Gemini适配器] 获取到搜索结果，正在生成回复`);
            
            // 构建网络搜索结果的修改版提示
            let combinedPrompt = `我在对用户消息：${searchQuery}\n\n进行联网搜索`;
            
            // 添加网络搜索结果
            combinedPrompt += `<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n`;
            
            // 添加响应指南
            combinedPrompt += `<response_guidelines>
- 除了对用户消息的回应之外，我**一定** 会结合联网搜索内容进行回复。
- **我会根据角色设定和聊天上下文**，输出我对联网检索结果的解释，并用<websearch></websearch>包裹。
  - 示例: <websearch>根据网络信息，[相关领域的专家]认为... 这可能对您有帮助。</websearch>
- 我会确保回复保持角色人设的一致性。
</response_guidelines>`;
            
            // 使用标准的生成内容方法生成最终回复
            // 插入顺序：历史消息 + model(搜索内容) + 用户消息
            const finalPrompt: ChatMessage[] = [
                ...contents.slice(0, -1),
                {
                    role: "model",
                    parts: [{ text: combinedPrompt }]
                },
                contents[contents.length - 1]
            ];
            
            return await this.generateContent(finalPrompt);
        } catch (error) {
            console.error(`[Gemini适配器] 搜索处理失败:`, error);
            
            // 如果搜索失败，通知用户并使用标准方式回答
            const fallbackPrompt: ChatMessage[] = [
                ...contents.slice(0, -1),
                {
                    role: "model",
                    parts: [{ 
                        text: `${searchQuery}\n\n(注意：搜索引擎尝试搜索相关信息，但搜索功能暂时不可用。请根据你已有的知识回答我的问题。)` 
                    }]
                },
                contents[contents.length - 1]
            ];
            
            return await this.generateContent(fallbackPrompt);
        }
    }

    /**
     * 判断消息是否需要搜索
     * @param messageText 消息文本
     * @returns 是否需要搜索
     */

    private messageNeedsSearching(userMessage: string): boolean {
    // 添加更多详细的调试日志
    console.log(`[Gemini适配器] 正在分析userMessage是否需要搜索: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
    
    // 检查消息是否包含搜索意图的关键词
    const searchKeywords = [
        '搜索', '查询', '查找', '寻找', '检索', '了解', '信息', 
        '最新', '新闻', '什么是', '谁是', '哪里', '如何', '怎么',
        'search', 'find', 'lookup', 'query', 'information about',
        'latest', 'news', 'what is', 'who is', 'where', 'how to'
    ];
    
    // 提问型关键词
    const questionPatterns = [
        /是什么/, /有哪些/, /如何/, /怎么/, /怎样/, 
        /什么时候/, /为什么/, /哪些/, /多少/,
        /what is/i, /how to/i, /when is/i, /why is/i, /where is/i
    ];
    
    // 检查关键词
    const hasSearchKeyword = searchKeywords.some(keyword => 
        userMessage.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // 检查提问模式
    const isQuestion = questionPatterns.some(pattern => 
        pattern.test(userMessage)
    ) || userMessage.includes('?') || userMessage.includes('？');
    
    // 如果同时满足以下条件，则判断需要搜索:
    // 1. 消息包含搜索关键词或者是一个问题
    // 2. 消息长度不超过300个字符 (放宽长度限制，从200改为300)
    const needsSearching = (hasSearchKeyword || isQuestion) && userMessage.length < 300;
    
    // 添加详细的判断结果日志
    console.log(`[Gemini适配器] 消息搜索判断结果:`, {
        hasSearchKeyword,
        isQuestion,
        messageLength: userMessage.length,
        needsSearching
    });
    
    return needsSearching;
}

    // 静态方法：允许外部直接生成内容（简化调用）
    // 静态方法：允许外部直接生成内容（简化调用）
    static async executeDirectGenerateContent(
        promptOrMessages: string | ChatMessage[] | { role: string; content: string }[],
        options?: {
            apiKey?: string;
            characterId?: string;
            modelId?: string;
        }
    ): Promise<string> {
        // 1. 获取API key（优先参数，其次全局设置，再次settings-helper）
        let apiKey = options?.apiKey 
            || (typeof global !== 'undefined' && (global as any).GEMINI_API_KEY)
            || '';

        if (!apiKey) {
            // 尝试通过 settings-helper 获取
            try {
                const apiSettings = getApiSettings();
                if (apiSettings && apiSettings.apiKey) {
                    apiKey = apiSettings.apiKey;
                }
            } catch (e) {
                // 忽略异常，继续后续判断
            }
        }

        if (!apiKey) {
            throw new Error('GeminiAdapter.executeDirectGenerateContent: API key is required');
        }

        // 2. 创建适配器实例
        const adapter = new GeminiAdapter(apiKey);

        // 3. 组装消息格式
        let messages: ChatMessage[];
        if (typeof promptOrMessages === 'string') {
            messages = [
                { role: 'user', parts: [{ text: promptOrMessages }] }
            ];
        } else if (Array.isArray(promptOrMessages)) {
            // 支持传入标准格式或Gemini格式
            if (promptOrMessages.length > 0 && (promptOrMessages[0] as any).parts) {
                messages = promptOrMessages as ChatMessage[];
            } else {
                // 标准OpenAI格式转Gemini格式
                messages = (promptOrMessages as any[]).map(msg => ({
                    role: msg.role,
                    parts: [{ text: msg.content }]
                }));
            }
        } else {
            throw new Error('GeminiAdapter.executeDirectGenerateContent: Invalid prompt/messages');
        }

        // 4. 调用实例方法生成内容
        return await adapter.generateContent(messages, options?.characterId);
    }
}
