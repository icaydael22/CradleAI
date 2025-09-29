import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
  Modal,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker'; // Fix: Correct DocumentPicker import
import { useRouter } from 'expo-router';
import { Character, CradleCharacter } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NodeSTManager } from '@/utils/NodeSTManager';
import {
  RoleCardJson,
  WorldBookJson,
  AuthorNoteJson,
  WorldBookEntry,
} from '@/shared/types';
import { WorldBookEntryUI, PresetEntryUI } from '@/constants/types';
import { 
  WorldBookSection,
  PresetSection,
  AuthorNoteSection
} from '@/components/character/CharacterSections';
import DetailSidebar from '@/components/character/DetailSidebar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CharacterImporter } from '@/utils/CharacterImporter';
import CharacterAttributeEditor from '@/components/character/CharacterAttributeEditor';
import { Ionicons } from '@expo/vector-icons';
import TagSelector from '@/components/TagSelector';
import ArtistReferenceSelector from '@/components/ArtistReferenceSelector';
import VoiceSelector from '@/components/VoiceSelector';
import DouBaoTTSSelector from '@/components/DouBaoTTSSelector';
import MinimaxTTSSelector from '@/components/MinimaxTTSSelector';
import { theme } from '@/constants/theme';
import { TTSProvider, TTSConfig } from '@/shared/types';
import { KNOWN_TAGS } from '@/app/data/knowntags';
// Default preset entries
export const DEFAULT_PRESET_ENTRIES = {
  // 可编辑条目
  EDITABLE: [
    { 
      id: "main", 
      name: "Main", 
      identifier: "main",
      enable: true,
      role: "user"
    },
    { 
      id: "enhance_def", 
      name: "Enhance Definitions", 
      identifier: "enhanceDefinitions",
      enable: true,
      role: "user",
      injection_position: 1,
      injection_depth: 3
    },
    { id: "aux_prompt", name: "Auxiliary Prompt", identifier: "nsfw" },
    { id: "post_hist", name: "Post-History Instructions", identifier: "jailbreak" }
  ],
  
  // 只可排序条目 (与角色卡关联)
  FIXED: [
    {
      id: "world_before",
      name: "World Info (before)",
      identifier: "worldInfoBefore",
      enable: true,
      role: "user"
    },
    { id: "char_desc", name: "Char Description", identifier: "charDescription" },
    { id: "char_pers", name: "Char Personality", identifier: "charPersonality" },
    { id: "scenario", name: "Scenario", identifier: "scenario" },
    { id: "world_after", name: "World Info (after)", identifier: "worldInfoAfter" },
    { id: "chat_ex", name: "Chat Examples", identifier: "dialogueExamples" },
    { id: "chat_hist", name: "Chat History", identifier: "chatHistory" }
  ]
};

export const DEFAULT_PRESET_ORDER = [
  "main",           // 可编辑
  "world_before",   // 只可排序
  "char_desc",      // 只可排序
  "char_pers",      // 只可排序
  "scenario",       // 只可排序
  "enhance_def",    // 可编辑
  "aux_prompt",     // 可编辑
  "world_after",    // 只可排序
  "chat_ex",        // 只可排序
  "chat_hist",      // 只可排序
  "post_hist"       // 可编辑
];

// 添加插入类型常量
const INSERT_TYPE_OPTIONS = {
  RELATIVE: 'relative',
  CHAT: 'chat'
} as const;

// 新增：定义临时导入数据文件路径
const TEMP_IMPORT_DATA_FILE = FileSystem.cacheDirectory + 'temp_import_data.json';

interface CreateCharProps {
  activeTab?: 'basic' | 'advanced' | 'voice';
  creationMode?: 'manual' | 'auto' | 'import';
  allowTagImageGeneration?: boolean;
  onClose?: () => void;
  // --- Add onImportReady callback for import loading animation ---
  onImportReady?: () => void;
}

