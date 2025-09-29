/**
 * 剧本系统相关类型定义
 */

import { VariableSystemConfig } from '@/services/variables/variable-types';

export interface Script {
  id: string;
  name: string;
  cover?: string;
  selectedCharacters: string[];
  contextMessageCount: Record<string, number>; // characterId -> message count
  baseprompt: string;
  userName?: string; // 用户在剧本中的名称，用于替换{{user}}宏
  createdAt: number;
  updatedAt: number;
  styleConfig?: ScriptStyleConfig; // 样式配置
  variableConfig?: VariableSystemConfig; // 变量配置
  summarizationConfig?: ScriptSummarizationConfig; // 剧本历史总结配置
  expManagerConfig?: ExpManagerConfig; // 体验管理器配置
  webViewUrl?: string; // WebView加载的URL地址（用于URL导入的剧本）
  isFileSystemImport?: boolean; // 是否为文件系统导入的剧本
  description?: string; // 剧本描述
  variables?: any; // 变量配置（兼容旧版本）
  lastRawResponse?: string; // 保存最新的AI原始响应，用于在总结后仍能发送到WebView
  manifest?: Manifest; // 存储从ZIP包解析的 manifest
}

export interface ScriptMessage {
  id: string;
  scriptId: string;
  userInput: string;
  aiResponse: ScriptResponse;
  timestamp: number;
}

// ScriptResponse 现在是完全自由的类型，允许任意字段结构
export interface ScriptResponse {
  [key: string]: any;
}

/**
 * WebView通信消息类型
 */
export interface WebViewMessage {
  type: 'input' | 'send' | 'regenerate' | 'confirm' | 'choice' | 'page' | 'settings' | 'ready';
  data?: any;
}

/**
 * RN -> WebView 消息类型
 */
export interface RNToWebViewMessage {
  type: 
    | 'updateScriptData' 
    | 'appendScriptData' 
    | 'setLoading' 
    | 'navigatePage' 
    | 'fileSystemImportConfig' 
    | 'updateResourceConfig' 
    | 'updateCustomStyles' 
    | 'updateSceneData' 
    | 'requestOutputRequirements' 
    | 'configurationComplete' 
    | 'error'
    | 'initializeIframe' // 初始化 Iframe
    | 'iframeData';      // 向 Iframe 发送数据结果
  data: {
    scriptId?: string;
    title?: string;
    subtitle?: string;
    summary?: string;
    metadata?: Record<string, string>;
    htmlBlocks?: string[]; // AI返回的HTML块数组（推荐）
    fullHtml?: string; // AI返回的完整HTML（备用）
    choices?: ScriptChoice[];
    currentPage?: number;
    totalPages?: number;
    messageIds?: string[]; // 关联的消息ID列表
    loading?: boolean;
    direction?: 'prev' | 'next';
    // 🆕 添加原始响应支持
    rawResponse?: string; // 原始AI响应
    processedResponse?: string; // 变量处理后的响应
    // 🆕 添加存档恢复的原始响应
    archivedRawResponse?: string; // 存档中的原始AI响应
    // 🆕 添加状态管理标识
    saveState?: boolean; // 请求保存状态
    // 🆕 添加Vue端更新标识
    isVueUpdate?: boolean; // 标识这是为Vue端准备的数据
    // 🆕 文件系统导入配置
    variables?: any; // 文件系统导入的变量配置
    config?: any; // 文件系统导入的剧本配置
    customCSS?: string; // 自定义CSS
    parsedTypes?: any; // 解析类型
    initialScene?: string; // 初始场景
    isFileSystemImport?: boolean; // 是否为文件系统导入
    effects?: any; // 视觉特效配置
    // 资源配置相关字段
    characters?: string[]; // 角色列表
    sprites?: Record<string, any>; // 精灵配置
    backgrounds?: Record<string, any>; // 背景配置
    music?: Record<string, any>; // 音乐配置
    sounds?: Record<string, any>; // 音效配置
    // 🆕 添加用户输入字段（用于requestOutputRequirements）
    userInput?: string;
    // 🆕 添加立即请求标识（用于文件导入时立即下载配置）
    immediate?: boolean;
    // 🆕 添加配置完成状态字段
    status?: 'success' | 'error' | 'pending';
    message?: string; // 状态消息
    error?: string; // 错误信息
    // 🆕 iframe 相关字段
    manifest?: Manifest;          // 传递 manifest
    initialVariables?: any;       // 传递 variables.json
    iframeViewUrl?: string;       // 传递 iframe 的 URL
    action?: string;              // 对应的 actionName
    payload?: any;                // 返回的数据
  } | string; // 允许直接传递字符串（用于updateCustomStyles和updateSceneData）
}

