import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import RichTextRenderer from '@/components/RichTextRenderer';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';
import { optimizeHtmlForRendering } from '@/utils/textParser';
import { convertMarkdownToHtml } from '@/utils/contentAnalysis';

const { width } = Dimensions.get('window');

interface HtmlRendererProps {
  text: string;
  isUser: boolean;
  uiSettings: ChatUISettings;
  onImagePress?: (url: string) => void;
  hasMarkdown: boolean;
  maxImageHeight?: number;
}

// Known tags whitelist
const KNOWN_TAGS = [
  'img', 'thinking', 'think', 'mem', 'status', 'StatusBlock', 'statusblock',
  'summary', 'details',
  'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li',
  'del', 's', 'strike',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'blockquote',
  'pre', 'code', 'mark', 'figure', 'figcaption', 'video', 'audio',
  'source', 'section', 'article', 'aside', 'nav', 'header', 'footer',
  'style', 'script', 'html', 'body', 'head', 'meta', 'link', 'title', 'doctype' 
];

/**
 * Remove unknown tags, keep only content
 */
const stripUnknownTags = (html: string): string => {
  if (!html) return '';
  
  // Match all paired tags (support underscore, numbers, -)
  let result = html.replace(/<([a-zA-Z0-9_\-]+)(\s[^>]*)?>([\s\S]*?)<\/\1>/g, (match, tag, attrs, content) => {
    // Case insensitive
    if (KNOWN_TAGS.map(t => t.toLowerCase()).includes(tag.toLowerCase())) {
      return match; // Known tag, keep
    }
    // Unknown tag, recursively process content
    return stripUnknownTags(content);
  });
  
  // Match all single unknown tags (self-closing or unclosed)
  result = result.replace(/<([a-zA-Z0-9_\-]+)(\s[^>]*)?>/g, (match, tag) => {
    if (KNOWN_TAGS.map(t => t.toLowerCase()).includes(tag.toLowerCase())) {
      return match;
    }
    // Unknown single tag, remove
    return '';
  });
  
  return result;
};

const HtmlRenderer: React.FC<HtmlRendererProps> = ({
  text,
  isUser,
  uiSettings,
  onImagePress,
  hasMarkdown,
  maxImageHeight = 300,
}) => {
  const getTextStyle = () => ({
    fontSize: Math.min(Math.max(14, width * 0.04), 16) * uiSettings.textSizeMultiplier,
    color: isUser 
      ? (uiSettings.regularUserTextColor || '#333333')
      : (uiSettings.regularBotTextColor || '#ffffff'),
  });

  let processedText = text;
  
  // If it contains both HTML and Markdown, convert Markdown to HTML first
  if (hasMarkdown) {
    processedText = convertMarkdownToHtml(processedText);
  }
  
  // Clean unknown tags before rendering
  const cleanedText = stripUnknownTags(processedText);

  return (
    <View style={styles.container}>
      <RichTextRenderer
        html={optimizeHtmlForRendering(cleanedText)}
        baseStyle={getTextStyle()}
        onImagePress={onImagePress}
        maxImageHeight={maxImageHeight}
        uiSettings={uiSettings}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});

export default HtmlRenderer;
