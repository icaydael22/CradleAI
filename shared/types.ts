import { CharacterMetadata } from '../shared/types/circle-types';
import { RelationshipMapData, } from '../shared/types/relationship-types';
import { RelationshipAction } from '@/services/action-service';
import { CradleAnimation } from '@/constants/types';
import { OpenRouterSettings } from '@/shared/types/api-types';
import { MessageBoxItem } from '@/shared/types/relationship-types';
import { VNDBCharacter } from '@/src/services/vndb/types';
import { ViewStyle } from 'react-native';
// ============= 基础类型 =============

export interface User {
    id: string;
    avatar?: string;
    name?: string;
    settings?: GlobalSettings;
    coverImage? : string | null;
}

export type TTSProvider = 'cosyvoice' | 'doubao' | 'minimax';

export interface TTSSettings {
  enabled: boolean;
  appid?: string;
  token?: string;
  voiceType?: string;
  encoding?: 'wav' | 'pcm' | 'ogg_opus' | 'mp3';
  speedRatio?: number;
  transport?: 'stream' | 'http'; // 新增
  provider?: TTSProvider; // 统一使用 TTSProvider 类型
  minimaxApiToken?: string; // Minimax TTS API token
  minimaxModel?: string; // Minimax TTS model ID
  // 合并 MinimaxTTSInput 字段
  minimaxEmotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'fear' | 'disgust' | 'surprise';
  minimaxVoiceId?: string;
  minimaxLanguageBoost?: string;
  minimaxEnglishNormalization?: boolean;
  cosyvoiceServerUrl?: string; // CosyVoice server URL
  useRealtimeUpdates?: boolean; // 是否使用实时更新
}

export interface GlobalSettings {
    self: {
        nickname: string;
        gender: 'male' | 'female' | 'other';
        description: string;
    };
    chat: ChatSettings;
    app?: {
        darkMode?: boolean;
        autoSave?: boolean;
        notifications?: {
          enabled?: boolean;
        };
    };
    search?: {
        braveSearchApiKey?: string;
        braveSearchEnabled?: boolean;
        braveSearchUsageCount?: number;
        braveSearchLastReset?: number;
    };
    license: {
      enabled: boolean;
      licenseKey?: string;
      deviceId?: string;
      planId?: string;
      expiryDate?: string;
      isValid?: boolean;
    }
    tts?: TTSSettings;
}

// Add new types for API forwarding functionality
export interface CloudServiceConfig {
    enabled: boolean;
    licenseKey?: string;
    deviceId?: string;
    preferredModel?: string; // Add preferred model
}

export interface ApiForwardingOptions {
    useCloud: boolean;
    provider: 'gemini' | 'openrouter';
    endpoint: string;
    headers: Record<string, string>;
}

// Stream message callbacks for streaming API responses
export interface StreamCallbacks {
  onData: (chunk: string) => void;
  onError: (error: any) => void;
  onComplete: () => void;
  // onStart?: () => void;
}

// ============= NodeST 核心类型 =============

export interface RoleCardJson {
    name: string;
    first_mes: string;
    description: string;
    personality: string;
    scenario: string;
    mes_example: string;
    background?: string;
    data?: {
        extensions?: {
            regex_scripts?: RegexScript[]; 
        };
    };
}

export interface RegexScript {
    scriptName: string;
    findRegex: string;
    replaceString: string;
    flags?: string;
}

export interface WorldBookJson {
    entries: {
        [key: string]: WorldBookEntry;
    };
}

export interface WorldBookEntry {
    comment: string;
    content: string;
    disable: boolean;
    position: 0 | 1 | 2 | 3 | 4;
    key?: string[];
    constant: boolean;
    order: number;
    depth: number;
    vectorized?: boolean;
}

export interface PresetJson {
    prompts: Array<{
        name: string;
        content: string;
        enable: boolean;
        identifier: string;
        injection_position?: 0 | 1;
        injection_depth?: number;
        role: "user" | "model" | "assistant";
    }>;
    prompt_order: PromptOrder[];
}

