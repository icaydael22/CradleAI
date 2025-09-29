import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  Image,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { Ionicons, } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CradleCharacter } from '@/shared/types';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext'; // Add import for useUser
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import TagSelector from './TagSelector';
// Import vndb data for traits
import vndbData from '@/app/data/vndb.json';
import { VNDBCharacter } from '@/src/services/vndb/types';
import ArtistReferenceSelector from './ArtistReferenceSelector';
// Import theme
import { theme } from '@/constants/theme';
// Add VoiceSelector import at the top with other imports
import VoiceSelector from './VoiceSelector';
// Add a simple function to generate unique IDs
const generateUniqueId = () => {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
};

// Add the missing interface
interface CradleCreateFormProps {
  isVisible?: boolean;
  embedded?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}


// Define interfaces for trait customization
interface TraitSlider {
  id: string;
  type: 'slider';
  name: string;
  value: number;
  minLabel?: string;
  maxLabel?: string;
}

interface TraitText {
  id: string;
  type: 'text';
  name: string;
  value: string;
}

type Trait = TraitSlider | TraitText;

interface TraitCategory {
  id: string;
  name: string;
  traits: Trait[];
}

// Interface for vndb trait
interface VndbTrait {
  id: string;
  name: string;
  children: VndbTrait[];
  isCategory: boolean;
}

// Chinese translations for some common trait categories
const traitTranslations: Record<string, string> = {
  // Top level categories
  "Talking Patterns": "说话方式",
  "Personality Complex": "性格倾向",
  "Confident": "自信",
  "Otaku": "宅系",
  "Religious Belief": "宗教信仰",
  "Smart": "聪明",
  "Transgender": "跨性别",
  "Tsundere": "傲娇",
  "Dishonest": "不诚实",
  "Immature": "不成熟",
  "Nature Lover": "自然爱好者",
  "Relaxed": "放松",
  "Selfish": "自私",
  "Strange": "古怪",
  
  // Sub categories - examples
  "Japanese Dialect": "日语方言",
  "Animal Speech": "动物语言",
  "Kansai-ben": "关西腔",
  "Ara Ara": "啊啦啊啦",
  "Archaic Dialect": "古语",
  "Brother Complex": "兄控",
  "Sister Complex": "姐控",
  "Father Complex": "父控",
  "Mother Complex": "母控",
  "Arrogant": "傲慢",
  "Assertive": "强势",
  "Overconfident": "过度自信",
  "2D Character Lover": "2D角色爱好者",
  "BL Fan": "腐女",
  "Girls' Love Fan": "百合控",
  "Agnostic": "不可知论者",
  "Atheist": "无神论者",
  "Religious": "宗教信徒",
  "Genius": "天才",
  "Pragmatic": "务实",
  "Sly": "狡猾",
  "Non-Binary": "非二元性别",
  "Trans Man": "跨性别男性",
  "Trans Woman": "跨性别女性",
  "Classic Tsundere": "经典傲娇",
  "Modern Tsundere": "现代傲娇",
  "Mayadere": "黑化",
  "Hypocrite": "虚伪",
  "Chuunibyou": "中二病",
  "Puffy": "易怒",
  "Cat Person": "猫系",
  "Dog Person": "犬系",
  "Carefree": "无忧无虑",
  "Patient": "有耐心",
  "Narcissist": "自恋",
  "Spoiled": "被宠坏的",
  "Eccentric": "古怪",
  "Flamboyant": "张扬",
  
  // Other traits
  "Absentminded": "心不在焉",
  "Ambitious": "有野心的",
  "Cautious": "谨慎",
  "Curious": "好奇",
  "Emotional": "情绪化",
  "Food Lover": "美食爱好者",
  "Hard Worker": "努力工作者",
  "Honest": "诚实",
  "Humble": "谦虚",
  "Jealous": "嫉妒",
  "Kind": "善良",
  "Kuudere": "酷娇",
  "Outgoing": "外向",
  "Pervert": "怪异",
  "Pretending": "假装",
  "Protective": "保护欲强",
  "Reserved": "内敛",
  "Secretive": "保守秘密的",
  "Serious": "严肃",
  "Stoic": "坚忍",
  "Stubborn": "固执",
  "Uneducated": "未受教育的",
  "Violent": "暴力",
  "Wise": "智慧",
  "Adaptable": "适应性强",
  "Airhead": "迷糊",
  "Antisocial": "反社会",
  "Bookworm": "书虫",
  "Brave": "勇敢",
  "Charismatic": "有魅力",
  "Cinephile": "电影爱好者",
  "Clumsy": "笨拙",
  "Competitive": "好胜",
  "Coward": "胆小",
  "Creative": "有创造力",
  "Cruel": "残忍",
  "Cynic": "愤世嫉俗"
};

// Helper function to get translation or original text
const getTranslatedName = (name: string): string => {
  return traitTranslations[name] || name;
};

