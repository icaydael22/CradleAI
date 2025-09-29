import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
  ViewStyle,
  TextStyle,
  Modal,
  ImageStyle,
  TextInput,
  DeviceEventEmitter,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router'; // Add useFocusEffect import
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import { Character} from '@/shared/types';
import * as DocumentPicker from 'expo-document-picker';
import { CharacterImporter } from '@/utils/CharacterImporter';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CreateChar from '@/app/pages/create_char';
import CradleCreateForm from '@/components/CradleCreateForm';
import { theme } from '@/constants/theme';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import DiaryBook from '@/components/diary/DiaryBook'; 
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import CharacterEditDialog from '@/components/CharacterEditDialog';
import CharacterImageGallerySidebar, { getCharacterImageDir, getGalleryMetaFile } from '@/components/CharacterImageGallerySidebar';
import ImageRegenerationModal from '@/components/ImageRegenerationModal';
import { ScriptService } from '@/services/script-service';
import { Script, ScriptStyleConfigFile } from '@/shared/types/script-types';
import { VariableSystemConfig } from '@/services/variables/variable-types';
import { ScriptImportConfigModal } from '@/components/ScriptImportConfigModal';
import * as ScriptImporter from '@/services/scripts/ScriptImporter';
import * as TableMemoryAPI from '@/src/memory/plugins/table-memory/api';
import Mem0Service from '@/src/memory/services/Mem0Service'; 
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { loadGlobalSettingsState, saveGlobalSettingsState } from '@/app/pages/global-settings';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core'; 
import * as Sharing from 'expo-sharing'; 
import ConfirmDialog from '@/components/ConfirmDialog';
import { ViewModeConfigManager, ViewMode, VIEW_MODE_LARGE, VIEW_MODE_SMALL, VIEW_MODE_VERTICAL, VIEW_MODE_STORAGE_KEY } from '@/utils/ViewModeConfigManager';
import { KNOWN_TAGS } from '@/app/data/knowntags';
import { applyRegexToGreetings } from '@/utils/regex-helper';
import { EventRegister } from 'react-native-event-listeners';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * (16 / 9);
const LARGE_CARD_WIDTH = width - 32;
const LARGE_CARD_HEIGHT = LARGE_CARD_WIDTH * (16 / 9);
const VERTICAL_CARD_WIDTH = (width - 48) / 2;
const VERTICAL_CARD_HEIGHT = VERTICAL_CARD_WIDTH * (9 / 16);

const COLOR_BACKGROUND = '#282828';
const COLOR_CARD_BG = '#333333';
const COLOR_BUTTON = 'rgb(255, 224, 195)';
const COLOR_TEXT = '#FFFFFF';
const TEMP_IMPORT_DATA_FILE = FileSystem.cacheDirectory + 'temp_import_data.json';

const HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : (StatusBar.currentHeight || 0) + 56;

