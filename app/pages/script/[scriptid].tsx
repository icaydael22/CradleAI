import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { PanResponder, Animated, Dimensions, Text, TouchableOpacity } from 'react-native';

import { ScriptService } from '@/services/script-service';
import { IframeActionService } from '@/services/IframeActionService';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { Script, RNToWebViewMessage, WebViewToRNMessage } from '@/shared/types/script-types';
import { useScriptMessage } from '@/hooks/useScriptMessage';
import ScriptSettings from '@/components/ScriptSettings';
import ScriptArchiveSidebar from '@/components/ScriptArchiveSidebar';

/**
 * 剧本详情页面 - 纯WebView实现
 * 
 * ## 功能概述
 * 该页面完全使用WebView来展示剧本内容，不包含任何React Native原生组件。
 * 所有UI交互都通过WebView内部的HTML/CSS/JavaScript实现，
 * 与React Native的通信通过WebView消息机制完成。
 * 
 * ## 架构设计
 * - React Native层：负责数据管理和业务逻辑
 * - WebView层：负责UI展示和用户交互
 * - 通信层：通过postMessage实现双向通信
 */
const ScriptDetailPage: React.FC = () => {
  const router = useRouter();
  const { scriptid } = useLocalSearchParams<{ scriptid: string }>();
  
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [webViewHtml, setWebViewHtml] = useState<string>('');
  const [webViewKey, setWebViewKey] = useState(0); // 用于强制刷新WebView
  const [showSettings, setShowSettings] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const screenWidth = Dimensions.get('window').width;
  const panX = useRef(new Animated.Value(0)).current;
  const gestureActive = useRef(false);
  const GESTURE_EDGE = 30; // 右缘滑动触发

  // 右滑手势：从右边缘向左滑动已经交给系统（左滑退出），我们实现从右缘向左拉出面板 -> 改成从右缘向左? 需求: 右滑唤出右侧栏 => 从左向右在屏幕右侧区域？这里实现从屏幕右侧边缘向左再反向? 简化: 在右上角提供按钮 + 从屏幕右缘向左滑距离>40 显示。
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gestureState) => {
        const startX = gestureState.x0;
        if (!showArchive && startX > screenWidth - GESTURE_EDGE) {
          gestureActive.current = true;
          return true;
        }
        return false;
      },
      onPanResponderMove: (_, gesture) => {
        if (!gestureActive.current) return;
        const dx = Math.min(0, gesture.dx); // 只允许向左负方向
        panX.setValue(dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (!gestureActive.current) return;
        const dx = gesture.dx;
        gestureActive.current = false;
        if (Math.abs(dx) > 40) {
          // 显示侧栏
          setShowArchive(true);
        }
        Animated.timing(panX, { toValue: 0, useNativeDriver: true, duration: 150 }).start();
      }
    })
  ).current;
  
  // 🆕 添加状态持久化相关状态
  const [isRestoringState, setIsRestoringState] = useState(false);

  // 使用剧本消息hook
  const {
    isSending,
    currentResponse,
    scriptHistory,
    loadScriptHistory,
    sendMessage,
    sendFileImportMessage, // 🆕 添加文件导入AI调用方法
    confirmResponse,
    regenerateResponse,
    selectChoice,
    summarizeHistory,
  } = useScriptMessage(script);

  const scriptService = ScriptService.getInstance();
  const webViewRef = useRef<WebView>(null);

  // 🆕 防抖loading状态管理
  const [lastLoadingState, setLastLoadingState] = useState<boolean | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);

  /**
   * 保存WebView状态到本地存储
   */
  const saveViewState = useCallback(async (stateData: any) => {
    if (!scriptid) return;
    
    try {
      const stateKey = `script_view_state_${scriptid}`;
      await StorageAdapter.saveJson(stateKey, {
        ...stateData,
        timestamp: Date.now(),
        scriptId: scriptid
      });
      console.log('[ScriptDetailPage] 💾 WebView状态已保存');
    } catch (error) {
      console.error('[ScriptDetailPage] ❌ 保存WebView状态失败:', error);
    }
  }, [scriptid]);

  /**
   * 从本地存储恢复WebView状态
   */
  const restoreViewState = useCallback(async (): Promise<any | null> => {
    if (!scriptid) return null;
    
    try {
      const stateKey = `script_view_state_${scriptid}`;
      const savedState = await StorageAdapter.loadJson<any>(stateKey);
      
      if (savedState && savedState.scriptId === scriptid) {
        console.log('[ScriptDetailPage] 🔄 找到保存的WebView状态:', savedState);
        return savedState;
      }
      
      return null;
    } catch (error) {
      console.error('[ScriptDetailPage] ❌ 恢复WebView状态失败:', error);
      return null;
    }
  }, [scriptid]);

  /**
   * 清除WebView状态
   */
  const clearViewState = useCallback(async () => {
    if (!scriptid) return;
    
    try {
      const stateKey = `script_view_state_${scriptid}`;
      await StorageAdapter.saveJson(stateKey, null);
      console.log('[ScriptDetailPage] 🗑️ WebView状态已清除');
    } catch (error) {
      console.error('[ScriptDetailPage] ❌ 清除WebView状态失败:', error);
    }
  }, [scriptid]);

  /**
   * 下载并保存URL导入剧本的配置文件
   */
  const downloadAndSaveConfigs = useCallback(async (scriptId: string, baseUrl: string) => {
    console.log('[ScriptDetailPage] 🔄 开始从URL下载配置文件...');
    console.log('[ScriptDetailPage] 基础URL:', baseUrl);

    try {
      const url = new URL(baseUrl);
      const configUrl = `${url.origin}/data/config.json`;
      const variablesUrl = `${url.origin}/data/variables.json`;

      console.log('[ScriptDetailPage] 📄 配置文件URL:', configUrl);
      console.log('[ScriptDetailPage] 📄 变量文件URL:', variablesUrl);

      // 并行下载配置文件
      const downloadPromises = [
        fetch(configUrl).then(response => {
          console.log('[ScriptDetailPage] 📄 配置文件响应状态:', response.status);
          return response.ok ? response.json() : null;
        }).catch(error => {
          console.warn('[ScriptDetailPage] ⚠️ 配置文件下载失败:', error);
          return null;
        }),
        
        fetch(variablesUrl).then(response => {
          console.log('[ScriptDetailPage] 📄 变量文件响应状态:', response.status);
          return response.ok ? response.json() : null;
        }).catch(error => {
          console.warn('[ScriptDetailPage] ⚠️ 变量文件下载失败:', error);
          return null;
        })
      ];

      const [configData, variablesData] = await Promise.all(downloadPromises);

      // 记录下载结果
      if (configData) {
        console.log('[ScriptDetailPage] ✅ 配置文件下载成功:', configData.name || '未命名剧本');
      } else {
        console.log('[ScriptDetailPage] ❌ 配置文件下载失败或为空');
      }

      if (variablesData) {
        console.log('[ScriptDetailPage] ✅ 变量文件下载成功，变量数量:', Object.keys(variablesData.variables || {}).length);
      } else {
        console.log('[ScriptDetailPage] ❌ 变量文件下载失败或为空');
      }

      // 保存配置到本地存储
      if (configData || variablesData) {
        try {
          await scriptService.saveUnifiedScriptConfig(scriptId, configData, variablesData);
          console.log('[ScriptDetailPage] 💾 配置文件保存成功');
        } catch (saveError) {
          console.error('[ScriptDetailPage] 💾 配置文件保存失败:', saveError);
        }
      } else {
        console.log('[ScriptDetailPage] ⚠️ 没有有效的配置文件可保存');
      }

      return { configData, variablesData };

    } catch (error) {
      console.error('[ScriptDetailPage] ❌ 下载配置文件时发生错误:', error);
      return { configData: null, variablesData: null };
    }
  }, [scriptService]);

  /**
   * 处理文件系统导入剧本的WebView ready事件
   */
  const handleFileSystemImportReady = useCallback(async (scriptId: string) => {
    console.log('[ScriptDetailPage] 🔄 开始处理文件系统导入剧本...');

    try {
      // 1. 获取保存的配置文件
      const savedConfig = await scriptService.getUnifiedScriptConfig(scriptId);
      if (!savedConfig) {
        console.error('[ScriptDetailPage] ❌ 未找到保存的配置文件');
        return;
      }

      console.log('[ScriptDetailPage] ✅ 获取到保存的配置文件');

      // 2. 按照test-webview.html的格式发送配置
      
      // 发送资源配置（角色、精灵、背景等）
      if (savedConfig.variables || savedConfig.parsedTypes) {
        console.log('[ScriptDetailPage] 📤 发送资源配置');

        // 优先使用parsedTypes中的数据，如果没有则回退到variables
        const resourceData = savedConfig.parsedTypes  || {};

        sendMessageToWebView({
          type: 'updateResourceConfig',
          data: {
            characters: resourceData.characters || [],
            sprites: resourceData.sprites || {},
            backgrounds: resourceData.backgrounds || {},
            music: resourceData.music || {},
            sounds: resourceData.soundEffects || {}
          }
        });
      }

      // 发送自定义样式
      setTimeout(() => {
        if (savedConfig.customCSS) {
          console.log('[ScriptDetailPage] 📤 发送自定义样式');
          sendMessageToWebView({
            type: 'updateCustomStyles',
            data: savedConfig.customCSS
          });
        }
      }, 100);

      // 发送初始场景数据 - 只有在剧本历史为空时才发送，避免玩家重复经历开局
      setTimeout(async () => {
        try {
          if (savedConfig.initialScene) {
            // 检查剧本历史是否为空
            const history = await scriptService.getScriptHistory(scriptId as any);
            if (history && history.length > 0) {
              console.log('[ScriptDetailPage] 🔕 已存在剧本历史，跳过发送 initialScene，避免重复开局');
            } else {
              console.log('[ScriptDetailPage] 📤 发送初始场景数据（历史为空）');
              sendMessageToWebView({
                type: 'updateSceneData',
                data: savedConfig.initialScene
              });
            }
          }
        } catch (error) {
          console.error('[ScriptDetailPage] ❌ 检查剧本历史或发送initialScene失败:', error);
        }
      }, 200);

      // 发送完整配置数据（包括variablePrompt等）。如果已有历史，则移除 initialScene，避免重复开局
      setTimeout(async () => {
        try {
          console.log('[ScriptDetailPage] 📤 发送完整配置数据');

          // 检查剧本历史，若存在则不随 payload 发送 initialScene
          let initialSceneToSend = savedConfig.initialScene || '';
          try {
            const history = await scriptService.getScriptHistory(scriptId as any);
            if (history && history.length > 0) {
              console.log('[ScriptDetailPage] 🔕 已存在剧本历史，fileSystemImportConfig 中将移除 initialScene');
              initialSceneToSend = '';
            }
          } catch (err) {
            console.warn('[ScriptDetailPage] ⚠️ 检查剧本历史失败，仍会发送 initialScene');
          }

          sendMessageToWebView({
            type: 'fileSystemImportConfig',
            data: {
              variables: savedConfig.variables || {},
              config: savedConfig.config,
              customCSS: savedConfig.customCSS || '',
              parsedTypes: savedConfig.parsedTypes || {},
              initialScene: initialSceneToSend,
              isFileSystemImport: true,
              // 🔥 关键修复：确保传递正确格式的资源数据
              resourceConfig: {
                characters: (savedConfig.parsedTypes?.characters || savedConfig.variables?.characters) || [],
                sprites: (savedConfig.parsedTypes?.sprites || savedConfig.variables?.sprites) || {},
                backgrounds: (savedConfig.parsedTypes?.backgrounds || savedConfig.variables?.backgrounds) || {},
                music: (savedConfig.parsedTypes?.music || savedConfig.variables?.music) || {},
                sounds: (savedConfig.parsedTypes?.soundEffects || savedConfig.variables?.sounds) || {}
              }
            }
          } as any);
        } catch (error) {
          console.error('[ScriptDetailPage] ❌ 发送 fileSystemImportConfig 失败:', error);
        }
      }, 300);

      // 🆕 发送 manifest 数据以初始化 iframe
      setTimeout(async () => {
        try {
          // 从保存的脚本中获取 manifest
          const currentScript = await scriptService.getScript(scriptId);
          if (currentScript?.manifest) {
            console.log('[ScriptDetailPage] 📤 发送 manifest 数据初始化 iframe');
            console.log('[ScriptDetailPage] manifest:', currentScript.manifest);
            
            sendMessageToWebView({
              type: 'initializeIframe',
              data: {
                manifest: currentScript.manifest,
                iframeViewUrl: currentScript.manifest.iframeViewUrl,
                initialVariables: savedConfig.variables || {}
              }
            });
            
            console.log('[ScriptDetailPage] ✅ iframe 初始化消息已发送');
          } else {
            console.log('[ScriptDetailPage] ℹ️ 当前剧本没有 manifest 配置，跳过 iframe 初始化');
          }
        } catch (error) {
          console.error('[ScriptDetailPage] ❌ 发送 manifest 失败:', error);
        }
      }, 350);

      // 🆕 立即请求WebView提供outputRequirements（关键修复）
      setTimeout(() => {
        console.log('[ScriptDetailPage] 📤 文件导入剧本 - 立即请求WebView提供outputRequirements');
        sendMessageToWebView({
          type: 'requestOutputRequirements',
          data: { 
            userInput: '文件系统导入剧本初始化',
            isFileSystemImport: true,
            immediate: true // 标记为立即请求
          }
        });
      }, 400);

      // 4. 等待WebView处理完配置后，开始正常的剧本数据发送
      setTimeout(async () => {
        try {
          const renderData = await scriptService.generateScriptRenderData(
            scriptId,
            undefined, // 初始化时不传入currentResponse
            'full'
          );
          
          sendMessageToWebView({
            type: 'updateScriptData',
            data: {
              ...renderData,
              scriptId: scriptId
            }
          });
          
          console.log('[ScriptDetailPage] ✅ 文件系统导入剧本初始化完成');
        } catch (error) {
          console.error('[ScriptDetailPage] ❌ 发送剧本数据失败:', error);
        }
      }, 1000); // 给WebView一些时间来处理配置

    } catch (error) {
      console.error('[ScriptDetailPage] ❌ 处理文件系统导入剧本时发生错误:', error);
    }
  }, [scriptService]);

  /**
   * 加载剧本数据
   */
  const loadScript = useCallback(async () => {
      if (!scriptid) return;
      
      try {
        setIsLoading(true);
        const scriptData = await scriptService.getScript(scriptid);
        if (!scriptData) {
          Alert.alert('错误', '剧本不存在');
          router.back();
          return;
        }
        
        setScript(scriptData);
      } catch (error) {
        console.error('加载剧本失败:', error);
        Alert.alert('错误', '加载剧本失败');
      } finally {
        setIsLoading(false);
      }
  }, [scriptid, router, scriptService]);

  /**
   * 生成WebView HTML内容 - 支持文件系统导入剧本
   */
  const generateWebViewContent = useCallback(async () => {
    if (!script?.id) return;
    
    try {
      // 对于文件系统导入的剧本，使用固定的URL
      if (script.isFileSystemImport && script.webViewUrl) {
        console.log('[ScriptDetailPage] 文件系统导入剧本，使用固定URL:', script.webViewUrl);
        // 不设置webViewHtml，直接使用URL
        setWebViewHtml('');
        setWebViewKey(prev => prev + 1);
        return;
      }
      
      // 对于URL导入的剧本，使用webViewUrl
      if (script.webViewUrl && !script.isFileSystemImport) {
        console.log('[ScriptDetailPage] URL导入剧本，使用URL:', script.webViewUrl);
        setWebViewHtml('');
        setWebViewKey(prev => prev + 1);
        return;
      }
      
      // 只在初始化时或脚本变化时重新创建WebView
      setWebViewKey(prev => prev + 1);
      } catch (error) {
      console.error('生成WebView内容失败:', error);
      // 使用备用简单模板
        const fallbackHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              margin: 0; 
              background-color: #f5f5f5; 
            }
            .error { 
              text-align: center; 
              color: #e74c3c; 
              font-size: 18px; 
              margin-top: 50px; 
            }
            </style>
          </head>
          <body>
          <div class="error">加载剧本内容失败，请重试</div>
          </body>
          </html>
        `;
        setWebViewHtml(fallbackHtml);
        setWebViewKey(prev => prev + 1);
      }
  }, [script?.id, scriptService]);

  /**
   * 构建最小响应消息载荷 - 只发送rawResponse字段
   */
  const buildMinimalResponsePayload = useCallback((response: any, archived: boolean = false): RNToWebViewMessage => {
    const fieldName = archived ? 'archivedRawResponse' : 'rawResponse';
    return {
      type: 'updateScriptData',
      data: {
        [fieldName]: response?._rawResponse || response?.rawResponse || ''
      }
    };
  }, []);

  /**
   * 发送消息到WebView
   */
  const sendMessageToWebView = useCallback((message: RNToWebViewMessage) => {
    try {
      console.log('[ScriptDetailPage] 发送消息到WebView:', message);
      webViewRef.current?.postMessage(JSON.stringify(message));
    } catch (error) {
      console.error('[ScriptDetailPage] 发送消息失败:', error);
    }
  }, []);

  /**
   * 发送带防抖的loading状态到WebView
   */
  const sendLoadingStateToWebView = useCallback((loading: boolean, saveState: boolean = false) => {
    // 如果状态相同且不是特殊saveState，跳过
    if (loading === lastLoadingState && !saveState) {
      console.log('[ScriptDetailPage] 跳过重复的loading状态:', loading);
      return;
    }

    // 清除之前的延时
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }

    // 立即发送loading=true，延时发送loading=false以防抖
    if (loading || saveState) {
      setLastLoadingState(loading);
      sendMessageToWebView({
        type: 'setLoading',
        data: { 
          loading, 
          ...(saveState && { saveState: true })
        }
      });
    } else {
      // 延时发送loading=false，避免快速切换造成闪烁
      loadingTimeoutRef.current = window.setTimeout(() => {
        setLastLoadingState(loading);
        sendMessageToWebView({
          type: 'setLoading',
          data: { loading }
        });
      }, 100); // 100ms延时
    }
  }, [lastLoadingState, sendMessageToWebView]);

  /**
   * 处理WebView消息
   */
  const handleWebViewMessage = useCallback(async (event: any) => {
    try {
      const message: WebViewToRNMessage = JSON.parse(event.nativeEvent.data);
      console.log('收到WebView消息:', message);
      
  // 通过 as any 允许处理扩展消息类型（未在共享类型中声明）
  switch (message.type as any) {
        case 'ready':
          // WebView 已准备就绪，处理URL导入剧本的配置下载或发送完整数据
          console.log('WebView 已准备就绪，检查是否为URL导入剧本');
          
          if (script?.id) {
            // 🆕 首先尝试恢复之前保存的状态
            setIsRestoringState(true);
            const savedState = await restoreViewState();
            
            if (savedState && savedState.viewData) {
              console.log('[ScriptDetailPage] 🔄 恢复之前保存的WebView状态');
              // 🔥 关键修改：如果保存的状态包含currentResponse，只发送原始响应
              if (savedState.currentResponse) {
                console.log('[ScriptDetailPage] 📁 检测到保存的响应，发送最小载荷');
                const minimalPayload = buildMinimalResponsePayload(savedState.currentResponse, false);
                sendMessageToWebView(minimalPayload);
              } else {
                // 如果没有响应数据，发送基本的脚本信息（但不包含历史htmlBlocks）
                sendMessageToWebView({
                  type: 'updateScriptData',
                  data: {
                    scriptId: script.id,
                    title: savedState.viewData.title || '',
                    subtitle: savedState.viewData.subtitle || '',
                    summary: savedState.viewData.summary || ''
                  }
                });
              }
              setIsRestoringState(false);
              break; // 状态恢复完成，不需要继续其他初始化
            }
            
            setIsRestoringState(false);
            
            // 🆕 检查是否需要保存开局剧情
            if (message.data?.openingContent) {
              console.log('[ScriptDetailPage] 🎬 检测到开局剧情内容，保存到历史');
              try {
                await scriptService.saveOpeningToScriptHistory(script.id, message.data.openingContent);
                console.log('[ScriptDetailPage] ✅ 开局剧情已保存到历史');
              } catch (error) {
                console.error('[ScriptDetailPage] ❌ 保存开局剧情失败:', error);
              }
            }
            
            // 检查是否为文件系统导入的剧本
            if (script.isFileSystemImport) {
              console.log('[ScriptDetailPage] 📁 检测到文件系统导入剧本，传递配置');
              await handleFileSystemImportReady(script.id);
            } else if (script.webViewUrl && message.data?.isUrlImport) {
              console.log('[ScriptDetailPage] 🌐 检测到URL导入剧本，开始下载配置文件');
              await downloadAndSaveConfigs(script.id, script.webViewUrl);
            } else {
              // 普通剧本，发送完整数据
              try {
                // 🆕 检查是否有 manifest，如果有则先初始化 iframe
                if (script.manifest) {
                  console.log('[ScriptDetailPage] 📋 检测到 manifest，初始化 iframe');
                  sendMessageToWebView({
                    type: 'initializeIframe',
                    data: {
                      manifest: script.manifest,
                      initialVariables: script.variableConfig || {},
                      iframeViewUrl: script.manifest.iframeViewUrl
                    }
                  });
                }
                
                // 初始化时不传入currentResponse，确保发送空的初始状态
                const renderData = await scriptService.generateScriptRenderData(
                  script.id,
                  undefined, // 明确传入undefined，不包含currentResponse
                  'full'
                );
                
                sendMessageToWebView({
                  type: 'updateScriptData',
                  data: {
                    scriptId: script.id,
                    title: renderData.title,
                    subtitle: renderData.subtitle,
                    summary: renderData.summary,
                    metadata: renderData.metadata,
                    htmlBlocks: renderData.htmlBlocks || [],
                    fullHtml: renderData.fullHtml,
                    choices: renderData.choices || [],
                    messageIds: renderData.messageIds || []
                  }
                });
              } catch (error) {
                console.error('[ScriptDetailPage] 发送初始数据失败:', error);
              }
            }
          }
          break;
          
        case 'sendFileImport':
          // 🆕 文件导入剧本配置下载（从WebView获取outputRequirements等配置）
          if (message.data?.outputRequirements) {
            console.log('[ScriptDetailPage] 📥 收到WebView的outputRequirements配置');
            console.log('[ScriptDetailPage] userInput:', message.data.text || '无用户输入');
            console.log('[ScriptDetailPage] outputRequirements类型:', typeof message.data.outputRequirements);
            // console.log('[ScriptDetailPage] outputRequirements内容:', message.data.outputRequirements);
            
            // 🔥 关键修复：保存outputRequirements到剧本配置中
            if (script?.id) {
              try {
                console.log('[ScriptDetailPage] 💾 保存outputRequirements到剧本配置');
                await scriptService.updateScriptOutputRequirements(script.id, message.data.outputRequirements);
                console.log('[ScriptDetailPage] ✅ outputRequirements保存成功');
                
                // 更新本地script状态
                setScript(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    styleConfig: {
                      ...prev.styleConfig,
                      id: prev.styleConfig?.id || `style_${Date.now()}`,
                      name: prev.styleConfig?.name || 'Default Style Config',
                      createdAt: prev.styleConfig?.createdAt || Date.now(),
                      outputRequirements: message.data.outputRequirements
                    }
                  };
                });
                
                // 发送成功消息给WebView
                sendMessageToWebView({
                  type: 'configurationComplete',
                  data: { 
                    status: 'success',
                    message: 'outputRequirements已成功保存到剧本配置'
                  }
                });
                
                console.log('[ScriptDetailPage] ✅ 文件导入剧本配置下载完成');
                
              } catch (error) {
                console.error('[ScriptDetailPage] ❌ 保存outputRequirements失败:', error);
                // 发送错误消息给WebView
                sendMessageToWebView({
                  type: 'error',
                  data: { 
                    message: 'Failed to save outputRequirements',
                    error: error instanceof Error ? error.message : String(error)
                  }
                });
              }
            } else {
              console.error('[ScriptDetailPage] ❌ 没有可用的script.id');
            }
          } else {
            console.warn('[ScriptDetailPage] ⚠️ sendFileImport消息缺少outputRequirements');
          }
          break;
          
        case 'send':
          // 发送用户输入
          if (message.data?.text && !isSending) {
            console.log('发送用户输入:', message.data.text);
            

            
            const result = await sendMessage(message.data.text);
            
            // 🆕 检查是否为文件导入剧本需要等待outputRequirements
            if (result === '等待WebView提供配置数据...' && script?.styleConfig?.isFileImport) {
              console.log('[ScriptDetailPage] 📁 检测到文件导入等待状态，请求WebView提供outputRequirements');
              // 发送请求给WebView
              sendMessageToWebView({
                type: 'requestOutputRequirements',
                data: { userInput: message.data.text }
              });
            }
          }
          break;
          
        case 'userInput':
          // 🆕 处理用户自定义输入（来自输入框）
          if (message.data?.text && !isSending) {
            const userText = message.data.text.trim();
            
            // 验证输入
            if (!userText) {
              console.warn('[ScriptDetailPage] 用户输入为空，忽略');
              break;
            }
            
            // 长度限制
            if (userText.length > 5000) {
              console.warn('[ScriptDetailPage] 用户输入过长，截断处理');
              const truncatedText = userText.substring(0, 5000);
              // 通知WebView输入已被截断
              sendMessageToWebView({
                type: 'error',
                data: { 
                  message: `输入内容过长，已自动截断 (${userText.length} -> ${truncatedText.length} 字符)`,
                  error: 'input_truncated'
                }
              });
              message.data.text = truncatedText;
            }
            
            console.log('[ScriptDetailPage] 💬 处理用户自定义输入:', userText);
            console.log('[ScriptDetailPage] 输入来源:', message.data.source || 'unknown');
            
            try {
              // 调用现有的消息发送流程
              const result = await sendMessage(userText);
              
              // 🆕 检查是否为文件导入剧本需要等待outputRequirements
              if (result === '等待WebView提供配置数据...' && script?.styleConfig?.isFileImport) {
                console.log('[ScriptDetailPage] 📁 检测到文件导入等待状态，请求WebView提供outputRequirements');
                // 发送请求给WebView
                sendMessageToWebView({
                  type: 'requestOutputRequirements',
                  data: { userInput: userText }
                });
              }
              
              // 输入处理成功，可以在这里添加成功日志
              console.log('[ScriptDetailPage] ✅ 用户输入处理成功');
              
            } catch (error) {
              console.error('[ScriptDetailPage] ❌ 处理用户输入失败:', error);
              // 发送错误消息到WebView
              sendMessageToWebView({
                type: 'error',
                data: { 
                  message: '处理用户输入时发生错误',
                  error: error instanceof Error ? error.message : String(error)
                }
              });
            }
          } else if (isSending) {
            console.warn('[ScriptDetailPage] 正在发送中，忽略新的用户输入');
            // 通知WebView当前正忙，使用error类型发送消息
            sendMessageToWebView({
              type: 'error',
              data: { 
                message: '正在处理中，请稍后再试',
                error: 'busy'
              }
            });
          }
          break;
          
        case 'requestRegenerate':
          // 重新生成响应
          console.log('重新生成响应');
          if (!isSending) {
            await regenerateResponse();
          }
          break;
          
        case 'confirm':
          // 确认响应
          console.log('确认响应');
          await confirmResponse();
          break;
          
        case 'choice':
          // 选择剧情选项
          if (message.data?.text) {
            console.log('选择剧情选项:', message.data);
            
            // 🆕 检查是否为文件导入剧本，如果是则先请求outputRequirements
            if (script?.styleConfig?.isFileImport) {
              console.log('[ScriptDetailPage] 📁 文件导入剧本选择，请求WebView提供outputRequirements');
              sendMessageToWebView({
                type: 'requestOutputRequirements',
                data: { userInput: message.data.text }
              });
            } else {
              // 立即通知WebView进入加载状态，避免race导致WebView回退到旧内容
              try {
                sendLoadingStateToWebView(true);
                await selectChoice(message.data.text);
              } catch (choiceError) {
                console.error('[ScriptDetailPage] 选择剧情选项处理失败:', choiceError);
              } finally {
                // 选择完成或失败后取消加载状态（hook内也会在最终设置isSending=false时同步）
                sendLoadingStateToWebView(false);
              }
            }
          }
          break;
          
        case 'page':
          // 页面导航 - 由WebView内部处理，这里只记录日志
          console.log('页面导航:', message.data?.direction);
          break;
          
        case 'settings':
          // 打开设置 - 可以扩展为打开设置模态框
          console.log('打开设置');
          setShowSettings(true);
          break;
          
        case 'summarize':
          // 手动总结历史
          console.log('手动总结历史');
          try {
            sendLoadingStateToWebView(true);
            const success = await summarizeHistory();
            if (success) {
              // 总结成功，重新生成WebView内容
              await generateWebViewContent();
            }
          } catch (error) {
            console.error('[ScriptDetailPage] 手动总结失败:', error);
          } finally {
            sendLoadingStateToWebView(false);
          }
          break;
          
        case 'saveState':
          // 🆕 保存WebView状态
          console.log('[ScriptDetailPage] 💾 保存WebView状态');
          if (message.data) {
            await saveViewState({
              viewData: message.data,
              currentResponse: currentResponse
            });
          }
          break;
          
        case 'clearState':
          // 🆕 清除WebView状态（返回开局）
          console.log('[ScriptDetailPage] 🗑️ 清除WebView状态');
          await clearViewState();
          break;
          
        case 'iframeAction':
          // 处理来自 Iframe 的动作请求
          if (message.data?.actionName && script?.id) {
            console.log('[ScriptDetailPage] 📋 处理 iframe 动作:', message.data.actionName);
            try {
              sendLoadingStateToWebView(true); // 开始加载
              const iframeActionService = IframeActionService.getInstance();
              const result = await iframeActionService.handleAction(
                script.id,
                message.data.actionName,
                message.data.payload
              );
              
              // 将结果发回给 WebView
              sendMessageToWebView({
                type: 'iframeData',
                data: {
                  action: message.data.actionName,
                  payload: result
                }
              });
              
              console.log('[ScriptDetailPage] ✅ iframe 动作处理完成:', message.data.actionName);
            } catch (e) {
              console.error('[ScriptDetailPage] ❌ 处理 iframe 动作失败:', e);
              sendMessageToWebView({ 
                type: 'error', 
                data: { 
                  message: `iframe 动作处理失败: ${e instanceof Error ? e.message : String(e)}`,
                  action: message.data.actionName
                } 
              });
            } finally {
              sendLoadingStateToWebView(false); // 结束加载
            }
          } else {
            console.warn('[ScriptDetailPage] ⚠️ iframe 动作缺少必要参数');
          }
          break;
          
        case 'showArchiveSidebar':
          // 🆕 处理来自 WebView 的存档侧边栏请求
          console.log('[ScriptDetailPage] 💾 收到显示存档侧边栏请求');
          if (message.data?.action === 'open') {
            console.log('[ScriptDetailPage] 打开存档侧边栏');
            setShowArchive(true);
          } else if (message.data?.action === 'close') {
            console.log('[ScriptDetailPage] 关闭存档侧边栏');
            setShowArchive(false);
          } else {
            // 默认切换状态
            console.log('[ScriptDetailPage] 切换存档侧边栏状态');
            setShowArchive(prev => !prev);
          }
          break;
          
        default:
          console.warn('未知的WebView消息类型:', message.type);
      }
    } catch (error) {
      console.error('处理WebView消息失败:', error);
      // 发送错误信息到WebView
      try {
        webViewRef.current?.postMessage(JSON.stringify({
          type: 'error',
          data: { 
            message: '处理消息时发生错误', 
            error: error instanceof Error ? error.message : String(error)
          }
        }));
      } catch (postError) {
        console.error('发送错误消息到WebView失败:', postError);
      }
    }
  }, [isSending, sendMessage, sendFileImportMessage, regenerateResponse, confirmResponse, selectChoice]);


  // 初始化：加载剧本数据
  useEffect(() => {
    loadScript();
  }, [loadScript]);

  // 当页面重新获得焦点时，重新加载剧本（以便应用在详情页导入的样式配置）
  useFocusEffect(
    useCallback(() => {
      loadScript();
      return () => {};
    }, [loadScript])
  );

  // 当剧本加载完成后，加载历史记录
  useEffect(() => {
    if (script?.id) {
      loadScriptHistory();
    }
  }, [script?.id, loadScriptHistory]);

  // 只在剧本初始化时生成WebView内容
  useEffect(() => {
    if (script?.id && !webViewHtml) {
      console.log('[ScriptDetailPage] 生成初始WebView内容');
      generateWebViewContent();
    }
  }, [script?.id, webViewHtml, generateWebViewContent]);

  // 🆕 监听应用状态变化，自动保存WebView状态
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[ScriptDetailPage] 🔄 应用进入后台，请求保存WebView状态');
        // 请求WebView保存当前状态
        sendLoadingStateToWebView(false, true); // saveState=true
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [sendMessageToWebView]);

  // 同步加载状态到 WebView
  useEffect(() => {
    if (webViewRef.current) {
      sendLoadingStateToWebView(isSending);
    }
  }, [isSending, sendLoadingStateToWebView]);

  // 当有新响应时，发送数据到 WebView - 只发送最小载荷，不再回退到 script.lastRawResponse
  useEffect(() => {
    if (webViewRef.current && script?.id) {
      const sendMinimalUpdate = async () => {
        try {
          // 仅在存在 currentResponse 时发送最小响应；不再使用 script.lastRawResponse 回退
          if (currentResponse) {
            console.log('[ScriptDetailPage] 发送最小响应更新到WebView (来自currentResponse)');
            console.log('[ScriptDetailPage] currentResponse._rawResponse:', currentResponse._rawResponse);

            const minimalPayload = buildMinimalResponsePayload(currentResponse, false);
            sendMessageToWebView(minimalPayload);
          } else {
            // 不再发送 script.lastRawResponse 回退，保持只发送最小响应的策略
            console.log('[ScriptDetailPage] 无 currentResponse，跳过发送 lastRawResponse 回退，保持仅发送最小响应');
          }
          
        } catch (error) {
          console.error('[ScriptDetailPage] 发送最小更新失败:', error);
          // 发送错误状态
          sendLoadingStateToWebView(false);
        }
      };
      
      sendMinimalUpdate();
    }
  }, [currentResponse, script?.id, buildMinimalResponsePayload, sendMessageToWebView, isSending, isRestoringState]);

  // 如果正在加载，显示加载指示器
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#990000" />
        </View>
      </SafeAreaView>
    );
  }

  // 如果剧本不存在，显示错误信息
  if (!script) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color="#e74c3c" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 全屏WebView - 这是页面的唯一内容 */}
        <WebView
          ref={webViewRef}
          style={styles.webView}
          source={
            // 对于文件系统导入和URL导入的剧本，使用webViewUrl
            script?.webViewUrl && (script.isFileSystemImport || !webViewHtml)
              ? { uri: script.webViewUrl }
              : { html: webViewHtml }
          }
        key={webViewKey}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onMessage={handleWebViewMessage}
        onError={(syntheticEvent) => {
          console.error('WebView错误:', syntheticEvent.nativeEvent);
        }}
        onLoadEnd={() => {
          console.log('WebView加载完成');
          // 加载完成后尝试发送数据
          setTimeout(() => {
            if (script?.id) {
              console.log('[ScriptDetailPage] WebView加载完成，尝试发送数据');
              // 注入测试脚本检查WebView状态
              webViewRef.current?.injectJavaScript(`
                console.log('[WebView] WebView加载完成检查');
                console.log('[WebView] DOM ready state:', document.readyState);
                console.log('[WebView] 全局函数存在:', typeof window.handleReactNativeMessage !== 'undefined');
                console.log('[WebView] ReactNativeWebView存在:', typeof window.ReactNativeWebView !== 'undefined');
                true;
              `);
            }
          }, 500);
        }}
        // 优化WebView性能
        cacheEnabled={true}
        startInLoadingState={false}
        mixedContentMode="compatibility"
        // 允许WebView处理所有导航
        onShouldStartLoadWithRequest={() => true}
        {...panResponder.panHandlers}
      />

      {/* 存档侧栏 */}
      <ScriptArchiveSidebar
        visible={showArchive}
        scriptId={script?.id || ''}
        onClose={() => setShowArchive(false)}
        onCreateArchive={async () => {
          if (!script?.id) return;
          try {
            // 直接从本地获取当前状态进行存档（纯本地操作）
            const currentViewState = await restoreViewState(); // 获取最近保存的WebView状态
            const label = `存档 ${new Date().toLocaleString()}`;
            
            // 创建包含完整状态的存档
            const archiveViewState = {
              ...currentViewState,
              currentResponse: currentResponse, // 确保包含当前响应
              timestamp: Date.now()
            };
            
            await scriptService.createArchive(script.id, label, archiveViewState);
            Alert.alert('存档成功', `已创建存档: ${label}`);
            console.log('[ScriptDetailPage] ✅ 存档创建成功:', {
              label,
              hasCurrentResponse: !!currentResponse,
              hasViewState: !!currentViewState,
              historyLength: scriptHistory.length
            });
          } catch (error) {
            console.error('[ScriptDetailPage] 创建存档失败:', error);
            Alert.alert('存档失败', '无法创建存档，请重试');
          }
        }}
        onRestoreArchive={async (archiveId) => {
          if (!script?.id) return;
          const { viewState, currentResponse: archivedResponse } = await scriptService.restoreArchive(script.id, archiveId);
          // 刷新本地历史
          await loadScriptHistory();
          // 🔥 关键修改：只发送存档的原始响应字符串
          if (archivedResponse) {
            console.log('[ScriptDetailPage] 📁 恢复存档，发送原始响应字符串');
            const minimalArchivePayload = buildMinimalResponsePayload(archivedResponse, true);
            sendMessageToWebView(minimalArchivePayload);
          }
        }}
      />
      
      {/* 设置界面 */}
      {script && (
        <ScriptSettings
          script={script}
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          onScriptUpdated={(updatedScript) => {
            setScript(updatedScript);
            setShowSettings(false);
          }}
        />
      )}
    </SafeAreaView>
  );
};

/**
 * 样式定义
 * 
 * 由于采用纯WebView实现，样式非常简单，
 * 主要确保WebView占据全屏空间。
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a', // 深色背景，与WebView内容形成对比
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  archiveHandleContainer: {
    position: 'absolute',
    right: 0,
    top: '40%',
    width: 40,
    alignItems: 'center',
  },
  archiveHandle: {
    backgroundColor: '#7b2fff',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    transform: [{ translateX: 0 }],
  },
  archiveHandleText: { color: '#fff', fontSize: 12, writingDirection: 'ltr' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
  },
});

export default ScriptDetailPage;