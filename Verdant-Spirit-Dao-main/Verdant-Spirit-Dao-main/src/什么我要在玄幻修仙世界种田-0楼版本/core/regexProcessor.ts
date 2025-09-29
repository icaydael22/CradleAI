// 假设 formatAsTavernRegexedString 是由酒馆环境提供的全局函数
declare function formatAsTavernRegexedString(
  text: string,
  source: 'user_input' | 'ai_output' | 'slash_command' | 'world_info' | 'reasoning',
  destination: 'display' | 'prompt',
  options?: {
    depth?: number;
    character_name?: string;
  }
): string;

/**
 * 从LLM的完整响应中提取 `<MainText>` 标签内的内容。
 * @param fullText - LLM返回的完整字符串。
 * @returns 提取出的主要叙事文本，如果未找到则返回原始文本。
 */
export function extractMainText(fullText: string): string {
  const match = fullText.match(/<MainText>([\s\S]*?)<\/MainText>/);
  return match ? match[1].trim() : fullText;
}

/**
 * 对给定的文本应用酒馆的正则表达式处理。
 * @param text - 需要处理的文本。
 * @returns 处理后的文本。
 */
export function processTextWithTavernRegex(text: string): string {
  // 这是一个同步操作
  return formatAsTavernRegexedString(text, 'ai_output', 'display');
}

/**
 * 一个集成的处理函数，先提取主文本，然后应用正则表达式。
 * @param fullText - LLM返回的完整字符串。
 * @returns 经过处理和清洗的最终叙事文本。
 */
export function getProcessedStoryText(fullText: string): string {
  let statusBarContent = '';
  let textToProcess = fullText;

  // 寻找最后一个 statusbar 块。
  // 因为提示词中可能也包含 <statusbar>，所以需要找到最后一个，也就是AI最新生成的那个。
  const lastClosingTagIndex = fullText.lastIndexOf('</statusbar>');
  if (lastClosingTagIndex !== -1) {
    // 从</statusbar>的位置往前找，找到最近的一个<statusbar>
    const lastOpeningTagIndex = fullText.lastIndexOf('<statusbar>', lastClosingTagIndex);
    if (lastOpeningTagIndex !== -1) {
      // 找到了最后一个完整的 <statusbar>...</statusbar> 块
      statusBarContent = fullText.substring(lastOpeningTagIndex, lastClosingTagIndex + '</statusbar>'.length);
      // 从待处理文本中移除这部分内容
      textToProcess = fullText.substring(0, lastOpeningTagIndex) + fullText.substring(lastClosingTagIndex + '</statusbar>'.length);
    }
  }

  const mainText = extractMainText(textToProcess);
  const processedText = processTextWithTavernRegex(mainText);
  
  return processedText + statusBarContent;
}