const CharactersScreen: React.FC = () => {
  const { characters, isLoading, setIsLoading, deleteCharacters, addCharacter, addConversation } = useCharacters();
  const { user } = useUser();
  const router = useRouter();
  const scriptService = ScriptService.getInstance();
  const insets = useSafeAreaInsets();
  const [isManaging, setIsManaging] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [displayMode, setDisplayMode] = useState<'characters' | 'scripts'>('characters'); // 显示模式：角色卡或剧本
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [creationType, setCreationType] = useState<'manual' | 'auto' | 'import' | 'script'>('manual');

  const [refreshKey, setRefreshKey] = useState(0);
  // Add state for diary book
  const [showDiaryBook, setShowDiaryBook] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  
  // Add FlatList ref for scrolling to new character
  const flatListRef = useRef<FlatList>(null);


  // Add loading state for import process
  const [importLoading, setImportLoading] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  // New states for gallery sidebar, image generation, and character editing
  const [showGallerySidebar, setShowGallerySidebar] = useState(false);
  const [gallerySidebarCharacter, setGallerySidebarCharacter] = useState<Character | null>(null);

  const [showImageGenModal, setShowImageGenModal] = useState(false);
  const [imageGenCharacter, setImageGenCharacter] = useState<Character | null>(null);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editDialogCharacter, setEditDialogCharacter] = useState<Character | null>(null);

  // State for managing character images
  const [characterImages, setCharacterImages] = useState<Record<string, any[]>>({});
  
  // State for scripts
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  // 新增：导入对话框相关状态
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importWithPreset, setImportWithPreset] = useState(true);
  
  // 导入剧本相关状态
  const [showScriptImportModal, setShowScriptImportModal] = useState(false);
  const [scriptImportType, setScriptImportType] = useState<'url' | 'file'>('url');
  const [urlImportInput, setUrlImportInput] = useState('');
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);
  
  // 剧本导入配置相关状态
  const [showScriptImportConfig, setShowScriptImportConfig] = useState(false);
  const [pendingScriptConfig, setPendingScriptConfig] = useState<{
    scriptConfig: ScriptStyleConfigFile;
    variableConfig?: VariableSystemConfig;
  } | null>(null);

  // Add state for the confirmation dialog
  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // 加载剧本列表
  const loadScripts = useCallback(async () => {
    if (displayMode !== 'scripts') return;
    
    try {
      setIsLoadingScripts(true);
      const allScripts = await scriptService.getAllScripts();
      setScripts(allScripts);
    } catch (error) {
      console.error('加载剧本列表失败:', error);
    } finally {
      setIsLoadingScripts(false);
    }
  }, [displayMode]);

  // 监听显示模式变化，加载相应数据
  useEffect(() => {
    if (displayMode === 'scripts') {
      loadScripts();
    }
  }, [displayMode, loadScripts, refreshKey]);

  // 新增：加载视图模式配置
  useEffect(() => {
    const loadViewModeConfig = async () => {
      try {
        const savedViewMode = await ViewModeConfigManager.getViewMode();
        setViewMode(savedViewMode);
        console.log('[Character] 加载视图模式配置:', savedViewMode);
      } catch (error) {
        console.warn('[Character] 加载视图模式配置失败:', error);
        setViewMode(VIEW_MODE_LARGE);
      }
    };
    loadViewModeConfig();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Character] App came to foreground, refreshing data');
        setRefreshKey(prev => prev + 1);
      }

      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[Character] Screen focused');
      // 页面聚焦时不强制刷新，避免滚动位置丢失
      return () => {
        // 离开页面时自动关闭菜单和管理模式
        setShowAddMenu(false);
        setIsManaging(false);
        setSelectedCharacters([]);
      };
    }, [])
  );

  useEffect(() => {
    return () => {
      setShowAddMenu(false);
      setShowCreationModal(false);
    };
  }, []);

  useEffect(() => {
    if (showCreationModal) {
      setShowAddMenu(false);
    }
  }, [showCreationModal]);

  // 移除会误清理导入加载动画的副作用，防止导入过程中的动画被过早关闭
  // 注意：importLoading 的关闭应仅在导入流程结束时由导入逻辑显式控制



  const handleManage = () => {
    setIsManaging((prevIsManaging) => !prevIsManaging);
    setSelectedCharacters([]);
    if (showAddMenu) {
      setShowAddMenu(false);
    }
  };

  const handleAddPress = () => {
    if (showCreationModal) return;

    setShowAddMenu(!showAddMenu);
    if (isManaging) {
      setIsManaging(false);
    }
  };

  const handleCreateManual = () => {
    setShowAddMenu(false);
    setTimeout(() => {
      setCreationType('manual');
      setShowCreationModal(true);
    }, 100);
  };

  const handleCreateAuto = () => {
    setShowAddMenu(false);
    setTimeout(() => {
      setCreationType('auto');
      setShowCreationModal(true);
    }, 100);
  };

  // 新版导入逻辑
  const handleImport = () => {
    setShowAddMenu(false);
    setShowImportOptions(true);
  };

  // 新增：导入剧本处理函数
  const handleImportScript = () => {
    setShowAddMenu(false);
    setShowScriptImportModal(true);
    setScriptImportType('url');
    setUrlImportInput('');
  };

  // 验证并导入URL剧本
  const handleUrlImportConfirm = async () => {
    if (!urlImportInput.trim()) {
      Alert.alert('错误', '请输入有效的URL地址');
      return;
    }

    try {
      setIsValidatingUrl(true);
      console.log('[Character] 开始从URL导入剧本:', urlImportInput);

      // 验证URL格式
      let url: URL;
      try {
        url = new URL(urlImportInput.trim());
      } catch (error) {
        Alert.alert('错误', '请输入有效的URL格式');
        return;
      }

      // 尝试从URL下载配置文件
      console.log('[Character] 正在从URL获取配置文件...');
      const configUrl = `${url.origin}/data/config.json`;
      const variablesUrl = `${url.origin}/data/variables.json`;

      console.log('[Character] 配置文件URL:', configUrl);
      console.log('[Character] 变量文件URL:', variablesUrl);

      // 下载配置文件
      const [configResponse, variablesResponse] = await Promise.all([
        fetch(configUrl).catch(err => {
          console.warn('[Character] 配置文件下载失败:', err);
          return null;
        }),
        fetch(variablesUrl).catch(err => {
          console.warn('[Character] 变量文件下载失败:', err);
          return null;
        })
      ]);

      let scriptConfig: any = null;
      let variableConfig: any = null;

      // 解析配置文件
      if (configResponse && configResponse.ok) {
        try {
          scriptConfig = await configResponse.json();
          console.log('[Character] ✅ 成功获取配置文件:', scriptConfig.name || '未命名剧本');
        } catch (error) {
          console.warn('[Character] 配置文件解析失败:', error);
        }
      } else {
        console.warn('[Character] 配置文件响应失败:', configResponse?.status);
      }

      // 解析变量文件
      if (variablesResponse && variablesResponse.ok) {
        try {
          variableConfig = await variablesResponse.json();
          console.log('[Character] ✅ 成功获取变量文件，变量数量:', Object.keys(variableConfig.variables || {}).length);
        } catch (error) {
          console.warn('[Character] 变量文件解析失败:', error);
        }
      } else {
        console.warn('[Character] 变量文件响应失败:', variablesResponse?.status);
      }

      // 如果没有获取到任何配置，使用默认配置
      if (!scriptConfig) {
        console.log('[Character] 使用默认配置创建剧本');
        scriptConfig = {
          name: `URL剧本 - ${url.hostname}`,
          description: `从 ${urlImportInput} 导入的剧本`,
          version: "1.0.0",
          outputRequirements: {
            prompts: [],
            webViewHtmlTemplate: null
          }
        };
      }

      // 创建剧本
      const scriptId = `script_${Date.now()}`;
      const scriptData: Script = {
        id: scriptId,
        name: scriptConfig.name || `URL剧本 - ${url.hostname}`,
        selectedCharacters: [], // 可以后续选择角色
        contextMessageCount: {},
        baseprompt: '',
        userName: 'Player',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        webViewUrl: urlImportInput.trim(), // 保存URL用于WebView加载
      };

      // 保存剧本
      await scriptService.saveScript(scriptData);
      console.log('[Character] ✅ 剧本创建成功:', scriptData.id);

      // 保存配置文件到本地存储
      if (scriptConfig || variableConfig) {
        try {
          await scriptService.saveUnifiedScriptConfig(scriptId, scriptConfig, variableConfig);
          console.log('[Character] ✅ 配置文件保存成功');
        } catch (error) {
          console.warn('[Character] 配置文件保存失败:', error);
        }
      }

      // 关闭模态框
      setShowScriptImportModal(false);
      setUrlImportInput('');

      // 刷新剧本列表
      await loadScripts();

      // 触发事件通知其他组件刷新
      EventRegister.emit('scriptCreated', { scriptId });

      // 显示成功提示并导航到剧本页面
      Alert.alert(
        '导入成功', 
        `剧本 "${scriptData.name}" 已成功创建`,
        [
          {
            text: '查看剧本',
            onPress: () => router.push(`/pages/script/${scriptId}`)
          },
          { text: '确定' }
        ]
      );

    } catch (error) {
      console.error('[Character] URL导入失败:', error);
      Alert.alert('导入失败', error instanceof Error ? error.message : '网络连接失败，请检查URL是否正确');
    } finally {
      setIsValidatingUrl(false);
    }
  };

  // 新增：文件系统导入剧本 - 使用ScriptImporter模块
  const handleFileImportConfirm = async () => {
    setIsImportingFile(true);
    
    try {
      const result = await ScriptImporter.handleFileImportConfirm(
        addCharacter,
        addConversation,
        loadScripts,
      );
      
      if (!result.success) {
        throw new Error(result.error || '导入失败');
      }
      
      // 关闭模态框
      setShowScriptImportModal(false);
      
      // 显示成功提示
      Alert.alert('导入成功', '剧本已成功导入');
      
    } catch (error) {
      console.error('[Character] 文件导入失败:', error);
      Alert.alert('导入失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsImportingFile(false);
    }
  };

  // 处理剧本导入配置确认
  const handleScriptImportConfirm = async (config: {
    selectedCharacters: string[];
    userName: string;
  }) => {
    if (!pendingScriptConfig) return;
    
    try {
      setImportLoading(true);
      const { scriptConfig, variableConfig } = pendingScriptConfig;
      
      // 创建新剧本
      const scriptId = `script_${Date.now()}`;
      const scriptData: Script = {
        id: scriptId,
        name: scriptConfig.name,
        selectedCharacters: config.selectedCharacters,
        contextMessageCount: {},
        baseprompt: '',
        userName: config.userName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      // 保存剧本基础数据
      await scriptService.saveScript(scriptData);
      
      // 保存统一配置
      await scriptService.saveUnifiedScriptConfig(scriptId, scriptConfig, variableConfig);
      
      // 清理临时状态
      setPendingScriptConfig(null);
      setShowScriptImportConfig(false);
      
      // 触发事件刷新对话列表
      EventRegister.emit('scriptCreated', { scriptId });
      
      Alert.alert(
        '导入成功', 
        `剧本 "${scriptConfig.name}" 导入成功！`,
        [
          { 
            text: '打开剧本', 
            onPress: () => {
              // 刷新列表
              setRefreshKey(prev => prev + 1);
              // 跳转到剧本页面
              router.push(`/pages/script/${scriptId}`);
            }
          }
        ]
      );
      
    } catch (error) {
      console.error('保存剧本配置失败:', error);
      Alert.alert('保存失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setImportLoading(false);
    }
  };

  // 实际执行导入
  const doImport = async () => {
    setShowImportOptions(false);
    try {
      // 选择文件（支持图片和json）
      const fileResult = await DocumentPicker.getDocumentAsync({
        type: [
          'image/png',
          'application/json',
          'application/octet-stream', // 某些安卓json为octet-stream
        ],
        copyToCacheDirectory: true,
      });
      if (!fileResult.assets || !fileResult.assets[0]) return;
      const file = fileResult.assets[0];
      const fileUri = file.uri;
      const fileName = file.name || '';
      const isPng = fileName.toLowerCase().endsWith('.png');
      const isJson = fileName.toLowerCase().endsWith('.json');



      let importedData: any;
      let originalJson: string | undefined;
      if (isPng) {
        importedData = await CharacterImporter.importFromPNG(fileUri);
        originalJson = importedData.originalJson;
      } else if (isJson) {
        importedData = await CharacterImporter.importFromJson(fileUri);
        originalJson = importedData.originalJson;
      } else {
        throw new Error('仅支持PNG图片或JSON格式角色卡文件');
      }

      // 头像与背景：PNG 同时作为头像与背景；JSON 则使用导入数据的 backgroundImage
      const avatarUri = isPng ? fileUri : undefined;
      const backgroundUri = isPng ? fileUri : (importedData.backgroundImage || undefined);

      // 新增：日志输出regexScripts
      if (Array.isArray(importedData.regexScripts)) {
        console.log(`[Character] 已读取regexScripts，数量: ${importedData.regexScripts.length}，字段路径: importedData.regexScripts`);
      } else {
        console.log('[Character] 未读取到regexScripts字段，字段路径: importedData.regexScripts');
      }

        // 是否导入预设
        if (importWithPreset && isPng) {
          // 仅PNG时才弹出预设选择
          setDialog({
            visible: true,
            title: '导入预设提示词',
            message: '是否要导入预设提示词文件(JSON格式)？\n\n如不导入，将仅使用角色卡自带数据。',
            confirmText: '导入预设',
            cancelText: '跳过',
            onConfirm: async () => {
              setDialog({ ...dialog, visible: false });
              // 确保加载状态保持
              setImportLoading(true);
            try {
              const presetResult = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
              });
              if (!presetResult.assets || !presetResult.assets[0]) {
                const completeData = {
                  roleCard: importedData.roleCard,
                  worldBook: importedData.worldBook,
                  avatar: avatarUri,
                  backgroundImage: backgroundUri,
                  replaceDefaultPreset: false,
                  alternateGreetings: importedData.alternateGreetings || [],
                  data: {
                    alternate_greetings: importedData.alternateGreetings || []
                  },
                  regexScripts: importedData.regexScripts || [],
                  originalJson // 新增
                };
                await autoCreateCharacterFromImport(completeData);
                return;
              }
              const presetFileUri = presetResult.assets[0].uri;
              const cacheUri = `${FileSystem.cacheDirectory}${presetResult.assets[0].name}`;
              await FileSystem.copyAsync({ from: presetFileUri, to: cacheUri });
              const presetJson = await CharacterImporter.importPresetForCharacter(cacheUri, 'temp');
              const completeData = {
                roleCard: importedData.roleCard,
                worldBook: importedData.worldBook,
                preset: presetJson,
                avatar: avatarUri,
                backgroundImage: backgroundUri,
                replaceDefaultPreset: true,
                alternateGreetings: importedData.alternateGreetings || [],
                data: {
                  alternate_greetings: importedData.alternateGreetings || []
                },
                regexScripts: importedData.regexScripts || [],
                originalJson // 新增
              };
              await autoCreateCharacterFromImport(completeData);
            } catch (presetError) {
              const completeData = {
                roleCard: importedData.roleCard,
                worldBook: importedData.worldBook,
                avatar: avatarUri,
                backgroundImage: backgroundUri,
                replaceDefaultPreset: false,
                alternateGreetings: importedData.alternateGreetings || [],
                data: {
                  alternate_greetings: importedData.alternateGreetings || []
                },
                regexScripts: importedData.regexScripts || [],
                originalJson // 新增
              };
              await autoCreateCharacterFromImport(completeData);
            }
          },
                      onCancel: async () => {
              setDialog({ ...dialog, visible: false });
              // 确保加载状态保持
              setImportLoading(true);
            const completeData = {
              roleCard: importedData.roleCard,
              worldBook: importedData.worldBook,
              avatar: avatarUri,
              backgroundImage: backgroundUri,
              replaceDefaultPreset: false,
              alternateGreetings: importedData.alternateGreetings || [],
              data: {
                alternate_greetings: importedData.alternateGreetings || []
              },
              regexScripts: importedData.regexScripts || [],
              originalJson // 新增
            };
            await autoCreateCharacterFromImport(completeData);
          }
        });
      } else {
        const completeData = {
          roleCard: importedData.roleCard,
          worldBook: importedData.worldBook,
          preset: importedData.preset,
          avatar: avatarUri,
          backgroundImage: backgroundUri,
          replaceDefaultPreset: !!importedData.preset,
          alternateGreetings: importedData.alternateGreetings || [],
          data: {
            alternate_greetings: importedData.alternateGreetings || []
          },
          regexScripts: importedData.regexScripts || [],
          originalJson // 新增
        };
        await autoCreateCharacterFromImport(completeData);
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '未知错误');
      setImportLoading(false);
    }
  };

  // 自动创建角色（导入即创建）
  const autoCreateCharacterFromImport = async (data: any) => {
    try {
      // 确保加载状态已设置
      if (!importLoading) {
        setImportLoading(true);
      }
      // 1) 持久化图片
      const persisted = await persistImportedImages(data.avatar, data.backgroundImage);

      // 2) 规范化基础字段
      const characterId = String(Date.now());
      const name = (data?.roleCard?.name || '').trim() || `角色_${characterId}`;
      const firstMes = (data?.roleCard?.first_mes || '').trim();
      const greetings: string[] = Array.isArray(data?.alternateGreetings) && data.alternateGreetings.length > 0
        ? data.alternateGreetings
        : (firstMes ? [firstMes] : ['Hello!']);

      // === 先导入 regexScripts 到 global-settings 并开启全局正则 ===
      let regexImported = false;
      try {
        if (Array.isArray(data.regexScripts) && data.regexScripts.length > 0) {
          const { loadGlobalSettingsState, saveGlobalSettingsState } = await import('@/app/pages/global-settings');
          const globalState = await loadGlobalSettingsState?.();
          if (globalState) {
            const timestamp = Date.now();
            const newGroupId = `group_${timestamp}`;
            const newGroup = {
              id: newGroupId,
              name,
              scripts: data.regexScripts.map((script: any, idx: number) => ({
                ...script,
                id: script.id || `regex_${timestamp}_${idx}`,
                scriptName: script.scriptName || `正则脚本_${idx + 1}`,
                flags: script.flags ?? 'g',
              })),
              bindType: 'character',
              bindCharacterId: characterId,
            };
            const newGroups = Array.isArray(globalState.regexScriptGroups)
              ? [...globalState.regexScriptGroups, newGroup]
              : [newGroup];
            
            // 自动开启全局正则设置并保存
            await saveGlobalSettingsState?.({
              ...globalState,
              regexScriptGroups: newGroups,
              selectedRegexGroupId: newGroupId,
              regexEnabled: true, // 自动开启
            });
            
            // 同步到 AsyncStorage
            await AsyncStorage.setItem('nodest_global_regex_enabled', 'true');
            
            regexImported = true;
            console.log(`[Character] 已自动开启全局正则设置并导入${data.regexScripts.length}个正则脚本`);
          }
        }
      } catch (e) {
        console.warn('[Character] 自动导入正则脚本到全局失败:', e);
      }

      // === 现在应用正则到开场白（全局正则已开启）===
      const cleanedGreetings = await applyRegexToGreetings(greetings.map(g => cleanUnknownTags(g)), characterId);

      // 3) 构造jsonData，与 CreateChar 保存结构保持一致
      const jsonData = {
        roleCard: {
          name,
          first_mes: cleanedGreetings[0] || '',
          description: data?.roleCard?.description || '',
          personality: data?.roleCard?.personality || '',
          scenario: data?.roleCard?.scenario || '',
          mes_example: data?.roleCard?.mes_example || '',
          data: { extensions: { regex_scripts: [] } },
        },
        worldBook: data?.worldBook || { entries: {} },
        preset: data?.preset ? {
          prompts: Array.isArray(data.preset.prompts) ? data.preset.prompts : [],
          prompt_order: Array.isArray(data.preset.prompt_order) ? data.preset.prompt_order : [],
        } : undefined,
        authorNote: {
          charname: name,
          username: user?.settings?.self.nickname || 'User',
          content: data?.authorNote?.content || '',
          injection_depth: data?.authorNote?.injection_depth || 0,
        },
        alternateGreetings: cleanedGreetings,
      };

      // 4) 生成角色对象
      const now = Date.now();
      const newCharacter: Character & any = {
        id: characterId,
        name,
        avatar: persisted.avatar,
        backgroundImage: persisted.backgroundImage,
        conversationId: characterId,
        description: data?.roleCard?.description || '',
        personality: data?.roleCard?.personality || '',
        interests: [],
        createdAt: now,
        updatedAt: now,
        jsonData: JSON.stringify(jsonData),
        inCradleSystem: true,
        cradleStatus: 'growing',
        feedHistory: [],
        cradleCreatedAt: now,
        cradleUpdatedAt: now,
        extraGreetings: cleanedGreetings.length > 1 ? cleanedGreetings : undefined,
      };

      // 5) 保存与会话
      await Promise.all([
        addCharacter(newCharacter),
        addConversation({ id: characterId, title: name }),
      ]);
      await AsyncStorage.setItem('lastConversationId', characterId);

      // 6) NodeST 初始化
      try {
        await NodeSTManager.processChatMessage({
          userMessage: '你好！',
          conversationId: characterId,
          status: '新建角色',
          character: newCharacter,
        });
      } catch (e) {
        console.warn('[Character] NodeST initialization warning:', e);
      }

      // 7) 通知聊天界面刷新以应用正则处理后的开场白
      try {
        DeviceEventEmitter.emit('chatHistoryChanged', { 
          conversationId: characterId,
          reason: 'character_imported_with_regex'
        });
        console.log('[Character] 已通知聊天界面刷新，角色ID:', characterId);
      } catch (e) {
        console.warn('[Character] 通知聊天界面失败:', e);
      }

      // 8) 完成：高亮新角色并在3秒后清理（滚动逻辑交由 useEffect 统一处理）
      setJustCreatedId(characterId);
      setImportLoading(false);
      // 3秒后清理高亮
      setTimeout(() => setJustCreatedId(null), 3000);
    } catch (e: any) {
      console.error('[Character] 自动创建角色失败:', e);
      setImportLoading(false);
      Alert.alert('创建失败', e?.message || '未知错误');
    }
  };

  // 复制导入的图片到持久化目录（支持 file://, data:image/* base64, http(s)）
  const persistImportedImages = async (avatarUri?: string, backgroundUri?: string) => {
    let avatar: string | undefined;
    let backgroundImage: string | undefined;

    const ensureDir = async (dir: string) => {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    };

    const getExtFromMime = (mime: string, fallback: string) => {
      const map: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
      };
      return map[mime] || fallback;
    };

    const persistSingle = async (
      src: string | undefined,
      targetDir: string,
      filenamePrefix: string,
      defaultExt: string
    ): Promise<string | undefined> => {
      if (!src) return undefined;
      await ensureDir(targetDir);

      let ext = defaultExt;
      let dest = '';

      try {
        if (src.startsWith('file://')) {
          // 直接复制本地文件
          const nameExt = src.split('.').pop();
          if (nameExt) ext = nameExt;
          const filename = `${filenamePrefix}_${Date.now()}.${ext}`;
          dest = targetDir + filename;
          await FileSystem.copyAsync({ from: src, to: dest }).catch(() => {});
          return dest;
        }

        if (src.startsWith('data:image/')) {
          // data url: data:image/png;base64,XXXXX
          const match = src.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/);
          if (match) {
            const mime = match[1];
            const base64 = match[2];
            ext = getExtFromMime(mime, defaultExt);
            const filename = `${filenamePrefix}_${Date.now()}.${ext}`;
            dest = targetDir + filename;
            await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
            return dest;
          }
        }

        if (src.startsWith('http://') || src.startsWith('https://')) {
          // 远程图片下载
          const filename = `${filenamePrefix}_${Date.now()}.${ext}`;
          dest = targetDir + filename;
          await FileSystem.downloadAsync(src, dest).catch(() => {});
          return dest;
        }

        // 其它未知来源，忽略
        return undefined;
      } catch (e) {
        console.warn('[Character] 持久化图片失败:', e);
        return undefined;
      }
    };

    avatar = await persistSingle(
      avatarUri,
      FileSystem.documentDirectory + 'avatars/',
      'avatar',
      'png'
    );

    backgroundImage = await persistSingle(
      backgroundUri,
      FileSystem.documentDirectory + 'backgrounds/',
      'background',
      'jpg'
    );

    return { avatar, backgroundImage };
  };

  // 清理未知标签（与 CreateChar 保持一致）
  function cleanUnknownTags(text: string): string {
    if (!text) return text;
    return text.replace(/<\/?([a-zA-Z0-9_:-]+)[^>]*>/g, (match, tag) => {
      if (KNOWN_TAGS.includes(tag)) return match;
      return '';
    });
  }

  const handleCreateCharImportReady = useCallback(() => {
    setImportLoading(false);
  }, []);



  const toggleSelectCharacter = useCallback((id: string) => {
    setSelectedCharacters((prevSelected) =>
      prevSelected.includes(id)
        ? prevSelected.filter((charId) => charId !== id)
        : [...prevSelected, id]
    );
  }, []);

  const handleCharacterPress = useCallback((id: string) => {
    if (!isManaging) {
      console.log('[Character] Navigating to character detail:', id);
      router.push(`/pages/character-detail?id=${id}`);
    }
  }, [isManaging, router]);

  // 剧本点击处理
  const handleScriptPress = useCallback((scriptId: string) => {
    console.log('[Character] Navigating to script detail:', scriptId);
    router.push(`/pages/script-detail?scriptId=${scriptId}`);
  }, [router]);

  // Add new method to open diary book
  const handleOpenDiaryBook = (id: string) => {
    setSelectedCharacterId(id);
    setShowDiaryBook(true);
  };

  // Close diary book
  const handleCloseDiaryBook = () => {
    setShowDiaryBook(false);
    setSelectedCharacterId(null);
  };

  const handleDelete = async () => {
    if (displayMode === 'scripts') {
      return handleDeleteScripts();
    }

    if (selectedCharacters.length === 0) {
      Alert.alert('未选中', '请选择要删除的角色。');
      return;
    }

    Alert.alert('删除角色', `确定要删除选中的 ${selectedCharacters.length} 个角色吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);

          try {
            // --- 新增：批量删除角色的所有表格 ---
            for (const characterId of selectedCharacters) {
              try {
                // 获取该角色的所有表格
                const sheets = await TableMemoryAPI.getCharacterSheets(characterId);
                if (sheets && sheets.length > 0) {
                  // 批量删除所有表格
                  await Promise.all(sheets.map(sheet => TableMemoryAPI.deleteSheet(sheet.uid)));
                  console.log(`[Character] 已删除角色 ${characterId} 的所有表格`);
                }
              } catch (err) {
                console.warn(`[Character] 删除角色 ${characterId} 表格时出错:`, err);
              }
            }
            // --- 结束 ---

            // --- 新增：批量删除角色的所有向量记忆 ---
            for (const characterId of selectedCharacters) {
              try {
                const mem0 = Mem0Service.getInstance();
                const memories = await mem0.getCharacterMemories(characterId);
                if (memories && memories.length > 0) {
                  await Promise.all(memories.map(m => mem0.deleteMemory(m.id)));
                  console.log(`[Character] 已删除角色 ${characterId} 的所有向量记忆`);
                }
              } catch (err) {
                console.warn(`[Character] 删除角色 ${characterId} 向量记忆时出错:`, err);
              }
            }
            // --- 结束 ---

            const deletePromises = selectedCharacters.map(async (characterId) => {
              console.log(`删除角色数据: ${characterId}`);
              await NodeSTManager.deleteCharacterData(characterId);

              const character = characters.find(c => c.id === characterId);
              if (character?.conversationId && character.conversationId !== characterId) {
                await NodeSTManager.deleteCharacterData(character.conversationId);
              }
            });

            await Promise.all(deletePromises);
            await deleteCharacters(selectedCharacters);

            setSelectedCharacters([]);
            setIsManaging(false);
          } catch (error) {
            console.error("Error deleting characters:", error);
            Alert.alert("删除失败", "删除角色时出现错误");
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  // 新增：删除与特定剧本关联的所有角色
  const deleteScriptCharacters = async (scriptId: string): Promise<void> => {
    try {
      console.log(`🗑️ 开始清理剧本 ${scriptId} 的相关角色...`);
      
      // 筛选出属于该剧本的角色
      const scriptCharactersToDelete = characters.filter((character: Character) => {
        try {
          if (character.jsonData) {
            const jsonData = JSON.parse(character.jsonData);
            return jsonData.data?.isScriptCharacter === true && jsonData.data?.scriptId === scriptId;
          }
          return false;
        } catch (error) {
          console.warn(`⚠️ 解析角色 ${character.name} 的jsonData失败:`, error);
          return false;
        }
      });
      
      if (scriptCharactersToDelete.length === 0) {
        console.log(`ℹ️ 剧本 ${scriptId} 没有关联的角色需要删除`);
        return;
      }
      
      console.log(`🗑️ 找到 ${scriptCharactersToDelete.length} 个需要删除的剧本角色:`, 
        scriptCharactersToDelete.map((c: Character) => c.name).join(', '));
      
      // 获取需要删除的角色ID列表
      const characterIdsToDelete = scriptCharactersToDelete.map((character: Character) => character.id);
      
      // 删除角色和对话数据
      for (const character of scriptCharactersToDelete) {
        try {
          console.log(`🗑️ 删除剧本角色的对话数据: ${character.name} (ID: ${character.id})`);
          
          // 删除NodeST对话数据
          try {
            await NodeSTManager.deleteCharacterData(character.conversationId || character.id);
          } catch (convError) {
            console.warn(`⚠️ 删除角色 ${character.name} 的NodeST数据失败:`, convError);
          }
          
          console.log(`✅ 成功删除剧本角色对话数据: ${character.name}`);
        } catch (error) {
          console.error(`❌ 删除角色 ${character.name} 的对话数据失败:`, error);
        }
      }
      
      // 批量删除角色
      await deleteCharacters(characterIdsToDelete);
      
      console.log(`✅ 剧本 ${scriptId} 的角色清理完成，删除了 ${scriptCharactersToDelete.length} 个角色`);
      
    } catch (error) {
      console.error(`❌ 删除剧本 ${scriptId} 角色时发生错误:`, error);
      throw error;
    }
  };

  // 删除剧本处理函数
  const handleDeleteScripts = async () => {
    if (selectedCharacters.length === 0) {
      Alert.alert('未选中', '请选择要删除的剧本。');
      return;
    }

    Alert.alert('删除剧本', `确定要删除选中的 ${selectedCharacters.length} 个剧本吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);

          try {
            // 删除剧本和相关角色
            for (const scriptId of selectedCharacters) {
              console.log(`🗑️ 删除剧本及相关角色: ${scriptId}`);
              
              // 1. 首先删除该剧本关联的所有角色
              await deleteScriptCharacters(scriptId);
              
              // 2. 然后删除剧本数据
              await scriptService.deleteScript(scriptId);
              console.log(`[Character] 已删除剧本: ${scriptId}`);
            }

            setSelectedCharacters([]);
            setIsManaging(false);
            setRefreshKey(prev => prev + 1); // 刷新剧本列表
            
            // 触发剧本删除事件，通知conversation list刷新
            EventRegister.emit('scriptDeleted', { scriptIds: selectedCharacters });

          } catch (error) {
            console.error("Error deleting scripts:", error);
            Alert.alert("删除失败", "删除剧本时出现错误");
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleExport = async () => {
    if (displayMode === 'scripts') {
      return handleExportScript();
    }

    if (selectedCharacters.length !== 1) {
      Alert.alert('导出失败', '请仅选择一个角色进行导出。');
      return;
    }
    const characterId = selectedCharacters[0];
    const character = characters.find(c => c.id === characterId);
    if (!character) {
      Alert.alert('导出失败', '未找到角色数据。');
      return;
    }
    try {
      setIsLoading(true);
      // 1. 获取角色全部数据
      const exportData = await StorageAdapter.exportCharacterData(characterId);
      // 新增：如果有originalJson字段，则直接导出原始json
      if (exportData && exportData.originalJson) {
        const fileName = `character_export_${character.name || characterId}.json`;
        const fileUri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, exportData.originalJson, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
        } else {
          Alert.alert('导出成功', `文件已保存到: ${fileUri}`);
        }
        setIsLoading(false);
        return;
      }
      // 2. 生成导出文件名
      const fileName = `character_export_${character.name || characterId}.json`;
      // 3. 写入到本地临时文件
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      // 4. 分享或保存
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
      } else {
        Alert.alert('导出成功', `文件已保存到: ${fileUri}`);
      }
    } catch (err) {
      console.error('[Character] 导出角色失败:', err);
      Alert.alert('导出失败', err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  // 导出剧本处理函数
  const handleExportScript = async () => {
    if (selectedCharacters.length !== 1) {
      Alert.alert('导出失败', '请仅选择一个剧本进行导出。');
      return;
    }
    
    const scriptId = selectedCharacters[0];
    const script = scripts.find(s => s.id === scriptId);
    if (!script) {
      Alert.alert('导出失败', '未找到剧本数据。');
      return;
    }
    
    try {
      setIsLoading(true);
      // 导出剧本数据
      const exportData = await scriptService.exportScript(scriptId);
      
      const fileName = `script_export_${script.name || scriptId}.json`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
      } else {
        Alert.alert('导出成功', `文件已保存到: ${fileUri}`);
      }
    } catch (err) {
      console.error('[Character] 导出剧本失败:', err);
      Alert.alert('导出失败', err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreationModalClose = () => {
    console.log('[Character] Closing creation modal');
    setShowCreationModal(false);
    setTimeout(() => {
      // 不再强制刷新页面，让角色自然添加到列表中
      setCreationType('manual');
    }, 300);
  };

  // 修改为显示模式切换
  const handleDisplayModeToggle = () => {
    setDisplayMode(prev => prev === 'characters' ? 'scripts' : 'characters');
    setIsManaging(false); // 切换模式时退出管理模式
    setSelectedCharacters([]);
  };

  const handleAddNewImage = (characterId: string, newImage: any) => {
    setCharacterImages(prev => ({
      ...prev,
      [characterId]: [...(prev[characterId] || []), newImage]
    }));
  };

  const handleOpenGallerySidebar = (character: Character) => {
    setGallerySidebarCharacter(character);
    setShowGallerySidebar(true);
  };

  const handleOpenImageGen = (character: Character) => {
    setImageGenCharacter(character);
    setShowImageGenModal(true);
  };

  const handleOpenEditDialog = (character: Character) => {
    setEditDialogCharacter(character);
    setShowEditDialog(true);
  };

  const handleImageGenSuccess = (image: any) => {
    if (imageGenCharacter) {
      handleAddNewImage(imageGenCharacter.id, image);
    }
  };

  // 新增持久化方法
  const persistCharacterImage = async (characterId: string, image: any) => {
    const dir = getCharacterImageDir(characterId);
    const metaFile = getGalleryMetaFile(characterId);

    let localUri = image.localUri || image.url;
    if (localUri && localUri.includes('#localNovelAI')) {
      localUri = localUri.split('#localNovelAI')[0];
    }
    const filename = localUri?.split('/').pop() || image.url?.split('/').pop();
    if (!filename) return;
    const fileUri = dir + filename;

    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists && localUri && localUri !== fileUri) {
        const srcInfo = await FileSystem.getInfoAsync(localUri);
        if (srcInfo.exists) {
          await FileSystem.copyAsync({ from: localUri, to: fileUri });
        }
      }
      let meta: Record<string, any> = {};
      const metaInfo = await FileSystem.getInfoAsync(metaFile);
      if (metaInfo.exists) {
        try {
          meta = JSON.parse(await FileSystem.readAsStringAsync(metaFile));
        } catch {
          meta = {};
        }
      }
      meta[filename] = {
        ...image,
        url: fileUri,
        localUri: fileUri,
        id: filename,
      };
      await FileSystem.writeAsStringAsync(metaFile, JSON.stringify(meta));
    } catch (e) {
      console.warn('[图片生成] 保存图片到文件系统失败', e);
    }
  };

  const [fontsLoaded] = useFonts({ 'SpaceMono-Regular': require('@/assets/fonts/SpaceMono-Regular.ttf') });
  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: 14 }]}> 
      {/* 左侧标题（左对齐） */}
      <Text style={[styles.headerTitle, fontsLoaded && { fontFamily: 'SpaceMono-Regular' }]}>
        {displayMode === 'characters' ? '角色' : '剧本'}
      </Text>

      {/* 右侧动作区 */}
      <View style={styles.headerButtons}>
        <TouchableOpacity 
          style={[styles.headerButton, showSearch && styles.topBarActiveActionButton]} 
          onPress={() => setShowSearch(!showSearch)}
        >
          <Ionicons 
            name="search" 
            size={20} 
            color={showSearch ? '#282828' : COLOR_BUTTON} 
          />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerButton, { marginLeft: 12 }]} onPress={handleDisplayModeToggle}>
          <Ionicons 
            name={displayMode === 'characters' ? 'film-outline' : 'people-outline'} 
            size={20} 
            color={COLOR_BUTTON} 
          />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerButton, { marginLeft: 12 }]} onPress={handleAddPress}>
          <Ionicons name="add" size={22} color={COLOR_BUTTON} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerButton, { marginLeft: 12 }, isManaging && styles.topBarActiveActionButton]}
          onPress={handleManage}
        >
          <FontAwesome name="wrench" size={18} color={isManaging ? '#282828' : COLOR_BUTTON} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (displayMode === 'scripts') {
        return (
          <ScriptCard
            item={item}
            isManaging={isManaging}
            isSelected={selectedCharacters.includes(item.id)}
            onSelect={toggleSelectCharacter}
            onPress={handleScriptPress}
          />
        );
      }
      
      return (
        <CharacterCard
          item={item}
          isManaging={isManaging}
          isSelected={selectedCharacters.includes(item.id)}
          onSelect={toggleSelectCharacter}
          onPress={handleCharacterPress}
          onOpenDiary={handleOpenDiaryBook}
          viewMode={VIEW_MODE_SMALL} // 角色卡固定为中等视图
          onOpenGallerySidebar={handleOpenGallerySidebar}
          onOpenImageGen={handleOpenImageGen}
          onOpenEditDialog={handleOpenEditDialog}
          highlight={item.id === justCreatedId}
        />
      );
    },
    [displayMode, isManaging, selectedCharacters, toggleSelectCharacter, handleCharacterPress, handleScriptPress, handleOpenGallerySidebar, handleOpenImageGen, handleOpenEditDialog, justCreatedId]
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  // 搜索过滤逻辑
  const filteredData = useMemo(() => {
    let data = displayMode === 'characters' ? characters : scripts;
    
    // 如果是角色模式，过滤掉剧本角色
    if (displayMode === 'characters') {
      data = characters.filter(character => {
        try {
          const jsonData = character.jsonData ? JSON.parse(character.jsonData) : {};
          // 过滤掉剧本角色
          return !jsonData.data?.isScriptCharacter;
        } catch (error) {
          // 如果解析失败，保留该角色
          return true;
        }
      });
    }
    
    if (!searchQuery.trim()) {
      return data;
    }
    
    const query = searchQuery.toLowerCase();
    return data.filter(item => {
      if (displayMode === 'characters') {
        const character = item as Character;
        return character.name?.toLowerCase().includes(query) ||
               character.description?.toLowerCase().includes(query);
      } else {
        const script = item as Script;
        return script.name?.toLowerCase().includes(query) ||
               script.styleConfig?.name?.toLowerCase().includes(query);
      }
    });
  }, [displayMode, characters, scripts, searchQuery]);

  // 渲染搜索栏
  const renderSearchBar = () => {
    if (!showSearch) return null;
    
    return (
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={16} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`搜索${displayMode === 'characters' ? '角色' : '剧本'}...`}
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={true}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchButton}
            >
              <Ionicons name="close-circle" size={16} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const currentMode = (viewMode || VIEW_MODE_LARGE) as ViewMode;
      let itemHeight = currentMode === VIEW_MODE_LARGE
        ? LARGE_CARD_HEIGHT + 16
        : currentMode === VIEW_MODE_VERTICAL
        ? VERTICAL_CARD_HEIGHT + 16
        : CARD_HEIGHT + 16;
      return { length: itemHeight, offset: itemHeight * index, index };
    },
    [viewMode]
  );

  const renderAddMenu = () => {
    if (!showAddMenu) return null;

    // 样式与ChatInput一致
    return (
      <View style={{
        position: 'absolute',
        top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 62 : 102,
        right: 16,
        backgroundColor: 'rgba(40, 40, 40, 0.95)',
        borderRadius: 12,
        marginHorizontal: 10,
        marginBottom: 4,
        paddingBottom: 6,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        zIndex: 20,
        minWidth: 180, // 适配最长文本宽度
        maxWidth: 260,
      }}>
        <TouchableOpacity style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        }} onPress={handleCreateManual}>
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '400', marginLeft: 12, flex: 1 }}>手动创建</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        }} onPress={handleCreateAuto}>
          <Ionicons name="color-wand-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '400', marginLeft: 12, flex: 1 }}>自动创建</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        }} onPress={handleImport}>
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '400', marginLeft: 12, flex: 1 }}>导入角色</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
        }} onPress={handleImportScript}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '400', marginLeft: 12, flex: 1 }}>导入剧本</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCreationModal = () => {
    if (!showCreationModal) return null;

    return (
      <Modal
        animationType="slide"
        transparent={false}
        visible={showCreationModal}
        onRequestClose={handleCreationModalClose}
      >
        <SafeAreaView style={styles.creationModalContainer}>
          <View style={styles.creationModalHeader}>
            <Text style={styles.creationModalTitle}>
              {creationType === 'manual'
                ? '手动创建角色'
                : creationType === 'auto'
                ? '自动创建角色'
                : '导入角色'}
            </Text>
            <TouchableOpacity onPress={handleCreationModalClose}>
              <Ionicons name="close" size={24} color={COLOR_TEXT} />
            </TouchableOpacity>
          </View>

          <View style={styles.creationModalContent}>
            {/* Update condition to include 'import' type */}
            {(creationType === 'manual' || creationType === 'import') && (
              <CreateChar
                activeTab={creationType === 'import' ? 'advanced' : 'basic'}
                creationMode={creationType}
                allowTagImageGeneration={true}
                onClose={handleCreationModalClose}
                // Pass importReady callback only for import mode
                {...(creationType === 'import' ? { onImportReady: handleCreateCharImportReady } : {})}
              />
            )}
            {creationType === 'auto' && (
              <CradleCreateForm 
                embedded={true} 
                onClose={handleCreationModalClose} 
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderDeleteButton = () => {
    if (!isManaging) return null;

    return (
      <TouchableOpacity style={[styles.floatingButton, styles.deleteButton]} onPress={handleDelete}>
        <Ionicons name="trash-outline" size={24} color="#282828" />
      </TouchableOpacity>
    );
  };

  const renderManageFloatingButtons = () => {
    if (!isManaging) return null;
    return (
      <>
        {/* 导出按钮 */}
        <TouchableOpacity
          style={[
            styles.floatingButton,
            { bottom: 82, backgroundColor: theme.colors.primary }
          ]}
          onPress={handleExport}
          disabled={selectedCharacters.length !== 1}
        >
          <Ionicons name="download-outline" size={24} color="black" />
        </TouchableOpacity>
      </>
    );
  };

  // 导入选项弹窗
  const renderImportOptionsModal = () => {
    if (!showImportOptions) return null;
    return (
      <Modal
        visible={showImportOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportOptions(false)}
      >
        <View style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)'
        }}>
          <View style={{
            backgroundColor: '#222', borderRadius: 12, padding: 28, width: 320, alignItems: 'center'
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 18 }}>角色导入</Text>
            <Text style={{ color: '#fff', fontSize: 15, marginBottom: 18, textAlign: 'center' }}>
              请选择要导入的角色卡文件（PNG图片或JSON文件）。如为PNG格式，可选择是否导入额外预设。
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
              <TouchableOpacity
                onPress={() => setImportWithPreset(v => !v)}
                style={{
                  width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#fff',
                  backgroundColor: importWithPreset ? COLOR_BUTTON : 'transparent', marginRight: 10
                }}
              >
                {importWithPreset && (
                  <Ionicons name="checkmark" size={16} color="#282828" style={{ alignSelf: 'center', marginTop: 1 }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 15 }}>导入PNG时同时导入预设（可选）</Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: COLOR_BUTTON, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginRight: 12
                }}
                onPress={doImport}
              >
                <Text style={{ color: '#282828', fontWeight: 'bold', fontSize: 16 }}>选择文件</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#444', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24
                }}
                onPress={() => setShowImportOptions(false)}
              >
                <Text style={{ color: '#fff', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // 剧本导入模态框
  const renderScriptImportModal = () => {
    if (!showScriptImportModal) return null;
    
    return (
      <Modal
        visible={showScriptImportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowScriptImportModal(false)}
      >
        <View style={{
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.7)'
        }}>
          <View style={{
            backgroundColor: '#333',
            borderRadius: 12,
            padding: 20,
            width: '90%',
            maxWidth: 400
          }}>
            <Text style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 16,
              textAlign: 'center'
            }}>
              导入剧本
            </Text>
            
            {/* 导入方式选择 */}
            <View style={{
              flexDirection: 'row',
              marginBottom: 16,
              backgroundColor: '#444',
              borderRadius: 8,
              padding: 4
            }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 6,
                  backgroundColor: scriptImportType === 'url' ? COLOR_BUTTON : 'transparent',
                  alignItems: 'center'
                }}
                onPress={() => setScriptImportType('url')}
              >
                <Text style={{ 
                  color: scriptImportType === 'url' ? '#282828' : 'rgba(255, 255, 255, 0.7)', 
                  fontSize: 14, 
                  fontWeight: '500' 
                }}>
                  从URL导入
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 6,
                  backgroundColor: scriptImportType === 'file' ? COLOR_BUTTON : 'transparent',
                  alignItems: 'center'
                }}
                onPress={() => setScriptImportType('file')}
              >
                <Text style={{ 
                  color: scriptImportType === 'file' ? '#282828' : 'rgba(255, 255, 255, 0.7)', 
                  fontSize: 14, 
                  fontWeight: '500' 
                }}>
                  从文件导入
                </Text>
              </TouchableOpacity>
            </View>
            
            {scriptImportType === 'url' ? (
              <>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  marginBottom: 12,
                  lineHeight: 20
                }}>
                  请输入Vue剧本项目的URL地址，例如：{'\n'}
                  http://localhost:5173{'\n'}
                  http://192.168.1.100:5173
                </Text>
                
                <TextInput
                  style={{
                    backgroundColor: '#444',
                    borderRadius: 8,
                    padding: 12,
                    color: '#fff',
                    fontSize: 16,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                  placeholder="输入URL地址..."
                  placeholderTextColor="rgba(255, 255, 255, 0.5)"
                  value={urlImportInput}
                  onChangeText={setUrlImportInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </>
            ) : (
              <Text style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 14,
                marginBottom: 16,
                lineHeight: 20
              }}>
                选择包含剧本配置的ZIP文件导入。{'\n'}
                ZIP文件应包含：{'\n'}
                • variable.json - 变量配置{'\n'}
                • config.json - 剧本配置{'\n'}
                • 自定义CSS和其他资源文件
              </Text>
            )}
            
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#555',
                  borderRadius: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  alignItems: 'center'
                }}
                onPress={() => {
                  setShowScriptImportModal(false);
                  setUrlImportInput('');
                  setScriptImportType('url');
                }}
                disabled={isValidatingUrl || isImportingFile}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500' }}>
                  取消
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: (isValidatingUrl || isImportingFile) ? '#666' : COLOR_BUTTON,
                  borderRadius: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  alignItems: 'center'
                }}
                onPress={scriptImportType === 'url' ? handleUrlImportConfirm : handleFileImportConfirm}
                disabled={(scriptImportType === 'url' && (!urlImportInput.trim() || isValidatingUrl)) || 
                         (scriptImportType === 'file' && isImportingFile)}
              >
                {(isValidatingUrl || isImportingFile) ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ 
                    color: (scriptImportType === 'url' && urlImportInput.trim()) || scriptImportType === 'file' ? '#282828' : '#999', 
                    fontSize: 16, 
                    fontWeight: '500' 
                  }}>
                    {scriptImportType === 'url' ? '导入' : '选择文件'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" translucent={false} backgroundColor={COLOR_BACKGROUND} />

      {renderHeader()}

      {renderSearchBar()}

      {renderAddMenu()}

      {(displayMode === 'characters' && viewMode) || displayMode === 'scripts' ? (
      <FlatList
        ref={flatListRef}
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={displayMode === 'scripts' ? 1 : 2} // 剧本用横向矩形卡片，单列显示
        contentContainerStyle={styles.listContainer}
        key={`${displayMode}-${viewMode || 'default'}-${refreshKey}`}
        extraData={[displayMode, isManaging, selectedCharacters, refreshKey]}
        getItemLayout={displayMode === 'scripts' ? undefined : getItemLayout}
        initialNumToRender={10}
        windowSize={8}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        onScrollToIndexFailed={(info) => {
          console.warn('[Character] 滚动到索引失败:', info);
          // 如果滚动失败，尝试滚动到列表底部
          const wait = new Promise(resolve => setTimeout(resolve, 500));
          wait.then(() => {
            if (flatListRef.current) {
              const dataLength = displayMode === 'characters' ? characters.length : scripts.length;
              if (dataLength > 0) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }
          });
        }}
       />
      ) : null}

      {renderCreationModal()}

      {renderDeleteButton()}
      {renderManageFloatingButtons()}

      {/* Add Diary Book Modal */}
      {showDiaryBook && selectedCharacterId && (
        <Modal
          animationType="slide"
          transparent={false}
          visible={showDiaryBook}
          onRequestClose={handleCloseDiaryBook}
        >
          <DiaryBook 
            character={characters.find(c => c.id === selectedCharacterId)!} 
            onClose={handleCloseDiaryBook} 
          />
        </Modal>
      )}

      {/* 图库侧栏：管理模式下不展示 */}
      {showGallerySidebar && gallerySidebarCharacter && !isManaging && (
        <CharacterImageGallerySidebar
          visible={showGallerySidebar}
          onClose={() => setShowGallerySidebar(false)}
          images={characterImages[gallerySidebarCharacter.id] || []}
          onToggleFavorite={imageId => {
            setCharacterImages(prev => ({
              ...prev,
              [gallerySidebarCharacter.id]: (prev[gallerySidebarCharacter.id] || []).map(img =>
                img.id === imageId ? { ...img, isFavorite: !img.isFavorite } : img
              )
            }));
          }}
          onDelete={imageId => {
            setCharacterImages(prev => ({
              ...prev,
              [gallerySidebarCharacter.id]: (prev[gallerySidebarCharacter.id] || []).filter(img => img.id !== imageId)
            }));
          }}
          onSetAsBackground={imageId => {
            // 可扩展：设置背景
          }}
          onSetAsAvatar={imageId => {
            // 可扩展：设置头像
          }}
          isLoading={false}
          character={{
            ...gallerySidebarCharacter,
            inCradleSystem: gallerySidebarCharacter.inCradleSystem || false
          }}
          onAddNewImage={img => setCharacterImages(prev => ({
            ...prev,
            [gallerySidebarCharacter.id]: [...(prev[gallerySidebarCharacter.id] || []), img]
          }))}
        />
      )}

      {/* 图片生成 */}
      {showImageGenModal && imageGenCharacter && (
        <ImageRegenerationModal
          visible={showImageGenModal}
          character={{
            ...imageGenCharacter,
          }}
          onClose={() => setShowImageGenModal(false)}
          onSuccess={img => {
            handleImageGenSuccess(img);
          }}
          // 新增：立即持久化
          onPersistImage={async (img) => {
            await persistCharacterImage(imageGenCharacter.id, img);
          }}
        />
      )}

      {/* 角色编辑 */}
      {showEditDialog && editDialogCharacter && (
        <CharacterEditDialog
          isVisible={showEditDialog}
          character={editDialogCharacter}
          onClose={() => setShowEditDialog(false)}
        />
      )}

      {/* Import Loading Modal */}
      {importLoading && (
        <Modal
          visible={importLoading}
          transparent
          animationType="fade"
        >
          <View style={styles.importLoadingOverlay}>
            <View style={styles.importLoadingBox}>
              <ActivityIndicator size="large" color={COLOR_BUTTON} />
              <Text style={styles.importLoadingText}>正在导入并创建角色，请稍候…</Text>
            </View>
          </View>
        </Modal>
      )}

      {renderImportOptionsModal()}

      {renderScriptImportModal()}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText || '确定'}
        cancelText={dialog.cancelText || '取消'}
        confirmAction={dialog.onConfirm}
        cancelAction={dialog.onCancel || (() => setDialog({ ...dialog, visible: false }))}
        destructive={dialog.destructive || false}
      />

      {/* Script Import Config Modal */}
      {pendingScriptConfig && (
        <ScriptImportConfigModal
          visible={showScriptImportConfig}
          onClose={() => {
            setShowScriptImportConfig(false);
            setPendingScriptConfig(null);
          }}
          onConfirm={handleScriptImportConfirm}
          scriptConfig={pendingScriptConfig.scriptConfig}
          variableConfig={pendingScriptConfig.variableConfig}
          characters={characters}
        />
      )}
    </SafeAreaView>
  );
};

