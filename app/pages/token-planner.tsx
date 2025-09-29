import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView,
  StatusBar,
  Platform,
  ToastAndroid,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import ModelInputForm from '@/components/token-planner/ModelInputForm';
import ModelResultList from '@/components/token-planner/ModelResultList';
import LoadingIndicator from '@/components/LoadingIndicator';
import Header from '@/components/Header';

interface ModelData {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
    image: string;
    request: string;
    input_cache_read: string;
    input_cache_write: string;
    web_search: string;
    internal_reasoning: string;
  };
  context_length: number;
  architecture?: {
    input_modalities: string[];
    output_modalities: string[];
  };
}

interface InputValues {
  userInputWords: number;
  expectedOutputWords: number;
  roleCardWords: number;
  imageCount: number;
  includeImages: boolean;
  conversationTurns: number;
  monthlyBudget: number;
  dailyChats: number;
  tokenPerWordRatio: number;
  includeVoiceGeneration: boolean;
  dailyVoiceMessages: number;
  voiceDurationPerMessage: number;
  includeImageGeneration: boolean;
  monthlyGeneratedImages: number;
}

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

const VOICE_GENERATION_COST_PER_SECOND = 0.01;
const IMAGE_GENERATION_COST_PER_IMAGE = 0.01 * 5;
const TOKEN_PLANNER_SETTINGS_KEY = 'token_planner_settings';

