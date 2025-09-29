import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity,
  Platform, 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

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

interface ModelResultItemProps {
  result: CalculationResult;
  monthlyBudget: number;
  includeImages: boolean;
  includeVoiceGeneration: boolean;
  includeImageGeneration: boolean;
}

const ModelResultItem: React.FC<ModelResultItemProps> = ({ 
  result, 
  monthlyBudget,
  includeImages,
  includeVoiceGeneration,
  includeImageGeneration
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const toggleExpand = () => {
    setExpanded(!expanded);
  };
  
  // Format numbers for display
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };
  
  // Format cost for display
  const formatCost = (cost: number): string => {
    if (cost === 0) {
      return "免费";
    } else if (cost >= 1) {
      return `¥${cost.toFixed(2)}`;
    } else if (cost >= 0.01) {
      return `¥${cost.toFixed(3)}`;
    } else {
      return `¥${cost.toFixed(6)}`;
    }
  };
  
  // Format days for display
  const formatDays = (days: number): string => {
    if (days > 999) {
      return "无限制";
    } else {
      return `${Math.floor(days)}天`;
    }
  };
  
  // Determine card color based on affordability
  const getBorderColor = () => {
    if (result.estimatedMonthlyCost === 0) {
      return theme.colors.success; // Free model
    } else if (result.daysCanChat >= 30) {
      return theme.colors.success; // Can use for a full month
    } else if (result.daysCanChat >= 25) {
      return theme.colors.warning; // Can use for almost a month
    } else if (result.estimatedMonthlyCost <= monthlyBudget) {
      return theme.colors.info; // Within budget but less than 25 days
    } else {
      return 'rgba(255, 255, 255, 0.1)'; // Over budget
    }
  };
  
  const isFreeModel = result.estimatedMonthlyCost === 0;
  
  // Calculate total with additional services
  const totalEstimatedCost = result.estimatedMonthlyCost + 
    (includeVoiceGeneration ? result.voiceGenerationCost : 0) + 
    (includeImageGeneration ? result.imageGenerationCost : 0);
  
  return (
    <TouchableOpacity 
      style={[
        styles.container, 
        { borderColor: getBorderColor() }
      ]} 
      onPress={toggleExpand}
      activeOpacity={0.8}
    >
      <View style={styles.headerRow}>
        <View style={styles.modelInfo}>
          <Text style={styles.modelName}>{result.modelName}</Text>
          <View style={styles.tagsContainer}>
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
            
            {result.hasImageCapability && includeImages && (
              <View style={styles.imageCapabilityTag}>
                <Ionicons name="image-outline" size={12} color={theme.colors.info} />
                <Text style={styles.imageCapabilityText}>支持图像</Text>
              </View>
            )}
            
            {includeVoiceGeneration && (
              <View style={styles.voiceGenerationTag}>
                <Ionicons name="mic-outline" size={12} color={theme.colors.primary} />
                <Text style={styles.voiceGenerationText}>语音</Text>
              </View>
            )}
            
            {includeImageGeneration && (
              <View style={styles.imageGenerationTag}>
                <Ionicons name="brush-outline" size={12} color="#9c27b0" />
                <Text style={styles.imageGenerationText}>绘图</Text>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.costsContainer}>
          <Text style={[
            styles.costText,
            isFreeModel && !includeVoiceGeneration && !includeImageGeneration && styles.freeCostText
          ]}>
            {formatCost(totalEstimatedCost)}
            {!isFreeModel && <Text style={styles.periodText}>/月</Text>}
          </Text>
          <Text style={[
            styles.daysText,
            result.daysCanChat >= 30 || isFreeModel ? styles.goodDays :
            result.daysCanChat >= 25 ? styles.okDays : styles.badDays
          ]}>
            {formatDays(result.daysCanChat)}
          </Text>
        </View>
      </View>
      
      {result.modelDescription ? (
        <Text style={styles.description} numberOfLines={expanded ? undefined : 2}>
          {result.modelDescription}
        </Text>
      ) : null}
      
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          在您的预算下可以使用
          <Text style={styles.highlightText}> {formatDays(result.daysCanChat)} </Text>
          {!isFreeModel && result.daysCanChat < 30 && `(${(result.daysCanChat / 30 * 100).toFixed(0)}%)`}
        </Text>
        
        <Ionicons 
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} 
          size={16} 
          color={theme.colors.textSecondary} 
        />
      </View>
      
      {expanded && (
        <View style={styles.detailsContainer}>
          <View style={styles.separator} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>每月总 Token</Text>
            <Text style={styles.detailValue}>
              {formatNumber(result.totalMonthlyTokens, 0)}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>输入 Token 费用</Text>
            <Text style={styles.detailValue}>{formatCost(result.inputCost)}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>输出 Token 费用</Text>
            <Text style={styles.detailValue}>{formatCost(result.outputCost)}</Text>
          </View>
          
          {includeImages && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>图片处理费用</Text>
              <Text style={styles.detailValue}>{formatCost(result.imageCost)}</Text>
            </View>
          )}
          
          {includeVoiceGeneration && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>语音生成费用</Text>
              <Text style={styles.detailValue}>{formatCost(result.voiceGenerationCost)}</Text>
            </View>
          )}
          
          {includeImageGeneration && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>图片生成费用</Text>
              <Text style={styles.detailValue}>{formatCost(result.imageGenerationCost)}</Text>
            </View>
          )}
          
          {(includeVoiceGeneration || includeImageGeneration) && (
            <>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>总计费用</Text>
                <Text style={styles.detailValue}>{formatCost(totalEstimatedCost)}</Text>
              </View>
            </>
          )}
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>上下文长度</Text>
            <Text style={styles.detailValue}>{result.contextLength.toLocaleString()}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>模型 ID</Text>
            <Text style={[styles.detailValue, styles.modelIdText]} numberOfLines={1}>
              {result.modelId}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modelInfo: {
    flex: 1,
    marginRight: 16,
  },
  modelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  freeTag: {
    backgroundColor: 'rgba(75, 181, 67, 0.15)',
  },
  freeTagText: {
    fontSize: 10,
    color: theme.colors.success,
    marginLeft: 4,
    fontWeight: '500',
  },
  paidTag: {
    backgroundColor: 'rgba(246, 190, 0, 0.15)',
  },
  paidTagText: {
    fontSize: 10,
    color: theme.colors.warning,
    marginLeft: 4,
    fontWeight: '500',
  },
  imageCapabilityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  imageCapabilityText: {
    fontSize: 10,
    color: theme.colors.info,
    marginLeft: 4,
  },
  voiceGenerationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 100, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  voiceGenerationText: {
    fontSize: 10,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  imageGenerationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(156, 39, 176, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  imageGenerationText: {
    fontSize: 10,
    color: '#9c27b0',
    marginLeft: 4,
  },
  costsContainer: {
    alignItems: 'flex-end',
  },
  costText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  freeCostText: {
    color: theme.colors.success,
  },
  periodText: {
    fontSize: 12,
    fontWeight: 'normal',
    color: theme.colors.textSecondary,
  },
  daysText: {
    fontSize: 14,
    marginTop: 4,
  },
  goodDays: {
    color: theme.colors.success,
  },
  okDays: {
    color: theme.colors.warning,
  },
  badDays: {
    color: theme.colors.danger,
  },
  description: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  summaryText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  highlightText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12,
  },
  detailsContainer: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modelIdText: {
    fontSize: 12,
    maxWidth: 180,
  }
});

export default ModelResultItem;