export interface PromptOrder {
    order: Array<{
        identifier: string;
        enabled: boolean;
    }>;
}

export interface AuthorNoteJson {
    charname: string;
    username: string;
    content: string;
    role?: string;
    injection_depth: number;
}

// ============= 全局预设/世界书类型 =============

export interface GlobalPresetConfig {
  enabled: boolean; // 是否启用全局预设
  presetJson: PresetJson | null; // 全局预设内容
}

export type GlobalWorldbookPriority = '全局优先' | '角色优先';

export interface GlobalWorldbookConfig {
  enabled: boolean; // 是否启用全局世界书
  priority: GlobalWorldbookPriority; // 插入优先级
  worldbookJson: WorldBookJson | null; // 全局世界书内容
}

// ============= 聊天消息类型 =============

export interface MessagePart {
    text?: string;
    role?: string;
    injection_depth?: number;
    position?: number;
    parts?: MessagePart[]; // 递归结构，消息是否包含子消息
    is_d_entry?: boolean; // 是否是世界书条目
    inlineData?: string; // 内联数据
    fileData?: string; // 文件数据
    mimiType?: string; // MIME类型
    
}

export interface ChatMessage {
    id?: string;
    messageIndex?: number;
    rating?: number;
    role: string;
    parts: MessagePart[]  ;
    content?: string; // 直接内容
    is_first_mes?: boolean;
    is_author_note?: boolean;
    is_d_entry?: boolean;
    name?: string;
    identifier?: string;
    injection_position?: number;
    injection_depth?: number;
    constant?: boolean;
    key?: string[];
    position?: number;
    insertion_order?: number;
    timestamp?: number; 
    is_chat_history_placeholder ?: boolean;
    characterId?: string; // 角色ID
    isMemorySummary?: boolean; // 是否为记忆摘要
}

export interface SidebarItemProps {
    id: string;
    title: string;
    avatar: string;
    description: string;
  }

// ============= 角色类型 =============

// Add this new interface for custom user settings
export interface UserCustomSetting {
  comment: string;      // "自设" title, default is "自设"
  content: string;      // "自设" content
  disable: boolean;     // Whether disabled, default is false
  position: 0 | 1 | 2 | 3 | 4;  // Position to insert, user-selectable
  constant: boolean;    // Whether constant, default is true
  key: string[];        // Keywords, default is empty array
  order: number;        // Sort order, default is 1
  depth: number;        // Depth, user-selectable
  vectorized: boolean;  // Whether vectorized, default is false
  global: boolean;      // Whether this setting is global (applies to all characters)
}

// 新增：角色背景图片配置类型（用于后处理）
export interface CharacterBackgroundImageConfig {
  positiveTags: string[];
  negativeTags: string[];
  artistPrompt: string | null;
  customPrompt: string;
  useCustomPrompt: boolean;
  characterTags: string[];
  seed: number | string | null;
  novelaiSettings?: any;
  animagine4Settings?: any;
  fixedTags?: string[];
  genderTags?: string[];
  qualityTags?: string[];
  sizePreset?: { width: number; height: number };
  isNovelAI?: boolean; // 标记是否为NovelAI生成
}

export interface Character {
  id: string;
  name: string;
  avatar: string | null;
  extraGreetings?: string[]; // 新增：额外问候语
  // 修改：backgroundImage 可为 string 或 CharacterImage
  backgroundImage: string | CharacterImage | null;
  // 新增：背景图片配置（用于后处理）
  backgroundImageConfig?: CharacterBackgroundImageConfig;
  description: string;
  personality: string;
  interests: string[];
  voiceType?: string; // Template ID for TTS
  createdAt: number;
  updatedAt: number;
  isSystem?: boolean;
  isArchived?: boolean;
  metadata?: CharacterMetadata;
  age?: string;
  gender?: string;
  imageHistory?: CharacterImage[];
  
