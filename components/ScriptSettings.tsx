import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptSummarizationConfig } from '@/shared/types/script-types';
import ScriptSummarizationConfigComponent from './ScriptSummarizationConfig';

interface ScriptSettingsProps {
  script: Script;
  visible: boolean;
  onClose: () => void;
  onScriptUpdated?: (script: Script) => void;
}

/**
 * 剧本设置主界面
 */
const ScriptSettings: React.FC<ScriptSettingsProps> = ({
  script,
  visible,
  onClose,
  onScriptUpdated,
}) => {
  const [showSummarizationConfig, setShowSummarizationConfig] = useState(false);

  const handleSummarizationConfigUpdate = (config: ScriptSummarizationConfig) => {
    const updatedScript = {
      ...script,
      summarizationConfig: config,
      updatedAt: Date.now(),
    };
    onScriptUpdated?.(updatedScript);
    setShowSummarizationConfig(false);
  };

  const handleClearHistory = () => {
    Alert.alert(
      '确认清空',
      '确定要清空这个剧本的所有历史记录吗？此操作无法撤销。',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '确定', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { ScriptService } = await import('@/services/script-service');
              const scriptService = ScriptService.getInstance();
              await scriptService.clearScriptHistory(script.id);
              Alert.alert('成功', '历史记录已清空');
            } catch (error) {
              console.error('清空历史失败:', error);
              Alert.alert('错误', '清空历史失败');
            }
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>剧本设置</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>完成</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.scriptName}>{script.name}</Text>

        <View style={styles.content}>
          {/* 历史总结设置 */}
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowSummarizationConfig(true)}
          >
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>历史总结设置</Text>
              <Text style={styles.settingDescription}>
                配置自动总结阈值和总结方式
              </Text>
              <Text style={styles.settingStatus}>
                状态: {script.summarizationConfig?.enabled ? '已启用' : '未启用'}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          {/* 清空历史 */}
          <TouchableOpacity
            style={[styles.settingItem, styles.dangerItem]}
            onPress={handleClearHistory}
          >
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, styles.dangerText]}>清空历史记录</Text>
              <Text style={styles.settingDescription}>
                删除所有剧本历史消息，无法撤销
              </Text>
            </View>
            <Text style={[styles.arrow, styles.dangerText]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 总结配置模态框 */}
        <Modal
          visible={showSummarizationConfig}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowSummarizationConfig(false)}
        >
          <ScriptSummarizationConfigComponent
            script={script}
            onClose={() => setShowSummarizationConfig(false)}
            onConfigUpdated={handleSummarizationConfigUpdate}
          />
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#007bff',
    fontWeight: '600',
  },
  scriptName: {
    fontSize: 18,
    color: '#666',
    padding: 20,
    paddingBottom: 10,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  settingItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  settingStatus: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  arrow: {
    fontSize: 24,
    color: '#ccc',
    marginLeft: 16,
  },
  dangerItem: {
    borderWidth: 1,
    borderColor: '#ffebee',
  },
  dangerText: {
    color: '#d32f2f',
  },
});

export default ScriptSettings;
