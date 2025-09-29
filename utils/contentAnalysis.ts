/**
 * Content analysis utilities for message rendering
 */

export interface ContentAnalysis {
  isEmpty: boolean;
  hasMarkdown: boolean;
  hasHtmlTags: boolean;
  hasCustomTags: boolean;
  hasImages: boolean;
  hasLinks: boolean;
  isRawImage: boolean;
  isWebViewContent: boolean;
}

/**
 * Analyze message content to determine rendering strategy
 */
export const analyzeMessageContent = (text: string): ContentAnalysis => {
  if (!text || typeof text !== 'string') {
    return { 
      isEmpty: true, 
      hasMarkdown: false, 
      hasHtmlTags: false, 
      hasCustomTags: false, 
      hasImages: false, 
      hasLinks: false, 
      isRawImage: false,
      isWebViewContent: false
    };
  }

  const normalizedText = text.trim();
  
  // Check for empty content
  if (!normalizedText) {
    return { 
      isEmpty: true, 
      hasMarkdown: false, 
      hasHtmlTags: false, 
      hasCustomTags: false, 
      hasImages: false, 
      hasLinks: false, 
      isRawImage: false,
      isWebViewContent: false
    };
  }

  // Check for raw image pattern
  const rawImageRegex = /^!\[(.*?)\]\(image:([a-zA-Z0-9\-_]+)\)$/;
  const isRawImage = rawImageRegex.test(normalizedText);

  // Check for WebView content (complete HTML documents)
  const isWebViewContent = (
    (normalizedText.toLowerCase().includes('<!doctype') || 
     normalizedText.toLowerCase().includes('<html')) &&
    (normalizedText.toLowerCase().includes('</html>') || 
     normalizedText.toLowerCase().includes('<head>') ||
     normalizedText.toLowerCase().includes('<body>'))
  ) || (
    // Also check for complex HTML with multiple structured elements
    normalizedText.includes('<div') && 
    normalizedText.includes('<style') &&
    normalizedText.split('<').length > 10 // Arbitrary threshold for "complex" HTML
  );

  // Check for various content types
  const hasMarkdown = /(\*\*.*?\*\*|\*.*?\*|__.*?__|_.*?_|~~.*?~~|`.*?`|#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|```[\s\S]*?```|\[.*?\]\(.*?\))/m.test(text);
  const hasHtmlTags = /<[^>]+>/g.test(text);
  const hasCustomTags = /<(thinking|think|mem|status|StatusBlock|statusblock|img)\b[^>]*>/i.test(text);
  const hasImages = /!\[.*?\]\((?:image:|https?:\/\/|data:image\/)/g.test(text);
  const hasLinks = /\[.*?\]\(https?:\/\/[^\s)]+\)/g.test(text);

  return {
    isEmpty: false,
    hasMarkdown,
    hasHtmlTags,
    hasCustomTags,
    hasImages,
    hasLinks,
    isRawImage,
    isWebViewContent
  };
};

/**
 * Check if content is complete HTML that should be rendered in WebView
 */
export const isCompleteHtmlContent = (text: string): boolean => {
  const analysis = analyzeMessageContent(text);
  return analysis.isWebViewContent;
};

/**
 * Convert Markdown to HTML for mixed content processing
 */
export const convertMarkdownToHtml = (text: string): string => {
  if (!text) return '';
  
  let processedText = text;
  
  // Process code blocks first (avoid nested processing issues)
  processedText = processedText
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="${lang ? `language-${lang}` : ''}">${code}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold (must be processed before italic)
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
    // Italic (now process single asterisk or underscore)
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    // Headers
    .replace(/^#{6}\s+(.*)$/gm, '<h6>$1</h6>')
    .replace(/^#{5}\s+(.*)$/gm, '<h5>$1</h5>')
    .replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>')
    .replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>')
    // Line breaks
    .replace(/\n/g, '<br/>');
    
  return processedText;
};