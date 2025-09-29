import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCharacters } from '@/constants/CharactersContext';
import { OpenRouterModel } from '@/shared/types/api-types';
import DropDownPicker from 'react-native-dropdown-picker';

export interface CradleApiSettingsProps {
  isVisible: boolean;
  embedded?: boolean;
  onClose: () => void;
}

const CradleApiSettings: React.FC<CradleApiSettingsProps> = ({
  isVisible, 
  embedded = false,
  onClose 
}) => {
  const { getCradleApiSettings, updateCradleApiSettings } = useCharacters();
  const [loading, setLoading] = useState(false);
  const [apiProvider, setApiProvider] = useState<'gemini' | 'openrouter'>('gemini');
  const [openRouterEnabled, setOpenRouterEnabled] = useState(false);
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState('');
  const [openDropdown, setOpenDropdown] = useState(false);
  const [modelsList, setModelsList] = useState<{label: string, value: string}[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  // Load settings on mount or when modal opens
  useEffect(() => {
    if (isVisible || embedded) {
      loadSettings();
    }
  }, [isVisible, embedded]);
  
  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = getCradleApiSettings();
      setApiProvider(settings.apiProvider);
      
      // Load OpenRouter settings if available
      if (settings.openrouter) {
        setOpenRouterEnabled(settings.openrouter.enabled || false);
        setOpenRouterApiKey(settings.openrouter.apiKey || '');
        setOpenRouterModel(settings.openrouter.model || '');
      }
      
      // Load models list for dropdown
      loadModelsList();
    } catch (error) {
      console.error('Failed to load API settings:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadModelsList = async () => {
    // Sample models list - would usually be fetched from API
    setModelsList([
      { label: 'gpt-4o', value: 'gpt-4o' },
      { label: 'gpt-4-turbo', value: 'gpt-4-turbo' },
      { label: 'claude-3-opus', value: 'claude-3-opus' },
      { label: 'claude-3-sonnet', value: 'claude-3-sonnet' },
      { label: 'claude-3-haiku', value: 'claude-3-haiku' },
      { label: 'mistral-large', value: 'mistral-large' }
    ]);
  };
  
  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      
      // Validate settings
      if (apiProvider === 'openrouter' && openRouterEnabled) {
        if (!openRouterApiKey.trim()) {
          Alert.alert('Error', 'OpenRouter API Key 不能为空');
          return;
        }
        if (!openRouterModel) {
          Alert.alert('Error', '请选择一个模型');
          return;
        }
      }
      
      // Update settings
      await updateCradleApiSettings({
        apiProvider,
        openrouter: {
          enabled: openRouterEnabled,
          apiKey: openRouterApiKey,
          model: openRouterModel
        }
      });
      
      Alert.alert('成功', '设置已保存');
      onClose();
    } catch (error) {
      console.error('保存设置失败:', error);
      Alert.alert('错误', '保存设置失败');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTestConnection = async () => {
    if (!openRouterApiKey.trim()) {
      Alert.alert('Error', 'API Key 不能为空');
      return;
    }
    
    setTestStatus('loading');
    
    try {
      // Simulate API test
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTestStatus('success');
      Alert.alert('连接成功', '成功连接到 OpenRouter API');
    } catch (error) {
      console.error('连接测试失败:', error);
      setTestStatus('error');
      Alert.alert('连接失败', '无法连接到 OpenRouter API');
    }
  };

  const content = (
    <ScrollView style={styles.scrollContent}>
      <Text style={styles.sectionTitle}>API 提供商</Text>
      
      <View style={styles.apiProviderSelector}>
        <TouchableOpacity
          style={[
            styles.providerOption,
            apiProvider === 'gemini' && styles.selectedProvider
          ]}
          onPress={() => setApiProvider('gemini')}
        >
          <Ionicons 
            name="logo-google" 
            size={24} 
            color={apiProvider === 'gemini' ? '#4285F4' : '#777'} 
          />
          <Text style={[
            styles.providerName,
            apiProvider === 'gemini' && styles.selectedProviderText
          ]}>
            Gemini API
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.providerOption,
            apiProvider === 'openrouter' && styles.selectedProvider
          ]}
          onPress={() => setApiProvider('openrouter')}
        >
          <Ionicons 
            name="globe-outline" 
            size={24} 
            color={apiProvider === 'openrouter' ? '#FF6B6B' : '#777'} 
          />
          <Text style={[
            styles.providerName,
            apiProvider === 'openrouter' && styles.selectedProviderText
          ]}>
            OpenRouter
          </Text>
        </TouchableOpacity>
      </View>
      
      {apiProvider === 'gemini' && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#4285F4" />
          <Text style={styles.infoText}>
            Gemini API 是默认的 API 提供商，无需额外配置。
          </Text>
        </View>
      )}
      
      {apiProvider === 'openrouter' && (
        <View style={styles.openRouterSection}>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>启用 OpenRouter</Text>
            <Switch
              value={openRouterEnabled}
              onValueChange={setOpenRouterEnabled}
              trackColor={{ false: '#555', true: '#FF6B6B' }}
              thumbColor={openRouterEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
          
          {openRouterEnabled && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>API Key</Text>
                <TextInput 
                  style={styles.textInput}
                  value={openRouterApiKey}
                  onChangeText={setOpenRouterApiKey}
                  placeholder="输入 OpenRouter API Key"
                  placeholderTextColor="#777"
                  secureTextEntry
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>选择默认模型</Text>
                <View style={styles.dropdownContainer}>
                  <DropDownPicker
                    open={openDropdown}
                    value={openRouterModel}
                    items={modelsList}
                    setOpen={setOpenDropdown}
                    setValue={setOpenRouterModel}
                    setItems={setModelsList}
                    placeholder="选择模型"
                    style={styles.dropdown}
                    textStyle={styles.dropdownText}
                    dropDownContainerStyle={styles.dropdownList}
                    listItemLabelStyle={styles.dropdownItemLabel}
                    selectedItemContainerStyle={styles.dropdownSelectedItem}
                    selectedItemLabelStyle={styles.dropdownSelectedLabel}
                    listMode="SCROLLVIEW"
                  />
                </View>
              </View>
              
              <View style={styles.testContainer}>
                <TouchableOpacity 
                  style={styles.testButton}
                  onPress={handleTestConnection}
                  disabled={testStatus === 'loading'}
                >
                  {testStatus === 'loading' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons 
                        name={
                          testStatus === 'success' ? 'checkmark-circle-outline' : 
                          testStatus === 'error' ? 'close-circle-outline' : 
                          'radio-button-on-outline'
                        } 
                        size={18} 
                        color="#fff" 
                      />
                      <Text style={styles.testButtonText}>测试连接</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={20} color="#FF6B6B" />
                <Text style={styles.infoText}>
                  OpenRouter 允许你使用多种不同的 AI 模型。你需要创建一个 OpenRouter 账户并获取 API Key。
                </Text>
              </View>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );

  const footer = (
    <View style={embedded ? styles.embeddedFooter : styles.footer}>
      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSaveSettings}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>保存设置</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // If in embedded mode, render directly without modal
  if (embedded) {
    return (
      <View style={styles.embeddedContainer}>
        <Text style={styles.embeddedTitle}>API 设置</Text>
        {content}
        {footer}
      </View>
    );
  }

  // Otherwise render as modal
  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>API 设置</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          {content}
          {footer}
        </View>
      </View>
    </Modal>
  );
}

export default CradleApiSettings;

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#282828',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
    maxHeight: '70%',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  apiProviderSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  providerOption: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  selectedProvider: {
    borderColor: '#666',
    backgroundColor: '#3a3a3a',
  },
  providerName: {
    color: '#777',
    marginTop: 8,
    fontWeight: 'bold',
  },
  selectedProviderText: {
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    color: '#ccc',
    fontSize: 14,
    flex: 1,
    marginLeft: 8,
    lineHeight: 20,
  },
  openRouterSection: {
    marginTop: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#fff',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  dropdownContainer: {
    zIndex: 1000,
  },
  dropdown: {
    backgroundColor: '#333',
    borderColor: '#444',
  },
  dropdownText: {
    color: '#fff',
  },
  dropdownList: {
    backgroundColor: '#333',
    borderColor: '#444',
  },
  dropdownItemLabel: {
    color: '#fff',
  },
  dropdownSelectedItem: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  dropdownSelectedLabel: {
    color: '#FF6B6B',
    fontWeight: 'bold',
  },
  testContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  testButton: {
    backgroundColor: '#FF6B6B',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#333',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Embedded mode styles
  embeddedContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#282828',
  },
  embeddedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  embeddedFooter: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
  }
});