  // Add unified cradle fields directly to Character
  inCradleSystem?: boolean; // Whether this character is in the cradle system
  cradleStatus?: 'growing' | 'mature' | 'ready'; // The status of the character in the cradle
  cradleCreatedAt?: number; // When the character was added to cradle
  cradleUpdatedAt?: number; // Last time cradle status was updated
  cradleProgress?: number; // Progress percentage (0-100)
  feedHistory?: Feed[]; // History of feeds to this character
  imageGenerationTaskId?: string | null; // Reference to image generation task
  imageGenerationStatus?: 'idle' | 'pending' | 'success' | 'error'; 
  imageGenerationError?: string | null;
  localBackgroundImage?: string | null;  // Local filesystem image URI
  generatedCharacterId?: string;
  isCradleGenerated?: boolean;
  cradleCharacterId?: string; // Reference to a Cradle character if this character was generated from one
  favoritedPosts?: string[];
  // Custom user name that the character will use to address the user
  customUserName?: string;
  
  // New properties for dynamic portrait video
  dynamicPortraitVideo?: string | null; // Path to video file (local or remote)
  dynamicPortraitEnabled?: boolean; // Whether to use dynamic portrait video
  
  // Circle-related fields (existing)
  conversationId?: string;
  jsonData?: string;
  circlePosts?: any[];
  memX?: number;
  autoMessage?: boolean; // Whether character can send auto-messages
  autoMessageInterval?: number; // Time in minutes before triggering auto-message
  autoImageEnabled?: boolean; // Whether to generate images automatically
  customImageEnabled?: boolean; // Whether to use custom image generation
  notificationEnabled?: boolean; // Whether to show notifications for this character
  circleInteraction?: boolean;
  circlePostFrequency?: 'low' | 'medium' | 'high';
  circleInteractionFrequency?: 'low' | 'medium' | 'high'; // Controls auto-message timing
  circleScheduledTimes?: string[]; // Array of scheduled post times in format "HH:MM"
  circleLastProcessedTimes?: Record<string, string>; // Record of last processed times by timeString
  circleStats?: {
    repliedToCharacters: Record<string, number>;
    repliedToPostsCount: number;
    repliedToCommentsCount: Record<string, number>;
  };
  messages?: Array<{
    sender: string;
    text: string;
    metadata?: {
      targetId?: string;
    };
  }>;
  generationData?: {
    appearanceTags?: { positive: string[]; negative: string[];artistPrompt?: string;characterTags?: string[]   };
    traits?: string[];
    vndbResults?: any;
    description?: string;
    userGender?: string
  };
  initialSettings?: {
    userGender?: 'male' | 'female' | 'other';
    characterGender?: 'male' | 'female' | 'other';
    axis?: {
      [key: string]: {
        x: number;
        y: number;
        xLabel?: string;
        yLabel?: string;
      }
    };
    sliders?: {
      [key: string]: number;
    };
    reference?: string;
    description?: string;
    traits?: any;
    characterAge?: string;
    selectedTraits?: string[];
  };
  // Relationship system fields
  relationshipMap?: RelationshipMapData;
  messageBox?: MessageBoxItem[];
  relationshipEnabled?: boolean;
  relationshipActions?: RelationshipAction[];

  // Add diary settings
  diarySettings?: DiarySettings;
  diaryEntries?: DiaryEntry[];

  // Add custom user settings related properties
  hasCustomUserSetting?: boolean;  // Whether this character uses custom user setting
  customUserSetting?: UserCustomSetting; // Custom user setting for this character

  // 新增：AI后处理生成的额外背景图片
  extrabackgroundimage?: string | null;
  // 新增：自动后处理开关
  enableAutoExtraBackground?: boolean;
  ttsConfig?: TTSConfig; // 新增：TTS配置
}