/**
 * WebView -> RN 消息类型
 */
export interface WebViewToRNMessage {
  type: 
    | 'ready' 
    | 'choice' 
    | 'requestRegenerate' 
    | 'log' 
    | 'send' 
    | 'confirm' 
    | 'settings' 
    | 'page' 
    | 'summarize' 
    | 'saveState' 
    | 'clearState' 
    | 'sendFileImport'
    | 'iframeAction'; // Iframe 发起的动作
  data: {
    scriptId?: string;
    text?: string;
    id?: string;
    direction?: 'prev' | 'next';
    message?: string;
    openingContent?: string; // 🆕 开局剧情内容
    // 🆕 文件导入相关字段
    outputRequirements?: any; // outputRequirements配置
    // 🆕 iframe 相关字段
    actionName?: string; // 动作名称
    payload?: any;     // 动作附带的数据
    [key: string]: any;
  };
}

/**
 * 分页信息
 */
export interface ScriptPage {
  index: number;
  content: string;
  wordCount: number;
  messageIds: string[]; // 该页包含的消息ID列表
}

/**
 * 剧本渲染数据
 */
export interface ScriptRenderData {
  title: string;
  subtitle: string;
  summary: string;
  metadata: Record<string, string>;
  pages: ScriptPage[];
  currentPage: number;
  totalPages: number;
  choices?: ScriptChoice[];
  isLoading?: boolean;
  // 新增字段用于增量更新
  htmlBlocks?: string[]; // AI返回的HTML块数组
  fullHtml?: string; // AI返回的完整HTML
  messageIds?: string[]; // 关联的消息ID列表
  updateType?: 'full' | 'append'; // 更新类型
  // 角色头像配置
  characterAvatars?: Record<string, string>; // 角色名 -> 头像Data URL的映射
}

/**
 * WebView CSS类名映射（确保模板中的CSS类名有对应的功能）
 */
export interface WebViewCSSClasses {
  // 布局结构
  page: string;
  topbar: string;
  main: string;
  bottomBar: string;
  
  // 内容区域
  articleCard: string;
  titleBlock: string;
  title: string;
  subtitle: string;
  summary: string;
  metaPanel: string;
  content: string;
  
  // 分页相关
  pager: string;
  pages: string;
  pageItem: string;
  
  // 消息相关
  chat: string;
  message: string;
  userMessage: string;
  aiMessage: string;
  messageContent: string;
  
  // 交互元素
  input: string;
  sendButton: string;
  regenerateButton: string;
  confirmButton: string;
  choicesButton: string;
  settingsButton: string;
  
  // 导航元素
  fixedNav: string;
  navButton: string;
  prevButton: string;
  nextButton: string;
  topButton: string;
  
  // 选项菜单
  choicesModal: string;
  choiceItem: string;
  
  // 状态类
  loading: string;
  disabled: string;
  active: string;
}

export interface ScriptChoice {
  id: string;
  text: string;
  description?: string;
}

export interface ScriptEvent {
  id: string;
  name: string;
  content: string;
}

export interface ScriptCharacterInteraction {
  id: string;
  name: string;
  content: string; // 交互内容
  characterIds: string[]; // 涉及角色的characterId
}