// Default trait categories to start with
const DEFAULT_TRAIT_CATEGORIES: TraitCategory[] = [
  {
    id: 'personality-axes',
    name: '性格定位',
    traits: [
      {
        id: 'introvert-extrovert',
        type: 'slider',
        name: '内向 - 外向',
        value: 50,
        minLabel: '内向',
        maxLabel: '外向'
      },
      {
        id: 'rational-emotional',
        type: 'slider',
        name: '理性 - 感性',
        value: 50,
        minLabel: '理性',
        maxLabel: '感性'
      }
    ]
  }
];


// Modified sidebar sections - now has three tabs
const SIDEBAR_SECTIONS = [
  { id: 'appearance', icon: 'image-outline' },
  { id: 'character', icon: 'person-outline' },
  { id: 'voice', icon: 'mic-outline' }, // Add voice tab
];

const CradleCreateForm: React.FC<CradleCreateFormProps> = ({
  isVisible = false,
  embedded = false,
  onClose,
  onSuccess
}) => {
  const router = useRouter();
  // Add useUser hook to access API settings
  const { addCradleCharacter, getCradleSettings, generateCharacterFromCradle, getCradleApiSettings } = useCharacters();
  const { user } = useUser(); // Add this to get the user context
  
  // All state hooks should be called at the top level of the component
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [description, setDescription] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);
  const [cardImageUri, setCardImageUri] = useState<string | null>(null);
  
  // When embedded, default to appearance section
  const [activeSection, setActiveSection] = useState(embedded ? 'appearance' : 'character');
  
  // Add state variables for trait customization that were previously outside the component
  const [traitCategories, setTraitCategories] = useState<TraitCategory[]>(DEFAULT_TRAIT_CATEGORIES);
  
  // 是否直接生成角色，跳过摇篮过程
  const [generateImmediately, setGenerateImmediately] = useState(false);
  
  const cradleSettings = getCradleSettings();
  
  // Add state variables for tag selection
  const [uploadMode, setUploadMode] = useState<'upload' | 'generate'>('upload');
  const [positiveTags, setPositiveTags] = useState<string[]>([]);
  const [negativeTags, setNegativeTags] = useState<string[]>([]);
  
  // These state variables were defined outside the component - move them inside
  const [tagSelectorVisible, setTagSelectorVisible] = useState(false);
  
  // Add state for artist reference selection
  const [selectedArtistPrompt, setSelectedArtistPrompt] = useState<string | null>(null);
  // 新增：ArtistReferenceSelector 弹窗控制
  const [artistSelectorVisible, setArtistSelectorVisible] = useState(false);

  // New state variables for character settings tab
  const [userGender, setUserGender] = useState<'male' | 'female' | 'other'>('male');
  const [characterAge, setCharacterAge] = useState<string>('young-adult');
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // State for trait selection modal
  const [traitModalVisible, setTraitModalVisible] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);


  // Add new state for enhanced filtering options
  const [traitFilterOperator, setTraitFilterOperator] = useState<'and' | 'or'>('and');
  const [ageFilterOperator, setAgeFilterOperator] = useState<'=' | '>' | '>=' | '<' | '<='>('>');
  const [ageFilterValue, setAgeFilterValue] = useState<string>('');



  // Add state for voice related properties
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [voiceTemplateId, setVoiceTemplateId] = useState<string | null>(null);










  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsUnmounted(true);
    };
  }, []);

  // Reset state when form closes
  useEffect(() => {
    if (!isVisible && !embedded) {
      // 短暂延迟后重置表单，避免关闭动画过程中看到表单重置
      const timer = setTimeout(() => {
        if (!isUnmounted) {
          setStep(1);
          setCharacterName('');
          setGender('male');
          setUserGender('male');
          setCharacterAge('young-adult');
          setDescription('');
          setAvatarUri(null);
          setBackgroundUri(null);
          setCardImageUri(null);
          setTraitCategories(DEFAULT_TRAIT_CATEGORIES);
          setGenerateImmediately(false);
          setUploadMode('upload');
          setPositiveTags([]);
          setNegativeTags([]);
          setSelectedTraits([]);
          setActiveSection('appearance');
          setIsLoading(false); // 确保loading状态被重置
        }
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, embedded, isUnmounted]);

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        // 处理成方形头像
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 400, height: 400 } }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }
        );
        // 持久化存储到 FileSystem.documentDirectory/avatars/
        const avatarDir = FileSystem.documentDirectory + 'avatars/';
        await FileSystem.makeDirectoryAsync(avatarDir, { intermediates: true }).catch(() => {});
        const avatarFilename = `avatar_${Date.now()}.jpg`;
        const avatarDest = avatarDir + avatarFilename;
        await FileSystem.copyAsync({ from: manipResult.uri, to: avatarDest });
        setAvatarUri(avatarDest);
      }
    } catch (error) {
      console.error('选择头像失败:', error);
      Alert.alert('错误', '选择头像失败');
    }
  };

  const pickCardImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        // Process the image to ensure it's 9:16 ratio
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 900, height: 1600 } }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }
        );
        // 持久化存储到 FileSystem.documentDirectory/backgrounds/
        const bgDir = FileSystem.documentDirectory + 'backgrounds/';
        await FileSystem.makeDirectoryAsync(bgDir, { intermediates: true }).catch(() => {});
        const bgFilename = `background_${Date.now()}.jpg`;
        const bgDest = bgDir + bgFilename;
        await FileSystem.copyAsync({ from: manipResult.uri, to: bgDest });
        setCardImageUri(bgDest);
        setBackgroundUri(bgDest);
      }
    } catch (error) {
      console.error('选择角色卡图片失败:', error);
      Alert.alert('错误', '选择角色卡图片失败');
    }
  };

  // Add a new function to perform VNDB search based on user inputs


  // 修改 handleCreateCharacter 函数，移除立即生成选项