// 优化：areEqual函数用于React.memo，减少不必要的渲染
function areEqual(prev: any, next: any) {
  return (
    prev.item.id === next.item.id &&
    prev.isManaging === next.isManaging &&
    prev.isSelected === next.isSelected &&
    prev.viewMode === next.viewMode &&
    prev.highlight === next.highlight
  );
}

const CharacterCard: React.FC<{
  item: Character;
  isManaging: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onPress: (id: string) => void;
  onOpenDiary: (id: string) => void;
  viewMode: 'small' | 'large' | 'vertical';
  onOpenGallerySidebar: (character: Character) => void;
  onOpenImageGen: (character: Character) => void;
  onOpenEditDialog?: (character: Character) => void;
  highlight?: boolean;
}> = React.memo(
  ({
    item,
    isManaging,
    isSelected,
    onSelect,
    onPress,
    onOpenDiary,
    viewMode,
    onOpenGallerySidebar,
    onOpenImageGen,
    onOpenEditDialog,
    highlight
  }) => {
    const isLargeView = viewMode === VIEW_MODE_LARGE;
    const isVerticalView = viewMode === VIEW_MODE_VERTICAL;
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const highlightOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (highlight) {
        highlightOpacity.setValue(0);
        Animated.sequence([
          Animated.timing(highlightOpacity, { toValue: 0.6, duration: 280, useNativeDriver: true }),
          Animated.timing(highlightOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]).start();
      }
    }, [highlight, highlightOpacity]);

    // Calculate responsive card styles based on screen size and view mode
    const responsiveCardStyle = isLargeView
      ? {
          width: LARGE_CARD_WIDTH,
          height: width > 600 ? LARGE_CARD_WIDTH * (9 / 16) : LARGE_CARD_HEIGHT, // Adjust height for larger tablets
          marginBottom: 16,
        }
      : isVerticalView
      ? {
          width: VERTICAL_CARD_WIDTH,
          height: VERTICAL_CARD_HEIGHT,
          margin: 8,
        }
      : {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          margin: 8,
        };

    // Calculate button size based on screen width
    const buttonSize = width < 360 ? 16 : 18; 
    const fontSize = width < 360 ? 14 : 16;

    const shouldShowVideo = item.dynamicPortraitEnabled && item.dynamicPortraitVideo;

    const handleCardPress = () => {
      if (isManaging) {
        onSelect(item.id);
      } else {
        onPress(item.id);
      }
    };

    // Handle video playback status updates
    const player = useVideoPlayer(
      shouldShowVideo ? item.dynamicPortraitVideo! : null,
      (p) => {
        try {
          p.loop = true;
          p.muted = true;
          p.showNowPlayingNotification = false;
          p.staysActiveInBackground = false;
          p.timeUpdateEventInterval = 0;
          p.play();
        } catch {}
      }
    );

    useEffect(() => {
      if (!player) {
        setIsVideoReady(false);
        return;
      }
      setVideoError(null);
    }, [player]);

    // Listen to player status to update ready/error
    useEventListener(player, 'statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        setIsVideoReady(true);
      } else if (status === 'error') {
        setIsVideoReady(false);
        setVideoError(error?.message || '视频播放错误');
      }
    });

    // Reset video state when component unmounts or item/viewMode changes
    useEffect(() => {
      setIsVideoReady(false);
      setVideoError(null);
    }, [item.id, viewMode]);

    // 复选框点击事件阻止冒泡
    const handleCheckboxPress = (e: any) => {
      e.stopPropagation();
      onSelect(item.id);
    };

    return (
      <TouchableOpacity
        style={[styles.card, responsiveCardStyle, isManaging && styles.manageCard]}
        onPress={handleCardPress}
        onLongPress={() => onSelect(item.id)}
        activeOpacity={0.85}
      >
        {/* Orange highlight overlay */}
        <Animated.View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(255,165,0,0.28)',
            opacity: highlightOpacity,
          }}
        />
        {shouldShowVideo ? (
          // Render video for all view modes
          <>
            <VideoView
              player={player}
              style={styles.videoBackground}
              contentFit="cover"
              nativeControls={false}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              showsTimecodes={false}
              requiresLinearPlayback
              useExoShutter={false}
              onFirstFrameRender={() => setIsVideoReady(true)}
              pointerEvents="none"
            />
            
            {/* Show loading indicator while video is loading */}
            {!isVideoReady && !videoError && (
              <View style={styles.videoLoadingContainer}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            )}
            
            {/* Show fallback image if video failed to load */}
            {videoError && (
              <Image
                source={
                  item.backgroundImage
                    ? { uri: item.backgroundImage }
                    : require('@/assets/images/default-avatar.png')
                }
                style={styles.imageBackground}
                resizeMode="cover"
                defaultSource={require('@/assets/images/default-avatar.png')}
              />
            )}
          </>
        ) : (
          <Image
            source={
              item.backgroundImage
                ? { uri: item.backgroundImage }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.imageBackground}
            resizeMode="cover"
            defaultSource={require('@/assets/images/default-avatar.png')}
          />
        )}

        <View style={styles.cardOverlay}>
          {/* Responsive layout for card name and buttons */}
          {isLargeView ? (
            <>
              <Text style={[styles.cardName, { fontSize }]}>{item.name}</Text>
              {!isManaging && (
                <View style={{ flexDirection: 'row', gap: width < 360 ? 4 : 6 }}>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 28 : 32, height: width < 360 ? 28 : 32 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenDiary(item.id);
                    }}
                  >
                    <Ionicons name="book-outline" size={buttonSize} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 28 : 32, height: width < 360 ? 28 : 32 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenGallerySidebar(item);
                    }}
                  >
                    <Ionicons name="images-outline" size={buttonSize} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 28 : 32, height: width < 360 ? 28 : 32 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenImageGen(item);
                    }}
                  >
                    <Ionicons name="color-wand-outline" size={buttonSize} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 28 : 32, height: width < 360 ? 28 : 32 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenEditDialog && onOpenEditDialog(item);
                    }}
                  >
                    <Ionicons name="construct-outline" size={buttonSize} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            // For smaller view mode, stack vertically and use smaller fonts/buttons
            <View style={{ flex: 1, width: '100%' }}>
              <Text
                style={[
                  styles.cardName,
                  { marginBottom: 6, width: '100%', fontSize: width < 360 ? 13 : 15 }
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.name}
              </Text>
              {!isManaging && (
                <View style={{ flexDirection: 'row', gap: width < 360 ? 3 : 6 }}>
                  {/* Small mode buttons with responsive sizing */}
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 26 : 30, height: width < 360 ? 26 : 30 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenDiary(item.id);
                    }}
                  >
                    <Ionicons name="book-outline" size={buttonSize - 2} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 26 : 30, height: width < 360 ? 26 : 30 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenGallerySidebar(item);
                    }}
                  >
                    <Ionicons name="images-outline" size={buttonSize - 2} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 26 : 30, height: width < 360 ? 26 : 30 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenImageGen(item);
                    }}
                  >
                    <Ionicons name="color-wand-outline" size={buttonSize - 2} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.diaryButton, { width: width < 360 ? 26 : 30, height: width < 360 ? 26 : 30 }]}
                    onPress={e => {
                      e.stopPropagation();
                      onOpenEditDialog && onOpenEditDialog(item);
                    }}
                  >
                    <Ionicons name="construct-outline" size={buttonSize - 2} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Make checkbox responsive */}
        {isManaging && (
          <TouchableOpacity
            style={[
              styles.checkboxContainer, 
              styles.checkboxRightTop,
              isSelected && styles.checkboxSelected,
              { width: width < 360 ? 20 : 24, height: width < 360 ? 20 : 24 }
            ]}
            onPress={handleCheckboxPress}
            activeOpacity={0.7}
          >
            {isSelected && <Ionicons name="checkmark" size={width < 360 ? 14 : 16} color="black" />}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  },
  areEqual
);

