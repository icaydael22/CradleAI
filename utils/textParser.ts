import { StyleProp, TextStyle,Platform } from 'react-native';

type TextSegment = {
  text: string;
  style: StyleProp<TextStyle>;
};

// Simple HTML parsing for basic styling in messages
export const parseHtmlText = (text: string): TextSegment[] => {
  if (!text) return [{ text: '', style: {} }];

  // 处理代码块（```...```）
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      // 处理代码块前的内容
      segments = segments.concat(parseInlineMarkdown(text.substring(lastIndex, match.index)));
    }
    // 代码块
    segments.push({
      text: match[2],
      style: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        backgroundColor: '#111',
        color: '#fff',
        fontSize: 14,
        padding: 4,
      }
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments = segments.concat(parseInlineMarkdown(text.substring(lastIndex)));
  }
  return segments;
};

// 处理除代码块外的其它 markdown 语法
function parseInlineMarkdown(text: string): TextSegment[] {
  let segments: TextSegment[] = [];
  let cursor = 0;

  // 支持的语法：标题、粗体、斜体、删除线、链接、图片、引用、任务列表、表格、列表
  // 按顺序处理，优先长匹配
  const regex = /^(#{1,6})\s+(.*)$|^>\s?(.*)$|^(\s*[-*+]|\d+\.)\s+(.*)$|^-\s\[( |x)\]\s(.*)$|!\[([^\]]*)\]\(([^\)]+)\)|\[(.*?)\]\(([^\)]+)\)|\*\*([^\*]+)\*\*|__([^_]+)__|\*([^\*]+)\*|_([^_]+)_|~~([^~]+)~~|`([^`]+)`/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.substring(lastIndex, match.index), style: {} });
    }
    // 标题
    if (match[1]) {
      const level = match[1].length;
      segments.push({
        text: match[2],
        style: {
          fontWeight: 'bold',
          fontSize: 24 - (level - 1) * 2,
          marginVertical: 4,
        }
      });
    }
    // 引用
    else if (match[3]) {
      segments.push({
        text: match[3],
        style: {
          color: '#d0d0d0',
          fontStyle: 'italic',
          borderLeftWidth: 4,
          borderLeftColor: '#ff79c6',
          paddingLeft: 6,
        }
      });
    }
    // 有序/无序列表
    else if (match[4]) {
      segments.push({
        text: match[5],
        style: {
          marginLeft: 12,
          fontSize: 15,
        }
      });
    }
    // 任务列表
    else if (typeof match[6] !== 'undefined') {
      segments.push({
        text: (match[6] === 'x' ? '[x] ' : '[ ] ') + match[7],
        style: {
          color: match[6] === 'x' ? '#27ae60' : '#bbb',
          textDecorationLine: match[6] === 'x' ? 'line-through' : undefined,
        }
      });
    }
    // 图片
    else if (match[8] && match[9]) {
      segments.push({
        text: `[图片:${match[8]}](${match[9]})`,
        style: { color: '#3498db' }
      });
    }
    // 链接
    else if (match[10] && match[11]) {
      segments.push({
        text: match[10],
        style: { color: '#3498db', textDecorationLine: 'underline' }
      });
    }
    // 粗体
    else if (match[12]) {
      segments.push({
        text: match[12],
        style: { fontWeight: 'bold' }
      });
    }
    else if (match[13]) {
      segments.push({
        text: match[13],
        style: { fontWeight: 'bold' }
      });
    }
    // 斜体
    else if (match[14]) {
      segments.push({
        text: match[14],
        style: { fontStyle: 'italic' }
      });
    }
    else if (match[15]) {
      segments.push({
        text: match[15],
        style: { fontStyle: 'italic' }
      });
    }
    // 删除线
    else if (match[16]) {
      segments.push({
        text: match[16],
        style: { textDecorationLine: 'line-through', color: '#bbb' }
      });
    }
    // 行内代码
    else if (match[17]) {
      segments.push({
        text: match[17],
        style: {
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          backgroundColor: '#222',
          color: '#fff',
          borderRadius: 3,
          padding: 2,
        }
      });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), style: {} });
  }
  return segments;
}

