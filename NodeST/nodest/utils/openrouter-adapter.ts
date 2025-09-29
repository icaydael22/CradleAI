import { mcpAdapter } from './mcp-adapter';
import { CloudServiceProvider } from '@/services/cloud-service-provider';
import { getCharacterTablesData } from '@/src/memory/plugins/table-memory/api';

/**
 * OpenRouter Adapter
 * 提供与OpenRouter API通信的功能
 */

type ChatMessage = {
  role: string;
  parts?: { text: string }[];
  content?: string;
  characterId?: string;
};

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
  provider?: {
    id?: string;
    name?: string;
  };
}

export class OpenRouterAdapter {
  private apiKey: string;
  private model: string;
  private conversationHistory: ChatMessage[] = [];
  private baseUrl: string = 'https://openrouter.ai/api/v1';
  constructor(apiKey: string, model: string = "openai/gpt-3.5-turbo") {
    this.apiKey = apiKey;
    this.model = model;
    console.log(`【OpenRouterAdapter】初始化适配器，模型: ${model}`);
    console.log(`【OpenRouterAdapter】API密钥: ${this.maskApiKey(apiKey)}`);
  }

  /**
   * Mask API key for logging
   */
  private maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    return apiKey.substring(0, 4) + '****';
  }

  /**
   * 设置模型
   */
  setModel(model: string): void {
    console.log(`【OpenRouterAdapter】更新模型: ${this.model} -> ${model}`);
    this.model = model;
  }

  /**
   * 生成内容 - 与Gemini适配器接口保持一致
   */
  async generateContent(contents: ChatMessage[]): Promise<string> {
    console.log(`【OpenRouterAdapter】开始生成内容，使用模型: ${this.model}`);
    console.log(`【OpenRouterAdapter】本次调用可能涉及角色关系更新`);
    
    try {
      // 添加到历史记录
      contents.forEach(content => {
        // 检查消息内容是否包含关系相关关键词
        const messageText = content.parts?.[0]?.text || content.content || "";
        if (messageText.includes("关系") || 
            messageText.includes("互动") || 
            messageText.includes("朋友圈")) {
          console.log(`【OpenRouterAdapter】检测到关系系统相关请求: ${messageText.substring(0, 50)}...`);
        }
        
        // 如果消息使用的是Gemini格式，则转换为OpenRouter格式
        if (content.parts && !content.content) {
          this.conversationHistory.push({
            role: content.role,
            content: content.parts[0]?.text || ""
          });
        } else {
          this.conversationHistory.push(content);
        }
      });
      
      // 准备OpenRouter格式的消息
      const messages = this.conversationHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role, // 确保role符合OpenRouter要求
        content: msg.content || (msg.parts && msg.parts[0]?.text) || ""
      }));

      // 构建请求体
      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
      };

      // 发送API请求
      console.log(`【OpenRouterAdapter】发送请求到: ${this.baseUrl}/chat/completions`);
      
      // Check if cloud service is enabled and use it if available
      let response;
      const requestUrl = `${this.baseUrl}/chat/completions`;
      
      if (CloudServiceProvider.isEnabled()) {
        console.log('【OpenRouterAdapter】检测到云服务已启用');
        console.log(`【OpenRouterAdapter】原始请求URL: ${requestUrl}`);
        console.log(`【OpenRouterAdapter】开始时间: ${new Date().toISOString()}`);
        console.log(`【OpenRouterAdapter】请求模型: ${this.model}`);
        console.log(`【OpenRouterAdapter】请求体大小: ${JSON.stringify(requestBody).length} 字节`);
        console.log(`【OpenRouterAdapter】消息数量: ${messages.length}`);
        
        // 记录每条消息的角色和内容预览，但不记录API密钥
        messages.forEach((msg, index) => {
          let contentPreview = typeof msg.content === 'string' 
            ? msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '') 
            : '[复杂内容]';
          
          // Mask potential API keys in message content
          contentPreview = contentPreview.replace(/([A-Za-z0-9_-]{20,})/g, match => {
            if (match.length >= 20 && /^[A-Za-z0-9_-]+$/.test(match)) {
              return match.substring(0, 4) + '****';
            }
            return match;
          });
          
          console.log(`【OpenRouterAdapter】消息 #${index+1}: ${msg.role} - ${contentPreview}`);
        });
        
        // Forward the request through the cloud service
        console.log('【OpenRouterAdapter】准备调用云服务转发接口...');
        
        try {
          const startTime = Date.now();
          response = await CloudServiceProvider.forwardRequest(
            requestUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://github.com', // 添加必要的请求头
                'X-Title': 'AI Chat App'  // 添加应用标识
              },
              body: JSON.stringify(requestBody)
            },
            'openrouter'
          );
          
          const endTime = Date.now();
          console.log(`【OpenRouterAdapter】云服务请求完成，耗时: ${endTime - startTime}ms`);
          console.log(`【OpenRouterAdapter】云服务响应状态: ${response.status} ${response.statusText}`);
          
          // 记录响应头信息
          console.log('【OpenRouterAdapter】云服务响应头:');
            response.headers.forEach((value: string, name: string): void => {
              if (name.toLowerCase() === 'content-type' || 
                name.toLowerCase() === 'content-length' || 
                name.toLowerCase().startsWith('openrouter-')) {
                console.log(`【OpenRouterAdapter】- ${name}: ${value}`);
              }
            });
          
          // 检查内容类型
          const contentType = response.headers.get('content-type');
          console.log(`【OpenRouterAdapter】响应内容类型: ${contentType}`);
          
          // 检查响应大小
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
              console.log(`【OpenRouterAdapter】响应内容大小: ${contentLength} 字节`);
          }
        } catch (cloudError) {
          console.error('【OpenRouterAdapter】云服务转发失败:', cloudError);
          console.error('【OpenRouterAdapter】尝试回退到直接API调用...');
          throw cloudError; // 重新抛出以便后续处理
        }
      } else {
        // Use direct API call if cloud service is not enabled
        console.log('【OpenRouterAdapter】云服务未启用，使用直接API调用');
        console.log(`【OpenRouterAdapter】直接调用URL: ${requestUrl}`);
        console.log(`【OpenRouterAdapter】开始时间: ${new Date().toISOString()}`);
        
        const startTime = Date.now();
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com', // 添加必要的请求头
            'X-Title': 'AI Chat App'  // 添加应用标识
          },
          body: JSON.stringify(requestBody)
        });
        const endTime = Date.now();
        
        console.log(`【OpenRouterAdapter】直接API调用完成，耗时: ${endTime - startTime}ms`);
        console.log(`【OpenRouterAdapter】API响应状态: ${response.status} ${response.statusText}`);
      }
      
      // 如果响应不成功，处理错误情况
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = `OpenRouter API 错误(${response.status}): ${response.statusText}`;
        
        console.error(`【OpenRouterAdapter】API响应错误: ${response.status} ${response.statusText}`);
        console.error(`【OpenRouterAdapter】错误响应内容: ${text}`);
        
        try {
          // 尝试解析错误JSON
          const errorData = JSON.parse(text);
          
          // 特别处理地理位置错误
          if (errorData.error?.message?.includes("User location is not supported") ||
              errorData.error?.metadata?.raw?.includes("User location is not supported")) {
            errorMessage = "当前地理位置不支持使用此API。请尝试使用VPN或代理服务器，或联系OpenRouter支持。";
            console.error(`【OpenRouterAdapter】地理位置限制错误:`, {
              status: response.status,
              error: errorData.error
            });
          } else {
            // 常规错误处理
            errorMessage = `OpenRouter API 错误: ${errorData.error?.message || JSON.stringify(errorData)}`;
            console.error(`【OpenRouterAdapter】API错误响应:`, {
              status: response.status,
              error: errorData.error
            });
          }
        } catch (e) {
          // 如果不是有效JSON，使用原始文本
          console.error(`【OpenRouterAdapter】非JSON错误响应: ${text}`);
        }
        
        throw new Error(errorMessage);
      }

      // 解析响应
      console.log(`【OpenRouterAdapter】开始解析API响应JSON`);
      const startParseTime = Date.now();
      const result = await response.json();
      const endParseTime = Date.now();
      console.log(`【OpenRouterAdapter】JSON解析完成，耗时: ${endParseTime - startParseTime}ms`);
      
      // 验证响应格式
      if (!result.choices?.[0]?.message?.content) {
        console.error('【OpenRouterAdapter】无效的响应格式:', result);
        throw new Error('收到无效的响应格式');
      }

      const responseText = result.choices[0].message.content;
      
      // 添加响应到历史
      this.conversationHistory.push({
        role: "assistant",
        content: responseText
      });
      
      console.log(`【OpenRouterAdapter】成功生成回复，长度: ${responseText.length}`);
      console.log(`【OpenRouterAdapter】回复前100个字符: ${responseText.substring(0, 100)}...`);
      
      // 检查是否有用量信息
      if (result.usage) {
        console.log(`【OpenRouterAdapter】令牌用量: 提示=${result.usage.prompt_tokens || 0}, 完成=${result.usage.completion_tokens || 0}, 总计=${result.usage.total_tokens || 0}`);
      }
      
      // 检查响应是否包含关系操作指令
      if (responseText.includes("关系更新") || 
          responseText.includes("互动") || 
          responseText.includes("关系强度")) {
        console.log(`【OpenRouterAdapter】检测到响应包含关系系统指令: ${responseText.substring(0, 100).replace(/\n/g, ' ')}...`);
      }
      
      return responseText;

    } catch (error) {
      console.error(`【OpenRouterAdapter】生成内容失败:`, error);
      throw error;
    }
  }

  /**
   * 生成支持工具调用的内容
   * @param contents 消息内容
   * @param memoryResults 记忆搜索结果 (可选)
   * @returns 生成的内容
   */
  async generateContentWithTools(contents: ChatMessage[],characterId:string,memoryResults?: any,userMessage?:string ): Promise<string> {
    // 获取最后一条消息
    const lastMessage = contents[contents.length - 1];
    const messageText = lastMessage.content || (lastMessage.parts && lastMessage.parts[0]?.text) || "";
    
    // 添加详细的调试日志
    console.log(`【OpenRouterAdapter】 generateContentWithTools被调用，messageText: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
    
    // 检查是否需要搜索
    const wouldNeedSearching = this.messageNeedsSearching(messageText);
    console.log(`【OpenRouterAdapter】 消息是否适合搜索: ${wouldNeedSearching}`);
    
    try {
      // 检查是否同时存在记忆结果和搜索意图
      const hasMemoryResults = memoryResults && 
                             memoryResults.results && 
                             memoryResults.results.length > 0;
      
      // 解耦逻辑：根据情况处理不同类型的增强内容
      if (hasMemoryResults && wouldNeedSearching) {
        // 同时处理记忆和搜索
        console.log(`【OpenRouterAdapter】 同时检测到记忆结果和搜索意图，使用组合增强处理`);
        return await this.handleCombinedMemoryAndSearch(contents, memoryResults);
      } else if (hasMemoryResults) {
        // 如果只有记忆搜索结果，仅使用记忆增强
        console.log(`【OpenRouterAdapter】 检测到记忆搜索结果，使用记忆增强处理`);
        return await this.handleWithMemoryResults(contents, memoryResults);
      } else if (wouldNeedSearching) {
        // 如果没有记忆结果但有搜索意图，使用网络搜索
        console.log(`【OpenRouterAdapter】 检测到搜索意图，尝试使用网络搜索`);
        return await this.handleSearchIntent(contents);
      }
      
      // 否则使用普通对话方式
      console.log(`【OpenRouterAdapter】 使用标准对话方式生成回复`);
      return await this.generateContent(contents);
    } catch (error) {
      console.error(`【OpenRouterAdapter】 工具调用失败，回退到标准对话:`, error);
      // 如果工具调用失败，回退到标准对话
      return await this.generateContent(contents );
    }
  }

  /**
   * 处理同时具有记忆搜索结果和网络搜索意图的请求
   * @param contents 消息内容
   * @param memoryResults 记忆搜索结果
   * @returns 生成的融合回复
   */
  private async handleCombinedMemoryAndSearch(contents: ChatMessage[], memoryResults: any): Promise<string> {
    console.log(`【OpenRouterAdapter】 开始处理记忆搜索和网络搜索的组合请求`);
    
    // 获取最后一条消息的内容
    const lastMessage = contents[contents.length - 1];
    const searchQuery = lastMessage.content || (lastMessage.parts && lastMessage.parts[0]?.text) || "";
    
    try {
      // Step 1: 准备记忆部分
      console.log(`【OpenRouterAdapter】 处理记忆部分，发现 ${memoryResults.results.length} 条记忆`);
      
      let memorySection = `<mem>\n系统检索到的记忆内容：\n`;
      // 格式化记忆结果
      memoryResults.results.forEach((item: any, index: number) => {
        memorySection += `${index + 1}. ${item.memory}\n`;
      });
      memorySection += `</mem>\n\n`;
      
      // Step 2: 准备网络搜索部分
      console.log(`【OpenRouterAdapter】 为用户查询准备网络搜索: "${searchQuery}"`);
      
      // 确保MCP适配器已连接
      if (!mcpAdapter.isReady()) {
        await mcpAdapter.connect();
      }
      
      // 提取搜索关键词
      const extractionResult = await this.askLLM([
        {
          role: "user",
          content: `请帮我提取以下问题的搜索关键词，只返回核心关键词，不要有其他解释：\n\n${searchQuery}`
        }
      ]);
      
      const finalQuery = extractionResult.trim() || searchQuery;
      console.log(`【OpenRouterAdapter】 提取的搜索关键词: ${finalQuery}`);
      
      // 执行搜索
      const searchResults = await mcpAdapter.search({
        query: finalQuery,
        count: 5
      });
      
      // 格式化搜索结果
      const formattedResults = mcpAdapter.formatSearchResults(searchResults);
      let searchSection = `<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n`;
      
      // Step 3: 构建融合提示词
      console.log(`【OpenRouterAdapter】 构建融合提示词，结合记忆和网络搜索结果`);
      
      let combinedPrompt = memorySection + searchSection + `<response_guidelines>
            - 我会结合上面的记忆内容和联网搜索结果，全面回答用户的问题。
            - **首先**，我会在回复中用<mem></mem>标签包裹我对记忆内容的引用和回忆过程，例如:
              <mem>我记得你之前提到过关于这个话题，当时我们讨论了...</mem>
            - **然后**，我会用<websearch></websearch>标签包裹我对网络搜索结果的解释和引用，例如:
              <websearch>根据最新的网络信息，关于这个问题的专业观点是...</websearch>
            - 确保回复能够同时**有效整合记忆和网络信息**，让内容更加全面和有用。
            - 我回复的语气和风格一定会与角色人设保持一致。
            - 我**不会在回复中使用多组<mem>或<websearch>标签，整个回复只能有一组<mem>或<websearch>标签。**
      </response_guidelines>`;
      
      // 记录融合提示词的长度
      console.log(`【OpenRouterAdapter】 融合提示词构建完成，长度: ${combinedPrompt.length}`);
      
      // 插入顺序：历史消息 + assistant(记忆/搜索内容) + 用户消息
      let formattedContents = [];
      for (let i = 0; i < contents.length - 1; i++) {
        const msg = contents[i];
        if (msg.content || (msg.parts && msg.parts[0]?.text)) {
          formattedContents.push({
            role: msg.role,
            content: msg.content || (msg.parts && msg.parts[0]?.text) || ""
          });
        }
      }
      formattedContents.push({
        role: "assistant",
        content: combinedPrompt
      });
      const lastMsg = contents[contents.length - 1];
      formattedContents.push({
        role: lastMsg.role,
        content: lastMsg.content || (lastMsg.parts && lastMsg.parts[0]?.text) || ""
      });

      // 使用组合提示词生成最终回复
      return await this.askLLM(formattedContents);
    } catch (error) {
      console.error(`【OpenRouterAdapter】 组合处理记忆搜索和网络搜索时出错:`, error);
      
      // 如果组合处理失败，尝试退回到仅使用记忆搜索结果的方式
      console.log(`【OpenRouterAdapter】 组合处理失败，回退到仅使用记忆结果模式`);
      try {
        return await this.handleWithMemoryResults(contents, memoryResults);
      } catch (fallbackError) {
        console.error(`【OpenRouterAdapter】 记忆处理也失败，回退到标准对话:`, fallbackError);
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
    const userQuery = lastMessage.content || (lastMessage.parts && lastMessage.parts[0]?.text) || "";

    try {
      // 添加详细的记忆结果结构日志
      console.log(`【OpenRouterAdapter】 处理记忆增强请求，发现 ${memoryResults.results.length} 条记忆`);
      console.log('【OpenRouterAdapter】 记忆结果结构:', {
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
        console.log('【OpenRouterAdapter】【表格记忆】 memoryResults.characterId:', memoryResults.characterId, typeof memoryResults.characterId);
        console.log('【OpenRouterAdapter】【表格记忆】 memoryResults.agentId:', memoryResults.agentId, typeof memoryResults.agentId);
        console.log('【OpenRouterAdapter】【表格记忆】 memoryResults.results[0]?.characterId:', memoryResults.results?.[0]?.characterId, typeof memoryResults.results?.[0]?.characterId);
        console.log('【OpenRouterAdapter】【表格记忆】 memoryResults.results[0]?.agentId:', memoryResults.results?.[0]?.agentId, typeof memoryResults.results?.[0]?.agentId);
        console.log('【OpenRouterAdapter】【表格记忆】 memoryResults.conversationId:', memoryResults.conversationId, typeof memoryResults.conversationId);
        console.log('【OpenRouterAdapter】【表格记忆】 memoryResults.results[0]?.conversationId:', memoryResults.results?.[0]?.conversationId, typeof memoryResults.results?.[0]?.conversationId);
        if (!characterId && contents.length > 0) {
          characterId = contents[0]?.characterId;
          console.log('【OpenRouterAdapter】【表格记忆】 尝试从contents[0]获取characterId:', characterId, typeof characterId);
        }
        console.log('【OpenRouterAdapter】【表格记忆】 最终用于查询的 characterId:', characterId, 'conversationId:', conversationId);
        if (characterId) {
          console.log('【OpenRouterAdapter】【表格记忆】 调用 getCharacterTablesData 前参数:', { characterId, conversationId });
          const tableData = await getCharacterTablesData(characterId, conversationId);
          console.log('【OpenRouterAdapter】【表格记忆】 getCharacterTablesData 返回:', tableData);
          if (tableData.success && tableData.tables.length > 0) {
            tableMemoryText += `【角色长期记忆表格】\n`;
            tableData.tables.forEach(table => {
              const headerRow = '| ' + table.headers.join(' | ') + ' |';
              const sepRow = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
              const dataRows = table.rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
              tableMemoryText += `表格：${table.name}\n${headerRow}\n${sepRow}\n${dataRows}\n\n`;
            });
          } else {
            console.log('【OpenRouterAdapter】【表格记忆】 未获取到有效表格数据，success:', tableData.success, 'tables.length:', tableData.tables.length);
          }
        } else {
          console.log('【OpenRouterAdapter】【表格记忆】 未能确定characterId，跳过表格记忆注入');
        }
      } catch (e) {
        console.warn('【OpenRouterAdapter】 获取角色表格记忆失败:', e);
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
- 除了对用户消息的回应之外，我**一定** 会结合记忆内容进行回复。
- **我会根据角色设定，聊天上下文和记忆内容**，输出我对检索记忆的回忆过程，并用<mem></mem>包裹。
  - 示例: <mem>我想起起您上次提到过类似的问题，当时...</mem>
- 我会确保回复保持角色人设的一致性。
- - **我不会在回复中使用多组<mem>，整个回复只能有一组<mem>标签。**
</response_guidelines>`;

      // 记录准备的提示词
      console.log('【OpenRouterAdapter】 准备了带记忆结果的提示:', combinedPrompt.substring(0, 200) + '...');

      // 插入顺序：历史消息 + assistant(记忆内容) + 用户消息
      let formattedContents = [];
      for (let i = 0; i < contents.length - 1; i++) {
        const msg = contents[i];
        if (msg.content || (msg.parts && msg.parts[0]?.text)) {
          formattedContents.push({
            role: msg.role,
            content: msg.content || (msg.parts && msg.parts[0]?.text) || ""
          });
        }
      }
      formattedContents.push({
        role: "assistant",
        content: combinedPrompt
      });
      const lastMsg = contents[contents.length - 1];
      formattedContents.push({
        role: lastMsg.role,
        content: lastMsg.content || (lastMsg.parts && lastMsg.parts[0]?.text) || ""
      });

      // 使用记忆提示词生成最终回复
      return await this.askLLM(formattedContents);
    } catch (error) {
      console.error(`【OpenRouterAdapter】 记忆增强处理失败:`, error);
      // 如果记忆处理失败，回退到标准方式
      return await this.generateContent(contents);
    }
  }

  /**
   * 处理需要搜索的请求
   * @param contents 消息内容
   * @returns 生成的回复
   */
  private async handleSearchIntent(contents: ChatMessage[]): Promise<string> {
    console.log(`【OpenRouterAdapter】 开始处理搜索请求`);
    
    try {
      // 获取最后一条消息
      const lastMessage = contents[contents.length - 1];
      const searchQuery = lastMessage.content || (lastMessage.parts && lastMessage.parts[0]?.text) || "";

      // 优先尝试通过云服务进行联网搜索
      if (CloudServiceProvider.isEnabled()) {
        try {
          console.log('【OpenRouterAdapter】优先通过云服务处理联网搜索请求');
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
          if (searchResultText) {
            // 构建带有搜索结果的提示词
            const searchPrompt = `${searchQuery}\n\n<websearch>\n搜索引擎返回的联网检索结果：\n${searchResultText}\n</websearch>\n\n请基于以上搜索结果回答用户的问题。`;
            // 插入顺序：历史消息 + assistant(搜索内容) + 用户消息
            let formattedContents = [];
            for (let i = 0; i < contents.length - 1; i++) {
              const msg = contents[i];
              if (msg.content || (msg.parts && msg.parts[0]?.text)) {
                formattedContents.push({
                  role: msg.role,
                  content: msg.content || (msg.parts && msg.parts[0]?.text) || ""
                });
              }
            }
            formattedContents.push({
              role: "assistant",
              content: searchPrompt
            });
            const lastMsg = contents[contents.length - 1];
            formattedContents.push({
              role: lastMsg.role,
              content: lastMsg.content || (lastMsg.parts && lastMsg.parts[0]?.text) || ""
            });

            // 使用搜索结果生成回复
            return await this.askLLM(formattedContents);
          }
        } catch (cloudSearchError) {
          console.warn('【OpenRouterAdapter】云服务联网搜索失败，降级到本地BraveSearch:', cloudSearchError);
          // 继续降级到本地bravesearch
        }
      }

      // 确保MCP适配器已连接
      if (!mcpAdapter.isReady()) {
        await mcpAdapter.connect();
      }
      
      // 提取搜索关键词
      const extractionResult = await this.askLLM([
        {
          role: "user",
          content: `请帮我提取以下问题的搜索关键词，只返回核心关键词，不要有其他解释：\n\n${searchQuery}`
        }
      ]);
      
      const finalQuery = extractionResult.trim() || searchQuery;
      console.log(`【OpenRouterAdapter】 提取的搜索关键词: ${finalQuery}`);
      
      // 执行搜索
      const searchResults = await mcpAdapter.search({
        query: finalQuery,
        count: 5
      });
      
      // 格式化搜索结果
      const formattedResults = mcpAdapter.formatSearchResults(searchResults);
      
      // 构建带有搜索结果的提示词
      const searchPrompt = `${searchQuery}\n\n<websearch>\n搜索引擎返回的联网检索结果：\n${formattedResults}\n</websearch>\n\n请基于以上搜索结果回答用户的问题。`;
      
      // 插入顺序：历史消息 + assistant(搜索内容) + 用户消息
      let formattedContents = [];
      for (let i = 0; i < contents.length - 1; i++) {
        const msg = contents[i];
        if (msg.content || (msg.parts && msg.parts[0]?.text)) {
          formattedContents.push({
            role: msg.role,
            content: msg.content || (msg.parts && msg.parts[0]?.text) || ""
          });
        }
      }
      formattedContents.push({
        role: "assistant",
        content: searchPrompt
      });
      const lastMsg = contents[contents.length - 1];
      formattedContents.push({
        role: lastMsg.role,
        content: lastMsg.content || (lastMsg.parts && lastMsg.parts[0]?.text) || ""
      });

      // 使用搜索结果生成回复
      return await this.askLLM(formattedContents);
    } catch (error) {
      console.error(`【OpenRouterAdapter】 搜索请求处理失败:`, error);
      // 如果搜索处理失败，回退到标准对话
      return await this.generateContent(contents);
    }
  }

  /**
   * 判断消息是否需要搜索
   * @param messageText 消息文本
   * @returns 是否需要搜索
   */
  private messageNeedsSearching(messageText: string): boolean {
    // 添加更多详细的调试日志
    console.log(`【OpenRouterAdapter】 正在分析消息是否需要搜索: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
    
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
      messageText.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // 检查提问模式
    const isQuestion = questionPatterns.some(pattern => 
      pattern.test(messageText)
    ) || messageText.includes('?') || messageText.includes('？');
    
    // 如果同时满足以下条件，则判断需要搜索:
    // 1. 消息包含搜索关键词或者是一个问题
    // 2. 消息长度不超过300个字符 (放宽长度限制，从200改为300)
    const needsSearching = (hasSearchKeyword || isQuestion) && messageText.length < 300;
    
    // 添加详细的判断结果日志
    console.log(`【OpenRouterAdapter】 消息搜索判断结果:`, {
      hasSearchKeyword,
      isQuestion,
      messageLength: messageText.length,
      needsSearching
    });
    
    return needsSearching;
  }

  /**
   * 辅助方法：用于发送简单的LLM请求并获取回答
   * @param messages 消息
   * @returns LLM的回答
   */
  private async askLLM(messages: any[]): Promise<string> {
    try {
      // 准备OpenRouter格式的消息
      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
      };

      // 发送API请求
      const requestUrl = `${this.baseUrl}/chat/completions`;
      
      // Check if cloud service is enabled and use it if available
      let response;
      if (CloudServiceProvider.isEnabled()) {
        console.log('【OpenRouterAdapter】LLM请求 - 使用云服务转发');
        console.log(`【OpenRouterAdapter】LLM请求URL: ${requestUrl}`);
        console.log(`【OpenRouterAdapter】LLM请求开始时间: ${new Date().toISOString()}`);
        
        // 记录消息概要
        console.log(`【OpenRouterAdapter】LLM请求包含 ${messages.length} 条消息`);
        const lastMessagePreview = messages[messages.length - 1]?.content || '';
        console.log(`【OpenRouterAdapter】LLM最后一条消息预览: ${typeof lastMessagePreview === 'string' ? lastMessagePreview.substring(0, 50) + '...' : '[复杂内容]'}`);
        
        // Forward the request through the cloud service
        const startTime = Date.now();
        response = await CloudServiceProvider.forwardRequest(
          requestUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://github.com',
              'X-Title': 'AI Chat App'
            },
            body: JSON.stringify(requestBody)
          },
          'openrouter'
        );
        const endTime = Date.now();
        
        console.log(`【OpenRouterAdapter】LLM云服务请求完成，耗时: ${endTime - startTime}ms`);
        console.log(`【OpenRouterAdapter】LLM云服务响应状态: ${response.status} ${response.statusText}`);
      } else {
        // Use direct API call if cloud service is not enabled
        console.log('【OpenRouterAdapter】LLM请求 - 使用直接API调用');
        console.log(`【OpenRouterAdapter】LLM请求URL: ${requestUrl}`);
        
        const startTime = Date.now();
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com',
            'X-Title': 'AI Chat App'
          },
          body: JSON.stringify(requestBody)
        });
        const endTime = Date.now();
        
        console.log(`【OpenRouterAdapter】LLM直接API调用完成，耗时: ${endTime - startTime}ms`);
      }
      
      if (!response.ok) {
        console.error(`【OpenRouterAdapter】LLM请求失败: ${response.status} ${response.statusText}`);
        throw new Error(`OpenRouter API 错误(${response.status}): ${response.statusText}`);
      }

      console.log(`【OpenRouterAdapter】开始解析LLM响应`);
      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        console.error(`【OpenRouterAdapter】LLM响应格式无效:`, data);
        throw new Error('收到无效的响应格式');
      }

      const responseContent = data.choices[0].message.content;
      console.log(`【OpenRouterAdapter】LLM响应成功，内容长度: ${responseContent.length}`);
      
      // 打印令牌用量（如果有）
      if (data.usage) {
        console.log(`【OpenRouterAdapter】LLM令牌用量: 提示=${data.usage.prompt_tokens || 0}, 完成=${data.usage.completion_tokens || 0}, 总计=${data.usage.total_tokens || 0}`);
      }

      return responseContent;
    } catch (error) {
      console.error(`【OpenRouterAdapter】LLM请求失败:`, error);
      throw error;
    }
  }

  /**
   * 获取聊天历史
   */
  getChatHistory(): Array<{ role: string; text: string }> {
    return this.conversationHistory.map(msg => ({
      role: msg.role,
      text: msg.content || (msg.parts?.[0]?.text || "")
    }));
  }

  /**
   * 清除聊天历史
   */
  clearChatHistory(): void {
    console.log('【OpenRouterAdapter】清除聊天历史');
    this.conversationHistory = [];
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<OpenRouterModel[]> {
    console.log('【OpenRouterAdapter】获取可用模型列表');
    console.log(`【OpenRouterAdapter】使用API密钥: ${this.maskApiKey(this.apiKey)}`);
    
    try {
      // Check if cloud service is enabled and use it if available
      let response;
      const requestUrl = `${this.baseUrl}/models`;
      
      if (CloudServiceProvider.isEnabled()) {
        console.log('【OpenRouterAdapter】使用云服务获取模型列表');
        
        // Forward the request through the cloud service
        response = await CloudServiceProvider.forwardRequest(
          requestUrl,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://github.com', // Required header
              'X-Title': 'AI Chat App'  // Add application identifier
            }
          },
          'openrouter'
        );
      } else {
        // Use direct API call if cloud service is not enabled
        response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com', // Required header
            'X-Title': 'AI Chat App'  // Add application identifier
          }
        });
      }

      if (!response.ok) {
        const text = await response.text();
        console.error(`【OpenRouterAdapter】获取模型列表失败(${response.status}): ${text}`);
        
        let errorMessage = `获取模型列表失败: ${response.statusText}`;
        
        try {
          // Try to parse error JSON
          const errorData = JSON.parse(text);
          if (errorData.error?.message) {
            errorMessage = `获取模型列表失败: ${errorData.error.message}`;
          }
        } catch (e) {
          // Keep original error message
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Log model data structure for debugging
      console.log(`【OpenRouterAdapter】获取到 ${data.data?.length || 0} 个模型`);
      if (data.data?.length > 0) {
        console.log(`【OpenRouterAdapter】示例模型: ${data.data[0].id}`);
      }

      // Ensure we return an array even if the API response is unexpected
      return Array.isArray(data.data) ? data.data : [];
    } catch (error) {
      console.error('【OpenRouterAdapter】获取模型列表失败:', error);
      // Return empty array instead of throwing to make UI more resilient
      return [];
    }
  }
}