const handleCreateCharacter = async () => {
  if (!characterName.trim()) {
    Alert.alert('信息不完整', '请输入角色名称');
    return;
  }

  if (isUnmounted) {
    console.log('[摇篮角色创建] 组件已卸载，取消创建');
    return;
  }

  setIsLoading(true);

  try {
    console.log(`[摇篮角色创建] 开始创建角色: ${characterName}, 性别: ${gender}`);
    
    // Get API settings from user context with type assertion
    const apiProvider = (user?.settings?.chat?.apiProvider || 'gemini') as 'gemini' | 'openrouter';
    const apiKey = apiProvider === 'openrouter' ? 
      user?.settings?.chat?.openrouter?.apiKey : 
      user?.settings?.chat?.characterApiKey;
    
    // Log API settings for debugging
    console.log(`[摇篮角色创建] 使用API提供商: ${apiProvider}, 密钥有效: ${!!apiKey}`);
    
    // 生成稳定的、唯一的ID
    const characterId = generateUniqueId();
    console.log(`[摇篮角色创建] 生成的角色ID: ${characterId}`);
    
    // Prepare API settings object to pass to character generation
    const apiSettings = {
      apiProvider,
      ...(apiProvider === 'openrouter' && apiKey ? {
        openrouter: {
          enabled: true,
          apiKey: apiKey,
          model: user?.settings?.chat?.openrouter?.model || 'openai/gpt-3.5-turbo'
        }
      } : {})
    };
    
    // Create a complete cradle character object with all necessary fields
    const cradleCharacter: CradleCharacter = {
      // Character base properties
      id: characterId,
      name: characterName,
      avatar: avatarUri, // 已持久化的uri
      backgroundImage: cardImageUri || backgroundUri, // 已持久化的uri
      description: description || '',
      personality: '', // Will be developed through cradle system
      interests: [],
      gender,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      // Cradle specific properties
      inCradleSystem: true,
      cradleStatus: 'growing', // Character is in "growing" state
      cradleCreatedAt: Date.now(),
      cradleUpdatedAt: Date.now(),
      feedHistory: [],
      initialSettings: {
        userGender, // Add user gender
        characterAge, // Add character age
        selectedTraits, // Add selected traits
        description,
      },
      isCradleGenerated: true, // Default to true since we're generating immediately now
      
      // Add API settings to character for generation
      apiSettings: apiSettings,
      
      // Add formatted data for character generation
      generationData: {
        appearanceTags: uploadMode === 'generate' ? {
          positive: positiveTags,
          negative: negativeTags,
          artistPrompt: selectedArtistPrompt || undefined
        } : undefined,
        traits: selectedTraits.map(id => {
          const trait = findTraitById(id);
          return trait ? getTranslatedName(trait.name) : id;
        }),
        description: description || '',
        userGender: userGender
      },
      voiceType: voiceTemplateId || undefined, // Convert null to undefined for voiceType
    };
    
    console.log(`[摇篮角色创建] 图像创建模式: ${uploadMode}`);
    
    console.log('[摇篮角色创建] 添加角色到摇篮系统');
    const addedCharacter = await addCradleCharacter(cradleCharacter);
    console.log(`[摇篮角色创建] 摇篮角色已创建，ID: ${addedCharacter.id}`);
    
    // Give filesystem time to complete writing before proceeding
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Generate the character immediately with proper API settings
    console.log(`[摇篮角色创建] 正在生成角色: ${addedCharacter.id}, API提供商: ${apiProvider}`);
    
    // Pass the character with API settings to the generation function
    const generatedCharacter = await generateCharacterFromCradle(addedCharacter);
    console.log(`[摇篮角色创建] 角色已成功生成，ID: ${generatedCharacter.id}`);
    
    // 成功后关闭弹窗并跳转
    try {
      onClose();
      router.replace({
        pathname: "/(tabs)/Character",
        params: { characterId: generatedCharacter.id }
      });
      if (onSuccess) onSuccess();
    } catch (navigationError) {
      console.error('[摇篮角色创建] 导航失败:', navigationError);
      // 即使导航失败，至少关闭弹窗
      onClose();
    }

  } catch (error) {
    console.error('[摇篮角色创建] 创建角色失败:', error);
    
    // 确保错误处理有正确的按钮回调
    Alert.alert(
      '创建失败', 
      `创建角色时发生错误: ${error instanceof Error ? error.message : String(error)}`,
      [
        {
          text: '确定',
          style: 'default'
        }
      ],
      { cancelable: false }
    );
    return; // 确保不会继续执行
  } finally {
    // 无论成功还是失败都重置loading状态，但只在组件未卸载时执行
    if (!isUnmounted) {
      setIsLoading(false);
    }
  }
};

  // Helper function to toggle trait selection
  const toggleTrait = (traitId: string) => {
    setSelectedTraits(prev => 
      prev.includes(traitId)
        ? prev.filter(id => id !== traitId)
        : [...prev, traitId]
    );
  };
    // 新增：随机选择2-4个特征
    const rollTraits = () => {
      // 扁平化所有可选特征ID
      const allTraitIds: string[] = [];
      vndbData.forEach(category => {
        category.children.forEach(subCat => {
          if (subCat.children && subCat.children.length > 0) {
            allTraitIds.push(...subCat.children);
          } else {
            allTraitIds.push(subCat.id);
          }
        });
      });
      // 去重
      const uniqueTraitIds = Array.from(new Set(allTraitIds));
      // 随机选择2-4个
      const count = Math.floor(Math.random() * 3) + 2; // 2~4
      const shuffled = uniqueTraitIds.sort(() => 0.5 - Math.random());
      setSelectedTraits(shuffled.slice(0, count));
    };
  // Helper function to toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Render functions for each section
  // Appearance section - Keep this mostly unchanged
  const renderAppearanceSection = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>角色外观</Text>
      
      {/* Mode selection switcher with more descriptive UI */}
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
              设置外观标签
            </Text>
            <Text style={styles.modeDescription}>
              指定外观标签作为角色描述，不会生成图像
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
                onPress={pickCardImage}
              >
                {cardImageUri ? (
                  <Image source={{ uri: cardImageUri }} style={styles.cardImagePreview} />
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
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
                ) : (
                  <>
                    <Ionicons name="person-circle-outline" size={115} color="#aaa" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.tagGenerateContainer}>
          <Text style={styles.tagInstructionsText}>
            请选择描述角色外观的正面和负面标签，这些标签将保存为角色数据的一部分
          </Text>

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
            <Ionicons name="color-palette-outline" size={20} color="black" />
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
            
            {/* Add hint for default negative prompts */}
            <Text style={styles.defaultTagsInfo}>
              这些标签可以帮助您更好地描述角色的外观特征
            </Text>
          </View>
          
          {/* Open tag selector button - updated to match ImageRegenerationModal approach */}
          <TouchableOpacity 
            style={styles.openTagSelectorButton}
            onPress={() => setTagSelectorVisible(true)}
          >
            <Ionicons name="pricetag-outline" size={20} color="black" />
            <Text style={styles.openTagSelectorText}>浏览标签并添加</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Tag selector modal - replace sidebar approach with modal approach */}
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
            ></TouchableOpacity>
              <Ionicons name="close" size={24} color="#fff" />

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
              sidebarWidth="auto" // Add this prop to control sidebar width
            />
          </View>
        </View>
      </Modal>

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
            selectedGender={gender}
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

  // New Character Settings section
  const renderCharacterSettingsSection = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>角色设定</Text>
      
      <ScrollView style={styles.characterSettingsContainer}>
        {/* Character name input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>角色名称</Text>
          <TextInput
            style={styles.textInput}
            value={characterName}
            onChangeText={setCharacterName}
            placeholder="输入角色名称"
            placeholderTextColor="#aaa"
          />
        </View>
      
        
        {/* Character's gender selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>角色性别</Text>
          <View style={styles.genderSelector}>
            <TouchableOpacity
              style={[
                styles.genderButton,
                gender === 'male' && styles.selectedGender
              ]}
              onPress={() => setGender('male')}
            >
              <Ionicons 
                name="male" 
                size={20} 
                color={gender === 'male' ? '#fff' : '#aaa'} 
              />

            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.genderButton,
                gender === 'female' && styles.selectedGender
              ]}
              onPress={() => setGender('female')}
            >
              <Ionicons 
                name="female" 
                size={20} 
                color={gender === 'female' ? '#fff' : '#aaa'} 
              />

            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.genderButton,
                gender === 'other' && styles.selectedGender
              ]}
              onPress={() => setGender('other')}
            >
              <Ionicons 
                name="person" 
                size={20} 
                color={gender === 'other' ? '#fff' : '#aaa'} 
              />
              <Text style={[
                styles.genderText,
                gender === 'other' && styles.selectedGenderText
              ]}>
                其他
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Character age - MODIFIED to only allow custom age input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>角色年龄</Text>
          <View style={styles.ageInputContainer}>
            <View style={styles.ageOperatorSelector}>
              {['=', '>', '>=', '<', '<='].map(op => (
                <TouchableOpacity
                  key={op}
                  style={[
                    styles.operatorButton,
                    ageFilterOperator === op && styles.selectedOperator
                  ]}
                  onPress={() => setAgeFilterOperator(op as any)}
                >
                  <Text style={[
                    styles.operatorText,
                    ageFilterOperator === op && styles.selectedOperatorText
                  ]}>
                    {op}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.ageFilterInput}
              value={ageFilterValue}
              onChangeText={setAgeFilterValue}
              placeholder="输入年龄"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
              // Ensure we maintain focus even when text is empty
              onSubmitEditing={() => {
                if (ageFilterValue === '') {
                  setAgeFilterValue('');
                }
              }}
            />
          </View>
          <Text style={styles.ageHintText}>
            请输入角色的具体年龄，例如: 18，25等
          </Text>
        </View>
        
        {/* Character traits section - ENHANCED with AND/OR selection */}
        <View style={styles.inputGroup}>
          <View style={styles.traitHeaderRow}>
            <Text style={styles.inputLabel}>角色特征</Text>
            {/* 按钮组：AND/OR + 选择特征 + 骰子 */}
            <View style={styles.traitHeaderButtons}>
              {/* AND/OR operator selector - always visible */}
              <View style={styles.traitOperatorSelector}>
                <TouchableOpacity
                  style={[
                    styles.traitOperatorButton,
                    traitFilterOperator === 'and' && styles.selectedTraitOperator
                  ]}
                  onPress={() => setTraitFilterOperator('and')}
                >
                  <Text style={[
                    styles.traitOperatorText,
                    traitFilterOperator === 'and' && styles.selectedTraitOperatorText
                  ]}>
                    AND
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.traitOperatorButton,
                    traitFilterOperator === 'or' && styles.selectedTraitOperator
                  ]}
                  onPress={() => setTraitFilterOperator('or')}
                >
                  <Text style={[
                    styles.traitOperatorText,
                    traitFilterOperator === 'or' && styles.selectedTraitOperatorText
                  ]}>
                    OR
                  </Text>
                </TouchableOpacity>
              </View>
              {/* 选择特征按钮 */}
              <TouchableOpacity
                style={styles.selectTraitsButton}
                onPress={() => setTraitModalVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              {/* 骰子按钮 */}
              <TouchableOpacity
                style={[styles.selectTraitsButton, { marginLeft: 8, backgroundColor: 'rgba(224, 196, 168, 0.15)' }]}
                onPress={rollTraits}
              >
                <Ionicons name="dice-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Display selected traits */}
          <View style={styles.selectedTraitsContainer}>
            {selectedTraits.length > 0 ? (
              <FlatList
                data={selectedTraits}
                numColumns={2}
                keyExtractor={item => item}
                renderItem={({item}) => {
                  const trait = findTraitById(item);
                  if (!trait) return null;
                  
                  return (
                    <TouchableOpacity
                      style={styles.selectedTraitItem}
                      onPress={() => toggleTrait(item)}
                    >
                      <Text style={styles.selectedTraitName}>{getTranslatedName(trait.name)}</Text>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.noTraitsText}>未选择任何特征</Text>
                }
              />
            ) : (
              <Text style={styles.noTraitsText}>请点击"选择特征"按钮来添加角色特征</Text>
            )}
            
            {/* Add explanation of selected filtering method */}
            {selectedTraits.length > 1 && (
              <View style={styles.filterExplanation}>
                <Text style={styles.filterExplanationText}>
                  {traitFilterOperator === 'and' 
                    ? '当前设置：角色必须同时拥有所有选定的特征' 
                    : '当前设置：角色至少拥有一个选定的特征'}
                </Text>
              </View>
            )}
          </View>
        </View>
        
        {/* Character description */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>描述</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="自定义描述"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>
      
      {/* Trait selection modal */}
      <Modal
        visible={traitModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTraitModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.traitModalContainer}>
            <View style={styles.traitModalHeader}>
              <Text style={styles.traitModalTitle}>选择角色特征</Text>
              <TouchableOpacity 
                style={styles.closeModalButton}
                onPress={() => setTraitModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.traitSearchInput}
              placeholder="搜索特征..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            
            <View style={styles.traitModalContent}>
              {searchQuery ? (
                              // Show search results
              <FlatList
                data={vndbData
                    .flatMap(category => [
                      { id: category.id, name: category.name, children: [], isCategory: true },
                      ...category.children.flatMap(subCat => [
                        { id: subCat.id, name: subCat.name, children: [], isCategory: false },
                        ...subCat.children.map(traitId => ({ id: traitId, name: traitId, children: [], isCategory: false }))
                      ]),
                      ...category.children.flatMap(subCat => 
                        subCat.children.map(traitId => ({ id: traitId, name: traitId, children: [], isCategory: false }))
                      )
                    ])
                  .filter(trait => 
                    getTranslatedName(trait.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
                    trait.name.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                }
                  keyExtractor={item => item.id}
                  renderItem={({item}) => {
                    if (item.isCategory) return null;
                    
                    const isSelected = selectedTraits.includes(item.id);
                    
                    return (
                      <TouchableOpacity
                        style={[
                          styles.traitSearchItem,
                          isSelected && styles.traitSearchItemSelected
                        ]}
                        onPress={() => toggleTrait(item.id)}
                      >
                        <Text style={styles.traitSearchItemText}>
                          {getTranslatedName(item.name)}
                        </Text>
                        <Ionicons 
                          name={isSelected ? "checkmark-circle" : "add-circle-outline"} 
                          size={20} 
                          color={isSelected ? "#FFD700" : "#aaa"} 
                        />
                      </TouchableOpacity>
                    );
                  }}
                />
              ) : (
                // Show categorized trait listing with virtualization for performance
                <FlatList
                  data={vndbData}
                  keyExtractor={item => item.id}
                  renderItem={({item: category}) => {
                    const isExpanded = expandedCategories.includes(category.id);
                    
                    return (
                      <View style={styles.traitCategory}>
                        <TouchableOpacity
                          style={styles.traitCategoryHeader}
                          onPress={() => toggleCategory(category.id)}
                        >
                          <Text style={styles.traitCategoryName}>
                            {getTranslatedName(category.name)}
                          </Text>
                          <Ionicons 
                            name={isExpanded ? "chevron-up" : "chevron-down"} 
                            size={20} 
                            color="#fff" 
                          />
                        </TouchableOpacity>
                        
                        {isExpanded && (
                          <View style={styles.traitCategoryContent}>
                            {category.children.length > 0 ? (
                              category.children.map(subcategory => (
                                <View key={subcategory.id} style={styles.traitSubcategory}>
                                  <Text style={styles.traitSubcategoryName}>
                                    {getTranslatedName(subcategory.name)}
                                  </Text>
                                  
                                  <View style={styles.traitList}>
                                    {subcategory.children.length > 0 ? (
                                      subcategory.children.map(trait => {
                                        const isSelected = selectedTraits.includes(trait);
                                        
                                        return (
                                          <TouchableOpacity
                                            key={trait}
                                            style={[
                                              styles.traitItem,
                                              isSelected && styles.selectedTraitButton
                                            ]}
                                            onPress={() => toggleTrait(trait)}
                                          >
                                            <Text style={[
                                              styles.traitItemText,
                                              isSelected && styles.selectedTraitButtonText
                                            ]}>
                                              {getTranslatedName(trait)}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })
                                    ) : (
                                      <TouchableOpacity
                                        style={[
                                          styles.traitItem,
                                          selectedTraits.includes(subcategory.id) && styles.selectedTraitButton
                                        ]}
                                        onPress={() => toggleTrait(subcategory.id)}
                                      >
                                        <Text style={[
                                          styles.traitItemText,
                                          selectedTraits.includes(subcategory.id) && styles.selectedTraitButtonText
                                        ]}>
                                          {getTranslatedName(subcategory.name)}
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </View>
                              ))
                            ) : (
                              <TouchableOpacity
                                style={[
                                  styles.traitItem,
                                  selectedTraits.includes(category.id) && styles.selectedTraitButton
                                ]}
                                onPress={() => toggleTrait(category.id)}
                              >
                                <Text style={[
                                  styles.traitItemText,
                                  selectedTraits.includes(category.id) && styles.selectedTraitButtonText
                                ]}>
                                  {getTranslatedName(category.name)}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  }}
                />
              )}
            </View>
            
            <View style={styles.traitModalFooter}>
              <TouchableOpacity 
                style={styles.confirmTraitsButton}
                onPress={() => setTraitModalVisible(false)}
              >
                <Text style={styles.confirmTraitsText}>完成选择</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  // Add a new render function for voice section
  const renderVoiceSection = () => (
    <View style={styles.sectionContent}>
      <VoiceSelector
        selectedGender={voiceGender}
        selectedTemplate={voiceTemplateId || null}
        onSelectGender={setVoiceGender}
        onSelectTemplate={setVoiceTemplateId}
      />
    </View>
  );

  // Render based on whether we're embedded or in a modal
  if (embedded) {
    return (
      <View style={styles.embeddedContainer}>
        <View style={styles.sidebarContainer}>
          {/* Sidebar Navigation Items */}
          <View style={styles.sidebarNavItems}>
            {SIDEBAR_SECTIONS.map(section => (
              <TouchableOpacity 
                key={section.id}
                style={[
                  styles.sidebarItem,
                  activeSection === section.id && styles.activeSidebarItem
                ]}
                onPress={() => setActiveSection(section.id)}
              >
                <Ionicons 
                  name={section.icon as any}
                  size={24} 
                  color={activeSection === section.id ? theme.colors.primary : "#aaa"} 
                />
                <Text style={[
                  styles.sidebarItemText,
                  activeSection === section.id && styles.activeSidebarItemText
                ]}>

                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Create Button - At the bottom of sidebar */}
          <TouchableOpacity 
            style={styles.sidebarCreateButton}
            onPress={handleCreateCharacter}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="save-outline" size={18} color="#000" />
            )}
          </TouchableOpacity>
        </View>
        
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        >
          <ScrollView style={styles.contentContainer}>
            {activeSection === 'appearance' && renderAppearanceSection()}
            {activeSection === 'character' && renderCharacterSettingsSection()}
            {activeSection === 'voice' && renderVoiceSection()}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Modal version of the form
  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* 模态框头部 */}
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>创建摇篮角色</Text>
          </View>
          
          {/* Tab navigation for modal version */}
          <View style={styles.tabNavigation}>
            {SIDEBAR_SECTIONS.map(section => (
              <TouchableOpacity 
                key={section.id}
                style={[
                  styles.tabButton,
                  activeSection === section.id && styles.activeTabButton
                ]}
                onPress={() => setActiveSection(section.id)}
              >
                <Ionicons 
                  name={section.icon as any}
                  size={20} 
                  color={activeSection === section.id ? theme.colors.primary : "#aaa"} 
                />
                <Text style={[
                  styles.tabButtonText,
                  activeSection === section.id && styles.activeTabButtonText
                ]}>
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* 模态框内容 */}
          <View style={styles.modalContent}>
            {activeSection === 'appearance' && renderAppearanceSection()}
            {activeSection === 'character' && renderCharacterSettingsSection()}
            {activeSection === 'voice' && renderVoiceSection()}
          </View>
          
          {/* 模态框底部按钮 */}
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={[styles.footerButton, styles.backButton]} 
              onPress={onClose}
            >
              <Text style={styles.buttonText}>取消</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.footerButton, styles.nextButton]} 
              onPress={handleCreateCharacter}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.nextButtonText}>创建角色</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Add new styles for the revised form with three tabs
const styles = StyleSheet.create({
  sectionContent: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  uploadContainer: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
  },
  
  // New styles for character settings section
  characterSettingsContainer: {
    flex: 1,
  },
  selectTraitsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 196, 168, 0.2)', // Updated to use primaryDark with opacity
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  selectTraitsText: {
    color: theme.colors.primary,
    marginLeft: 4,
  },
  selectedTraitsContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(50, 50, 50, 0.5)',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
  },
  selectedTraitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(224, 196, 168, 0.3)', // Updated to use primaryDark with opacity
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    flex: 0.48,
  },
  selectedTraitName: {
    color: '#fff',
    flex: 1,
    marginRight: 4,
  },
  noTraitsText: {
    color: '#aaa',
    textAlign: 'center',
    marginVertical: 20,
  },
  
  // Modal trait selector styles
  traitModalContainer: {
    width: '90%',
    height: '80%',
    backgroundColor: '#282828',
    borderRadius: 16,
    overflow: 'hidden',
  },
  traitModalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  traitModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeModalButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  traitSearchInput: {
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    margin: 16,
    fontSize: 16,
  },
  traitModalContent: {
    flex: 1,
    padding: 8,
  },
  traitCategory: {
    marginBottom: 16,
  },
  traitCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: 8,
  },
  traitCategoryName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  traitCategoryContent: {
    paddingLeft: 8,
    marginTop: 8,
  },
  traitSubcategory: {
    marginBottom: 12,
  },
  traitSubcategoryName: {
    color: '#ddd',
    fontSize: 15,
    marginLeft: 4,
    marginBottom: 8,
  },
  traitList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  traitItem: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedTraitButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  traitItemText: {
    color: '#ddd',
    fontSize: 14,
  },
  selectedTraitButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  traitSearchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  traitSearchItemSelected: {
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
  },
  traitSearchItemText: {
    color: '#fff',
    fontSize: 15,
  },
  traitModalFooter: {
    padding: 16,
    backgroundColor: '#333',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  confirmTraitsButton: {
    backgroundColor: theme.colors.primaryDark,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmTraitsText: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Tab navigation for modal version
  tabNavigation: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  activeTabButton: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabButtonText: {
    color: '#aaa',
    marginLeft: 6,
  },
  activeTabButtonText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  avatarButton: {
    width: 120,
    height: 120,
    borderRadius: 60,  
  },  
  imageSelectionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
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
  avatarPreview: {
    flex:1,
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  imageButtonText: {
    color: '#aaa',
    marginTop: 8,
    textAlign: 'center',
  },
  imageButtonSubtext: {
    color: '#888',
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
    color: '#aaa',
    marginHorizontal: 8,
  },
  tagGenerateContainer: {
    flex: 1,
    padding: 16,
  },
  tagInstructionsText: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 16,
  },
  tagSummaryContainer: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginVertical: 16,
  },
  tagSummaryTitle: {
    color: '#fff',
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
    backgroundColor: 'rgba(255, 68, 68, 0.8)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  selectedTagText: {
    fontSize: 12,
    marginRight: 4,
    maxWidth: 100,
  },
  noTagsSelectedText: {
    color: '#aaa',
    fontStyle: 'italic',
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
    color: 'black',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    height: '90%',
    backgroundColor: '#282828',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
    // Add status bar height adjustment for iOS
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    position: 'absolute',
    left: 16,
    // Adjust for iOS status bar
    top: Platform.OS === 'ios' ? 44 : 16,
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#333',
  },
  footerButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    backgroundColor: '#555',
    marginRight: 8,
  },
  nextButton: {
    backgroundColor: theme.colors.primaryDark,
    marginLeft: 8,
  },
  buttonText: {
    color: '#fff',
  },
  nextButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  embeddedContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#222',
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
    color: '#aaa',
    marginLeft: 8,
    fontSize: 13,
  },
  activeSidebarItemText: {
    color: theme.colors.primary,
  },
  sidebarCreateButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    alignSelf: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  genderSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    marginHorizontal: 4,
  },
  selectedGender: {
    backgroundColor: theme.colors.primaryDark,
  },
  genderText: {
    color: '#aaa',
    marginLeft: 8,
  },
  selectedGenderText: {
    color: 'black',
    fontWeight: 'bold',
  },
  cardPreviewSection: {
    alignItems: 'center',
    width: '100%',
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
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
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
  modeText: {
    fontSize: 16,
    color: '#aaa',
  },
  activeModeText: {
    color: theme.colors.primary,
  },
  modeTextContainer: {
    flex: 1,
  },
  modeDescription: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  // New styles for enhanced filtering UI
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customFilterSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterTypeText: {
    color: '#aaa',
    fontSize: 12,
    marginHorizontal: 8,
  },
  activeFilterType: {
    color: '#007bff',
    fontWeight: '500',
  },
  customAgeFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ageOperatorSelector: {
    flexDirection: 'row',
    marginRight: 12,
  },
  operatorButton: {
    padding: 8,
    marginHorizontal: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
  },
  selectedOperator: {
    backgroundColor: theme.colors.primaryDark,
  },
  operatorText: {
    color: '#aaa',
    fontSize: 12,
  },
  selectedOperatorText: {
    color: 'black',
  },
  traitHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  traitOperatorSelector: {
    flexDirection: 'row',
    marginLeft: 12,
  },
  traitOperatorButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    marginRight: 6,
  },
  selectedTraitOperator: {
    backgroundColor: theme.colors.primaryDark,
  },
  traitOperatorText: {
    color: '#aaa',
    fontSize: 12,
  },
  selectedTraitOperatorText: {
    color: 'black',
  },
  filterExplanation: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(224, 196, 168, 0.1)', // Updated to use primaryDark with opacity
    borderRadius: 6,
  },
  filterExplanationText: {
    color: '#aaa',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ageFilterInput: {
    flex: 1,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  ageHintText: {
    color: '#aaa',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  switchLabel: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  switchHint: {
    color: '#aaa',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  ageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  // Add new style for default tags info
  defaultTagsInfo: {
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  // New styles for tag selector modal
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
    // Add status bar height adjustment for iOS
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
  },
  tagSelectorTitle: {
    color: 'black',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tagSelectorCloseButton: {
    position: 'absolute',
    right: 16,
    // Adjust for iOS status bar
    top: Platform.OS === 'ios' ? 44 : 16,
    padding: 4,
  },
  tagSelectorContent: {
    flex: 1, // This ensures the TagSelector fills the available space
  },
  selectedArtistPromptContainer: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  selectedArtistPromptLabel: {
    color: '#aaa',
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
  traitHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  traitHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    // 保证按钮组靠右紧凑排列
  },
});

export default CradleCreateForm;

function findTraitById(id: string): VndbTrait | null {
  // Helper function to search through trait hierarchy
  const searchInTraits = (traits: VndbTrait[]): VndbTrait | null => {
    for (const trait of traits) {
      // Check if current trait matches
      if (trait.id === id) {
        return trait;
      }
      // If trait has children, search them
      if (trait.children && trait.children.length > 0) {
        const found = searchInTraits(trait.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Map the vndbData to include isCategory property before searching
  const mappedData: VndbTrait[] = vndbData.map(category => ({
    ...category,
    isCategory: true,
    children: category.children.map(subCategory => ({
      ...subCategory,
      isCategory: true,
      children: subCategory.children.map(traitId => ({
        id: traitId,
        name: traitId,
        isCategory: false,
        children: []
      }))
    }))
  }));

  // Search through the mapped traits
  return searchInTraits(mappedData);
}

