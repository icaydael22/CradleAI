// Visual Novel mode utility functions
// These functions were extracted from ChatDialog.tsx for better modularity

/**
 * Check if text contains structural HTML tags
 */
export const containsStructuralTags = (text: string): boolean => {
  const STRUCTURAL_TAGS = [
    'source', 'section', 'article', 'aside', 'nav', 'header', 'footer',
    'style', 'script', 'html', 'body', 'head', 'meta', 'link', 'title', 'doctype'
  ];
  
  return STRUCTURAL_TAGS.some(tag => {
    const regex = new RegExp(`<${tag}[\\s>]|</${tag}>|<!DOCTYPE`, 'i');
    return regex.test(text);
  });
};

/**
 * Check if text is a complete HTML page
 */
export const isFullHtmlPage = (text: string): boolean => {
  return /^\s*(<!DOCTYPE html|<html)/i.test(text);
};

/**
 * Check if content should be rendered as WebView
 */
export const isWebViewContent = (text: string): boolean => {
  // Check for direct HTML document or DOCTYPE
  if (isFullHtmlPage(text)) {
    return true;
  }
  
  // Check for complete HTML page anywhere in text
  if (/<!DOCTYPE\s+html[\s\S]*?<\/html>/i.test(text)) {
    return true;
  }
  
  // Check for HTML content in code blocks
  const codeBlockMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && isFullHtmlPage(codeBlockMatch[1])) {
    return true;
  }
  
  // Check for structural tags
  if (containsStructuralTags(text)) {
    return true;
  }
  
  if (codeBlockMatch && containsStructuralTags(codeBlockMatch[1])) {
    return true;
  }
  
  // Check for mixed HTML content
  const fullHtmlMatch = text.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
  if (fullHtmlMatch) {
    const remainingContent = text.replace(fullHtmlMatch[0], '').trim();
    if (remainingContent) {
      return true;
    }
  }
  
  return false;
};

/**
 * Extract HTML content from code blocks
 */
export const extractHtmlFromCodeBlock = (text: string): string => {
  if (!text) return '';
  
  // Check if text directly contains complete HTML
  if (isFullHtmlPage(text) || containsStructuralTags(text)) {
    return text;
  }
  
  // Check for complete HTML page anywhere in text
  const fullHtmlMatch = text.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
  if (fullHtmlMatch) {
    return text;
  }
  
  // Check for HTML in code blocks
  const codeBlockMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (isFullHtmlPage(content) || containsStructuralTags(content)) {
      const remainingContent = text.replace(codeBlockMatch[0], '').trim();
      if (remainingContent) {
        return text;
      } else {
        return content;
      }
    }
  }
  
  return text;
};

/**
 * Enhance HTML with markdown processing for mixed content
 */
