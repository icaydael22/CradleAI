import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Dimensions,
  LogBox,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RenderHTML, { 
  HTMLElementModel, 
  HTMLContentModel,
  CustomRendererProps, 
  TBlock, 
  TNodeChildrenRenderer,
  TText,
  CustomTextualRenderer
} from 'react-native-render-html';
import ImageManager from '@/utils/ImageManager';

// Suppress specific warnings from the react-native-render-html library
LogBox.ignoreLogs([
  'TRenderEngineProvider: Support for defaultProps will be removed from function components',
  'MemoizedTNodeRenderer: Support for defaultProps will be removed from memo components'
]);

const { width } = Dimensions.get('window');
const MAX_CONTENT_WIDTH = width * 0.95;

// Custom renderer for the <thinking> tag
const ThinkingRenderer = ({ 
  tnode, 
  ...props 
}: CustomRendererProps<TBlock>) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  return (
    <View style={styles.thinkingContainer}>
      <TouchableOpacity 
        style={styles.thinkingHeader}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Ionicons 
          name={isExpanded ? "chevron-down" : "chevron-forward"} 
          size={16} 
          color="#aaa" 
          style={styles.thinkingIcon}
        />
        <Text style={styles.thinkingTitle}>思考过程</Text>
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.thinkingContent}>
          <TNodeChildrenRenderer
            tnode={tnode}
          />
        </View>
      )}
    </View>
  );
};

// Custom renderer for the <memory> tag - Updated to use "思考" as title
const MemoryRenderer = ({ 
  tnode, 
  ...props 
}: CustomRendererProps<TBlock>) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Create a style object for italic text that we'll apply to all text in this component
  const italicStyle = { fontStyle: 'italic' as const };
  
  return (
    <View style={styles.memoryContainer}>
      <TouchableOpacity 
        style={styles.memoryHeader}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Ionicons 
          name={isExpanded ? "chevron-down" : "chevron-forward"} 
          size={16} 
          color="white" 
          style={styles.memoryIcon}
        />
        <Text style={styles.memoryTitle}>回忆</Text>
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.memoryContent}>
          <TNodeChildrenRenderer
            tnode={tnode}
            propsForChildren={{
              // Pass the italic style to all children via propsForChildren
              textStyle: italicStyle
            }}
          />
        </View>
      )}
    </View>
  );
};

// Custom renderer for the <websearch> tag - Title remains "搜索结果"
const WebsearchRenderer = ({ 
  tnode, 
  ...props 
}: CustomRendererProps<TBlock>) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Create a style object for italic text that we'll apply to all text in this component
  const italicStyle = { fontStyle: 'italic' as const };
  
  return (
    <View style={styles.websearchContainer}>
      <TouchableOpacity 
        style={styles.websearchHeader}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Ionicons 
          name={isExpanded ? "chevron-down" : "chevron-forward"} 
          size={16} 
          color="#4caf50" 
          style={styles.websearchIcon}
        />
        <Text style={styles.websearchTitle}>搜索结果</Text>
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.websearchContent}>
          <TNodeChildrenRenderer
            tnode={tnode}
            propsForChildren={{
              // Pass the italic style to all children via propsForChildren
              textStyle: italicStyle
            }}
          />
        </View>
      )}
    </View>
  );
};

// Custom renderer for the <status> tag
const StatusRenderer = ({ 
  tnode, 
  ...props 
}: CustomRendererProps<TBlock>) => {
  // 黑色背景，白色字体，类似 codeblock
  return (
    <View style={styles.statusBlockContainer}>
      <TNodeChildrenRenderer
        tnode={tnode}
      />
    </View>
  );
};

// Custom renderer for the <font> tag - handles font attributes
// Fix: Properly type as CustomTextualRenderer to match expected types in CustomTagRendererRecord
const FontRenderer: CustomTextualRenderer = function FontRenderer({ 
  tnode,
  TDefaultRenderer,
  ...props 
}) {
  // Extract font attributes if available
  const color = tnode.attributes.color || null;
  const face = tnode.attributes.face || null;
  const size = tnode.attributes.size || null;
  
  // Create style object based on attributes
  const fontStyle: Record<string, any> = {};
  
  if (color) {
    fontStyle.color = color;
  }
  
  if (face) {
    fontStyle.fontFamily = face;
  }
  
  if (size) {
    // Convert HTML font size (1-7) to pixels
    const fontSize = {
      '1': 10,
      '2': 13,
      '3': 16, // Default
      '4': 18,
      '5': 24,
      '6': 32,
      '7': 48
    }[size];
    
    if (fontSize) {
      fontStyle.fontSize = fontSize;
    }
  }
  
  // Render with the font styles applied
  return (
    <TDefaultRenderer
      {...props}
      tnode={tnode}
      style={fontStyle}
    >
      <TNodeChildrenRenderer tnode={tnode} />
    </TDefaultRenderer>
  );
};