// Check if text contains complex HTML that should be rendered with the HTML renderer
export const containsComplexHtml = (text: string): boolean => {
  if (!text) return false;
  
  // Look for specific HTML patterns that would benefit from rich rendering
  const complexPatterns = [
    /<(div|p|ul|ol|li|img|a|details|summary|h[1-6]|table|pre|code|blockquote)\b/i,
    /<(b|i|span|strong|em|mark|sub|sup|del|ins)\b[^>]*style=/i,
    /<table|<tr|<td|<th/i,
    /<br\s*\/>\s*<br/i,  // Multiple line breaks
    /style\s*=\s*["'][^"']*["']/i, // Style attributes
    /class\s*=\s*["'][^"']*["']/i, // Class attributes
    // More flexible patterns for custom tags
    /<\s*(thinking|think|status|mem|websearch)[^>]*>[\s\S]*?<\/\s*(thinking|think|status|mem|websearch)\s*>/i,
    /<\s*char\s+think[^>]*>[\s\S]*?<\/\s*char\s+think\s*>/i,
    /```[\w]*\n[\s\S]*?```/,  // Markdown code blocks
    /\*\*([\s\S]*?)\*\*/,  // Bold markdown
    /\*[\s\S]*?\*/,      // Italic markdown
    /\[[\s\S]*?\]\([\s\S]*?\)/,  // Markdown links
    /!\[[\s\S]*?\]\((https?:\/\/[\s\S]*?|data:image\/[\s\S]*?)\)/,  // Regular Markdown images with http or data URLs
    /!\[[\s\S]*?\]\(image:[\s\S]*?\)/,  // Custom image:id format
  ];
  
  return complexPatterns.some(pattern => pattern.test(text));
};

// Optimize HTML by applying simplifications before rendering
export const optimizeHtmlForRendering = (html: string): string => {
  if (!html) return '';
  
  // First handle line breaks in text content for HTML nodes that don't preserve whitespace
  let processedHtml = html;
  
  // Replace line breaks in content outside of HTML tags with <br/> tags
  processedHtml = processedHtml.replace(/(?<=>|^)([^<]+)(?=<|$)/g, (match) => {
    return match.replace(/\n/g, '<br/>');
  });

  // Handle existing <br> tags for consistency
  processedHtml = processedHtml.replace(/<br\s*\/?>/gi, '<br/>');
  
  // Prevent unnecessary BR elements inside certain custom tags
  const fixStatus = /<(status|StatusBlock|statusblock)>(.+?)<\/(status|StatusBlock|statusblock)>/gs;
  processedHtml = processedHtml.replace(fixStatus, (match, startTag, content, endTag) => {
    // For status blocks, we want to preserve line breaks as HTML <br> tags
    return `<${startTag}>${content}</${endTag}>`;
  });

  // Make sure custom tags are properly formatted
  // Sometimes AI might add spaces in the tags which breaks the parser
  processedHtml = processedHtml
    // Fix opening tags (removing unwanted spaces)
    .replace(/<\s*(thinking|think|status|mem|websearch|char-think)(\s+[^>]*)?>/gi, 
             (match, tag, attrs) => `<${tag}${attrs || ''}>`)
    // Fix closing tags (removing unwanted spaces)
    .replace(/<\/\s*(thinking|think|status|mem|websearch|char-think)\s*>/gi, 
             (match, tag) => `</${tag}>`)
    // Ensure proper nesting within custom tags
    .replace(/(<(mem|websearch|thinking|think|status|char-think)>)(.*?)(<\/\2>)/gis,
             (match, openTag, tagName, content, closeTag) => {
               // Make sure content starts with a block element for proper rendering
               if (!content.trim().startsWith('<')) {
                 return `${openTag}<p>${content}</p>${closeTag}`;
               }
               return match;
             });
  
  return processedHtml;
};

// Process custom tags before HTML parsing - keep tags intact for react-native-render-html
export const preprocessCustomTags = (html: string): string => {
  if (!html) return '';
  
  // 只处理粗体，斜体交给 Markdown 渲染器
  let processed = html.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');

  return processed;
};