const CreateChar: React.FC<CreateCharProps> = ({
  activeTab: initialActiveTab = 'basic',
  creationMode = 'manual',
  allowTagImageGeneration = false,
  onClose,
  onImportReady // <-- receive prop
}) => {
  const router = useRouter();
  const { addCharacter, addConversation,} = useCharacters();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  
  // Character and role card state
  const [character, setCharacter] = useState<Character & Partial<CradleCharacter>>({
    id: '',
    name: '',
    avatar: null,
    backgroundImage: null,
    conversationId: '',
    description: '',
    personality: '',
    interests: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Add cradle system fields
    inCradleSystem: true,
    cradleStatus: 'growing',
    feedHistory: [],
    cradleCreatedAt: Date.now(),
    cradleUpdatedAt: Date.now(),
    voiceType: undefined // Initialize voiceType as undefined
  });
  
  const [roleCard, setRoleCard] = useState<Partial<RoleCardJson>>({
    name: '',
    first_mes: '',
    description: '',
    personality: '',
    scenario: '',
    mes_example: '',
    data: {
      extensions: {
        regex_scripts: []
      }
    }
  });

  // World book and author note state
  const [worldBook, setWorldBook] = useState<Partial<WorldBookJson>>({
    entries: {}
  });

  const [authorNote, setAuthorNote] = useState<Partial<AuthorNoteJson>>({
    charname: '',
    username: user?.settings?.self.nickname || 'User',
    content: '',
    injection_depth: 0
  });

  const [worldBookEntries, setWorldBookEntries] = useState<WorldBookEntryUI[]>([]);
  const [presetEntries, setPresetEntries] = useState<PresetEntryUI[]>(() => {
    // ...existing preset entries initialization...
    // 合并所有默认条目
    const defaultEntries = [
      ...DEFAULT_PRESET_ENTRIES.EDITABLE.map(entry => ({
        ...entry,
        content: '',
        isEditable: true,
        insertType: 'relative' as const,
        role: 'user' as const,
        order: DEFAULT_PRESET_ORDER.indexOf(entry.identifier),
        isDefault: true,
        enable: entry.enable ?? true,
        depth: 0
      })),
      ...DEFAULT_PRESET_ENTRIES.FIXED.map(entry => ({
        ...entry,
        content: '',
        isEditable: false,
        insertType: 'relative' as const,
        role: 'user' as const,
        order: DEFAULT_PRESET_ORDER.indexOf(entry.identifier),
        isDefault: true,
        enable: entry.enable ?? true,
        depth: 0
      }))
    ];

    // 根据 DEFAULT_PRESET_ORDER 排序
    return defaultEntries
      .sort((a, b) => {
        const orderA = DEFAULT_PRESET_ORDER.indexOf(a.identifier);
        const orderB = DEFAULT_PRESET_ORDER.indexOf(b.identifier);
        return orderA - orderB;
      });
  });

  // UI state variables - match character-detail page
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'voice'>(initialActiveTab);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Add ref to track unsaved changes for back button handling
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  
  // Update the ref when hasUnsavedChanges changes
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);
  
  // Handle Android back button
  useEffect(() => {
    const backAction = () => {
      if (hasUnsavedChangesRef.current) {
        setShowConfirmDialog(true);
        return true; // Prevent default behavior
      }
      return false; // Allow default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  // Update activeTab when initialActiveTab changes
  useEffect(() => {
    setActiveTab(initialActiveTab);
  }, [initialActiveTab]);

  const [selectedField, setSelectedField] = useState<{
    title: string;
    content: string;
    onContentChange?: (text: string) => void;
    editable?: boolean;
    entryType?: 'worldbook' | 'preset' | 'author_note';
    entryOptions?: any;
    onOptionsChange?: (options: any) => void;
    name?: string;
    onNameChange?: (text: string) => void;
    id?: string; // Add id for deletion
  } | null>(null);

  // 新增：alternateGreetings和选中索引
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>([]);
  const [selectedGreetingIndex, setSelectedGreetingIndex] = useState<number>(0);

  // 新增：用于存储regexScripts（不渲染到UI，仅存储和日志）
  const [importedRegexScripts, setImportedRegexScripts] = useState<any[] | undefined>(undefined);

  // 新增：添加/删除开场白功能
  const handleAddGreeting = () => {
    setAlternateGreetings(prev => [...prev, '']);
    setSelectedGreetingIndex(alternateGreetings.length);
    setRoleCard(prev => ({ ...prev, first_mes: '' }));
    setHasUnsavedChanges(true);
  };

  const handleDeleteGreeting = () => {
    if (alternateGreetings.length <= 1) return;
    setAlternateGreetings(prev => {
      const newGreetings = prev.filter((_, i) => i !== selectedGreetingIndex);
      const newIndex = Math.min(selectedGreetingIndex, newGreetings.length - 1);
      setSelectedGreetingIndex(newIndex);
      setRoleCard(prevCard => ({ ...prevCard, first_mes: newGreetings[newIndex] }));
      return newGreetings;
    });
    setHasUnsavedChanges(true);
  };
  // Handle detail view for world book, preset, and author note entries
  const handleViewDetail = (
    title: string, 
    content: string,
    onContentChange?: (text: string) => void,
    editable: boolean = true,
    entryType?: 'worldbook' | 'preset' | 'author_note',
    entryOptions?: any,
    onOptionsChange?: (options: any) => void,
    name?: string,
    onNameChange?: (text: string) => void,
    entryId?: string // Add entryId parameter
  ) => {
    setSelectedField({ 
      title, 
      content, 
      onContentChange, 
      editable,
      entryType,
      entryOptions,
      onOptionsChange,
      name,
      onNameChange,
      id: entryId // Store the ID for deletion
    });
  };

  // 处理开场白选择
  const handleSelectGreeting = (idx: number) => {
    setSelectedGreetingIndex(idx);
    setRoleCard(prev => ({
      ...prev,
      first_mes: alternateGreetings[idx] || ''
    }));
    setHasUnsavedChanges(true);
  };

  // 修改handleRoleCardChange以同步alternateGreetings
  const handleRoleCardChange = (field: keyof RoleCardJson, value: string) => {
    setRoleCard(prev => ({ ...prev, [field]: value }));
    if (field === 'first_mes') {
      setAlternateGreetings(prevGreetings => {
        if (prevGreetings.length === 0) return [value];
        const updated = [...prevGreetings];
        updated[selectedGreetingIndex] = value;
        return updated;
      });
    }
    // 同步更新角色基本信息
    if (field === 'name') {
      setCharacter(prev => ({ ...prev, name: value }));
      setAuthorNote(prev => ({ ...prev, charname: value }));
    }
    
    // Basic character properties syncing
    if (field === 'description') {
      setCharacter(prev => ({ ...prev, description: value }));
    }
    
    if (field === 'personality') {
      setCharacter(prev => ({ ...prev, personality: value }));
    }
    
    setHasUnsavedChanges(true);
  };

  // --- 新增：监听alternateGreetings变化自动同步first_mes ---
  useEffect(() => {
    // 当alternateGreetings变化时，自动同步first_mes
    if (
      alternateGreetings.length > 0 &&
      (roleCard.first_mes !== alternateGreetings[selectedGreetingIndex])
    ) {
      console.log('[CreateChar][UI] alternateGreetings changed, syncing first_mes:', {
        alternateGreetings,
        selectedGreetingIndex,
        newFirstMes: alternateGreetings[selectedGreetingIndex],
        prevFirstMes: roleCard.first_mes
      });
      setRoleCard(prev => ({
        ...prev,
        first_mes: alternateGreetings[selectedGreetingIndex] || ''
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alternateGreetings, selectedGreetingIndex]);

  // World Book handling functions
  const handleAddWorldBookEntry = () => {
    const newEntry: WorldBookEntryUI = {
      id: Date.now().toString(),
      name: '',
      comment: '',
      content: '',
      disable: false,
      position: 4,
      key: [],
      constant: false,
      depth: 0,
      order: worldBookEntries.length
    };
    setWorldBookEntries(prev => [...prev, newEntry]);
    setHasUnsavedChanges(true);
  };

  const handleUpdateWorldBookEntry = (id: string, updates: Partial<WorldBookEntryUI>) => {
    setWorldBookEntries(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      )
    );
    setHasUnsavedChanges(true);
  };

  const handleDeleteWorldBookEntry = (id: string) => {
    Alert.alert(
      '删除条目',
      '确定要删除此世界书条目吗？',
      [
        {
          text: '取消',
          style: 'cancel'
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            setWorldBookEntries(prev => prev.filter(entry => entry.id !== id));
            setHasUnsavedChanges(true);
          }
        }
      ]
    );
  };
  
  // 新增：导入世界书
  const handleImportWorldBook = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });
      if (!result.assets || !result.assets[0]) return;
      const fileUri = result.assets[0].uri;
      const cacheUri = `${FileSystem.cacheDirectory}${result.assets[0].name}`;
      await FileSystem.copyAsync({ from: fileUri, to: cacheUri });
      const worldBookJson = await CharacterImporter.importWorldBookOnlyFromJson(cacheUri);
      if (worldBookJson && worldBookJson.entries) {
        const entries = Object.entries(worldBookJson.entries).map(([key, entry]: [string, any], idx) => {
          const rawPosition = Number(entry.position);
          const position = (isNaN(rawPosition) || rawPosition < 0 || rawPosition > 4 ? 4 : rawPosition) as 0 | 1 | 2 | 3 | 4;
          return {
            id: key,
            name: entry.comment || key,
            comment: entry.comment || '',
            content: entry.content || '',
            disable: entry.disable,
            position,
            constant: !!entry.constant,
            key: entry.key || [],
            depth: position === 4 ? (entry.depth || 0) : undefined,
            order: entry.order || idx,
            vectorized: entry.vectorized || false
          };
        });
        setWorldBookEntries(entries);
        Alert.alert('成功', '世界书导入成功');
        setHasUnsavedChanges(true);
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '未知错误');
    }
  };

  // Preset handling functions
  const handleAddPresetEntry = () => {
    const newEntry: PresetEntryUI = {
      id: Date.now().toString(),
      name: '',
      content: '',
      identifier: `custom_${Date.now()}`,
      isEditable: true,
      insertType: 'relative',
      role: 'user',
      order: presetEntries.length,
      isDefault: false,
      enable: true,
      depth: 0
    };
    setPresetEntries(prev => [...prev, newEntry]);
    setHasUnsavedChanges(true);
  };

  const handleUpdatePresetEntry = (id: string, updates: Partial<PresetEntryUI>) => {
    setPresetEntries(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      )
    );
    setHasUnsavedChanges(true);
  };

  const handleDeletePresetEntry = (id: string) => {
    const entry = presetEntries.find(e => e.id === id);
    if (entry?.isDefault) {
      Alert.alert(
        '无法删除',
        '默认预设条目不能被删除，但可以禁用。'
      );
      return;
    }

    Alert.alert(
      '删除条目',
      '确定要删除此预设条目吗？此操作无法撤销。',
      [
        {
          text: '取消',
          style: 'cancel'
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            setPresetEntries(prev => prev.filter(entry => entry.id !== id));
            setHasUnsavedChanges(true);
          }
        }
      ]
    );
  };

  // 处理条目排序
  const handleMoveEntry = (id: string, direction: 'up' | 'down') => {
    setPresetEntries(prev => {
      const index = prev.findIndex(entry => entry.id === id);
      if (
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index === prev.length - 1)
      ) {
        return prev;
      }

      const newEntries = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newEntries[index], newEntries[swapIndex]] = [newEntries[swapIndex], newEntries[index]];
      
      // 更新order值
      return newEntries.map((entry, idx) => ({
        ...entry,
        order: idx
      }));
    });
    setHasUnsavedChanges(true);
  };

  // 重新排序函数
  const handleReorderPresets = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    setPresetEntries(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      
      // Update the order values after reordering
      return result.map((entry, idx) => ({
        ...entry,
        order: idx
      }));
    });
    setHasUnsavedChanges(true);
  };
  
  const handleReorderWorldBook = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    setWorldBookEntries(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      
      // Update the order values after reordering
      return result.map((entry, idx) => ({
        ...entry,
        order: idx
      }));
    });
    setHasUnsavedChanges(true);
  };

  // Image handling functions
  const pickAvatar = async () => {
    try {
      // 首先选择图片
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
          Image.getSize(result.assets[0].uri, (width, height) => {
            resolve({ width, height });
          }, () => {
            resolve({ width: 300, height: 300 }); // Default fallback values
          });
        });

        // 计算圆形裁剪的尺寸和位置
        const size = Math.min(width, height);
        const x = (width - size) / 2;
        const y = (height - size) / 2;

        // 执行圆形裁剪
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [
            {
              crop: {
                originX: x,
                originY: y,
                width: size,
                height: size,
              },
            },
          ],
          {
            format: ImageManipulator.SaveFormat.PNG,
            compress: 1,
          }
        );

        // 持久化存储到 FileSystem.documentDirectory/avatars/
        const avatarDir = FileSystem.documentDirectory + 'avatars/';
        await FileSystem.makeDirectoryAsync(avatarDir, { intermediates: true }).catch(() => {});
        const avatarFilename = `avatar_${Date.now()}.png`;
        const avatarDest = avatarDir + avatarFilename;
        await FileSystem.copyAsync({ from: manipResult.uri, to: avatarDest });

        setCharacter(prev => ({
          ...prev,
          avatar: avatarDest
        }));
        setHasUnsavedChanges(true);
      }
    } catch (error: any) {
      console.error("Image picking error:", error);
      Alert.alert("提示", "请确保选择合适的图片并正确裁剪");
    }
  };

  const pickBackgroundImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        // 可选：可做尺寸处理
        // 持久化存储到 FileSystem.documentDirectory/backgrounds/
        const bgDir = FileSystem.documentDirectory + 'backgrounds/';
        await FileSystem.makeDirectoryAsync(bgDir, { intermediates: true }).catch(() => {});
        const bgFilename = `background_${Date.now()}.jpg`;
        const bgDest = bgDir + bgFilename;
        await FileSystem.copyAsync({ from: result.assets[0].uri, to: bgDest });

        setCharacter(prev => ({
          ...prev,
          backgroundImage: bgDest
        }));
        setHasUnsavedChanges(true);
      }
    } catch (error: any) {
      console.error("Background image picking error:", error);
      Alert.alert("Error", "Could not pick image: " + error.message);
    }
  };

  // Navigation handling
  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      setShowConfirmDialog(true);
    } else {
      router.back();
    }
  };

  // Add tag-based image generation support
  const [uploadMode, setUploadMode] = useState<'upload' | 'generate'>('upload');
  const [positiveTags, setPositiveTags] = useState<string[]>([]);
  const [negativeTags, setNegativeTags] = useState<string[]>([]);
  const [tagSelectorVisible, setTagSelectorVisible] = useState(false);
  const [selectedArtistPrompt, setSelectedArtistPrompt] = useState<string | null>(null);
  const [artistSelectorVisible, setArtistSelectorVisible] = useState(false);
  const [douBaoSelectorVisible, setDouBaoSelectorVisible] = useState(false);
  const [minimaxSelectorVisible, setMinimaxSelectorVisible] = useState(false);

  // Update voice related state
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('cosyvoice');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [voiceTemplateId, setVoiceTemplateId] = useState<string | undefined>(undefined);
  const [selectedDouBaoVoice, setSelectedDouBaoVoice] = useState<string | undefined>(undefined);
  const [selectedMinimaxVoice, setSelectedMinimaxVoice] = useState<string | undefined>(undefined);

  // --- 新增：保存角色时，写入extraGreetings
  const saveCharacter = async () => {
    if (!roleCard.name?.trim()) {
      Alert.alert('保存失败', '角色名称不能为空。');
      return;
    }
  
    setIsSaving(true);
    const characterId = String(Date.now());
    
    try {
      // Log that we're saving the character
      console.log('[CreateChar] Saving character:', characterId, 'Mode:', creationMode);
      
      // 清理first_mes和alternateGreetings中的未知标签
      const cleanedFirstMes = cleanUnknownTags(roleCard.first_mes || '');
      const cleanedAlternateGreetings = alternateGreetings.map(g => cleanUnknownTags(g));

      // 构建角色数据
      const jsonData = {
        roleCard: {
          name: roleCard.name.trim(),
          first_mes: cleanedFirstMes || '',
          description: roleCard.description || '',
          personality: roleCard.personality || '',
          scenario: roleCard.scenario || '',
          mes_example: roleCard.mes_example || '',
          data: {
            extensions: {
              regex_scripts: []
            }
          }
        },
        worldBook: {
          entries: Object.fromEntries(
            worldBookEntries
              .filter(entry => entry.name && entry.content)
              .map(entry => [
                entry.name,
                {
                  comment: entry.comment || '',
                  content: entry.content,
                  disable: entry.disable,
                  position: entry.position,
                  constant: entry.constant || false,
                  key: Array.isArray(entry.key) ? entry.key : [],
                  ...(entry.position === 4 ? { depth: entry.depth || 0 } : {}),
                  order: entry.order || 0,
                  vectorized: entry.vectorized || false
                }
              ])
          )
        },
        preset: {
          prompts: presetEntries.map(entry => ({
            name: entry.name,
            content: entry.content || '',
            identifier: entry.identifier,
            enable: entry.enable,
            role: entry.role,
            // Properly handle insertion type and depth
            ...(entry.insertType === 'chat' ? { 
              injection_position: 1,
              injection_depth: entry.depth || 0
            } : {})
          })),
          prompt_order: [{
            order: presetEntries
              .sort((a, b) => a.order - b.order)
              .map(entry => ({
                identifier: entry.identifier,
                enabled: entry.enable
              }))
          }]
        },
        authorNote: {
          charname: roleCard.name.trim(),
          username: user?.settings?.self.nickname || "User",
          content: authorNote.content || '',
          injection_depth: authorNote.injection_depth || 0
        },
        // 保存清理后的alternateGreetings
        alternateGreetings: cleanedAlternateGreetings.length > 0 ? cleanedAlternateGreetings : [cleanedFirstMes || 'Hello!']
      };
  
      // Build TTS configuration
      const ttsConfig: TTSConfig = {
        provider: ttsProvider,
        ...(ttsProvider === 'cosyvoice' && voiceTemplateId ? {
          cosyvoice: {
            templateId: voiceTemplateId,
            gender: voiceGender
          }
        } : {}),
        ...(ttsProvider === 'doubao' && selectedDouBaoVoice ? {
          doubao: {
            voiceType: selectedDouBaoVoice
          }
        } : {}),
        ...(ttsProvider === 'minimax' && selectedMinimaxVoice ? {
          minimax: {
            voiceId: selectedMinimaxVoice
          }
        } : {})
      };
      
      const cradleFields: Partial<CradleCharacter> = {
        inCradleSystem: true,
        cradleStatus: 'growing' as 'growing' | 'mature' | 'ready',
        cradleCreatedAt: Date.now(),
        cradleUpdatedAt: Date.now(),
        feedHistory: [],
        isDialogEditable: true,
        ...(positiveTags.length > 0 ? {
          generationData: {
            appearanceTags: {
              positive: positiveTags,
              negative: negativeTags,
              artistPrompt: selectedArtistPrompt || undefined
            }
          }
        } : {}),
        // --- 新增：保存 minimax/doubao/cosyvoice 的 voiceType 和 provider ---
        voiceType: ttsProvider === 'cosyvoice'
          ? voiceTemplateId
          : undefined,
        ttsConfig: ttsConfig
      };
  
      // 创建新角色对象 - include cradle fields
      const newCharacter: Character & Partial<CradleCharacter> = {
        id: characterId,
        name: roleCard.name.trim(),
        avatar: character.avatar, // 已持久化的uri
        backgroundImage: character.backgroundImage, // 已持久化的uri
        conversationId: characterId,
        description: roleCard.description || '',
        personality: roleCard.personality || '',
        interests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        jsonData: JSON.stringify(jsonData),
        // Add cradle-specific fields
        ...cradleFields,
        // 保存清理后的alternateGreetings
        extraGreetings: cleanedAlternateGreetings.length > 0 ? cleanedAlternateGreetings : undefined
      };
  
      console.log('[CreateChar] Saving character:', characterId);
      
      // 保存角色和创建会话 - FIXED: Use Promise.all to ensure both operations complete
      await Promise.all([
        addCharacter(newCharacter),
        addConversation({
          id: characterId,
          title: roleCard.name.trim()
        })
      ]);
  
      // 设置为当前会话
      await AsyncStorage.setItem('lastConversationId', characterId);
      
      // === 新增：自动导入 regexScripts 到 global-settings 的正则脚本组 ===
      if (Array.isArray(importedRegexScripts) && importedRegexScripts.length > 0 && roleCard.name?.trim()) {
        try {
          // 动态导入 global-settings 的 load/save
          const { loadGlobalSettingsState, saveGlobalSettingsState } = await import('./global-settings');
          const globalState = await loadGlobalSettingsState?.();
          if (globalState) {
            // 生成新脚本组
            const timestamp = Date.now();
            const newGroupId = `group_${timestamp}`;
            const newGroup = {
              id: newGroupId,
              name: roleCard.name.trim(),
              scripts: importedRegexScripts.map((script, idx) => ({
                ...script,
                id: script.id || `regex_${timestamp}_${idx}`,
                scriptName: script.scriptName || `正则脚本_${idx + 1}`,
                flags: script.flags ?? 'g'
              })),
              // 新增：自动绑定到当前角色
              bindType: 'character',
              bindCharacterId: characterId
            };
            // 合并到现有组
            const newGroups = Array.isArray(globalState.regexScriptGroups)
              ? [...globalState.regexScriptGroups, newGroup]
              : [newGroup];
            // 保存
            await saveGlobalSettingsState?.({
              ...globalState,
              regexScriptGroups: newGroups,
              selectedRegexGroupId: newGroupId,
            });
          }
        } catch (e) {
          console.warn('[CreateChar] 自动导入正则脚本到全局失败:', e);
        }
        // 清空 importedRegexScripts，避免重复导入
        setImportedRegexScripts(undefined);
      }
      
      // Reset states before navigation
      setIsSaving(false);
      setHasUnsavedChanges(false);

      // FIXED: Initialize NodeST BEFORE navigation and wait for it to complete
      console.log('[CreateChar] Initializing NodeST for new character...');
      await NodeSTManager.processChatMessage({
        userMessage: "你好！",
        conversationId: characterId,
        status: "新建角色",
        apiKey: user?.settings?.chat.characterApiKey || '',
        character: newCharacter
      }).catch(error => {
        console.warn('[CreateChar] NodeST initialization warning:', error);
        // Continue with navigation even if there was an error
      });
      
      console.log('[CreateChar] Character saved and initialized successfully, navigating...');
      
      // Modified: Check if onClose is provided (modal mode) or use router.replace()
      if (onClose) {
        onClose();
      } else {
        setTimeout(() => {
          router.replace({
            pathname: './(tabs)/',
            params: { characterId }
          });
        }, 300);
      }

      // Clear character data - moved to execute regardless of navigation method
      setTimeout(() => {
        setRoleCard({
          name: '',
          first_mes: '',
          description: '',
          personality: '',
          scenario: '',
          mes_example: '',
          data: {
            extensions: {
              regex_scripts: []
            }
          }
        });
        
        setCharacter({
          id: '',
          name: '',
          avatar: null,
          backgroundImage: null,
          conversationId: '',
          description: '',
          personality: '',
          interests: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          inCradleSystem: true,
          cradleStatus: 'growing',
          feedHistory: [],
          cradleCreatedAt: Date.now(),
          cradleUpdatedAt: Date.now(),
          voiceType: undefined
        });

        // Also reset other form state
        setWorldBookEntries([]);
        setPositiveTags([]);
        setNegativeTags([]);
        setSelectedArtistPrompt(null);
      }, 500);
  
    } catch (error) {
      console.error('[Error] Character creation failed:', error);
      Alert.alert(
        '保存失败', 
        `创建角色时出现错误：\n${error instanceof Error ? error.message : String(error)}`
      );
      setIsSaving(false);
    }
  };

  // 工具函数：移除未知标签
  function cleanUnknownTags(text: string): string {
    if (!text) return text;
    // 匹配所有<tag>和</tag>
    return text.replace(/<\/?([a-zA-Z0-9_:-]+)[^>]*>/g, (match, tag) => {
      if (KNOWN_TAGS.includes(tag)) return match;
      return '';
    });
  }

  // Add component initialization effect to clear data on mount
  useEffect(() => {
    // Only clear previous data if not in import mode
    const clearPreviousData = async () => {
      try {
        // Don't clear imported data here
        
        // Reset all state to default values if not in import mode
        if (creationMode !== 'import') {
          setRoleCard({
            name: '',
            first_mes: '',
            description: '',
            personality: '',
            scenario: '',
            mes_example: '',
            data: {
              extensions: {
                regex_scripts: []
              }
            }
          });
          
          setCharacter({
            id: '',
            name: '',
            avatar: null,
            backgroundImage: null,
            conversationId: '',
            description: '',
            personality: '',
            interests: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            inCradleSystem: true,
            cradleStatus: 'growing',
            feedHistory: [],
            cradleCreatedAt: Date.now(),
            cradleUpdatedAt: Date.now(),
            voiceType: undefined
          });
          
          setWorldBookEntries([]);
          setPositiveTags([]);
          setNegativeTags([]);
          setSelectedArtistPrompt(null);
        }
      } catch (error) {
        console.error('[Init] Failed to clear previous data:', error);
      }
    };
    
    clearPreviousData();
    
    return () => {
      // Ensure all modals are closed when component unmounts
      setShowConfirmDialog(false);
      setTagSelectorVisible(false);
      
      // Reset states to prevent them from persisting
      setIsSaving(false);
      setHasUnsavedChanges(false);
    };
  }, [creationMode]);

  // 加载导入数据时，处理alternateGreetings
  useEffect(() => {
    const loadImportedData = async () => {
      try {
        console.log('[CreateChar] Attempting to load imported data...');
        // 替换为文件读取
        let importData: string | null = null;
        try {
          importData = await FileSystem.readAsStringAsync(TEMP_IMPORT_DATA_FILE, { encoding: FileSystem.EncodingType.UTF8 });
        } catch (e) {
          importData = null;
        }
        if (importData) {
          console.log('[CreateChar] Found imported data, parsing...');
          const data = JSON.parse(importData);
          
          // Fill character data
          if (data.roleCard) {
            console.log('[CreateChar] Loading role card data:', data.roleCard.name);
            setRoleCard(data.roleCard);
            setCharacter(prev => ({
              ...prev,
              name: data.roleCard.name,
              avatar: data.avatar || null,
              // Set the backgroundImage from the imported PNG
              backgroundImage: data.backgroundImage || null
            }));
            
            // Also update author note with character name
            setAuthorNote(prev => ({
              ...prev,
              charname: data.roleCard.name
            }));
          }

          // Handle world book entries
          if (data.worldBook?.entries) {
            console.log('[CreateChar] Loading world book entries');
            setWorldBook(data.worldBook);
            
            const entries = Object.entries(data.worldBook.entries).map(([key, entry]: [string, any]) => {
              // 确保 position 是有效值（0-4），默认为 4
              const rawPosition = Number(entry.position);
              const position = (isNaN(rawPosition) || rawPosition < 0 || rawPosition > 4 ? 4 : rawPosition) as 0 | 1 | 2 | 3 | 4;

              const newEntry: WorldBookEntryUI = {
                id: key,
                name: entry.comment || key,
                comment: entry.comment || '',
                content: entry.content || '',
                disable: entry.disable, // Correctly use disable from import
                position,
                constant: !!entry.constant,
                order: entry.order || 0,
                vectorized: entry.vectorized || false,
                key: entry.key || [],
                depth: position === 4 ? (entry.depth || 0) : undefined
              };

              return newEntry;
            });
            
            setWorldBookEntries(entries);
          }

          // Handle preset entries - COMPLETELY REPLACE default presets
          if (data.preset?.prompts) {
            console.log('[CreateChar] Loading preset entries:', data.preset.prompts.length);
            const importedEntries = data.preset.prompts.map((prompt: any, index: number) => ({
              id: `imported_${index}`,
              name: prompt.name || '',
              content: prompt.content || '',
              identifier: prompt.identifier,
              isEditable: true,
              insertType: prompt.injection_position === 1 ? 
                INSERT_TYPE_OPTIONS.CHAT : 
                INSERT_TYPE_OPTIONS.RELATIVE,
              role: prompt.role || 'user',
              order: index,
              isDefault: false,
              enable: prompt.enable ?? true, // Correctly map enable property from import
              depth: prompt.injection_depth || 0
            }));
            
            // Only completely replace presets if replaceDefaultPreset is true
            if (data.replaceDefaultPreset) {
              setPresetEntries(importedEntries);
            } else {
              // Merge with existing presets logic could go here if needed
              setPresetEntries(importedEntries);
            }
          }

          // Handle author note
          if (data.authorNote) {
            console.log('[CreateChar] Loading author note');
            setAuthorNote(data.authorNote);
          }

          // 修复：导入alternateGreetings时，直接填充所有开场白
          let greetings: string[] = [];
          // 新增详细日志
          console.log('[CreateChar][DEBUG] data.alternateGreetings:', data.alternateGreetings);
          console.log('[CreateChar][DEBUG] data.data?.alternate_greetings:', data.data?.alternate_greetings);

          if (Array.isArray(data.alternateGreetings) && data.alternateGreetings.length > 0) {
            greetings = data.alternateGreetings;
          } else if (Array.isArray(data.data?.alternate_greetings) && data.data.alternate_greetings.length > 0) {
            greetings = data.data.alternate_greetings;
          } else if (data.roleCard?.first_mes) {
            greetings = [data.roleCard.first_mes];
          }
          if (greetings.length > 0) {
            // 新增：打印所有开场白内容
            console.log('[CreateChar][UI] Filling alternateGreetings from import (all greetings):', greetings);
            setAlternateGreetings(greetings);
            setSelectedGreetingIndex(0);
            setRoleCard(prev => {
              const updated = { ...prev, first_mes: greetings[0] || '' };
              console.log('[CreateChar][UI] setRoleCard for first_mes:', updated);
              return updated;
            });
            setTimeout(() => {
              console.log('[CreateChar][UI] After import, state:', {
                alternateGreetings: greetings,
                selectedGreetingIndex: 0,
                roleCardFirstMes: greetings[0] || ''
              });
            }, 100);
          }

          // 新增：捕获regexScripts字段
          if (Array.isArray(data.regexScripts)) {
            setImportedRegexScripts(data.regexScripts);
            console.log(`[CreateChar] 已捕获regexScripts，数量: ${data.regexScripts.length}，字段路径: data.regexScripts`);
          } else {
            setImportedRegexScripts(undefined);
            console.log('[CreateChar] 未捕获到regexScripts字段，字段路径: data.regexScripts');
          }

          // Only clear temporarily stored import data after successful load
          // Wait a bit before clearing to ensure all state updates have processed
          setTimeout(() => {
            FileSystem.deleteAsync(TEMP_IMPORT_DATA_FILE, { idempotent: true })
              .then(() => console.log('[CreateChar] Cleared temporary import data'))
              .catch(err => console.error('[CreateChar] Error clearing temp data:', err));
          }, 1000);
          
          // Flag that we have unsaved changes
          setHasUnsavedChanges(true);

          // --- Notify parent that import is ready ---
          if (onImportReady) {
            setTimeout(() => {
              onImportReady();
            }, 300); // Give a short delay to ensure UI is ready
          }
        } else {
          console.log('[CreateChar] No imported data found');
          // If no import data, still notify parent to hide loading
          if (onImportReady) {
            setTimeout(() => {
              onImportReady();
            }, 100);
          }
        }
      } catch (error) {
        console.error('[CreateChar] 加载导入数据失败:', error);
        Alert.alert('导入失败', '无法加载导入的数据');
        // Hide loading even on error
        if (onImportReady) {
          setTimeout(() => {
            onImportReady();
          }, 100);
        }
      }
    };

    // Load imported data when the component mounts or when creation mode changes
    if (creationMode === 'import') {
      loadImportedData();
    }
  }, []);

  // Track changes to set hasUnsavedChanges flag
  useEffect(() => {
    const hasContent = roleCard.name || roleCard.first_mes || roleCard.description || 
                      roleCard.personality || roleCard.scenario || roleCard.mes_example ||
                      worldBookEntries.length > 0 || authorNote.content;
    
    // Only consider it unsaved if there's actual content
    setHasUnsavedChanges(!!hasContent);
  }, [
    roleCard.name, roleCard.first_mes, roleCard.description, roleCard.personality,
    roleCard.scenario, roleCard.mes_example, worldBookEntries, authorNote.content,
    character.avatar, character.backgroundImage
  ]);

  // Add a new function for preset import
  const handleImportPreset = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });
  
      if (!result.assets || !result.assets[0]) {
        return;
      }
  
      console.log('[Preset Import] File selected:', result.assets[0].name);
      
      try {
        const fileUri = result.assets[0].uri;
        const cacheUri = `${FileSystem.cacheDirectory}${result.assets[0].name}`;
        
        await FileSystem.copyAsync({
          from: fileUri,
          to: cacheUri
        });
  
        const presetJson = await CharacterImporter.importPresetForCharacter(cacheUri, 'temp');
        
        if (presetJson && presetJson.prompts) {
          // Fix: Explicitly type the insertType to match the PresetEntryUI interface
          const importedEntries: PresetEntryUI[] = presetJson.prompts.map((prompt: any, index: number) => ({
            id: `imported_${index}`,
            name: prompt.name || '',
            content: prompt.content || '',
            identifier: prompt.identifier,
            isEditable: true,
            insertType: prompt.injection_position === 1 ? 
              INSERT_TYPE_OPTIONS.CHAT : 
              INSERT_TYPE_OPTIONS.RELATIVE,
            role: prompt.role || 'user',
            order: index,
            isDefault: false,
            enable: prompt.enable ?? true,
            depth: prompt.injection_depth || 0
          }));
          
          setPresetEntries(importedEntries);
          
          Alert.alert('成功', '预设导入成功');
          setHasUnsavedChanges(true);
        }
      } catch (error) {
        console.error('[Preset Import] Error:', error);
        Alert.alert('导入失败', error instanceof Error ? error.message : '未知错误');
      }
    } catch (error) {
      console.error('[Preset Import] Document picker error:', error);
      Alert.alert('错误', '选择文件失败');
    }
  };

  // Enhance the tag-based image section with more feedback about tag storage
  const renderTagGenerationSection = () => (
    <View style={styles.tagGenerateContainer}>
      <Text style={styles.tagInstructionsText}>
        请选择描述角色外观的正面和负面标签，这些标签将被保存作为角色描述的一部分
      </Text>
      
      {/* Update note about cradle system integration */}
      <View style={styles.cradleInfoContainer}>
        <Ionicons name="information-circle-outline" size={20} color={theme.colors.info} />
        <Text style={styles.cradleInfoText}>
          选择的标签将保存为角色的外观描述数据，但不会自动生成图像
        </Text>
      </View>

      {/* 已选画师风格区域 */}
      {selectedArtistPrompt ? (
        <View style={styles.selectedArtistPromptContainer}>
          <Text style={styles.selectedArtistPromptLabel}>已选画师风格：</Text>
          <View style={styles.selectedArtistPromptRow}>
            <Text style={styles.selectedArtistPromptText} numberOfLines={1}>
              {selectedArtistPrompt}
            </Text>
            <TouchableOpacity
              style={styles.clearArtistPromptButton}
              onPress={() => setSelectedArtistPrompt(null)}
            >
              <Ionicons name="close-circle" size={18} color="#aaa" />
              <Text style={styles.clearArtistPromptText}>清除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* ArtistReferenceSelector 入口按钮 */}
      <TouchableOpacity
        style={styles.openTagSelectorButton}
        onPress={() => setArtistSelectorVisible(true)}
      >
        <Ionicons name="color-palette-outline" size={20} color="#fff" />
        <Text style={styles.openTagSelectorText}>
          选择画师风格（可选）
        </Text>
      </TouchableOpacity>
      
      {/* Tag selection summary */}
      <View style={styles.tagSummaryContainer}>
        <Text style={styles.tagSummaryTitle}>已选标签</Text>
        <View style={styles.selectedTagsRow}>
          {positiveTags.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {positiveTags.map((tag, index) => (
                <TouchableOpacity
                  key={`pos-${index}`}
                  style={styles.selectedPositiveTag}
                  onPress={() => {
                    setPositiveTags(tags => tags.filter(t => t !== tag));
                  }}
                >
                  <Text style={styles.selectedTagText} numberOfLines={1}>{tag}</Text>
                  <Ionicons name="close-circle" size={14} color="rgba(0,0,0,0.5)" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.noTagsSelectedText}>未选择正面标签</Text>
          )}
        </View>
        
        <View style={styles.selectedTagsRow}>
          {negativeTags.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {negativeTags.map((tag, index) => (
                <TouchableOpacity
                  key={`neg-${index}`}
                  style={styles.selectedNegativeTag}
                  onPress={() => {
                    setNegativeTags(tags => tags.filter(t => t !== tag));
                  }}
                >
                  <Text style={styles.selectedTagText} numberOfLines={1}>{tag}</Text>
                  <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.noTagsSelectedText}>未选择负面标签</Text>
          )}
        </View>
        
        {/* Add hint for tag use */}
        <Text style={styles.defaultTagsInfo}>
          选择的标签仅用于保存角色外观描述，不会触发图像生成
        </Text>
      </View>
      
      {/* Open tag selector button */}
      <TouchableOpacity 
        style={styles.openTagSelectorButton}
        onPress={() => setTagSelectorVisible(true)}
      >
        <Ionicons name="pricetag-outline" size={20} color="#fff" />
        <Text style={styles.openTagSelectorText}>浏览标签并添加</Text>
      </TouchableOpacity>

      {/* ArtistReferenceSelector Modal */}
      <Modal
        visible={artistSelectorVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setArtistSelectorVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#222' }}>
          <View style={styles.tagSelectorHeader}>
            <Text style={styles.tagSelectorTitle}>选择画师风格</Text>
            <TouchableOpacity 
              style={styles.tagSelectorCloseButton}
              onPress={() => setArtistSelectorVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ArtistReferenceSelector
            selectedGender={character.gender as 'male' | 'female' | 'other'}
            onSelectArtist={prompt => {
              setSelectedArtistPrompt(prompt || null);
              setArtistSelectorVisible(false);
            }}
            selectedArtistPrompt={selectedArtistPrompt}
          />
        </View>
      </Modal>
    </View>
  );

  // --- 新增 Minimax 标签页内容 ---
  // 调整 renderVoiceSection UI 以对齐 character-detail
  const renderVoiceSection = () => (
    <View style={styles.tabContent}>
      {/* TTS Provider Selection */}
      <View style={styles.ttsProviderSelection}>
        <TouchableOpacity
          style={[
            styles.ttsProviderButton,
            ttsProvider === 'cosyvoice' && styles.activeTtsProvider
          ]}
          onPress={() => setTtsProvider('cosyvoice')}
        >
          <Text style={[
            styles.ttsProviderText,
            ttsProvider === 'cosyvoice' && styles.activeTtsProviderText
          ]}>
            CosyVoice
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.ttsProviderButton,
            ttsProvider === 'doubao' && styles.activeTtsProvider
          ]}
          onPress={() => setTtsProvider('doubao')}
        >
          <Text style={[
            styles.ttsProviderText,
            ttsProvider === 'doubao' && styles.activeTtsProviderText
          ]}>
            豆包TTS
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.ttsProviderButton,
            ttsProvider === 'minimax' && styles.activeTtsProvider
          ]}
          onPress={() => setTtsProvider('minimax')}
        >
          <Text style={[
            styles.ttsProviderText,
            ttsProvider === 'minimax' && styles.activeTtsProviderText
          ]}>
            Minimax
          </Text>
        </TouchableOpacity>
      </View>

      {/* Provider-specific content */}
      {ttsProvider === 'cosyvoice' ? (
        <VoiceSelector
          selectedGender={voiceGender}
          selectedTemplate={voiceTemplateId || null}
          onSelectGender={(gender) => {
            setVoiceGender(gender);
            setHasUnsavedChanges(true);
          }}
          onSelectTemplate={(templateId) => {
            setVoiceTemplateId(templateId);
            setHasUnsavedChanges(true);
          }}
        />
      ) : ttsProvider === 'doubao' ? (
        <View style={styles.voiceProviderContent}>
          {selectedDouBaoVoice ? (
            <View style={styles.selectedVoiceContainer}>
              <Text style={styles.selectedVoiceLabel}>已选择豆包音色</Text>
              <View style={styles.selectedVoiceInfo}>
                <Text style={styles.selectedVoiceText}>
                  {selectedDouBaoVoice}
                </Text>
                <TouchableOpacity
                  style={styles.changeVoiceButton}
                  onPress={() => setDouBaoSelectorVisible(true)}
                >
                  <Text style={styles.changeVoiceText}>更换</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noVoiceContainer}>
              <Text style={styles.noVoiceText}>未选择豆包音色</Text>
              <TouchableOpacity
                style={styles.selectVoiceButton}
                onPress={() => setDouBaoSelectorVisible(true)}
              >
                <Ionicons name="musical-notes-outline" size={20} color={theme.colors.black} />
                <Text style={styles.selectVoiceText}>选择音色</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.voiceProviderContent}>
          {selectedMinimaxVoice ? (
            <View style={styles.selectedVoiceContainer}>
              <Text style={styles.selectedVoiceLabel}>已选择Minimax音色</Text>
              <View style={styles.selectedVoiceInfo}>
                <Text style={styles.selectedVoiceText}>
                  {selectedMinimaxVoice}
                </Text>
                <TouchableOpacity
                  style={styles.changeVoiceButton}
                  onPress={() => setMinimaxSelectorVisible(true)}
                >
                  <Text style={styles.changeVoiceText}>更换</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noVoiceContainer}>
              <Text style={styles.noVoiceText}>未选择Minimax音色</Text>
              <TouchableOpacity
                style={styles.selectVoiceButton}
                onPress={() => setMinimaxSelectorVisible(true)}
              >
                <Ionicons name="musical-notes-outline" size={20} color={theme.colors.black} />
                <Text style={styles.selectVoiceText}>选择音色</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* DouBao Voice Selector Modal */}
      <DouBaoTTSSelector
        visible={douBaoSelectorVisible}
        selectedVoice={selectedDouBaoVoice}
        onSelectVoice={(voiceType) => {
          setSelectedDouBaoVoice(voiceType);
          setHasUnsavedChanges(true);
        }}
        onClose={() => setDouBaoSelectorVisible(false)}
      />

      {/* Minimax Voice Selector Modal */}
      <MinimaxTTSSelector
        visible={minimaxSelectorVisible}
        selectedVoice={selectedMinimaxVoice}
        onSelectVoice={(voiceId) => {
          setSelectedMinimaxVoice(voiceId);
          setHasUnsavedChanges(true);
        }}
        onClose={() => setMinimaxSelectorVisible(false)}
      />
    </View>
  );

  // Update the renderContent function to include the voice tab
  const renderContent = () => {
    if (activeTab === 'basic') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>角色外观</Text>
          
          {/* Mode selection with improved styling to match CradleCreateForm */}
          <View style={styles.modeSelectionContainer}>
            <TouchableOpacity 
              style={[styles.modeButton, uploadMode === 'upload' && styles.activeMode]}
              onPress={() => setUploadMode('upload')}
            >
              <View style={styles.modeIconContainer}>
                <Ionicons 
                  name="cloud-upload-outline" 
                  size={24} 
                  color={uploadMode === 'upload' ? theme.colors.primary : "#888"}
                />
              </View>
              <View style={styles.modeTextContainer}>
                <Text style={[styles.modeText, uploadMode === 'upload' && styles.activeModeText]}>
                  自己上传图片
                </Text>
                <Text style={styles.modeDescription}>
                  上传您准备好的角色形象图片
                </Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modeButton, uploadMode === 'generate' && styles.activeMode]}
              onPress={() => setUploadMode('generate')}
            >
              <View style={styles.modeIconContainer}>
                <Ionicons 
                  name="color-wand-outline" 
                  size={24} 
                  color={uploadMode === 'generate' ? theme.colors.primary : "#888"} 
                />
              </View>
              <View style={styles.modeTextContainer}>
                <Text style={[styles.modeText, uploadMode === 'generate' && styles.activeModeText]}>
                  根据Tag生成图片
                </Text>
                <Text style={styles.modeDescription}>
                  通过组合标签生成符合需求的角色形象
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          
          {/* Render content based on selected mode */}
          {uploadMode === 'upload' ? (
            <View style={styles.uploadContainer}>
              <View style={styles.cardPreviewSection}>
                <Text style={styles.inputLabel}>角色卡图片 (9:16)</Text>
                <View style={styles.cardImageContainer}>
                  <TouchableOpacity
                    style={styles.cardImagePicker}
                    onPress={pickBackgroundImage}
                  >
                    {character.backgroundImage ? (
                      <Image
                        source={{
                          uri:
                            typeof character.backgroundImage === 'string'
                              ? character.backgroundImage
                              : character.backgroundImage?.localUri ||
                                character.backgroundImage?.url ||
                                ''
                        }}
                        style={styles.cardImagePreview}
                      />
                    ) : (
                      <>
                        <Ionicons name="card-outline" size={40} color="#aaa" />
                        <Text style={styles.imageButtonText}>添加角色卡图片</Text>
                        <Text style={styles.imageButtonSubtext}>(9:16比例)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                
                <View style={styles.imageSeparator}>
                  <View style={styles.imageSeparatorLine} />
                  <Text style={styles.imageSeparatorText}>或</Text>
                  <View style={styles.imageSeparatorLine} />
                </View>
                
                {/* Avatar selection */}
                <Text style={styles.inputLabel}>头像图片 (方形)</Text>
                <View style={styles.imageSelectionContainer}>
                  <TouchableOpacity
                    style={styles.avatarButton}
                    onPress={pickAvatar}
                  >
                    {character.avatar ? (
                      <Image
                        source={{
                          uri:
                            typeof character.avatar === 'string'
                              ? character.avatar
                              :                                 ''
                        }}
                        style={styles.avatarPreview}
                      />
                    ) : (
                      <>
                        <Ionicons name="person-circle-outline" size={40} color="#aaa" />
                        <Text style={styles.imageButtonText}>添加头像</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            renderTagGenerationSection()
          )}

          {/* Tag selector modal */}
          <Modal
            visible={tagSelectorVisible}
            transparent={false}
            animationType="slide"
            onRequestClose={() => setTagSelectorVisible(false)}
          >
            <View style={styles.tagSelectorModalContainer}>
              <View style={styles.tagSelectorHeader}>
                <Text style={styles.tagSelectorTitle}>选择标签</Text>
                <TouchableOpacity 
                  style={styles.tagSelectorCloseButton}
                  onPress={() => setTagSelectorVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.tagSelectorContent}>
                <TagSelector 
                  onClose={() => setTagSelectorVisible(false)}
                  onAddPositive={(tag) => setPositiveTags(prev => [...prev, tag])}
                  onAddNegative={(tag) => setNegativeTags(prev => [...prev, tag])}
                  existingPositiveTags={positiveTags}
                  existingNegativeTags={negativeTags}
                  onPositiveTagsChange={setPositiveTags}
                  onNegativeTagsChange={setNegativeTags}
                  sidebarWidth="auto"
                />
              </View>
            </View>
          </Modal>
        </View>
      );
    } else if (activeTab === 'voice') {
      return renderVoiceSection();
    } else {
      return (
        <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 80 }}>
          {/* Character basic information section */}
          <Text style={styles.sectionTitle}>角色信息</Text>
          <CharacterAttributeEditor
            title="名称"
            value={roleCard.name || ''}
            onChangeText={(text) => handleRoleCardChange('name', text)}
            placeholder="角色名称..."
          />
          
          <View style={styles.greetingsContainer}>
            <View style={styles.greetingsHeader}>
              <Text style={styles.greetingsTitle}>开场白</Text>
              <View style={styles.greetingsActions}>
                <TouchableOpacity 
                  style={styles.greetingActionButton}
                  onPress={handleAddGreeting}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#FFD700" />
                  <Text style={styles.greetingActionText}>添加</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.greetingActionButton, 
                    alternateGreetings.length <= 1 && styles.disabledButton
                  ]}
                  onPress={handleDeleteGreeting}
                  disabled={alternateGreetings.length <= 1}
                >
                  <Ionicons name="trash-outline" size={20} color={alternateGreetings.length <= 1 ? "#666" : "#ff6666"} />
                  <Text style={[styles.greetingActionText, alternateGreetings.length <= 1 && styles.disabledText]}>删除</Text>
                </TouchableOpacity>
              </View>
            </View>
            <CharacterAttributeEditor
              title={`开场白 #${selectedGreetingIndex + 1}`}
              value={roleCard.first_mes || ''}
              onChangeText={(text) => handleRoleCardChange('first_mes', text)}
              placeholder="角色与用户的第一次对话内容..."
              style={styles.attributeSection}
              alternateGreetings={alternateGreetings}
              selectedGreetingIndex={selectedGreetingIndex}
              onSelectGreeting={handleSelectGreeting}
            />
          </View>
          
          <CharacterAttributeEditor
            title="角色描述"
            value={roleCard.description || ''}
            onChangeText={(text) => handleRoleCardChange('description', text)}
            placeholder="描述角色的外表、背景等基本信息..."
            style={styles.attributeSection}
          />
          
          <CharacterAttributeEditor
            title="性格特征"
            value={roleCard.personality || ''}
            onChangeText={(text) => handleRoleCardChange('personality', text)}
            placeholder="描述角色的性格、习惯、喜好等..."
            style={styles.attributeSection}
          />
          
          <CharacterAttributeEditor
            title="场景设定"
            value={roleCard.scenario || ''}
            onChangeText={(text) => handleRoleCardChange('scenario', text)}
            placeholder="描述角色所在的环境、情境..."
            style={styles.attributeSection}
          />
          
          <CharacterAttributeEditor
            title="对话示例"
            value={roleCard.mes_example || ''}
            onChangeText={(text) => handleRoleCardChange('mes_example', text)}
            placeholder="提供一些角色对话的范例..."
            style={styles.attributeSection}
          />

          <WorldBookSection
            entries={worldBookEntries}
            onAdd={handleAddWorldBookEntry}
            onUpdate={handleUpdateWorldBookEntry}
            onViewDetail={handleViewDetail}
            onReorder={handleReorderWorldBook}
            onDelete={handleDeleteWorldBookEntry}
          />
          
          {/* 新增：世界书导入按钮和原有预设导入按钮 */}
          <View style={styles.presetSectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={[styles.importPresetButton, { marginRight: 8 }]}
                onPress={handleImportWorldBook}
              >
                <Ionicons name="book-outline" size={16} color="#FFD700" />
                <Text style={styles.importPresetText}>导入世界书</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.importPresetButton}
                onPress={handleImportPreset}
              >
                <Ionicons name="cloud-download-outline" size={16} color="#FFD700" />
                <Text style={styles.importPresetText}>导入预设</Text>
              </TouchableOpacity>
            </View>
          </View>
          <PresetSection
            entries={presetEntries}
            onAdd={handleAddPresetEntry}
            onUpdate={handleUpdatePresetEntry}
            onMove={handleMoveEntry}
            onViewDetail={handleViewDetail}
            onReorder={handleReorderPresets}
            onDelete={handleDeletePresetEntry}
          />
          
          <AuthorNoteSection
            content={authorNote.content || ''}
            injection_depth={authorNote.injection_depth || 0}
            onUpdateContent={(content) => {
              setAuthorNote(prev => ({ ...prev, content }));
              setHasUnsavedChanges(true);
            }}
            onUpdateDepth={(depth) => {
              setAuthorNote(prev => ({ ...prev, injection_depth: depth }));
              setHasUnsavedChanges(true);
            }}
            onViewDetail={handleViewDetail}
          />
        </ScrollView>
      );
    }
  };

  // --- 样式调整 ---
  // 替换/新增部分样式，参考 character-detail 页面
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: theme.colors.background,
    },
    sidebarContainer: {
      width: 70,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRightWidth: 1,
      borderRightColor: 'rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 8,
    },
    sidebarNavItems: {
      flex: 1,
    },
    sidebarItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      marginBottom: 8,
      borderRadius: 8,
      borderLeftWidth: 2,
      borderLeftColor: 'transparent',
    },
    activeSidebarItem: {
      backgroundColor: 'rgba(255, 224, 195, 0.1)',
      borderLeftColor: theme.colors.primary,
    },
    sidebarItemText: {
      color: theme.colors.textSecondary,
      marginLeft: 8,
      fontSize: 13,
    },
    activeSidebarItemText: {
      color: theme.colors.primary,
    },
    sidebarSaveButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.colors.primaryDark,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      alignSelf: 'center',
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      flexGrow: 1, // 保证内容撑满
      paddingBottom: 80,
    },
    tabContent: {
      flex: 1, // 关键：让tab内容区撑满剩余空间
      padding: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 16,
    },
    uploadContainer: {
      flex: 1,
      alignItems: 'center',
      padding: 16,
    },
    cardPreviewSection: {
      alignItems: 'center',
      width: '100%',
      marginBottom: 20,
    },
    // Avatar, card image, and image selection styles
    imageSelectionContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginVertical: 16, 
    },
    avatarButton: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
    },
    avatarPreview: {
      width: '100%',
      height: '100%',
      borderRadius: 60,
    },
    cardImageContainer: {
      width: 120,
      height: 200,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardImagePicker: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardImagePreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    imageButtonText: {
      color: theme.colors.textSecondary,
      marginTop: 8,
      fontSize: 12,
      textAlign: 'center',
    },
    imageButtonSubtext: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    imageSeparator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
      width: '100%',
    },
    imageSeparatorLine: {
      flex: 1,
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    imageSeparatorText: {
      color: theme.colors.textSecondary,
      marginHorizontal: 8,
    },
    inputLabel: {
      color: theme.colors.text,
      fontSize: 16,
      marginBottom: 8,
    },
    // Mode selection styles to match CradleCreateForm
    modeSelectionContainer: {
      marginBottom: 16,
    },
    modeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    activeMode: {
      backgroundColor: 'rgba(255, 224, 195, 0.1)',
      borderColor: theme.colors.primary,
    },
    modeIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    modeTextContainer: {
      flex: 1,
    },
    modeText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
    },
    activeModeText: {
      color: theme.colors.primary,
    },
    modeDescription: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    // Tag generation styles to match CradleCreateForm
    tagGenerateContainer: {
      flex: 1,
      padding: 16,
    },
    tagInstructionsText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginBottom: 16,
    },
    tagSummaryContainer: {
      backgroundColor: theme.colors.cardBackground,
      borderRadius: 8,
      padding: 12,
      marginVertical: 16,
    },
    tagSummaryTitle: {
      color: theme.colors.text,
      fontSize: 16,
      marginBottom: 8,
    },
    selectedTagsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 36,
      marginBottom: 8,
    },
    selectedPositiveTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 16,
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginRight: 8,
    },
    selectedNegativeTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.danger,
      borderRadius: 16,
      paddingVertical: 4,
      paddingHorizontal: 8,
           marginRight: 8,
    },
    selectedTagText: {
      fontSize: 12,
      marginRight: 4,
      maxWidth: 100,
      color: theme.colors.black, // For positive tags with light background
    },
    noTagsSelectedText: {
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
    },
    defaultTagsInfo: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontStyle: 'italic',
      marginTop: 8,
      textAlign: 'center',
    },
    openTagSelectorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primaryDark,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
    },
    openTagSelectorText: {
      fontWeight: '500',
    },
    // Tag selector modal styles
    tagSelectorModalContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    tagSelectorHeader: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
      backgroundColor: theme.colors.cardBackground,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
      position: 'relative',
      paddingTop: Platform.OS === 'ios' ? 44 : 16,
    },
    tagSelectorTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: 'bold',
    },
    tagSelectorCloseButton: {
      position: 'absolute',
      right: 16,
      top: Platform.OS === 'ios' ? 44 : 16,
      padding: 4,
    },
    tagSelectorContent: {
      flex: 1,
    },
    // Add styles for the cradle info container
    cradleInfoContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
      padding: 12,
      borderRadius: 8,
      marginTop: 16,
    },
    cradleInfoText: {
      flex: 1,
      color: theme.colors.info,
      fontSize: 13,
      marginLeft: 8,
      lineHeight: 18,
    },
    attributeSection: {
      marginTop: 16,
    },
    presetSectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    importPresetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(224, 196, 168, 0.2)', // Updated to use primaryDark with opacity
    },
    importPresetText: {
      color: theme.colors.primary, // Updated to use theme colors
      marginLeft: 4,
      fontSize: 12,
    },
    greetingsContainer: {
      marginTop: 16,
    },
    greetingsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    greetingsTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    greetingsActions: {
      flexDirection: 'row',
    },
    greetingActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 8,
      padding: 4,
      borderRadius: 4,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    greetingActionText: {
      marginLeft: 4,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    disabledButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    disabledText: {
      color: '#666',
    },
    selectedArtistPromptContainer: {
      backgroundColor: '#333',
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
      marginTop: 4,
    },
    selectedArtistPromptLabel: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      marginBottom: 4,
    },
    selectedArtistPromptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectedArtistPromptText: {
      color: '#FFD700',
      fontSize: 14,
      flex: 1,
      marginRight: 8,
    },
    clearArtistPromptButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    clearArtistPromptText: {
      color: '#aaa',
      fontSize: 12,
      marginLeft: 2,
    },
    // Add TTS provider selection styles
    ttsProviderSelection: {
      flexDirection: 'row',
      marginBottom: 20,
      backgroundColor: '#1a1a1a',
      borderRadius: 12,
      padding: 6,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    ttsProviderButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginHorizontal: 2,
    },
    activeTtsProvider: {
      backgroundColor: theme.colors.primary,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    ttsProviderText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: '600',
    },
    activeTtsProviderText: {
      color: theme.colors.black,
      fontWeight: '700',
    },
    voiceProviderContent: {
      flex: 1,
      marginTop: 8,
    },
    selectedVoiceContainer: {
      backgroundColor: '#2a2a2a',
      borderRadius: 12,
      padding: 20,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    selectedVoiceLabel: {
      fontSize: 16,
      color: theme.colors.primary,
      marginBottom: 12,
      fontWeight: '600',
    },
    selectedVoiceInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    selectedVoiceText: {
      fontSize: 18,
      color: '#ffffff',
      fontWeight: '600',
      flex: 1,
    },
    changeVoiceButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    changeVoiceText: {
      color: theme.colors.black,
      fontSize: 15,
      fontWeight: '700',
    },
    noVoiceContainer: {
      backgroundColor: '#2a2a2a',
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.3)',
      borderStyle: 'dashed',
    },
    noVoiceText: {
      fontSize: 12,
      color: '#ffffff',
      marginBottom: 20,
      textAlign: 'center',
      fontWeight: '500',
    },
    selectVoiceButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 10,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 5,
    },
    selectVoiceText: {
      color: theme.colors.black,
      fontSize: 12,
      fontWeight: '700',
      marginLeft: 8,
    },
  });

  // For embedded usage in tabs, we'll now use the sidebar pattern similar to CradleCreateForm
  return (
    <View style={styles.container}>
      <View style={styles.sidebarContainer}>
        {/* Sidebar Navigation Items */}
        <View style={styles.sidebarNavItems}>
          <TouchableOpacity 
            style={[
              styles.sidebarItem,
              activeTab === 'basic' && styles.activeSidebarItem
            ]}
            onPress={() => setActiveTab('basic')}
          >
            <Ionicons 
              name="image-outline"
              size={24} 
              color={activeTab === 'basic' ? theme.colors.primary : theme.colors.textSecondary} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.sidebarItem,
              activeTab === 'advanced' && styles.activeSidebarItem
            ]}
            onPress={() => setActiveTab('advanced')}
          >
            <Ionicons 
              name="person-outline"
              size={24} 
              color={activeTab === 'advanced' ? theme.colors.primary : theme.colors.textSecondary} 
            />
          </TouchableOpacity>
          
          {/* Add new Voice tab */}
          <TouchableOpacity 
            style={[
              styles.sidebarItem,
              activeTab === 'voice' && styles.activeSidebarItem
            ]}
            onPress={() => setActiveTab('voice')}
          >
            <Ionicons 
              name="mic-outline"
              size={24} 
              color={activeTab === 'voice' ? theme.colors.primary : theme.colors.textSecondary} 
            />
          </TouchableOpacity>
        </View>
        
        {/* Save button in sidebar style */}
        <TouchableOpacity
          style={styles.sidebarSaveButton}
          onPress={saveCharacter}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={theme.colors.black} />
          ) : (
            <Ionicons name="save-outline" size={18} color={theme.colors.black} />
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.content}>
        {renderContent()}
      </View>
      
      {/* Detail Sidebar for expanded editing */}
      <DetailSidebar
        isVisible={!!selectedField}
        onClose={() => setSelectedField(null)}
        title={selectedField?.title || ''}
        content={selectedField?.content || ''}
        onContentChange={selectedField?.onContentChange}
        editable={selectedField?.editable}
        entryType={selectedField?.entryType}
        entryOptions={selectedField?.entryOptions}
        onOptionsChange={selectedField?.onOptionsChange}
        name={selectedField?.name}
        onNameChange={selectedField?.onNameChange}
        onDelete={selectedField?.id && selectedField.entryType ? 
          () => {
            if (selectedField.entryType === 'worldbook' && selectedField.id) {
              handleDeleteWorldBookEntry(selectedField.id);
            } else if (selectedField.entryType === 'preset' && selectedField.id) {
              handleDeletePresetEntry(selectedField.id);
            }
          } : undefined
        }
      />
      
      {/* Confirm Dialog */}
      <ConfirmDialog
        visible={showConfirmDialog}
        title="放弃更改"
        message="您有未保存的更改，确定要离开吗？"
        confirmText="放弃更改"
        cancelText="继续编辑"
        confirmAction={() => {
          setShowConfirmDialog(false);
          router.back();
        }}
        cancelAction={() => setShowConfirmDialog(false)}
        destructive={true}
        icon="alert-circle-outline"
      />
    </View>
  );
};

export default CreateChar;

