import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  StyleSheet,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Character, CradleCharacter } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { CharacterImporter } from '@/utils/CharacterImporter';
import { 
  RoleCardJson, 
  WorldBookEntry, 
  AuthorNoteJson,
} from '@/shared/types';
import { WorldBookEntryUI, PresetEntryUI } from '@/constants/types';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/theme';
import CharacterDetailHeader from '@/components/character/CharacterDetailHeader';
import CharacterAttributeEditor from '@/components/character/CharacterAttributeEditor';
import LoadingIndicator from '@/components/LoadingIndicator';
import ConfirmDialog from '@/components/ConfirmDialog';
import ActionButton from '@/components/ActionButton';
import DetailSidebar from '@/components/character/DetailSidebar';
import { Ionicons } from '@expo/vector-icons';
import TagSelector from '@/components/TagSelector';
import ArtistReferenceSelector from '@/components/ArtistReferenceSelector';
import VoiceSelector from '@/components/VoiceSelector';
import TextEditorModal from '@/components/common/TextEditorModal';
import DouBaoTTSSelector from '@/components/DouBaoTTSSelector';
import MinimaxTTSSelector from '@/components/MinimaxTTSSelector';
import { TTSProvider, TTSConfig } from '@/shared/types';
import { 
  WorldBookSection,
  PresetSection,
  AuthorNoteSection
} from '@/components/character/CharacterSections';
import { KNOWN_TAGS } from '@/app/data/knowntags';

export const DEFAULT_PRESET_ENTRIES = {
  EDITABLE: [
    { 
      id: "main", 
      name: "Main", 
      identifier: "main",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: true,
      insertType: 'relative' as 'relative' | 'chat',
      order: 0,
      isDefault: true,
      depth: 0
    },
    { 
      id: "enhance_def", 
      name: "Enhance Definitions", 
      identifier: "enhanceDefinitions",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: true,
      insertType: 'chat' as 'relative' | 'chat',
      order: 1,
      isDefault: true,
      depth: 3,
      injection_position: 1,
      injection_depth: 3
    },
    { 
      id: "aux_prompt", 
      name: "Auxiliary Prompt", 
      identifier: "nsfw", 
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: true,
      insertType: 'relative' as 'relative' | 'chat',
      order: 2,
      isDefault: true,
      depth: 0
    },
    { 
      id: "post_hist", 
      name: "Post-History Instructions", 
      identifier: "jailbreak",
      content: "", 
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: true,
      insertType: 'relative' as 'relative' | 'chat',
      order: 3,
      isDefault: true,
      depth: 0
    }
  ],

  FIXED: [
    {
      id: "world_before",
      name: "World Info (before)",
      identifier: "worldInfoBefore",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 4,
      isDefault: true,
      depth: 0
    },
    { 
      id: "char_desc", 
      name: "Char Description", 
      identifier: "charDescription",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 5,
      isDefault: true,
      depth: 0
    },
    { 
      id: "char_pers", 
      name: "Char Personality", 
      identifier: "charPersonality",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 6,
      isDefault: true,
      depth: 0
    },
    { 
      id: "scenario", 
      name: "Scenario", 
      identifier: "scenario",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 7,
      isDefault: true,
      depth: 0
    },
    { 
      id: "world_after", 
      name: "World Info (after)", 
      identifier: "worldInfoAfter",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 8,
      isDefault: true,
      depth: 0
    },
    { 
      id: "chat_ex", 
      name: "Chat Examples", 
      identifier: "dialogueExamples",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 9,
      isDefault: true,
      depth: 0
    },
    { 
      id: "chat_hist", 
      name: "Chat History", 
      identifier: "chatHistory",
      content: "",
      enable: true,
      role: "user" as 'user' | 'model',
      isEditable: false,
      insertType: 'relative' as 'relative' | 'chat',
      order: 10,
      isDefault: true,
      depth: 0
    }
  ]
};


