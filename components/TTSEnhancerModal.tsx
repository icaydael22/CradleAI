import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Switch,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ttsService } from '@/services/ttsService';
import { fetchTTSEnhancerModels, OpenRouterModel, getProviderEmoji, filterAndSortForTTSEnhancement } from '@/utils/tts-enhancer-models';
import Markdown from 'react-native-markdown-display';

// TTS Enhancer guide content
const TTS_ENHANCER_GUIDE = `
# 语音增强功能 (TTS Enhancer) 指南

语音增强功能使用AI模型自动添加语气、情感和韵律标记，使语音输出更加自然、生动和富有表现力。

## 工作原理

语音增强功能通过以下步骤改进语音体验：

1. 当用户点击语音按钮时，系统会先检查语音增强功能是否启用
2. 如果启用，系统会将原始文本发送给选定的AI模型进行处理
3. AI模型会分析文本内容，添加适当的语气标记和生成情感指导
4. 处理后的文本和指导语一起发送到语音生成服务
5. 语音生成服务使用这些增强信息创建更自然、更有表现力的语音

## 语气标记类型

语音增强支持以下语气标记：

- **\`<laughter></laughter>\`**: 包裹一段文本，表示这段文本中包含笑声
  - 示例：\`<laughter>这真是太有趣了</laughter>\`
  
- **\`<strong></strong>\`**: 包裹需要强调的词语
  - 示例：\`我<strong>非常</strong>喜欢这个想法\`
  
- **\`[breath]\`**: 插入在适当位置，表示换气声，通常在句子末尾
  - 示例：\`我刚刚跑完步[breath]，感觉好累啊\`

## 情感指导

除了语气标记，系统还会生成情感指导，可能包括：

- **情感描述词**：如"神秘"、"好奇"、"优雅"、"嘲讽"等
- **模仿指导**：如"模仿机器人风格"、"模仿小猪佩奇的语气"等
- **身份描述**：如"一个天真烂漫的小孩，总是充满幻想和无尽的好奇心"

## 可用模型

在设置中，您可以选择不同的AI模型来生成语音增强：

- **Claude Instant**：快速响应，高质量结果
- **GPT-3.5 Turbo**：全能型模型
- **Llama 3 8B**：本地支持的开源选项
- **Mistral 7B**：开源支持的高性能模型

## 最佳实践

- **中等长度文本效果最佳**：几句到一段文字的长度最适合增强处理
- **观察模式间差异**：不同的AI模型会生成不同风格的增强，可以尝试找到最适合特定角色的模型
- **启用消息通知**：启用消息通知可以在语音生成完成时收到提醒

## 注意事项

- 启用语音增强会略微增加语音生成时间
- 增强语音按钮会显示金色标记，表示启用了增强功能
- 如果语音增强处理失败，系统会自动回退到使用原始文本生成语音
`;

// Interface for props
interface TTSEnhancerModalProps {
  visible: boolean;
  onClose: () => void;
}

