import { RoleCardJson, WorldBookJson } from '@/shared/types';
import { GeminiAdapter } from '../utils/gemini-adapter';
import { OpenRouterAdapter } from '../utils/openrouter-adapter';
import { OpenAIAdapter } from '../utils/openai-adapter';
import { getApiSettings } from '@/utils/settings-helper';

/**
 * 投喂数据类型
 */
export enum FeedType {
  ABOUT_ME = "aboutMe",     // 关于角色自身的信息
  MATERIAL = "material",    // 角色素材
  KNOWLEDGE = "knowledge"   // 角色知识
}

/**
 * 投喂数据
 */
export interface FeedData {
  id: string;               // 数据ID
  content: string;          // 内容
  type: FeedType;           // 类型
  timestamp: number;        // 时间戳
  processed: boolean;       // 是否已处理
}

/**
 * 初始角色数据
 */
export interface CharacterInitialData {
  name?: string;            // 角色名称
  description?: string;     // 描述
  personality?: string;     // 性格特点
  initialPrompt?: string;   // 初始提示词
  // Add new fields for appearance and VNDB data
  appearanceTags?: {        // 外观标签
    positive: string[];     // 正向标签
    negative: string[];     // 负向标签
  };
  traits?: string[];        // 角色特征
  vndbResults?: any[];      // VNDB检索结果
  initialSettings?: {       // 初始设置
    userGender: string; 
    characterGender:  string;    // 用户性别
}
}
/**
 * 角色生成结果
 */
export interface CharacterGenerationResult {
  success: boolean;         // 是否成功
  roleCard?: RoleCardJson;  // 角色卡
  worldBook?: WorldBookJson; // 世界书
  preset?: {}        // 预设
  error?: string;           // 错误信息
  isCradleGeneration?: boolean; // 是否生成了摇篮数据  
}

/**
 * R框架条目
 */
interface RFrameworkEntry {
  name: string;
  content: string;
  role: string;
  identifier: string;
}

/**
 * 提示词构建服务
 * 处理提示词构建和文本处理
 */
export class PromptBuilderService {
  /**
   * 创建R框架条目
   */
  static createRFrameworkEntry(entry: {
    name: string;
    content: string;
    role: string;
    identifier: string;
  }): RFrameworkEntry {
    return {
      name: entry.name,
      content: entry.content,
      role: entry.role,
      identifier: entry.identifier
    };
  }

  /**
   * 构建提示词
   */
  static buildPrompt({
    rFramework
  }: {
    rFramework: RFrameworkEntry[];
  }): Array<{ role: string; parts: Array<{ text: string }> }> {
    const messages: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    rFramework.forEach((entry) => {
      messages.push({
        role: entry.role,
        parts: [{ text: entry.content }]
      });
    });

    return messages;
  }

  /**
   * 消息转文本
   */
  static messagesToText(messages: Array<{ role: string; parts: Array<{ text: string }> }>): string {
    return messages
      .map((msg) => {
        const role = msg.role.toUpperCase();
        const text = msg.parts.map((part) => part.text).join('\n');
        return `${role}:\n${text}`;
      })
      .join('\n\n');
  }

