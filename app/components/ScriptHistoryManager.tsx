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
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Script, ScriptMessage } from '@/shared/types/script-types';
import { ScriptService } from '@/services/script-service';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

// 简单主题颜色定义
const theme = {
  colors: {
    primary: 'rgb(255, 224, 195)',
  }
};

interface ScriptHistoryManagerProps {
  visible: boolean;
  script: Script | null;
  onClose: () => void;
  onScriptUpdated?: (updatedScript: Script) => void;
}

const ScriptHistoryManager: React.FC<ScriptHistoryManagerProps> = ({
  visible,
  script,
  onClose,
  onScriptUpdated,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ScriptMessage[]>([]);
  const [exportFormat, setExportFormat] = useState<'detailed' | 'simple'>('detailed');
  const [importText, setImportText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  const scriptService = ScriptService.getInstance();

  // 加载剧本历史
  const loadHistory = async () => {
    if (!script?.id) return;

    try {
      setIsLoading(true);
      const scriptHistory = await scriptService.getScriptHistory(script.id);
      setHistory(scriptHistory);
    } catch (error) {
      console.error('加载剧本历史失败:', error);
      Alert.alert('错误', '加载剧本历史失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 将剧本历史转换为文本格式
  const convertHistoryToText = (messages: ScriptMessage[], format: 'detailed' | 'simple'): string => {
    if (format === 'simple') {
      // 简单格式：只包含用户输入和AI回复的主要内容
      return messages.map(msg => {
        const userInput = msg.userInput || '[无用户输入]';
        const aiResponse = msg.aiResponse?.plotContent || 
                          msg.aiResponse?.rawResponse || 
                          msg.aiResponse?._rawResponse ||
                          JSON.stringify(msg.aiResponse) ||
                          '[无AI回复]';
        
        return `用户: ${userInput}\n\nAI: ${aiResponse}\n\n${'='.repeat(50)}\n`;
      }).join('\n');
    } else {
      // 详细格式：包含完整的元数据和结构化信息
      const header = `剧本历史导出\n剧本: ${script?.name || '未命名'}\n导出时间: ${new Date().toLocaleString('zh-CN')}\n消息总数: ${messages.length}\n\n${'='.repeat(80)}\n\n`;
      
      const content = messages.map((msg, index) => {
        const timestamp = new Date(msg.timestamp).toLocaleString('zh-CN');
        const userInput = msg.userInput || '[无用户输入]';
        
        // 提取AI回复的各种格式
        const aiResponse = msg.aiResponse;
        let aiContent = '';
        
        if (aiResponse) {
          // 检查是否为总结消息
          if (aiResponse._isMemorySummary) {
            aiContent = `[总结消息 - ${aiResponse._summaryType || '未知类型'}]\n`;
            aiContent += `原始消息数: ${aiResponse._originalMessagesCount || 0}\n`;
            aiContent += `总结时间: ${new Date(aiResponse._summarizedAt || msg.timestamp).toLocaleString('zh-CN')}\n\n`;
            aiContent += aiResponse.plotContent || '[无总结内容]';
          } else {
            // 常规AI回复
            aiContent = aiResponse.plotContent || 
                       aiResponse.rawResponse || 
                       aiResponse._rawResponse ||
                       JSON.stringify(aiResponse);
          }
        } else {
          aiContent = '[无AI回复]';
        }
        
        return `消息 ${index + 1}\n时间: ${timestamp}\nID: ${msg.id}\n\n用户输入:\n${userInput}\n\nAI回复:\n${aiContent}\n\n${'-'.repeat(60)}\n`;
      }).join('\n');
      
      return header + content;
    }
  };

  // 导出历史为txt文件
  const handleExportHistory = async () => {
    if (!script?.id || history.length === 0) {
      Alert.alert('提示', '没有历史记录可导出');
      return;
    }

    try {
      setIsLoading(true);
      
      const textContent = convertHistoryToText(history, exportFormat);
      const fileName = `${script.name || 'script'}_history_${Date.now()}.txt`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      // 写入文件
      await FileSystem.writeAsStringAsync(filePath, textContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      // 分享文件
      await Share.share({
        url: filePath,
        title: '导出剧本历史',
        message: `剧本 "${script.name}" 的历史记录`,
      });
      
      Alert.alert('成功', `历史记录已导出为: ${fileName}`);
    } catch (error) {
      console.error('导出历史失败:', error);
      Alert.alert('错误', '导出失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 从文本解析历史记录
  const parseTextToHistory = (text: string): ScriptMessage[] => {
    const messages: ScriptMessage[] = [];
    
    // 尝试解析简单格式
    const simplePattern = /用户:\s*(.*?)\n\nAI:\s*(.*?)\n\n={50}/gs;
    let match;
    let messageIndex = 0;
    
    while ((match = simplePattern.exec(text)) !== null) {
      const userInput = match[1].trim();
      const aiResponse = match[2].trim();
      
      if (userInput || aiResponse) {
        const message: ScriptMessage = {
          id: `imported_${Date.now()}_${messageIndex}`,
          scriptId: script!.id,
          userInput: userInput || '[导入消息]',
          aiResponse: {
            plotContent: aiResponse || '[无AI回复]',
            _isImported: true,
            _importedAt: Date.now(),
          },
          timestamp: Date.now() + messageIndex * 1000, // 确保时间戳唯一
        };
        
        messages.push(message);
        messageIndex++;
      }
    }
    
    // 如果简单格式解析失败，尝试其他格式或逐行解析
    if (messages.length === 0) {
      // 简单的逐行解析作为fallback
      const lines = text.split('\n').filter(line => line.trim());
      let currentUserInput = '';
      let currentAiResponse = '';
      let isParsingAI = false;
      
      for (const line of lines) {
        if (line.startsWith('用户:') || line.startsWith('User:') || line.startsWith('用户：')) {
          if (currentUserInput || currentAiResponse) {
            // 保存前一条消息
            const message: ScriptMessage = {
              id: `imported_${Date.now()}_${messageIndex}`,
              scriptId: script!.id,
              userInput: currentUserInput || '[导入消息]',
              aiResponse: {
                plotContent: currentAiResponse || '[无AI回复]',
                _isImported: true,
                _importedAt: Date.now(),
              },
              timestamp: Date.now() + messageIndex * 1000,
            };
            messages.push(message);
            messageIndex++;
          }
          
          currentUserInput = line.replace(/^(用户[:：]|User:)\s*/, '').trim();
          currentAiResponse = '';
          isParsingAI = false;
        } else if (line.startsWith('AI:') || line.startsWith('AI：') || line.startsWith('助手:')) {
          currentAiResponse = line.replace(/^(AI[:：]|助手:)\s*/, '').trim();
          isParsingAI = true;
        } else if (isParsingAI && !line.match(/^[-=]{10,}/) && line.trim()) {
          currentAiResponse += '\n' + line;
        } else if (!isParsingAI && line.trim() && !line.match(/^[-=]{10,}/)) {
          currentUserInput += '\n' + line;
        }
      }
      
      // 保存最后一条消息
      if (currentUserInput || currentAiResponse) {
        const message: ScriptMessage = {
          id: `imported_${Date.now()}_${messageIndex}`,
          scriptId: script!.id,
          userInput: currentUserInput || '[导入消息]',
          aiResponse: {
            plotContent: currentAiResponse || '[无AI回复]',
            _isImported: true,
            _importedAt: Date.now(),
          },
          timestamp: Date.now() + messageIndex * 1000,
        };
        messages.push(message);
      }
    }
    
    return messages;
  };

  // 导入历史记录
  const handleImportHistory = async () => {
    if (!importText.trim()) {
      Alert.alert('提示', '请输入要导入的历史记录文本');
      return;
    }

    if (!script?.id) {
      Alert.alert('错误', '无效的剧本');
      return;
    }

    try {
      setIsLoading(true);
      
      const parsedMessages = parseTextToHistory(importText);
      
      if (parsedMessages.length === 0) {
        Alert.alert('解析失败', '无法从文本中解析出有效的历史记录。请检查格式是否正确。');
        return;
      }
      
      // 确认导入
      Alert.alert(
        '确认导入',
        `解析到 ${parsedMessages.length} 条消息。这将替换当前的历史记录，是否继续？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '导入',
            style: 'destructive',
            onPress: async () => {
              try {
                // 保存新的历史记录
                const historyKey = `script_history_${script.id}`;
                await StorageAdapter.saveJson(historyKey, parsedMessages);
                
                // 更新本地状态
                setHistory(parsedMessages);
                setImportText('');
                setShowImportModal(false);
                
                Alert.alert('成功', `已导入 ${parsedMessages.length} 条历史记录`);
                
                // 通知父组件更新
                if (onScriptUpdated) {
                  const updatedScript = await scriptService.getScript(script.id);
                  if (updatedScript) {
                    onScriptUpdated(updatedScript);
                  }
                }
              } catch (error) {
                console.error('导入历史失败:', error);
                Alert.alert('错误', '导入失败');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('解析导入文本失败:', error);
      Alert.alert('错误', '解析文本失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 从文件选择导入
  const handleImportFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
        copyToCacheDirectory: true,
      });
      
      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        setImportText(content);
        setShowImportModal(true);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      Alert.alert('错误', '文件选择失败');
    }
  };

  // 清空历史记录
  const handleClearHistory = () => {
    Alert.alert(
      '确认清空',
      '确定要清空所有历史记录吗？此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              
              if (script?.id) {
                const historyKey = `script_history_${script.id}`;
                await StorageAdapter.saveJson(historyKey, []);
                
                setHistory([]);
                Alert.alert('成功', '历史记录已清空');
                
                // 通知父组件更新
                if (onScriptUpdated) {
                  const updatedScript = await scriptService.getScript(script.id);
                  if (updatedScript) {
                    onScriptUpdated(updatedScript);
                  }
                }
              }
            } catch (error) {
              console.error('清空历史失败:', error);
              Alert.alert('错误', '清空失败');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    if (visible && script) {
      loadHistory();
    }
  }, [visible, script]);

  if (!script) return null;

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.container}>
          {/* 头部 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>历史记录管理</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* 操作按钮 */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.exportButton]}
              onPress={handleExportHistory}
              disabled={isLoading || history.length === 0}
            >
              <Ionicons name="download" size={20} color="#000" />
              <Text style={styles.actionButtonText}>导出</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.importButton]}
              onPress={() => setShowImportModal(true)}
              disabled={isLoading}
            >
              <Ionicons name="cloud-upload" size={20} color="#fff" />
              <Text style={styles.importButtonText}>导入</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.clearButton]}
              onPress={handleClearHistory}
              disabled={isLoading}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.clearButtonText}>清空</Text>
            </TouchableOpacity>
          </View>

          {/* 导出格式选择 */}
          <View style={styles.formatSelector}>
            <Text style={styles.formatLabel}>导出格式:</Text>
            <View style={styles.formatOptions}>
              <TouchableOpacity
                style={[
                  styles.formatOption,
                  exportFormat === 'simple' && styles.formatOptionSelected,
                ]}
                onPress={() => setExportFormat('simple')}
              >
                <Text style={[
                  styles.formatOptionText,
                  exportFormat === 'simple' && styles.formatOptionTextSelected,
                ]}>
                  简洁
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.formatOption,
                  exportFormat === 'detailed' && styles.formatOptionSelected,
                ]}
                onPress={() => setExportFormat('detailed')}
              >
                <Text style={[
                  styles.formatOptionText,
                  exportFormat === 'detailed' && styles.formatOptionTextSelected,
                ]}>
                  详细
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 历史记录统计 */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{history.length}</Text>
              <Text style={styles.statLabel}>总消息数</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {history.filter(msg => msg.aiResponse?._isMemorySummary).length}
              </Text>
              <Text style={styles.statLabel}>总结数</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {history.filter(msg => msg.aiResponse?._isImported).length}
              </Text>
              <Text style={styles.statLabel}>导入数</Text>
            </View>
          </View>

          {/* 历史记录预览 */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>历史记录预览</Text>
            <ScrollView style={styles.previewScrollView} showsVerticalScrollIndicator={false}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>加载中...</Text>
                </View>
              ) : history.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
                  <Text style={styles.emptyText}>暂无历史记录</Text>
                </View>
              ) : (
                history.slice(-5).map((msg, index) => (
                  <View key={msg.id} style={styles.previewItem}>
                    <Text style={styles.previewUserInput} numberOfLines={2}>
                      用户: {msg.userInput}
                    </Text>
                    <Text style={styles.previewAiResponse} numberOfLines={3}>
                      AI: {msg.aiResponse?.plotContent || msg.aiResponse?.rawResponse || '[无回复]'}
                    </Text>
                    {msg.aiResponse?._isMemorySummary && (
                      <Text style={styles.previewSummaryTag}>总结</Text>
                    )}
                    {msg.aiResponse?._isImported && (
                      <Text style={styles.previewImportedTag}>导入</Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 导入模态框 */}
      <Modal
        visible={showImportModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowImportModal(false)}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>导入历史记录</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowImportModal(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.importContainer}>
            <Text style={styles.importLabel}>
              粘贴历史记录文本，或从文件导入：
            </Text>
            
            <TouchableOpacity
              style={styles.fileSelectButton}
              onPress={handleImportFromFile}
            >
              <Ionicons name="document" size={20} color={theme.colors.primary} />
              <Text style={styles.fileSelectButtonText}>选择文件</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.importTextArea}
              value={importText}
              onChangeText={setImportText}
              multiline
              placeholder="粘贴历史记录文本..."
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
            />

            <View style={styles.importActions}>
              <TouchableOpacity
                style={styles.importCancelButton}
                onPress={() => {
                  setImportText('');
                  setShowImportModal(false);
                }}
              >
                <Text style={styles.importCancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importConfirmButton}
                onPress={handleImportHistory}
                disabled={!importText.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.importConfirmButtonText}>导入</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
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
  exportButton: {
    backgroundColor: theme.colors.primary,
  },
  importButton: {
    backgroundColor: 'rgba(40, 167, 69, 0.8)',
  },
  clearButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.8)',
  },
  actionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  formatSelector: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  formatLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  formatOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  formatOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  formatOptionSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  formatOptionText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  formatOptionTextSelected: {
    color: '#000',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  statValue: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  previewContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  previewScrollView: {
    flex: 1,
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
  previewItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    position: 'relative',
  },
  previewUserInput: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  previewAiResponse: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    lineHeight: 18,
  },
  previewSummaryTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.colors.primary,
    color: '#000',
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  previewImportedTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(40, 167, 69, 0.8)',
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  importContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  importLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  fileSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginBottom: 16,
    gap: 8,
  },
  fileSelectButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  importTextArea: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
  },
  importActions: {
    flexDirection: 'row',
    gap: 12,
  },
  importCancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    alignItems: 'center',
  },
  importConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  importCancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  importConfirmButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ScriptHistoryManager;