export interface Message {
    id: string;
    text: string;
    sender: string;
    isLoading?: boolean;
    timestamp?: number;
    rating?: number;
    metadata?: {
        senderId?: string;
        type?: 'relationship_request' | 'invitation' | 'alert' | 'message';
        aiIndex?: number;  // Index in the AI message sequence
        regenerated?: boolean;  // Whether this message was regenerated
        regenerationTime?: number;  // When the message was regenerated
        error?: string;  // Error information if regeneration failed
        [key: string]: any;  
    };
    read?: boolean;
    images?: string [];
}

export interface MessageItemProps {
    message: Message;
    selectedCharacter?: Character;
    user?: User;
}

export interface ChatInputProps {
    onSendMessage: (message: string, sender: 'user' | 'bot', isLoading?: boolean) => void;
    extraHeight?: number;
    selectedConversationId: string | null;
    conversationId?: string;
    onResetConversation?: (newConversationId: string) => void;
    selectedCharacter?: Character | null;
}

// ============= 社交圈功能类型 =============

export interface CirclePost {
    id: string;
    characterId: string;
    characterName: string;
    characterAvatar?: string | null;
    content: string;
    images?: string[];
    createdAt: string;
    comments: CircleComment[];
    likes: number;
    hasLiked: boolean;
    likedBy?: CircleLike[];
    hasTriggeredResponse?: boolean;
    isFavorited?: boolean;
    thoughts?: string;
}

export interface CircleComment {
    id: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    content: string;
    createdAt: string;
    thoughts?: string;
    response?: string;
    type: 'user' | 'character';
    replyTo?: {
        userId: string;
        userName: string;
    };
}

export interface CircleLike {
    userId: string;
    userName: string;
    userAvatar?: string;
    isCharacter: boolean;
    createdAt: string;
    thoughts?: string; // Optional field for character's thoughts on the like
  }
// ============= 功能选项类型 =============

export interface ProcessChatOptions {
    userMessage: string;
    conversationId: string;
    status: "更新人设" | "新建角色" | "同一角色继续对话";
    apiKey: string;
    character?: Character;
    jsonString?: string;
}

// Cradle-specific types

export type FeedType = 'about' | 'knowledge' | 'material' | 'image' | 'voice' | 'text';

export interface FeedQueue {
  characterId: string;
  feeds: Feed[];
  lastProcessed?: number;
  processing: boolean;
}

export interface Feed {
  id: string;
  content: string;
  type: 'text' | 'voice' | 'image' | 'aboutMe'| 'material'| 'knowledge';
  timestamp: number;
  processed: boolean;
}

// Add CharacterImage type
// Add this interface for image generation configuration

export interface ImageGenerationConfig {
  positiveTags: string[];
  negativeTags: string[];
  artistPrompt: string | null;
  customPrompt: string;
  useCustomPrompt: boolean;
  characterTags: string[];
  seed: number | string | null; // 支持number|string|null
  novelaiSettings?: any; // 改为any或具体对象类型
  animagine4Settings?: any; // 改为any或具体对象类型
  // 新增：锁定提示词
  fixedTags?: string[];
}

export interface CharacterImage {
  id: string;
  url: string;
  localUri?: string;
  characterId: string;
  createdAt: number;
  isFavorite: boolean;
  isAvatar?: boolean;
  isDefaultBackground?: boolean;
  isUserUploaded?: boolean; // Flag to mark if this image was uploaded by the user
  tags?: {
    positive?: string[];
    negative?: string[];
  };
  isEdited?: boolean;  // Flag to mark if this image has been edited
  isDefaultAvatar?: boolean; // Flag to mark if this is the default avatar
 // Flag to mark if this is the default background
  originalImageId?: string; // Reference to the original image if this is an edited version
  editHistory?: string[]; // Store prompts used to edit this image
  data?: string; // Base64 encoded image data
  generationStatus?: 'idle' | 'pending' | 'success' | 'error';
  generationTaskId?: string;
  generationMessage?: string;
  setAsAvatar?: boolean;
  setAsBackground?: boolean;
  generationError?: string;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Add this property to store generation configuration for future regeneration
  generationConfig?: ImageGenerationConfig & {
    isNovelAI?: boolean; // 标记是否为NovelAI生成
  };
  isNovelAI?: boolean; // 顶层也可加，便于兼容
  seed?: number; // Optional seed for image generation
  localAsset?: string; // Local asset path for the image
}

