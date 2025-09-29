/**
 * 从完整的消息文本中严格提取 **最后一个** <statusbar>...</statusbar> 块内的 JSON 内容。
 * @param messageContent - 完整的聊天消息字符串。
 * @returns 清理后的 JSON 字符串，如果找不到或无效则返回空字符串。
 */
export function extractJsonFromStatusBar(messageContent: string): string {
  if (!messageContent) return '';

  // 定位到最后一个 '</statusbar>'
  const lastEndIndex = messageContent.lastIndexOf('</statusbar>');
  if (lastEndIndex === -1) {
    return '';
  }

  // 从最后一个 '</statusbar>' 的位置向前搜索最近的一个 '<statusbar>'
  const lastStartIndex = messageContent.lastIndexOf('<statusbar>', lastEndIndex);

  // 确保找到了一个有效的、成对的标签
  if (lastStartIndex === -1) {
    return '';
  }
  
  const contentToProcess = messageContent.substring(lastStartIndex + '<statusbar>'.length, lastEndIndex);
  const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = contentToProcess.match(jsonRegex);
  const potentialJsonString = match && match[1] ? match[1].trim() : contentToProcess.trim();

  const firstBracket = potentialJsonString.indexOf('{');
  const lastBracket = potentialJsonString.lastIndexOf('}');

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    console.error('在 <statusbar> 块内未找到有效的JSON对象结构。');
    return '';
  }

  const finalJsonString = potentialJsonString.substring(firstBracket, lastBracket + 1);
  // 清理JSON中末尾多余的逗号，以增加解析的健壮性
  return finalJsonString.replace(/,(?=\s*?[\]}])/g, '');
}

/**
 * 深度扫描对象，查找不可被 structuredClone 克隆的属性。
 * @param obj - 要扫描的对象。
 * @returns 一个包含不可克隆属性路径的字符串数组。
 */
export function findNonCloneable(obj: any): string[] {
    const problems: string[] = [];
    const visited = new WeakSet();

    function scan(current: any, path: string) {
        if (current === null || typeof current !== 'object') {
            return;
        }

        if (visited.has(current)) {
            return;
        }
        visited.add(current);

        // 检查 window 对象
        if (current === window) {
            problems.push(`${path} (is window object)`);
            return; // 不需要进一步扫描 window
        }

        // 检查 DOM 元素
        if (current instanceof Element) {
            problems.push(`${path} (is a DOM element)`);
            return;
        }

        for (const key in current) {
            if (Object.prototype.hasOwnProperty.call(current, key)) {
                const newPath = path ? `${path}.${key}` : key;
                const value = current[key];

                if (typeof value === 'function') {
                    problems.push(`${newPath} (is a function)`);
                } else if (typeof value === 'object' && value !== null) {
                    scan(value, newPath);
                }
            }
        }
    }

    scan(obj, '');
    return problems;
}
