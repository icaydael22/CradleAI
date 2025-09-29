import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ScriptService } from '@/services/script-service';
import { ScriptSummary, SummaryOperationResult } from '@/shared/types/script-types';
import { theme } from '@/constants/theme';

const ScriptSummariesPage: React.FC = () => {
  const router = useRouter();
  const { scriptId } = useLocalSearchParams<{ scriptId: string }>();
  
  const [summaries, setSummaries] = useState<ScriptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 编辑模态框状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSummary, setEditingSummary] = useState<ScriptSummary | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // 查看模态框状态
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewingSummary, setViewingSummary] = useState<ScriptSummary | null>(null);
  
  // 统计信息状态
  const [stats, setStats] = useState({
    totalSummaries: 0,
    incrementalSummaries: 0,
    metaSummaries: 0,
    editedSummaries: 0,
    totalOriginalMessages: 0,
  });

  const scriptService = ScriptService.getInstance();

  // 加载总结列表
  useEffect(() => {
    const loadSummaries = async () => {
      if (!scriptId) return;
      
      try {
        setIsLoading(true);
        const [summariesData, statsData] = await Promise.all([
          scriptService.listSummaries(scriptId),
          scriptService.getSummaryStats(scriptId)
        ]);
        
        setSummaries(summariesData);
        setStats(statsData);
      } catch (error) {
        console.error('加载总结失败:', error);
        Alert.alert('错误', '加载总结失败');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSummaries();
  }, [scriptId, refreshKey]);

  // 刷新数据
  const refreshData = () => {
    setRefreshKey(prev => prev + 1);
  };

  // 打开编辑模态框
  const openEditModal = (summary: ScriptSummary) => {
    setEditingSummary(summary);
    setEditContent(summary.content);
    setEditModalVisible(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingSummary || !scriptId) return;
    
    try {
      setIsSaving(true);
      const result = await scriptService.updateSummary(scriptId, editingSummary.id, editContent);
      
      if (result.success) {
        Alert.alert('成功', '总结更新成功');
        setEditModalVisible(false);
        refreshData();
      } else {
        Alert.alert('失败', result.message);
      }
    } catch (error) {
      console.error('保存编辑失败:', error);
      Alert.alert('错误', '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 删除总结
  const handleDeleteSummary = (summary: ScriptSummary) => {
    Alert.alert(
      '确认删除',
      `确定要删除这个${summary.type === 'incremental' ? '增量' : '元'}总结吗？\n\n注意：删除后原始消息无法恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await scriptService.deleteSummary(scriptId!, summary.id);
              if (result.success) {
                Alert.alert('成功', '总结已删除');
                refreshData();
              } else {
                Alert.alert('失败', result.message);
              }
            } catch (error) {
              console.error('删除失败:', error);
              Alert.alert('错误', '删除失败');
            }
          }
        }
      ]
    );
  };

  // 重置总结
  const handleResetSummary = (summary: ScriptSummary) => {
    if (!summary.isEdited) {
      Alert.alert('提示', '该总结未被编辑过，无需重置');
      return;
    }

    Alert.alert(
      '确认重置',
      '确定要将总结恢复到AI生成的原始版本吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '重置',
          onPress: async () => {
            try {
              const result = await scriptService.resetSummary(scriptId!, summary.id);
              if (result.success) {
                Alert.alert('成功', '总结已重置到原始版本');
                refreshData();
              } else {
                Alert.alert('失败', result.message);
              }
            } catch (error) {
              console.error('重置失败:', error);
              Alert.alert('错误', '重置失败');
            }
          }
        }
      ]
    );
  };

  // 查看详情
  const openViewModal = (summary: ScriptSummary) => {
    setViewingSummary(summary);
    setViewModalVisible(true);
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  // 获取总结类型显示文本
  const getSummaryTypeText = (type: 'incremental' | 'meta') => {
    return type === 'incremental' ? '增量总结' : '元总结';
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

  return (
    <SafeAreaView style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>总结管理</Text>
        <TouchableOpacity onPress={refreshData}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 统计信息 */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>统计信息</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalSummaries}</Text>
              <Text style={styles.statLabel}>总计</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.incrementalSummaries}</Text>
              <Text style={styles.statLabel}>增量总结</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.metaSummaries}</Text>
              <Text style={styles.statLabel}>元总结</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.editedSummaries}</Text>
              <Text style={styles.statLabel}>已编辑</Text>
            </View>
          </View>
        </View>

        {/* 总结列表 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>总结列表</Text>
          
          {summaries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
              <Text style={styles.emptyText}>暂无总结</Text>
              <Text style={styles.emptySubtext}>当历史消息达到阈值时会自动生成总结</Text>
            </View>
          ) : (
            summaries.map((summary) => (
              <View key={summary.id} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryTypeContainer}>
                    <View style={[
                      styles.summaryTypeBadge, 
                      summary.type === 'meta' ? styles.metaBadge : styles.incrementalBadge
                    ]}>
                      <Text style={styles.summaryTypeText}>
                        {getSummaryTypeText(summary.type)}
                      </Text>
                    </View>
                    {summary.isEdited && (
                      <View style={styles.editedBadge}>
                        <Text style={styles.editedText}>已编辑</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.summaryActions}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => openViewModal(summary)}
                    >
                      <Ionicons name="eye-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => openEditModal(summary)}
                    >
                      <Ionicons name="create-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    {summary.isEdited && (
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => handleResetSummary(summary)}
                      >
                        <Ionicons name="refresh-outline" size={18} color="#ffa500" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => handleDeleteSummary(summary)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
                    </TouchableOpacity>
                  </View>
                </View>
                
                <Text style={styles.summaryContent} numberOfLines={3}>
                  {summary.content}
                </Text>
                
                <View style={styles.summaryFooter}>
                  <Text style={styles.summaryMeta}>
                    包含 {summary.originalMessagesCount} 条原始消息
                  </Text>
                  <Text style={styles.summaryDate}>
                    {formatDate(summary.createdAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 查看模态框 */}
      <Modal
        visible={viewModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>总结详情</Text>
            <TouchableOpacity onPress={() => setViewModalVisible(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {viewingSummary && (
            <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>
              <View style={styles.summaryDetailInfo}>
                <Text style={styles.detailLabel}>类型</Text>
                <Text style={styles.detailValue}>
                  {getSummaryTypeText(viewingSummary.type)}
                </Text>
              </View>
              
              <View style={styles.summaryDetailInfo}>
                <Text style={styles.detailLabel}>原始消息数</Text>
                <Text style={styles.detailValue}>
                  {viewingSummary.originalMessagesCount} 条
                </Text>
              </View>
              
              <View style={styles.summaryDetailInfo}>
                <Text style={styles.detailLabel}>创建时间</Text>
                <Text style={styles.detailValue}>
                  {formatDate(viewingSummary.createdAt)}
                </Text>
              </View>
              
              {viewingSummary.isEdited && viewingSummary.updatedAt && (
                <View style={styles.summaryDetailInfo}>
                  <Text style={styles.detailLabel}>编辑时间</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(viewingSummary.updatedAt)}
                  </Text>
                </View>
              )}

              <View style={styles.summaryDetailInfo}>
                <Text style={styles.detailLabel}>内容</Text>
                <ScrollView style={styles.contentScrollView}>
                  <Text style={styles.fullContent}>
                    {viewingSummary.content}
                  </Text>
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* 编辑模态框 */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>编辑总结</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.editLabel}>总结内容</Text>
            <TextInput
              style={styles.editTextArea}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              placeholder="请输入总结内容..."
              placeholderTextColor="#999"
              textAlignVertical="top"
            />
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setEditModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>取消</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.modalSaveButton]}
              onPress={handleSaveEdit}
              disabled={isSaving}
            >
              <Text style={[styles.modalButtonText, styles.modalSaveButtonText]}>
                {isSaving ? '保存中...' : '保存'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  statsSection: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
  section: {
    paddingVertical: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  incrementalBadge: {
    backgroundColor: '#4CAF50',
  },
  metaBadge: {
    backgroundColor: '#FF9800',
  },
  summaryTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  editedBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  editedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  summaryContent: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryMeta: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
  summaryDate: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
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
    padding: 20,
  },
  modalContentContainer: {
    paddingBottom: 20,
  },
  summaryDetailInfo: {
    marginBottom: 20,
  },
  detailLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  detailValue: {
    color: '#fff',
    fontSize: 16,
  },
  contentScrollView: {
    maxHeight: 300,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
  },
  fullContent: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  editLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
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
    minHeight: 400,
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
});

export default ScriptSummariesPage;