// Fix the CradleCharacter interface by making it extend Character
// Now it's just an extension with some specialized cradle fields

export interface CradleCharacter extends Character {
  inCradleSystem?: boolean; // Must be true for cradle characters
  importedFromCharacter?: boolean; // Was this imported from a normal character
  importedCharacterId?: string; // ID of the original character if imported
  cradleAnimation?: CradleAnimation;
  apiSettings?: {
    apiProvider: 'gemini' | 'openrouter';
    useCloudService?: boolean;
    openrouter?: {
      enabled: boolean;
      apiKey: string;
      model: string;
    };
  };
  
  cradle?: {
    startDate?: string;
    progress?: number;
    stage?: 'egg' | 'growing' | 'mature';
    lastFeedTimestamp?: number;
  
  };
  
  // Add VNDB search results property (move from specific implementation to interface)
  vndbSearchResults?: VNDBCharacter[];
  
  // Add image history array
  imageHistory?: CharacterImage[];
  
  // Flag to indicate if the character is directly editable through dialog
  isDialogEditable?: boolean;
}

// Add chat save/restore system types


export interface ChatSave {
  id: string;
  conversationId: string;
  characterId: string;
  characterName: string;
  timestamp: number;
  description: string;
  messageIds: string[];
  messages: Message[];
  previewText: string;
  thumbnail?: string;
  // Legacy field for backward compatibility
  nodestChatHistory?: ChatHistoryEntity;
  // New field for timestamp-based backup system
  backupTimestamp?: number;
  importedAt?: number;
}

export interface RoleCardJson {
    name: string;
    first_mes: string;
    description: string;
    personality: string;
    scenario: string;
    mes_example: string;
    background?: string;
    data?: {
        extensions?: {
            regex_scripts?: RegexScript[];
        };
    };
}

export interface RegexScript {
    scriptName: string;
    findRegex: string;
    replaceString: string;
    flags?: string;
}

export interface WorldBookJson {
    entries: {
        [key: string]: WorldBookEntry;
    };
}

export interface WorldBookEntry {
    comment: string;
    content: string;
    disable: boolean;
    position: 0 | 1 | 2 | 3 | 4;
    constant: boolean;
    key?: string[];
    order: number;
    depth: number;
    vectorized?: boolean;
}

export interface PresetPrompt {
    name: string;
    content: string;
    enable: boolean;
    identifier: string;
    injection_position?: number;
    injection_depth?: number;
    role?: string;
}

// Chat History专用类型

export interface ChatHistoryEntity {
    name: string;
    role: string;
    parts: ChatMessage[];  // 存储完整的消息对象
    identifier?: string;
}

// Gemini API请求消息格式

export interface GeminiMessage {
    role: "user" | "model";
    parts: MessagePart[];
    position?: number;
    is_d_entry?: boolean;
    is_author_note?: boolean;
    injection_depth?: number;
    conversationId?: string;
    characterId?: string;
}

export interface RegexTool {
    id: string;
    name: string;
    pattern: string;
    replacement: string;
    target: 'ai' | 'user';
    enabled: boolean;
  }

// Add new props to ChatDialogProps

export interface ChatDialogProps {
  messages: Message[];
  style?: ViewStyle;
  selectedCharacter?: Character | null;
  onRateMessage?: (messageId: string, isUpvote: boolean) => void;
  onRegenerateMessage?: (messageId: string, messageIndex: number) => void;
  savedScrollPosition?: number;
  onScrollPositionChange?: (characterId: string, position: number) => void;
  messageMemoryState?: Record<string, string>; // Add this new prop
  streamingMessage?: string | null; // 新增：流式消息
}