export interface ScriptSettings {
  scriptId: string;
  contextMessageCounts: Record<string, number>;
}

/**
 * 剧本样式配置接口
 */
export interface ScriptStyleConfig {
  id: string;
  name: string;
  outputRequirements: string; // 自定义AI输出要求
  webViewHtml?: string; // 自定义WebView HTML/CSS代码（可选，若未提供则使用assets中的默认HTML）
  variablePrompt?: string | OpenAIMessage[]; // 自定义变量提示词，支持字符串或OpenAI消息数组格式
  createdAt: number;
  // 🆕 文件导入标识
  isFileImport?: boolean;
}

/**
 * 剧本样式配置文件格式（用于导入/导出）
 */
export interface ScriptStyleConfigFile {
  name: string;
  description?: string;
  version?: string;
  outputRequirements: string;
  webViewHtml?: string; // 可选：如果不提供，将使用assets中的默认HTML
  htmlAssetPath?: string; // 可选：指向打包内的HTML资源路径
  variablePrompt?: string | OpenAIMessage[]; // 自定义变量提示词，支持字符串或OpenAI消息数组格式
}

/**
 * OpenAI兼容的消息格式
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 压缩包样式配置格式
 */
export interface ScriptStyleConfigArchive {
  name: string;
  description?: string;
  version?: string;
  outputRequirements: string;
  webViewHtml?: string; // 内嵌的HTML内容
  htmlFileName?: string; // 压缩包中的HTML文件名
  configFileName?: string; // 压缩包中的配置文件名称
}

/**
 * 压缩包文件结构
 */
export interface ScriptStyleConfigArchiveStructure {
  configFile: ScriptStyleConfigFile;
  htmlFile?: string; // HTML文件内容
  otherFiles?: Record<string, string>; // 其他文件（文件名 -> 内容）
}

/**
 * 剧本历史总结配置
 */
export interface ScriptSummarizationConfig {
  enabled: boolean; // 是否启用自动总结
  summaryThreshold: number; // 字符数阈值，超过后触发总结
  summaryLength: number; // 总结的目标长度（字符数）
  summaryRangePercent?: { start: number; end: number } | null; // 总结范围百分比
  lastSummarizedAt?: number; // 最后一次总结的时间戳
}

/**
 * 体验管理器配置
 */
export interface ExpManagerConfig {
  enabled: boolean; // 是否启用体验管理器，默认 false
  intervalHistoryCount: number; // 每产生多少条历史消息后触发一次体验管理器，默认 3
  lastRunAt?: number; // 上次运行时间戳
  lastProcessedHistoryIndex?: number; // 上次处理的历史消息索引
}

/**
 * 剧本总结条目
 */
export interface ScriptSummary {
  id: string; // 总结唯一标识符
  scriptId: string; // 所属剧本ID
  type: 'incremental' | 'meta'; // 总结类型：增量总结或元总结
  content: string; // 总结内容
  originalMessagesCount: number; // 原始消息数量
  originalMessageIds: string[]; // 被总结的原始消息ID列表
  createdAt: number; // 总结创建时间
  updatedAt?: number; // 总结更新时间（如果被编辑过）
  isEdited?: boolean; // 是否被手动编辑过
}

/**
 * 总结管理操作结果
 */
export interface SummaryOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

// ========================================
// Iframe 混合协议相关类型定义
// ========================================

/**
 * Iframe Action 定义
 */
export type IframeAction = AIAction | VariableAction;

export interface AIAction {
  actionName: string;
  type: 'ai';
  prompt: string;
  responseSchema?: any;
}

export interface VariableAction {
  actionName: string;
  type: 'variable';
  query: {
    target: 'global' | string; // 'global' or characterId
    path: string;
  };
}

/**
 * Manifest 定义
 */
export interface Manifest {
  manifestVersion: string;
  iframeViewUrl: string;
  actions: IframeAction[];
}