const TokenPlanner: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [models, setModels] = useState<ModelData[]>([]);
  const [results, setResults] = useState<CalculationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const defaultValues: InputValues = {
    userInputWords: 100,
    expectedOutputWords: 200,
    roleCardWords: 500,
    imageCount: 0,
    includeImages: false,
    conversationTurns: 5,
    monthlyBudget: 30,
    dailyChats: 300,
    tokenPerWordRatio: 0.75,
    includeVoiceGeneration: false,
    dailyVoiceMessages: 5,
    voiceDurationPerMessage: 5,
    includeImageGeneration: false,
    monthlyGeneratedImages: 10
  };

  const [inputValues, setInputValues] = useState<InputValues>(defaultValues);

  useEffect(() => {
    const initPage = async () => {
      await loadSavedSettings();
      fetchModels();
    };
    
    initPage();
  }, []);

  const loadSavedSettings = async () => {
    try {
      setLoading(true);
      const savedSettings = await AsyncStorage.getItem(TOKEN_PLANNER_SETTINGS_KEY);
      if (savedSettings !== null) {
        const parsedSettings = JSON.parse(savedSettings) as InputValues;
        setInputValues(parsedSettings);
      }
    } catch (err) {
      console.error('Error loading saved settings:', err);
    } finally {
      setSettingsLoaded(true);
      setLoading(false);
    }
  };

  const saveSettings = async (values: InputValues) => {
    try {
      await AsyncStorage.setItem(TOKEN_PLANNER_SETTINGS_KEY, JSON.stringify(values));
      if (Platform.OS === 'android') {
        ToastAndroid.show('设置已保存', ToastAndroid.SHORT);
      } else {
        Alert.alert('成功', '使用习惯设置已保存');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      if (Platform.OS === 'android') {
        ToastAndroid.show('保存设置失败', ToastAndroid.SHORT);
      } else {
        Alert.alert('错误', '保存设置失败');
      }
    }
  };

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError(null);
      await new Promise(resolve => setTimeout(resolve, 500));
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      const data = await response.json();
      setModels(data.data);
    } catch (err) {
      console.error('Error fetching models:', err);
      setError('获取模型列表失败，请检查网络连接或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const calculateCosts = (values: InputValues) => {
    setLoading(true);
    setError(null);

    try {
      const calculationResults: CalculationResult[] = models.map(model => {
        const inputTokens = values.userInputWords * values.tokenPerWordRatio;
        const outputTokens = values.expectedOutputWords * values.tokenPerWordRatio;
        const roleCardTokens = values.roleCardWords * values.tokenPerWordRatio;
        const chatHistoryTokens = values.conversationTurns * (inputTokens + outputTokens);
        const totalTokensPerChat = inputTokens + outputTokens + roleCardTokens + chatHistoryTokens;
        const totalDailyTokens = totalTokensPerChat * values.dailyChats;
        const totalMonthlyTokens = totalDailyTokens * 30;

        const inputPricePerToken = parseFloat(model.pricing.prompt) || 0;
        const outputPricePerToken = parseFloat(model.pricing.completion) || 0;
        const imagePricePerImage = parseFloat(model.pricing.image) || 0;

        const inputCost = (totalMonthlyTokens / 1000000) * inputPricePerToken * 1000000;
        const outputCost = (totalMonthlyTokens / 1000000) * outputPricePerToken * 1000000;
        const imageCost = values.includeImages ? 
          (values.imageCount / 1000000) * imagePricePerImage * 1000000 : 0;

        const voiceGenerationCost = values.includeVoiceGeneration ? 
          values.dailyVoiceMessages * values.voiceDurationPerMessage * VOICE_GENERATION_COST_PER_SECOND * 30 : 0;

        const imageGenerationCost = values.includeImageGeneration ? 
          values.monthlyGeneratedImages * IMAGE_GENERATION_COST_PER_IMAGE : 0;

        const modelUsageCost = inputCost + outputCost + imageCost;
        const totalMonthlyCost = modelUsageCost;

        let daysCanChat = 0;
        if (modelUsageCost > 0) {
          const adjustedBudget = Math.max(0, values.monthlyBudget - voiceGenerationCost - imageGenerationCost);
          const dailyModelCost = modelUsageCost / 30;
          daysCanChat = dailyModelCost > 0 ? adjustedBudget / dailyModelCost : 9999;
        } else {
          daysCanChat = 9999;
        }

        const hasImageCapability = model.architecture?.input_modalities?.includes('image') || false;

        return {
          modelId: model.id,
          modelName: model.name,
          modelDescription: model.description || '',
          estimatedMonthlyCost: totalMonthlyCost,
          daysCanChat: daysCanChat,
          totalMonthlyTokens: totalMonthlyTokens,
          inputCost: inputCost,
          outputCost: outputCost,
          imageCost: imageCost,
          contextLength: model.context_length,
          hasImageCapability,
          voiceGenerationCost,
          imageGenerationCost
        };
      });

      calculationResults.sort((a, b) => a.estimatedMonthlyCost - b.estimatedMonthlyCost);
      setResults(calculationResults);
    } catch (err) {
      console.error('Error calculating costs:', err);
      setError('计算费用时发生错误');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (values: InputValues) => {
    setInputValues(values);
    calculateCosts(values);
    saveSettings(values);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <Header title="模型费用计算器" showBackButton onBackPress={() => router.back()} />
      
      <ScrollView style={styles.container}>
        <View style={styles.introContainer}>
          <Text style={styles.introTitle}>优化您的 AI 使用成本</Text>
          <Text style={styles.introDescription}>
            基于您的使用习惯估算不同模型的费用，帮助您做出更明智的选择。
            现在支持计算模型使用、语音生成和图片生成的综合成本。
          </Text>
        </View>

        {settingsLoaded && (
          <ModelInputForm 
            defaultValues={inputValues} 
            onSubmit={handleFormSubmit}
            onRefreshModels={fetchModels}
            onSaveSettings={saveSettings}
          />
        )}

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : results.length > 0 ? (
          <ModelResultList 
            results={results} 
            monthlyBudget={inputValues.monthlyBudget}
            includeImages={inputValues.includeImages}
            includeVoiceGeneration={inputValues.includeVoiceGeneration}
            includeImageGeneration={inputValues.includeImageGeneration}
          />
        ) : !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              请填写您的使用习惯并点击 "计算费用" 按钮
            </Text>
          </View>
        )}
      </ScrollView>

      <LoadingIndicator 
        visible={loading} 
        text="加载中..." 
        overlay={true}
        useModal={true}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  introContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  introDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: 8,
    marginVertical: 16,
  },
  errorText: {
    color: theme.colors.danger,
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  }
});

export default TokenPlanner;