export async function updateAuthorNoteDataForCharacter(
  character: Character,
  authorNoteData: Partial<AuthorNoteJson>,
  userNickname: string
): Promise<{ success: boolean; error?: string }> {
  if (!character || !character.id) {
    return { success: false, error: '角色不存在' };
  }
  try {
    // 解析原始jsonData
    const jsonData = character.jsonData ? JSON.parse(character.jsonData) : {};
    // 只更新authorNote部分
    jsonData.authorNote = {
      ...jsonData.authorNote,
      ...authorNoteData,
      username: userNickname || 'User',
      charname: character.name,
    };
    // 构造新的character对象
    const updatedCharacter: Character = {
      ...character,
      jsonData: JSON.stringify(jsonData),
    };
    // 调用NodeSTManager的“更新人设”方法，仅更新authorNote
    const apiKey = ''; // 可根据实际情况获取apiKey
    const apiSettings = undefined; // 可根据实际情况传递apiSettings
    const result = await NodeSTManager.processChatMessage({
      userMessage: '',
      status: '更新人设',
      conversationId: character.id,
      apiKey,
      apiSettings,
      character: updatedCharacter,
    });
    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const CharacterDetail: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { characters, updateCharacter } = useCharacters();
  const { user } = useUser();
  // Replace voice-related state with unified TTS config
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('cosyvoice');
  const [selectedDouBaoVoice, setSelectedDouBaoVoice] = useState<string | undefined>(undefined);
  const [selectedMinimaxVoice, setSelectedMinimaxVoice] = useState<string | undefined>(undefined);
  const [douBaoSelectorVisible, setDouBaoSelectorVisible] = useState(false);
  const [minimaxSelectorVisible, setMinimaxSelectorVisible] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [roleCard, setRoleCard] = useState<Partial<RoleCardJson>>({
    name: '',
    first_mes: '',
    description: '',
    personality: '',
    scenario: '',
    mes_example: ''
  });
  
  const [worldBookEntries, setWorldBookEntries] = useState<WorldBookEntryUI[]>([]);
  const [presetEntries, setPresetEntries] = useState<PresetEntryUI[]>([]);
  const [authorNote, setAuthorNote] = useState<Partial<AuthorNoteJson>>({
    charname: '',
    username: user?.settings?.self.nickname || 'User',
    content: '',
    injection_depth: 0
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'appearance' | 'voice'>('basic');
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDialogAction, setSelectedDialogAction] = useState<'save' | 'discard' | 'delete' | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [uploadMode, setUploadMode] = useState<'upload' | 'generate'>('upload');
  const [positiveTags, setPositiveTags] = useState<string[]>([]);
  const [negativeTags, setNegativeTags] = useState<string[]>([]);
  const [tagSelectorVisible, setTagSelectorVisible] = useState(false);
  const [selectedArtistPrompt, setSelectedArtistPrompt] = useState<string | null>(null);
  
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [voiceTemplateId, setVoiceTemplateId] = useState<string | undefined>(undefined);

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
    id?: string;
  } | null>(null);

  const [textEditorModalVisible, setTextEditorModalVisible] = useState(false);
  const [textEditorModalField, setTextEditorModalField] = useState<keyof RoleCardJson | null>(null);
  const [textEditorModalValue, setTextEditorModalValue] = useState<string>('');
  const [textEditorModalTitle, setTextEditorModalTitle] = useState<string>('');
  const [textEditorModalPlaceholder, setTextEditorModalPlaceholder] = useState<string>('');

  // 新增状态用于统一删除弹窗
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [selectedDeleteEntry, setSelectedDeleteEntry] = useState<string | null>(null);
  const [selectedDeleteType, setSelectedDeleteType] = useState<'worldbook' | 'preset' | null>(null);

  // 新增：多开场白状态
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>([]);
  const [selectedGreetingIndex, setSelectedGreetingIndex] = useState<number>(0);


  const [artistSelectorVisible, setArtistSelectorVisible] = useState(false);

  const openTextEditorModal = (
    field: keyof RoleCardJson,
    title: string,
    value: string,
    placeholder: string
  ) => {
    setTextEditorModalField(field);
    setTextEditorModalTitle(title);
    setTextEditorModalValue(value);
    setTextEditorModalPlaceholder(placeholder);
    setTextEditorModalVisible(true);
  };

  const handleTextEditorModalSave = (text: string) => {
    if (textEditorModalField) {
      handleRoleCardChange(textEditorModalField, text);
    }
    setTextEditorModalVisible(false);
  };

  useEffect(() => {
    const loadCharacterData = async () => {
      setIsLoading(true);
      try {
        const foundCharacter = characters.find((c) => c.id === id);
        if (!foundCharacter || !foundCharacter.jsonData) {
          throw new Error('Character data not found');
        }
        
        setCharacter(foundCharacter);
        
        try {
          const data = JSON.parse(foundCharacter.jsonData);
          
          setRoleCard({
            name: data.roleCard?.name || foundCharacter.name || '',
            first_mes: data.roleCard?.first_mes || 'Hello!',
            description: data.roleCard?.description || foundCharacter.description || '',
            personality: data.roleCard?.personality || foundCharacter.personality || '',
            scenario: data.roleCard?.scenario || '',
            mes_example: data.roleCard?.mes_example || ''
          });
          
          setAuthorNote(data.authorNote || {
            charname: data.roleCard?.name || foundCharacter.name || '',
            username: user?.settings?.self.nickname || 'User',
            content: '',
            injection_depth: 0
          });
          
          if (data.worldBook?.entries) {
            const worldBookEntries = Object.entries(data.worldBook.entries)
              .map(([name, entry]: [string, any]) => ({
                id: String(Date.now()) + Math.random(),
                name,
                comment: entry.comment || '',
                content: entry.content || '',
                disable: !!entry.disable,
                position: entry.position || 4,
                constant: !!entry.constant,
                key: Array.isArray(entry.key) ? entry.key : [],
                depth: entry.position === 4 ? (entry.depth || 0) : undefined,
                order: entry.order || 0
              }));
            
            setWorldBookEntries(worldBookEntries);
          } else {
            setWorldBookEntries([
              {
                id: String(Date.now()),
                name: 'Alist',
                comment: 'Character Attributes List',
                content: `<attributes>\n  <personality>${data.roleCard?.personality || 'Friendly'}</personality>\n  <appearance>未指定</appearance>\n  <likes>聊天</likes>\n  <dislikes>未指定</dislikes>\n</attributes>`,
                disable: false,
                position: 4,
                constant: true,
                key: [],
                depth: 0,
                order: 0
              }
            ]);
          }
          
          if (data.preset?.prompts) {
            const defaultPresetEntries = [...DEFAULT_PRESET_ENTRIES.EDITABLE, ...DEFAULT_PRESET_ENTRIES.FIXED];
            const presetEntryMap = new Map<string, PresetEntryUI>(
              defaultPresetEntries.map(entry => [entry.identifier, { ...entry, content: '' }])
            );
            
            data.preset.prompts.forEach((prompt: any) => {
              if (presetEntryMap.has(prompt.identifier)) {
                const entry = presetEntryMap.get(prompt.identifier);
                if (entry) {
                  entry.content = prompt.content || '';
                  entry.enable = prompt.enable !== false;
                  if (prompt.injection_position === 1) {
                    entry.depth = prompt.injection_depth || 0;
                    entry.insertType = 'chat';
                  }
                }
              } else {
                presetEntryMap.set(prompt.identifier, {
                  id: String(Date.now()) + Math.random(),
                  name: prompt.name || 'Custom Prompt',
                  identifier: prompt.identifier,
                  content: prompt.content || '',
                  isEditable: true,
                  insertType: prompt.injection_position === 1 ? 'chat' : 'relative',
                  role: (prompt.role as 'user' | 'model') || 'user',
                  order: data.preset.prompt_order?.[0]?.order?.findIndex(
                    (item: any) => item.identifier === prompt.identifier) ?? 999,
                  isDefault: false,
                  enable: prompt.enable !== false,
                  depth: prompt.injection_depth || 0
                });
              }
            });
            
            if (data.preset.prompt_order && data.preset.prompt_order[0]) {
              const orderMap = new Map(
                data.preset.prompt_order[0].order.map((item: any, index: number) => [item.identifier, index])
              );
              
              const presetEntries = Array.from(presetEntryMap.values())
                .sort((a, b) => {
                  const orderA = orderMap.has(a.identifier) ? orderMap.get(a.identifier) : 999;
                  const orderB = orderMap.has(b.identifier) ? orderMap.get(b.identifier) : 999;
                  const indexA = orderA !== undefined ? Number(orderA) : 999;
                  const indexB = orderB !== undefined ? Number(orderB) : 999;
                  return indexA - indexB;
                })
                .map((entry, index) => ({ ...entry, order: index }));
              
              setPresetEntries(presetEntries);
            } else {
              setPresetEntries(Array.from(presetEntryMap.values()));
            }
          } else {
            setPresetEntries(DEFAULT_PRESET_ENTRIES.EDITABLE.concat(DEFAULT_PRESET_ENTRIES.FIXED)
              .map((entry, index) => ({
                ...entry,
                id: String(Date.now()) + index,
                order: index
              })));
          }
          
          if (foundCharacter.voiceType) {
            setVoiceTemplateId(foundCharacter.voiceType);
            setVoiceGender(foundCharacter.voiceType.endsWith('a') ? 'female' : 'male');
          }
          
          if (foundCharacter.generationData?.appearanceTags) {
            setPositiveTags(foundCharacter.generationData.appearanceTags.positive || []);
            setNegativeTags(foundCharacter.generationData.appearanceTags.negative || []);
            setSelectedArtistPrompt(foundCharacter.generationData.appearanceTags.artistPrompt || null);
            if (foundCharacter.generationData.appearanceTags.positive?.length > 0) {
              setUploadMode('generate');
            }
          }

          // 初始化多开场白
          let greetings: string[] = [];
          if (Array.isArray(foundCharacter.extraGreetings) && foundCharacter.extraGreetings.length > 0) {
            greetings = foundCharacter.extraGreetings;
          } else if (data?.alternateGreetings && Array.isArray(data.alternateGreetings)) {
            greetings = data.alternateGreetings;
          } else if (data?.data?.alternate_greetings && Array.isArray(data.data.alternate_greetings)) {
            greetings = data.data.alternate_greetings;
          } else if (data?.roleCard?.first_mes) {
            greetings = [data.roleCard.first_mes];
          }
          setAlternateGreetings(greetings);
          setSelectedGreetingIndex(0);
          setRoleCard(prev => ({
            ...prev,
            first_mes: greetings[0] || ''
          }));
                  if (foundCharacter.ttsConfig) {
          const ttsConfig = foundCharacter.ttsConfig;
          setTtsProvider(ttsConfig.provider);
          
          if (ttsConfig.cosyvoice) {
            setVoiceTemplateId(ttsConfig.cosyvoice.templateId);
            setVoiceGender(ttsConfig.cosyvoice.gender);
          }
          if (ttsConfig.doubao) {
            setSelectedDouBaoVoice(ttsConfig.doubao.voiceType);
          }
          if (ttsConfig.minimax) {
            setSelectedMinimaxVoice(ttsConfig.minimax.voiceId);
          }
        } else if (foundCharacter.voiceType) {
          // Legacy support
          setVoiceTemplateId(foundCharacter.voiceType);
          setVoiceGender(foundCharacter.voiceType.endsWith('a') ? 'female' : 'male');
          setTtsProvider('cosyvoice');
        }
        } catch (parseError) {
          setRoleCard({
            name: foundCharacter.name || '',
            first_mes: '你好，很高兴认识你！',
            description: foundCharacter.description || '',
            personality: foundCharacter.personality || '',
            scenario: '',
            mes_example: ''
          });
          
          setWorldBookEntries([
            {
              id: String(Date.now()),
              name: 'Alist',
              comment: 'Character Attributes List',
              content: `<attributes>\n  <personality>${foundCharacter.personality || 'Friendly'}</personality>\n  <appearance>未指定</appearance>\n  <likes>聊天</likes>\n  <dislikes>未指定</dislikes>\n</attributes>`,
              disable: false,
              position: 4,
              constant: true,
              key: [],
              depth: 0,
              order: 0
            }
          ]);
          
          setPresetEntries(DEFAULT_PRESET_ENTRIES.EDITABLE.concat(DEFAULT_PRESET_ENTRIES.FIXED)
            .map((entry, index) => ({
              ...entry,
              id: String(Date.now()) + index,
              content: '',
              isEditable: DEFAULT_PRESET_ENTRIES.EDITABLE.some(e => e.identifier === entry.identifier),
              insertType: entry.injection_position === 1 ? 'chat' : 'relative',
              order: index,
              isDefault: true,
              enable: true,
              depth: entry.injection_depth || 0
            })));
            
          setAuthorNote({
            charname: foundCharacter.name || '',
            username: user?.settings?.self.nickname || 'User',
            content: '',
            injection_depth: 0
          });
          
          Alert.alert('提示', '角色数据格式有误，已创建基础设定');
        }
      } catch (error) {
        Alert.alert('错误', '加载角色数据失败');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCharacterData();
  }, [id, characters, user?.settings?.self.nickname]);

  const pickAvatar = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
          Image.getSize(result.assets[0].uri, (w: number, h: number) => {
            resolve({ width: w, height: h });
          }, () => {
            resolve({ width: 300, height: 300 });
          });
        });

        const size = Math.min(width, height);
        const x = (width - size) / 2;
        const y = (height - size) / 2;

        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ crop: { originX: x, originY: y, width: size, height: size } }],
          { format: ImageManipulator.SaveFormat.PNG, compress: 1 }
        );

        // 持久化存储到 avatars/{character.id}.png
        if (character) {
          const avatarDir = FileSystem.documentDirectory + 'avatars/';
          await FileSystem.makeDirectoryAsync(avatarDir, { intermediates: true }).catch(() => {});
          const avatarFilename = `${character.id || Date.now()}.png`;
          const avatarDest = avatarDir + avatarFilename;
          await FileSystem.copyAsync({ from: manipResult.uri, to: avatarDest });
          const updatedCharacter = { ...character, avatar: avatarDest };
          setCharacter(updatedCharacter);
          setHasUnsavedChanges(true);
        }
      }
    } catch (error) {
      Alert.alert("提示", "请确保选择合适的图片并正确裁剪");
    }
  };

  const pickBackground = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        // 可选：可做尺寸处理
        // 持久化存储到 backgrounds/{character.id}.jpg
        if (character) {
          const bgDir = FileSystem.documentDirectory + 'backgrounds/';
          await FileSystem.makeDirectoryAsync(bgDir, { intermediates: true }).catch(() => {});
          const bgFilename = `${character.id || Date.now()}.jpg`;
          const bgDest = bgDir + bgFilename;
          await FileSystem.copyAsync({ from: result.assets[0].uri, to: bgDest });
          const updatedCharacter = { ...character, backgroundImage: bgDest };
          setCharacter(updatedCharacter);
          setHasUnsavedChanges(true);
        }
      }
    } catch (error) {
      Alert.alert("错误", "选择背景图片失败");
    }
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
    if (field === 'name') {
      setAuthorNote(prev => ({ ...prev, charname: value }));
    }
    setHasUnsavedChanges(true);
  };

  const handleNameChange = (newName: string) => {
    handleRoleCardChange('name', newName);
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

  const saveCharacter = async () => {
    if (!roleCard.name?.trim()) {
      Alert.alert('保存失败', '角色名称不能为空。');
      return;
    }
  
    if (!character || !character.id) {
      Alert.alert('保存失败', '角色ID不存在');
      return;
    }
    
    setIsSaving(true);
    
    try {
      // 打印调试信息：保存前检查世界书条目数量和内容
      console.log(`Saving character with ${worldBookEntries.length} worldbook entries`);
      worldBookEntries.forEach((entry, idx) => {
        console.log(`Entry ${idx}: ${entry.name}, content length: ${entry.content?.length || 0}`);
      });
      
      // 修改：调整过滤逻辑，确保有效的条目不会被过滤掉
      const worldBookData = {
        entries: Object.fromEntries(
          worldBookEntries
            // 过滤规则：只过滤掉内容和名称都为空的条目
            .filter(entry => {
              const hasContent = !!entry.content?.trim();
              const hasName = !!entry.name?.trim();
              const shouldKeep = hasContent || hasName;
              if (!shouldKeep) {
                console.log(`Filtering out empty entry: ${entry.id}`);
              }
              return shouldKeep;
            })
            .map(entry => {
              // 为条目名称生成适当的键名
              const keyName = entry.name?.trim() || `Entry_${entry.id}`;
              // 构建条目数据
              return [
                keyName,
                {
                  comment: entry.comment || entry.name || `Entry_${entry.id}`,
                  content: entry.content || '',
                  disable: entry.disable,
                  position: entry.position,
                  constant: entry.constant || false,
                  key: Array.isArray(entry.key) ? entry.key : [],
                  ...(entry.position === 4 ? { depth: entry.depth || 0 } : {}),
                  order: entry.order || 0,
                  vectorized: entry.vectorized || false
                }
              ];
            })
        )
      };
      
      // 打印调试信息：检查转换后的条目
      const entryCount = Object.keys(worldBookData.entries).length;
      console.log(`Converted to ${entryCount} worldbook entries`);
      
      const presetData = {
        prompts: presetEntries.map(entry => ({
          name: entry.name,
          content: entry.content || '',
          identifier: entry.identifier,
          enable: entry.enable,
          role: entry.role,
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
      };
      
      const authorNoteData = {
        charname: roleCard.name.trim(),
        username: user?.settings?.self.nickname || "User",
        content: authorNote.content || '',
        injection_depth: authorNote.injection_depth || 0
      };
      
      // 清理first_mes和alternateGreetings中的未知标签
      const cleanedFirstMes = cleanUnknownTags(roleCard.first_mes || '');
      const cleanedAlternateGreetings = alternateGreetings.map(g => cleanUnknownTags(g));

      // 优化：如果first_mes为空，自动填充为"Hello!"
      const safeFirstMes = cleanedFirstMes?.trim() ? cleanedFirstMes : "Hello!";

      const jsonData = {
        roleCard: {
          ...roleCard,
          name: roleCard.name.trim(),
          first_mes: safeFirstMes // 保证first_mes有值且已清理
        },
        worldBook: worldBookData,
        preset: presetData,
        authorNote: authorNoteData,
        // 确保保存多开场白数据，且已清理
        alternateGreetings: cleanedAlternateGreetings.length > 0 ? cleanedAlternateGreetings : [safeFirstMes]
      };
            
      // 构建TTS配置
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
        inCradleSystem: character.inCradleSystem ?? true,
        cradleStatus: character.cradleStatus ?? 'growing',
        cradleCreatedAt: character.cradleCreatedAt ?? Date.now(),
        cradleUpdatedAt: Date.now(),
        feedHistory: character.feedHistory ?? [],
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
        voiceType: voiceTemplateId,
        ttsConfig: ttsConfig
      };
      
      const updatedCharacter: Character & Partial<CradleCharacter> = {
        ...character,
        name: roleCard.name.trim(),
        description: roleCard.description || '',
        personality: roleCard.personality || '',
        updatedAt: Date.now(),
        jsonData: JSON.stringify(jsonData),
        ...cradleFields,
        // 保存清理后的alternateGreetings
        extraGreetings: cleanedAlternateGreetings.length > 0 ? cleanedAlternateGreetings : undefined
      };
      
      await updateCharacter(updatedCharacter);
      
      const apiKey = user?.settings?.chat?.characterApiKey || '';
      const apiSettings = user?.settings?.chat;
      
      if (apiKey) {
        await NodeSTManager.processChatMessage({
          userMessage: "",
          status: "更新人设",
          conversationId: character.id,
          apiKey: apiKey,
          apiSettings: {
            apiProvider: apiSettings?.apiProvider || 'gemini',
            openrouter: apiSettings?.openrouter
          },
          character: updatedCharacter
        });
      }
      
      setHasUnsavedChanges(false);
      Alert.alert('成功', '角色设定已更新');
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '更新角色时出现错误。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setSelectedDialogAction('discard');
      setShowDialog(true);
    } else {
      router.back();
    }
  };

  const handleConfirmDialog = () => {
    if (selectedDialogAction === 'save') {
      saveCharacter();
    } else if (selectedDialogAction === 'discard') {
      router.back();
    } else if (selectedDialogAction === 'delete') {
    }
    
    setShowDialog(false);
    setSelectedDialogAction(null);
  };

  // 统一的删除条目弹窗触发函数
  const confirmDeleteEntry = (id: string, type: 'worldbook' | 'preset') => {
    setSelectedDeleteEntry(id);
    setSelectedDeleteType(type);
    setDeleteDialogVisible(true);
  };

  // 删除确认后的实际删除操作
  const handleConfirmDeleteEntry = () => {
    if (selectedDeleteType === 'worldbook' && selectedDeleteEntry) {
      setWorldBookEntries(prev => prev.filter(entry => entry.id !== selectedDeleteEntry));
      setHasUnsavedChanges(true);
    } else if (selectedDeleteType === 'preset' && selectedDeleteEntry) {
      const entry = presetEntries.find(e => e.id === selectedDeleteEntry);
      if (entry?.isDefault) {
        Alert.alert(
          '无法删除',
          '默认预设条目不能被删除，但可以禁用。'
        );
        setDeleteDialogVisible(false);
        setSelectedDeleteEntry(null);
        setSelectedDeleteType(null);
        return;
      }
      setPresetEntries(prev => prev.filter(entry => entry.id !== selectedDeleteEntry));
      setHasUnsavedChanges(true);
    }
    setDeleteDialogVisible(false);
    setSelectedDeleteEntry(null);
    setSelectedDeleteType(null);
  };

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
    entryId?: string
  ) => {
    // 对于 worldbook 条目，自动绑定更新函数
    if (entryType === 'worldbook' && entryId) {
      console.log(`Opening worldbook detail for entry ${entryId} with content length: ${content.length}`);
      // 保存当前的条目，以便在sidebar中正确显示
      const currentEntry = worldBookEntries.find(entry => entry.id === entryId);
      if (!currentEntry) {
        console.warn(`Entry ${entryId} not found in worldBookEntries`);
      }
      
      setSelectedField({
        title,
        content,
        editable,
        entryType,
        entryOptions,
        name,
        id: entryId,
        onContentChange: (text: string) => {
          console.log(`Updating content for worldbook entry ${entryId}, length: ${text.length}`);
          handleUpdateWorldBookEntry(entryId, { content: text });
          // 确保在关闭DetailSidebar后内容持久保存
          setHasUnsavedChanges(true);
        },
        onNameChange: (text: string) => {
          console.log(`Updating name for worldbook entry ${entryId}`);
          handleUpdateWorldBookEntry(entryId, { name: text });
        },
        onOptionsChange: (options: any) => {
          console.log(`Updating options for worldbook entry ${entryId}`);
          handleUpdateWorldBookEntry(entryId, options);
        },
      });
    } else if (entryType === 'preset' && entryId) {
      setSelectedField({
        title,
        content,
        editable,
        entryType,
        entryOptions,
        name,
        id: entryId,
        onContentChange: (text: string) => {
          handleUpdatePresetEntry(entryId, { content: text });
          setHasUnsavedChanges(true);
        },
        onNameChange: (text: string) => handleUpdatePresetEntry(entryId, { name: text }),
        onOptionsChange: (options: any) => handleUpdatePresetEntry(entryId, options),
      });
    } else if (entryType === 'author_note') {
      setSelectedField({ 
        title, 
        content, 
        onContentChange: (text: string) => {
          if (onContentChange) onContentChange(text);
          setHasUnsavedChanges(true);
        }, 
        editable,
        entryType,
        entryOptions,
        onOptionsChange,
        name,
        onNameChange,
        id: entryId
      });
    } else {
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
        id: entryId
      });
    }
  };

  const handleAddWorldBookEntry = () => {
    const newEntry: WorldBookEntryUI = {
      id: String(Date.now()),
      name: '',
      comment: '',
      content: '',
      disable: false,
      position: 4,
      constant: false,
      key: [],
      depth: 0,
      order: worldBookEntries.length
    };
    setWorldBookEntries(prev => [...prev, newEntry]);
    setHasUnsavedChanges(true);
  };
  
  const handleUpdateWorldBookEntry = (id: string, updates: Partial<WorldBookEntryUI>) => {
    setWorldBookEntries(prev => {
      // 确保我们返回一个新数组实例，使React检测到状态变化
      const updated = prev.map(entry => {
        if (entry.id === id) {
          // 如果是更新 content，打印调试信息
          if ('content' in updates) {
            console.log(`WorldBook content updated for ${id}, new length: ${updates.content?.length || 0}`);
          }
          return { ...entry, ...updates };
        }
        return entry;
      });
      
      console.log(`Updated worldbook entry ${id}, entries count: ${updated.length}`);
      return updated;
    });
    setHasUnsavedChanges(true);
  };
  
  const handleReorderWorldBook = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    setWorldBookEntries(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      
      return result.map((entry, idx) => ({
        ...entry,
        order: idx
      }));
    });
    setHasUnsavedChanges(true);
  };

  const handleAddPresetEntry = () => {
    const newEntry: PresetEntryUI = {
      id: String(Date.now()),
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
      prev.map(entry => entry.id === id ? { ...entry, ...updates } : entry)
    );
    setHasUnsavedChanges(true);
  };
  
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
      
      return newEntries.map((entry, idx) => ({
        ...entry,
        order: idx
      }));
    });
    setHasUnsavedChanges(true);
  };
  
  const handleReorderPresets = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    setPresetEntries(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      
      return result.map((entry, idx) => ({
        ...entry,
        order: idx
      }));
    });
    setHasUnsavedChanges(true);
  };

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
          const importedEntries: PresetEntryUI[] = presetJson.prompts.map((prompt: any, index: number) => ({
            id: `imported_${index}`,
            name: prompt.name || '',
            content: prompt.content || '',
            identifier: prompt.identifier,
            isEditable: true,
            insertType: prompt.injection_position === 1 ? 
              'chat' as const : 'relative' as const,
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

  // 替换原有的handleDeleteWorldBookEntry
  const handleDeleteWorldBookEntry = (id: string) => {
    confirmDeleteEntry(id, 'worldbook');
  };

  // 替换原有的handleDeletePresetEntry
  const handleDeletePresetEntry = (id: string) => {
    confirmDeleteEntry(id, 'preset');
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

const renderTagGenerationSection = () => (
  <View style={styles.tagGenerateContainer}>
    <Text style={styles.tagInstructionsText}>
      请选择描述角色外观的正面和负面标签，这些标签将被保存作为角色描述的一部分
    </Text>
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
          selectedGender={character?.gender as 'male' | 'female' | 'other'}
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
  const renderVoiceSection = () => (
  <View style={[styles.tabContent, { flex: 1 }]}>
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

const renderAppearanceSection = () => (
  <View style={styles.tabContent}>
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
            选择角色TAG
          </Text>
          <Text style={styles.modeDescription}>
            通过组合标签描述角色形象
          </Text>
        </View>
      </TouchableOpacity>
    </View>
    {uploadMode === 'upload' ? (
      <View style={styles.uploadContainer}>
        <View style={styles.cardPreviewSection}>
          <Text style={styles.inputLabel}>角色卡图片 (9:16)</Text>
          <View style={styles.cardImageContainer}>
            <TouchableOpacity
              style={styles.cardImagePicker}
              onPress={pickBackground}
            >
              {character?.backgroundImage ? (
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
          <Text style={styles.inputLabel}>头像图片 (方形)</Text>
          <View style={styles.imageSelectionContainer}>
            <TouchableOpacity
              style={styles.avatarButton}
              onPress={pickAvatar}
            >
              {character?.avatar ? (
                <Image source={{ uri: character.avatar }} style={styles.avatarPreview} />
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
    {/* TagSelector Modal (moved here for clarity) */}
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


  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <LoadingIndicator 
          visible={true} 
          text="加载角色数据"
          type="animated"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <CharacterDetailHeader
        name={roleCard.name || ''}
        backgroundImage={
          character?.backgroundImage
            ? typeof character.backgroundImage === 'string'
              ? character.backgroundImage
              : character.backgroundImage?.localUri ||
                character.backgroundImage?.url ||
                null
            : null
        }
        onBackgroundPress={() => setActiveTab('appearance')}
        onBackPress={handleBack}
        onFullscreenPress={() => {
          // Handle fullscreen image viewer if needed
        }}
        onNameChange={handleNameChange}
        isNameEditable={true}
      />
      
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'basic' && styles.activeTab]} 
          onPress={() => setActiveTab('basic')}
        >
          <Text style={[styles.tabText, activeTab === 'basic' && styles.activeTabText]}>基本</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'advanced' && styles.activeTab]} 
          onPress={() => setActiveTab('advanced')}
        >
          <Text style={[styles.tabText, activeTab === 'advanced' && styles.activeTabText]}>高级</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'appearance' && styles.activeTab]} 
          onPress={() => setActiveTab('appearance')}
        >
          <Text style={[styles.tabText, activeTab === 'appearance' && styles.activeTabText]}>外观</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'voice' && styles.activeTab]} 
          onPress={() => setActiveTab('voice')}
        >
          <Text style={[styles.tabText, activeTab === 'voice' && styles.activeTabText]}>声线</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        {/* 替换 ScrollView 为 View，避免嵌套 VirtualizedList 警告 */}
        <View style={styles.content}>
          {activeTab === 'basic' ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              <View style={styles.tabContent}>
                {/* 新增：多开场白UI */}
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
                  onPress={() =>
                    openTextEditorModal(
                      'description',
                      '编辑角色描述',
                      roleCard.description || '',
                      '描述角色的外表、背景等基本信息...'
                    )
                  }
                />
              
                <CharacterAttributeEditor
                  title="性格特征"
                  value={roleCard.personality || ''}
                  onChangeText={(text) => handleRoleCardChange('personality', text)}
                  placeholder="描述角色的性格、习惯、喜好等..."
                  style={styles.attributeSection}
                  onPress={() =>
                    openTextEditorModal(
                      'personality',
                      '编辑性格特征',
                      roleCard.personality || '',
                      '描述角色的性格、习惯、喜好等...'
                    )
                  }
                />
              
                <CharacterAttributeEditor
                  title="场景设定"
                  value={roleCard.scenario || ''}
                  onChangeText={(text) => handleRoleCardChange('scenario', text)}
                  placeholder="描述角色所在的环境、情境..."
                  style={styles.attributeSection}
                  onPress={() =>
                    openTextEditorModal(
                      'scenario',
                      '编辑场景设定',
                      roleCard.scenario || '',
                      '描述角色所在的环境、情境...'
                    )
                  }
                />
              
                <CharacterAttributeEditor
                  title="对话示例"
                  value={roleCard.mes_example || ''}
                  onChangeText={(text) => handleRoleCardChange('mes_example', text)}
                  placeholder="提供一些角色对话的范例..."
                  style={styles.attributeSection}
                  onPress={() =>
                    openTextEditorModal(
                      'mes_example',
                      '编辑对话示例',
                      roleCard.mes_example || '',
                      '提供一些角色对话的范例...'
                    )
                  }
                />
              </View>
            </ScrollView>
          ) : activeTab === 'advanced' ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              <View style={styles.tabContent}>
                {/* 新增：世界书导入按钮 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.importPresetButton, { marginRight: 8 }]}
                    onPress={handleImportWorldBook}
                  >
                    <Ionicons name="book-outline" size={16} color="#FFD700" />
                    <Text style={styles.importPresetText}>导入世界书</Text>
                  </TouchableOpacity>
                  {/* 保持原有预设导入按钮 */}
                  <TouchableOpacity 
                    style={styles.importPresetButton}
                    onPress={handleImportPreset}
                  >
                    <Ionicons name="cloud-download-outline" size={16} color="#FFD700" />
                    <Text style={styles.importPresetText}>导入预设</Text>
                  </TouchableOpacity>
                </View>
                <WorldBookSection 
                  entries={worldBookEntries}
                  onAdd={handleAddWorldBookEntry}
                  onUpdate={handleUpdateWorldBookEntry}
                  onReorder={handleReorderWorldBook}
                  onViewDetail={handleViewDetail}
                  onDelete={handleDeleteWorldBookEntry}
                />
                
                <AuthorNoteSection
                  content={authorNote.content || ''}
                  injection_depth={authorNote.injection_depth || 0}
                  onUpdateContent={(text) => {
                    setAuthorNote(prev => ({ ...prev, content: text }));
                    setHasUnsavedChanges(true);
                  }}
                  onUpdateDepth={(depth) => {
                    setAuthorNote(prev => ({ ...prev, injection_depth: depth }));
                    setHasUnsavedChanges(true);
                  }}
                  onViewDetail={handleViewDetail}
                />
                
                <View style={styles.presetSectionHeader}>
                  <Text style={styles.sectionTitle}>预设设定</Text>
                </View>
                
                <PresetSection
                  entries={presetEntries}
                  onAdd={handleAddPresetEntry}
                  onUpdate={handleUpdatePresetEntry}
                  onMove={handleMoveEntry}
                  onReorder={handleReorderPresets}
                  onViewDetail={handleViewDetail}
                  onDelete={handleDeletePresetEntry}
                />
              </View>
            </ScrollView>
          ) : activeTab === 'appearance' ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              {renderAppearanceSection()}
            </ScrollView>
          ) : activeTab === 'voice' ? (
            renderVoiceSection()
          ) : null}
        </View>
      </View>      
      <BlurView intensity={30} tint="dark" style={styles.bottomBar}>
        <ActionButton
          title="取消"
          icon="close-outline"
          onPress={handleBack}
          color="#666666"
          textColor="#000"
          style={styles.cancelButton}
        />
        
        <ActionButton
          title="保存设定"
          icon="save-outline"
          onPress={() => {
            setSelectedDialogAction('save');
            setShowDialog(true);
          }}
          loading={isSaving}
          color="rgb(255, 224, 195)"
          textColor="#000"
          style={styles.saveButton}
        />
      </BlurView>
      
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
      
      <ConfirmDialog
        visible={showDialog}
        title={
          selectedDialogAction === 'save' ? '保存设定' :
          selectedDialogAction === 'discard' ? '放弃更改' :
          selectedDialogAction === 'delete' ? '删除角色' : '确认'
        }
        message={
          selectedDialogAction === 'save' ? '确认保存所有更改？' :
          selectedDialogAction === 'discard' ? '您有未保存的更改，确定要离开吗？' :
          selectedDialogAction === 'delete' ? '确定要删除这个角色吗？此操作无法撤销。' : ''
        }
        confirmText={
          selectedDialogAction === 'save' ? '保存' :
          selectedDialogAction === 'discard' ? '放弃更改' :
          selectedDialogAction === 'delete' ? '删除' : '确认'
        }
        cancelText="取消"
        confirmAction={handleConfirmDialog}
        cancelAction={() => setShowDialog(false)}
        destructive={selectedDialogAction === 'delete' || selectedDialogAction === 'discard'}
        icon={
          selectedDialogAction === 'save' ? 'save-outline' :
          selectedDialogAction === 'discard' ? 'alert-circle-outline' :
          selectedDialogAction === 'delete' ? 'trash-outline' : 'help-circle-outline'
        }
      />
      
      {/* 新增统一删除条目弹窗 */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title="删除条目"
        message="确定要删除这个条目吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        confirmAction={handleConfirmDeleteEntry}
        cancelAction={() => {
          setDeleteDialogVisible(false);
          setSelectedDeleteEntry(null);
          setSelectedDeleteType(null);
        }}
        destructive
        icon="trash-outline"
      />
      
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

      <TextEditorModal
        isVisible={textEditorModalVisible}
        onClose={() => setTextEditorModalVisible(false)}
        onSave={handleTextEditorModalSave}
        initialText={textEditorModalValue}
        placeholder={textEditorModalPlaceholder}
        title={textEditorModalTitle} // 添加title参数
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282828',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#282828',
  },
  tabContainer: {
    flexDirection: 'row',
    marginTop: 10,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#aaaaaa',
  },
  activeTabText: {
    color: theme.colors.text,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    flex: 1, // 新增：让tab内容区自动填满父容器
  },
  attributeSection: {
    marginTop: 20,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  saveButton: {
    flex: 2,
  },
  
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
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
  
  tagGenerateContainer: {
    flex: 1,
    padding: 16,
  },
  tagInstructionsText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
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
    color: theme.colors.black,
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
    color: theme.colors.black,
    marginLeft: 8,
    fontWeight: '500',
  },
  
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
    backgroundColor: 'rgba(224, 196, 168, 0.2)',
  },
  importPresetText: {
    color: theme.colors.primary,
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
      backgroundColor: theme.colors.primaryDark,
      elevation: 4,
    },
    ttsProviderText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
    },
    activeTtsProviderText: {
      color: theme.colors.black,
      fontWeight: '700',
    },
    douBaoContainer: {
      flex: 1,
      paddingTop: 8,
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
      voiceProviderContent: {
    flex: 1,
    marginTop: 8,
  },
  });
export default CharacterDetail;