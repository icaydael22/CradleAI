import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

interface WebViewRendererProps {
  htmlContent: string;
  maxHeight?: number;
  style?: any;
  onImagePress?: (imageUri: string) => void;
}

const { width: screenWidth } = Dimensions.get('window');
const MAX_WIDTH = Math.min(screenWidth * 0.88, 500);

const WebViewRenderer: React.FC<WebViewRendererProps> = ({
  htmlContent,
  maxHeight = 400,
  style,
  onImagePress,
}) => {
  const [webViewHeight, setWebViewHeight] = useState(maxHeight);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  // Enhance HTML with proper styling and auto-resize script
  const enhanceHtmlWithMarkdown = useCallback((html: string): string => {
    const baseCSS = `
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 16px;
          background-color: transparent;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        
        h1, h2, h3, h4, h5, h6 {
          color: #ff79c6;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 600;
        }
        
        h1 { font-size: 1.8em; }
        h2 { font-size: 1.6em; }
        h3 { font-size: 1.4em; }
        h4 { font-size: 1.2em; }
        h5 { font-size: 1.1em; }
        h6 { font-size: 1em; }
        
        p {
          margin: 0.8em 0;
          text-align: left;
        }
        
        code {
          background-color: #111;
          color: #fff;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 0.9em;
        }
        
        pre {
          background-color: #111;
          color: #fff;
          padding: 16px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1em 0;
        }
        
        pre code {
          background: none;
          padding: 0;
          font-size: 0.85em;
        }
        
        blockquote {
          background-color: #111;
          color: #d0d0d0;
          border-left: 4px solid #ff79c6;
          margin: 1em 0;
          padding: 12px 16px;
          border-radius: 4px;
        }
        
        a {
          color: #3498db;
          text-decoration: none;
        }
        
        a:hover {
          text-decoration: underline;
        }
        
        strong, b {
          color: #ff79c6;
          font-weight: 600;
        }
        
        em, i {
          font-style: italic;
        }
        
        ul, ol {
          margin: 1em 0;
          padding-left: 1.5em;
        }
        
        li {
          margin: 0.3em 0;
        }
        
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        
        th, td {
          border: 1px solid #333;
          padding: 8px 12px;
          text-align: left;
        }
        
        th {
          background-color: #444;
          color: #fff;
          font-weight: 600;
        }
        
        img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 8px 0;
          cursor: pointer;
        }
        
        video, audio {
          max-width: 100%;
          border-radius: 8px;
          margin: 8px 0;
        }
        
        hr {
          border: none;
          border-top: 2px solid #333;
          margin: 2em 0;
        }
        
        .highlight {
          background-color: #ffeb3b;
          color: #000;
          padding: 2px 4px;
          border-radius: 3px;
        }
        
        @media (prefers-color-scheme: dark) {
          body {
            color: #fff;
            background-color: transparent;
          }
          
          th, td {
            border-color: #555;
          }
          
          th {
            background-color: #555;
          }
          
          hr {
            border-top-color: #555;
          }
        }
      </style>
    `;

    const resizeAndInteractionScript = `
      <script>
        // Handle image clicks
        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'IMG') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'image_click',
              src: e.target.src
            }));
          }
        });
        
        // Auto-resize functionality
        function updateHeight() {
          const height = Math.max(
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight,
            document.body.scrollHeight,
            document.body.offsetHeight
          );
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'height_change',
            height: height
          }));
        }
        
        // Update height on load and resize
        document.addEventListener('DOMContentLoaded', updateHeight);
        window.addEventListener('resize', updateHeight);
        
        // Use MutationObserver to detect content changes
        if (typeof MutationObserver !== 'undefined') {
          const observer = new MutationObserver(updateHeight);
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
          });
        }
        
        // Fallback: periodic height check
        setInterval(updateHeight, 1000);
      </script>
    `;

    // Check if the HTML already has a complete document structure
    if (html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html')) {
      // It's a complete HTML document. Do NOT inject our global base CSS to avoid overriding page styles.
      // Only inject minimal resize and interaction script.
      const headEndIndex = html.toLowerCase().indexOf('</head>');
      if (headEndIndex !== -1) {
        return html.substring(0, headEndIndex) + resizeAndInteractionScript + html.substring(headEndIndex);
      } else {
        // No head tag, insert after <html> or at the beginning
        const htmlTagIndex = html.toLowerCase().indexOf('<html');
        if (htmlTagIndex !== -1) {
          const afterHtmlTag = html.indexOf('>', htmlTagIndex) + 1;
          return (
            html.substring(0, afterHtmlTag) +
            '<head>' + resizeAndInteractionScript + '</head>' +
            html.substring(afterHtmlTag)
          );
        } else {
          return resizeAndInteractionScript + html;
        }
      }
    } else {
      // It's a partial HTML content, wrap it in a complete document
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${baseCSS}
          ${resizeAndInteractionScript}
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;
    }
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'height_change') {
        const newHeight = Math.min(data.height + 20, maxHeight); // Add some padding
        setWebViewHeight(newHeight);
      } else if (data.type === 'image_click' && onImagePress) {
        onImagePress(data.src);
      }
    } catch (error) {
      console.error('[WebViewRenderer] Error parsing message:', error);
    }
  }, [maxHeight, onImagePress]);

  const handleWebViewLoad = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const handleWebViewError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('[WebViewRenderer] WebView error:', nativeEvent);
    setError(nativeEvent.description || 'Failed to load content');
    setIsLoading(false);
  }, []);

  const handleRefresh = useCallback(() => {
    setError(null);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  const enhancedHtml = enhanceHtmlWithMarkdown(htmlContent);

  // Generate a stable key for WebView to force remount when content changes
  const webviewKey = useMemo(() => {
    // simple hash
    let hash = 0;
    for (let i = 0; i < enhancedHtml.length; i++) {
      const chr = enhancedHtml.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return String(hash);
  }, [enhancedHtml]);

  // Reset loading/error/height when HTML content changes
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setWebViewHeight(maxHeight);
    // Note: key changes will remount the WebView when content changes
  }, [htmlContent]);

  // When only maxHeight changes (e.g., expand/collapse), adjust the container height
  // without toggling loading state or forcing a reload
  useEffect(() => {
    setWebViewHeight(maxHeight);
  }, [maxHeight]);

  if (error) {
    return (
      <View style={[styles.container, { height: 120 }, style]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={24} color="#ff4444" />
          <Text style={styles.errorText}>加载失败</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Ionicons name="refresh-outline" size={16} color="#3498db" />
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: webViewHeight }, style]}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      )}
      
      <WebView
        key={webviewKey}
        ref={webViewRef}
        source={{ html: enhancedHtml }}
        style={styles.webView}
        onMessage={handleWebViewMessage}
        onLoad={handleWebViewLoad}
        onError={handleWebViewError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        allowsFullscreenVideo={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 4,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    color: '#666',
    marginTop: 8,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3498db',
  },
  retryText: {
    color: '#3498db',
    fontSize: 14,
    marginLeft: 4,
  },
});

export default WebViewRenderer;