export interface ChatSettings {
  serverUrl: string;
  characterApiKey: string;
  xApiKey: string;
  apiProvider: string;
  openrouter?: {
    enabled?: boolean;
    apiKey?: string;
    model?: string;
    autoRoute?: boolean;
    useBackupModels?: boolean;
    backupModels?: string[];
    sortingStrategy?: 'price' | 'performance' | 'random' | 'latency' | 'speed';
    dataCollection?: boolean;
    ignoredProviders?: string[];
  };
  typingDelay: number;
  temperature: number;
  maxtokens: number;
  maxTokens: number;
  additionalGeminiKeys?: string[];
  useGeminiModelLoadBalancing?: boolean;
  useGeminiKeyRotation?: boolean;
  // Add new model configuration fields
  geminiPrimaryModel?: string;
  geminiBackupModel?: string;
  geminiTemperature?: number;
  geminiMaxTokens?: number;
  retryDelay?: number;
  useZhipuEmbedding?: boolean;
  zhipuApiKey?: string;
  useCloudService?: boolean;
  cloudModel?: string;
  novelai?: {
    enabled?: boolean;
    token?: string;
    model?: string;
    sampler?: string;
    steps?: number;
    scale?: number;
    noiseSchedule?: string;
    // --- 新增自定义端点支持 ---
    useCustomEndpoint?: boolean;
    customEndpoint?: string;
    customToken?: string;
  };
  OpenAIcompatible?: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
    endpoint?: string;
    // 新增：多渠道支持
    providers?: OpenAICompatibleProviderConfig[];
    selectedProviderId?: string;
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
  };
}

// Add new diary system types
export interface DiaryEntry {
  id: string;
  characterId: string;
  content: string;
  createdAt: number;
  reflectionGoal: string;
  contextWeight: number;
  characterWeight: number;
  worldInfoWeight: number;
  strategicWeight: number;
  aiGeneratedActions?: string[];
  userOverrideAction?: 'send' | 'not_send' | null;
  messageToSend?: string;
  circleMemoryWeight?: number; // Weight for Circle memory
  circleMemoryCount?: number; // Number of Circle posts to consider
}

export interface DiarySettings {
  enabled: boolean;
  reflectionGoal: string;
  wordCount: number;
  contextWeight: number;
  characterWeight: number;
  worldInfoWeight: number;
  strategicWeight: number;
  confidenceThreshold: number;
  triggerInterval: 'daily' | 'hourly' | 'manual' | string; // 'hourly' can be '2hours', '4hours', etc.
  triggerTime?: string; // For daily, the time of day to trigger (e.g., '08:00')
  lastTriggered?: number; // Timestamp of last trigger
  circleMemoryWeight?: number; // Weight for Circle memory
  circleMemoryCount?: number; // Number of Circle posts to consider
}

export interface OpenAICompatibleProviderConfig {
  id: string; // unique id for the provider
  name: string; // user-friendly name
  apiKey: string;
  stream : boolean;
  model: string;
  endpoint: string;
  temperature: number;
  max_tokens: number;
}


// TTS Configuration for different providers
export interface TTSConfig {
  provider: TTSProvider;
  // CosyVoice configuration
  cosyvoice?: {
    templateId: string;
    gender: 'male' | 'female';
    instruction?: string; // Optional instruction for CosyVoice
  };
  // DouBao configuration  
  doubao?: {
    voiceType: string;
    emotion?: string;
  };
  // Minimax configuration
  minimax?: {
    voiceId: string;
    emotion?: string;
  };
}

// Legacy voiceType field for backward compatibility
export interface VoiceSettings {
  voiceType?: string; // Legacy field for cosyvoice templateId
  ttsConfig?: TTSConfig; // New unified TTS config
}