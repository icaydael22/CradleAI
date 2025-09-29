import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Alert
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { CharacterImporter } from '@/utils/CharacterImporter';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { getApiSettings } from '@/utils/settings-helper';
import { unifiedGenerateContent } from '@/services/unified-api';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

const screenWidth = Dimensions.get('window').width;

const ADAPTERS = [
  { label: 'Gemini', value: 'gemini' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' }
];

export default function TestFramework() {
  const [inputText, setInputText] = useState('');
  const [presetJson, setPresetJson] = useState<string>('');
  const [worldBookJson, setWorldBookJson] = useState<string>('');
  const [adapterType, setAdapterType] = useState<'gemini' | 'openrouter' | 'openai-compatible'>('gemini');
  const [result, setResult] = useState<any[]>([]);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiResponse, setApiResponse] = useState<string>('');
  const [apiLoading, setApiLoading] = useState(false);
  
  // Modal states
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewModalContent, setViewModalContent] = useState('');
  const [viewModalTitle, setViewModalTitle] = useState('');

  // 导入preset
  const handleImportPreset = async () => {
    setError('');
    try {
      const file = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (file.canceled || !file.assets?.[0]?.uri) return;
      const preset = await CharacterImporter.importPresetForCharacter(file.assets[0].uri, 'test');
      setPresetJson(JSON.stringify(preset, null, 2));
    } catch (e: any) {
      setError('导入preset失败: ' + (e?.message || e));
    }
  };

  // 导入worldbook
  const handleImportWorldBook = async () => {
    setError('');
    try {
      const file = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (file.canceled || !file.assets?.[0]?.uri) return;
      const worldBook = await CharacterImporter.importWorldBookOnlyFromJson(file.assets[0].uri);
      setWorldBookJson(JSON.stringify(worldBook, null, 2));
    } catch (e: any) {
      setError('导入worldbook失败: ' + (e?.message || e));
    }
  };

  // 运行测试
  const handleRun = async () => {
    setError('');
    setResult([]);
    setIsLoading(true);
    try {
      if (!presetJson) {
        setError('请先导入preset');
        setIsLoading(false);
        return;
      }
      const arr = await NodeSTCore.buildRFrameworkWithChatHistory(
        inputText,
        presetJson,
        adapterType,
        worldBookJson || undefined
      );
      setResult(arr);
    } catch (e: any) {
      setError('生成消息数组失败: ' + (e?.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // API测试
  const handleApiTest = async () => {
    setError('');
    setApiResponse('');
    setApiLoading(true);
    try {
      if (!result || result.length === 0) {
        setError('请先生成消息数组');
        setApiLoading(false);
        return;
      }
      const apiSettings = getApiSettings();
      const options = {
        ...apiSettings,
        adapter: adapterType
      };
      const resp = await unifiedGenerateContent(result, options);
      setApiResponse(typeof resp === 'string' ? resp : JSON.stringify(resp));
    } catch (e: any) {
      setError('API测试失败: ' + (e?.message || e));
    }
    setApiLoading(false);
  };

  // 自动加载adapter设置
  React.useEffect(() => {
    loadAdapterFromSettings();
  }, []);

  const loadAdapterFromSettings = async () => {
    try {
      const settings = getApiSettings();
      if (settings?.apiProvider) {
        const provider = settings.apiProvider.toLowerCase();
        let newAdapterType: 'gemini' | 'openrouter' | 'openai-compatible' = 'gemini';
        if (provider.includes('gemini')) {
          newAdapterType = 'gemini';
        } else if (provider.includes('openrouter')) {
          newAdapterType = 'openrouter';
        } else if (provider.includes('openai')) {
          newAdapterType = 'openai-compatible';
        }
        setAdapterType(newAdapterType);
      }
    } catch (e) {
      console.error('读取适配器设置失败:', e);
    }
  };

  const showViewModal = useCallback((content: string, title: string) => {
    setViewModalContent(content);
    setViewModalTitle(title);
    setViewModalVisible(true);
  }, []);

  const hasResult = result && result.length > 0;
  const hasPreset = !!presetJson;
  const hasWorldBook = !!worldBookJson;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>R-Framework 测试工具</Text>
      </View>
      
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>构建消息数组</Text>
            <View style={styles.sectionButtonBar}>
              <TouchableOpacity 
                style={styles.sectionButton} 
                onPress={handleImportPreset}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="document-outline" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.sectionButton} 
                onPress={handleImportWorldBook}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="book-outline" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sectionButton, isLoading && styles.disabledButton]} 
                onPress={handleRun}
                disabled={isLoading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#666" />
                ) : (
                  <Ionicons name="code-outline" size={18} color={isLoading ? '#666' : '#27ae60'} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionButton, (apiLoading || !hasResult) && styles.disabledButton]}
                onPress={handleApiTest}
                disabled={apiLoading || !hasResult}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {apiLoading ? (
                  <ActivityIndicator size="small" color="#666" />
                ) : (
                  <Ionicons name="flash-outline" size={18} color={(apiLoading || !hasResult) ? '#666' : '#e67e22'} />
                )}
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.contentSection}>
            <Text style={styles.inputLabel}>输入文本</Text>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="请输入对话内容"
              placeholderTextColor="#999"
              multiline
            />

            <View style={styles.statusSection}>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>当前API渠道</Text>
                <View style={styles.adapterBadge}>
                  <Text style={styles.adapterBadgeText}>{adapterType}</Text>
                </View>
              </View>

              <View style={styles.row}>
                <TouchableOpacity 
                  style={[styles.viewButton, !hasPreset && styles.disabledButton]} 
                  onPress={() => hasPreset && showViewModal(presetJson, 'Preset内容')}
                  disabled={!hasPreset}
                >
                  <Ionicons name="eye-outline" size={18} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.viewButtonText}>查看预设</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.viewButton, !hasWorldBook && styles.disabledButton]} 
                  onPress={() => hasWorldBook && showViewModal(worldBookJson, 'WorldBook内容')}
                  disabled={!hasWorldBook}
                >
                  <Ionicons name="eye-outline" size={18} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.viewButtonText}>查看世界书</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.row}>
                <TouchableOpacity 
                  style={[styles.viewButton, !hasResult && styles.disabledButton]} 
                  onPress={() => hasResult && showViewModal(JSON.stringify(result, null, 2), '消息数组内容')}
                  disabled={!hasResult}
                >
                  <Ionicons name="list-outline" size={18} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.viewButtonText}>查看消息数组</Text>
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#f44336" style={styles.buttonIcon} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {apiResponse ? (
              <View style={styles.apiResponseContainer}>
                <Text style={styles.apiResponseTitle}>API响应</Text>
                <ScrollView style={styles.apiResponseContent}>
                  <Text selectable style={styles.apiResponseText}>{apiResponse}</Text>
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
      
      {/* View Modal */}
      <Modal
        visible={viewModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setViewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{viewModalTitle}</Text>
              <TouchableOpacity onPress={() => setViewModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <Text selectable style={styles.modalContentText}>{viewModalContent}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    fontSize: Math.max(16, screenWidth * 0.045),
    fontWeight: 'bold',
    color: '#fff',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionButtonBar: {
    flexDirection: 'row',
    flexWrap: 'wrap', // 支持自动换行
    alignItems: 'center',
    gap: 2, // 更紧凑
    maxWidth: 220, // 限制最大宽度，防止溢出
  },
  sectionButton: {
    width: 28, // 更小
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    marginHorizontal: 2,
    marginVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  contentSection: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    width: '100%',
    minHeight: 100,
  },
  helperText: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
    adapterBadge: {
    backgroundColor: 'rgba(255, 158, 205, 0.3)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  adapterBadgeText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  statusSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(40, 40, 40, 0.5)',
    borderRadius: 8,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusLabel: {
    color: '#bbb',
    fontSize: 14,
  },
  viewButton: {
    backgroundColor: 'rgba(100, 100, 100, 0.7)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    marginBottom: 10,
    flex: 1,
    justifyContent: 'center',
  },
  viewButtonText: {
    color: '#fff',
    fontSize: 13,
  },
  actionButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  generateButton: {
    backgroundColor: '#27ae60',
    marginRight: 8,
  },
  testButton: {
    backgroundColor: '#e67e22',
    marginLeft: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  errorText: {
    color: '#f44336',
    flex: 1,
  },
  apiResponseContainer: {
    marginTop: 20,
    backgroundColor: 'rgba(40, 40, 40, 0.7)',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  apiResponseTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  apiResponseContent: {
    maxHeight: 150,
  },
  apiResponseText: {
    color: '#ddd',
    fontSize: 13,
  },
  buttonIcon: {
    marginRight: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    width: '100%',
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(60, 60, 60, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalContent: {
    padding: 16,
  },
  modalContentText: {
    color: '#ddd',
    fontSize: 14,
  }
});
