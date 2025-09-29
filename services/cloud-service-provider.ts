/**
 * Cloud Service Provider
 * 
 * Handles the cloud service functionality for API communication
 */

import { API_CONFIG } from '@/constants/api-config';
import { CloudServiceConfig } from '@/shared/types';
import { licenseService } from '@/services/license-service';
import { updateCloudServiceStatus, addCloudServiceStatusListener } from '@/utils/settings-helper';

class CloudServiceProviderClass {
  private enabled: boolean = false;
  private licenseKey: string | null = null;
  private deviceId: string | null = null;
  private preferredModel: string = 'gemini-2.0-flash-exp'; // Default model
  private cloudEndpoint: string = API_CONFIG.CLOUD_API_URL || 'https://chat.cradleintro.top';
  private initializationInProgress: boolean = false;

  // Define allowed models for Hugging Face API
  private allowedModels: string[] = [
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.0-flash-exp',
    'gemini-2.0-pro-exp-02-05',
    'gemini-exp-1206',
    'gemini-2.0-flash-thinking-exp-1219',
    'gemini-exp-1121',
    'gemini-exp-1114',
    'gemini-1.5-pro-exp-0827',
    'gemini-1.5-pro-exp-0801',
    'gemini-1.5-flash-8b-exp-0924',
    'gemini-1.5-flash-8b-exp-0827'
  ];

  constructor() {
    // Listen for tracker updates and synchronize the state
    addCloudServiceStatusListener((enabled) => {
      if (enabled && !this.isEnabled()) {
        console.log('[CloudServiceProvider] Tracker显示云服务已启用，尝试初始化');
        this.initializeFromTracker();
      } else if (!enabled && this.isEnabled()) {
        console.log('[CloudServiceProvider] Tracker显示云服务已禁用，禁用服务');
        this.disable();
      }
    });
    
    // Automatically check for existing license and initialize on startup
    this.autoInitializeOnStartup();
  }
  
  /**
   * Automatically initialize the cloud service if a valid license exists
   */
  private async autoInitializeOnStartup(): Promise<void> {
    try {
      // Check if we should initialize based on stored settings
      const { getUserSettingsGlobally } = require('@/utils/settings-helper');
      const settings = getUserSettingsGlobally();
      
      if (settings?.chat?.useCloudService === true) {
        console.log('[CloudServiceProvider] 应用启动时检测到云服务已启用，尝试自动初始化');
        this.initializeFromTracker();
      }
    } catch (error) {
      console.error('[CloudServiceProvider] 自动初始化失败:', error);
    }
  }

  /**
   * Initialize the cloud service with license information
   */
  async initialize(config: CloudServiceConfig): Promise<void> {
    if (!config.licenseKey || !config.deviceId) {
      console.error('[CloudService] Missing required license information');
      throw new Error('缺少有效的许可证信息');
    }
    
    // Validate license with license service
    try {
      const isValid = await this.validateLicense(config.licenseKey, config.deviceId);
      if (!isValid) {
        console.error('[CloudService] License validation failed');
        throw new Error('许可证验证失败，请检查激活码是否有效');
      }
    } catch (error) {
      console.error('[CloudService] License validation error:', error);
      throw new Error('许可证验证过程中发生错误: ' + (error instanceof Error ? error.message : String(error)));
    }
    
    this.licenseKey = config.licenseKey;
    this.deviceId = config.deviceId;
    this.enabled = true;
    
    // Set preferred model if provided
    if (config.preferredModel) {
      this.setPreferredModel(config.preferredModel);
    }
  }

  /**
   * Initialize the cloud service using the tracker state.
   */
  private async initializeFromTracker(): Promise<void> {
    // Prevent multiple simultaneous initialization attempts
    if (this.initializationInProgress) {
      console.log('[CloudServiceProvider] 初始化已在进行中，跳过重复请求');
      return;
    }
    
    this.initializationInProgress = true;
    
    try {
      const licenseInfo = await licenseService.getLicenseInfo();
      if (licenseInfo?.isValid) {
        await this.initialize({
          enabled: true,
          licenseKey: licenseInfo.licenseKey!,
          deviceId: licenseInfo.deviceId!,
          preferredModel: this.preferredModel,
        });
        console.log('[CloudServiceProvider] 成功从Tracker初始化云服务');
        
        // Update tracker status to match actual state
        updateCloudServiceStatus(true);
      } else {
        console.warn('[CloudServiceProvider] 无法从Tracker初始化云服务: 许可证无效');
        // Make sure tracker status matches actual state
        updateCloudServiceStatus(false);
      }
    } catch (error) {
      console.error('[CloudServiceProvider] 从Tracker初始化云服务失败:', error);
      // Make sure tracker status matches actual state
      updateCloudServiceStatus(false);
    } finally {
      this.initializationInProgress = false;
    }
  }
  
