import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OpenRouterModel } from '@/shared/types/api-types';
import { theme } from '@/constants/theme';

interface ModelSelectorProps {
  models?: OpenRouterModel[];
  selectedModelId: string | undefined;
  onSelectModel: (modelId: string) => void;
  isLoading?: boolean;
  apiKey: string | undefined;
  useCloudService?: boolean;
  allowedCloudModels?: string[];
}

enum FilterMode {
  ALL = 'all',
  FREE = 'free',
  PAID = 'paid',
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  apiKey,
  selectedModelId,
  onSelectModel,
  isLoading = false,
  models = [],
  useCloudService = false,
  allowedCloudModels = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [internalModels, setInternalModels] = useState<OpenRouterModel[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(FilterMode.ALL);

  const fetchModelsDirectly = async (apiKey?: string): Promise<any> => {
    try {
      const endpoint = apiKey 
        ? 'https://openrouter.ai/api/v1/models'
        : 'https://openrouter.ai/api/v1/models?auth=nokey';
        
      const headers: Record<string, string> = {
        'HTTP-Referer': 'https://github.com',
        'X-Title': 'AI Chat App'
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const modelData = await response.json();
        return modelData;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接');
        }
        throw error;
      }
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    const fetchModels = async () => {
      if (useCloudService && allowedCloudModels.length > 0) {
        const cloudServiceModels = allowedCloudModels.map(modelId => ({
          id: modelId,
          name: formatGeminiModelName(modelId),
          description: "Google's Gemini model via cloud service",
          context_length: 30720,
          pricing: { prompt: 0, completion: 0 },
          provider: { id: "google", name: "Google" }
        }));
        setInternalModels(cloudServiceModels);
        setInternalLoading(false);
        return;
      }

      setInternalLoading(true);
      setFetchError(null);
      
      try {
        let modelData;
        
        if (apiKey) {
          modelData = await fetchModelsDirectly(apiKey);
        } else {
          modelData = await fetchModelsDirectly();
        }
        
        if (!modelData || !modelData.data || !modelData.data.length) {
          modelData = await fetchModelsDirectly();
        }
        
        if (modelData?.data && Array.isArray(modelData.data)) {
          const filteredModels: OpenRouterModel[] = modelData.data.filter((model: OpenRouterModel) => 
            model.id !== 'openrouter/auto' && 
            model.name !== 'Auto Router'
          );
          setInternalModels(filteredModels);
        } else {
          throw new Error('无效的响应格式');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setFetchError(errorMessage);
        
        if (internalModels.length === 0) {
          const defaultModels = getDefaultModels();
          if (defaultModels.length > 0) {
            setInternalModels(defaultModels);
          }
        }
      } finally {
        setInternalLoading(false);
      }
    };
    
    fetchModels();
  }, [apiKey, useCloudService, allowedCloudModels]);

  const getDefaultModels = (): OpenRouterModel[] => {
    return [
      {
        id: "openai/gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        description: "Most capable GPT-3.5 model for chat and text generation",
        context_length: 16385,
        pricing: { prompt: 0.0000015, completion: 0.000002 },
        provider: { id: "openai", name: "OpenAI" }
      },
      {
        id: "openai/gpt-4",
        name: "GPT-4",
        description: "OpenAI's most advanced model for complex tasks",
        context_length: 8192,
        pricing: { prompt: 0.00003, completion: 0.00006 },
        provider: { id: "openai", name: "OpenAI" }
      },
      {
        id: "anthropic/claude-3-opus",
        name: "Claude 3 Opus",
        description: "Anthropic's most capable model for complex tasks",
        context_length: 200000,
        pricing: { prompt: 0.00005, completion: 0.00015 },
        provider: { id: "anthropic", name: "Anthropic" }
      },
      {
        id: "google/gemini-pro",
        name: "Gemini Pro",
        description: "Google's largest model for sophisticated tasks",
        context_length: 30720,
        pricing: { prompt: 0.000005, completion: 0.000005 },
        provider: { id: "google", name: "Google" }
      },
    ];
  };

  const formatGeminiModelName = (modelId: string) => {
    let name = modelId.replace(/-/g, ' ');
    name = name.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    name = name.replace(/Exp\s+\d+/, 'Experimental');
    name = name.replace(/Exp\s+\d+\s+\d+/, 'Experimental');
    return name;
  };

  const displayModels = useCloudService && allowedCloudModels.length > 0 
    ? internalModels 
    : (models.length > 0 ? models : internalModels);

  const validModels = Array.isArray(displayModels) ? displayModels.filter(model => 
    model && typeof model === 'object' && model.id && model.name
  ) : [];

  const isModelFree = (model: OpenRouterModel) => {
    const promptCost = Number(model.pricing?.prompt || 0);
    const completionCost = Number(model.pricing?.completion || 0);
    return promptCost === 0 && completionCost === 0;
  };

  const formatPrice = (price: number | string | undefined) => {
    if (price === undefined || price === null) {
      return 'Free';
    }
    
    const numPrice = typeof price === 'string' ? Number(price) : price;
    
    if (numPrice === 0) {
      return 'Free';
    } else if (numPrice < 0.00001) {
      return `$${numPrice.toFixed(8)}`;
    } else if (numPrice < 0.0001) {
      return `$${numPrice.toFixed(6)}`;
    } else if (numPrice < 0.001) {
      return `$${numPrice.toFixed(5)}`;
    } else {
      return `$${numPrice.toFixed(4)}`;
    }
  };

  const filteredModels = validModels.filter(model => {
    const matchesSearch = searchQuery.trim() === '' || 
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (model.provider?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (model.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const isFree = isModelFree(model);
    
    if (filterMode === FilterMode.FREE) {
      return matchesSearch && isFree;
    } else if (filterMode === FilterMode.PAID) {
      return matchesSearch && !isFree;
    }
    
    return matchesSearch;
  });

  const sortedModels = [...filteredModels].sort((a, b) => {
    const aIsFree = isModelFree(a);
    const bIsFree = isModelFree(b);
    
    if (aIsFree && !bIsFree) return -1;
    if (!aIsFree && bIsFree) return 1;
    
    const providerComparison = (a.provider?.name || '').localeCompare(b.provider?.name || '');
    if (providerComparison !== 0) return providerComparison;
    
    return a.name.localeCompare(b.name);
  });

  const getProviderLogo = (providerId: string | undefined) => {
    switch(providerId?.toLowerCase()) {
      case 'openai':
        return '🟢';
      case 'anthropic':
        return '🟣';
      case 'google':
        return '🔵';
      case 'meta':
        return '🟡';
      case 'mistral':
        return '🔴';
      default:
        return '⚪';
    }
  };
  
  const renderHeader = () => {
    return (
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>选择模型</Text>
        <Text style={styles.headerSubtitle}>
          选择一个与您的使用需求匹配的模型
        </Text>
        
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={16} color={theme.colors.textSecondary} style={styles.searchIcon}/>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索模型名称或提供商..."
            placeholderTextColor={theme.colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.filterTabsContainer}>
          <TouchableOpacity 
            style={[
              styles.filterTab, 
              filterMode === FilterMode.ALL && styles.activeFilterTab
            ]}
            onPress={() => setFilterMode(FilterMode.ALL)}
          >
            <Text style={[
              styles.filterTabText,
              filterMode === FilterMode.ALL && styles.activeFilterTabText
            ]}>
              全部
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.filterTab, 
              filterMode === FilterMode.FREE && styles.activeFilterTab
            ]}
            onPress={() => setFilterMode(FilterMode.FREE)}
          >
            <Text style={[
              styles.filterTabText,
              filterMode === FilterMode.FREE && styles.activeFilterTabText
            ]}>
              免费模型
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.filterTab, 
              filterMode === FilterMode.PAID && styles.activeFilterTab
            ]}
            onPress={() => setFilterMode(FilterMode.PAID)}
          >
            <Text style={[
              styles.filterTabText,
              filterMode === FilterMode.PAID && styles.activeFilterTabText
            ]}>
              付费模型
            </Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.statsText}>
          共 {validModels.length} 个模型，当前显示 {filteredModels.length} 个
        </Text>
      </View>
    );
  };
  
  const renderModelItem = ({ item }: { item: OpenRouterModel }) => {
    const isSelected = item.id === selectedModelId;
    const isFreeModel = isModelFree(item);
    const providerLogo = getProviderLogo(item.provider?.id);
    
    const promptPrice = typeof item.pricing?.prompt === 'string' 
      ? Number(item.pricing.prompt) 
      : item.pricing?.prompt || 0;
      
    const completionPrice = typeof item.pricing?.completion === 'string' 
      ? Number(item.pricing.completion) 
      : item.pricing?.completion || 0;
    
    return (
      <TouchableOpacity
        style={[styles.modelItemContainer, isSelected && styles.selectedModelItem]}
        onPress={() => onSelectModel(item.id)}
      >
        <View style={styles.modelHeader}>
          <View style={styles.modelTitleContainer}>
            <Text style={styles.providerLogo}>{providerLogo}</Text>
            <Text style={styles.modelName} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={styles.modelTags}>
            {isFreeModel ? (
              <View style={[styles.tag, styles.freeTag]}>
                <Ionicons name="gift-outline" size={12} color={theme.colors.success} />
                <Text style={styles.freeTagText}>免费</Text>
              </View>
            ) : (
              <View style={[styles.tag, styles.paidTag]}>
                <Ionicons name="cash-outline" size={12} color={theme.colors.warning} />
                <Text style={styles.paidTagText}>付费</Text>
              </View>
            )}
            {isSelected && (
              <View style={styles.selectedTag}>
                <Ionicons name="checkmark" size={12} color={theme.colors.primary} />
                <Text style={styles.selectedTagText}>已选</Text>
              </View>
            )}
          </View>
        </View>
        
        {item.description && (
          <Text style={styles.modelDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        
        <View style={styles.modelStats}>
          <View style={styles.modelStat}>
            <Text style={styles.modelStatLabel}>上下文长度</Text>
            <Text style={styles.modelStatValue}>
              {(item.context_length || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.modelStat}>
            <Text style={styles.modelStatLabel}>输入费用</Text>
            <Text style={[
              styles.modelStatValue, 
              promptPrice === 0 ? styles.freePrice : null
            ]}>
              {formatPrice(promptPrice)}
            </Text>
          </View>
          <View style={styles.modelStat}>
            <Text style={styles.modelStatLabel}>输出费用</Text>
            <Text style={[
              styles.modelStatValue, 
              completionPrice === 0 ? styles.freePrice : null
            ]}>
              {formatPrice(completionPrice)}
            </Text>
          </View>
        </View>
        
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>
            {item.provider?.name || 'Unknown Provider'}
          </Text>
          <Text style={styles.modelId} numberOfLines={1}>
            {item.id}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };
  
  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.loadingText}>加载模型列表中...</Text>
    </View>
  );
  
  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={40} color={theme.colors.danger} />
      <Text style={styles.errorPrimaryText}>获取模型列表失败</Text>
      <Text style={styles.errorSecondaryText}>{fetchError}</Text>
      <TouchableOpacity 
        style={styles.retryButton} 
        onPress={() => {
          setInternalLoading(true);
          setTimeout(() => setInternalLoading(false), 100);
        }}
      >
        <Text style={styles.retryButtonText}>重试</Text>
      </TouchableOpacity>
    </View>
  );
  
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={40} color={theme.colors.textSecondary} />
      <Text style={styles.emptyPrimaryText}>没有找到符合条件的模型</Text>
      <Text style={styles.emptySecondaryText}>
        {searchQuery ? 
          `没有找到包含 "${searchQuery}" 的模型，请尝试其他关键词` :
          '没有可用的模型，请检查筛选条件或网络连接'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderHeader()}
      
      {isLoading || internalLoading ? (
        renderLoading()
      ) : fetchError ? (
        renderError()
      ) : filteredModels.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={sortedModels}
          renderItem={renderModelItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={true}
          initialNumToRender={10}
          maxToRenderPerBatch={20}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerContainer: {
    padding: 16,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: theme.colors.text,
    fontSize: 14,
  },
  clearButton: {
    padding: 4,
  },
  filterTabsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeFilterTab: {
    backgroundColor: 'rgba(100, 100, 255, 0.15)',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  activeFilterTabText: {
    color: theme.colors.primary,
  },
  statsText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  modelItemContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedModelItem: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(100, 100, 255, 0.05)',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modelTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  providerLogo: {
    fontSize: 18,
    marginRight: 8,
  },
  modelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    flex: 1,
  },
  modelTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
    marginBottom: 4,
  },
  freeTag: {
    backgroundColor: 'rgba(75, 181, 67, 0.15)',
  },
  freeTagText: {
    fontSize: 10,
    color: theme.colors.success,
    marginLeft: 2,
    fontWeight: '500',
  },
  paidTag: {
    backgroundColor: 'rgba(246, 190, 0, 0.15)',
  },
  paidTagText: {
    fontSize: 10,
    color: theme.colors.warning,
    marginLeft: 2,
    fontWeight: '500',
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 100, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  selectedTagText: {
    fontSize: 10,
    color: theme.colors.primary,
    marginLeft: 2,
    fontWeight: '500',
  },
  modelDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  modelStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 8,
  },
  modelStat: {
    flex: 1,
    alignItems: 'center',
  },
  modelStatLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  modelStatValue: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.text,
  },
  freePrice: {
    color: theme.colors.success,
    fontWeight: 'bold',
  },
  providerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  modelId: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    maxWidth: '60%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    margin: 16,
  },
  errorPrimaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  errorSecondaryText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    margin: 16,
  },
  emptyPrimaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySecondaryText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ModelSelector;
