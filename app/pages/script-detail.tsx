import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ScriptService } from '@/services/script-service';
import { Script, ScriptStyleConfig, ScriptSummarizationConfig } from '@/shared/types/script-types';
import { theme } from '@/constants/theme';
import { useCharacters } from '@/constants/CharactersContext';
import SummaryManager from '@/app/components/SummaryManager';
import ScriptHistoryManager from '@/app/components/ScriptHistoryManager';

const { width, height } = Dimensions.get('window');

const ScriptDetailPage: React.FC = () => {
  const router = useRouter();
  const { scriptId } = useLocalSearchParams<{ scriptId: string }>();
  const { characters } = useCharacters();
  
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSummarizationConfig, setShowSummarizationConfig] = useState(false);
  const [summarizationConfig, setSummarizationConfig] = useState<ScriptSummarizationConfig>({
    enabled: false,
    summaryThreshold: 6000,
    summaryLength: 1000,
    summaryRangePercent: null,
    lastSummarizedAt: 0,
  });
  
  // 新增管理组件状态
  const [showSummaryManager, setShowSummaryManager] = useState(false);
  const [showHistoryManager, setShowHistoryManager] = useState(false);
  
  // 新增配置状态
  const [userNameInput, setUserNameInput] = useState('');
  const [summaryThresholdInput, setSummaryThresholdInput] = useState('10');
  const [expManagerEnabled, setExpManagerEnabled] = useState(false);
  const [expManagerInterval, setExpManagerInterval] = useState('3');
  
  // 编辑状态的数据 (已废弃，使用统一配置导入)

  const scriptService = ScriptService.getInstance();



  // 加载剧本数据
  useEffect(() => {
    const loadScript = async () => {
      if (!scriptId) return;
      
      try {
        setIsLoading(true);
        const scriptData = await scriptService.getScript(scriptId);
        if (!scriptData) {
          Alert.alert('错误', '剧本不存在');
          router.back();
          return;
        }
        
        setScript(scriptData);
        
        // 初始化总结配置
        if (scriptData.summarizationConfig) {
          setSummarizationConfig(scriptData.summarizationConfig);
        }
        
        // 初始化新的配置表单状态
        setUserNameInput(scriptData.userName || '');
        setSummaryThresholdInput((scriptData.summarizationConfig?.summaryThreshold ? Math.ceil(scriptData.summarizationConfig.summaryThreshold / 600) : 10).toString());
        setExpManagerEnabled(scriptData.expManagerConfig?.enabled || false);
        setExpManagerInterval((scriptData.expManagerConfig?.intervalHistoryCount || 3).toString());
      } catch (error) {
        console.error('加载剧本失败:', error);
        Alert.alert('错误', '加载剧本失败');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadScript();
  }, [scriptId, refreshKey]);

  // 导入统一剧本配置
  const handleImportUnifiedConfig = async () => {
    if (!script) return;
    
    try {
      const result = await scriptService.importUnifiedScriptConfig();
      if (!result) return;
      
      const { scriptConfig, variableConfig } = result;
      
      await scriptService.saveUnifiedScriptConfig(script.id, scriptConfig, variableConfig);
      
      // 更新本地状态
      setScript(prev => prev ? { 
        ...prev, 
        styleConfig: {
          id: `style_${Date.now()}`,
          name: scriptConfig.name,
          outputRequirements: scriptConfig.outputRequirements,
          webViewHtml: scriptConfig.webViewHtml,
          createdAt: Date.now(),
        },
        variableConfig: variableConfig || prev.variableConfig,
        // 如果导入配置包含封面，则更新脚本封面用于立即预览
        cover: (scriptConfig as any)?.cover || prev.cover
      } : null);
      
      const hasVariable = variableConfig ? '，包含变量配置' : '';
      const hasRegex = (scriptConfig as any).regexPatterns && Array.isArray((scriptConfig as any).regexPatterns) && (scriptConfig as any).regexPatterns.length > 0 
        ? `，包含${(scriptConfig as any).regexPatterns.length}个正则表达式` 
        : '';
      
      Alert.alert(
        '导入成功', 
        `配置 "${scriptConfig.name}" 已导入${hasVariable}${hasRegex}`
      );
    } catch (error) {
      console.error('导入统一配置失败:', error);
      Alert.alert('错误', error instanceof Error ? error.message : '导入失败');
    }
  };

  // 导出样式配置
  const handleExportStyleConfig = async () => {
    if (!script || !script.styleConfig) {
      Alert.alert('提示', '当前剧本没有样式配置可导出');
      return;
    }
    
    try {
      const exportPath = await scriptService.exportStyleConfigAsArchive(script.id);
      
      Alert.alert(
        '导出成功', 
        `样式配置已导出到: ${exportPath}\n\n您可以在文件管理器中找到此文件。`,
        [
          { text: '确定', style: 'default' },
          { 
            text: '分享文件', 
            onPress: () => {
              // 这里可以添加文件分享功能
              console.log('分享文件:', exportPath);
            }
          }
        ]
      );
    } catch (error) {
      console.error('导出样式配置失败:', error);
      Alert.alert('错误', error instanceof Error ? error.message : '导出失败');
    }
  };

  // 清除样式配置
  const handleClearStyleConfig = async () => {
    if (!script) return;
    
    Alert.alert(
      '确认清除',
      '确定要清除当前的样式配置吗？将恢复为默认样式。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            try {
              await scriptService.clearScriptStyleConfig(script.id);
              
              // 更新本地状态
              setScript(prev => prev ? { 
                ...prev, 
                styleConfig: undefined
              } : null);
              
              Alert.alert('成功', '样式配置已清除');
            } catch (error) {
              console.error('清除样式配置失败:', error);
              Alert.alert('错误', '清除失败');
            }
          }
        }
      ]
    );
  };

  // 更新总结配置
  const handleUpdateSummarizationConfig = async (config: ScriptSummarizationConfig) => {
    if (!script) return;
    
    try {
      await scriptService.updateScriptSummarizationConfig(script.id, config);
      
      // 更新本地状态
      setSummarizationConfig(config);
      setScript(prev => prev ? { 
        ...prev, 
        summarizationConfig: config,
        updatedAt: Date.now()
      } : null);
      
      Alert.alert('成功', '总结配置已更新');
    } catch (error) {
      console.error('更新总结配置失败:', error);
      Alert.alert('错误', '更新配置失败');
    }
  };

  // 手动总结历史
  const handleManualSummarize = async () => {
    if (!script) return;
    
    try {
      setIsSaving(true);
      const success = await scriptService.summarizeScriptHistory(script.id, true);
      
      if (success) {
        Alert.alert('成功', '剧本历史总结完成');
        // 刷新脚本数据
        setRefreshKey(prev => prev + 1);
      } else {
        Alert.alert('失败', '历史总结失败，请检查配置和网络连接');
      }
    } catch (error) {
      console.error('手动总结失败:', error);
      Alert.alert('错误', '总结过程中发生错误');
    } finally {
      setIsSaving(false);
    }
  };

  // 保存新的配置
  const handleSaveNewConfig = async () => {
    if (!script) return;
    
    try {
      setIsSaving(true);
      
      // 更新用户名
      if (userNameInput !== script.userName) {
        await scriptService.updateScriptUserName(script.id, userNameInput);
      }
      
      // 更新总结配置
      const summaryThreshold = parseInt(summaryThresholdInput) * 600; // 转换为字符数（约600字符/条消息）
      const newSummarizationConfig: ScriptSummarizationConfig = {
        ...summarizationConfig,
        enabled: summaryThreshold > 0,
        summaryThreshold: summaryThreshold
      };
      
      if (JSON.stringify(newSummarizationConfig) !== JSON.stringify(summarizationConfig)) {
        await scriptService.updateScriptSummarizationConfig(script.id, newSummarizationConfig);
        setSummarizationConfig(newSummarizationConfig);
      }
      
      // 更新ExpManager配置
      const newExpManagerConfig = {
        enabled: expManagerEnabled,
        intervalHistoryCount: parseInt(expManagerInterval) || 3,
        lastRunAt: script.expManagerConfig?.lastRunAt,
        lastProcessedHistoryIndex: script.expManagerConfig?.lastProcessedHistoryIndex
      };
      
      await scriptService.updateExpManagerConfig(script.id, newExpManagerConfig);
      
      // 刷新脚本数据
      setRefreshKey(prev => prev + 1);
      
      Alert.alert('成功', '配置已保存');
    } catch (error) {
      console.error('保存配置失败:', error);
      Alert.alert('错误', '保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };



  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!script) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#e74c3c" />
          <Text style={styles.errorText}>剧本不存在</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>剧本配置</Text>
        <TouchableOpacity 
          style={[styles.headerButton, styles.saveButton]} 
          onPress={handleSaveNewConfig}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 剧本封面头图 (无文字覆盖) */}
        <View style={styles.coverHeaderNew}>
          {script.cover ? (
            <Image
              source={{ uri: script.cover }}
              style={styles.coverHeaderImageNew}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.coverHeaderPlaceholderNew}>
              <Ionicons name="film-outline" size={64} color="rgba(255, 255, 255, 0.5)" />
            </View>
          )}
        </View>

        {/* 剧本基本信息 */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.scriptTitleNew}>{script.name}</Text>
          <Text style={styles.scriptMetaNew}>
            {script.selectedCharacters.length} 个角色 • {new Date(script.updatedAt).toLocaleDateString()}
          </Text>
        </View>

        {/* 参与角色 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>参与角色</Text>
          <View style={styles.characterListNew}>
            {script.selectedCharacters.map((characterId, index) => {
              const character = characters.find(c => c.id === characterId);
              return (
                <View key={characterId} style={styles.characterItemNew}>
                  <Image
                    source={
                      character?.avatar
                        ? { uri: character.avatar }
                        : require('@/assets/images/default-avatar.png')
                    }
                    style={styles.characterAvatarNew}
                  />
                  <Text style={styles.characterNameNew}>
                    {character?.name || `角色 ${index + 1}`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 用户名设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>用户名设置</Text>
          <Text style={styles.configDescription}>
            在剧情中显示的用户名称，将替换剧本中的 {'{user}'} 占位符
          </Text>
          <TextInput
            style={styles.configInput}
            value={userNameInput}
            onChangeText={setUserNameInput}
            placeholder="输入您的用户名"
            placeholderTextColor="#999"
          />
        </View>

        {/* 总结配置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>历史总结设置</Text>
          <Text style={styles.configDescription}>
            当历史消息数量达到阈值时，自动总结历史内容以节省上下文空间
          </Text>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>触发阈值 (消息数)</Text>
            <TextInput
              style={styles.configInputSmall}
              value={summaryThresholdInput}
              onChangeText={setSummaryThresholdInput}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor="#999"
            />
          </View>
          <Text style={styles.configHint}>
            建议设置为 10-20 条消息，设置为 0 禁用自动总结
          </Text>
        </View>

        {/* ExpManager 设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>体验管理器设置</Text>
          <Text style={styles.configDescription}>
            体验管理器可以分析剧情发展，提供更好的AI响应体验
          </Text>
          
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>启用体验管理器</Text>
            <Switch
              value={expManagerEnabled}
              onValueChange={setExpManagerEnabled}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={expManagerEnabled ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>
          
          {expManagerEnabled && (
            <View style={styles.configRow}>
              <Text style={styles.configLabel}>触发间隔 (历史条数)</Text>
              <TextInput
                style={styles.configInputSmall}
                value={expManagerInterval}
                onChangeText={setExpManagerInterval}
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor="#999"
              />
            </View>
          )}
          
          <Text style={styles.configHint}>
            {expManagerEnabled ? 
              `每产生 ${expManagerInterval} 条历史消息后运行一次体验管理器` : 
              '启用后可自动分析剧情发展，优化AI响应质量'
            }
          </Text>
        </View>

        {/* 配置管理
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>配置管理</Text>
          
          <View style={styles.styleConfigButtons}>
            <TouchableOpacity
              style={styles.styleConfigButton}
              onPress={handleImportUnifiedConfig}
            >
              <Ionicons name="download-outline" size={20} color="#fff" />
              <Text style={styles.styleConfigButtonText}>导入配置</Text>
            </TouchableOpacity>
            
            {script.styleConfig && (
              <TouchableOpacity
                style={styles.styleConfigButton}
                onPress={handleExportStyleConfig}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.styleConfigButtonText}>导出配置</Text>
              </TouchableOpacity>
            )}
          </View>
        </View> */}

        {/* 高级管理功能 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>高级管理</Text>
          
          <View style={styles.styleConfigButtons}>
            <TouchableOpacity
              style={[styles.styleConfigButton, styles.summaryManagerButton]}
              onPress={() => setShowSummaryManager(true)}
            >
              <Ionicons name="library-outline" size={20} color="#000" />
              <Text style={[styles.styleConfigButtonText, styles.summaryManagerButtonText]}>总结管理</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.styleConfigButton, styles.historyManagerButton]}
              onPress={() => setShowHistoryManager(true)}
            >
              <Ionicons name="document-text-outline" size={20} color="#000" />
              <Text style={[styles.styleConfigButtonText, styles.historyManagerButtonText]}>历史管理</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.configDescription}>
            总结管理: 查看、编辑和管理已生成的总结内容{'\n'}
            历史管理: 导入/导出剧本历史记录，支持txt格式
          </Text>
        </View>
      </ScrollView>

      {/* 总结配置模态框保持不变 */}
      <Modal
        visible={showSummarizationConfig}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSummarizationConfig(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>历史总结配置</Text>
            <TouchableOpacity onPress={() => setShowSummarizationConfig(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>
            {/* 启用开关 */}
            <View style={styles.modalSection}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>启用自动总结</Text>
                <Switch
                  value={summarizationConfig.enabled}
                  onValueChange={(value) => setSummarizationConfig(prev => ({ ...prev, enabled: value }))}
                  trackColor={{ false: '#767577', true: '#81b0ff' }}
                  thumbColor={summarizationConfig.enabled ? '#f5dd4b' : '#f4f3f4'}
                />
              </View>
              <Text style={styles.modalDescription}>
                当历史字符数超过阈值时自动总结以压缩上下文
              </Text>
            </View>

            {/* 字符数阈值 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>字符数阈值</Text>
              <TextInput
                style={styles.modalInput}
                value={summarizationConfig.summaryThreshold.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text, 10);
                  if (!isNaN(value) && value > 0) {
                    setSummarizationConfig(prev => ({ ...prev, summaryThreshold: value }));
                  }
                }}
                keyboardType="numeric"
                placeholder="6000"
                placeholderTextColor="#999"
                editable={summarizationConfig.enabled}
              />
              <Text style={styles.modalDescription}>
                历史内容超过此字符数时触发自动总结
              </Text>
            </View>

            {/* 总结长度 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>总结目标长度</Text>
              <TextInput
                style={styles.modalInput}
                value={summarizationConfig.summaryLength.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text, 10);
                  if (!isNaN(value) && value > 0) {
                    setSummarizationConfig(prev => ({ ...prev, summaryLength: value }));
                  }
                }}
                keyboardType="numeric"
                placeholder="1000"
                placeholderTextColor="#999"
                editable={summarizationConfig.enabled}
              />
              <Text style={styles.modalDescription}>
                AI生成总结的目标字符数
              </Text>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setShowSummarizationConfig(false)}
            >
              <Text style={styles.modalButtonText}>取消</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.modalSaveButton]}
              onPress={() => {
                handleUpdateSummarizationConfig(summarizationConfig);
                setShowSummarizationConfig(false);
              }}
            >
              <Text style={[styles.modalButtonText, styles.modalSaveButtonText]}>保存</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 新增管理组件 */}
      {script && (
        <>
          <SummaryManager
            visible={showSummaryManager}
            script={script}
            onClose={() => setShowSummaryManager(false)}
            onScriptUpdated={(updatedScript) => {
              setScript(updatedScript);
              setRefreshKey(prev => prev + 1);
            }}
          />
          
          <ScriptHistoryManager
            visible={showHistoryManager}
            script={script}
            onClose={() => setShowHistoryManager(false)}
            onScriptUpdated={(updatedScript) => {
              setScript(updatedScript);
              setRefreshKey(prev => prev + 1);
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#000',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  // 新的封面头图样式
  coverHeader: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
  },
  coverHeaderImage: {
    width: '100%',
    height: '100%',
  },
  coverHeaderPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  // 旧的样式保留用于兼容
  scriptHeader: {
    flexDirection: 'row',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  coverContainer: {
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 16,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scriptInfo: {
    flex: 1,
  },
  scriptTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  scriptMeta: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginBottom: 4,
  },
  scriptDate: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    marginBottom: 2,
  },
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  scriptDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    lineHeight: 24,
  },
  // 编辑相关样式
  editContainer: {
    gap: 16,
  },
  editField: {
    marginBottom: 16,
  },
  editFieldLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  editTextArea: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 80,
  },
  viewContainer: {
    gap: 16,
  },
  viewField: {
    marginBottom: 16,
  },
  viewFieldLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  viewFieldContent: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
  },
  characterList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flex: 1,
    minWidth: 200,
  },
  characterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  characterContext: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
  characterText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 6,
  },
  styleConfigInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  styleConfigText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  styleConfigDate: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  styleConfigDescription: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  styleConfigButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  styleConfigButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    gap: 8,
  },
  clearConfigButton: {
    backgroundColor: '#e74c3c',
  },
  styleConfigButtonText: {
    color: 'black',
    fontSize: 14,
    fontWeight: '600',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 20,
    gap: 12,
  },
  startButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // 总结配置相关样式
  summarizationConfigInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  summarizationConfigText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  summarizationConfigDetail: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  summarizationConfigDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  summarizationButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  configButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    gap: 8,
  },
  summarizeButton: {
    backgroundColor: '#28a745',
  },
  configButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  // 模态框样式
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 20,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#6c757d',
  },
  modalSaveButton: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalSaveButtonText: {
    color: '#000',
  },
  // 新的配置页面样式
  coverHeaderNew: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  coverHeaderImageNew: {
    width: '100%',
    height: '100%',
  },
  coverHeaderPlaceholderNew: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  basicInfoSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  scriptTitleNew: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  scriptMetaNew: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    textAlign: 'center',
  },
  characterListNew: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  characterItemNew: {
    alignItems: 'center',
    width: 80,
  },
  characterAvatarNew: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  characterNameNew: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  configDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  configInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  configLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  configInputSmall: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: 80,
    textAlign: 'center',
  },
  configHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
  },
  // 新增高级管理按钮样式
  summaryManagerButton: {
    backgroundColor: theme.colors.primary,
  },
  summaryManagerButtonText: {
    color: '#000',
  },
  historyManagerButton: {
    backgroundColor: theme.colors.primary,
  },
  historyManagerButtonText: {
    color: '#000',
  },
});

export default ScriptDetailPage;
