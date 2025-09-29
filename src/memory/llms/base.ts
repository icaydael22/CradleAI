import { Message } from '../types';

/**
 * LLM 响应接口
 */
export interface LLMResponse {
  content: string;
  role: string;
  toolCalls?: { 
    name: string; 
    arguments: string 
  }[];
}

/**
 * LLM 接口
 * 定义了与语言模型交互的基本功能
 */
export interface LLM {
  /**
   * 生成响应
   * @param messages 消息数组
   * @param responseFormat 响应格式配置
   * @param tools 可用工具
   * @returns 生成的响应文本或结构化响应
   */
  generateResponse(
    messages: Message[],
    responseFormat?: { type: string },
    tools?: any[]
  ): Promise<string | LLMResponse>;

  /**
   * 生成聊天响应
   * @param messages 消息数组
   * @returns 生成的聊天响应
   */
  generateChat(messages: Message[]): Promise<LLMResponse>;
}
