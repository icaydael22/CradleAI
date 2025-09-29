/**
 * API Types
 * 
 * Type definitions for API responses and requests
 */

export interface OpenRouterSettings {
    enabled: boolean;          // 是否启用 OpenRouter
    apiKey: string ;            // OpenRouter API Key
    model: string;             // 当前选择的模型 ID
    autoRoute?: boolean;        // 是否启用自动路由
    useBackupModels?: boolean;  // 在主模型不可用时使用备用模型
    backupModels?: string[];    // 备用模型列表
    sortingStrategy?: 'price' | 'speed' | 'latency';  // 排序策略
    dataCollection?: boolean;   // 是否允许数据收集
    ignoredProviders?: string[]; // 忽略的提供商列表
    quantizationLevel?: string;  // 量化级别 (可选)
}

export interface OpenRouterModel {
    id: string;               // 模型的唯一标识符
    name: string;             // 模型的显示名称
    description?: string;     // 模型描述 (可选)
    context_length?: number;  // 模型的上下文长度 (可选)
    pricing?: {               // 价格信息 (可选)
        prompt?: number;      // 每 1K tokens 的输入价格
        completion?: number;  // 每 1K tokens 的输出价格
        image?: number;       // 图像生成价格 (可选)
        request?: number;     // 请求价格 (可选)
        input_cache_read?: number; // 输入缓存读取价格 (可选)
        input_cache_write?: number; // 输入缓存写入价格 (可选)
        web_search?: number;  // 网页搜索价格 (可选)
        internal_reasoning?: number; // 内部推理价格 (可选)
    };
    provider?: {              // 提供商信息 (可选)
        id?: string;          // 提供商 ID
        name?: string;        // 提供商名称
    };
    created?: number;         // 模型创建时间戳
    architecture?: {          // 模型架构信息
        input_modalities?: string[]; // 输入模态
        output_modalities?: string[]; // 输出模态
        tokenizer?: string;   // 分词器
    };
    top_provider?: {          // 顶级提供商信息
        is_moderated?: boolean; // 是否经过内容审核
    };
    per_request_limits?: Record<string, any>; // 请求限制参数
}

// NovelAI 设置
export interface NovelAISettings {
    enabled: boolean;          // 是否启用 NovelAI
    token: string;             // NovelAI Token
    model: string;             // 当前选择的模型
    sampler: string;           // 采样器
    steps: number;             // 步数
    scale: number;             // 提示词相关性
    noiseSchedule?: string;    // 噪声调度方式
}

// OpenAI compatible API settings
export interface OpenAICompatibleSettings {
    enabled: boolean;          // 是否启用 OpenAI 兼容 API
    apiKey: string;            // API Key
    model: string;             // 当前选择的模型
    endpoint: string;          // API 端点 URL
    orgId?: string;            // 组织 ID (可选)
    useSystemRole?: boolean;   // 是否使用系统角色
    contextWindow?: number;    // 上下文窗口大小 (可选)
    maxTokens?: number;        // 最大生成的标记数 (可选)
}

export interface ApiSettings {
    apiProvider: 'gemini' | 'openrouter' | 'openai-compatible';  // 当前选择的API提供商
    openrouter?: OpenRouterSettings;       // OpenRouter设置
    OpenAIcompatible?: OpenAICompatibleSettings; // OpenAI兼容API设置
    useCloudService?: boolean;             // 是否使用云服务
    cloudModel?: string;                   // 云服务使用的模型
    additionalGeminiKeys?: string[];
    useGeminiModelLoadBalancing?: boolean;
    useGeminiKeyRotation?: boolean;
    novelai?: NovelAISettings;             // NovelAI 设置
}

// OpenRouter API 请求
export interface OpenRouterRequest {
    model: string;           // 模型 ID
    messages: Array<{        // 消息数组
        role: "user" | "assistant" | "system";  // 消息角色
        content: string | Array<{  // 消息内容 (文本或多模态)
            type?: string;        // 内容类型 (text、image等)
            text?: string;        // 文本内容
            image_url?: string;   // 图像URL
        }>;       
    }>;
    temperature?: number;    // 温度（控制随机性）
    max_tokens?: number;     // 最大生成的标记数
    top_p?: number;          // Top P 采样
    top_k?: number;          // Top K 采样
    stream?: boolean;        // 是否启用流式响应
    stop?: string[];         // 停止序列
    frequency_penalty?: number; // 频率惩罚
    presence_penalty?: number;  // 存在惩罚
}

// 支持的图像尺寸预设
export interface ImageSizePreset {
    name: string;           // 预设名称
    width: number;          // 宽度
    height: number;         // 高度
    supportedProviders: string[];  // 支持该尺寸的提供商
}

// OpenRouter API 响应
export interface OpenRouterResponse {
    id: string;              // 回复 ID
    choices: Array<{         // 选择数组
        message: {
            role: "assistant";   // 角色
            content: string;     // 生成的内容
        };
        finish_reason: string; // 完成原因
        index: number;        // 索引
    }>;
    usage?: {                // 使用情况
        prompt_tokens: number; // 输入标记数
        completion_tokens: number; // 输出标记数
        total_tokens: number;  // 总标记数
    };
    model: string;           // 实际使用的模型
    created?: number;        // 创建时间戳
    object?: string;         // 对象类型
    cached?: boolean;        // 是否使用了缓存
}

// OpenRouter 流式响应中的 Delta 对象
export interface OpenRouterDelta {
    role?: string;
    content?: string;
}

// OpenRouter 错误响应
export interface OpenRouterError {
    error: {
        message: string;
        type?: string;
        param?: string;
        code?: string;
    };
}

// OpenRouter 模型列表响应
export interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}

// OpenAI Compatible API Request
export interface OpenAICompatibleRequest {
    model: string;
    messages: Array<{
        role: "user" | "assistant" | "system";
        content: string | Array<{
            type?: string;
            text?: string;
            image_url?: {
                url: string;
            };
        }>;
    }>;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stream?: boolean;
    stop?: string[];
}

// OpenAI Compatible API Response
export interface OpenAICompatibleResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// CloudService 配置
export interface CloudServiceConfig {
    enabled: boolean;
    licenseKey: string;
    deviceId: string;
    preferredModel?: string;
}

// CloudService API 请求
export interface CloudServiceRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string | Array<{
            type?: string;
            text?: string;
            image_url?: string;
        }>;
    }>;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    [key: string]: any;
}

// CloudService API 响应
export interface CloudServiceResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
