import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScriptSummarizationConfig as SummarizationConfig, Script } from '@/shared/types/script-types';
import { ScriptService } from '@/services/script-service';

interface ScriptSummarizationConfigProps {
  script: Script;
  onClose: () => void;
  onConfigUpdated?: (config: SummarizationConfig) => void;
}

/**
 * 剧本历史总结配置组件
 */
const ScriptSummarizationConfigComponent: React.FC<ScriptSummarizationConfigProps> = ({
  script,
  onClose,
  onConfigUpdated,
}) => {
  const [config, setConfig] = useState<SummarizationConfig>({
    enabled: false,
    summaryThreshold: 6000,
    summaryLength: 1000,
    summaryRangePercent: null,
    lastSummarizedAt: 0,
  });
  
  const [rangeEnabled, setRangeEnabled] = useState(false);
  const [startPercent, setStartPercent] = useState(30);
  const [endPercent, setEndPercent] = useState(70);
  const [isSaving, setIsSaving] = useState(false);
  const [isManualSummarizing, setIsManualSummarizing] = useState(false);

  const scriptService = ScriptService.getInstance();

  useEffect(() => {
    // 加载现有配置
    if (script.summarizationConfig) {
      setConfig(script.summarizationConfig);
      if (script.summarizationConfig.summaryRangePercent) {
        setRangeEnabled(true);
        setStartPercent(script.summarizationConfig.summaryRangePercent.start);
        setEndPercent(script.summarizationConfig.summaryRangePercent.end);
      }
    }
  }, [script]);

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // 验证输入
      if (config.summaryThreshold <= 0) {
        Alert.alert('错误', '字符数阈值必须大于0');
        return;
      }
      
      if (config.summaryLength <= 0) {
        Alert.alert('错误', '总结长度必须大于0');
        return;
      }

      if (rangeEnabled) {
        if (startPercent < 0 || startPercent >= 100 || endPercent <= startPercent || endPercent > 100) {
          Alert.alert('错误', '总结范围百分比设置无效');
          return;
        }
      }

      // 构建最终配置
      const finalConfig: SummarizationConfig = {
        ...config,
        summaryRangePercent: rangeEnabled ? { start: startPercent, end: endPercent } : null,
      };

      // 保存配置
      await scriptService.updateScriptSummarizationConfig(script.id, finalConfig);
      
      Alert.alert('成功', '总结配置已保存');
      onConfigUpdated?.(finalConfig);
      onClose();
    } catch (error) {
      console.error('保存总结配置失败:', error);
      Alert.alert('错误', '保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSummarize = async () => {
    try {
      setIsManualSummarizing(true);
      
      const success = await scriptService.summarizeScriptHistory(script.id, true);
      
      if (success) {
        Alert.alert('成功', '历史总结完成');
      } else {
        Alert.alert('失败', '历史总结失败，请检查配置和网络连接');
      }
    } catch (error) {
      console.error('手动总结失败:', error);
      Alert.alert('错误', '总结过程中发生错误');
    } finally {
      setIsManualSummarizing(false);
    }
  };

  const getHistoryStats = async () => {
    try {
      const history = await scriptService.getScriptHistory(script.id);
      const totalCharacters = history.reduce((sum, message) => {
        const content = scriptService.extractPlotContent(message.aiResponse);
        return sum + content.length;
      }, 0);
      
      return {
        messageCount: history.length,
        totalCharacters,
      };
    } catch (error) {
      return { messageCount: 0, totalCharacters: 0 };
    }
  };

  const [historyStats, setHistoryStats] = useState<{messageCount: number, totalCharacters: number}>({
    messageCount: 0,
    totalCharacters: 0,
  });

  useEffect(() => {
    getHistoryStats().then(setHistoryStats);
  }, [script.id]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>剧本历史总结配置</Text>
        <Text style={styles.subtitle}>{script.name}</Text>

        {/* 历史统计 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>当前历史统计</Text>
          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>消息数量: {historyStats.messageCount}</Text>
            <Text style={styles.statsText}>总字符数: {historyStats.totalCharacters}</Text>
            {config.enabled && historyStats.totalCharacters >= config.summaryThreshold && (
              <Text style={styles.warningText}>⚠️ 已超过总结阈值，建议执行总结</Text>
            )}
          </View>
        </View>

        {/* 总结开关 */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>启用自动总结</Text>
            <Switch
              value={config.enabled}
              onValueChange={(value) => setConfig(prev => ({ ...prev, enabled: value }))}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={config.enabled ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>
          <Text style={styles.description}>
            当历史字符数超过阈值时，自动总结历史内容以压缩上下文
          </Text>
        </View>

        {/* 字符数阈值 */}
        <View style={styles.section}>
          <Text style={styles.label}>字符数阈值</Text>
          <TextInput
            style={styles.input}
            value={config.summaryThreshold.toString()}
            onChangeText={(text) => {
              const value = parseInt(text, 10);
              if (!isNaN(value)) {
                setConfig(prev => ({ ...prev, summaryThreshold: value }));
              }
            }}
            keyboardType="numeric"
            placeholder="6000"
            editable={config.enabled}
          />
          <Text style={styles.description}>
            历史内容超过此字符数时触发自动总结
          </Text>
        </View>

        {/* 总结长度 */}
        <View style={styles.section}>
          <Text style={styles.label}>总结目标长度</Text>
          <TextInput
            style={styles.input}
            value={config.summaryLength.toString()}
            onChangeText={(text) => {
              const value = parseInt(text, 10);
              if (!isNaN(value)) {
                setConfig(prev => ({ ...prev, summaryLength: value }));
              }
            }}
            keyboardType="numeric"
            placeholder="1000"
            editable={config.enabled}
          />
          <Text style={styles.description}>
            AI生成总结的目标字符数
          </Text>
        </View>

        {/* 总结范围 */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>自定义总结范围</Text>
            <Switch
              value={rangeEnabled}
              onValueChange={setRangeEnabled}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={rangeEnabled ? '#f5dd4b' : '#f4f3f4'}
              disabled={!config.enabled}
            />
          </View>
          
          {rangeEnabled && (
            <View style={styles.rangeContainer}>
              <View style={styles.rangeRow}>
                <Text style={styles.rangeLabel}>开始百分比:</Text>
                <TextInput
                  style={styles.rangeInput}
                  value={startPercent.toString()}
                  onChangeText={(text) => {
                    const value = parseInt(text, 10);
                    if (!isNaN(value)) setStartPercent(value);
                  }}
                  keyboardType="numeric"
                  editable={config.enabled}
                />
                <Text style={styles.rangeLabel}>%</Text>
              </View>
              
              <View style={styles.rangeRow}>
                <Text style={styles.rangeLabel}>结束百分比:</Text>
                <TextInput
                  style={styles.rangeInput}
                  value={endPercent.toString()}
                  onChangeText={(text) => {
                    const value = parseInt(text, 10);
                    if (!isNaN(value)) setEndPercent(value);
                  }}
                  keyboardType="numeric"
                  editable={config.enabled}
                />
                <Text style={styles.rangeLabel}>%</Text>
              </View>
            </View>
          )}
          
          <Text style={styles.description}>
            {rangeEnabled 
              ? `将总结历史的 ${startPercent}% 到 ${endPercent}% 部分`
              : '总结所有历史内容（默认行为）'
            }
          </Text>
        </View>

        {/* 手动总结按钮 */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, styles.summarizeButton]}
            onPress={handleManualSummarize}
            disabled={isManualSummarizing || historyStats.messageCount === 0}
          >
            <Text style={styles.buttonText}>
              {isManualSummarizing ? '正在总结...' : '立即总结历史'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.description}>
            立即对当前历史执行总结操作
          </Text>
        </View>

        {/* 按钮组 */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>取消</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.buttonText}>
              {isSaving ? '保存中...' : '保存配置'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  statsContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 6,
  },
  statsText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#ff6b35',
    fontWeight: '500',
    marginTop: 8,
  },
  rangeContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rangeLabel: {
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  rangeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    width: 60,
    textAlign: 'center',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  saveButton: {
    backgroundColor: '#007bff',
  },
  summarizeButton: {
    backgroundColor: '#28a745',
    marginBottom: 8,
  },
});

export default ScriptSummarizationConfigComponent;
