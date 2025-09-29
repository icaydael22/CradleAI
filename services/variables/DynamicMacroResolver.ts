/**
 * 动态宏解析器
 * 负责解析动态宏标记并获取实际数据
 */

import { ScriptService } from '../script-service';
import { StorageAdapter } from '../../NodeST/nodest/utils/storage-adapter';

export class DynamicMacroResolver {
  private static scriptService = ScriptService.getInstance();
  
  /**
   * 解析动态宏标记，返回实际内容
   * @param text 包含动态宏标记的文本
   * @returns 解析后的文本
   */
  static async resolveDynamicMacros(text: string): Promise<string> {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // 匹配动态宏标记：[DYNAMIC:type:id:count]
    const dynamicMacroRegex = /\[DYNAMIC:([^:]+):([^:]+):(\d+)\]/g;
    let result = text;
    const promises: Array<Promise<void>> = [];

    let match;
    while ((match = dynamicMacroRegex.exec(text)) !== null) {
      const [fullMatch, type, id, countStr] = match;
      const count = parseInt(countStr, 10);

      const promise = (async () => {
        try {
          let resolvedContent = '';
          
          switch (type) {
            case 'scriptHistory':
              resolvedContent = await this.getScriptHistoryContent(id, count);
              break;
            case 'chatHistory':
              resolvedContent = await this.getChatHistoryContent(id, count);
              break;
            default:
              resolvedContent = `未知动态宏类型: ${type}`;
          }

          result = result.replace(fullMatch, resolvedContent);
        } catch (error) {
          console.error(`解析动态宏失败 ${fullMatch}:`, error);
          result = result.replace(fullMatch, `[解析失败: ${type}]`);
        }
      })();

      promises.push(promise);
    }

    // 等待所有动态宏解析完成
    await Promise.all(promises);
    return result;
  }

  /**
   * 获取剧本历史内容
   * @param scriptId 剧本ID
   * @param count 获取条数
   * @returns 格式化的剧本历史内容
   */
  private static async getScriptHistoryContent(scriptId: string, count: number): Promise<string> {
    try {
      const history = await this.scriptService.getScriptHistory(scriptId);
      
      if (!history || history.length === 0) {
        return '暂无剧本历史';
      }

      // 获取最近的消息
      const recentHistory = history.slice(-count);
      
      // 格式化为文本
      const formattedHistory = recentHistory.map((message, index) => {
        const content = this.scriptService.extractPlotContent(message.aiResponse) || '无内容';
        return `${index + 1}. ${content.trim()}`;
      }).join('\n');

      return formattedHistory || '暂无有效剧本历史';
    } catch (error) {
      console.error(`获取剧本历史失败 (${scriptId}):`, error);
      return '获取剧本历史失败';
    }
  }

  /**
   * 获取角色聊天历史内容
   * @param characterId 角色ID（会话ID）
   * @param count 获取条数
   * @returns 格式化的聊天历史内容
   */
  private static async getChatHistoryContent(characterId: string, count: number): Promise<string> {
    try {
      const messages = await StorageAdapter.getRecentMessages(characterId, count);
      
      if (!messages || messages.length === 0) {
        return '暂无聊天历史';
      }

      // 格式化为对话形式
      const formattedHistory = messages.map((message: any, index: number) => {
        const role = message.role === 'user' ? '用户' : 'AI';
        
        // 处理不同的消息内容格式
        let content = '';
        if (typeof message.content === 'string') {
          content = message.content;
        } else if (message.parts && message.parts[0] && message.parts[0].text) {
          content = message.parts[0].text;
        } else if (message.text) {
          content = message.text;
        } else {
          content = '无内容';
        }

        return `${index + 1}. ${role}: ${content.trim()}`;
      }).join('\n');

      return formattedHistory || '暂无有效聊天历史';
    } catch (error) {
      console.error(`获取聊天历史失败 (${characterId}):`, error);
      return '获取聊天历史失败';
    }
  }
}