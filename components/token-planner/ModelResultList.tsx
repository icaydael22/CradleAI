import React, { useState, useEffect } from 'react';
import { 
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import ModelResultItem from './ModelResultItem';

interface CalculationResult {
  modelId: string;
  modelName: string;
  modelDescription: string;
  estimatedMonthlyCost: number;
  daysCanChat: number;
  totalMonthlyTokens: number;
  inputCost: number;
  outputCost: number;
  imageCost: number;
  contextLength: number;
  hasImageCapability: boolean;
  voiceGenerationCost: number;
  imageGenerationCost: number;
}

interface ModelResultListProps {
  results: CalculationResult[];
  monthlyBudget: number;
  includeImages: boolean;
  includeVoiceGeneration: boolean;
  includeImageGeneration: boolean;
}

enum FilterMode {
  ALL = 'all',
  FREE = 'free',
  PAID = 'paid',
}

const ModelResultList: React.FC<ModelResultListProps> = ({ 
  results, 
  monthlyBudget,
  includeImages,
  includeVoiceGeneration,
  includeImageGeneration
}) => {
  const [showAllModels, setShowAllModels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>(FilterMode.ALL);

  // Filter models that can chat at least 25 days on the budget
  const affordableModels = results.filter(model => model.daysCanChat >= 25);
  
  // Filter based on search query and free/paid status
  const filteredModels = (showAllModels ? results : affordableModels)
    .filter(model => {
      // Apply search filter
      const matchesSearch = searchQuery.trim() === '' || 
        model.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.modelId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (model.modelDescription && model.modelDescription.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Apply free/paid filter
      const isFree = model.estimatedMonthlyCost === 0;
      
      if (filterMode === FilterMode.FREE) {
        return matchesSearch && isFree;
      } else if (filterMode === FilterMode.PAID) {
        return matchesSearch && !isFree;
      }
      
      return matchesSearch;
    });

  const toggleShowAll = () => {
    setShowAllModels(!showAllModels);
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>计算结果</Text>
      <Text style={styles.headerSubtitle}>
        {showAllModels ? '显示所有模型' : '显示推荐模型'}
        {!showAllModels && affordableModels.length > 0 && ` (${affordableModels.length}/${results.length})`}
      </Text>
      
      {/* Search Box */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textSecondary} style={styles.searchIcon}/>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜索模型名称或ID..."
          placeholderTextColor={theme.colors.textSecondary}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Filter Tabs */}
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
      
      {results.length > 0 && (
        <TouchableOpacity style={styles.toggleButton} onPress={toggleShowAll}>
          <Text style={styles.toggleButtonText}>
            {showAllModels ? '只显示推荐模型' : '查看所有模型'}
          </Text>
          <Ionicons 
            name={showAllModels ? 'filter-outline' : 'list-outline'} 
            size={16} 
            color={theme.colors.primary} 
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      )}

      {/* Show service inclusion indicators */}
      {(includeVoiceGeneration || includeImageGeneration) && (
        <View style={styles.servicesContainer}>
          {includeVoiceGeneration && (
            <View style={styles.serviceIndicator}>
              <Ionicons name="mic-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.serviceText}>已包含语音生成费用</Text>
            </View>
          )}
          {includeImageGeneration && (
            <View style={styles.serviceIndicator}>
              <Ionicons name="brush-outline" size={14} color="#9c27b0" />
              <Text style={styles.serviceText}>已包含图片生成费用</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderEmptyList = () => {
    let message = "没有找到符合条件的模型";
    let detailMessage = "";
    
    if (filterMode === FilterMode.FREE) {
      detailMessage = "没有找到免费模型，请尝试查看付费模型";
    } else if (filterMode === FilterMode.PAID) {
      detailMessage = "没有找到付费模型，请尝试查看免费模型";
    } else if (searchQuery.length > 0) {
      detailMessage = `没有找到包含 "${searchQuery}" 的模型，请尝试其他关键词`;
    } else if (showAllModels) {
      detailMessage = "请尝试刷新模型列表或检查网络连接";
    } else {
      detailMessage = "没有可以在预算内连续使用25天的模型，请考虑增加预算或点击'查看所有模型'";
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.colors.textSecondary} />
        <Text style={styles.emptyPrimaryText}>{message}</Text>
        <Text style={styles.emptySecondaryText}>{detailMessage}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderHeader()}
      
      {filteredModels.length > 0 ? (
        <FlatList
          data={filteredModels}
          keyExtractor={item => item.modelId}
          renderItem={({ item }) => (
            <ModelResultItem 
              result={item}
              monthlyBudget={monthlyBudget}
              includeImages={includeImages}
              includeVoiceGeneration={includeVoiceGeneration}
              includeImageGeneration={includeImageGeneration}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false} // parent ScrollView handles scrolling
        />
      ) : (
        renderEmptyList()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 24,
  },
  headerContainer: {
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
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
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(100, 100, 255, 0.15)',
    borderRadius: 16,
    marginTop: 4,
  },
  toggleButtonText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  servicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginBottom: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  serviceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 4,
  },
  serviceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
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
  }
});

export default ModelResultList;