export const enhanceHtmlWithMarkdown = (raw: string): string => {
  // Detect complete HTML pages
  const fullHtmlMatch = raw.match(/(<!DOCTYPE\s+html[\s\S]*?<\/html>)/i);
  let fullHtmlContent = '';
  let remainingContent = raw;
  
  if (fullHtmlMatch) {
    fullHtmlContent = fullHtmlMatch[1];
    remainingContent = raw.replace(fullHtmlMatch[0], '').trim();
  }

  // Extract code blocks
  const codeBlockRegex = /```([a-zA-Z]*)\s*([\s\S]*?)```/g;
  let htmlBlocks: string[] = [];
  let markdownBlocks: string[] = [];
  let cssBlocks: string[] = [];
  let processedContent = remainingContent;

  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(remainingContent)) !== null) {
    const [full, lang, content] = match;
    if (lang.trim().toLowerCase() === 'html') {
      htmlBlocks.push(content);
    } else if (lang.trim().toLowerCase() === 'css') {
      cssBlocks.push(content);
    } else if (lang.trim().toLowerCase() === 'markdown' || lang.trim() === '') {
      markdownBlocks.push(content);
    }
  }

  // Remove code blocks from content
  processedContent = remainingContent.replace(codeBlockRegex, '').trim();

  // Combine additional content
  let additionalContent = '';
  
  if (markdownBlocks.length > 0) {
    additionalContent += markdownBlocks.join('\n\n') + '\n\n';
  }
  
  if (processedContent) {
    additionalContent += processedContent + '\n\n';
  }
  
  if (htmlBlocks.length > 0) {
    additionalContent += htmlBlocks.join('\n\n') + '\n\n';
  }

  // Combine CSS content
  let cssContent = '';
  if (cssBlocks.length > 0) {
    cssContent = cssBlocks.join('\n');
  }

  // Build final HTML page
  if (fullHtmlContent) {
    let enhancedHtml = fullHtmlContent;
    
    // Inject additional CSS
    if (cssContent) {
      enhancedHtml = enhancedHtml.replace(
        /<\/head>/i,
        `<style>
          .additional-content { 
            color: #fff !important; 
            margin: 2em 0; 
            padding: 1em; 
            background-color: rgba(40, 42, 54, 0.8); 
            border-radius: 8px; 
            border-left: 4px solid #ff79c6;
          }
          .additional-content h1, .additional-content h2, .additional-content h3 { 
            color: #ff79c6; 
          }
          .additional-content code { 
            background: rgba(20, 22, 34, 0.8); 
            padding: 0.2em 0.4em; 
            border-radius: 3px; 
            font-family: monospace; 
            font-size: 0.9em; 
          }
          .additional-content pre { 
            background: rgba(20, 22, 34, 0.8); 
            padding: 1em; 
            border-radius: 5px; 
            overflow-x: auto; 
          }
          .additional-content blockquote { 
            border-left: 4px solid #ff79c6; 
            padding-left: 1em; 
            color: #d0d0d0; 
          }
          ${cssContent}
        </style>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        </head>`
      );
    } else {
      enhancedHtml = enhancedHtml.replace(
        /<\/head>/i,
        `<style>
          .additional-content { 
            color: #fff !important; 
            margin: 2em 0; 
            padding: 1em; 
            background-color: rgba(40, 42, 54, 0.8); 
            border-radius: 8px; 
            border-left: 4px solid #ff79c6;
          }
          .additional-content h1, .additional-content h2, .additional-content h3 { 
            color: #ff79c6; 
          }
          .additional-content code { 
            background: rgba(20, 22, 34, 0.8); 
            padding: 0.2em 0.4em; 
            border-radius: 3px; 
            font-family: monospace; 
            font-size: 0.9em; 
          }
          .additional-content pre { 
            background: rgba(20, 22, 34, 0.8); 
            padding: 1em; 
            border-radius: 5px; 
            overflow-x: auto; 
          }
          .additional-content blockquote { 
            border-left: 4px solid #ff79c6; 
            padding-left: 1em; 
            color: #d0d0d0; 
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        </head>`
      );
    }
    
    // Insert additional content at end of body
    if (additionalContent.trim()) {
      enhancedHtml = enhancedHtml.replace(
        /<\/body>/i,
        `<div class="additional-content">
          <h3>附加内容</h3>
          <div id="additional-markdown-content"></div>
          <div id="additional-html-content"></div>
        </div>
        <script>
          if (typeof marked !== 'undefined' && \`${additionalContent.replace(/`/g, '\\`')}\`.trim()) {
            try {
              const content = \`${additionalContent.replace(/`/g, '\\`')}\`;
              const htmlTagRegex = /<[^>]+>/g;
              const hasHtmlTags = htmlTagRegex.test(content);
              
              if (hasHtmlTags) {
                document.getElementById('additional-html-content').innerHTML = content;
              } else {
                document.getElementById('additional-markdown-content').innerHTML = marked.parse(content);
              }
            } catch (e) {
              console.error('Error processing additional content:', e);
              document.getElementById('additional-html-content').innerHTML = \`${additionalContent.replace(/`/g, '\\`')}\`;
            }
          }
        </script>
        </body>`
      );
    }
    
    return enhancedHtml;
  }

  // If no complete HTML, create a simple page
  const baseStyle = `
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6; 
      margin: 0; 
      padding: 20px; 
      background: linear-gradient(135deg, #1e3c72, #2a5298); 
      color: #fff; 
      min-height: 100vh;
    }
    .content { 
      max-width: 800px; 
      margin: 0 auto; 
      background: rgba(0, 0, 0, 0.3); 
      padding: 2em; 
      border-radius: 12px;
    }
    h1, h2, h3 { color: #ff79c6; }
    code { 
      background: rgba(20, 22, 34, 0.8); 
      padding: 0.2em 0.4em; 
      border-radius: 3px; 
      font-family: monospace; 
    }
    pre { 
      background: rgba(20, 22, 34, 0.8); 
      padding: 1em; 
      border-radius: 5px; 
      overflow-x: auto; 
    }
    blockquote { 
      border-left: 4px solid #ff79c6; 
      padding-left: 1em; 
      color: #d0d0d0; 
    }
    ${cssContent}
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${baseStyle}</style>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    </head>
    <body>
      <div class="content" id="content"></div>
      <script>
        if (typeof marked !== 'undefined') {
          try {
            const content = \`${raw.replace(/`/g, '\\`')}\`;
            const htmlTagRegex = /<[^>]+>/g;
            const hasHtmlTags = htmlTagRegex.test(content);
            
            if (hasHtmlTags) {
              document.getElementById('content').innerHTML = content;
            } else {
              document.getElementById('content').innerHTML = marked.parse(content);
            }
          } catch (e) {
            console.error('Error processing content:', e);
            document.getElementById('content').innerHTML = \`${raw.replace(/`/g, '\\`')}\`;
          }
        } else {
          document.getElementById('content').innerHTML = \`${raw.replace(/`/g, '\\`')}\`;
        }
      </script>
    </body>
    </html>
  `;
};
