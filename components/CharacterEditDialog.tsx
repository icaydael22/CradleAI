import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Character, CradleCharacter } from '@/shared/types';
import { useUser } from '@/constants/UserContext';
import { NodeSTManager } from '@/utils/NodeSTManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCharacters } from '@/constants/CharactersContext';
import { getApiSettings, addCloudServiceStatusListener } from '@/utils/settings-helper';
import { GeminiAdapter } from '@/NodeST/nodest/utils/gemini-adapter';
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';
import { OpenAIAdapter } from '@/NodeST/nodest/utils/openai-adapter';

interface CharacterEditDialogProps {
  isVisible: boolean;
  character: Character | CradleCharacter;
  onClose: () => void;
  onUpdateCharacter?: (updatedCharacter: Character | CradleCharacter) => Promise<void>;
}

// Define a message type for our chat
interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number;
}

// Helper function to convert API settings to properly typed object
function getTypedApiSettings() {
  const settings = getApiSettings();
  // 修正 openaiCompatible 结构，确保 apiKey 正确传递
  return {
    apiProvider: settings.apiProvider === 'openrouter'
      ? 'openrouter' as const
      : settings.apiProvider === 'openai-compatible'
        ? 'openai-compatible' as const
        : 'gemini' as const,
    openrouter: settings.openrouter && {
      enabled: settings.openrouter.enabled,
      apiKey: settings.openrouter.apiKey || '',
      model: settings.openrouter.model || '',
    },
    openaiCompatible: settings.OpenAIcompatible && {
      enabled: settings.OpenAIcompatible.enabled,
      apiKey: settings.OpenAIcompatible.apiKey || '',
      model: settings.OpenAIcompatible.model || '',
      endpoint: settings.OpenAIcompatible.endpoint || '',
    },
    useCloudService: settings.useCloudService,
    cloudModel: settings.cloudModel,
    useGeminiModelLoadBalancing: settings.useGeminiModelLoadBalancing,
    useGeminiKeyRotation: settings.useGeminiKeyRotation,
    additionalGeminiKeys: settings.additionalGeminiKeys,
  };
}

// Helper function to get the appropriate adapter based on API settings
function getAdapter(apiSettings: ReturnType<typeof getTypedApiSettings>, userApiKey: string) {
  if (apiSettings.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled) {
    // ...existing code...
    return new OpenRouterAdapter(
      userApiKey || apiSettings.openrouter.apiKey || '',
      apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
    );
  } else if (apiSettings.apiProvider === 'openai-compatible' && apiSettings.openaiCompatible?.enabled) {
    // 优先使用 openaiCompatible.apiKey
    const openaiKey = apiSettings.openaiCompatible.apiKey || userApiKey || '';
    console.log('[CharacterEditDialog] Using OpenAI-compatible adapter, apiKey:', openaiKey ? '***' : '(empty)');
    return new OpenAIAdapter({
      endpoint: apiSettings.openaiCompatible.endpoint,
      apiKey: openaiKey,
      model: apiSettings.openaiCompatible.model || 'gpt-3.5-turbo'
    });
  } else {
    // ...existing code...
    return new GeminiAdapter(userApiKey, {
      useModelLoadBalancing: apiSettings.useGeminiModelLoadBalancing,
      useKeyRotation: apiSettings.useGeminiKeyRotation,
      additionalKeys: apiSettings.additionalGeminiKeys,
      primaryModel: apiSettings.cloudModel,
    });
  }
}

