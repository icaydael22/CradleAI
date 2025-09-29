import React from 'react';
import { View, Text, Platform, Dimensions, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';

const { width } = Dimensions.get('window');

interface MarkdownRendererProps {
  text: string;
  isUser: boolean;
  uiSettings: ChatUISettings;
  onImagePress?: (url: string) => void;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  text,
  isUser,
  uiSettings,
  onImagePress,
}) => {
  const getTextStyle = () => ({
    fontSize: Math.min(Math.max(14, width * 0.04), 16) * uiSettings.textSizeMultiplier,
    color: isUser 
      ? (uiSettings.regularUserTextColor || '#333333')
      : (uiSettings.regularBotTextColor || '#ffffff'),
  });

  return (
    <View style={styles.container}>
      <Markdown
        style={{
          body: {
            ...getTextStyle(),
            color: uiSettings.markdownTextColor,
          },
          text: {
            ...getTextStyle(),
            color: uiSettings.markdownTextColor,
          },
          code_block: { 
            backgroundColor: uiSettings.markdownCodeBackgroundColor,
            color: uiSettings.markdownCodeTextColor,
            borderRadius: 6,
            padding: 12,
            fontSize: 14 * uiSettings.markdownCodeScale,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            marginVertical: 10,
          },
          code_block_text: {
            backgroundColor: uiSettings.markdownCodeBackgroundColor,
            color: uiSettings.markdownCodeTextColor,
            fontSize: 14 * uiSettings.markdownCodeScale,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            padding: 0,
          },
          fence: {
            backgroundColor: uiSettings.markdownCodeBackgroundColor,
            borderRadius: 6,
            marginVertical: 10,
            width: '100%',
          },
          fence_code: {
            backgroundColor: uiSettings.markdownCodeBackgroundColor,
            color: uiSettings.markdownCodeTextColor,
            borderRadius: 6,
            padding: 12,
            fontSize: 14 * uiSettings.markdownCodeScale,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            width: '100%',
          },
          fence_code_text: {
            backgroundColor: uiSettings.markdownCodeBackgroundColor,
            color: uiSettings.markdownCodeTextColor,
            fontSize: 14 * uiSettings.markdownCodeScale,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            padding: 0,
          },
          heading1: { 
            fontSize: 24 * uiSettings.markdownTextScale, 
            fontWeight: 'bold', 
            marginVertical: 10,
            color: uiSettings.markdownHeadingColor 
          },
          heading2: { 
            fontSize: 22 * uiSettings.markdownTextScale, 
            fontWeight: 'bold', 
            marginVertical: 8,
            color: uiSettings.markdownHeadingColor
          },
          heading3: { 
            fontSize: 20 * uiSettings.markdownTextScale, 
            fontWeight: 'bold', 
            marginVertical: 6,
            color: uiSettings.markdownHeadingColor
          },
          heading4: { 
            fontSize: 18 * uiSettings.markdownTextScale, 
            fontWeight: 'bold', 
            marginVertical: 5,
            color: uiSettings.markdownHeadingColor
          },
          heading5: { 
            fontSize: 16 * uiSettings.markdownTextScale, 
            fontWeight: 'bold', 
            marginVertical: 4,
            color: uiSettings.markdownHeadingColor
          },
          heading6: { 
            fontSize: 14 * uiSettings.markdownTextScale, 
            fontWeight: 'bold', 
            marginVertical: 3,
            color: uiSettings.markdownHeadingColor
          },
          bullet_list: { marginVertical: 6 },
          ordered_list: { marginVertical: 6 },
          list_item: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2 },
          blockquote: { 
            backgroundColor: uiSettings.markdownQuoteBackgroundColor, 
            borderLeftWidth: 4, 
            borderLeftColor: '#aaa', 
            padding: 8, 
            marginVertical: 6 
          },
          blockquote_text: {
            color: uiSettings.markdownQuoteColor,
          },
          table: { borderWidth: 1, borderColor: '#666', marginVertical: 8 },
          th: { backgroundColor: '#444', color: '#fff', fontWeight: 'bold', padding: 6 },
          tr: { borderBottomWidth: 1, borderColor: '#666' },
          td: { padding: 6, color: '#fff' },
          hr: { borderBottomWidth: 1, borderColor: '#aaa', marginVertical: 8 },
          link: { color: uiSettings.markdownLinkColor, textDecorationLine: 'underline' },
          strong: { color: uiSettings.markdownBoldColor, fontWeight: 'bold' },
          em: { 
            color: uiSettings.markdownTextColor, 
            fontStyle: 'italic',
            fontSize: Math.min(Math.max(14, width * 0.04), 16) * uiSettings.markdownTextScale
          },
          image: { width: 220, height: 160, borderRadius: 8, marginVertical: 8, alignSelf: 'center' },
        }}
        onLinkPress={(url: string) => {
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
            if (typeof window !== 'undefined') {
              window.open(url, '_blank');
            } else if (onImagePress) {
              onImagePress(url);
            }
            return true;
          }
          return false;
        }}
        rules={{
          fence: (
            node: any,
            children: React.ReactNode[],
            parent: any[],
            styles: any
          ) => {
            return (
              <View key={node.key} style={styles.code_block}>
                <Text style={styles.code_block_text}>
                  {node.content || ''}
                </Text>
              </View>
            );
          }
        }}
      >
        {text}
      </Markdown>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});

export default MarkdownRenderer;