  /**
   * Validates the license with license service
   */
  private async validateLicense(licenseKey: string, deviceId: string): Promise<boolean> {
    try {
      // Use the license service to validate
      const licenseInfo = await licenseService.getLicenseInfo();
      
      if (!licenseInfo) {
        console.error('[CloudService] No license information found');
        return false;
      }
      
      if (!licenseInfo.isValid) {
        console.error('[CloudService] License is invalid');
        return false;
      }
      
      // Verify that the provided license key matches the one in the license service
      if (licenseInfo.licenseKey !== licenseKey) {
        console.error('[CloudService] License key mismatch');
        return false;
      }
      
      // Verify that the provided device ID matches the one in the license service
      if (licenseInfo.deviceId !== deviceId) {
        console.error('[CloudService] Device ID mismatch');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[CloudService] License validation error:', error);
      throw error;
    }
  }
  
  /**
   * Disable the cloud service and update the tracker.
   */
  disable(): void {
    this.enabled = false;
    console.log('[CloudServiceProvider] 云服务已禁用');
    updateCloudServiceStatus(false);
  }

  /**
   * Enable the cloud service and update the tracker.
   */
  async enable(config: CloudServiceConfig): Promise<void> {
    await this.initialize(config);
    updateCloudServiceStatus(true);
  }
  
  /**
   * Check if cloud service is enabled and properly configured
   */
  isEnabled(): boolean {
    return this.enabled && !!this.licenseKey && !!this.deviceId;
  }
  
  /**
   * Validates that the model is allowed for use with Hugging Face API
   * @param modelId Model ID to validate
   * @returns A valid model ID (original if valid, default if not)
   */
  private validateModel(modelId: string): string {
    // If model is in the allowed list, use it
    if (this.allowedModels.includes(modelId)) {
      return modelId;
    }
    
    // Otherwise, use the first allowed model as default
    console.warn(`[CloudService] 模型 ${modelId} 不在允许列表中，使用默认模型 ${this.allowedModels[0]} 代替`);
    return this.allowedModels[0];
  }

  /**
   * Set preferred model for chat completions, with validation
   */
  setPreferredModel(modelId: string): void {
    if (modelId && modelId.trim()) {
      // Validate the model before setting it
      const validModel = this.validateModel(modelId);
      this.preferredModel = validModel;
      console.log(`[CloudService] 更新首选模型: ${this.preferredModel}`);
    }
  }
  
  /**
   * Get current preferred model
   */
  getPreferredModel(): string {
    return this.preferredModel;
  }
  
  /**
   * Get the preferred model for multimodal content (text + images)
   * Currently only gemini-2.0-flash-exp supports multimodal content
   */
  getMultiModalModel(): string {
    // For multimodal content, only gemini-2.0-flash-exp is supported
    return 'gemini-2.0-flash-exp';
  }
  
  /**
   * Generate content from a multimodal input (text + images)
   * @param messages Messages array containing text and image_url objects
   * @param options Additional options for the request
   */
  async generateMultiModalContent(
    messages: Array<{
      role: string, 
      content: string | Array<{
        type?: string, 
        text?: string, 
        image_url?: {
          url: string
        }
      }>
    }>,
    options: {
      model?: string,
      temperature?: number,
      max_tokens?: number,
      top_p?: number,
      frequency_penalty?: number,
      presence_penalty?: number,
      [key: string]: any
    } = {}
  ): Promise<Response> {
    if (!this.isEnabled()) {
      throw new Error('Cloud service is not enabled or properly configured');
    }
    
    try {
      
      // For multimodal content, we must use the model that supports it
      const modelToUse = this.getMultiModalModel();
      console.log(`[CloudService] 使用多模态模型: ${modelToUse}`);
      
      // Standardize messages for multimodal content
      const standardizedMessages = messages.map(msg => {
        const role = msg.role === 'model' ? 'model' : msg.role;
        
        // If content is already a string, convert it to the array format
        if (typeof msg.content === 'string') {
          return {
            role,
            content: [
              {
                type: 'text',
                text: msg.content
              }
            ]
          };
        }
        
        // If content is an array, make sure all image_url entries are properly formatted
        if (Array.isArray(msg.content)) {
          // Check all image_url entries to ensure they have correct formatting
          const checkedContent = msg.content.map(part => {
            if (part.type === 'image_url' && part.image_url) {
              // Ensure the URL is properly formatted
              // It must be either a valid http(s) URL or a data URL
              const url = part.image_url.url;
              
              // Check if it's a data URL with proper format
              if (typeof url === 'string' && url.startsWith('data:')) {
                // Make sure it has the correct format: data:image/jpeg;base64,BASE64DATA
                if (!url.match(/^data:[^;]+;base64,/)) {
                  console.warn('[CloudService] 图片URL格式不正确，应为 "data:image/jpeg;base64,DATA"');
                }
                
                return part; // Keep the data URL as is
              } 
              // If it's an HTTP URL, keep it as is
              else if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
                return part;
              } 
              // For any other format, try to convert to a default format
              else {
                console.warn('[CloudService] 图片URL格式不正确，尝试转换...');
                return {
                  type: 'image_url',
                  image_url: {
                    url: typeof url === 'string' ? url : 'data:image/jpeg;base64,'
                  }
                };
              }
            }
            
            // Return other part types unchanged
            return part;
          });
          
          return {
            role,
            content: checkedContent
          };
        }
        
        // Fallback for unexpected content
        return {
          role,
          content: [
            {
              type: 'text',
              text: String(msg.content || '')
            }
          ]
        };
      });
      
      // Debug: Log standardized messages (truncate any base64 image data for brevity)
      const logSafeMessages = JSON.parse(JSON.stringify(standardizedMessages));
      logSafeMessages.forEach((msg: any) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part: any) => {
            if (part.type === 'image_url' && part.image_url?.url) {
              // Check if it's a data URL
              if (typeof part.image_url.url === 'string' && part.image_url.url.startsWith('data:')) {
                // Extract MIME type for logging
                const mimeMatch = part.image_url.url.match(/^data:([^;]+);/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'unknown';
                
                // Truncate the base64 data for logging
                part.image_url.url = `data:${mimeType};base64,[${part.image_url.url.length} bytes]`;
              }
            }
          });
        }
      });
      
      console.log('[CloudService] 多模态请求消息格式:', JSON.stringify(logSafeMessages, null, 2));
      
      // Count text and image parts for logging
      let textPartsCount = 0;
      let imagePartsCount = 0;
      standardizedMessages.forEach(msg => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            if (part.type === 'text') textPartsCount++;
            if (part.type === 'image_url') imagePartsCount++;
          });
        }
      });
      
      console.log(`[CloudService] 多模态请求包含 ${textPartsCount} 个文本部分和 ${imagePartsCount} 个图像部分`);
      
      // Construct the request body for multimodal content
      const requestBody = {
        license_key: this.licenseKey,
        device_id: this.deviceId,
        model: modelToUse,
        messages: standardizedMessages,
        max_tokens: options.max_tokens || 800,
        temperature: options.temperature || 0.7,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        presence_penalty: options.presence_penalty
      };
      
      console.log(`[CloudService] 多模态请求参数: temperature=${requestBody.temperature}, max_tokens=${requestBody.max_tokens}`);
      console.log(`[CloudService] 许可证密钥: ${this.licenseKey?.substring(0, 4)}****`);
      console.log(`[CloudService] 设备ID: ${this.deviceId?.substring(0, 4)}****`);
      
      // Prepare headers
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });
      
      // Add user agent information
      headers.set('User-Agent', 'Client/1.0');
      
      // Add referrer if available
      if (typeof window !== 'undefined' && window.location?.origin) {
        headers.set('Referer', window.location.origin);
      }
      
      // Prepare the request options
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        cache: 'no-store'
      };
      
      // Use the multimodal API endpoint
      const endpoint = this.cloudEndpoint.trim().replace(/\/+$/, '');
      const apiUrl = `${endpoint}/api/huggingface/completion`;
      
      console.log(`[CloudService] 发送多模态请求到: ${apiUrl}`);
      
      // Record start time for performance measurement
      const startTime = Date.now();
      
      // Make the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout (longer for multimodal)
      
      const response = await fetch(apiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Calculate request duration
      const duration = Date.now() - startTime;
      console.log(`[CloudService] 多模态请求完成，耗时: ${duration}ms, 状态码: ${response.status}`);
      
      // Handle errors
      if (!response.ok) {
        let errorMessage = `多模态请求失败: ${response.status} ${response.statusText}`;
        
        try {
          // Try to parse error response
          const errorData = await response.clone().json();
          errorMessage = errorData.error?.message || errorMessage;
          console.error('[CloudService] 多模态响应错误:', errorData);
        } catch (e) {
          // If cannot parse as JSON, try to get text
          try {
            const errorText = await response.clone().text();
            console.error('[CloudService] 多模态响应错误文本:', errorText);
            errorMessage = errorText || errorMessage;
          } catch {
            // Keep default error message
          }
        }
        
        console.error('[CloudService] 多模态请求失败:', errorMessage);
        throw new Error(errorMessage);
      }
      
      // If response is successful, return it
      return response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error('[CloudService] 多模态请求超时');
          throw new Error('多模态请求超时，请检查网络连接或稍后重试');
        }
        
        // Network errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          console.error('[CloudService] 网络错误:', error);
          throw new Error('网络连接失败，请检查您的互联网连接');
        }
      }
      
      console.error('[CloudService] 多模态请求失败:', error);
      throw error;
    }
  }
  
  /**
   * Generate a chat completion 
   * @param messages The messages array
   * @param options Additional options for the request
   */
  async generateChatCompletion(
    messages: Array<{role: string, content: string | Array<{type?: string, text?: string, image_url?: string}>}>,
    options: {
      model?: string,
      temperature?: number,
      max_tokens?: number,
      top_p?: number,
      frequency_penalty?: number,
      presence_penalty?: number,
      [key: string]: any
    } = {}
  ): Promise<Response> {
    if (!this.isEnabled()) {
      throw new Error('Cloud service is not enabled or properly configured');
    }
    
    try {

      // Use provided model or fall back to preferred model, with validation
      const providedModel = options.model || this.preferredModel;
      const modelToUse = this.validateModel(providedModel);
      
      // Log if model was changed due to validation
      if (modelToUse !== providedModel) {
        console.warn(`[CloudService] 模型已从 "${providedModel}" 更改为 "${modelToUse}"`);
      }
      
      // Standardize the message format 
      const standardizedMessages = messages.map(msg => {
        // Map 'assistant' role to 'model' role for Hugging Face compatibility
        const role = msg.role === 'model' ? 'model' : msg.role;
        
        // If content is already a string, return as is
        if (typeof msg.content === 'string') {
          return { role, content: msg.content };
        }
        
        // If content is an array, convert to string
        if (Array.isArray(msg.content)) {
          const textContent = msg.content
            .filter(part => part.text || (part.type === 'text'))
            .map(part => part.text || '')
            .join(' ');
          
          return { role, content: textContent || '(No text content)' };
        }
        
        // Fallback
        return { role, content: String(msg.content || '') };
      });
      
      // Debug: Log original messages
      console.log('[CloudService] 原始消息:', JSON.stringify(messages, null, 2));
      
      // Debug: Log standardized messages
      console.log('[CloudService] 标准化消息:', JSON.stringify(standardizedMessages, null, 2));
      
      // Construct the request body
      const requestBody = {
        license_key: this.licenseKey,
        device_id: this.deviceId,
        model: modelToUse,  // Use the validated model
        messages: standardizedMessages,
        max_tokens: options.max_tokens || 800,
        temperature: options.temperature || 0.7,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        presence_penalty: options.presence_penalty
      };
      
      // Debug: Log the complete request body
      console.log('[CloudService] 完整请求体:', JSON.stringify(requestBody, null, 2));
      
      console.log(`[CloudService] 请求模型: ${requestBody.model}`);
      console.log(`[CloudService] 参数设置: temperature=${requestBody.temperature}, max_tokens=${requestBody.max_tokens}`);
      
      // Prepare headers for cloud service
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });
      
      // Add user agent information
      headers.set('User-Agent', 'Client/1.0');
      
      // Add referrer if available
      if (typeof window !== 'undefined' && window.location?.origin) {
        headers.set('Referer', window.location.origin);
      }
      
      // Prepare the request options
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        cache: 'no-store' // Ensure we always get a fresh response
      };
      
      // Use the correct endpoint URL for Hugging Face API
      const endpoint = this.cloudEndpoint.trim().replace(/\/+$/, '');
      const apiUrl = `${endpoint}/api/huggingface/completion`;
      
      console.log(`[CloudService] 发送请求到: ${apiUrl}`);
      
      // Record start time for performance measurement
      const startTime = Date.now();
      
      // Make the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const response = await fetch(apiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Record end time and calculate duration
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`[CloudService] 请求完成，耗时: ${duration}ms, 状态码: ${response.status}`);
      
      // Check for license validation errors
      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text();
        console.error(`[CloudService] 许可证验证失败: ${errorText}`);
        throw new Error('许可证验证失败，请检查激活码是否有效');
      }
      
      // Check for other errors
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CloudService] 请求失败 (${response.status}): ${errorText}`);
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error('[CloudService] 请求超时');
          throw new Error('请求超时，请检查网络连接或稍后重试');
        }
        
        // Network errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          console.error('[CloudService] 网络错误:', error);
          throw new Error('网络连接失败，请检查您的互联网连接');
        }
      }
      
      console.error('[CloudService] 请求失败:', error);
      throw error;
    }
  }

  // 静态方法：外部可直接调用
  static async generateChatCompletionStatic(
    messages: Array<{role: string, content: string | Array<{type?: string, text?: string, image_url?: string}>}>,
    options: {
      model?: string,
      temperature?: number,
      max_tokens?: number,
      top_p?: number,
      frequency_penalty?: number,
      presence_penalty?: number,
      [key: string]: any
    } = {}
  ): Promise<Response> {
    // 单例实例
    return CloudServiceProvider.generateChatCompletion(messages, options);
  }

  /**
   * Generate search result using cloud service (for tool call search).
   * @param query The search query string
   * @param options Optional: model, temperature, max_tokens, etc.
   * @returns Response from cloud service (should contain search result text)
   */
  async generateSearchResult(
    query: string,
    options: {
      model?: string,
      temperature?: number,
      max_tokens?: number,
      [key: string]: any
    } = {}
  ): Promise<Response> {
    if (!this.isEnabled()) {
      throw new Error('Cloud service is not enabled or properly configured');
    }

    try {
      const modelToUse = (options.model || this.getMultiModalModel()) + '-search';
      const requestBody = {
        license_key: this.licenseKey,
        device_id: this.deviceId,
        model: modelToUse,
        messages: [
          {
            role: 'user',
            content: `请帮我搜索以下问题的解答，只返回搜索结果和解答，不要有其他解释：\n\n${query}`
          }
        ],
        max_tokens: options.max_tokens || 1024,
        temperature: options.temperature || 0.7
      };

      const headers = new Headers({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });
      headers.set('User-Agent', 'Client/1.0');
      if (typeof window !== 'undefined' && window.location?.origin) {
        headers.set('Referer', window.location.origin);
      }

      const endpoint = this.cloudEndpoint.trim().replace(/\/+$/, '');
      const apiUrl = `${endpoint}/api/huggingface/completion`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      return response;
    } catch (error) {
      console.error('[CloudService] generateSearchResult error:', error);
      throw error;
    }
  }

  /**
   * Use Hugging Face API via cloud service instead of forwarding requests
   * @param messages The messages array to send to the model
   * @param options Options for the request
   */
  async useHuggingFaceModel(
    messages: Array<{role: string, content: string}>,
    options: {
      model?: string,
      temperature?: number,
      max_tokens?: number,
      [key: string]: any
    } = {}
  ): Promise<Response> {
    if (!this.isEnabled()) {
      throw new Error('Cloud service is not enabled or properly configured');
    }
    
    try {
      console.log('[CloudService] 开始通过HuggingFace API发送请求');
      
      // Use provided model or fall back to preferred model, with validation
      const providedModel = options.model || this.preferredModel;
      const modelToUse = this.validateModel(providedModel);
      
      // Log if model was changed due to validation
      if (modelToUse !== providedModel) {
        console.warn(`[CloudService] 模型已从 "${providedModel}" 更改为 "${modelToUse}"`);
      }
      
      // Map roles for Hugging Face API compatibility
      // Let's leave the role as is - server will handle the conversion
      const mappedMessages = messages.map(msg => ({
        role: msg.role,  // Keep the role as is - server will handle conversion
        content: typeof msg.content === 'string' ? msg.content : String(msg.content)
      }));
      
      // Debug: Log the original messages
      console.log('[CloudService] 原始消息:', JSON.stringify(messages, null, 2));
      
      // Debug: Log the mapped messages
      console.log('[CloudService] 映射后消息:', JSON.stringify(mappedMessages, null, 2));
      
      // Construct the request body for Hugging Face API
      const requestBody = {
        license_key: this.licenseKey,
        device_id: this.deviceId,
        model: modelToUse,  // Use the validated model
        messages: mappedMessages,
        max_tokens: options.max_tokens || 800,
        temperature: options.temperature || 0.7
      };
      
      
      // Prepare headers
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });
      
      // Add user agent information
      headers.set('User-Agent', 'Client/1.0');
      
      // Prepare the request options
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        cache: 'no-store'
      };
      
      // Use the Hugging Face API endpoint
      const endpoint = this.cloudEndpoint.trim().replace(/\/+$/, '');
      const apiUrl = `${endpoint}/api/huggingface/completion`;
      
      console.log(`[CloudService] 发送HuggingFace请求到: ${apiUrl}`);
      
      // Record start time
      const startTime = Date.now();
      
      // Make the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const response = await fetch(apiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Calculate request duration
      const duration = Date.now() - startTime;
      console.log(`[CloudService] HuggingFace请求完成，耗时: ${duration}ms, 状态码: ${response.status}`);
      
      // Handle errors
      if (!response.ok) {
        let errorMessage = `HuggingFace请求失败: ${response.status} ${response.statusText}`;
        let errorData = null;
        
        try {
          // Try to parse error response as JSON
          errorData = await response.clone().json();
          console.error('[CloudService] 响应错误详情:', JSON.stringify(errorData, null, 2));
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          // If cannot parse as JSON, try to get text
          try {
            const errorText = await response.clone().text();
            console.error('[CloudService] 响应错误文本:', errorText);
            errorMessage = errorText || errorMessage;
          } catch (e2) {
            // If text extraction fails, keep the default error message
          }
        }
        
        console.error('[CloudService] HuggingFace请求失败:', errorMessage);
        throw new Error(errorMessage);
      }
      
      return response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error('[CloudService] HuggingFace请求超时');
          throw new Error('请求超时，请检查网络连接或稍后重试');
        }
        
        // Network errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          console.error('[CloudService] 网络错误:', error);
          throw new Error('网络连接失败，请检查您的互联网连接');
        }
      }
      
      console.error('[CloudService] HuggingFace请求失败:', error);
      throw error;
    }
  }
  
  /**
   * Forward a request through the cloud service - DEPRECATED, use useHuggingFaceModel instead
   * @deprecated Use useHuggingFaceModel for better integration
   */
  async forwardRequest(
    originalUrl: string,
    options: RequestInit,
    apiType: 'gemini' | 'openai' | 'openrouter' | 'zhipu' = 'openai'
  ): Promise<Response> {
    console.warn('[CloudService] forwardRequest方法已弃用，请使用useHuggingFaceModel替代');
    
    // For backward compatibility, try to use the useHuggingFaceModel method if possible
    if (apiType === 'gemini' || apiType === 'openai' || apiType === 'openrouter') {
      try {
        // Try to extract messages and options from the request
        const body = options.body ? JSON.parse(options.body as string) : {};
        
        if (body.messages && Array.isArray(body.messages)) {
          console.log('[CloudService] 尝试将forwardRequest转换为useHuggingFaceModel调用');
          
          // Extract options
          const conversionOptions = {
            model: body.model || this.preferredModel,
            temperature: body.temperature || 0.7,
            max_tokens: body.max_tokens || 800
          };
          
          // Use the new method
          return await this.useHuggingFaceModel(body.messages, conversionOptions);
        }
      } catch (e) {
        console.error('[CloudService] 无法转换为useHuggingFaceModel调用:', e);
        // Continue with legacy implementation
      }
    }
    
    // Legacy implementation
    if (!this.isEnabled()) {
      throw new Error('Cloud service is not enabled or properly configured');
    }
    
    throw new Error('Legacy request forwarding is no longer supported');
  }
  
  /**
   * Get cloud service status information
   */
  getStatus(): { 
    enabled: boolean; 
    licenseInfo?: { key: string; device: string };
    model?: string;
  } {
    if (!this.isEnabled()) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      licenseInfo: {
        key: this.licenseKey!.substring(0, 4) + '****',
        device: this.deviceId!.substring(0, 4) + '****'
      },
      model: this.preferredModel
    };
  }
}

// Export a singleton instance
export const CloudServiceProvider = new CloudServiceProviderClass();

export default CloudServiceProviderClass;