// 剧本卡片组件
const ScriptCard: React.FC<{
  item: Script;
  isManaging: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onPress: (id: string) => void;
}> = React.memo(({ item, isManaging, isSelected, onSelect, onPress }) => {
  const { characters } = useCharacters(); // 获取角色列表
  
  const handlePress = () => {
    if (isManaging) {
      onSelect(item.id);
    } else {
      onPress(item.id);
    }
  };

  // 复选框点击事件阻止冒泡
  const handleCheckboxPress = (e: any) => {
    e.stopPropagation();
    onSelect(item.id);
  };

  // 获取涉及角色的信息（包括剧本角色）
  const scriptCharacters = characters.filter(char => {
    // 首先检查是否在selectedCharacters中
    if (item.selectedCharacters.includes(char.id)) {
      return true;
    }
    
    // 然后检查是否是该剧本创建的角色
    try {
      const jsonData = char.jsonData ? JSON.parse(char.jsonData) : {};
      return jsonData.data?.isScriptCharacter && jsonData.data?.scriptId === item.id;
    } catch (error) {
      return false;
    }
  });

  return (
    <TouchableOpacity
      style={[
        styles.scriptCard,
        isManaging && styles.manageCard
      ]}
      onPress={handlePress}
      onLongPress={() => onSelect(item.id)}
      activeOpacity={0.85}
    >
      {/* 封面图片区域 */}
      <View style={styles.scriptCover}>
        {item.cover ? (
          <Image
            source={{ uri: item.cover }}
            style={styles.scriptCoverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.scriptCoverPlaceholder}>
            <Ionicons name="film-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
          </View>
        )}
      </View>
      
      {/* 信息区域 */}
      <View style={styles.scriptInfo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.scriptTitle} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.scriptMeta}>
            {item.selectedCharacters.length} 个角色 • {new Date(item.updatedAt).toLocaleDateString()}
          </Text>
          {item.styleConfig && (
            <Text style={styles.scriptStyleInfo}>
              样式: {item.styleConfig.name}
            </Text>
          )}
        </View>
      </View>
      
      {/* 右下角角色头像展示 */}
      {scriptCharacters.length > 0 && (
        <View style={styles.characterAvatarsContainer}>
          <Text style={styles.characterLabel}>角色</Text>
          {scriptCharacters.slice(0, 4).map((character, index) => (
            <View
              key={character.id}
              style={[
                styles.characterAvatar,
                { 
                  marginLeft: index > 0 ? -8 : 0,
                  zIndex: scriptCharacters.length - index 
                }
              ]}
            >
              <Image
                source={
                  character.avatar
                    ? { uri: character.avatar }
                    : require('@/assets/images/default-avatar.png')
                }
                style={styles.characterAvatarImage}
                resizeMode="cover"
              />
            </View>
          ))}
          {scriptCharacters.length > 4 && (
            <View style={[styles.characterAvatar, styles.moreCharactersBadge]}>
              <Text style={styles.moreCharactersText}>
                +{scriptCharacters.length - 4}
              </Text>
            </View>
          )}
        </View>
      )}
      
      {/* 管理模式复选框 */}
      {isManaging && (
        <TouchableOpacity
          style={[
            styles.checkboxContainer, 
            styles.checkboxRightTop,
            isSelected && styles.checkboxSelected,
            { 
              width: width < 360 ? 20 : 24, 
              height: width < 360 ? 20 : 24,
              top: 8,
              right: scriptCharacters.length > 0 ? 120 : 8, // 如果有角色头像，调整位置避免重叠
            }
          ]}
          onPress={handleCheckboxPress}
          activeOpacity={0.7}
        >
          {isSelected && <Ionicons name="checkmark" size={width < 360 ? 14 : 16} color="black" />}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

interface Styles {
  safeArea: ViewStyle;
  header: ViewStyle;
  headerContent: ViewStyle;
  headerTitle: TextStyle;
  headerButtons: ViewStyle;
  headerButton: ViewStyle;
  activeHeaderButton: ViewStyle;
  listContainer: ViewStyle;
  card: ViewStyle;
  manageCard: ViewStyle;
  videoBackground: ViewStyle; // For Video component
  imageBackground: ImageStyle; // For Image component
  cardOverlay: ViewStyle;
  cardName: TextStyle;
  checkboxContainer: ViewStyle;
  checkboxSelected: ViewStyle;
  floatingButton: ViewStyle;
  deleteButton: ViewStyle;
  loader: ViewStyle;
  addMenuContainer: ViewStyle;
  addMenuItem: ViewStyle;
  addMenuItemText: TextStyle;
  creationModalContainer: ViewStyle;
  creationModalHeader: ViewStyle;
  creationModalTitle: TextStyle;
  creationModalContent: ViewStyle;
  videoLoadingContainer: ViewStyle;
  videoErrorText: TextStyle;
  diaryButton: ViewStyle;
  importLoadingOverlay: ViewStyle;
  importLoadingBox: ViewStyle;
  importLoadingText: TextStyle;
  headerTitleCentered: TextStyle;
  topBarActiveActionButton: ViewStyle;
  checkboxRightTop: ViewStyle;
}

const styles = StyleSheet.create<any>({
  safeArea: {
    flex: 1,
    backgroundColor: COLOR_BACKGROUND,
  },
  headerOld: {
    backgroundColor: '#333333',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 224, 195, 0.2)',
    zIndex: 10,
  },
  topBarMenuButton: {
    padding: width > 380 ? 8 : 6,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitleOld: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  headerButtonsOld: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButtonOld: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeHeaderButtonOld: {
    backgroundColor: COLOR_BUTTON,
  },
  listContainer: {
    padding: width < 360 ? 12 : 16,
    paddingBottom: 100,
    alignItems: 'flex-start',
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  manageCard: {
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 2,
  },
  videoBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  imageBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
  },
  cardName: {
    color: COLOR_TEXT,
    fontWeight: '500',
    flex: 1,
  },
  checkboxContainer: {
    position: 'absolute',
    // top/left由checkboxRightTop控制
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000', // 边框色改为黑色
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
  },
  checkboxRightTop: {
    top: 8,
    right: 8,
    left: undefined,
  },
  checkboxSelected: {
    backgroundColor: COLOR_BUTTON,
  },
  floatingButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: width < 360 ? 46 : 50,
    height: width < 360 ? 46 : 50,
    borderRadius: width < 360 ? 23 : 25,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deleteButton: {
    backgroundColor: theme.colors.danger,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMenuContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 62 : 102,
    right: 16,
    backgroundColor: COLOR_BUTTON,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 20,
    padding: 4,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  addMenuItemText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '500',
    color: '#282828',
  },
  creationModalContainer: {
    flex: 1,
    backgroundColor: COLOR_BACKGROUND,
  },
  creationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 224, 195, 0.2)',
  },
  creationModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLOR_BUTTON,
  },
  creationModalContent: {
    flex: 1,
  },
  videoLoadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  videoErrorText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 6,
    borderRadius: 4,
    fontSize: 12,
  },
  diaryButton: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5000,
    flex: 1,
  },
  importLoadingBox: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  importLoadingText: {
    color: COLOR_BUTTON,
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  // 顶部栏样式对齐 index.tsx
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
    paddingTop: 12,
  },
  headerTitle: {
    fontSize: 18,
    alignItems: 'center',
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
    flex: 1,
    textAlign: 'left',
  },
  headerTitleCentered: {
    // 保留字段以兼容旧引用，但布局已改为三段式，不再需要绝对定位
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerButton: {
    padding: 8,
    backgroundColor: 'transparent',
  },
  topBarActiveActionButton: {
    backgroundColor: COLOR_BUTTON,
  },
  // 剧本卡片样式 - 修改为16:9横向比例
  scriptCard: {
    flexDirection: 'row',
    backgroundColor: COLOR_CARD_BG,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    height: width < 360 ? 120 : 140, // 响应式高度
  },
  scriptCover: {
    width: width < 360 ? 213 : 249, // 响应式宽度：16:9比例
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  scriptCoverImage: {
    width: '100%',
    height: '100%',
  },
  scriptCoverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  scriptInfo: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
    minWidth: 0, // 确保flex子元素能够正确收缩
  },
  scriptTitle: {
    color: COLOR_TEXT,
    fontSize: width < 360 ? 16 : 18, // 响应式字体大小
    fontWeight: '600',
    marginBottom: width < 360 ? 8 : 12, // 响应式间距
    flex: 1, // 让标题占据更多空间
  },
  scriptMeta: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: width < 360 ? 12 : 14, // 响应式字体大小
    marginBottom: width < 360 ? 4 : 8, // 响应式间距
  },
  scriptStyleInfo: {
    color: COLOR_BUTTON,
    fontSize: width < 360 ? 11 : 12, // 响应式字体大小
  },
  // 角色头像展示样式
  characterAvatarsContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  characterAvatar: {
    width: width < 360 ? 24 : 28,
    height: width < 360 ? 24 : 28,
    borderRadius: width < 360 ? 12 : 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  characterAvatarImage: {
    width: '100%',
    height: '100%',
  },
  moreCharactersBadge: {
    backgroundColor: 'rgba(255, 224, 195, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreCharactersText: {
    color: '#282828',
    fontSize: width < 360 ? 8 : 10,
    fontWeight: 'bold',
  },
  characterLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: width < 360 ? 10 : 12,
    fontWeight: '500',
    marginRight: 6,
  },
  // 搜索栏样式
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 4,
  },
  clearSearchButton: {
    marginLeft: 8,
    padding: 4,
  },
});

export default CharactersScreen;
