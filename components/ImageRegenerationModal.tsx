import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  TextInput,
  StatusBar,
  AppState,
  Linking,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { CradleCharacter, CharacterImage } from '@/shared/types';
import TagSelector from './TagSelector';
import CharacterTagSelector from './CharacterTagSelector';
import ArtistReferenceSelector from './ArtistReferenceSelector';
import CharacterPosition, { CharacterPrompt } from './CharacterPosition';
import { DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS } from '@/constants/defaultPrompts';
import { licenseService } from '@/services/license-service';
import tagData from '@/app/data/tag.json';
import NovelAIService, { 
  NOVELAI_MODELS, 
  NOVELAI_SAMPLERS, 
  NOVELAI_NOISE_SCHEDULES,
  CharacterPromptData
} from './NovelAIService';
import { useUser } from '@/constants/UserContext';
import { BlurView } from 'expo-blur';
import { useCharacters } from '@/constants/CharactersContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import artistData from '@/app/data/v4-artist.json';
import characterData from '@/app/data/character_data.json';
import { getUserSettingsGlobally } from '@/utils/settings-helper';

// 新增：Roll按钮相关辅助函数
const ROLL_TAG_CATEGORIES = [
  "姿势&状态", "特殊特征", "环境", "风格", "身份", "头发&发饰", "五官&表情", "眼睛", "身体", "服装", "袜子&腿饰", "鞋", "装饰", "动作"
];
const IMAGE_SERVICE_BASE_URL = 'https://image.cradleintro.top';

const DEFAULT_GENERATION_SETTINGS = {
  width: 576,
  height: 1024,
  steps: 28,
  batch_size: 1
};

export const IMAGE_SIZE_PRESETS = [
  { id: 'portrait', name: 'Portrait', width: 832, height: 1216, supportedProviders: ['animagine4', 'novelai'] },
  { id: 'landscape', name: 'Landscape', width: 1216, height: 832, supportedProviders: ['animagine4', 'novelai'] },
  { id: 'square', name: 'Square', width: 1024, height: 1024, supportedProviders: ['animagine4', 'novelai'] },
  { id: 'large_portrait', name: 'LARGE Portrait', width: 1024, height: 1536, supportedProviders: ['animagine4', 'novelai'] },
  { id: 'large_landscape', name: 'LARGE Landscape', width: 1536, height: 1024, supportedProviders: ['animagine4', 'novelai'] }
];

// Default colors for character markers in position control
const DEFAULT_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3',
  '#33FFF3', '#FF9933', '#9933FF', '#33FF99', '#FF3366'
];

const DEFAULT_NOVELAI_SETTINGS = {
  model: 'NAI Diffusion V4 Curated',
  sampler: 'k_euler_ancestral',
  steps: 28,
  scale: 5,
  noiseSchedule: 'karras',
  seed: '',
  useCoords: true,
  useOrder: true
};

const DEFAULT_ANIMAGINE4_SETTINGS = {
  steps: 28,
  batch_size: 1
};

// Define tabs for the UI
enum TabType {
  GENERATION = 'generation',
  SETTINGS = 'settings'
}

interface ImageRegenerationModalProps {
  visible: boolean;
  character: CradleCharacter;
  onClose: () => void;
  onSuccess: (imageData: CharacterImage, settingsState?: any, usedSeed?: string | number) => void;
  existingImageConfig?: {
    positiveTags: string[];
    negativeTags: string[];
    artistPrompt: string | null;
    customPrompt: string;
    useCustomPrompt: boolean;
    characterTags?: string[];
    seed?: number | string;
    novelaiSettings?: Partial<typeof DEFAULT_NOVELAI_SETTINGS>;
    animagine4Settings?: Partial<typeof DEFAULT_ANIMAGINE4_SETTINGS>;
    fixedTags?:string[];
  };
  onSavePreviewImage?: (imageUrl: string) => void;
  initialSettingsState?: {
    imageProvider: 'animagine4' | 'novelai';
    sizePresetId: string;
    novelaiSettings: any;
    animagine4Settings: any;
  };
  initialSeed?: string | number;
  onPersistImage?: (image: CharacterImage) => Promise<void>;
}

interface TagItem {
  tag: string;
  type: 'positive' | 'negative';
}

const SETTINGS_STORAGE_KEY = 'ImageRegenerationModal_lastSettings';

const getGenderTagsFromTagData = () => {
  const genderCategory = tagData.general_categories.find(
    (category: any) => category.name === "性别"
  );
  
  if (!genderCategory || !genderCategory.sub_categories) {
    return { maleGenderTags: [], femaleGenderTags: [] };
  }
  
  const maleGenderTags = genderCategory.sub_categories['男性'] || [];
  const femaleGenderTags = genderCategory.sub_categories['女性'] || [];
  
  return { maleGenderTags, femaleGenderTags };
};

const { maleGenderTags, femaleGenderTags } = getGenderTagsFromTagData();

// Utility: Remove outer brackets from a string, e.g. [artist:neco] -> artist:neco
const removeBrackets = (str: string | null): string | null => {
  if (!str) return null;
  // Remove outer brackets if present
  return str.replace(/^\[([^\]]+)\]$/, '$1').trim();
};

// Clean the artist tag based on provider
const cleanArtistTag = (artistTag: string | null, provider: 'animagine4' | 'novelai' = 'animagine4'): string | null => {
  if (!artistTag) return null;
  // Always remove brackets first
  let cleaned = removeBrackets(artistTag);
  if (!cleaned) return null;
  if (provider === 'animagine4') {
    // Remove "artist:" prefix if present
    if (cleaned.toLowerCase().startsWith('artist:')) {
      cleaned = cleaned.substring(7).trim();
    }
    return cleaned;
  } else {
    // For novelai, keep "artist:" prefix if present
    return cleaned;
  }
};