export default function CharacterEditDialog({
  isVisible,
  character,
  onClose,
  onUpdateCharacter
}: CharacterEditDialogProps) {
  const { user } = useUser();
  const { updateCharacter, characters } = useCharacters(); // Add characters to get the full list
  
  // Replace direct API settings extraction with settings-helper and ensure proper typing
  const [apiSettings, setApiSettings] = useState(getTypedApiSettings());
  
  // Add listener for cloud service status changes
  useEffect(() => {
    // Get initial API settings with proper typing
    setApiSettings(getTypedApiSettings());
    
    // Add listener for cloud service status changes
    const removeListener = addCloudServiceStatusListener((enabled) => {
      console.log('[CharacterEditDialog] Cloud service status changed:', enabled);
      // Update API settings when cloud service status changes
      setApiSettings(getTypedApiSettings());
    });
    
    // Clean up listener on unmount
    return () => removeListener();
  }, []);
  
  // State for chat UI
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Character update related states
  const [updatedCharacter, setUpdatedCharacter] = useState<Character | CradleCharacter | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isGeneratingUpdate, setIsGeneratingUpdate] = useState(false);
  
  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Keep track of the character's dialog history key for storage
  const dialogHistoryKey = `character_edit_dialog_${character.id}`;
  
  // Log when hasChanges or updatedCharacter changes
  useEffect(() => {
    console.log('[CharacterEditDialog] hasChanges:', hasChanges);
    console.log('[CharacterEditDialog] updatedCharacter exists:', !!updatedCharacter);
  }, [hasChanges, updatedCharacter]);
  
  // Add new state for tracking character relationships
  const [characterRelationships, setCharacterRelationships] = useState<{
    isCradleCharacter: boolean;
    hasGeneratedVersion: boolean;
    generatedCharacterId: string | null;
    normalCharacter: Character | null;
  }>({
    isCradleCharacter: false,
    hasGeneratedVersion: false,
    generatedCharacterId: null,
    normalCharacter: null
  });
  
  // Initialize when dialog opens with character data and load chat history
  useEffect(() => {
    if (isVisible && character) {
      // Reset states when dialog opens
      setHasChanges(false);
      setUpdatedCharacter(null);
      setShowPreview(false);
      
      // Check character relationships
      const isCradleCharacter = 'inCradleSystem' in character && character.inCradleSystem === true;
      const generatedCharacterId = (character as CradleCharacter).generatedCharacterId || null;
      let normalCharacter: Character | null = null;
      
      if (isCradleCharacter && generatedCharacterId) {
        // Try to find the generated character in the characters array
        normalCharacter = characters.find(c => c.id === generatedCharacterId) || null;
      }
      
      // Update relationship state
      setCharacterRelationships({
        isCradleCharacter,
        hasGeneratedVersion: generatedCharacterId !== null,
        generatedCharacterId,
        normalCharacter
      });
      
      // Log the character data we received directly
      console.log('[CharacterEditDialog] Received character data:', {
        id: character.id,
        name: character.name,
        isCradleCharacter,
        generatedCharacterId,
        hasNormalCharacter: !!normalCharacter,
        hasJsonData: !!character.jsonData,
        jsonDataLength: character.jsonData?.length || 0
      });
      
      // Load saved chat history for this character
      loadChatHistory();
      
      // If we don't have any messages yet, send a welcome message
      if (messages.length === 0) {
        // Send initial system message
        const initialMessage = getInitialSystemMessage();
        
        setMessages([
          {
            id: 'system-1',
            text: initialMessage,
            sender: 'bot' as const,
            timestamp: Date.now()
          }
        ]);
      }
    }
  }, [isVisible, character.id, characters]);
  
  // Load chat history from AsyncStorage
  const loadChatHistory = async () => {
    try {
      const savedHistory = await AsyncStorage.getItem(dialogHistoryKey);
      
      if (savedHistory) {
        const parsedMessages = JSON.parse(savedHistory) as ChatMessage[];
        setMessages(parsedMessages);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };
  
  // Save chat history to AsyncStorage
  const saveChatHistory = async (updatedMessages: ChatMessage[]) => {
    try {
      await AsyncStorage.setItem(dialogHistoryKey, JSON.stringify(updatedMessages));
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    
    // Save messages to AsyncStorage
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  // 新增：用于控制JSON更新详情弹窗的显示和内容
  const [jsonUpdateModalVisible, setJsonUpdateModalVisible] = useState(false);
  const [jsonUpdateModalContent, setJsonUpdateModalContent] = useState<string | null>(null);

  // 渲染JSON更新详情弹窗
  const renderJsonUpdateModal = () => {
    if (!jsonUpdateModalContent) return null;
    let parsedJson: any = null;
    try {
      parsedJson = JSON.parse(jsonUpdateModalContent);
    } catch {
      // fallback: 显示原始内容
    }
    return (
      <Modal
        visible={jsonUpdateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJsonUpdateModalVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <View style={{
            backgroundColor: '#222',
            borderRadius: 12,
            padding: 20,
            width: '90%',
            maxHeight: '80%'
          }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>角色更改详情</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {parsedJson ? (
                <Text style={{ color: '#fff', fontSize: 14 }}>
                  {JSON.stringify(parsedJson, null, 2)}
                </Text>
              ) : (
                <Text style={{ color: '#fff', fontSize: 14 }}>{jsonUpdateModalContent}</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={{
                marginTop: 18,
                backgroundColor: '#ff9f1c',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center'
              }}
              onPress={() => setJsonUpdateModalVisible(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Handle user message send
  const handleSendMessage = async () => {
    if (input.trim() === '') return;
    
    const trimmedInput = input.trim();
    setInput('');
    
    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      text: trimmedInput,
      sender: 'user' as const,
      timestamp: Date.now()
    };
    
    // Create a new messages array with the user message
    const updatedMessages = [...messages, userMessage as ChatMessage];
    setMessages(updatedMessages);
    
    // Show loading state
    setIsProcessing(true);
    
    try {
      // Format messages for the LLM
      const formattedMessages = formatMessagesForLLM(updatedMessages);
      
      // Verify character data was included in the system prompt
      const systemPrompt = formattedMessages[0].parts[0].text;
      const hasCharacterJson = systemPrompt.includes('```') && 
                              (systemPrompt.includes('roleCard') || 
                               systemPrompt.includes('worldBook'));
      
      console.log('[CharacterEditDialog] System prompt contains character JSON data:', hasCharacterJson);
      
      if (!hasCharacterJson) {
        // Add a warning message if no JSON data was included
        setMessages(prev => [
          ...prev,
          {
            id: `warning-${Date.now()}`,
            text: '⚠️ 警告: 无法加载完整的角色数据。编辑功能可能受限。请尝试关闭并重新打开编辑对话框，或联系技术支持。',
            sender: 'bot',
            timestamp: Date.now()
          }
        ]);
      }
      
      // Use latest API settings and user API key together
      const apiKey = user?.settings?.chat?.characterApiKey || '';
      const currentApiSettings = getTypedApiSettings(); // Get latest settings before request
      
      // Get the appropriate adapter based on API settings
      const adapter = getAdapter(currentApiSettings, apiKey);
      
      // Send to LLM using adapter directly
      const response = await adapter.generateContent(formattedMessages);
      
      // Add bot response to chat
      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        text: response,
        sender: 'bot',
        timestamp: Date.now()
      };
      
      const finalMessages: ChatMessage[] = [...updatedMessages, botMessage];
      setMessages(finalMessages);
      
      // Check if the response contains update instructions
      checkForUpdateInstructions(response);
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Add error message to chat
      setMessages([
        ...updatedMessages,
        {
          id: `error-${Date.now()}`,
          text: `错误: ${error instanceof Error ? error.message : '处理请求时出错，请稍后再试。'}`,
          sender: 'bot',
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Format messages for LLM - convert our chat messages to the LLM API format
  const formatMessagesForLLM = (chatMessages: ChatMessage[]) => {
    // First, create a system prompt that includes the character data
    console.log('[CharacterEditDialog] Formatting messages for LLM, character:', character.name);
    
    const systemPrompt = getSystemPrompt();
    console.log('[CharacterEditDialog] System prompt created, length:', systemPrompt.length);
    
    // Convert our messages to LLM format
    const formattedMessages = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      },
      {
        role: 'model',
        parts: [{ text: '我理解了。我会检查角色设定并帮助你修改。请告诉我你想要如何更改角色设定。' }]
      },
      // Then include all user messages and bot responses
      ...chatMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }))
    ];
    
    console.log('[CharacterEditDialog] Formatted', formattedMessages.length, 'messages for LLM');
    return formattedMessages;
  };
  
  // Build system prompt that includes character data
  const getSystemPrompt = () => {
    let characterJsonData: any = null;
    let jsonDataLog = '未找到JSON数据';
    
    try {
      if (character.jsonData) {
        console.log('[CharacterEditDialog] Parsing JSON data, length:', character.jsonData.length);
        characterJsonData = JSON.parse(character.jsonData);
        jsonDataLog = `成功解析, 包含字段: ${Object.keys(characterJsonData).join(', ')}`;
        console.log('[CharacterEditDialog] Successfully parsed character JSON data');
      } else {
        console.warn('[CharacterEditDialog] Character does not have jsonData property');
      }
    } catch (error) {
      console.error('[CharacterEditDialog] Failed to parse character JSON data:', error);
      jsonDataLog = `解析失败: ${error instanceof Error ? error.message : '未知错误'}`;
    }
    
    // Add debug info at the end of prompt for development
    const debugInfo = `
DEBUG INFO (仅开发使用):
- 角色ID: ${character.id}
- JSON数据: ${jsonDataLog}
- 创建时间: ${new Date(character.createdAt).toLocaleString()}
- 更新时间: ${new Date(character.updatedAt).toLocaleString()}
`;
    
    return `你是一位专业的角色设计师助手，负责帮助用户修改和改进角色设定。你现在需要检查一个名为"${character.name}"的角色，并根据用户的要求帮助修改角色设定。

当前角色数据：
角色名称: ${character.name}
描述: ${character.description}
性格: ${character.personality || '未指定'}
性别: ${character.gender || '未指定'}
兴趣爱好: ${character.interests?.join(', ') || '未指定'}

${characterJsonData ? `角色的详细设定JSON数据如下:
\`\`\`
${JSON.stringify(characterJsonData, null, 2)}
\`\`\`
` : '角色没有详细的JSON数据或数据无法解析。请根据其他可用信息来帮助用户。'}

你的任务是：
1. 仔细分析角色的现有设定
2. 根据对话上下文，主动提出改进建议
3. 当用户请求特定修改时，帮助实现并提供具体建议
4. 当有合理的变更请求时，提供符合要求的更新代码

重要规则：
- 对角色设定的更改应保持基本结构不变
- 在用户没有明确指令时，主动提供有建设性的建议，比如丰富角色背景、完善设定细节等
- 当用户请求修改时，给出具体的实施方案和预期效果
- 使用<CHARACTER_JSON_UPDATE>标签包裹JSON更新代码
- 可以只生成需要更新的部分内容，不必包含完整的角色数据
- 可以选择性地只更新roleCard、worldBook或preset中的任一部分或多部分
- 使用口语化、友好的语气与用户交流
- 禁止生成有害、违规或不适当的内容${__DEV__ ? debugInfo : ''}

当需要提供更新时，请使用以下格式：

<CHARACTER_JSON_UPDATE>
{
  // 如果需要更新角色基本信息，包含roleCard
  "roleCard": {
    "name": "角色名称",
    "first_mes": "初始消息",
    "description": "角色描述",
    "personality": "角色性格",
    "scenario": "场景设定",
    "mes_example": "对话示例"
  },
  
  // 如果需要更新世界书条目，包含worldBook
  "worldBook": {
    "entries": {
      "条目名称1": {
        "comment": "条目说明",
        "content": "条目内容"
      }
    }
  },
  
  // 如果需要更新自定义提示，包含preset
  "preset": {
    "prompts": [
      {
        "name": "提示名称",
        "content": "提示内容",
        "role": "user或model"
      }
    ]
  }
}
</CHARACTER_JSON_UPDATE>

注意：
1. 你可以只更新上述三个主要部分（roleCard、worldBook、preset）中的任意一个或多个
2. 对于不需要修改的部分，可以完全省略
3. 系统会自动保留原有数据并与你的更新合并
4. 适当添加注释说明你所做的更改`;
};
  
  // Get initial system message for welcoming the user
  const getInitialSystemMessage = () => {
    return `👋 你好！我是角色设计助手。我已经加载了"${character.name}"的角色数据。

我可以帮你：
• 修改角色个性、背景故事或对话风格
• 调整角色设定中的具体细节
• 提出改进建议以丰富角色
• 实现你想要的任何合理变更

有什么我可以帮你修改的吗？或者需要我对当前角色设定进行分析并提供改进建议吗？`;
  };
  
  // Check if the response contains update instructions
  const checkForUpdateInstructions = (response: string): { success: boolean } => {
    // Look for special tags that indicate JSON update instructions
    const regex = /<CHARACTER_JSON_UPDATE>([\s\S]*?)<\/CHARACTER_JSON_UPDATE>/;
    const match = response.match(regex);
    console.log('[CharacterEditDialog] Checking for JSON updates:', !!match);
    
    if (match && match[1]) {
      try {
        // Parse the JSON update
        let jsonString = match[1].trim();
        console.log('[CharacterEditDialog] Found JSON update, length:', jsonString.length);
        
        // Clean up the JSON string to handle common formatting issues:
        // 1. Remove markdown code block markers if they exist
        jsonString = jsonString.replace(/```(json|JSON)?\s*|\s*```/g, '');
        
        // 2. Remove trailing commas (common JSON syntax error)
        jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
        
        let updatedData: any;
        
        try {
          updatedData = JSON.parse(jsonString);
          console.log('[CharacterEditDialog] Successfully parsed JSON update');
          
          // Debug log for checking worldBook data
          console.log('[CharacterEditDialog] Update contains worldBook:', !!updatedData.worldBook);
          if (updatedData.worldBook) {
            console.log('[CharacterEditDialog] worldBook entries count:', 
              Object.keys(updatedData.worldBook.entries || {}).length);
          }
        } catch (parseError) {
          console.error('[CharacterEditDialog] Failed to parse JSON update:', parseError);
          
          // Add more detailed logging to help debug the parsing issue
          console.error('[CharacterEditDialog] Problematic JSON string:', jsonString);
          
          // Try a more aggressive approach to fix potential JSON issues
          try {
            // Use JSON5 or similar tolerant parsing logic (here simulated with a regex-based cleaning)
            // Replace additional problematic patterns
            jsonString = jsonString
              // Fix unquoted keys (matches words followed by colon, not in quotes)
              .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
              // Fix single quotes to double quotes (outside of content strings)
              .replace(/'/g, '"');
              
            console.log('[CharacterEditDialog] Attempting recovery with cleaned JSON string');
            updatedData = JSON.parse(jsonString);
            console.log('[CharacterEditDialog] Recovery successful!');
          } catch (recoveryError) {
            console.error('[CharacterEditDialog] Recovery attempt failed:', recoveryError);
            throw new Error(`无法解析JSON更新内容: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
          }
        }
        
        // Ensure we have a valid JSON structure with at least one of the required components
        if (!updatedData || typeof updatedData !== 'object') {
          throw new Error('生成的JSON格式无效，缺少必要的角色数据');
        }
        
        // Check if at least one of roleCard, worldBook, or preset is present
        const hasRoleCard = !!updatedData.roleCard;
        const hasWorldBook = !!updatedData.worldBook;
        const hasPreset = !!updatedData.preset;
        
        if (!hasRoleCard && !hasWorldBook && !hasPreset) {
          console.error('[CharacterEditDialog] JSON missing all required components');
          throw new Error('生成的数据缺少任何可用的组件（roleCard、worldBook 或 preset）');
        }
        
        console.log('[CharacterEditDialog] Update components found:', 
          `roleCard: ${hasRoleCard}, worldBook: ${hasWorldBook}, preset: ${hasPreset}`);
        
        // Get original JSON data if available
        let originalData: any = {};
        if (character.jsonData) {
          try {
            originalData = JSON.parse(character.jsonData);
            console.log('[CharacterEditDialog] Loaded original character JSON data');
            console.log('[CharacterEditDialog] Original worldBook entries count:', 
              Object.keys(originalData.worldBook?.entries || {}).length);
          } catch (err) {
            console.warn('[CharacterEditDialog] Could not parse original character JSON:', err);
            // Continue with empty originalData if parsing fails
          }
        }
        
        // Keep track of the top-level fields in both objects for debugging
        console.log('[CharacterEditDialog] Original data fields:', Object.keys(originalData));
        console.log('[CharacterEditDialog] Updated data fields:', Object.keys(updatedData));
        
        // Process and enhance worldBook entries with default parameters if present
        let enhancedWorldBook: any = originalData.worldBook || { entries: {} };
        
        // Only update worldBook if it's provided in the update
        if (hasWorldBook) {
          // Create a new worldBook object based on the original
          enhancedWorldBook = { entries: { ...enhancedWorldBook.entries } };
          
          // Add all updated entries with default parameters
          if (updatedData.worldBook.entries) {
            Object.keys(updatedData.worldBook.entries).forEach(key => {
              const entry = updatedData.worldBook.entries[key];
              
              // Enhance entry with default parameters if they're missing
              enhancedWorldBook.entries[key] = {
                comment: entry.comment || "Character Information",
                content: entry.content || "",
                disable: false,
                position: 4,
                constant: true,
                key: [],
                order: Object.keys(enhancedWorldBook.entries).length, // Use incrementing order
                depth: 4,
                vectorized: false
              };
            });
          }
        }
        
        // Process and enhance preset prompts with default parameters if present
        let enhancedPreset: any = originalData.preset || {
          prompts: [],
          prompt_order: []
        };
        
        // Only update preset if it's provided in the update
        if (hasPreset) {
          // Keep original prompts as a base
          const originalPrompts = enhancedPreset.prompts || [];
          const originalPromptOrder = enhancedPreset.prompt_order || [];
          
          // Add updated prompts with default parameters
          if (updatedData.preset.prompts) {
            const timestamp = Date.now();
            const newPrompts = updatedData.preset.prompts.map((prompt: any, index: number) => ({
              name: prompt.name || "Custom Prompt",
              content: prompt.content || "",
              identifier: `cradle-edition-${timestamp}-${index}`,
              isEditable: true,
              insertType: 'relative',
              role: (prompt.role as 'user' | 'model') || 'user',
              order: originalPrompts.length + index,
              isDefault: false,
              enable: true,
              depth: 4
            }));
            
            enhancedPreset = {
              prompts: [...originalPrompts, ...newPrompts],
              prompt_order: originalPromptOrder
            };
          }
        }
        
        // Create a proper merged JSON structure - keeping original data and selectively updating components
        const mergedData = {
          ...originalData,
          // Only update the components that were provided in the update
          ...(hasRoleCard ? { roleCard: updatedData.roleCard } : {}),
          ...(hasWorldBook ? { worldBook: enhancedWorldBook } : {}),
          ...(hasPreset ? { preset: enhancedPreset } : {}),
          // Keep or initialize authorNote
          authorNote: originalData.authorNote || {},
          // Keep or initialize chatHistory
          chatHistory: originalData.chatHistory || {}
        };
        
        // Ensure critical fields are present in roleCard if updating it
        if (hasRoleCard && mergedData.roleCard) {
          const roleCard = mergedData.roleCard;
          roleCard.name = roleCard.name || character.name;
          roleCard.description = roleCard.description || character.description;
          roleCard.personality = roleCard.personality || character.personality;
          roleCard.first_mes = roleCard.first_mes || "你好，很高兴认识你！";
        }
        
        // Fix the preset structure to ensure it has the correct format for NodeST validation
        if (mergedData.preset) {
          // Ensure prompt_order is properly structured with an array of objects that have an 'order' property
          if (!Array.isArray(mergedData.preset.prompt_order) || mergedData.preset.prompt_order.length === 0) {
            mergedData.preset.prompt_order = [{ 
              order: [] 
            }];
          }
          
          // Ensure the first prompt_order item has an 'order' property that is an array
          if (mergedData.preset.prompt_order[0] && !Array.isArray(mergedData.preset.prompt_order[0].order)) {
            mergedData.preset.prompt_order[0].order = [];
          }
          
          // If we have prompts, ensure they are represented in the prompt_order
          if (Array.isArray(mergedData.preset.prompts)) {
            interface PromptIdentifier {
              identifier: string;
              enabled: boolean;
            }

            const promptIdentifiers: PromptIdentifier[] = mergedData.preset.prompts.map((p: { identifier: string; enable?: boolean }) => ({
              identifier: p.identifier,
              enabled: p.enable !== false
            }));
            
            // Make sure all prompts are represented in the prompt_order
            if (mergedData.preset.prompt_order[0] && Array.isArray(mergedData.preset.prompt_order[0].order)) {
              // Get existing identifiers to avoid duplicates
              const existingIdentifiers = new Set(
                mergedData.preset.prompt_order[0].order.map((item: any) => item.identifier)
              );
              
              // Add any prompts not already in the prompt_order
              promptIdentifiers.forEach(prompt => {
                if (!existingIdentifiers.has(prompt.identifier)) {
                  mergedData.preset.prompt_order[0].order.push(prompt);
                }
              });
            } else {
              // Create a new prompt_order structure
              mergedData.preset.prompt_order = [{ order: promptIdentifiers }];
            }
          }
          
          // Ensure all required system prompts exist in the prompts array
          const requiredPrompts = [
            {name: "Character System", identifier: "characterSystem", role: "user"},
            {name: "Character Confirmation", identifier: "characterConfirmation", role: "model"},
            {name: "Character Introduction", identifier: "characterIntro", role: "user"},
            {name: "Context Instruction", identifier: "contextInstruction", role: "user"},
            {name: "Continue", identifier: "continuePrompt", role: "user"}
          ];
          
          if (!Array.isArray(mergedData.preset.prompts)) {
            mergedData.preset.prompts = [];
          }
          
          // Check if required prompts exist, add them if not
          for (const required of requiredPrompts) {
            interface RequiredPrompt {
              name: string;
              identifier: string;
              role: "user" | "model";
            }

            interface PromptOrder {
              identifier: string;
              enabled: boolean;
            }

            interface Prompt {
              name: string;
              content: string;
              enable: boolean;
              identifier: string;
              role: "user" | "model";
              isDefault: boolean;
            }

            interface PromptOrderContainer {
              order: PromptOrder[];
            }

            interface PresetData {
              prompts: Prompt[];
              prompt_order: PromptOrderContainer[];
            }

                        if (!mergedData.preset.prompts.some((p: Prompt) => p.identifier === required.identifier)) {
                          console.log(`[CharacterEditDialog] Adding required prompt: ${required.identifier}`);
                          mergedData.preset.prompts.push({
                            name: required.name,
                            content: required.name === "Character System" ? 
                              "You are a Roleplayer who is good at playing various types of roles." :
                              required.name === "Character Confirmation" ?
                              "[Understood]" :
                              required.name === "Character Introduction" ?
                              "The following are some information about the character you will be playing." :
                              required.name === "Context Instruction" ?
                              "推荐以下面的指令&剧情继续：\n{{lastMessage}}" :
                              "继续",
                            enable: true,
                            identifier: required.identifier,
                            role: required.role,
                            isDefault: true
                          } as Prompt);
                          
                          // Add to prompt_order if not already there
                          if (mergedData.preset.prompt_order[0] && 
                              !mergedData.preset.prompt_order[0].order.some((o: PromptOrder) => o.identifier === required.identifier)) {
                            mergedData.preset.prompt_order[0].order.push({
                              identifier: required.identifier,
                              enabled: true
                            } as PromptOrder);
                          }
                        }
          }
          
          // Also make sure chatHistory is in the prompt_order
          if (mergedData.preset.prompt_order[0] && 
              !mergedData.preset.prompt_order[0].order.some((o: any) => o.identifier === "chatHistory")) {
            mergedData.preset.prompt_order[0].order.push({
              identifier: "chatHistory",
              enabled: true
            });
          }
        }
        
        // Convert the merged data back to JSON string
        const mergedJsonString = JSON.stringify(mergedData);
        console.log('[CharacterEditDialog] Created merged JSON data, length:', mergedJsonString.length);
        
        if (hasWorldBook) {
          console.log('[CharacterEditDialog] Final worldBook entries count:', 
            Object.keys(mergedData.worldBook.entries || {}).length);
        }
        
        // Create an updated character with the new data
        const newCharacter = {
          ...character,
          id: character.id, // Explicitly ensure same ID
          jsonData: mergedJsonString,
          // Only update these fields if roleCard was updated
          ...(hasRoleCard ? {
            name: mergedData.roleCard?.name || character.name,
            description: mergedData.roleCard?.description || character.description,
            personality: mergedData.roleCard?.personality || character.personality
          } : {})
        };
        
        // Set the updated character and show preview
        setUpdatedCharacter(newCharacter);
        setHasChanges(true); // Explicitly set hasChanges to true
        console.log('[CharacterEditDialog] Set hasChanges to true');
        
        // Build a message describing what will be updated
        let updateComponents = [];
        if (hasRoleCard) updateComponents.push("基本角色信息");
        if (hasWorldBook) updateComponents.push("世界书条目");
        if (hasPreset) updateComponents.push("自定义提示");
        
        // Alert the user that changes are ready to preview, showing which components will be updated
        Alert.alert(
          '角色设定更新准备就绪',
          `已根据你的要求生成了角色设定更新，包含以下部分：\n\n${updateComponents.join('、')}\n\n请点击"预览更改"按钮查看更新内容，并决定是否应用这些更改。`,
          [
            { text: '确定', style: 'default' }
          ]
        );
        
        return { success: true };
      } catch (error) {
        console.error('[CharacterEditDialog] Failed to process character update:', error);
        // Add error message to chat
        setMessages(prevMessages => [
          ...prevMessages,
          {
            id: `error-${Date.now()}`,
            text: `错误: 处理角色更新失败: ${error instanceof Error ? error.message : '未知错误'}`,
            sender: 'bot',
            timestamp: Date.now()
          }
        ]);
        return { success: false };
      }
    }
    return { success: false };
  };
  
  // Apply the character updates using NodeSTManager with "更新人设" status
  const handleApplyChanges = async () => {
    // If we already have an updated character, apply it
    if (updatedCharacter) {
      try {
        console.log('[CharacterEditDialog] Applying character changes');
        console.log('[CharacterEditDialog] Updated character JSON data length:', updatedCharacter.jsonData?.length || 0);
        
        // Verify the JSON is valid before applying
        if (updatedCharacter.jsonData) {
          try {
            const parsedJson = JSON.parse(updatedCharacter.jsonData);
            if (!parsedJson.roleCard || !parsedJson.worldBook) {
              throw new Error('角色数据缺少必要的roleCard或worldBook结构');
            }
            
            // Make sure preset structure is valid
            if (!parsedJson.preset || !parsedJson.preset.prompts) {
              console.log('[CharacterEditDialog] 添加缺失的preset结构');
              parsedJson.preset = parsedJson.preset || {};
              parsedJson.preset.prompts = parsedJson.preset.prompts || [];
              parsedJson.preset.prompt_order = parsedJson.preset.prompt_order || [{ order: [] }];
            }
            
            // Ensure preset.prompt_order structure is correct
            if (!parsedJson.preset.prompt_order || !Array.isArray(parsedJson.preset.prompt_order) || parsedJson.preset.prompt_order.length === 0) {
              console.log('[CharacterEditDialog] 修复preset.prompt_order结构');
              parsedJson.preset.prompt_order = [{ order: [] }];
            }
            
            // Ensure order property exists in the first item
            const firstOrderItem = parsedJson.preset.prompt_order[0];
            if (!firstOrderItem || typeof firstOrderItem !== 'object' || !Array.isArray(firstOrderItem.order)) {
              console.log('[CharacterEditDialog] 修复preset.prompt_order[0].order结构');
              parsedJson.preset.prompt_order[0] = { order: [] };
            }
            
            // Add at least one prompt to the order array if it's empty
            if (parsedJson.preset.prompts.length > 0 && parsedJson.preset.prompt_order[0].order.length === 0) {
              console.log('[CharacterEditDialog] 添加至少一个prompt到order数组');
              const firstPromptId = parsedJson.preset.prompts[0].identifier || 'characterSystem';
              parsedJson.preset.prompt_order[0].order.push({ 
                identifier: firstPromptId, 
                enabled: true 
              });
            }
            
            // Add required system prompts if missing
            const requiredPrompts = [
              {name: "Character System", identifier: "characterSystem", role: "user", content: "You are a Roleplayer who is good at playing various types of roles."},
              {name: "Character Confirmation", identifier: "characterConfirmation", role: "model", content: "[Understood]"},
              {name: "Character Introduction", identifier: "characterIntro", role: "user", content: "The following are some information about the character you will be playing."},
              {name: "Context Instruction", identifier: "contextInstruction", role: "user", content: "推荐以下面的指令&剧情继续：\n{{lastMessage}}"},
              {name: "Continue", identifier: "continuePrompt", role: "user", content: "继续"}
            ];
            
            for (const required of requiredPrompts) {
              // Check if prompt exists in prompts array
              interface SystemPrompt {
                name: string;
                identifier: string;
                role: 'user' | 'model';
                content: string;
              }

              interface PresetPrompt {
                name: string;
                content: string;
                enable: boolean;
                identifier: string;
                role: 'user' | 'model';
                isDefault: boolean;
              }

              interface ParsedJson {
                preset: {
                  prompts: PresetPrompt[];
                }
              }

              if (!parsedJson.preset.prompts.some((p: PresetPrompt) => p.identifier === required.identifier)) {
                console.log(`[CharacterEditDialog] 添加缺失的必要prompt: ${required.identifier}`);
                parsedJson.preset.prompts.push({
                  name: required.name,
                  content: required.content, 
                  enable: true,
                  identifier: required.identifier,
                  role: required.role,
                  isDefault: true
                });
              }
              
              // Check if prompt exists in prompt_order
              interface PromptOrderItem {
                identifier: string;
                enabled: boolean;
              }

              interface PromptOrder {
                order: PromptOrderItem[];
              }

              interface PresetData {
                prompt_order: PromptOrder[];
              }

                            if (!parsedJson.preset.prompt_order[0].order.some((o: PromptOrderItem) => o.identifier === required.identifier)) {
                              parsedJson.preset.prompt_order[0].order.push({
                                identifier: required.identifier,
                                enabled: true
                              } as PromptOrderItem);
                            }
            }
            
            // Log the preset structure for debugging
            console.log('[CharacterEditDialog] DEBUG: Preset structure:', {
              hasPromptOrder: !!parsedJson.preset.prompt_order,
              promptOrderType: typeof parsedJson.preset.prompt_order,
              promptOrderLength: Array.isArray(parsedJson.preset.prompt_order) ? parsedJson.preset.prompt_order.length : 0,
              firstOrderType: typeof parsedJson.preset.prompt_order?.[0],
              firstOrderHasOrderProp: parsedJson.preset.prompt_order?.[0]?.order ? true : false,
              firstOrderOrderType: typeof parsedJson.preset.prompt_order?.[0]?.order,
              orderArrayLength: Array.isArray(parsedJson.preset.prompt_order?.[0]?.order) ? parsedJson.preset.prompt_order[0].order.length : 0,
              firstOrderItem: JSON.stringify(parsedJson.preset.prompt_order?.[0]),
              hasPrompts: !!parsedJson.preset.prompts,
              promptsLength: Array.isArray(parsedJson.preset.prompts) ? parsedJson.preset.prompts.length : 0
            });
            
            // Update the JSON data with fixed structure
            updatedCharacter.jsonData = JSON.stringify(parsedJson);
            
            // Debug log to see the complete structure
            console.log('[CharacterEditDialog] DEBUG: Complete character JSON structure:', parsedJson);
          } catch (parseError) {
            console.error('[CharacterEditDialog] Invalid JSON data:', parseError);
            Alert.alert(
              '更新失败',
              '角色数据格式无效，无法应用更改。请重试或联系支持。',
              [{ text: '确定', style: 'default' }]
            );
            return;
          }
        } else {
          throw new Error('角色数据为空，无法应用更改');
        }
        
        // Get latest API settings before update
        const apiKey = user?.settings?.chat?.characterApiKey || '';
        const currentApiSettings = getTypedApiSettings();
        
        // UPDATED LOGIC: Handle different character types properly
        console.log('[CharacterEditDialog] Character relationships:', characterRelationships);
        setIsProcessing(true);
        
        // 1. Determine which characters need to be updated
        if (characterRelationships.isCradleCharacter && characterRelationships.hasGeneratedVersion) {
          // This is a cradle character that has a generated version
          // We need to update both the cradle character and the generated character
          console.log('[CharacterEditDialog] This is a cradle character with a generated version');
          
          // 1a. First, update the generated character if it exists
          if (characterRelationships.normalCharacter) {
            const generatedCharacter = characterRelationships.normalCharacter;
            console.log('[CharacterEditDialog] Updating generated character:', generatedCharacter.id);
            
            // Create updated version of the generated character with the new JSON data
            const updatedGeneratedCharacter = {
              ...generatedCharacter,
              jsonData: updatedCharacter.jsonData,
              name: updatedCharacter.name,
              description: updatedCharacter.description,
              personality: updatedCharacter.personality || generatedCharacter.personality,
              updatedAt: Date.now()
            };
            
            // Send to NodeSTManager with "更新人设" status
            console.log('[CharacterEditDialog] Sending normal character update to NodeSTManager');
            
            // Fix: Pass the character object instead of using jsonString directly
            const response = await NodeSTManager.processChatMessage({
              userMessage: "",
              conversationId: updatedGeneratedCharacter.id,
              status: "更新人设",
              apiKey,
              apiSettings: currentApiSettings, // Use latest settings
              character: updatedGeneratedCharacter // Pass the whole character object
            });
            
            if (!response.success) {
              console.error('[CharacterEditDialog] NodeSTManager update failed for normal character:', response.error);
              throw new Error(`更新普通角色失败: ${response.error}`);
            }
            
            console.log('[CharacterEditDialog] Successfully updated normal character via NodeSTManager');
            
            // Update in storage
            await updateCharacter(updatedGeneratedCharacter);
            console.log('[CharacterEditDialog] Successfully updated normal character in storage');
          }
          
          // 1b. Then, update the cradle character too
          console.log('[CharacterEditDialog] Now updating cradle character:', character.id);
          
          // Create final cradle character with updated data but preserve cradle-specific fields
          const finalCradleCharacter: CradleCharacter = {
            ...(character as CradleCharacter),
            jsonData: updatedCharacter.jsonData,
            name: updatedCharacter.name,
            description: updatedCharacter.description,
            personality: updatedCharacter.personality || character.personality,
            updatedAt: Date.now(),
            cradleUpdatedAt: Date.now(),
            inCradleSystem: true, // Ensure it stays in cradle system
            isCradleGenerated: true
          };
          
          // Use onUpdateCharacter which was passed from cradle.tsx
          if (onUpdateCharacter) {
            await onUpdateCharacter(finalCradleCharacter);
            console.log('[CharacterEditDialog] Successfully updated cradle character via onUpdateCharacter');
          } else {
            console.warn('[CharacterEditDialog] onUpdateCharacter not provided, cannot update cradle character');
          }
        } else if (characterRelationships.isCradleCharacter) {
          // This is a regular cradle character without a generated version
          console.log('[CharacterEditDialog] This is a regular cradle character without a generated version');
          
          // Create final cradle character with updated data
          const finalCradleCharacter: CradleCharacter = {
            ...(character as CradleCharacter),
            jsonData: updatedCharacter.jsonData,
            name: updatedCharacter.name,
            description: updatedCharacter.description,
            personality: updatedCharacter.personality || character.personality,
            updatedAt: Date.now(),
            cradleUpdatedAt: Date.now(),
            inCradleSystem: true // Ensure it stays in cradle system
          };
          
          // Send update to NodeSTManager - Fix: Use the character object instead of jsonString
          console.log('[CharacterEditDialog] Sending cradle character update to NodeSTManager');
          const response = await NodeSTManager.processChatMessage({
            userMessage: "",
            conversationId: finalCradleCharacter.id,
            status: "更新人设",
            apiKey,
            apiSettings: currentApiSettings, // Use latest settings
            character: finalCradleCharacter // Pass the character object
          });
          
          if (!response.success) {
            console.error('[CharacterEditDialog] NodeSTManager update failed for cradle character:', response.error);
            throw new Error(`NodeSTManager处理失败: ${response.error}`);
          }
          
          // Use onUpdateCharacter from props
          if (onUpdateCharacter) {
            await onUpdateCharacter(finalCradleCharacter);
            console.log('[CharacterEditDialog] Successfully updated cradle character via onUpdateCharacter');
          } else {
            console.warn('[CharacterEditDialog] onUpdateCharacter not provided, falling back to updateCharacter');
            // Fall back to context's updateCharacter
            await updateCharacter(finalCradleCharacter as Character);
          }
        } else {
          // This is a regular character, not a cradle character
          console.log('[CharacterEditDialog] This is a regular character, not a cradle character');
          
          // Create the final character for update
          const finalCharacter = {
            ...character,
            jsonData: updatedCharacter.jsonData,
            name: updatedCharacter.name,
            description: updatedCharacter.description,
            personality: updatedCharacter.personality || character.personality,
            updatedAt: Date.now()
          };
          
          // Send to NodeSTManager - Fix: Use the character object instead of jsonString
          console.log('[CharacterEditDialog] Sending regular character update to NodeSTManager');
          const response = await NodeSTManager.processChatMessage({
            userMessage: "",
            conversationId: finalCharacter.id,
            status: "更新人设",
            apiKey,
            apiSettings: currentApiSettings, // Use latest settings
            character: finalCharacter // Pass the character object directly
          });
          
          if (!response.success) {
            console.error('[CharacterEditDialog] NodeSTManager update failed for regular character:', response.error);
            throw new Error(`NodeSTManager处理失败: ${response.error}`);
          }
          
          // Update in storage
          await updateCharacter(finalCharacter);
          console.log('[CharacterEditDialog] Successfully updated regular character in storage');
        }
        
        // Reset states after successful update
        setShowPreview(false);
        setHasChanges(false);
        
        // 新增：应用更改后插入一条系统消息
        setMessages(prev => [
          ...prev,
          {
            id: `system-applied-${Date.now()}`,
            text: '✅ 角色更改已生效！你可以继续修改角色或关闭此对话框。',
            sender: 'bot',
            timestamp: Date.now()
          }
        ]);

      } catch (error) {
        console.error('[CharacterEditDialog] Error applying changes:', error);

      } finally {
        setIsProcessing(false);
      }
    } 
    // If no updated character exists yet, but we have chat messages, try to generate one first
    else if (messages.length > 2) {
      Alert.alert(
        '需要生成更改',
        '需要先根据对话生成角色更改，然后才能应用。是否现在生成更改？',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '生成更改', 
            style: 'default',
            onPress: requestCharacterUpdate
          }
        ]
      );
    } 
    // If we don't have enough chat history yet
    else {
      Alert.alert(
        '无法更新角色',
        '请先与AI助手进行一些对话，讨论您希望对角色进行的修改。',
        [{ text: '我明白了', style: 'default' }]
      );
      console.log('[CharacterEditDialog] No updated character to apply, and not enough chat history');
    }
  };
  
  // Toggle preview mode
  const togglePreview = () => {
    // If we have character updates, toggle preview
    if (updatedCharacter) {
      setShowPreview(!showPreview);
    }
    // If no updates but we have chat history, offer to generate updates
    else if (messages.length > 2) {
      Alert.alert(
        '需要生成更改',
        '需要先根据对话生成角色更改，然后才能预览。是否现在生成更改？',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '生成更改', 
            style: 'default',
            onPress: async () => {
              await requestCharacterUpdate();
              // When updates are successfully generated, show preview
              if (updatedCharacter) {
                setShowPreview(true);
              }
            }
          }
        ]
      );
    }
    // Not enough chat history
    else {
      Alert.alert(
        '无法预览更改',
        '请先与AI助手进行一些对话，讨论您希望对角色进行的修改。',
        [{ text: '我明白了', style: 'default' }]
      );
    }
  };
  
  // Reset chat history
  const resetChatHistory = async () => {
    Alert.alert(
      '清除聊天记录',
      '确定要清除所有聊天记录吗？这将不会影响已保存的角色设定。',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '确定', 
          style: 'destructive',
          onPress: async () => {
            setMessages([]);
            await AsyncStorage.removeItem(dialogHistoryKey);
            
            // Send initial system message
            const initialMessage = getInitialSystemMessage();
            setMessages([
              {
                id: 'system-1',
                text: initialMessage,
                sender: 'bot',
                timestamp: Date.now()
              }
            ]);
          }
        }
      ]
    );
  };

  // Function to request character updates from LLM
  const requestCharacterUpdate = async () => {
    if (isGeneratingUpdate || messages.length < 2) {
      Alert.alert(
        '无法生成更新',
        '请先与AI助手进行对话，讨论您希望对角色进行的修改。',
        [{ text: '我知道了', style: 'default' }]
      );
      return;
    }
    
    setIsGeneratingUpdate(true);
    setIsProcessing(true);
    
    try {
      // Add a system message to request summary
      const summarizeMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        text: "请根据我们的对话，总结所有应该对角色进行的修改，并生成更新后的角色数据。请只提供roleCard的完整信息，worldBook条目的comment和content属性。系统会自动补充其他所需参数。请使用<CHARACTER_JSON_UPDATE>标签包裹JSON代码。",
        sender: 'user',
        timestamp: Date.now()
      };
      
      // Add the message to chat
      const updatedMessages = [...messages, summarizeMessage];
      setMessages(updatedMessages);
      
      // Format messages for LLM
      const formattedMessages = formatMessagesForLLM(updatedMessages);
      
      // Get latest API settings before request
      const apiKey = user?.settings?.chat?.characterApiKey || '';
      const currentApiSettings = getTypedApiSettings();
      
      // Get the appropriate adapter based on API settings
      const adapter = getAdapter(currentApiSettings, apiKey);
      
      // Send to LLM
      console.log('[CharacterEditDialog] 请求生成角色更新');
      const response = await adapter.generateContent(formattedMessages);
      
      // Add bot response to chat
      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        text: response,
        sender: 'bot',
        timestamp: Date.now()
      };
      
      setMessages([...updatedMessages, botMessage]);
      
      // Check if the response contains update instructions
      const updateResult = checkForUpdateInstructions(response);
      
      if (!updateResult.success) {
        // If no proper JSON was detected, try to create a basic update
        console.log('[CharacterEditDialog] 未检测到有效的JSON更新，尝试生成基础更新');
        await createBasicCharacterUpdate();
      }
    } catch (error) {
      console.error('[CharacterEditDialog] 生成角色更新失败:', error);
      
      // Add error message to chat
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: `error-${Date.now()}`,
          text: `错误: 生成角色更新失败: ${error instanceof Error ? error.message : '未知错误'}`,
          sender: 'bot',
          timestamp: Date.now()
        }
      ]);
      
      Alert.alert(
        '生成更新失败',
        '无法生成角色更新，请重试或手动编辑。',
        [{ text: '确定', style: 'default' }]
      );
    } finally {
      setIsGeneratingUpdate(false);
      setIsProcessing(false);
    }
  };
  
  // Create a basic character update from chat history if JSON update fails
  const createBasicCharacterUpdate = async () => {
    try {
      console.log('[CharacterEditDialog] 创建基础角色更新');
      
      // Get original character data
      let originalData: any = {};
      try {
        if (character.jsonData) {
          originalData = JSON.parse(character.jsonData);
        }
      } catch (err) {
        console.warn('[CharacterEditDialog] Cannot parse original character JSON:', err);
      }
      
      // If we have no original data, we can't update
      if (!originalData.roleCard || !originalData.worldBook) {
        throw new Error('无法读取原始角色数据，无法进行更新');
      }
      
      // Send a request to LLM to extract key changes from the conversation
      const extractionPrompt = `
请分析我们的对话，提取关键的角色修改信息，格式如下:

\`\`\`json
{
  "roleCard": {
    "name": "角色名称（如有变化）",
    "description": "角色描述（如有变化）",
    "personality": "角色性格（如有变化）",
    "scenario": "角色场景（如有变化）",
    "first_mes": "初始消息（如有变化）",
    "background": "背景故事（如有变化）"
  }
}
\`\`\`
      `;
      
      // Create extraction message
      const extractionMessage = {
        role: 'user',
        parts: [{ text: extractionPrompt }]
      };
      
      // Create a simplified message history for extraction
      const simpleHistory = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));
      
      // Get latest API settings before request
      const apiKey = user?.settings?.chat?.characterApiKey || '';
      const currentApiSettings = getTypedApiSettings();
      
      // Get the appropriate adapter based on API settings
      const adapter = getAdapter(currentApiSettings, apiKey);
      
      // Send to LLM
      const extractionResponse = await adapter.generateContent([...simpleHistory, extractionMessage]);
      
      // Extract JSON from response
      const jsonMatch = extractionResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch || !jsonMatch[1]) {
        throw new Error('无法提取角色修改信息');
      }
      
      const extractedData = JSON.parse(jsonMatch[1]);
      
      // Merge extracted data with original data - FIX: Be careful with worldBook
      const mergedData = {
        ...originalData,
        roleCard: {
          ...originalData.roleCard,
          ...extractedData.roleCard
        },
        // Explicitly keep the original worldBook
        worldBook: originalData.worldBook
      };
      
      // Convert the merged data back to JSON string
      const mergedJsonString = JSON.stringify(mergedData);
      console.log('[CharacterEditDialog] Created merged JSON data, length:', mergedJsonString.length);
      console.log('[CharacterEditDialog] Basic update worldBook entries count:', 
        Object.keys(mergedData.worldBook?.entries || {}).length);
      
      // Create an updated character with the new data
      const newCharacter = {
        ...character,
        jsonData: mergedJsonString,
        name: mergedData.roleCard?.name || character.name,
        description: mergedData.roleCard?.description || character.description,
        personality: mergedData.roleCard?.personality || character.personality
      };
      
      // Set the updated character and show preview
      setUpdatedCharacter(newCharacter);
      setHasChanges(true); // Explicitly set hasChanges to true
      console.log('[CharacterEditDialog] Set hasChanges to true');
      
      // Alert the user that changes are ready to preview
      Alert.alert(
        '角色设定更新准备就绪',
        '已根据你的要求生成了角色设定更新。请点击"预览更改"按钮查看更新内容，并决定是否应用这些更改。',
        [
          { text: '确定', style: 'default' }
        ]
      );
    } catch (error) {
      console.error('[CharacterEditDialog] 创建基础角色更新失败:', error);
      // Add error message to chat
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: `error-${Date.now()}`,
          text: `错误: 创建基础角色更新失败: ${error instanceof Error ? error.message : '未知错误'}`,
          sender: 'bot',
          timestamp: Date.now()
        }
      ]);
    }
  };

  // 优化后的聊天气泡渲染
  const renderChatBubbles = () => {
    return messages.map((message) => {
      const isUser = message.sender === 'user';

      // 检查是否为JSON_UPDATE消息
      const jsonUpdateMatch = message.text.match(/<CHARACTER_JSON_UPDATE>([\s\S]*?)<\/CHARACTER_JSON_UPDATE>/);

      if (jsonUpdateMatch) {
        // 渲染为一个“查看角色更改”按钮
        return (
          <View
            key={message.id}
            style={[
              styles.messageBubbleContainer,
              isUser ? styles.userMessageContainer : styles.botMessageContainer
            ]}
          >
            {!isUser && (
              <View style={styles.avatarContainer}>
                <Ionicons name="construct-outline" size={20} color="#fff" />
              </View>
            )}
            <View
              style={[
                styles.messageBubble,
                isUser ? styles.userMessageBubble : styles.botMessageBubble,
                { backgroundColor: '#276749' }
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  setJsonUpdateModalContent(jsonUpdateMatch[1].trim());
                  setJsonUpdateModalVisible(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 6,
                  paddingHorizontal: 8
                }}
              >
                <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
                  角色更改已生成，点击查看详情
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.messageTime}>
              {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })}
            </Text>
          </View>
        );
      }

      // 普通消息
      return (
        <View
          key={message.id}
          style={[
            styles.messageBubbleContainer,
            isUser ? styles.userMessageContainer : styles.botMessageContainer
          ]}
        >
          {/* Avatar or icon for the sender */}
          {!isUser && (
            <View style={styles.avatarContainer}>
              <Ionicons name="construct-outline" size={20} color="#fff" />
            </View>
          )}

          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userMessageBubble : styles.botMessageBubble
            ]}
          >
            <Text style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.botMessageText
            ]}>
              {message.text}
            </Text>
          </View>

          {/* Time indicator (simplified) */}
          <Text style={styles.messageTime}>
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })}
          </Text>
        </View>
      );
    });
  };

  // Render preview of updated character - Enhanced to show more character details
  const renderPreview = () => {
    if (!updatedCharacter) return null;
    
    let jsonData: any = null;
    let originalData: any = null;
    let updatedComponents: string[] = [];
    
    try {
      // Parse the updated character data
      jsonData = JSON.parse(updatedCharacter.jsonData || '{}');
      
      // Try to parse the original character data for comparison
      if (character.jsonData) {
        originalData = JSON.parse(character.jsonData);
        
        // Determine which components were updated
        if (jsonData.roleCard && JSON.stringify(jsonData.roleCard) !== JSON.stringify(originalData.roleCard)) {
          updatedComponents.push('基本信息');
        }
        
        if (jsonData.worldBook && JSON.stringify(jsonData.worldBook) !== JSON.stringify(originalData.worldBook)) {
          updatedComponents.push('世界书条目');
        }
        
        if (jsonData.preset && JSON.stringify(jsonData.preset) !== JSON.stringify(originalData.preset)) {
          updatedComponents.push('自定义提示');
        }
      } else {
        // If no original data, assume everything is new
        if (jsonData.roleCard) updatedComponents.push('基本信息');
        if (jsonData.worldBook) updatedComponents.push('世界书条目');
        if (jsonData.preset) updatedComponents.push('自定义提示');
      }
    } catch (error) {
      console.error('Failed to parse character data:', error);
    }
    
    return (
      <View style={styles.previewContainer}>
        <ScrollView style={styles.previewScroll}>
          <Text style={styles.previewTitle}>预览角色更改</Text>
          
          {/* Show which components were updated */}
          {updatedComponents.length > 0 && (
            <View style={styles.updatedComponentsContainer}>
              <Text style={styles.updatedComponentsLabel}>已更新的组件：</Text>
              <View style={styles.componentsTagsContainer}>
                {updatedComponents.map((component, index) => (
                  <View key={index} style={styles.componentTag}>
                    <Text style={styles.componentTagText}>{component}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          
          {/* Role Card Basic Information Section - Only show if roleCard exists */}
          {jsonData?.roleCard && (
            <View style={styles.previewSectionContainer}>
              <Text style={styles.previewSectionTitle}>基本信息</Text>
              
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>名称:</Text>
                <Text style={styles.previewValue}>{updatedCharacter.name}</Text>
              </View>
              
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>描述:</Text>
                <Text style={styles.previewValue}>{updatedCharacter.description}</Text>
              </View>
              
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>性格:</Text>
                <Text style={styles.previewValue}>{updatedCharacter.personality || "未设置"}</Text>
              </View>
              
              {jsonData?.roleCard?.scenario && (
                <View style={styles.previewSection}>
                  <Text style={styles.previewLabel}>场景:</Text>
                  <Text style={styles.previewValue}>{jsonData.roleCard.scenario}</Text>
                </View>
              )}
            </View>
          )}
          
          {/* Initial Message Section */}
          {jsonData?.roleCard?.first_mes && (
            <View style={styles.previewSectionContainer}>
              <Text style={styles.previewSectionTitle}>初始消息</Text>
              <View style={styles.previewSection}>
                <Text style={styles.previewValue}>{jsonData.roleCard.first_mes}</Text>
              </View>
            </View>
          )}
          
          {/* Message Examples Section */}
          {jsonData?.roleCard?.mes_example && (
            <View style={styles.previewSectionContainer}>
              <Text style={styles.previewSectionTitle}>对话示例</Text>
              <View style={styles.previewSection}>
                <Text style={styles.previewValue}>{jsonData.roleCard.mes_example}</Text>
              </View>
            </View>
          )}
          
          {/* World Book Section */}
          {jsonData?.worldBook?.entries && Object.keys(jsonData.worldBook.entries).length > 0 && (
            <View style={styles.previewSectionContainer}>
              <Text style={styles.previewSectionTitle}>世界书条目</Text>
              
              {Object.entries(jsonData.worldBook.entries).map(([key, entry]: [string, any]) => (
                <View key={key} style={styles.previewSection}>
                  <View style={styles.worldBookEntryHeader}>
                    <Text style={styles.worldBookEntryTitle}>{key}</Text>
                    <Text style={styles.worldBookEntryType}>{entry.comment}</Text>
                  </View>
                  <Text style={styles.previewValue}>{entry.content}</Text>
                </View>
              ))}
            </View>
          )}
          
          {/* Prompts Section */}
          {jsonData?.preset?.prompts && jsonData.preset.prompts.length > 0 && (
            <View style={styles.previewSectionContainer}>
              <Text style={styles.previewSectionTitle}>自定义提示</Text>
              
              {jsonData.preset.prompts.map((prompt: any, index: number) => (
                <View key={index} style={styles.previewSection}>
                  <View style={styles.promptHeader}>
                    <Text style={styles.promptTitle}>{prompt.name}</Text>
                    <Text style={[
                      styles.promptRole, 
                      prompt.role === 'user' ? styles.userRole : styles.modelRole
                    ]}>
                      {prompt.role === 'user' ? '用户' : '模型'}
                    </Text>
                  </View>
                  <Text style={styles.previewValue}>{prompt.content}</Text>
                </View>
              ))}
            </View>
          )}
          
          {/* Action Buttons */}
          <View style={styles.previewButtonContainer}>
            <TouchableOpacity
              style={styles.cancelPreviewButton}
              onPress={togglePreview}
            >
              <Text style={styles.cancelPreviewButtonText}>关闭预览</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.applyChangesButton}
              onPress={handleApplyChanges}
            >
              <Text style={styles.applyChangesButtonText}>应用更改</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  const getBackgroundImage = () => {
    // Use the character's background image if available, otherwise use a default
    if (character.backgroundImage) {
      return character.backgroundImage;
    } else if (character.localBackgroundImage) {
      return character.localBackgroundImage;
    }
    // Return a default background or null
    return null;
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.fullScreenContainer}>
        <BlurView intensity={30} tint="dark" style={styles.fullScreenBlurView}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>编辑角色：{character.name}</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={resetChatHistory}
              >
                <Ionicons name="refresh" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={onClose}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Action buttons bar */}
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                hasChanges ? styles.actionButtonActive : styles.actionButtonDisabled
              ]}
              onPress={togglePreview}
              disabled={!hasChanges && !updatedCharacter}
            >
              <Ionicons 
                name="eye-outline" 
                size={18} 
                color={hasChanges ? "#fff" : "#888"} 
                style={styles.actionButtonIcon} 
              />
              <Text style={[
                styles.actionButtonText, 
                hasChanges ? styles.actionButtonTextActive : styles.actionButtonTextDisabled
              ]}>
                预览更改{hasChanges ? ' ✓' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                hasChanges ? styles.actionButtonActive : styles.actionButtonDisabled
              ]}
              onPress={handleApplyChanges}
              disabled={!hasChanges && !updatedCharacter}
            >
              <Ionicons 
                name="checkmark-circle-outline" 
                size={18} 
                color={hasChanges ? "#fff" : "#888"} 
                style={styles.actionButtonIcon} 
              />
              <Text style={[
                styles.actionButtonText, 
                hasChanges ? styles.actionButtonTextActive : styles.actionButtonTextDisabled
              ]}>
                应用更改{hasChanges ? ' ✓' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                messages.length > 2 ? styles.actionButtonActive : styles.actionButtonDisabled
              ]}
              onPress={requestCharacterUpdate}
              disabled={messages.length <= 2 || isGeneratingUpdate}
            >
              <Ionicons 
                name="refresh-outline" 
                size={18} 
                color={messages.length > 2 ? "#fff" : "#888"} 
                style={styles.actionButtonIcon} 
              />
              <Text style={[
                styles.actionButtonText, 
                messages.length > 2 ? styles.actionButtonTextActive : styles.actionButtonTextDisabled
              ]}>
                {isGeneratingUpdate ? '生成中...' : '生成更改'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Preview (conditionally rendered) */}
          {showPreview ? renderPreview() : (
            <>
              {/* Chat area with background image */}
              <View style={styles.chatAreaContainer}>
                {getBackgroundImage() && (
                  <Image
                    source={getBackgroundImage() ? { uri: String(getBackgroundImage()) } : undefined}
                    style={styles.chatBackgroundImage}
                    blurRadius={5}
                  />
                )}
                <View style={styles.chatBackgroundOverlay} />
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.chatArea}
                  contentContainerStyle={styles.chatContainer}
                >
                  {renderChatBubbles()}
                  {isProcessing && (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#ff9f1c" />
                      <Text style={styles.loadingText}>处理中...</Text>
                    </View>
                  )}
                </ScrollView>
                {/* 新增：渲染JSON更新详情弹窗 */}
                {renderJsonUpdateModal()}
              </View>
              {/* Input area */}
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder="输入要修改的内容..."
                  placeholderTextColor="#888"
                  multiline
                  numberOfLines={3}
                  maxLength={1000}
                  editable={!isProcessing}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!input.trim() || isProcessing) && styles.sendButtonDisabled]}
                  disabled={!input.trim() || isProcessing}
                  onPress={handleSendMessage}
                >
                  <Ionicons 
                    name="send" 
                    size={24} 
                    color={input.trim() && !isProcessing ? "#ff9f1c" : "#666"} 
                  />
                </TouchableOpacity>
              </View>
            </>
          )}
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  fullScreenBlurView: {
    flex: 1,
    borderRadius: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.select({
      ios: 44,
      android: 24,
      default: 24,
    }),
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  actionBar: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: 'rgba(40,40,40,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  actionButtonActive: {
    backgroundColor: '#ff9f1c',
  },
  actionButtonDisabled: {
    backgroundColor: '#444',
  },
  actionButtonIcon: {
    marginRight: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionButtonTextActive: {
    color: '#fff',
  },
  actionButtonTextDisabled: {
    color: '#888',
  },
  chatAreaContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    margin: 4,
  },
  chatBackgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.2,
  },
  chatBackgroundOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(30, 30, 30, 0.7)',
  },
  chatArea: {
    flex: 1,
    zIndex: 2,
  },
  chatContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubbleContainer: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '85%',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  botMessageContainer: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff9f1c',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
    maxWidth: '90%',
    minWidth: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  userMessageBubble: {
    backgroundColor: '#ff9f1c',
    borderBottomRightRadius: 4,
    marginLeft: 'auto',
  },
  botMessageBubble: {
    backgroundColor: 'rgba(68, 68, 68, 0.9)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    marginHorizontal: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(51, 51, 51, 0.8)',
    borderRadius: 20,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButton: {
    marginLeft: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonActive: {
    backgroundColor: '#ff9f1c',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(51, 51, 51, 0.8)',
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
  },
  loadingText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
  },
  // 预览部分样式对齐MemoOverlay
  previewContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(30,30,30,0.98)',
  },
  previewScroll: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  previewSectionContainer: {
    marginBottom: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(60,60,60,0.6)',
    padding: 12,
  },
  previewSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    paddingBottom: 8,
  },
  previewSection: {
    marginBottom: 16,
    backgroundColor: 'rgba(42,42,42,0.9)',
    padding: 12,
    borderRadius: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 16,
    color: '#fff',
  },
  worldBookEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  worldBookEntryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff9f1c',
  },
  worldBookEntryType: {
    fontSize: 12,
    color: '#aaa',
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  promptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff9f1c',
  },
  promptRole: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userRole: {
    backgroundColor: '#2C5282',
    color: '#fff',
  },
  modelRole: {
    backgroundColor: '#276749',
    color: '#fff',
  },
  previewButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 32,
  },
  cancelPreviewButton: {
    backgroundColor: '#555',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelPreviewButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  applyChangesButton: {
    backgroundColor: '#ff9f1c',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
  applyChangesButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  updatedComponentsContainer: {
    backgroundColor: '#333',
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
  },
  updatedComponentsLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  componentsTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  componentTag: {
    backgroundColor: '#ff9f1c',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  componentTagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