  /**
   * 构建角色生成提示词
   */
  static buildCharacterGenerationPrompt(data: {
    appearanceTags?: { positive: string[], negative: string[] },
    traits?: string[],
    vndbResults?: any[],
    userGender?: 'male' | 'female' | 'other' | undefined
    description?: string
  }): string {
    const parts: string[] = [];

    // Add appearance tags section if available
    if (data.appearanceTags && 
        (data.appearanceTags.positive.length > 0 || data.appearanceTags.negative.length > 0)) {
      parts.push(`## 角色外观参考信息

这是用户选择的角色外观标签:

### 正向标签:
${data.appearanceTags.positive.join(', ')}

### 负向标签:
${data.appearanceTags.negative.join(', ')}

请根据这些标签想象角色的外观，并将这些特征融入到角色设定中。`);
    }

    // Add traits section if available
    if (data.traits && data.traits.length > 0) {
      parts.push(`## 角色特征参考

用户选择了以下特征作为角色的性格基础:
${data.traits.join(', ')}

请确保这些特征在角色设定中得到体现，创造符合这些特征的个性、行为模式和对话风格。`);
    }

    // Add user's description if available
    if (data.description) {
      parts.push(`## 用户描述

${data.description}

请将用户提供的描述整合到角色设定中。`);
    }

    // Add user gender context if available
    if (data.userGender) {
      const genderText = data.userGender === 'male' ? '男性' : 
                          data.userGender === 'female' ? '女性' : '其他性别';
      parts.push(`## 用户信息

用户是${genderText}，请确保角色适合与该性别用户互动。`);
    }

    // Add VNDB results section if available
    if (data.vndbResults && data.vndbResults.length > 0) {
      parts.push(`## VNDB 角色参考

以下是从视觉小说数据库中检索到的相关角色信息，可以作为创作参考:

${JSON.stringify(data.vndbResults, null, 2)}

你可以从这些角色中获取灵感，但请确保创建的是原创角色，避免直接复制现有角色。`);
    }

    // Add the generation guidance instructions
    parts.push(`## 角色生成指南

请基于上述信息生成一个完整、有深度的角色设定。你需要:

1. 角色塑造: 构建角色的性格、背景故事、技能、外貌特征等。
2. 故事叙述: 将角色的设定融入到恰当的故事背景中。
3. 细节刻画: 加入细节，让角色更加真实，包括角色的口头禅、习惯动作、特殊爱好等。
4. 对话示例: 提供几个角色对话示例，展现角色的说话风格和性格特点。

请使用以下JSON格式返回角色设定:`);

    // Add output format instruction
    parts.push(`\`\`\`json
{
  "role_card": {
    "name": "角色名称",
    "first_mes": "角色的初始消息",
    "description": "角色简短描述",
    "personality": "角色性格描述",
    "scenario": "角色所处的情境/背景",
    "mes_example": "对话示例",
    "background": "背景故事（可选）"
  },
  "world_book": {
    "entries": {
      "Alist": {
        "comment": "Character Attributes List",
        "content": "在这里输出：\\n<attributes>\\n  <personality>性格特点</personality>\\n  <appearance>外观描述</appearance>\\n  <likes>喜好</likes>\\n  <dislikes>厌恶</dislikes>\\n</attributes>",
        "disable": false,
        "position": 4,
        "constant": true,
        "key": [],
        "order": 1,
        "depth": 1,
        "vectorized": false
      },
      "Plist": {
        "comment": "Character Dialogue Examples",
        "content": "在这里输出对话示例",
        "disable": false,
        "position": 4,
        "constant": true,
        "key": [],
        "order": 2,
        "depth": 1,
        "vectorized": false
      },
      "背景": {
        "comment": "Character Background",
        "content": "在这里输出详细的背景故事",
        "disable": false,
        "position": 3,
        "constant": true,
        "key": [],
        "order": 3,
        "depth": 1,
        "vectorized": false
      }
    }
  }
}
\`\`\``);

    return parts.join('\n\n');
  }
}

/**
 * 角色生成器服务
 * 负责使用LLM生成角色设定
 */
export class CharacterGeneratorService {
  private llmAdapter: GeminiAdapter | OpenRouterAdapter;
  private roleCard: RoleCardJson | null = null;
  private worldBook: WorldBookJson | null = null;

  constructor(adapter: GeminiAdapter | OpenRouterAdapter) {
    this.llmAdapter = adapter;
  }

