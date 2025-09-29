import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { discordAuthService, DiscordUser } from '@/services/discordAuthService';
import { DiscordOAuthMessage } from '@/types/discord';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DiscordOAuth2WebViewProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: DiscordUser) => void;
  onError: (error: string) => void;
}

const DiscordOAuth2WebView: React.FC<DiscordOAuth2WebViewProps> = ({
  visible,
  onClose,
  onSuccess,
  onError,
}) => {
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  // 构建OAuth2 URL
  const authUrl = React.useMemo(() => {
    try {
      const url = discordAuthService.buildAuthUrl('expo_dev_webview');
      return url;
    } catch (err) {
      console.error('❌ Failed to build auth URL:', err);
      return '';
    }
  }, []);

  useEffect(() => {
    console.log('=== DiscordOAuth2WebView Effect ===');
    console.log('Visible:', visible);
    console.log('Auth URL:', authUrl);
    
    if (visible && !authUrl) {
      console.error('❌ WebView visible but no auth URL available');
      onError('Discord OAuth2配置不完整，请检查环境变量');
      onClose();
    } else if (visible && authUrl) {
      console.log('🚀 WebView ready to load Discord OAuth2');
    }
  }, [visible, authUrl, onError, onClose]);

  const handleWebViewMessage = (event: any) => {
    console.log('=== WebView Message Received ===');
    console.log('Raw event data:', event.nativeEvent.data);
    console.log('Event keys:', Object.keys(event.nativeEvent));
    console.log('Event type:', typeof event.nativeEvent.data);
    
    try {
      const message: DiscordOAuthMessage = JSON.parse(event.nativeEvent.data);
      console.log('Parsed WebView message:', JSON.stringify(message, null, 2));

      if (message.type === 'DISCORD_AUTH_RESULT') {
        console.log('Discord auth result received:', {
          success: message.success,
          hasToken: !!message.token,
          hasUser: !!message.user,
          error: message.error
        });

        if (message.success && message.token && message.user) {
          console.log('✅ Discord认证成功:', {
            username: message.user.username,
            id: message.user.id,
            roles: message.user.roles?.length || 0,
            tokenLength: message.token.length
          });
          
          // 延迟一点再调用，确保消息处理完成
          setTimeout(() => {
            onSuccess(message.token!, message.user!);
            onClose();
          }, 100);
        } else {
          const errorMsg = message.error || 'Discord认证失败';
          console.error('❌ Discord认证失败:', errorMsg);
          setTimeout(() => {
            onError(errorMsg);
            onClose();
          }, 100);
        }
      } else {
        console.log('Received non-auth message:', message.type);
      }
    } catch (error) {
      console.error('❌ 解析WebView消息失败:', error);
      console.log('Original data:', event.nativeEvent.data);
      console.log('Data length:', event.nativeEvent.data?.length);
      
      // 尝试处理可能的非JSON消息
      if (typeof event.nativeEvent.data === 'string' && 
          event.nativeEvent.data.includes('DISCORD_AUTH_RESULT')) {
        console.log('Detected auth result in non-JSON format, attempting manual parse...');
      }
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    console.log('=== WebView Navigation ===');
    console.log('URL:', navState.url);
    console.log('Loading:', navState.loading);
    console.log('Can go back:', navState.canGoBack);
    console.log('Can go forward:', navState.canGoForward);
    console.log('Title:', navState.title);
    
    setCurrentUrl(navState.url);
    setLoading(navState.loading);

    // 检查是否是自定义 scheme 的认证结果
    if (navState.url.startsWith('cradleai://auth/success')) {
      console.log('✅ 检测到认证成功的 DeepLink');
      
      try {
        const url = new URL(navState.url);
        const token = url.searchParams.get('token');
        const userParam = url.searchParams.get('user');
        
        console.log('Token length:', token?.length || 0);
        console.log('User param exists:', !!userParam);
        
        if (token) {
          let user: DiscordUser | undefined;
          
          if (userParam) {
            try {
              user = JSON.parse(decodeURIComponent(userParam));
              console.log('✅ 解析用户信息成功:', user?.username);
            } catch (parseError) {
              console.warn('⚠️ 解析用户信息失败:', parseError);
            }
          }
          
          // 保存 token 到本地
          AsyncStorage.setItem('auth_token', token)
            .then(() => {
              console.log('✅ Token 已保存到本地');
            })
            .catch((storageError) => {
              console.error('❌ 保存 token 到本地失败:', storageError);
            });
          
          console.log('🎉 Discord认证成功，准备回调');
          setTimeout(() => {
            onSuccess(token, user || { id: '', username: '', roles: [] });
            onClose();
          }, 100);
        } else {
          console.error('❌ DeepLink 中没有找到 token');
          onError('认证结果中缺少访问令牌');
          onClose();
        }
      } catch (error) {
        console.error('❌ 解析认证成功 DeepLink 失败:', error);
        onError('解析认证结果失败');
        onClose();
      }
      
      return false; // 阻止 WebView 继续导航
    }
    
    // 检查是否是自定义 scheme 的认证错误
    if (navState.url.startsWith('cradleai://auth/error')) {
      console.log('❌ 检测到认证失败的 DeepLink');
      
      try {
        const url = new URL(navState.url);
        const error = url.searchParams.get('error') || 'Discord认证失败';
        
        console.error('认证错误:', error);
        setTimeout(() => {
          onError(error);
          onClose();
        }, 100);
      } catch (parseError) {
        console.error('❌ 解析认证错误 DeepLink 失败:', parseError);
        onError('Discord认证失败');
        onClose();
      }
      
      return false; // 阻止 WebView 继续导航
    }

    // 检查是否是认证服务的回调页面（备用检测）
    if (navState.url.includes('auth.cradleintro.top/auth/discord/callback')) {
      console.log('🔄 到达认证服务回调页面（等待重定向到 DeepLink）');
      console.log('Loading state:', navState.loading);
    }

    // 检查是否是 OAuth2 错误页面
    if (navState.url.includes('error=')) {
      const urlParams = new URLSearchParams(navState.url.split('?')[1]);
      const error = urlParams.get('error') || 'Unknown error';
      const errorDescription = urlParams.get('error_description') || '';
      
      const errorMessage = errorDescription || `认证错误: ${error}`;
      console.error('❌ OAuth2 error:', errorMessage);
      onError(errorMessage);
      onClose();
    }
  };

  const handleWebViewError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('=== WebView Error ===');
    console.error('Error details:', JSON.stringify(nativeEvent, null, 2));
    
    setError('网络连接失败，请检查网络设置');
    setLoading(false);
  };

  const handleLoadEnd = () => {
    console.log('✅ WebView load end:', currentUrl);
    setLoading(false);
    setError(null);
  };

  const handleLoadStart = () => {
    console.log('🔄 WebView load start:', currentUrl);
    setLoading(true);
    setError(null);
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleClose = () => {
    Alert.alert(
      '确认关闭',
      '您确定要取消Discord登录吗？',
      [
        { text: '继续登录', style: 'cancel' },
        { 
          text: '取消登录', 
          style: 'destructive',
          onPress: onClose 
        },
      ]
    );
  };

  if (!authUrl) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Ionicons name="logo-discord" size={24} color="#5865F2" />
            <Text style={styles.headerTitle}>Discord 登录</Text>
          </View>

          <TouchableOpacity onPress={retry} style={styles.refreshButton}>
            <Ionicons name="refresh" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* URL Bar (Development only) */}
        {__DEV__ && (
          <View style={styles.urlBar}>
            <Text style={styles.urlText} numberOfLines={1}>
              {currentUrl || authUrl}
            </Text>
          </View>
        )}

        {/* WebView Container */}
        <View style={styles.webViewContainer}>
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="warning-outline" size={48} color="#f44336" />
              <Text style={styles.errorTitle}>连接失败</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity onPress={retry} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>重试</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <WebView
                ref={webViewRef}
                source={{ uri: authUrl }}
                onMessage={handleWebViewMessage}
                onNavigationStateChange={handleNavigationStateChange}
                onError={handleWebViewError}
                onLoadEnd={handleLoadEnd}
                onLoadStart={handleLoadStart}
                style={styles.webView}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="compatibility"
                thirdPartyCookiesEnabled={true}
                sharedCookiesEnabled={true}
                allowsFullscreenVideo={false}
                allowsBackForwardNavigationGestures={false}
                incognito={false}
                cacheEnabled={true}
                originWhitelist={['*']}
                onShouldStartLoadWithRequest={(request) => {
                  console.log('🔗 WebView should start load:', request.url);
                  
                  // 如果是自定义 scheme，阻止 WebView 加载，让 onNavigationStateChange 处理
                  if (request.url.startsWith('cradleai://')) {
                    console.log('🚫 拦截自定义 scheme，由 onNavigationStateChange 处理');
                    return false;
                  }
                  
                  return true;
                }}
                onLoadProgress={(event) => {
                  console.log('📊 WebView load progress:', `${Math.round(event.nativeEvent.progress * 100)}%`);
                }}
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1 CradleAI-Discord-OAuth"
              />
              
              {loading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#5865F2" />
                  <Text style={styles.loadingText}>正在加载 Discord 登录页面...</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#4CAF50" />
            <Text style={styles.footerText}>
              安全连接 • 您的登录信息受到保护
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2f33',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#36393f',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    padding: 4,
    width: 32,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  refreshButton: {
    padding: 4,
    width: 32,
    alignItems: 'center',
  },
  urlBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#23272a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  urlText: {
    color: '#b9bbbe',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(44, 47, 51, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#2c2f33',
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#b9bbbe',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#5865F2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#36393f',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#b9bbbe',
    fontSize: 12,
    marginLeft: 6,
  },
});

export default DiscordOAuth2WebView;