const TTSEnhancerModal: React.FC<TTSEnhancerModalProps> = ({ visible, onClose }) => {
  // TTS enhancer state
  const [isTtsEnhancerEnabled, setIsTtsEnhancerEnabled] = useState(false);
  const [ttsEnhancerModel, setTtsEnhancerModel] = useState('anthropic/claude-instant-v1');
  const [ttsEnhancerModels, setTtsEnhancerModels] = useState<OpenRouterModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [filteredModels, setFilteredModels] = useState<OpenRouterModel[]>([]);
  const [showGuide, setShowGuide] = useState(false);

  // Load TTS enhancer settings when component mounts
  useEffect(() => {
    const loadTtsEnhancerSettings = async () => {
      try {
        const settings = ttsService.getEnhancerSettings();
        console.log('[TTSEnhancerModal] Loaded TTS enhancer settings:', settings);
        setIsTtsEnhancerEnabled(settings.enabled);
        setTtsEnhancerModel(settings.model);
      } catch (error) {
        console.error('[TTSEnhancerModal] Error loading TTS enhancer settings:', error);
      }
    };
    
    if (visible) {
      loadTtsEnhancerSettings();
      
      // Pre-load models if needed
      if (ttsEnhancerModels.length === 0) {
        fetchModels();
      }
    }
  }, [visible]);
  
  // Filter models based on search query
  useEffect(() => {
    if (!modelSearchQuery.trim()) {
      setFilteredModels(ttsEnhancerModels);
    } else {
      const query = modelSearchQuery.toLowerCase();
      const filtered = ttsEnhancerModels.filter(model => 
        model.name.toLowerCase().includes(query) || 
        model.id.toLowerCase().includes(query) ||
        (model.provider?.name || '').toLowerCase().includes(query)
      );
      setFilteredModels(filtered);
    }
  }, [modelSearchQuery, ttsEnhancerModels]);

  // Handler to disable TTS enhancer
  const handleDisableTtsEnhancer = async () => {
    setIsTtsEnhancerEnabled(false);
    
    await ttsService.saveEnhancerSettings({
      enabled: false,
      model: ttsEnhancerModel
    });
    
    Alert.alert(
      '语音增强已禁用',
      '语音将使用原始文本进行生成，不添加额外的表情和语气标记。',
      [{ text: '确定', style: 'default' }]
    );
  };
  
  // Handler for TTS enhancer model change
  const handleTtsEnhancerModelChange = async (model: string) => {
    setTtsEnhancerModel(model);
    setIsTtsEnhancerEnabled(true);
    
    await ttsService.saveEnhancerSettings({
      enabled: true,
      model: model
    });
    
    // Get model name for display in alert
    const selectedModel = ttsEnhancerModels.find(m => m.id === model);
    
    Alert.alert(
      '语音增强已启用',
      `已选择 ${selectedModel?.name || model} 作为语音增强模型。语音将更加自然、生动。`,
      [{ text: '确定', style: 'default' }]
    );
  };

  // Fetch models from OpenRouter
  const fetchModels = async () => {
    if (isLoadingModels) return;
    
    setIsLoadingModels(true);
    try {
      console.log('[TTSEnhancerModal] Fetching TTS enhancer models...');
      const models = await fetchTTSEnhancerModels();
      const sortedModels = filterAndSortForTTSEnhancement(models);
      
      console.log(`[TTSEnhancerModal] Loaded ${sortedModels.length} TTS enhancer models`);
      setTtsEnhancerModels(sortedModels);
      setFilteredModels(sortedModels);
      
      return sortedModels;
    } catch (error) {
      console.error('[TTSEnhancerModal] Failed to fetch TTS enhancer models:', error);
      Alert.alert('获取模型失败', '无法获取语音增强模型列表，请检查网络连接并重试。');
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Toggle between model selection and guide views
  const toggleGuide = () => {
    setShowGuide(!showGuide);
  };
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true} // Added this to ensure it covers the status bar
    >
      <View style={[styles.modalOverlay, { zIndex: 9999 }]}>
        <View style={[styles.modalContent, { zIndex: 10000 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showGuide ? '语音增强功能指南' : '语音增强设置'}
            </Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          {showGuide ? (
            <ScrollView style={styles.guideScrollView}>
              <View style={styles.guideContainer}>
                <Markdown
                  style={{
                    body: { color: '#fff', fontSize: 16, lineHeight: 24 },
                    heading1: { color: 'rgb(255, 224, 195)', fontSize: 24, fontWeight: 'bold', marginBottom: 16, marginTop: 24 },
                    heading2: { color: 'rgb(255, 224, 195)', fontSize: 20, fontWeight: 'bold', marginBottom: 12, marginTop: 24 },
                    heading3: { color: 'rgb(255, 224, 195)', fontSize: 18, fontWeight: 'bold', marginBottom: 10, marginTop: 20 },
                    paragraph: { marginBottom: 16 },
                    list_item: { marginBottom: 8 },
                    bullet_list: { marginBottom: 16 },
                    ordered_list: { marginBottom: 16 },
                    code_inline: { backgroundColor: 'rgba(255, 224, 195, 0.1)', color: 'rgb(255, 224, 195)', padding: 4, borderRadius: 4 },
                    code_block: { backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: 12, borderRadius: 8, marginVertical: 12 },
                    blockquote: { borderLeftColor: 'rgb(255, 224, 195)', borderLeftWidth: 4, paddingLeft: 12, opacity: 0.8 },
                    hr: { backgroundColor: 'rgba(255, 255, 255, 0.2)', height: 1, marginVertical: 16 }
                  }}
                >
                  {TTS_ENHANCER_GUIDE}
                </Markdown>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.enhancerToggleContainer}>
                <Text style={styles.enhancerToggleLabel}>启用语音增强</Text>
                <Switch
                  value={isTtsEnhancerEnabled}
                  onValueChange={(value) => {
                    setIsTtsEnhancerEnabled(value);
                    if (!value) {
                      handleDisableTtsEnhancer();
                    }
                  }}
                  trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
                  thumbColor={isTtsEnhancerEnabled ? 'rgb(255, 224, 195)' : '#f4f3f4'}
                />
              </View>
              
              <Text style={styles.modalDescription}>
                语音增强使用AI处理文本，添加表情和语气标记，使语音更加自然生动。请选择用于增强的AI模型：
              </Text>
              
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color="#aaa" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="搜索模型..."
                  placeholderTextColor="#aaa"
                  value={modelSearchQuery}
                  onChangeText={setModelSearchQuery}
                />
                {modelSearchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setModelSearchQuery('')}
                    style={styles.searchClearButton}
                  >
                    <Ionicons name="close-circle" size={18} color="#aaa" />
                  </TouchableOpacity>
                )}
              </View>
              
              {isLoadingModels ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="rgb(255, 224, 195)" />
                  <Text style={styles.loadingText}>加载模型列表中...</Text>
                </View>
              ) : filteredModels.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="alert-circle-outline" size={40} color="#aaa" />
                  <Text style={styles.emptyText}>
                    {modelSearchQuery 
                      ? `没有找到匹配"${modelSearchQuery}"的模型` 
                      : '未找到可用模型'}
                  </Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={fetchModels}
                  >
                    <Text style={styles.retryText}>重试加载</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={filteredModels}
                  renderItem={({ item }) => {
                    const isSelected = item.id === ttsEnhancerModel;
                    const providerEmoji = getProviderEmoji(item.provider?.id);
                    
                    return (
                      <TouchableOpacity
                        style={[
                          styles.modelItem,
                          isSelected && styles.modelItemSelected
                        ]}
                        onPress={() => handleTtsEnhancerModelChange(item.id)}
                      >
                        <View style={styles.modelHeader}>
                          <Text style={styles.modelProviderEmoji}>{providerEmoji}</Text>
                          <Text style={styles.modelName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          
                          {isSelected && (
                            <View style={styles.modelSelectedBadge}>
                              <Text style={styles.modelSelectedText}>已选择</Text>
                            </View>
                          )}
                        </View>
                        
                        {item.description && (
                          <Text style={styles.modelDescription} numberOfLines={2}>
                            {item.description}
                          </Text>
                        )}
                        
                        <Text style={styles.modelId}>{item.id}</Text>
                      </TouchableOpacity>
                    );
                  }}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.modelList}
                  showsVerticalScrollIndicator={true}
                />
              )}
            </>
          )}
          
          {/* Button to toggle between settings and guide */}
          <TouchableOpacity
            style={styles.enhancerHelpButton}
            onPress={toggleGuide}
          >
            <Ionicons 
              name={showGuide ? "settings-outline" : "help-circle-outline"} 
              size={18} 
              color="rgb(255, 224, 195)" 
            />
            <Text style={styles.enhancerHelpText}>
              {showGuide ? '返回设置' : '查看语音增强指南'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999, // Added explicit z-index in styles
  },
  modalContent: {
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 15,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
    zIndex: 10000, // Added explicit z-index in styles
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalDescription: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 15,
    lineHeight: 20,
  },
  enhancerToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  enhancerToggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: 10,
    padding: 8,
    marginBottom: 15,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: 40,
  },
  searchClearButton: {
    padding: 5,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    color: '#ccc',
    marginTop: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyText: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  retryText: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '600',
  },
  modelList: {
    paddingBottom: 20,
  },
  modelItem: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  modelItemSelected: {
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
    borderColor: 'rgba(255, 224, 195, 0.5)',
    borderWidth: 1,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 5,
  },
  modelProviderEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  modelName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    flex: 1,
  },
  modelSelectedBadge: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  modelSelectedText: {
    color: 'rgb(255, 224, 195)',
    fontSize: 12,
  },
  modelDescription: {
    fontSize: 12,
    color: '#ccc',
    marginBottom: 5,
  },
  modelId: {
    fontSize: 11,
    color: '#999',
  },
  enhancerHelpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  enhancerHelpText: {
    color: 'rgb(255, 224, 195)',
    marginLeft: 8,
    fontWeight: '500',
  },
  guideContainer: {
    paddingBottom: 40,
  },
  guideScrollView: {
    maxHeight: '80%',
  },
});

export default TTSEnhancerModal;
