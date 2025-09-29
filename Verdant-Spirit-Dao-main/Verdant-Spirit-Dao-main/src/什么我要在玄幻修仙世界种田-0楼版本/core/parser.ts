import { PokedexManager } from './pokedex';
import { logger } from './logger';

declare const _: any;
declare const toastr: any;
declare const getVariables: (options: any) => any;

/**
 * 从消息内容中移除所有可解析的特殊标签（statusbar）。
 * @param messageContent - 原始消息内容。
 * @returns 清理后的、只包含叙事文本的消息内容。
 */
export function cleanMessageContent(messageContent: string): string {
    if (!messageContent) return '';
    let cleaned = messageContent;
    cleaned = cleaned.replace(/<statusbar>[\s\S]*?<\/statusbar>/g, '').trim();
    return cleaned;
}


/**
 * 生成一个标准化的HTML字符串，用于在UI中显示JSON解析失败的信息。
 * @param rawText - 尝试解析的原始文本。
 * @param error - 捕获到的错误对象。
 * @returns 一个包含错误详情和原始文本的HTML字符串。
 */
export function createJsonErrorDisplay(rawText: string, error: unknown): string {
  const safeRawText = String(rawText || '');
  const errorMessage = (error instanceof Error) ? error.message : String(error);

  return `
    <div class="bg-orange-800/20 border border-orange-700/30 text-orange-300 px-4 py-3 rounded-lg relative" role="alert">
        <strong class="font-bold">解析失败:</strong>
        <span class="block sm:inline">${errorMessage}</span>
        <p class="mt-2 text-sm">已为您显示原始输出内容，请检查格式：</p>
    </div>
    <pre class="bg-gray-900/50 text-white p-4 rounded-lg mt-2 whitespace-pre-wrap text-xs leading-relaxed"><code>${safeRawText.replace(/</g, '<').replace(/>/g, '>')}</code></pre>
  `;
}