// 添加通用未知标签渲染器
const UnknownTagRenderer = ({ 
  tnode, 
  ...props 
}: CustomRendererProps<TBlock>) => {
  // 递归提取所有子节点的纯文本内容
  const extractText = (children: readonly any[]): string => {
    return children.map(child => {
      if (child.type === 'text') {
        return child.data;
      } else if (child.type === 'element' && child.children) {
        return extractText(child.children);
      }
      return '';
    }).join('');
  };

  const textContent = tnode.children && tnode.children.length > 0
    ? extractText(tnode.children)
    : '';

  // 加粗显示内容
  return (
    <Text style={{ fontWeight: 'bold', color: '#fff' }}>
      {textContent}
    </Text>
  );
};

// Main function to parse HTML content with React Native Render HTML
export const parseHtmlToReactNative = (
  html: string,
  options: {
    baseStyle?: Record<string, any>;
    handleLinkPress?: (url: string) => void;
    handleImagePress?: (url: string) => void;
    maxImageHeight?: number;
    uiSettings?: {
      markdownTextColor?: string;
      markdownBoldColor?: string;
      markdownCodeTextColor?: string;
      markdownCodeBackgroundColor?: string;
      markdownCodeScale?: number;
      markdownTextScale?: number;
      markdownHeadingColor?: string;
      markdownQuoteColor?: string;
      markdownQuoteBackgroundColor?: string;
      markdownLinkColor?: string;
    };
  } = {}
): React.ReactNode => {
  const {
    baseStyle = {},
    handleLinkPress = (url) => Linking.openURL(url),
    handleImagePress,
    maxImageHeight = 300,
    uiSettings = {},
  } = options;

  // 直接传递原始 html，不做换行替换
  // const processedHtml = html.replace(...); // <-- 删除这一行

  // 定义已知标签列表
  const knownTags = [
    // 自定义标签
    'img', 'thinking', 'think', 'mem', 'status', 'StatusBlock', 
    'statusblock', 'websearch', 'char-think', 'font',
    // 新增 summary/details
    'summary', 'details',
    // 标准HTML标签
    'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span',
    'b', 'strong', 'i', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li',
    'table', 'tr', 'td', 'th', 'thead', 'tbody', 'blockquote',
    'pre', 'code', 'mark', 'figure', 'figcaption', 'video', 'audio',
    'source', 'section', 'article', 'aside', 'nav', 'header', 'footer',
    'del', 's', 'strike'  // 添加删除线相关标签
  ];

  const renderers = {
    img: ({ tnode }: CustomRendererProps<TBlock>) => {
      const source = { uri: tnode.attributes.src };
      const alt = tnode.attributes.alt || 'Image';

      if (tnode.attributes.src.startsWith('image:')) {
        const imageId = tnode.attributes.src.substring(6);
        const imageInfo = ImageManager.getImageInfo(imageId);

        if (imageInfo) {
          return (
            <View style={styles.imageWrapper}>
              <TouchableOpacity
                onPress={() => handleImagePress && handleImagePress(imageInfo.originalPath)}
              >
                <Image
                  source={{ uri: imageInfo.thumbnailPath }}
                  style={[styles.image, { maxHeight: maxImageHeight }]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <Text style={styles.imageCaption}>{alt}</Text>
            </View>
          );
        } else {
          return (
            <View style={styles.imageError}>
              <Ionicons name="alert-circle" size={24} color="#e74c3c" />
              <Text style={styles.imageErrorText}>图片无法加载 (ID: {imageId.substring(0, 8)}...)</Text>
            </View>
          );
        }
      }

      return (
        <View style={styles.imageWrapper}>
          <TouchableOpacity
            onPress={() => handleImagePress && handleImagePress(tnode.attributes.src)}
          >
            <Image
              source={source}
              style={[styles.image, { maxHeight: maxImageHeight }]}
              resizeMode="contain"
            />
          </TouchableOpacity>
          {alt && alt !== 'Image' && <Text style={styles.imageCaption}>{alt}</Text>}
        </View>
      );
    },
    thinking: ThinkingRenderer,
    think: ThinkingRenderer,
    mem: MemoryRenderer,
    status: StatusRenderer,
    StatusBlock: StatusRenderer, // Case sensitive tag name
    statusblock: StatusRenderer, // Lowercase version for case-insensitive matching
    // 新增 summary/details
    summary: StatusRenderer,
    details: StatusRenderer,
    websearch: WebsearchRenderer,
    'char-think': ThinkingRenderer,
    font: FontRenderer, // Now properly typed as CustomTextualRenderer
    _unknown: UnknownTagRenderer, // 添加通用未知标签渲染器
  };

  const customHTMLElementModels = {
    thinking: HTMLElementModel.fromCustomModel({
      tagName: 'thinking',
      contentModel: HTMLContentModel.block
    }),
    think: HTMLElementModel.fromCustomModel({
      tagName: 'think',
      contentModel: HTMLContentModel.block
    }),
    mem: HTMLElementModel.fromCustomModel({
      tagName: 'mem',
      contentModel: HTMLContentModel.block
    }),
    status: HTMLElementModel.fromCustomModel({
      tagName: 'status',
      contentModel: HTMLContentModel.block
    }),
    StatusBlock: HTMLElementModel.fromCustomModel({
      tagName: 'StatusBlock',
      contentModel: HTMLContentModel.block
    }),
    // Add lowercase version for case-insensitive matching
    statusblock: HTMLElementModel.fromCustomModel({
      tagName: 'statusblock',
      contentModel: HTMLContentModel.block
    }),
    // 新增 summary/details
    summary: HTMLElementModel.fromCustomModel({
      tagName: 'summary',
      contentModel: HTMLContentModel.block
    }),
    details: HTMLElementModel.fromCustomModel({
      tagName: 'details',
      contentModel: HTMLContentModel.block
    }),
    websearch: HTMLElementModel.fromCustomModel({
      tagName: 'websearch',
      contentModel: HTMLContentModel.block
    }),
    'char-think': HTMLElementModel.fromCustomModel({
      tagName: 'char-think',
      contentModel: HTMLContentModel.block
    }),
    // Add model for font tag
    font: HTMLElementModel.fromCustomModel({
      tagName: 'font',
      contentModel: HTMLContentModel.textual
    }),
    // 添加通用未知标签模型
    _unknown: HTMLElementModel.fromCustomModel({
      tagName: '_unknown',
      contentModel: HTMLContentModel.block
    }),
  };

  // 定义标签样式，使用 UI 设置
  const tagsStyles = {
    p: { marginBottom: 10, color: uiSettings.markdownTextColor || '#fff', ...baseStyle },
    a: { color: uiSettings.markdownLinkColor || '#3498db', textDecorationLine: 'underline' as const },
    h1: { 
      fontSize: (24 * (uiSettings.markdownTextScale || 1)), 
      fontWeight: 'bold' as const, 
      marginVertical: 10, 
      color: uiSettings.markdownHeadingColor || '#fff',
      ...baseStyle 
    },
    h2: { 
      fontSize: (22 * (uiSettings.markdownTextScale || 1)), 
      fontWeight: 'bold' as const, 
      marginVertical: 8, 
      color: uiSettings.markdownHeadingColor || '#fff',
      ...baseStyle 
    },
    h3: { 
      fontSize: (20 * (uiSettings.markdownTextScale || 1)), 
      fontWeight: 'bold' as const, 
      marginVertical: 6, 
      color: uiSettings.markdownHeadingColor || '#fff',
      ...baseStyle 
    },
    h4: { 
      fontSize: (18 * (uiSettings.markdownTextScale || 1)), 
      fontWeight: 'bold' as const, 
      marginVertical: 5, 
      color: uiSettings.markdownHeadingColor || '#fff',
      ...baseStyle 
    },
    h5: { 
      fontSize: (16 * (uiSettings.markdownTextScale || 1)), 
      fontWeight: 'bold' as const, 
      marginVertical: 4, 
      color: uiSettings.markdownHeadingColor || '#fff',
      ...baseStyle 
    },
    h6: { 
      fontSize: (14 * (uiSettings.markdownTextScale || 1)), 
      fontWeight: 'bold' as const, 
      marginVertical: 3, 
      color: uiSettings.markdownHeadingColor || '#fff',
      ...baseStyle 
    },
    text: { color: uiSettings.markdownTextColor || '#fff', ...baseStyle },
    span: { color: uiSettings.markdownTextColor || '#fff', ...baseStyle },
    br: { height: 12 }, // Add specific height to line breaks to ensure visibility
    // 添加基本HTML标签样式，使用 UI 设置
    strong: { 
      fontWeight: 'bold' as const, 
      color: uiSettings.markdownBoldColor || '#fff', 
      ...baseStyle 
    },
    b: { 
      fontWeight: 'bold' as const, 
      color: uiSettings.markdownBoldColor || '#fff', 
      ...baseStyle 
    },
    em: { 
      fontStyle: 'italic' as const, 
      color: uiSettings.markdownTextColor || '#fff', 
      ...baseStyle 
    },
    i: { 
      fontStyle: 'italic' as const, 
      color: uiSettings.markdownTextColor || '#fff', 
      ...baseStyle 
    },
    u: { 
      textDecorationLine: 'underline' as const, 
      color: uiSettings.markdownTextColor || '#fff', 
      ...baseStyle 
    },
    del: { 
      textDecorationLine: 'line-through' as const, 
      color: '#aaa', 
      ...baseStyle 
    },
    s: { 
      textDecorationLine: 'line-through' as const, 
      color: '#aaa', 
      ...baseStyle 
    },
    strike: { 
      textDecorationLine: 'line-through' as const, 
      color: '#aaa', 
      ...baseStyle 
    },
    code: { 
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      backgroundColor: uiSettings.markdownCodeBackgroundColor || '#222',
      color: uiSettings.markdownCodeTextColor || '#fff',
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 2,
      fontSize: (14 * (uiSettings.markdownCodeScale || 1)),
      ...baseStyle
    },
    pre: {
      backgroundColor: uiSettings.markdownCodeBackgroundColor || '#111',
      borderRadius: 6,
      padding: 12,
      marginVertical: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      color: uiSettings.markdownCodeTextColor || '#fff',
      fontSize: (14 * (uiSettings.markdownCodeScale || 1)),
      ...baseStyle
    },
    blockquote: {
      backgroundColor: uiSettings.markdownQuoteBackgroundColor || 'rgba(255, 255, 255, 0.1)',
      borderLeftWidth: 4,
      borderLeftColor: '#aaa',
      padding: 8,
      marginVertical: 6,
      color: uiSettings.markdownQuoteColor || '#fff',
      ...baseStyle
    },
    // Add styles for mem and websearch tags to make all text inside them italic
    mem: { fontStyle: 'italic' as const },
    websearch: { fontStyle: 'italic' as const },
    status: { 
      // 让 <status> 内部文本为白色
      color: '#fff',
    },
    StatusBlock: { 
      color: '#fff',
    },
    statusblock: { 
      color: '#fff',
    },
    summary: { color: '#fff' },
    details: { color: '#fff' },
  };

  return (
    <RenderHTML
      contentWidth={MAX_CONTENT_WIDTH}
      // source={{ html: processedHtml }} // <-- 改为如下
      source={{ html }}
      tagsStyles={tagsStyles}
      customHTMLElementModels={customHTMLElementModels}
      renderers={renderers}
      baseStyle={{ 
        color: uiSettings.markdownTextColor || '#fff', 
        fontSize: 16, 
        ...baseStyle,
        textAlignVertical: 'center',
        whiteSpace: 'pre-wrap' as any,
      }}
      ignoredDomTags={[]} 
      domVisitors={{
        onElement: (element) => {
          // 只处理未注册的自定义标签
          if (!knownTags.includes(element.tagName.toLowerCase())) {
            // 将未知标签转为 _unknown，并把原始标签名和内容作为属性传递
            return {
              ...element,
              tagName: '_unknown',
              attributes: {
                ...(element.attributes || {}),
                'data-original-tag': element.tagName
              },
              // 保留原始子节点
              children: element.children
            };
          }
          return element;
        }
      }}
      enableExperimentalBRCollapsing={false}
      enableExperimentalGhostLinesPrevention={true}
      renderersProps={{
        _unknown: {
          // 可扩展
        }
      }}
    />
  );
};

const styles = StyleSheet.create({
  thinkingContainer: {
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  thinkingHeader: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  thinkingIcon: {
    marginRight: 8,
  },
  thinkingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#aaa',
  },
  thinkingContent: {
    padding: 12,
  },
  memoryContainer: {
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 159, 28, 0.3)',

    overflow: 'hidden',
  },
  memoryHeader: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  memoryIcon: {
    marginRight: 8,
  },
  memoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  memoryContent: {
    padding: 12,
  },
  websearchContainer: {
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    overflow: 'hidden',
  },
  websearchHeader: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  websearchIcon: {
    marginRight: 8,
  },
  websearchTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  websearchContent: {
    padding: 12,
  },
  statusContainer: {
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
  },
  // 新增：黑底白字 codeblock 风格
  statusBlockContainer: {
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 12,
    marginVertical: 8,
    color: '#fff',
  },
  imageWrapper: {
    marginVertical: 8,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  imageCaption: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  imageError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  imageErrorText: {
    marginLeft: 8,
    color: '#e74c3c',
    fontSize: 14,
  },
  italicText: {
    fontStyle: 'italic',
    color: '#fff',
  },
});
