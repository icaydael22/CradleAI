import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Script, ScriptMessage } from '@/shared/types/script-types';
import { ScriptService } from '@/services/script-service';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';

// 简单主题颜色定义
const theme = {
  colors: {
    primary: 'rgb(255, 224, 195)',
  }
};

interface SummaryManagerProps {
  visible: boolean;
  script: Script | null;
  onClose: () => void;
  onScriptUpdated: (updatedScript: Script) => void;
}

interface SummaryItem {
  id: string;
  content: string;
  originalMessagesCount: number;
  summarizedAt: number;
  summaryType: 'incremental' | 'manual' | 'auto';
}

const SummaryManager: React.FC<SummaryManagerProps> = ({
  visible,
  script,
  onClose,
  onScriptUpdated,
}) => {
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const scriptService = ScriptService.getInstance();

  // 加载总结数据
  const loadSummaries = async () => {
    if (!script?.id) return;

    try {
      setIsLoading(true);
      const history = await scriptService.getScriptHistory(script.id);
      
      // 过滤出总结消息
      const summaryMessages = history.filter(msg => 
        msg.aiResponse?._isMemorySummary === true
      );

      const summaryItems: SummaryItem[] = summaryMessages.map(msg => ({
        id: msg.id,
        content: msg.aiResponse.plotContent || '',
        originalMessagesCount: msg.aiResponse._originalMessagesCount || 0,
        summarizedAt: msg.aiResponse._summarizedAt || msg.timestamp,
        summaryType: msg.aiResponse._summaryType || 'manual',
      }));

      setSummaries(summaryItems);
    } catch (error) {
      console.error('加载总结数据失败:', error);
      Alert.alert('错误', '加载总结数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 手动触发总结
  const handleManualSummarize = async () => {
    if (!script?.id) return;

    Alert.alert(
      '确认总结',
      '确定要手动总结当前剧本历史吗？这将把未总结的消息压缩为一条总结消息。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认',
          style: 'default',
          onPress: async () => {
            try {
              setIsGeneratingSummary(true);
              const success = await scriptService.summarizeScriptHistory(script.id, true);
              
              if (success) {
                Alert.alert('成功', '剧本历史总结完成');
                await loadSummaries();
                
                // 重新加载script以获取更新的lastRawResponse
                const updatedScript = await scriptService.getScript(script.id);
                if (updatedScript) {
                  onScriptUpdated(updatedScript);
                }
              } else {
                Alert.alert('失败', '总结过程中发生错误');
              }
            } catch (error) {
              console.error('手动总结失败:', error);
              Alert.alert('错误', '总结过程中发生错误');
            } finally {
              setIsGeneratingSummary(false);
            }
          }
        }
      ]
    );
  };

  // 编辑总结内容
  const handleEditSummary = (summaryId: string, content: string) => {
    setEditingId(summaryId);
    setEditingContent(content);
  };

  // 保存编辑后的总结
  const handleSaveEdit = async () => {
    if (!script?.id || !editingId) return;

    try {
      setIsLoading(true);
      
      // 获取历史记录
      const history = await scriptService.getScriptHistory(script.id);
      
      // 找到要编辑的总结消息
      const messageIndex = history.findIndex(msg => msg.id === editingId);
      if (messageIndex === -1) {
        Alert.alert('错误', '找不到要编辑的总结');
        return;
      }

      // 更新总结内容
      history[messageIndex].aiResponse.plotContent = editingContent;
      history[messageIndex].aiResponse._editedAt = Date.now();

      // 保存更新后的历史
      const historyKey = `script_history_${script.id}`;
      await StorageAdapter.saveJson(historyKey, history);

      // 更新本地状态
      setSummaries(prev => prev.map(s => 
        s.id === editingId ? { ...s, content: editingContent } : s
      ));

      setEditingId(null);
      setEditingContent('');
      
      Alert.alert('成功', '总结内容已更新');
    } catch (error) {
      console.error('保存总结编辑失败:', error);
      Alert.alert('错误', '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 删除总结
  const handleDeleteSummary = (summaryId: string) => {
    Alert.alert(
      '确认删除',
      '确定要删除这条总结吗？此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              
              // 获取历史记录
              const history = await scriptService.getScriptHistory(script!.id);
              
              // 移除要删除的总结消息
              const updatedHistory = history.filter(msg => msg.id !== summaryId);

              // 保存更新后的历史
              const historyKey = `script_history_${script!.id}`;
              await StorageAdapter.saveJson(historyKey, updatedHistory);

              // 更新本地状态
              setSummaries(prev => prev.filter(s => s.id !== summaryId));
              
              Alert.alert('成功', '总结已删除');
            } catch (error) {
              console.error('删除总结失败:', error);
              Alert.alert('错误', '删除失败');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  // 格式化时间显示
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取总结类型显示文本
  const getSummaryTypeText = (type: string) => {
    switch (type) {
      case 'incremental': return '增量总结';
      case 'manual': return '手动总结';
      case 'auto': return '自动总结';
      default: return '总结';
    }
  };

  useEffect(() => {
    if (visible && script) {
      loadSummaries();
    }
  }, [visible, script]);

  if (!script) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* 头部 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>总结管理</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* 操作按钮 */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.summarizeButton]}
            onPress={handleManualSummarize}
            disabled={isGeneratingSummary}
          >
            {isGeneratingSummary ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="archive" size={20} color="#000" />
            )}
            <Text style={styles.actionButtonText}>
              {isGeneratingSummary ? '总结中...' : '手动总结'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.refreshButton]}
            onPress={loadSummaries}
            disabled={isLoading}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.refreshButtonText}>刷新</Text>
          </TouchableOpacity>
        </View>

        {/* 总结配置信息 */}
        {script.summarizationConfig && (
          <View style={styles.configInfo}>
            <Text style={styles.configTitle}>当前配置</Text>
            <Text style={styles.configText}>
              总结阈值: {script.summarizationConfig.summaryThreshold} 字符
            </Text>
            <Text style={styles.configText}>
              状态: {script.summarizationConfig.enabled ? '已启用' : '已禁用'}
            </Text>
          </View>
        )}

        {/* 总结列表 */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>加载中...</Text>
            </View>
          ) : summaries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
              <Text style={styles.emptyText}>暂无总结数据</Text>
              <Text style={styles.emptySubtext}>
                点击"手动总结"来生成第一个总结
              </Text>
            </View>
          ) : (
            summaries.map((summary, index) => (
              <View key={summary.id} style={styles.summaryItem}>
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryMeta}>
                    <Text style={styles.summaryType}>
                      {getSummaryTypeText(summary.summaryType)}
                    </Text>
                    <Text style={styles.summaryTime}>
                      {formatTimestamp(summary.summarizedAt)}
                    </Text>
                  </View>
                  <View style={styles.summaryActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleEditSummary(summary.id, summary.content)}
                    >
                      <Ionicons name="pencil" size={16} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteSummary(summary.id)}
                    >
                      <Ionicons name="trash" size={16} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                </View>

                {editingId === summary.id ? (
                  <View style={styles.editContainer}>
                    <TextInput
                      style={styles.editTextArea}
                      value={editingContent}
                      onChangeText={setEditingContent}
                      multiline
                      placeholder="编辑总结内容..."
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    />
                    <View style={styles.editActions}>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => {
                          setEditingId(null);
                          setEditingContent('');
                        }}
                      >
                        <Text style={styles.cancelButtonText}>取消</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.saveButton}
                        onPress={handleSaveEdit}
                      >
                        <Text style={styles.saveButtonText}>保存</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.summaryContent}>
                    <Text style={styles.summaryText}>{summary.content}</Text>
                    <Text style={styles.summaryStats}>
                      原始消息数: {summary.originalMessagesCount}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  summarizeButton: {
    backgroundColor: theme.colors.primary,
  },
  refreshButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  configInfo: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  configTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  configText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
  },
  emptySubtext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  summaryItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryMeta: {
    flex: 1,
  },
  summaryType: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
  },
  summaryContent: {
    gap: 8,
  },
  summaryText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryStats: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  editContainer: {
    gap: 12,
  },
  editTextArea: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SummaryManager;