  /**
   * 生成初始角色
   */
  async generateInitialCharacter(initialData: CharacterInitialData): Promise<CharacterGenerationResult> {
    try {
      // === 新增：动态获取API设置 ===
      const apiSettings = getApiSettings();
      const provider = apiSettings.apiProvider;
      let llmAdapter: any = null;
      let useOpenAICompatible = false;

      // 记录当前provider
      console.log(`[角色生成服务] 当前API Provider: ${provider}`);

      // 动态选择adapter
      if (provider === 'gemini') {
        llmAdapter = new GeminiAdapter(apiSettings.apiKey || '');
      } else if (provider === 'openrouter') {
        llmAdapter = new OpenRouterAdapter(
          apiSettings.openrouter?.apiKey || '',
          apiSettings.openrouter?.model || 'anthropic/claude-3-haiku'
        );
      } else if (provider === 'openai-compatible') {
        // OpenAI-compatible 需要特殊处理
        useOpenAICompatible = true;
        llmAdapter = new OpenAIAdapter({
          endpoint: apiSettings.OpenAIcompatible?.endpoint || '',
          apiKey: apiSettings.OpenAIcompatible?.apiKey || '',
          model: apiSettings.OpenAIcompatible?.model || 'gpt-3.5-turbo'
        });
      } else {
        throw new Error(`不支持的API Provider: ${provider}`);
      }

      // 确定使用的API类型
      const isGemini = provider === 'gemini';
      const isOpenRouter = provider === 'openrouter';
      const isOpenAICompatible = provider === 'openai-compatible';
      const assistantRole = isGemini ? "model" : isOpenRouter ? "assistant" : "assistant";

      console.log(`[角色生成服务] 使用API提供商: ${isGemini ? 'Gemini' : 'OpenRouter'}, 助手角色名: ${assistantRole}`);
      
      // 创建完整的提示词
      const systemPrompt = `你是一个专业的AI角色设计师，能够根据用户提供的初始数据创建独特、有深度的角色档案。
你的任务是生成一个格式化的角色卡片和相应的世界书，以便AI聊天机器人能够准确扮演这个角色。
必须为每个角色生成以下内容：
1. 角色卡片，包含基本信息、个性特征和初始消息
2. 世界书，包含详细的角色设定，以便AI更好地理解和扮演角色
请根据提供的初始数据进行创造性扩展，确保角色设定连贯、合理、有深度。`;

      // 构建详细的角色创建指令
      let userInstructions = "";
      
      // 添加名称和描述
      if (initialData.name) {
        userInstructions += `名称：${initialData.name}\n\n`;
      }
      
      if (initialData.description) {
        userInstructions += `描述：${initialData.description}\n\n`;
      }

      // 添加角色性别信息 - 新增部分
      let characterGender = "未指定";
      if (initialData.initialSettings?.characterGender) {
        characterGender = initialData.initialSettings.characterGender === 'male' ? '男性' : 
                         initialData.initialSettings.characterGender === 'female' ? '女性' : '其他';
        userInstructions += `## 角色性别\n\n角色性别: ${characterGender}\n\n`;
      }

      // 添加外观标签信息
      if (initialData.appearanceTags && 
          (initialData.appearanceTags.positive.length > 0 || 
           initialData.appearanceTags.negative.length > 0)) {
        userInstructions += "## 角色外观参考信息\n\n";
        
        if (initialData.appearanceTags.positive.length > 0) {
          userInstructions += "### 正向标签:\n";
          userInstructions += initialData.appearanceTags.positive.join(', ') + "\n\n";
        }
        
        if (initialData.appearanceTags.negative.length > 0) {
          userInstructions += "### 负向标签:\n";
          userInstructions += initialData.appearanceTags.negative.join(', ') + "\n\n";
        }
        
        userInstructions += "请根据这些标签想象角色的外观，并将这些特征融入到角色设定中。\n\n";
      }

      // 添加性格特征信息
      if (initialData.traits && initialData.traits.length > 0) {
        userInstructions += "## 角色特征参考\n\n";
        userInstructions += "用户选择了以下特征作为角色的性格基础:\n";
        userInstructions += initialData.traits.join(', ') + "\n\n";
        userInstructions += "请确保这些特征在角色设定中得到体现，创造符合这些特征的个性、行为模式和对话风格。\n\n";
      }

      // 添加用户性别信息
      if (initialData.initialSettings?.userGender) {
        const genderText = initialData.initialSettings.userGender === 'male' ? '男性' : 
                         initialData.initialSettings.userGender === 'female' ? '女性' : '其他性别';
                        
        userInstructions += "## 用户信息\n\n";
        userInstructions += `用户是${genderText}，请确保角色适合与该性别用户互动。\n\n`;
      }

      // 添加VNDB数据
      if (initialData.vndbResults) {
        userInstructions += "## VNDB 角色参考\n\n";
        userInstructions += "以下是从视觉小说数据库中检索到的相关角色信息，可以作为创作参考:\n\n";
        
        if (typeof initialData.vndbResults === 'string') {
          userInstructions += initialData.vndbResults + "\n\n";
        } else {
          userInstructions += JSON.stringify(initialData.vndbResults, null, 2) + "\n\n";
        }
        
        userInstructions += "你可以从这些角色中获取灵感，但请确保创建的是原创角色，避免直接复制现有角色。\n\n";
      }

      // 生成指南和输出格式
      const outputFormatPrompt = `## 角色生成指南

请基于上述信息生成一个完整、有深度的角色设定。你需要:

1. 角色塑造: 构建角色的性格、背景故事、技能、外貌特征等。
2. 故事叙述: 将角色的设定融入到恰当的故事背景中。
3. 细节刻画: 加入细节，让角色更加真实，包括角色的口头禅、习惯动作、特殊爱好等。
4. 对话示例: 提供几个角色对话示例，展现角色的说话风格和性格特点。

请按照以下JSON格式输出你的角色设计结果，使用Markdown代码块包裹:

\`\`\`json
{
  "role_card": {
    "name": "角色名称",
    "first_mes": "角色的初始消息",
    "description": "角色简短描述",
    "personality": "角色性格描述",
    "scenario": "角色所处的情境/背景",
    "mes_example": "对话示例",
    "background": "背景故事（可选）"
  },
  "world_book": {
    "entries": {
      "Alist": {
        "comment": "Character Attributes List",
        "content": "在这里输出：\\n<attributes>\\n  <personality>性格特点</personality>\\n  <appearance>外观描述</appearance>\\n  <likes>喜好</likes>\\n  <dislikes>厌恶</dislikes>\\n</attributes>"
      },
      "Plist": {
        "comment": "Character Dialogue Examples",
        "content": "在这里输出对话示例"
      },
      "背景": {
        "comment": "Character Background",
        "content": "在这里输出详细的背景故事"
      }
    }
  }
}
\`\`\`

注意：请务必确保生成的JSON格式正确。特别重要的是：
1. 不要在JSON键值对中使用未转义的双引号或反斜杠
2. 请使用标准的JSON语法，所有键名都应该用双引号包裹
3. 不要在JSON中使用注释或多余的符号
4. 确保所有字符串值都被正确地双引号包裹`;

      // 构建消息序列
      const messages = [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: assistantRole, parts: [{ text: "我理解了，我将按照要求设计一个角色。请提供您想要的角色的初始信息。" }] },
        { role: "user", parts: [{ text: userInstructions }] },
        { role: "user", parts: [{ text: outputFormatPrompt }] }
      ];

      // === 新增：OpenAI-compatible 走chatCompletion ===
      let response: string;
      if (useOpenAICompatible) {
        // 转换为OpenAI格式的消息
        const openaiMessages = messages.map(msg => {
          // 只取第一个parts.text
          let content = msg.parts?.[0]?.text || '';
          let role = msg.role;
          if (role === 'model') role = 'assistant';
          if (role === 'user') role = 'user';
          if (role === 'system') role = 'system';
          return { role, content };
        });
        // 调用chatCompletion
        const completion = await llmAdapter.chatCompletion(openaiMessages, {
          temperature: 0.7,
          max_tokens: 4096
        });
        response = completion.choices?.[0]?.message?.content || '';
      } else {
        // 其它渠道用generateContent
        response = await llmAdapter.generateContent(messages);
      }

      // 解析响应
      const result = this.parseGeminiResponse(response);

      if (result.success) {
        this.roleCard = result.roleCard ?? null;
        this.worldBook = result.worldBook ?? null;
        console.log("[角色生成服务] 成功解析角色数据");
      } else {
        console.error("[角色生成服务] 解析响应失败:", result.error);
      }
      
      return result;
    } catch (error) {
      console.error("[角色生成服务] 生成角色时出错:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误"
      };
    }
  }

  /**
   * 使用投喂数据更新角色
   */
  async updateWithFeeds(feeds: FeedData[]): Promise<CharacterGenerationResult> {
    try {
      if (!this.roleCard) {
        return {
          success: false,
          error: "无法更新角色：未找到基础角色数据"
        };
      }

      console.log(`使用 ${feeds.length} 条投喂数据更新角色`);

      // 按类型分组投喂数据
      const feedsByType = this.groupFeedsByType(feeds);
      
      // 构建R框架条目
      const rFramework: RFrameworkEntry[] = [
        PromptBuilderService.createRFrameworkEntry({
          name: "Task Description",
          content: this.getUpdaterSystemPrompt(),
          role: "user",
          identifier: "task_description"
        }),
        PromptBuilderService.createRFrameworkEntry({
          name: "Current Character",
          content: this.formatCurrentCharacter(),
          role: "user",
          identifier: "current_character"
        }),
        PromptBuilderService.createRFrameworkEntry({
          name: "New Feeds",
          content: this.formatFeedData(feedsByType),
          role: "user",
          identifier: "new_feeds"
        }),
        PromptBuilderService.createRFrameworkEntry({
          name: "Output Format",
          content: this.getOutputFormatPrompt(),
          role: "user",
          identifier: "output_format"
        })
      ];

      // 构建提示词
      const messages = PromptBuilderService.buildPrompt({ rFramework });
      
      // 发送到LLM
      const response = await this.llmAdapter.generateContent(messages);
      
      // 解析响应
      const result = this.parseGeminiResponse(response);
      
      if (result.success) {
        this.roleCard = result.roleCard ?? this.roleCard;
        this.worldBook = result.worldBook ?? this.worldBook;
      }
      
      return result;
    } catch (error) {
      console.error("更新角色时出错:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误"
      };
    }
  }

  /**
   * 获取当前角色数据
   */
  getCurrentCharacterData(): { roleCard?: RoleCardJson; worldBook?: WorldBookJson } {
    return {
      roleCard: this.roleCard || undefined,
      worldBook: this.worldBook || undefined
    };
  }

  /**
   * 重置角色生成器状态
   */
  reset(): void {
    this.roleCard = null;
    this.worldBook = null;
  }

  /**
   * 解析Gemini响应
   */
  private parseGeminiResponse(response: string): CharacterGenerationResult {
    try {
      console.log("[解析器] 开始解析LLM响应");
      console.log("[解析器] 响应文本长度:", response.length);
      
      // 正则表达式查找JSON部分，支持多种格式
      // 1. 标准markdown代码块 ```json ... ```
      // 2. 单行代码块 ``` ... ```
      // 3. 裸JSON格式 { ... }
      let jsonStr = '';
      
      // 首先尝试提取markdown代码块
      const codeBlockMatch = response.match(/```(?:json)?\s*\n*([\s\S]*?)\n*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        console.log("[解析器] 在代码块中找到JSON");
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // 如果没有代码块，尝试查找裸JSON (以 { 开头，以 } 结尾的部分)
        const jsonMatch = response.match(/(\{[\s\S]*\})/);
        if (jsonMatch && jsonMatch[1]) {
          console.log("[解析器] 找到裸JSON格式");
          jsonStr = jsonMatch[1].trim();
        } else {
          console.error("[解析器] 在响应中找不到有效的JSON格式");
          return {
            success: false,
            error: "无法解析LLM响应：未找到有效JSON"
          };
        }
      }
      
      // 增强的JSON清洗和修复
      console.log("[解析器] 开始清洗和修复JSON字符串");
  
      // 完全清理引号问题 - 修复艾莉丝这样的例子
      // 步骤1：先找出所有键值对中的值部分（即冒号后面的部分）
      jsonStr = jsonStr.replace(/"([^"]+)":\s*"([^"]*)\\?"/g, (match, key, value) => {
        // 对于键值对中的值，如果值以引号结尾且没有转义，将其替换为转义的引号
        return `"${key}": "${value.replace(/\\/g, '').replace(/"/g, '\\"')}"`;
      });
      
      // 步骤2：修复数组中的问题
      jsonStr = jsonStr.replace(/\[(.*?)\]/gs, (match, content) => {
        // 修复数组中的引号问题
        return `[${content.replace(/([^\\])"/g, '$1\\"').replace(/^"/, '\\"').replace(/"(?=\s*,|\s*$)/, '\\""').replace(/\\\\"/g, '\\"')}]`;
      });
      
      // 步骤3: 处理控制字符 (U+0000 through U+001F)
      jsonStr = jsonStr.replace(/[\u0000-\u001F]/g, '');
      
      // 步骤4: 处理特殊情况下的反斜杠
      jsonStr = jsonStr.replace(/\\{3,}/g, '\\\\');  // 多余的反斜杠变成两个
      
      // 步骤5: 处理键名对象中可能缺失的引号
      jsonStr = jsonStr.replace(/({|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      
      // 步骤6: 处理引号转义不正确的情况
      jsonStr = jsonStr.replace(/":\\"/g, '":"');
      jsonStr = jsonStr.replace(/",\\"/g, '","');
      
      // 最后的清理 - 修复代码块中常见的格式问题
      jsonStr = jsonStr
        .replace(/\\n/g, '\\n')       // 确保换行符被正确转义
        .replace(/\\t/g, '\\t')       // 确保制表符被正确转义
        .replace(/\\\s+"/g, '\\"')    // 空格+引号问题
        .replace(/"\s*\\"/g, '"\\"')  // 引号+转义问题
        .replace(/"\\/g, '"\\\\')     // 确保反斜杠被正确转义
        .replace(/\\"/g, '"');        // 最后，移除前面所有替换产生的多余反斜杠
      
      console.log("[解析器] 清洗后的JSON字符串预览:", jsonStr.substring(0, 100) + "...");
      
      // 尝试解析JSON，如果失败则进行更多修复
      try {
        // 提取出重要部分，然后手动构建一个新的有效JSON
        console.log("[解析器] 尝试提取关键属性重新构建JSON");
        
        // 提取角色名称
        const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)(?:\\"|")/);
        const name = nameMatch ? nameMatch[1].trim() : "未知角色";
        
        // 提取角色初始消息
        const firstMesMatch = jsonStr.match(/"first_mes"\s*:\s*"([^"]+)(?:\\"|")/);
        const firstMes = firstMesMatch ? firstMesMatch[1].trim() : "你好，很高兴认识你！";
        
        // 提取角色描述
        const descriptionMatch = jsonStr.match(/"description"\s*:\s*"([^"]+)(?:\\"|")/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : "这是一个角色";
        
        // 提取角色性格
        const personalityMatch = jsonStr.match(/"personality"\s*:\s*"([^"]+)(?:\\"|")/);
        const personality = personalityMatch ? personalityMatch[1].trim() : "友好";
        
        // 提取角色场景
        const scenarioMatch = jsonStr.match(/"scenario"\s*:\s*"([^"]+)(?:\\"|")/);
        const scenario = scenarioMatch ? scenarioMatch[1].trim() : "";
        
        // 提取角色示例消息
        const mesExampleMatch = jsonStr.match(/"mes_example"\s*:\s*(?:\[(.*?)\]|"([^"]+)(?:\\"|"))/s);
        const mesExample = mesExampleMatch ? 
                           (mesExampleMatch[1] ? mesExampleMatch[1] : mesExampleMatch[2] || "").trim() : 
                           "";
        
        // 提取角色背景
        const backgroundMatch = jsonStr.match(/"background"\s*:\s*"([^"]+)(?:\\"|")/);
        const background = backgroundMatch ? backgroundMatch[1].trim() : "";
        
        // 构建标准格式的世界书数据 - 确保符合WorldBookJson接口
        // 为每个条目添加默认值
        const worldBook: WorldBookJson = {
          entries: {}
        };
        
        // 处理原始JSON中的世界书条目
        let entriesData: any = {};
        
        // 尝试从JSON中提取世界书条目
        try {
          const worldBookMatch = jsonStr.match(/"world_book"\s*:\s*\{\s*"entries"\s*:\s*(\{[\s\S]*?\})\s*\}/);
          if (worldBookMatch && worldBookMatch[1]) {
            const entriesJson = `{${worldBookMatch[1]}}`;
            // 将提取的JSON转换为对象
            entriesData = JSON.parse(entriesJson);
          }
        } catch (e) {
          console.error('[解析器] 提取world_book entries失败:', e);
          // 如果提取失败，使用默认的空对象
          entriesData = {};
        }
        
        // 定义默认条目
        const defaultEntries = {
          "Alist": {
            "comment": "Character Attributes List",
            "content": `<attributes>\n  <personality>${personality}</personality>\n  <appearance>未指定</appearance>\n  <likes>聊天</likes>\n  <dislikes>未指定</dislikes>\n</attributes>`
          },
          "Plist": {
            "comment": "Character Dialogue Examples",
            "content": mesExample || "用户: 你好\n角色: 你好，很高兴见到你！"
          },
          "背景": {
            "comment": "Character Background",
            "content": background || description
          }
        };
        
        // 合并从响应中提取的条目与默认条目
        for (const key in defaultEntries) {
          const defaultEntry = defaultEntries[key as keyof typeof defaultEntries];
          const extractedEntry = entriesData[key] || {};
          
          // 为每个条目应用默认值
          worldBook.entries[key] = {
            comment: extractedEntry.comment || defaultEntry.comment,
            content: extractedEntry.content || defaultEntry.content,
            disable: false,
            position: key === "背景" ? 3 : 4 as 0 | 1 | 2 | 3 | 4,
            constant: true,
            key: [],
            order: key === "Alist" ? 1 : key === "Plist" ? 2 : 3,
            depth: 1,
            vectorized: false
          };
        }
        
        console.log("[解析器] 成功创建标准格式的角色数据");
        
        // 构建角色卡片数据
        const roleCard = {
          name,
          first_mes: firstMes,
          description,
          personality,
          scenario,
          mes_example: mesExample,
          background
        };

        // 创建标准的preset数据结构
        const preset = this.createStandardPreset(roleCard);
        
        // 完整生成的JSON数据，包含预设数据以确保与character-detail兼容
        const fullCharacterData = {
          roleCard: roleCard,
          worldBook: worldBook,
          preset: preset,
          authorNote: {
            charname: name,
            username: "User",
            content: "",
            injection_depth: 0
          },
          chatHistory: {
            name: "Chat History",
            role: "system",
            parts: firstMes ? [
              {
                role: "model",
                parts: [{ text: firstMes }],
                is_first_mes: true
              }
            ] : [],
            identifier: "chatHistory"
          }
        };
        
        // 将完整数据记录到日志中
        console.log("[解析器] 生成的JSON数据结构:", 
                   Object.keys(fullCharacterData).join(', '));
        
        // When passing to NodeSTCore, include the isCradleGeneration flag
        return {
          success: true,
          roleCard: fullCharacterData.roleCard,
          worldBook: fullCharacterData.worldBook,
          preset: fullCharacterData.preset,
          isCradleGeneration: true  // Add this flag to be passed down to CharacterUtils
        };
        
      } catch (parseError) {
        console.error("[解析器] JSON重构失败:", parseError);
        
        // 最后的挽救措施: 手动提取关键字段构造一个最小可用的对象
        try {
          console.log("[解析器] 执行最终挽救方案...");
          
          // 提取出角色名称
          let name = "未知角色";
          const nameMatch = response.match(/角色名称[：:]\s*([^\n]+)/);
          if (nameMatch) name = nameMatch[1].trim();
          
          // 最小角色卡片数据 - 确保所有必填字段都有值
          const roleCard = {
            name: name,
            description: "这是一个AI生成的角色",
            first_mes: "你好，很高兴见到你！",
            personality: "友好、随和",
            scenario: "",
            mes_example: "",
            background: ""  // 添加background字段以确保兼容性
          };
          
          // 最小世界书数据 - 确保所有条目都符合预期格式
          const worldBook = {
            entries: {
              "Alist": {
                "comment": "Character Attributes List",
                "content": `<attributes>\n  <personality>友好、随和</personality>\n  <appearance>未指定</appearance>\n  <likes>聊天</likes>\n  <dislikes>未指定</dislikes>\n</attributes>`,
                "disable": false,
                "position": 4 as 0 | 1 | 2 | 3 | 4,
                "constant": true,
                "key": [],
                "order": 1,
                "depth": 1,
                "vectorized": false
              },
              "Plist": {
                "comment": "Character Dialogue Examples",
                "content": "用户: 你好\n角色: 你好，很高兴见到你！",
                "disable": false,
                "position": 4 as 0 | 1 | 2 | 3 | 4,
                "constant": true,
                "key": [],
                "order": 2,
                "depth": 1,
                "vectorized": false
              },
              "背景": {
                "comment": "这是一个AI生成的角色，背景故事待补充。",
                "content": "这是一个AI生成的角色，背景故事待补充。",
                "disable": false,
                "position": 3 as 0 | 1 | 2 | 3 | 4,
                "constant": true,
                "key": [],
                "order": 3,
                "depth": 1,
                "vectorized": false
              }
            }
          };
          
          console.log("[解析器] 成功创建最小可用角色数据（救援方案）");
          
          return {
            success: true,
            roleCard: roleCard,
            worldBook: worldBook,
            preset: { // 添加默认的preset数据，确保NodeST创建角色时有完整数据
              prompts: [
                {
                  name: "Main",
                  content: "",
                  enable: true,
                  identifier: "main",
                  role: "user",
                  inject_position: 0  // 添加inject_position=0使其被识别为position-based entry
                },
                {
                  name: "Enhance Definitions",
                  content: "",
                  enable: true,
                  identifier: "enhanceDefinitions",
                  injection_position: 1,
                  injection_depth: 3,
                  role: "user"
                }
              ],
              prompt_order: [{
                order: [
                  { identifier: "main", enabled: true },
                  { identifier: "enhanceDefinitions", enabled: true },
                  { identifier: "worldInfoBefore", enabled: true },
                  { identifier: "charDescription", enabled: true },
                  { identifier: "charPersonality", enabled: true },
                  { identifier: "scenario", enabled: true },
                  { identifier: "worldInfoAfter", enabled: true },
                  { identifier: "dialogueExamples", enabled: true },
                  { identifier: "chatHistory", enabled: true }
                ]
              }]
            }
          };
        } catch (finalError) {
          console.error("[解析器] 所有修复尝试都失败:", finalError);
          return {
            success: false,
            error: "无法解析生成的角色数据，请尝试重新生成"
          };
        }
      }
    } catch (error) {
      console.error("[解析器] 处理LLM响应时出错:", error);
      return {
        success: false,
        error: error instanceof Error ? `解析LLM响应失败: ${error.message}` : "未知解析错误"
      };
    }
  }

  /**
   * 创建标准的角色preset结构
   */
  private createStandardPreset(roleCard: RoleCardJson): any {
    // 定义rFramework所需的预设条目
    const presetPrompts = [
      {
        name: "Character System",
        content: "You are a Roleplayer who is good at playing various types of roles. Regardless of the genre, you will ensure the consistency and authenticity of the role based on the role settings I provide, so as to better fulfill the role.",
        enable: true,
        identifier: "characterSystem",
        role: "user",
        inject_position: 0  // 添加inject_position=0使其被识别为position-based entry
      },
      {
        name: "Character Confirmation",
        content: "[Understood]",
        enable: true,
        identifier: "characterConfirmation",
        role: "model", // 这里是model角色，OpenRouter会自动转换
        inject_position: 0  // 添加inject_position=0使其被识别为position-based entry
      },
      {
        name: "Character Introduction",
        content: "The following are some information about the character you will be playing. Additional information will be given in subsequent interactions.",
        enable: true,
        identifier: "characterIntro",
        role: "user",
        inject_position: 0  // 添加inject_position=0使其被识别为position-based entry
      },
      {
        name: "Enhance Definitions",
        content: "",
        enable: true,
        identifier: "enhanceDefinitions",
        injection_position: 1,  // 保留原来的injection_position=1
        injection_depth: 3,
        role: "user"
      },
      {
        name: "Context Instruction",
        content: "推荐以下面的指令&剧情继续：\n{{lastMessage}}",
        enable: true,
        identifier: "contextInstruction",
        role: "user",
        inject_position: 0  // 添加inject_position=0使其被识别为position-based entry
      },
      {
        name: "Continue",
        content: "继续",
        enable: true,
        identifier: "continuePrompt",
        role: "user",
        inject_position: 0  // 添加inject_position=0使其被识别为position-based entry
      }
    ];
    
    // 构建标准的prompt_order结构
    const promptOrder = [
      {
        order: [
          // 首先是系统和介绍条目
          { identifier: "characterSystem", enabled: true },
          { identifier: "characterConfirmation", enabled: true },
          { identifier: "characterIntro", enabled: true },
          { identifier: "enhanceDefinitions", enabled: true },
          
          // 然后是角色数据条目
          { identifier: "worldInfoBefore", enabled: true },
          { identifier: "charDescription", enabled: true },
          { identifier: "charPersonality", enabled: true },
          { identifier: "scenario", enabled: true },
          { identifier: "worldInfoAfter", enabled: true },
          { identifier: "dialogueExamples", enabled: true },
          
          // 聊天历史
          { identifier: "chatHistory", enabled: true },
          
          // 最后是上下文指令
          { identifier: "contextInstruction", enabled: true },
          { identifier: "continuePrompt", enabled: true }
        ]
      }
    ];
    
    return {
      prompts: presetPrompts,
      prompt_order: promptOrder
    };
  }

  /**
   * 获取角色生成系统提示词
   */
  private getGeneratorSystemPrompt(): string {
    return `你是一个专业的AI角色设计师，能够根据用户提供的初始数据创建独特、有深度的角色档案。
你的任务是生成一个格式化的角色卡片和相应的世界书，以便AI聊天机器人能够准确扮演这个角色。
必须为每个角色生成以下内容：
1. 角色卡片，包含基本信息、个性特征和初始消息
2. 世界书，包含详细的角色设定，以便AI更好地理解和扮演角色
请根据提供的初始数据进行创造性扩展，确保角色设定连贯、合理、有深度。`;
  }

  /**
   * 获取角色更新系统提示词
   */
  private getUpdaterSystemPrompt(): string {
    return `你是一个专业的AI角色设计师，能够根据新的投喂数据更新和改进现有角色设定。
你的任务是分析当前角色设定以及用户提供的新投喂数据，然后生成更新后的角色卡片和世界书。
在更新过程中，请遵循以下原则：
1. 保持角色核心特征和一致性
2. 整合新的投喂数据，丰富角色设定
3. 确保角色设定连贯、合理、有深度
4. 优先考虑"关于我"类型的投喂数据，这些通常是角色的核心信息
请根据新的投喂数据进行创造性扩展，生成更丰富、更有深度的角色设定。`;
  }

  /**
   * 获取输出格式提示词
   */
  private getOutputFormatPrompt(): string {
    return `请按照以下JSON格式输出你的角色设计结果，使用Markdown代码块包裹:

\`\`\`json
{
  "role_card": {
    "name": "角色名称",
    "first_mes": "角色的初始消息",
    "description": "角色简短描述",
    "personality": "角色性格描述",
    "scenario": "角色所处的情境/背景",
    "mes_example": "对话示例",
    "background": "背景故事（可选）"
  },
  "world_book": {
    "entries": {
      "Alist": {
        "comment": "Character Attributes List",
        "content": "在这里输出：\\n<attributes>\\n  <personality>性格特点</personality>\\n  <appearance>外观描述</appearance>\\n  <likes>喜好</likes>\\n  <dislikes>厌恶</dislikes>\\n</attributes>"
      },
      "Plist": {
        "comment": "Character Dialogue Examples",
        "content": "在这里输出对话示例"
      },
      "背景": {
        "comment": "Character Background",
        "content": "在这里输出详细的背景故事"
      }
    }
  }
}
\`\`\`

请确保生成的JSON格式正确，避免任何格式错误或缺失字段。
对于world_book中的每个条目，你只需要提供comment和content两个字段，其余字段将由系统自动添加。`;
  }

  /**
   * 分组投喂数据
   */
  private groupFeedsByType(feeds: FeedData[]): Record<FeedType, FeedData[]> {
    const result: Record<FeedType, FeedData[]> = {
      [FeedType.ABOUT_ME]: [],
      [FeedType.MATERIAL]: [],
      [FeedType.KNOWLEDGE]: []
    };

    feeds.forEach(feed => {
      if (result[feed.type]) {
        result[feed.type].push(feed);
      }
    });

    return result;
  }

  /**
   * 格式化初始数据
   */
  private formatInitialData(data: CharacterInitialData): string {
    const parts = [];
    
    if (data.name) {
      parts.push(`名称: ${data.name}`);
    }
    
    if (data.description) {
      parts.push(`描述: ${data.description}`);
    }
    
    if (data.personality) {
      parts.push(`性格: ${data.personality}`);
    }
    
    if (data.initialPrompt) {
      parts.push(`初始设定: ${data.initialPrompt}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * 格式化当前角色信息
   */
  private formatCurrentCharacter(): string {
    if (!this.roleCard) {
      return "当前没有角色数据";
    }

    const parts = [
      `名称: ${this.roleCard.name}`,
      `描述: ${this.roleCard.description}`,
      `性格: ${this.roleCard.personality}`,
      `背景: ${this.roleCard.scenario || this.roleCard.background || "无"}`
    ];

    return parts.join('\n\n');
  }

  /**
   * 格式化投喂数据
   */
  private formatFeedData(feedsByType: Record<FeedType, FeedData[]>): string {
    const parts = [];

    // 关于我
    if (feedsByType[FeedType.ABOUT_ME].length > 0) {
      parts.push("## 关于角色的信息");
      feedsByType[FeedType.ABOUT_ME].forEach(feed => {
        parts.push(feed.content);
      });
    }

    // 素材
    if (feedsByType[FeedType.MATERIAL].length > 0) {
      parts.push("## 角色素材");
      feedsByType[FeedType.MATERIAL].forEach(feed => {
        parts.push(feed.content);
      });
    }

    // 知识
    if (feedsByType[FeedType.KNOWLEDGE].length > 0) {
      parts.push("## 角色知识");
      feedsByType[FeedType.KNOWLEDGE].forEach(feed => {
        parts.push(feed.content);
      });
    }

    return parts.join('\n\n');
  }

  /**
   * 格式化投喂数据（按类型）
   */
  private formatFeedDataByType(feeds: FeedData[], type: FeedType): string {
    const typeFeeds = feeds.filter(feed => feed.type === type);
    
    if (typeFeeds.length === 0) {
      return "";
    }
    
    const contents = typeFeeds.map(feed => feed.content);
    return contents.join('\n\n');
  }
}