const ImageRegenerationModal: React.FC<ImageRegenerationModalProps> = ({
  visible,
  character,
  onClose,
  onSuccess,
  existingImageConfig,
  onSavePreviewImage,
  initialSettingsState,
  initialSeed,
  onPersistImage,
}) => {
  const { user } = useUser();
  const { setCharacterAvatar, setCharacterBackgroundImage } = useCharacters();
  const [activeTab, setActiveTab] = useState<TabType>(TabType.GENERATION);
  const [isLoading, setIsLoading] = useState(false);
  const [positiveTags, setPositiveTags] = useState<string[]>([]);
  const [negativeTags, setNegativeTags] = useState<string[]>([]);
  const [tagSelectorVisible, setTagSelectorVisible] = useState(false);
  const [replaceBackground, setReplaceBackground] = useState(false);
  const [replaceAvatar, setReplaceAvatar] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtistPrompt, setSelectedArtistPrompt] = useState<string | null>(null);
  const [useExistingArtistPrompt, setUseExistingArtistPrompt] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customPromptModalVisible, setCustomPromptModalVisible] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [licenseLoaded, setLicenseLoaded] = useState(false);
  const [characterTagSelectorVisible, setCharacterTagSelectorVisible] = useState(false);
  const [characterTags, setCharacterTags] = useState<string[]>([]);
  const [artistReferenceSelectorVisible, setArtistReferenceSelectorVisible] = useState(false);
  const [generationSettingsVisible, setGenerationSettingsVisible] = useState(false);
  const [generationSettings, setGenerationSettings] = useState({ ...DEFAULT_GENERATION_SETTINGS });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [fixedTags, setFixedTags] = useState<string[]>([]);
  const [imageProvider, setImageProvider] = useState<'animagine4' | 'novelai'>('animagine4');
  const [sizePresetId, setSizePresetId] = useState<string>('portrait');
  const [novelaiSettings, setNovelaiSettings] = useState({ ...DEFAULT_NOVELAI_SETTINGS });
  const [animagine4Settings, setAnimagine4Settings] = useState({ ...DEFAULT_ANIMAGINE4_SETTINGS });
  const [novelaiToken, setNovelaiToken] = useState<string>('');
  const [novelaiSettingsVisible, setNovelaiSettingsVisible] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // New state for preview image
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // New state variables for multi-character functionality
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPrompt[]>([]);
  const [showCharacterPositionControls, setShowCharacterPositionControls] = useState(false);
  const [characterTagSelectorForPromptIndex, setCharacterTagSelectorForPromptIndex] = useState<number | null>(null);
  const [generatedSeed, setGeneratedSeed] = useState<number | null>(null);
  // 新增：Roll按钮处理函数
  const handleRollTags = () => {
    // 1. 随机genderTag
    let genderTag = '';
    const genderList = Math.random() < 0.5 ? maleGenderTags : femaleGenderTags;
    if (genderList.length > 0) {
      genderTag = genderList[Math.floor(Math.random() * genderList.length)];
    }

    // 2. 随机characterTag
    let randomCharacterTag = '';
    if (characterData && Array.isArray(characterData) && characterData.length > 0) {
      const char = characterData[Math.floor(Math.random() * characterData.length)];
      // 格式同CharacterTagSelector
      randomCharacterTag = [char.english_name, ...(char.works || [])].join(',');
    }

    // 3. 随机artistTag
    let randomArtistPrompt = '';
    if (artistData && Array.isArray(artistData) && artistData.length > 0) {
      const artist = artistData[Math.floor(Math.random() * artistData.length)];
      randomArtistPrompt = artist.artist_prompt;
    }

    // 4. 指定分类中随机tag
    let randomCategoryTag = '';
    if (tagData && Array.isArray(tagData.general_categories)) {
      // 找到所有目标分类下的所有tag
      let allTargetTags: string[] = [];
      tagData.general_categories.forEach((cat: any) => {
        if (ROLL_TAG_CATEGORIES.includes(cat.name) && cat.sub_categories) {
          Object.values(cat.sub_categories).forEach((tags: any) => {
            if (Array.isArray(tags)) {
              allTargetTags.push(...tags);
            }
          });
        }
      });
      if (allTargetTags.length > 0) {
        randomCategoryTag = allTargetTags[Math.floor(Math.random() * allTargetTags.length)];
      }
    }

    // 更新state
    setPositiveTags(genderTag ? [genderTag, randomCategoryTag].filter(Boolean) : [randomCategoryTag].filter(Boolean));
    setCharacterTags(randomCharacterTag ? [randomCharacterTag] : []);
    setSelectedArtistPrompt(randomArtistPrompt || null);
    setUseExistingArtistPrompt(true);
  };  
  // NEW: Add state for character tag selector with prompt index
  const [characterTagSelectorForCharacterPrompt, setCharacterTagSelectorForCharacterPrompt] = useState<number | null>(null);

  // Track taskId for polling (for Animagine4)
  const pollingTaskIdRef = useRef<string | null>(null);
  const pollingCharacterIdRef = useRef<string | null>(null);

  // 权重模式
  const [tagWeightMode, setTagWeightMode] = useState<'none' | 'increase' | 'decrease'>('none');
  // 管理模式
  const [manageMode, setManageMode] = useState(false);

  // 仅保留锁定/解锁两种状态
  const [lockMode, setLockMode] = useState<'none' | 'lock'>('none');

  // 多层加权/降权
  const addWeight = (tag: string, type: 'increase' | 'decrease') => {
    if (type === 'increase') {
      // 如果最外层是[]，去掉一层[]，否则加一层{}
      if (/^\[.*\]$/.test(tag)) return tag.replace(/^\[(.*)\]$/, '$1');
      return `{${tag}}`;
    }
    if (type === 'decrease') {
      // 如果最外层是{}，去掉一层{}，否则加一层[]
      if (/^\{.*\}$/.test(tag)) return tag.replace(/^\{(.*)\}$/, '$1');
      return `[${tag}]`;
    }
    return tag;
  };
  // 去除一层权重
  const removeOneWeight = (tag: string) => {
    if (/^\{.*\}$/.test(tag)) return tag.replace(/^\{(.*)\}$/, '$1');
    if (/^\[.*\]$/.test(tag)) return tag.replace(/^\[(.*)\]$/, '$1');
    return tag;
  };

  // 标签点击：加/降权或删除或锁定/解锁
  const handlePositiveTagPress = (tag: string) => {
    if (lockMode === 'lock') {
      // 锁定状态：点击高亮
      if (!fixedTags.includes(tag)) setFixedTags(prev => [...prev, tag]);
      return;
    }
    // 解锁状态：点击取消高亮
    if (fixedTags.includes(tag)) setFixedTags(prev => prev.filter(t => t !== tag));
    else if (manageMode) {
      setPositiveTags(tags => tags.filter(t => t !== tag));
    } else if (tagWeightMode === 'increase' || tagWeightMode === 'decrease') {
      setPositiveTags(tags =>
        tags.map(t => (t === tag ? addWeight(tag, tagWeightMode) : t))
      );
    }
  };
  const handleCharacterTagPress = (tag: string) => {
    if (manageMode) {
      setCharacterTags(tags => tags.filter(t => t !== tag));
    } else if (tagWeightMode === 'increase' || tagWeightMode === 'decrease') {
      setCharacterTags(tags =>
        tags.map(t => (t === tag ? addWeight(tag, tagWeightMode) : t))
      );
    }
  };
    // 新增：锁定/解锁按钮
  const handleToggleFixedTag = (tag: string) => {
    setFixedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };
  // 标签管理模式下的样式
  const tagManageStyle = manageMode ? { borderWidth: 1, borderColor: '#ff9f1c', opacity: 0.7 } : {};
  // 标签锁定/解锁状态颜色
  const tagLockStyle = (tag: string) => {
    if (fixedTags.includes(tag)) {
      return { backgroundColor: '#ffe0c3', borderColor: '#ff9f1c', borderWidth: 1 };
    }
    return {};
  };

  // 新增：用于中断生成流程
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  useEffect(() => {
    if (visible) {
      const loadNovelaiToken = async () => {
        try {
          const savedToken = user?.settings?.chat?.novelai?.token;
          if (savedToken) {
            setNovelaiToken(savedToken);
            
            const tokenCache = await NovelAIService.getTokenCache();
            if (tokenCache && tokenCache.token === savedToken && tokenCache.expiry > Date.now()) {
              setIsTokenValid(true);
              console.log('[图片重生成] 已加载有效的NovelAI token');
            } else {
              setIsTokenValid(false);
              console.log('[图片重生成] NovelAI token需要验证');
            }
          } else {
            console.log('[图片重生成] 未找到NovelAI token');
          }
        } catch (error) {
          console.error('[图片重生成] 加载NovelAI token失败:', error);
        }
      };

      loadNovelaiToken();
      
      const sizePreset = IMAGE_SIZE_PRESETS.find(preset => preset.id === sizePresetId) || IMAGE_SIZE_PRESETS[0];
      setGenerationSettings(prev => ({
        ...prev,
        width: sizePreset.width,
        height: sizePreset.height
      }));

      // Reset the preview image
      setPreviewImageUrl(null);
      
      // Initialize with one character if no prompts exist
      if (characterPrompts.length === 0) {
        setCharacterPrompts([{
          prompt: '',  // Changed to empty string
          position: { x: 0, y: 0 },
          color: DEFAULT_COLORS[0]
        }]);
      }
    }
  }, [visible, sizePresetId, user?.settings?.chat?.novelai?.token]);

  useEffect(() => {
    const loadLicense = async () => {
      try {
        if (!licenseService.isInitialized()) {
          await licenseService.initialize();
        }
        const info = await licenseService.getLicenseInfo();
        setLicenseInfo(info);
        setLicenseLoaded(true);
        console.log('[图片重生成] 许可证信息加载完成:', info ? '成功' : '未找到许可证');
      } catch (error) {
        console.error('[图片重生成] 加载许可证信息失败:', error);
        setLicenseLoaded(true);
      }
    };
    loadLicense();
  }, []);

  useEffect(() => {
    if (visible && !settingsLoaded) {
      (async () => {
        let restored = false;
        if (initialSettingsState) {
          setImageProvider(initialSettingsState.imageProvider || 'animagine4');
          setSizePresetId(initialSettingsState.sizePresetId || 'portrait');
          setNovelaiSettings({ ...DEFAULT_NOVELAI_SETTINGS, ...initialSettingsState.novelaiSettings });
          setAnimagine4Settings({ ...DEFAULT_ANIMAGINE4_SETTINGS, ...initialSettingsState.animagine4Settings });
          restored = true;
        } else {
          try {
            const json = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
            if (json) {
              const last = JSON.parse(json);
              setImageProvider(last.imageProvider || 'animagine4');
              setSizePresetId(last.sizePresetId || 'portrait');
              setNovelaiSettings({ ...DEFAULT_NOVELAI_SETTINGS, ...last.novelaiSettings });
              setAnimagine4Settings({ ...DEFAULT_ANIMAGINE4_SETTINGS, ...last.animagine4Settings });
              restored = true;
            }
          } catch {}
        }
        setSettingsLoaded(true);
      })();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible && settingsLoaded) {
      const save = async () => {
        await AsyncStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({
            imageProvider,
            sizePresetId,
            novelaiSettings,
            animagine4Settings,
          })
        );
      };
      save();
    }
  }, [visible === false]);

  useEffect(() => {
    if (settingsLoaded) {
      AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          imageProvider,
          sizePresetId,
          novelaiSettings,
          animagine4Settings,
        })
      );
    }
  }, [imageProvider, sizePresetId, JSON.stringify(novelaiSettings), JSON.stringify(animagine4Settings)]);

  useEffect(() => {
    if (visible) {
      if (typeof initialSeed !== 'undefined' && initialSeed !== null) {
        setNovelaiSettings(prev => ({ ...prev, seed: String(initialSeed) }));
        setGeneratedSeed(Number(initialSeed));
      }
    }
  }, [visible, initialSeed]);

  useEffect(() => {
    if (visible) {
      if (existingImageConfig && existingImageConfig.fixedTags) {
        setFixedTags(existingImageConfig.fixedTags);
      } else {
        setFixedTags([]);
      }
      if (existingImageConfig) {
        setPositiveTags(existingImageConfig.positiveTags || []);
        setNegativeTags(existingImageConfig.negativeTags || []);
        setSelectedArtistPrompt(existingImageConfig.artistPrompt);
        setUseExistingArtistPrompt(!!existingImageConfig.artistPrompt);
        setCustomPrompt(existingImageConfig.customPrompt || '');
        setCharacterTags(existingImageConfig.characterTags || []);

        if (existingImageConfig.seed !== undefined && existingImageConfig.seed !== null) {
          setNovelaiSettings(prev => ({ ...prev, seed: String(existingImageConfig.seed) }));
          setGeneratedSeed(Number(existingImageConfig.seed));
        } else {
          setNovelaiSettings(prev => ({ ...prev, seed: '' }));
          setGeneratedSeed(null);
        }
        if (existingImageConfig.novelaiSettings) {
          setNovelaiSettings(prev => ({ ...prev, ...existingImageConfig.novelaiSettings }));
        }
        if (existingImageConfig.animagine4Settings) {
          setAnimagine4Settings(prev => ({ ...prev, ...existingImageConfig.animagine4Settings }));
        }
      } else if (character.generationData?.appearanceTags) {
        setPositiveTags(character.generationData.appearanceTags.positive || []);
        setNegativeTags(character.generationData.appearanceTags.negative || []);
        if (character.generationData.appearanceTags.artistPrompt) {
          setSelectedArtistPrompt(character.generationData.appearanceTags.artistPrompt);
          setUseExistingArtistPrompt(true);
        } else {
          setSelectedArtistPrompt(null);
        }
        setCharacterTags([]);
        setNovelaiSettings(prev => ({ ...prev, seed: '' }));
        setGeneratedSeed(null);
      } else {
        setPositiveTags([]);
        setNegativeTags([]);
        setSelectedArtistPrompt(null);
        setCharacterTags([]);
        setNovelaiSettings(prev => ({ ...prev, seed: '' }));
        setGeneratedSeed(null);
      }
        setGeneratedImageUrl(null);
        setError(null);
        setIsLoading(false);
        setProgressMessage(null);
        setReplaceBackground(false);
        setReplaceAvatar(false);
        if (!existingImageConfig) {
          setCustomPrompt('');
        }
        setGenerationSettings({ ...DEFAULT_GENERATION_SETTINGS });
        setAnimagine4Settings({ ...DEFAULT_ANIMAGINE4_SETTINGS });
      }
  }, [visible, character?.id, existingImageConfig]);
  useEffect(() => {
    setFixedTags(prev => prev.filter(tag => positiveTags.includes(tag)));
  }, [positiveTags]);
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (
        nextAppState === 'active' &&
        visible &&
        isLoading &&
        pollingTaskIdRef.current &&
        pollingCharacterIdRef.current
      ) {
        checkImageGenerationStatus(pollingCharacterIdRef.current, pollingTaskIdRef.current);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [visible, isLoading]);

  useEffect(() => {
    if (visible && imageProvider === 'novelai' && settingsLoaded) {
      if (!novelaiSettings.seed || novelaiSettings.seed === '') {
        const randomSeed = Math.floor(Math.random() * 2 ** 32).toString();
        setNovelaiSettings(prev => ({ ...prev, seed: randomSeed }));
        setGeneratedSeed(Number(randomSeed));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageProvider, settingsLoaded]);

  const handleAddCharacterPrompt = () => {
    setCharacterPrompts(prev => [
      ...prev, 
      {
        prompt: '',  
        position: { x: 0.5, y: 0.5 },
        color: DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length]
      }
    ]);
  };

  const handleRemoveCharacterPrompt = (index: number) => {
    setCharacterPrompts(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCharacterPrompt = (index: number, prompt: string) => {
    setCharacterPrompts(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, prompt } : item
      )
    );
  };

  const handlePositionChange = (index: number, position: { x: number, y: number }) => {
    setCharacterPrompts(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, position } : item
      )
    );
  };

  const getCharacterPromptsData = (): CharacterPromptData[] => {
    let prompts: CharacterPrompt[] = [...characterPrompts];
    if (
      imageProvider === 'novelai' &&
      characterTags.length > 0 &&
      !prompts.some(
        p =>
          p.prompt === characterTags.join(', ') &&
          p.position.x === 0 &&
          p.position.y === 0
      )
    ) {
      prompts = [
        ...prompts,
        {
          prompt: characterTags.join(', '),
          position: { x: 0, y: 0 },
          color: '#70A1FF', 
        },
      ];
    }
    return prompts.map(char => ({
      prompt: char.prompt,
      positions: [char.position],
    }));
  };

  const handleSeedChange = (text: string) => {
    if (text === '' || (!isNaN(Number(text)) && Number(text) >= 0)) {
      setNovelaiSettings(prev => ({ ...prev, seed: text }));
    }
  };

  const updateImageSize = (presetId: string) => {
    const preset = IMAGE_SIZE_PRESETS.find(p => p.id === presetId) || IMAGE_SIZE_PRESETS[0];
    setSizePresetId(presetId);
    setGenerationSettings(prev => ({
      ...prev,
      width: preset.width,
      height: preset.height
    }));
  };

  const handleAddCharacterTag = (tagString: string) => {
    if (!characterTags.includes(tagString)) {
      setCharacterTags(prev => [...prev, tagString]);
    }
  };

  const handleAddCharacterPromptTag = (tagString: string) => {
    if (characterTagSelectorForCharacterPrompt !== null) {
      const index = characterTagSelectorForCharacterPrompt;
      const currentPrompt = characterPrompts[index].prompt;
      const updatedPrompt = currentPrompt ? 
        `${currentPrompt}, ${tagString}` : 
        tagString;
      
      handleUpdateCharacterPrompt(index, updatedPrompt);
      setCharacterTagSelectorForCharacterPrompt(null);
    }
  };

  const removeCharacterTag = (tagToRemove: string) => {
    setCharacterTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleAddCustomPrompt = () => {
    if (customPrompt.trim()) {
      const customTag = customPrompt.trim();
      if (!positiveTags.includes(customTag)) {
        setPositiveTags(prev => [...prev, customTag]);
      }
      setCustomPrompt('');
      setCustomPromptModalVisible(false);
    }
  };

  const organizeTagsForPrompt = () => {
    const genderTags = positiveTags.filter(tag => 
      maleGenderTags.includes(tag.replace(/^\{+|\}+$/g, '').replace(/^\[+|\]+$/g, '')) ||
      femaleGenderTags.includes(tag.replace(/^\{+|\}+$/g, '').replace(/^\[+|\]+$/g, ''))
    );
    
    const qualityTags = DEFAULT_POSITIVE_PROMPTS;
    
    const normalTags = positiveTags.filter(tag => 
      !maleGenderTags.includes(tag.replace(/^\{+|\}+$/g, '').replace(/^\[+|\]+$/g, '')) &&
      !femaleGenderTags.includes(tag.replace(/^\{+|\}+$/g, '').replace(/^\[+|\]+$/g, ''))
    );

    const ratingTag = imageProvider === 'animagine4' ? "safe" : null;
    
    const artistTag = selectedArtistPrompt && useExistingArtistPrompt
      ? cleanArtistTag(selectedArtistPrompt, imageProvider)
      : null;
    
    return {
      genderTags,
      characterTags,
      artistTag,
      ratingTag,
      normalTags,
      qualityTags
    };
  };

  const buildPrompts = () => {
    const {
      genderTags,
      characterTags,
      artistTag,
      ratingTag,
      normalTags,
      qualityTags
    } = organizeTagsForPrompt();
    
    if (imageProvider === 'novelai') {
      const mainPromptParts = [
        ...genderTags,
        ...qualityTags,
        ...normalTags,
        artistTag
      ].filter(Boolean);
      
      return {
        mainPrompt: mainPromptParts.join(', '),
        characterPrompt: characterTags.join(', '),
        negativePrompt: DEFAULT_NEGATIVE_PROMPTS.join(', ')
      };
    } else {
      const promptParts = [
        ...genderTags,
        ...characterTags,
        artistTag,
        ratingTag,
        ...normalTags,
        ...qualityTags
      ].filter(Boolean);
      
      return {
        mainPrompt: promptParts.join(','),
        characterPrompt: '',
        negativePrompt: DEFAULT_NEGATIVE_PROMPTS.join(',')
      };
    }
  };

  // 生成流程前重置abort标记
  const submitImageGeneration = async () => {
    if ((positiveTags.length === 0 && characterTags.length === 0)) {
      Alert.alert('无法生成', '请至少添加一个正面标签或角色标签来描述角色外观');
      return;
    }
    abortRef.current.aborted = false; // 新增
    setIsLoading(true);
    setError(null);
    setPreviewImageUrl(null);
    setProgressMessage('正在准备生成...');

    try {
      if (imageProvider === 'novelai') {
        await generateWithNovelAI();
      } else {
        await generateWithAnimagine4();
      }
    } catch (error) {
      console.error('[图片重生成] 生成失败:', error);
      setError(error instanceof Error ? error.message : '生成图像失败');
      setIsLoading(false);
    }
  };

  const generateWithNovelAI = async () => {
    try {
      // --- 新增：自动从settings-helper获取NovelAI API设置 ---
      const settings = getUserSettingsGlobally();
      let useCustomEndpoint = false;
      let customEndpoint = '';
      let customToken = '';
      if (settings?.chat?.novelai) {
        useCustomEndpoint = !!settings.chat.novelai.useCustomEndpoint;
        customEndpoint = settings.chat.novelai.customEndpoint || '';
        customToken = settings.chat.novelai.customToken || '';
      }

      // 选择token和endpoint
      let apiToken = novelaiToken;
      let apiEndpoint: string | undefined = undefined;
      if (useCustomEndpoint && customEndpoint && customToken) {
        apiToken = customToken;
        // 自动拼接/generate-image后缀（如果没有）
        apiEndpoint = customEndpoint.endsWith('/generate-image')
          ? customEndpoint
          : customEndpoint.replace(/\/+$/, '') + '/generate-image';
      }

      if (!apiToken) {
        throw new Error("未设置NovelAI Token，请在API设置中配置");
      }
      
      if (!isTokenValid && !useCustomEndpoint) {
        setProgressMessage('正在验证NovelAI Token...');
        const valid = await NovelAIService.validateToken(apiToken);
        if (!valid) {
          throw new Error("NovelAI Token无效或已过期，请检查API设置");
        }
        setIsTokenValid(true);
      }

      const { mainPrompt, negativePrompt } = buildPrompts();
      
      console.log(`[图片重生成] 使用NovelAI为角色 "${character.name}" 生成新图像`);
      console.log(`[图片重生成] 主提示词: ${mainPrompt}`);
      console.log(`[图片重生成] 角色提示词:`, characterPrompts.map(p => p.prompt).join(', '));
      console.log(`[图片重生成] 负向提示词: ${negativePrompt}`);
      
      const sizePreset = IMAGE_SIZE_PRESETS.find(preset => preset.id === sizePresetId) || IMAGE_SIZE_PRESETS[0];
      
      setProgressMessage('NovelAI正在生成图像...');
      
      const seedValue = novelaiSettings.seed ? parseInt(novelaiSettings.seed) : Math.floor(Math.random() * 2 ** 32);
      console.log(`[图片重生成] 使用seed值: ${seedValue}`);
      
      const generateParams = {
        token: apiToken,
        prompt: mainPrompt,
        characterPrompts: characterPrompts.length > 0 ? getCharacterPromptsData() : undefined,
        negativePrompt,
        model: novelaiSettings.model,
        width: sizePreset.width,
        height: sizePreset.height,
        steps: novelaiSettings.steps,
        scale: novelaiSettings.scale,
        sampler: novelaiSettings.sampler,
        seed: seedValue,
        noiseSchedule: novelaiSettings.noiseSchedule,
        useCoords: novelaiSettings.useCoords,
        useOrder: novelaiSettings.useOrder,
        ...(apiEndpoint ? { endpoint: apiEndpoint } : {})
      };

      console.log(`[图片重生成] NovelAI参数设置:`, {
        model: novelaiSettings.model,
        width: sizePreset.width,
        height: sizePreset.height,
        steps: novelaiSettings.steps,
        scale: novelaiSettings.scale,
        sampler: novelaiSettings.sampler,
        noiseSchedule: novelaiSettings.noiseSchedule,
        seed: seedValue,
        useCoords: novelaiSettings.useCoords,
        useOrder: novelaiSettings.useOrder
      });

      const result = await NovelAIService.generateImage(generateParams);
      
      if (result && result.imageUrls && result.imageUrls.length > 0) {
        console.log(`[图片重生成] NovelAI生成成功，获取到 ${result.imageUrls.length} 张图像`);
        setGeneratedSeed(result.seed); 
        
        const imageUrl = result.imageUrls[0];
        const isLocalNovelAIFile = imageUrl.includes('#localNovelAI');
        const cleanImageUrl = isLocalNovelAIFile ? imageUrl.split('#localNovelAI')[0] : imageUrl;
        
        console.log(`[图片重生成] 图像URL: ${cleanImageUrl}, 是本地NovelAI文件: ${isLocalNovelAIFile}`);
        
        setPreviewImageUrl(cleanImageUrl);
        
        const completedImage: CharacterImage = {
          id: `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          url: cleanImageUrl,
          characterId: character.id,
          createdAt: Date.now(),
          tags: {
            positive: [...characterTags, ...positiveTags],
            negative: DEFAULT_NEGATIVE_PROMPTS,
          },
          isFavorite: false,
          generationStatus: 'success',
          localUri: isLocalNovelAIFile ? cleanImageUrl : undefined,
          setAsBackground: replaceBackground,
          isAvatar: replaceAvatar,
          seed: result.seed, 
          isNovelAI: true, // 新增
          generationConfig: {
            positiveTags: positiveTags,
            negativeTags: negativeTags,
            artistPrompt: selectedArtistPrompt,
            customPrompt: '',
            useCustomPrompt: false,
            characterTags: characterTags,
            seed: result.seed, 
            novelaiSettings, 
            animagine4Settings,
            isNovelAI: true, // 新增
          }
        };
        
        setIsLoading(false);
        setGeneratedImageUrl(cleanImageUrl);
        setProgressMessage(null);
        
        return;
      } else {
        throw new Error("NovelAI未返回有效图像");
      }
    } catch (error) {
      console.error('[图片重生成] NovelAI生成失败:', error);
      throw error;
    }
  };

  const generateWithAnimagine4 = async () => {
    try {
      const { mainPrompt: positivePrompt, negativePrompt } = buildPrompts();

      console.log(`[图片重生成] 正在为角色 "${character.name}" 生成新图像`);
      console.log(`[图片重生成] 正向提示词: ${positivePrompt}`);
      console.log(`[图片重生成] 负向提示词: ${negativePrompt}`);
      
      const sizePreset = IMAGE_SIZE_PRESETS.find(preset => preset.id === sizePresetId) || IMAGE_SIZE_PRESETS[0];
      const actualSettings = {
width: sizePreset.width,
        height: sizePreset.height,
        steps: animagine4Settings.steps,
        batch_size: animagine4Settings.batch_size
      };
      
      console.log(`[图片重生成] 图像生成设置:`, actualSettings);

      setProgressMessage('正在验证...');
      
      if (!licenseService.isInitialized()) {
        console.log(`[图片重生成] 初始化服务...`);
        await licenseService.initialize();
      }

      const isLicenseValid = await licenseService.hasValidLicense();
      if (!isLicenseValid) {
        console.error(`[图片重生成] 验证失败`);
      }

      const licenseInfo = await licenseService.getLicenseInfo();
      const userEmail = licenseInfo?.email || licenseInfo?.customerEmail || '';

      setProgressMessage('正在发送图像生成请求...');
      
      const requestData = {
        prompt: positivePrompt,
        negative_prompt: negativePrompt,
        width: actualSettings.width,
        height: actualSettings.height,
        steps: actualSettings.steps,
        batch_size: actualSettings.batch_size,
        email: userEmail
      };

      const licenseHeaders = await licenseService.getLicenseHeaders();

      if (!licenseHeaders || !licenseHeaders['X-License-Key'] || !licenseHeaders['X-Device-ID']) {
        console.error(`[图片重生成] 请求头信息不完整`);
      }

      if (userEmail) console.log(`[图片重生成] 使用用户邮箱: ${userEmail}`);

      const response = await fetch(`${IMAGE_SERVICE_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...licenseHeaders
        },
        body: JSON.stringify(requestData),
      });

      console.log(`[图片重生成] 服务器响应状态: ${response.status}`);

      const responseText = await response.text();
      console.log(`[图片重生成] 原始响应内容: ${responseText}`);

      let data;
      try {
        data = JSON.parse(responseText);
        console.log(`[图片重生成] 解析的响应数据:`, data);
      } catch (parseError) {
        console.error(`[图片重生成] 响应不是有效的JSON: ${parseError}`);
        throw new Error(`服务器返回的不是有效的JSON: ${responseText.substring(0, 100)}...`);
      }

      if (!response.ok) {
        console.error(`[图片重生成] 服务器响应错误: HTTP ${response.status}`);
        let errorDetail = '';
        try {
          const errorObj = JSON.parse(responseText);
          if (errorObj.error) {
            errorDetail = errorObj.error;
          }
        } catch (e) {
          errorDetail = responseText;
        }
        throw new Error(`服务器响应错误: ${response.status} - ${errorDetail || '未知错误'}`);
      }

      let taskId = '';
      let isSuccess = false;

      if (data.success === true) {
        isSuccess = true;
        taskId = data.data?.taskId || '';
        console.log(`[图片重生成] 任务提交成功，ID: ${taskId}`);
        setProgressMessage(`任务已提交，任务ID: ${taskId.substring(0, 8)}...`);
      } else if (data.error) {
        console.error(`[图片重生成] 请求失败: ${data.error}`);
        throw new Error(data.error);
      } else if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
        console.log(`[图片重生成] 服务器直接返回了图片URL: ${data.urls[0]}`);
        
        setPreviewImageUrl(data.urls[0]);
        setProgressMessage('图像生成完成');
        
        const completedImage: CharacterImage = {
          id: `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          url: data.urls[0],
          characterId: character.id,
          createdAt: Date.now(),
          tags: {
            positive: [...characterTags, ...positiveTags],
            negative: DEFAULT_NEGATIVE_PROMPTS,
          },
          isFavorite: false,
          generationStatus: 'success',
          setAsBackground: replaceBackground,
          isAvatar: replaceAvatar,
          generationConfig: {
            positiveTags: positiveTags,
            negativeTags: negativeTags,
            artistPrompt: selectedArtistPrompt,
            customPrompt: '',
            useCustomPrompt: false,
            characterTags: characterTags,
            seed: generatedSeed, 
            novelaiSettings, 
            animagine4Settings 
          }
        };
        
        setIsLoading(false);
        setGeneratedImageUrl(data.urls[0]);
        setProgressMessage(null);
        
        return;
      }

      if (isSuccess && taskId) {
        const generationConfig = {
          positiveTags: positiveTags,
          negativeTags: negativeTags,
          artistPrompt: selectedArtistPrompt,
          customPrompt: '',
          useCustomPrompt: false,
          characterTags: characterTags
        };

        checkImageGenerationStatus(character.id, taskId);
        
        return;
      } else {
        throw new Error('未能获取有效的任务ID，服务器返回的数据格式不正确');
      }
    } catch (error) {
      console.error('[图片重生成] Animagine4生成失败:', error);
      throw error;
    }
  };

  // 在轮询和异步流程中增加中断判断
  const checkImageGenerationStatus = async (characterId: string, taskId: string) => {
    console.log(`[图片重生成] 开始检查任务状态: ${taskId}`);

    pollingTaskIdRef.current = taskId;
    pollingCharacterIdRef.current = characterId;

    const MAX_RETRIES = 60;
    let retries = 0;

    const poll = async () => {
      if (abortRef.current.aborted) {
        setIsLoading(false);
        setProgressMessage(null);
        return;
      }

      try {
        retries++;
        console.log(`[图片重生成] 检查 #${retries}, 任务: ${taskId}`);
        setProgressMessage(`正在检查任务状态... (${retries}/${MAX_RETRIES})`);

        const licenseHeaders = await licenseService.getLicenseHeaders();

        const headers = {
          'Accept': 'application/json',
          ...(licenseHeaders || {})
        };

        let response;
        try {
          response = await fetch(`${IMAGE_SERVICE_BASE_URL}/api/generate/task/${taskId}`, {
            headers: headers
          });

          console.log(`[图片重生成] 状态检查响应: ${response.status}`);
        } catch (fetchError) {
          console.error(`[图片重生成] 状态检查请求失败:`, fetchError);
          if (retries < MAX_RETRIES) {
            return setTimeout(poll, 15000);
          } else {
            throw fetchError;
          }
        }

        const responseText = await response.text();
        console.log(`[图片重生成] 状态检查原始响应: ${responseText}`);

        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`[图片重生成] 解析的状态数据:`, data);
        } catch (parseError) {
          console.warn(`[图片重生成] 状态响应不是有效的JSON:`, parseError);
          if (retries < MAX_RETRIES) {
            return setTimeout(poll, 10000);
          } else {
            throw new Error(`无法解析服务器响应: ${responseText.substring(0, 100)}...`);
          }
        }

        const taskData = data.data || {};
        const status = taskData.status || '';

        const isDone = status === 'succeeded' || status === 'failed' || taskData.completedAt;
        const isSuccess = status === 'succeeded';
        const imageUrls = taskData.urls || [];
        const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
        const errorMessage = taskData.error || null;

        if (isDone) {
          if (isSuccess && imageUrl) {
            console.log(`[图片重生成] 图像生成成功: ${imageUrl}`);
            
            setPreviewImageUrl(imageUrl);
            setProgressMessage('图像生成完成');

            const completedImage: CharacterImage = {
              id: `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              url: imageUrl,
              characterId: characterId,
              createdAt: Date.now(),
              tags: {
                positive: [...characterTags, ...positiveTags],
                negative: negativeTags,
              },
              isFavorite: false,
              generationStatus: 'success',
              generationTaskId: undefined,
              setAsBackground: replaceBackground,
              isAvatar: false,
              generationConfig: {
                positiveTags: positiveTags,
                negativeTags: negativeTags,
                artistPrompt: selectedArtistPrompt,
                customPrompt: '',
                useCustomPrompt: false,
                characterTags: characterTags,
                seed: generatedSeed, 
                novelaiSettings, 
                animagine4Settings 
              }
            };

            setIsLoading(false);
            setGeneratedImageUrl(imageUrl);
            setProgressMessage(null);
            
            return;
          } else if (errorMessage) {
            console.error(`[图片重生成] 任务失败: ${errorMessage}`);
            setError(`生成失败: ${errorMessage}`);
            setIsLoading(false);
            return;
          } else {
            console.warn(`[图片重生成] 任务标记为完成，但未返回图片URL或错误信息`);
            setError('任务完成但未返回图像');
            setIsLoading(false);
            return;
          }
        } else {
          console.log(`[图片重生成] 任务状态: ${status}`);
        }

        if (retries < MAX_RETRIES) {
          console.log(`[图片重生成] 将在5秒后再次检查`);
          setTimeout(poll, 5000);
        } else {
          console.log(`[图片重生成] 达到最大检查次数 (${MAX_RETRIES})，但任务仍未完成`);
          setError('检查超时，请稍后在图库中查看结果');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[图片重生成] 检查任务状态出错:', error);
        if (retries < MAX_RETRIES) {
          console.log(`[图片重生成] 将在15秒后重试...`);
          setTimeout(poll, 15000);
        } else {
          console.error(`[图片重生成] 达到最大重试次数 (${MAX_RETRIES})，停止检查`);
          setError('检查状态时出错，请稍后在图库中查看结果');
          setIsLoading(false);
        }
      } finally {
        if (retries >= MAX_RETRIES) {
          pollingTaskIdRef.current = null;
          pollingCharacterIdRef.current = null;
        }
      }
    };

    poll();
  };

  const handleUseImage = async (completedImage: CharacterImage) => {
    // 新增：立即持久化图片
    if (onPersistImage) {
      await onPersistImage(completedImage);
    }
    onSuccess(
      completedImage,
      {
        imageProvider,
        sizePresetId,
        novelaiSettings,
        animagine4Settings,
      },
      completedImage.seed || novelaiSettings.seed
    );
  };

  const renderCharacterTags = () => {
    if (characterTags.length === 0) {
      return (
        <Text style={styles.noTagsText}>未选择角色标签</Text>
      );
    }
    return (
      <View style={styles.tagsContainer}>
        {characterTags.map((tag, index) => (
          <TouchableOpacity
            key={`char-tag-${index}`}
            style={[styles.characterTag, tagManageStyle]}
            onPress={() => handleCharacterTagPress(tag)}
          >
            <Text style={styles.characterTagText}>{tag}</Text>
            {manageMode && (
              <Ionicons 
                name="close-circle" 
                size={14} 
                color="rgba(255,255,255,0.7)" 
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderUnifiedTagDisplay = () => {
    if (positiveTags.length === 0 && negativeTags.length === 0) {
      return (
        <Text style={styles.noTagsText}>未添加任何标签</Text>
      );
    }
    return (
      <View style={styles.unifiedTagsContainer}>
        {positiveTags.map((tag, index) => (
          <TouchableOpacity
            key={`pos-tag-${index}`}
            style={[
              styles.selectedPositiveTag,
              tagManageStyle,
              tagLockStyle(tag)
            ]}
            onPress={() => handlePositiveTagPress(tag)}
          >
            <Text style={[
              styles.tagText,
              fixedTags.includes(tag) && lockMode === 'none' && styles.fixedTagText
            ]}>
              {tag}
            </Text>
            {manageMode && !fixedTags.includes(tag) && (
              <Ionicons name="close-circle" size={14} color="rgba(0,0,0,0.5)" />
            )}
          </TouchableOpacity>
        ))}
        {negativeTags.map((tag, index) => (
          <TouchableOpacity
            key={`neg-tag-${index}`}
            style={styles.selectedNegativeTag}
          >
            <Text style={styles.negativeTagText}>{tag}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderActionButtonsBar = () => {
    return (
      <View style={styles.actionButtonsBar}>
      </View>
    );
  };
  
  const renderProviderSelector = () => {
    return (
      <View style={styles.providerSelectorContainer}>
        <Text style={styles.providerSelectorLabel}>模型选择:</Text>
        <View style={styles.providerOptions}>
          <TouchableOpacity
            style={[
              styles.providerOption,
              imageProvider === 'animagine4' && styles.selectedProviderOption
            ]}
            onPress={() => setImageProvider('animagine4')}
          >
            <Text 
              style={[
                styles.providerOptionText,
                imageProvider === 'animagine4' && styles.selectedProviderOptionText
              ]}
            >
              Animagine 4
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.providerOption,
              imageProvider === 'novelai' && styles.selectedProviderOption,
              !isTokenValid && styles.disabledProviderOption
            ]}
            onPress={() => {
              setImageProvider('novelai');
            }}
          >
            <Text 
              style={[
                styles.providerOptionText,
                imageProvider === 'novelai' && styles.selectedProviderOptionText,
                !isTokenValid && styles.disabledProviderOptionText
              ]}
            >
              NovelAI {!isTokenValid && novelaiToken ? '(未验证)' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  const renderSizeSelector = () => {
    return (
      <View style={styles.sizeSelectorContainer}>
        <Text style={styles.sizeSelectorLabel}>图像尺寸:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {IMAGE_SIZE_PRESETS.map(preset => (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.sizeOption,
                sizePresetId === preset.id && styles.selectedSizeOption
              ]}
              onPress={() => updateImageSize(preset.id)}
            >
              <Text style={[
                styles.sizeOptionText,
                sizePresetId === preset.id && styles.selectedSizeOptionText
              ]}>
                {preset.name}
              </Text>
              <Text style={styles.sizeOptionDimensions}>
                {`${preset.width}×${preset.height}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderAnimagine4Settings = () => {
    if (imageProvider !== 'animagine4') return null;
    
    return (
      <View style={styles.animagineSettingsContainer}>
        <View style={styles.settingHeader}>
          <Text style={styles.settingHeaderText}>Animagine 4 设置</Text>
        </View>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>步数:</Text>
          <View style={styles.settingInputContainer}>
            <TextInput
              style={styles.settingInput}
              value={String(animagine4Settings.steps)}
              onChangeText={(text) => {
                const steps = parseInt(text);
                if (!isNaN(steps) && steps > 0) {
                  setAnimagine4Settings({
                    ...animagine4Settings,
                    steps
                  });
                }
              }}
              keyboardType="numeric"
              maxLength={3}
              placeholderTextColor="#888"
            />
          </View>
        </View>
      </View>
    );
  };
  
  const renderCharacterPrompts = () => {
    if (imageProvider !== 'novelai') return null;
    
    return (
      <View style={styles.characterPromptsContainer}>
        <View style={styles.characterPromptsHeader}>
          <Text style={styles.characterPromptsTitle}>角色提示词</Text>
          <TouchableOpacity 
            style={styles.positionControlButton}
            onPress={() => setShowCharacterPositionControls(!showCharacterPositionControls)}
          >
            <Ionicons 
              name={showCharacterPositionControls ? "grid" : "location-outline"} 
              size={18} 
              color="#ddd" 
            />
            <Text style={styles.positionControlButtonText}>
              {showCharacterPositionControls ? "返回列表" : "位置控制"}
            </Text>
          </TouchableOpacity>
        </View>
        
        {showCharacterPositionControls ? (
          <View style={styles.characterPositionContainer}>
            <CharacterPosition 
              characters={characterPrompts}
              width={generationSettings.width}
              height={generationSettings.height}
              onPositionChange={handlePositionChange}
            />
            
            <View style={styles.useCoordinatesRow}>
              <Text style={styles.settingLabel}>使用坐标控制:</Text>
              <Switch
                value={novelaiSettings.useCoords}
                onValueChange={(value) => setNovelaiSettings(prev => ({ ...prev, useCoords: value }))}
                trackColor={{ false: '#767577', true: '#8a2be2' }}
                thumbColor={novelaiSettings.useCoords ? '#f5dd4b' : '#f4f3f4'}
              />
            </View>
          </View>
        ) : (
          <View>
            {characterPrompts.map((prompt, index) => (
              <View key={`char-prompt-${index}`} style={styles.characterPromptItem}>
                <View style={styles.characterPromptHeader}>
                  <View 
                    style={[
                      styles.characterColorIndicator, 
                      { backgroundColor: prompt.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length] }
                    ]}
                  >
                    <Text style={styles.characterColorText}>{index + 1}</Text>
                  </View>
                  
                  <View style={styles.characterPromptCoordinates}>
                    <Text style={styles.coordinateText}>
                      X: {prompt.position.x.toFixed(2)}, Y: {prompt.position.y.toFixed(2)}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.characterPromptRemoveButton}
                    onPress={() => handleRemoveCharacterPrompt(index)}
                    disabled={characterPrompts.length <= 1}
                  >
                    <Ionicons 
                      name="close-circle" 
                      size={22} 
                      color={characterPrompts.length <= 1 ? "#666" : "#f66"} 
                    />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.characterPromptInputRow}>
                  <TextInput
                    style={styles.characterPromptInput}
                    value={prompt.prompt}
                    onChangeText={(text) => handleUpdateCharacterPrompt(index, text)}
                    placeholder="输入角色提示词..."
                    placeholderTextColor="#888"
                  />
                  
                  <View style={styles.characterPromptActionButtons}>
                    <TouchableOpacity
                      style={styles.addTagToCharacterButton}
                      onPress={() => setCharacterTagSelectorForPromptIndex(index)}
                    >
                      <Ionicons name="pricetag-outline" size={18} color="#ddd" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.addCharacterTagButton}
                      onPress={() => setCharacterTagSelectorForCharacterPrompt(index)}
                    >
                      <Ionicons name="person-outline" size={18} color="#ddd" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
            
            <TouchableOpacity
              style={styles.addCharacterPromptButton}
              onPress={handleAddCharacterPrompt}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.addCharacterPromptText}>添加角色</Text>
            </TouchableOpacity>
            
            <Text style={styles.characterPromptsHelp}>
              提示: 每个角色可以添加自己的提示词，包括角色名称和描述（如站姿、表情等）
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderSeedControl = () => {
    if (imageProvider !== 'novelai') return null;
    
    return (
      <View style={styles.seedControlContainer}>
        <Text style={styles.settingLabel}>Seed 值:</Text>
        <View style={styles.seedInputContainer}>
          <TextInput
            style={styles.settingInput}
            value={novelaiSettings.seed}
            onChangeText={handleSeedChange}
            keyboardType="numeric"
            placeholder="随机"
            placeholderTextColor="#888"
          />
          
          <TouchableOpacity
            style={styles.randomSeedButton}
            onPress={() => {
              const randomSeed = Math.floor(Math.random() * 2 ** 32).toString();
              setNovelaiSettings(prev => ({ ...prev, seed: randomSeed }));
            }}
          >
            <Ionicons name="refresh" size={18} color="#ddd" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  const renderNovelAISettings = () => {
    if (imageProvider !== 'novelai') return null;
    
    return (
      <View style={styles.novelAISettingsContainer}>
        <View style={styles.settingHeader}>
          <Text style={styles.settingHeaderText}>NovelAI 设置</Text>
          <TouchableOpacity 
            style={styles.settingHeaderButton}
            onPress={() => setNovelaiSettingsVisible(true)}
          >
            <Ionicons name="settings-outline" size={18} color="#ddd" />
            <Text style={styles.settingHeaderButtonText}>高级设置</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.novelAIModelSelector}>
          <Text style={styles.modelSelectorLabel}>模型:</Text>
          <View style={styles.modelOptions}>
            {Object.keys(NOVELAI_MODELS).map(modelName => (
              <TouchableOpacity
                key={modelName}
                style={[
                  styles.modelOption,
                  novelaiSettings.model === modelName && styles.selectedModelOption
                ]}
                onPress={() => setNovelaiSettings({
                  ...novelaiSettings,
                  model: modelName
                })}
              >
                <Text style={[
                  styles.modelOptionText,
                  novelaiSettings.model === modelName && styles.selectedModelOptionText
                ]}>
                  {modelName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>步数:</Text>
          <View style={styles.settingInputContainer}>
            <TextInput
              style={styles.settingInput}
              value={String(novelaiSettings.steps)}
              onChangeText={(text) => {
                const steps = parseInt(text);
                if (!isNaN(steps) && steps > 0) {
                  setNovelaiSettings({
                    ...novelaiSettings,
                    steps
                  });
                }
              }}
              keyboardType="numeric"
              maxLength={3}
              placeholderTextColor="#888"
            />
          </View>
        </View>
        
        {renderSeedControl()}
        
        {generatedSeed && (
          <View style={styles.generatedSeedContainer}>
            <Text style={styles.generatedSeedLabel}>已生成Seed:</Text>
            <Text style={styles.generatedSeedValue}>{generatedSeed}</Text>
            <TouchableOpacity
              style={styles.copySeedButton}
              onPress={() => {
                setNovelaiSettings(prev => ({ ...prev, seed: generatedSeed.toString() }));
              }}
            >
              <Ionicons name="copy-outline" size={16} color="#ddd" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };
  
  const renderArtistPromptDisplay = () => {
    if (!selectedArtistPrompt) return null;
    return (
      <View style={styles.artistPromptDisplayContainer}>
        <Ionicons name="color-palette-outline" size={16} color="#ff9f1c" style={{marginRight: 4}} />
        <Text style={styles.artistPromptDisplayText}>
          {selectedArtistPrompt}
        </Text>
        <TouchableOpacity
          style={styles.artistPromptRemoveButton}
          onPress={() => setSelectedArtistPrompt(null)}
        >
          <Ionicons name="close" size={16} color="#aaa" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderTagHeaderButtons = () => (
    <View style={styles.tagHeaderButtons}>
      {/* 只保留锁定/解锁切换按钮 */}
      <TouchableOpacity
        style={[
          styles.tagHeaderButton,
          lockMode === 'lock' && { backgroundColor: '#ff9f1c' }
        ]}
        onPress={() => setLockMode(mode => (mode === 'none' ? 'lock' : 'none'))}
      >
        <Ionicons
          name={lockMode === 'lock' ? 'lock-closed' : 'lock-open'}
          size={16}
          color={lockMode === 'none' ? '#ff9f1c' : '#fff'}
        />
      </TouchableOpacity>
      {/* 其它按钮... */}
      <TouchableOpacity
        style={styles.tagHeaderButton}
        onPress={handleRollTags}
      >
        <Ionicons name="dice-outline" size={16} color="#ff9f1c" />
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.tagHeaderButton}
        onPress={() => setTagSelectorVisible(true)}
      >
        <Ionicons name="pricetag-outline" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.tagHeaderButton}
        onPress={() => setCharacterTagSelectorVisible(true)}
      >
        <Ionicons name="person-add-outline" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.tagHeaderButton}
        onPress={() => setArtistReferenceSelectorVisible(true)}
      >
        <Ionicons name="color-palette-outline" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tagHeaderButton,
          tagWeightMode === 'increase' && { backgroundColor: '#ff9f1c' },
          tagWeightMode === 'decrease' && { backgroundColor: '#FF4444' }
        ]}
        onPress={() => {
          setTagWeightMode(mode => 
            mode === 'none' ? 'increase' : mode === 'increase' ? 'decrease' : 'none'
          );
        }}
      >
        <Ionicons
          name={
            tagWeightMode === 'increase'
              ? 'arrow-up-circle'
              : tagWeightMode === 'decrease'
              ? 'arrow-down-circle'
              : 'swap-horizontal'
          }
          size={16}
          color={tagWeightMode === 'none' ? '#fff' : '#000'}
        />

      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tagHeaderButton,
          manageMode && { backgroundColor: '#ff9f1c' }
        ]}
        onPress={() => setManageMode(m => !m)}
      >
        <Ionicons name="construct-outline" size={16} color={manageMode ? '#000' : '#fff'} />
      </TouchableOpacity>
    </View>
  );

  const renderPreviewImage = () => {
    const imageUrl = generatedImageUrl || previewImageUrl;
    return (
      <View style={styles.previewImageContainer}>
        {imageUrl ? (
          <View style={styles.previewImageWrapper}>
            {/* 2. 点击图片可查看原图 */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (imageUrl) {
                  Linking.openURL(imageUrl);
                }
              }}
              style={{ flex: 1 }}
            >
              <Image 
                source={{ uri: imageUrl }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <View style={styles.overlayButtonsContainer}>
              <View style={styles.overlayOptionRow}>
                <TouchableOpacity 
                  style={[styles.overlayButton, replaceBackground && styles.activeOverlayButton]}
                  onPress={() => setReplaceBackground(!replaceBackground)}
                >
                  <Ionicons name="image" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.overlayButton, replaceAvatar && styles.activeOverlayButton]}
                  onPress={() => setReplaceAvatar(!replaceAvatar)}
                >
                  <Ionicons name="person" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.confirmOverlayButton}
                  onPress={async () => {
                    if (imageUrl) {
                      const completedImage: CharacterImage = {
                        id: `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                        url: imageUrl,
                        characterId: character.id,
                        createdAt: Date.now(),
                        tags: {
                          positive: [...characterTags, ...positiveTags],
                          negative: DEFAULT_NEGATIVE_PROMPTS,
                        },
                        isFavorite: false,
                        generationStatus: 'success',
                        localUri: imageUrl.includes('#localNovelAI') ? imageUrl.split('#localNovelAI')[0] : undefined,
                        setAsBackground: replaceBackground,
                        isAvatar: replaceAvatar,
                        isNovelAI: imageProvider === 'novelai',
                        seed: generatedSeed || undefined,
                        generationConfig: {
                          positiveTags: positiveTags,
                          negativeTags: negativeTags,
                          artistPrompt: selectedArtistPrompt,
                          customPrompt: '',
                          useCustomPrompt: false,
                          characterTags: characterTags,
                          seed: generatedSeed, 
                          isNovelAI: imageProvider === 'novelai',
                        }
                      };
                      console.log (`[图片重生成] 确认使用图像: ${completedImage.isNovelAI,completedImage.generationConfig?.isNovelAI}`);
                      if (replaceAvatar && setCharacterAvatar) {
                        await setCharacterAvatar(character.id, completedImage.localUri || completedImage.url);
                      }
                      if (replaceBackground && setCharacterBackgroundImage) {
                        // --- 新增：同步写入 backgroundImageConfig ---
                        await setCharacterBackgroundImage(
                          character.id,
                          completedImage.localUri || completedImage.url,
                          {
                            ...completedImage.generationConfig,
                            isNovelAI: completedImage.isNovelAI, // 强制同步
                            // 兼容其它参数
                            fixedTags: fixedTags,
                            novelaiSettings: novelaiSettings,
                            animagine4Settings: animagine4Settings,
                            sizePreset: IMAGE_SIZE_PRESETS.find(p => p.id === sizePresetId) || undefined,
                          }
                        );
                      }
                      await handleUseImage(completedImage);
                    }
                  }}
                >
                  <Text style={styles.confirmOverlayButtonText}>使用</Text>
                </TouchableOpacity>
              </View>
            </View>
            {generatedSeed && (
              <View style={styles.seedOverlay}>
                <Text style={styles.seedOverlayText}>Seed:{generatedSeed}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyPreviewContainer}>
            <Ionicons name="image-outline" size={64} color="#555" />
          </View>
        )}
      </View>
    );
  };

  const renderGenerationTab = () => (
    <View style={styles.tabContent}>
      {renderPreviewImage()}

      <View style={styles.tagSection}>
        <View style={styles.tagSectionHeader}>
          <Text style={styles.tagSectionTitle}>主提示词</Text>
          {renderTagHeaderButtons()}
        </View>
      </View>

      <ScrollView
        style={styles.generationScrollArea}
        contentContainerStyle={styles.generationScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderArtistPromptDisplay()}

        <View style={styles.expandedTagDisplayContainer}>
          {renderUnifiedTagDisplay()}
          <View style={styles.tagActionButtonsContainer}>
            <TouchableOpacity
              style={styles.tagActionButton}
              onPress={() => setCustomPromptModalVisible(true)}
            >
              <Ionicons name="pencil-outline" size={16} color="#ddd" />
              <Text style={styles.tagActionButtonText}>自定义提示词</Text>
            </TouchableOpacity>
            {/* 新增：seed输入和随机按钮，样式与自定义提示词按钮一致 */}
            {imageProvider === 'novelai' && (
              <View style={[styles.tagActionButton, { flexDirection: 'row', alignItems: 'center', marginLeft: 8 }]}>
                <Ionicons name="key-outline" size={16} color="#ddd" />
                <TextInput
                  style={{
                    color: '#fff',
                    fontSize: 13,
                    marginLeft: 6,
                    minWidth: 60,
                    paddingVertical: 0,
                    paddingHorizontal: 4,
                    backgroundColor: 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: '#ff9f1c',
                    marginRight: 4,
                  }}
                  value={novelaiSettings.seed}
                  onChangeText={handleSeedChange}
                  keyboardType="numeric"
                  placeholder="Seed"
                  placeholderTextColor="#888"
                  maxLength={16}
                />
                <TouchableOpacity
                  style={{ marginLeft: 2, padding: 2 }}
                  onPress={() => {
                    const randomSeed = Math.floor(Math.random() * 2 ** 32).toString();
                    setNovelaiSettings(prev => ({ ...prev, seed: randomSeed }));
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#ff9f1c" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        {characterTags.length > 0 && (
          <View style={styles.selectedCharacterTagsContainer}>
            <Text style={styles.tagSectionTitle}>已选角色</Text>
            {renderCharacterTags()}
          </View>
        )}
        {renderActionButtonsBar()}
      </ScrollView>

      <View style={styles.buttonContainer}>
        {/* 3. 优化生成按钮加载状态 */}
        <TouchableOpacity 
          style={[
            styles.generateButton,
            imageProvider === 'novelai' && styles.generateButtonNovelAI,
            isLoading && { opacity: 0.7 }
          ]}
          onPress={submitImageGeneration}
          disabled={isLoading}
          activeOpacity={isLoading ? 1 : 0.7}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.generateButtonText}>生成中...</Text>
            </>
          ) : (
            <>
              <Ionicons 
                name="image" 
                size={20} 
                color="#fff" 
              />
              <Text style={styles.generateButtonText}>生成</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#FF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
  
  const renderSettingsTab = () => (
    <View style={styles.tabContent}>
    <ScrollView showsVerticalScrollIndicator={false}>   
      {renderProviderSelector()}
      
      {renderSizeSelector()}
      
      {imageProvider === 'novelai' ? renderNovelAISettings() : renderAnimagine4Settings()}
      
      {imageProvider === 'novelai' && renderCharacterPrompts()}
      </ScrollView>   
    </View>
  );

  // 关闭时允许中断生成
  const handleClose = () => {
    abortRef.current.aborted = true;
    setIsLoading(false);
    setProgressMessage(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.fullScreenContainer}>
        <BlurView intensity={30} tint="dark" style={styles.fullScreenBlurView}>
          <View style={styles.header}>
            <Text style={styles.title}>图像生成</Text>
            {/* 修改：生成中也允许关闭 */}
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.GENERATION && styles.activeTab]}
              onPress={() => setActiveTab(TabType.GENERATION)}
            >
              <Ionicons
                name="image"
                size={20}
                color={activeTab === TabType.GENERATION ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.GENERATION && styles.activeTabText]}>
                生成
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === TabType.SETTINGS && styles.activeTab]}
              onPress={() => setActiveTab(TabType.SETTINGS)}
            >
              <Ionicons
                name="settings"
                size={20}
                color={activeTab === TabType.SETTINGS ? '#ff9f1c' : '#ccc'}
              />
              <Text style={[styles.tabText, activeTab === TabType.SETTINGS && styles.activeTabText]}>
                设置
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            {activeTab === TabType.GENERATION && renderGenerationTab()}
            {activeTab === TabType.SETTINGS && renderSettingsTab()}
          </View>
          
          <Modal
            visible={artistReferenceSelectorVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setArtistReferenceSelectorVisible(false)}
          >
            <ArtistReferenceSelector 
              selectedGender={(character.gender === 'male' || character.gender === 'female' || character.gender === 'other' ? character.gender : 'female')}
              onSelectArtist={(artistPrompt) => {
                if (artistPrompt) {
                  setSelectedArtistPrompt(removeBrackets(artistPrompt));
                  setUseExistingArtistPrompt(true);
                }
                setArtistReferenceSelectorVisible(false);
              }}
              selectedArtistPrompt={selectedArtistPrompt}
            />
          </Modal>
          
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
                  onAddPositive={(tag) => {
                    if (!positiveTags.includes(tag)) {
                      setPositiveTags(prev => [...prev, tag]);
                    }
                  }}
                  onAddNegative={(tag) => {
                    if (!negativeTags.includes(tag)) {
                      setNegativeTags(prev => [...prev, tag]);
                    }
                  }}
                  existingPositiveTags={positiveTags}
                  existingNegativeTags={negativeTags}
                  onPositiveTagsChange={(tags) => {
                    if (JSON.stringify(tags) !== JSON.stringify(positiveTags)) {
                      setPositiveTags(tags);
                    }
                  }}
                  onNegativeTagsChange={(tags) => {
                    if (JSON.stringify(tags) !== JSON.stringify(negativeTags)) {
                      setNegativeTags(tags);
                    }
                  }}
                  sidebarWidth={70}
                />
              </View>
            </View>
          </Modal>
          
          <CharacterTagSelector
            visible={characterTagSelectorVisible}
            onClose={() => setCharacterTagSelectorVisible(false)}
            onAddCharacter={handleAddCharacterTag}
          />

          <Modal
            visible={customPromptModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setCustomPromptModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.customPromptModalContent}>
                <View style={styles.customPromptModalHeader}>
                  <Text style={styles.customPromptModalTitle}>自定义提示词</Text>
                </View>
                
                <View style={styles.customPromptInputContainer}>
                  <TextInput
                    style={styles.customPromptInput}
                    value={customPrompt}
                    onChangeText={setCustomPrompt}
                    placeholder="输入详细的生成提示词（英文效果更好）"
                    placeholderTextColor="#888"
                    multiline={true}
                    numberOfLines={4}
                  />
                </View>
                
                <View style={styles.customPromptModalActions}>
                  <TouchableOpacity
                    style={styles.customPromptCancelButton}
                    onPress={() => setCustomPromptModalVisible(false)}
                  >
                    <Text style={styles.customPromptCancelButtonText}>取消</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.customPromptConfirmButton,
                      !customPrompt.trim() && styles.disabledButton
                    ]}
                    onPress={handleAddCustomPrompt}
                    disabled={!customPrompt.trim()}
                  >
                    <Text style={styles.customPromptConfirmButtonText}>确认</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={novelaiSettingsVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setNovelaiSettingsVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.customPromptModalContent}>
                <View style={styles.customPromptModalHeader}>
                  <Text style={styles.customPromptModalTitle}>NovelAI 高级设置</Text>
                </View>
                
                <View style={styles.novelaiAdvancedSettingsContainer}>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>采样器:</Text>
                    <View style={styles.settingDropdown}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {NOVELAI_SAMPLERS.map(samplerOption => (
                          <TouchableOpacity
                            key={samplerOption}
                            style={[
                              styles.samplerOption,
                              novelaiSettings.sampler === samplerOption && styles.selectedSamplerOption
                            ]}
                            onPress={() => setNovelaiSettings({
                              ...novelaiSettings,
                              sampler: samplerOption
                            })}
                          >
                            <Text style={[
                              styles.samplerOptionText,
                              novelaiSettings.sampler === samplerOption && styles.selectedSamplerOptionText
                            ]}>
                              {samplerOption}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>提示词相关性:</Text>
                    <TextInput
                      style={styles.settingInput}
                      value={String(novelaiSettings.scale)}
                      onChangeText={(text) => {
                        const scale = parseInt(text);
                        if (!isNaN(scale) && scale > 0) {
                          setNovelaiSettings(prev => ({ ...prev, scale }));
                        }
                      }}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                  </View>
                  
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>噪声调度:</Text>
                    <View style={styles.settingDropdown}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {NOVELAI_NOISE_SCHEDULES.map(schedule => (
                          <TouchableOpacity
                            key={schedule}
                            style={[
                              styles.scheduleOption,
                              novelaiSettings.noiseSchedule === schedule && styles.selectedScheduleOption
                            ]}
                            onPress={() => setNovelaiSettings({
                              ...novelaiSettings,
                              noiseSchedule: schedule
                            })}
                          >
                            <Text style={[
                              styles.scheduleOptionText,
                              novelaiSettings.noiseSchedule === schedule && styles.selectedScheduleOptionText
                            ]}>
                              {schedule}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>

                  <Text style={styles.settingNote}>
                    推荐设置: 步数28-30，提示词相关性11，采样器k_euler_ancestral
                  </Text>
                </View>
                
                <View style={styles.customPromptModalActions}>
                  <TouchableOpacity
                    style={styles.customPromptCancelButton}
                    onPress={() => {
                      setNovelaiSettings({ ...DEFAULT_NOVELAI_SETTINGS });
                      setNovelaiSettingsVisible(false);
                    }}
                  >
                    <Text style={styles.customPromptCancelButtonText}>重置</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.customPromptConfirmButton}
                    onPress={() => setNovelaiSettingsVisible(false)}
                  >
                    <Text style={styles.customPromptConfirmButtonText}>确认</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={characterTagSelectorForPromptIndex !== null}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setCharacterTagSelectorForPromptIndex(null)}
          >
            <View style={styles.tagSelectorModalContainer}>
              <View style={styles.tagSelectorHeader}>
                <Text style={styles.tagSelectorTitle}>为角色{characterTagSelectorForPromptIndex !== null ? (characterTagSelectorForPromptIndex + 1) : ''}选择标签</Text>
                <TouchableOpacity 
                  style={styles.tagSelectorCloseButton}
                  onPress={() => setCharacterTagSelectorForPromptIndex(null)}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.tagSelectorContent}>
              <TagSelector 
                onClose={() => setCharacterTagSelectorForPromptIndex(null)}
                onAddPositive={(tag) => {
                  if (characterTagSelectorForPromptIndex !== null) {
                    const currentCharacter = characterPrompts[characterTagSelectorForPromptIndex];
                    const updatedPrompt = currentCharacter.prompt ? 
                      `${currentCharacter.prompt}, ${tag}` : tag;
                    handleUpdateCharacterPrompt(characterTagSelectorForPromptIndex, updatedPrompt);
                  }
                }}
                onAddNegative={() => {}} 
                existingPositiveTags={
                  characterTagSelectorForPromptIndex !== null 
                  ? characterPrompts[characterTagSelectorForPromptIndex].prompt.split(',').map(item => item.trim()) 
                  : []
                }
                existingNegativeTags={[]}
                onPositiveTagsChange={(tags) => {
                  if (characterTagSelectorForPromptIndex !== null) {
                    handleUpdateCharacterPrompt(characterTagSelectorForPromptIndex, tags.join(', '));
                  }
                }}
                onNegativeTagsChange={() => {}}
                sidebarWidth={70}
              />
              </View>
            </View>
          </Modal>
          
          <CharacterTagSelector
            visible={characterTagSelectorForCharacterPrompt !== null}
            onClose={() => setCharacterTagSelectorForCharacterPrompt(null)}
            onAddCharacter={handleAddCharacterPromptTag}
          />
          
        </BlurView>
        
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  fullScreenBlurView: {
    flex: 1,
    borderRadius: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.select({
      ios: 44,
      android: StatusBar.currentHeight || 24,
      default: 24,
    }),
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 5,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#ff9f1c',
  },
  tabText: {
    color: '#ccc',
    marginLeft: 8,
    fontSize: 14,
  },
  activeTabText: {
    color: '#ff9f1c',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  previewImageContainer: {
    height: 300,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
  },
  previewImageWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#222',
  },
  overlayButtonsContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 8,
    padding: 4,
  },
  overlayOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  activeOverlayButton: {
    backgroundColor: '#ff9f1c',
  },
  confirmOverlayButton: {
    backgroundColor: '#ff9f1c',
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  confirmOverlayButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  seedOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 6,
  },
  seedOverlayText: {
    color: '#fff',
    fontSize: 12,
  },
  emptyPreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPreviewText: {
    color: '#777',
    marginTop: 8,
    fontSize: 16,
  },
  imageOptionsContainer: {
    padding: 12,
  },
  imageOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  imageOptionLabel: {
    color: '#fff',
    fontSize: 16,
  },
  confirmImageButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  confirmImageButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  regenerateButton: {
    backgroundColor: '#9C27B0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  regenerateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8,
  },
  tagSection: {
    marginBottom: 16,
  },
  tagSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tagSectionTitle: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  expandedTagDisplayContainer: {
    minHeight: 150,
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  unifiedTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
    minHeight: 30,
  },
  selectedPositiveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 224, 195, 0.8)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  selectedNegativeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.8)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: '#000',
    fontSize: 14,
    marginRight: 6,
  },
  negativeTagText: {
    color: '#fff',
    fontSize: 14,
    marginRight: 6,
  },
  noTagsText: {
    color: '#aaa',
    fontStyle: 'italic',
    padding: 8,
    textAlign: 'center',
  },
  tagActionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
  },
  tagActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 16,
  },
  tagActionButtonText: {
    color: '#ddd',
    marginLeft: 6,
    fontSize: 12,
  },
  selectedCharacterTagsContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 30,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  characterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 224, 195, 0.8)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  characterTagText: {
    color: 'black',
    fontSize: 14,
    marginRight: 6,
  },
  actionButtonsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9f1c',
    borderRadius: 8,
    padding: 12,
    flex: 1,
    marginHorizontal: 4,
  },
  actionButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '500',
    fontSize: 13,
  },
  buttonContainer: {
    marginBottom: 16,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9f1c',
    padding: 12,
    borderRadius: 8,
    height: 50,
  },
  generateButtonNovelAI: {
    backgroundColor: '#ff9f1c',
  },
  generateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 16,
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#666',
    padding: 12,
    borderRadius: 8,
    flex: 1,
  },
  loadingButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 16,
  },
  loadingButtonNovelAI: {
    backgroundColor: '#6a1b9a',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginVertical: 10,
  },
  errorText: {
    color: '#FF4444',
    marginLeft: 8,
  },
  providerSelectorContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  providerSelectorLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  providerOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  providerOption: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  selectedProviderOption: {
    backgroundColor: '#ff9f1c',
  },
  disabledProviderOption: {
    opacity: 0.5,
  },
  providerOptionText: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedProviderOptionText: {
    color: '#fff',
  },
  disabledProviderOptionText: {
    color: '#aaa',
  },
  sizeSelectorContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  sizeSelectorLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sizeOption: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 100,
  },
  selectedSizeOption: {
    backgroundColor: '#ff9f1c',
  },
  sizeOptionText: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedSizeOptionText: {
    color: '#fff',
  },
  sizeOptionDimensions: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  animagineSettingsContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  novelAISettingsContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingHeaderText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  settingHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  settingHeaderButtonText: {
    color: '#ddd',
    fontSize: 12,
    marginLeft: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  settingInput: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    width: '60%',
    textAlign: 'center',
  },
  settingInputContainer: {
    width: '60%',
  },
  settingNote: {
    color: '#aaa',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  novelAIModelSelector: {
    marginTop: 6,
  },
  modelSelectorLabel: {
    color: '#eee',
    fontSize: 14,
    marginBottom: 8,
  },
  modelOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modelOption: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedModelOption: {
    backgroundColor: '#ff9f1c',
  },
  modelOptionText: {
    color: '#ddd',
    fontSize: 13,
  },
  selectedModelOptionText: {
    color: '#fff',
  },
  seedControlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  seedInputContainer: {
    flexDirection: 'row',
    width: '60%',
    alignItems: 'center',
  },
  randomSeedButton: {
    backgroundColor: '#ff9f1c',
    borderRadius: 8,
    padding: 8,
    marginLeft: 8,
  },
  generatedSeedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  generatedSeedLabel: {
    color: '#70A1FF',
    fontSize: 12,
    marginRight: 8,
  },
  generatedSeedValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  copySeedButton: {
    padding: 4,
  },
  seedValueText: {
    color: '#70A1FF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  settingDropdown: {
    width: '60%',
  },
  samplerOption: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
  },
  selectedSamplerOption: {
    backgroundColor: '#ff9f1c',
  },
  samplerOptionText: {
    color: '#ddd',
    fontSize: 12,
  },
  selectedSamplerOptionText: {
    color: '#fff',
  },
  scheduleOption: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
  },
  selectedScheduleOption: {
    backgroundColor: '#ff9f1c',
  },
  scheduleOptionText: {
    color: '#ddd',
    fontSize: 12,
  },
  selectedScheduleOptionText: {
    color: '#fff',
  },
  characterPromptsContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  characterPromptsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  characterPromptsTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  characterPromptItem: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  characterPromptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  characterColorIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterColorText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  characterPromptCoordinates: {
    flex: 1,
    marginHorizontal: 8,
  },
  coordinateText: {
    color: '#bbb',
    fontSize: 12,
  },
  characterPromptRemoveButton: {
    padding: 4,
  },
  characterPromptInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterPromptInput: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    color: '#fff',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    marginRight: 8,
  },
  characterPromptActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addTagToCharacterButton: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 6,
    padding: 8,
    marginRight: 4,
  },
  addCharacterTagButton: {
    backgroundColor: '#ff9f1c',
    borderRadius: 6,
    padding: 8,
  },
  addCharacterPromptButton: {
    flexDirection: 'row',
    backgroundColor: '#ff9f1c',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  addCharacterPromptText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '500',
  },
  characterPromptsHelp: {
    color: '#aaa',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  positionControlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  positionControlButtonText: {
    color: '#ddd',
    fontSize: 12,
    marginLeft: 4,
  },
  characterPositionContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  useCoordinatesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingContainer: {
    backgroundColor: '#333',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  progressMessage: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  tagSelectorModalContainer: {
    flex: 1,
    backgroundColor: '#222',
  },
  tagSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
  },
  tagSelectorTitle: {
    color: '#fff',
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
  tagHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(60, 60, 60, 0.6)',
    borderRadius: 12,
    marginLeft: 6,
  },
  tagHeaderButtonText: {
    color: '#ddd',
    marginLeft: 4,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customPromptModalContent: {
    width: '90%',
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 16,
    maxWidth: 500,
  },
  customPromptModalHeader: {
    marginBottom: 16,
  },
  customPromptModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  customPromptInputContainer: {
    marginTop: 8,
  },
  customPromptInput: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  customPromptModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  customPromptCancelButton: {
    flex: 1,
    backgroundColor: 'rgba(80, 80, 80, 0.8)',
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  customPromptCancelButtonText: {
    color: '#ddd',
    fontWeight: '500',
  },
  customPromptConfirmButton: {
    flex: 1,
    backgroundColor: '#ff9f1c',
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
  },
  customPromptConfirmButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#666',
  },
  novelaiAdvancedSettingsContainer: {
    marginTop: 8,
  },
  artistPromptDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 159, 28, 0.12)',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
    marginLeft: 2,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  artistPromptDisplayText: {
    color: '#ff9f1c',
    fontSize: 13,
    fontWeight: 'bold',
    marginRight: 4,
    flexShrink: 1,
  },
  artistPromptRemoveButton: {
    marginLeft: 2,
    padding: 2,
  },
  generationScrollArea: {
    flex: 1,
    minHeight: 0,
    marginBottom: 8,
  },
  generationScrollContent: {
    paddingBottom: 8,
  },
  fixedTagStyle: {
    borderWidth: 1,
    borderColor: '#ff9f1c',
    backgroundColor: 'rgba(255, 159, 28, 0.18)',
  },
  fixedTagText: {
    fontWeight: 'bold',
    color: '#ff9f1c',
  },
  lockButton: {
    marginLeft: 4,
    padding: 2,
  },
});

export default ImageRegenerationModal;