import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { GlobalSettings } from '@/shared/types';
import { OpenRouterSettings, OpenRouterModel } from '@/shared/types/api-types';
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';
import { OpenRouterModelManager } from '@/NodeST/nodest/utils/openrouter-model-manager';
import ModelSelector from '@/components/settings/ModelSelector';

interface ApiProviderSettingsProps {
  settings: GlobalSettings;
  onUpdate: (settings: GlobalSettings) => void;
}

const ApiProviderSettings: React.FC<ApiProviderSettingsProps> = ({ settings, onUpdate }) => {
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [showOpenRouterApiKey, setShowOpenRouterApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Default OpenRouter settings if not present
  const openRouterSettings = settings.chat.openrouter || {
    enabled: false,
    apiKey: '' ,
    model: 'openai/gpt-3.5-turbo',
    autoRoute: false,
    useBackupModels: true,
    backupModels: [],
    sortingStrategy: 'price' as 'price' | 'performance' | 'random',
    dataCollection: false,
    ignoredProviders: [],
  };

  // Initialize settings if needed
  useEffect(() => {
    if (!settings.chat.apiProvider) {
      const updatedSettings = {
        ...settings,
        chat: {
          ...settings.chat,
          apiProvider: 'gemini' as const,
        }
      };
      onUpdate(updatedSettings);
    }
    
    if (settings.chat.apiProvider === 'openrouter' && 
        settings.chat.openrouter?.enabled && 
        settings.chat.openrouter?.apiKey && 
        !loadingModels && 
        models.length === 0) {
      loadModels();
    }
  }, [settings]);

  // Load OpenRouter models
  const loadModels = async (forceRefresh = false) => {
    if (!settings.chat.openrouter?.apiKey) {
      Alert.alert('Error', 'Please enter an OpenRouter API key first');
      return;
    }

    try {
      setLoadingModels(true);
      const modelsList = await OpenRouterModelManager.getModels(
        settings.chat.openrouter.apiKey, 
        forceRefresh
      );
      setModels(modelsList);
    } catch (error) {
      console.error('Failed to load models:', error);
      Alert.alert('Error', 'Failed to load models. Please check your API key and try again.');
    } finally {
      setLoadingModels(false);
    }
  };

  // Test OpenRouter connection
  const testOpenRouterConnection = async () => {
    if (!settings.chat.openrouter?.apiKey) {
      Alert.alert('Error', 'Please enter an OpenRouter API key first');
      return;
    }

    try {
      setTestingConnection(true);
      const adapter = new OpenRouterAdapter(
        settings.chat.openrouter.apiKey, 
        settings.chat.openrouter.model
      );
      
      const response = await adapter.generateContent([
        { role: 'user', parts: [{ text: 'Hello, can you respond with just the word "Connected" to verify connection?' }] }
      ]);
      
      if (response && response.includes('Connected')) {
        Alert.alert('Success', 'Successfully connected to OpenRouter!');
        // Load models after successful connection
        loadModels(true);
      } else {
        Alert.alert('Success', 'Connected to OpenRouter, but received unexpected response.');
      }
    } catch (error) {
      console.error('OpenRouter connection test failed:', error);
      Alert.alert('Connection Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setTestingConnection(false);
    }
  };

  // Update OpenRouter settings
  const updateOpenRouterSettings = (updates: Partial<OpenRouterSettings>) => {
    const updatedOpenRouter = {
      ...openRouterSettings,
      ...updates
    };
    
    onUpdate({
      ...settings,
      chat: {
        ...settings.chat,
        openrouter: updatedOpenRouter
      }
    });
  };

  // Set API provider
  const setApiProvider = (provider: 'gemini' | 'openrouter') => {
    onUpdate({
      ...settings,
      chat: {
        ...settings.chat,
        apiProvider: provider
      }
    });
  };

  // Handle model selection
  const handleModelSelect = (modelId: string) => {
    updateOpenRouterSettings({ model: modelId });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>API Provider</Text>
      
      {/* API Provider Selection */}
      <View style={styles.providerSelection}>
        <TouchableOpacity 
          style={[
            styles.providerButton,
            settings.chat.apiProvider === 'gemini' && styles.providerButtonSelected
          ]}
          onPress={() => setApiProvider('gemini')}
        >
          <Text style={[
            styles.providerButtonText,
            settings.chat.apiProvider === 'gemini' && styles.providerButtonTextSelected
          ]}>Gemini</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.providerButton,
            settings.chat.apiProvider === 'openrouter' && styles.providerButtonSelected
          ]}
          onPress={() => setApiProvider('openrouter')}
        >
          <Text style={[
            styles.providerButtonText,
            settings.chat.apiProvider === 'openrouter' && styles.providerButtonTextSelected
          ]}>OpenRouter</Text>
        </TouchableOpacity>
      </View>

      {/* Gemini Settings */}
      {settings.chat.apiProvider === 'gemini' && (
        <View style={styles.providerSettings}>
          <Text style={styles.label}>Gemini API Key</Text>
          <View style={styles.apiKeyContainer}>
            <TextInput
              style={[styles.input, styles.apiKeyInput]}
              value={showGeminiApiKey ? settings.chat.characterApiKey : '•'.repeat(settings.chat.characterApiKey.length || 10)}
              onChangeText={(text) => onUpdate({
                ...settings,
                chat: { ...settings.chat, characterApiKey: text }
              })}
              secureTextEntry={!showGeminiApiKey}
              placeholder="Enter Gemini API Key"
            />
            <TouchableOpacity
              style={styles.showButton}
              onPress={() => setShowGeminiApiKey(!showGeminiApiKey)}
            >
              <MaterialIcons
                name={showGeminiApiKey ? 'visibility-off' : 'visibility'}
                size={24}
                color="#666"
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* OpenRouter Settings */}
      {settings.chat.apiProvider === 'openrouter' && (
        <View style={styles.providerSettings}>
          {/* Enable OpenRouter */}
          <View style={styles.switchContainer}>
            <Text style={styles.label}>Enable OpenRouter</Text>
            <Switch
              value={openRouterSettings.enabled}
              onValueChange={(value) => updateOpenRouterSettings({ enabled: value })}
              trackColor={{ false: '#767577', true: '#FF9ECD' }}
              thumbColor="#f4f3f4"
            />
          </View>

          {/* API Key */}
          <Text style={styles.label}>OpenRouter API Key</Text>
          <View style={styles.apiKeyContainer}>
            <TextInput
              style={[styles.input, styles.apiKeyInput]}
              value={showOpenRouterApiKey ? openRouterSettings.apiKey ?? '' : '•'.repeat((openRouterSettings.apiKey ?? '').length || 10)}
              onChangeText={(text) => updateOpenRouterSettings({ apiKey: text })}
              secureTextEntry={!showOpenRouterApiKey}
              placeholder="Enter OpenRouter API Key"
              editable={openRouterSettings.enabled}
            />
            <TouchableOpacity
              style={styles.showButton}
              onPress={() => setShowOpenRouterApiKey(!showOpenRouterApiKey)}
              disabled={!openRouterSettings.enabled}
            >
              <MaterialIcons
                name={showOpenRouterApiKey ? 'visibility-off' : 'visibility'}
                size={24}
                color={openRouterSettings.enabled ? "#666" : "#aaa"}
              />
            </TouchableOpacity>
          </View>

          {/* Test Connection Button */}
          <TouchableOpacity
            style={[styles.button, !openRouterSettings.enabled && styles.disabledButton]}
            onPress={testOpenRouterConnection}
            disabled={testingConnection || !openRouterSettings.enabled || !openRouterSettings.apiKey}
          >
            {testingConnection ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Test Connection</Text>
            )}
          </TouchableOpacity>

          {/* Model Selector */}
          {openRouterSettings.enabled && (
            <>
              <View style={styles.modelSelectorHeader}>
                <Text style={styles.label}>Select Model</Text>
                <TouchableOpacity 
                  style={styles.refreshButton} 
                  onPress={() => loadModels(true)}
                  disabled={loadingModels}
                >
                  {loadingModels ? (
                    <ActivityIndicator size="small" color="#FF9ECD" />
                  ) : (
                    <MaterialIcons name="refresh" size={20} color="#FF9ECD" />
                  )}
                </TouchableOpacity>
              </View>
              
              <ModelSelector 
                models={models}
                selectedModelId={openRouterSettings.model}
                onSelectModel={handleModelSelect}
                isLoading={loadingModels}
                apiKey={openRouterSettings.apiKey}
              />

              {/* Advanced Settings Toggle */}
              <TouchableOpacity 
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings"}
                </Text>
                <MaterialIcons 
                  name={showAdvanced ? "expand-less" : "expand-more"} 
                  size={24} 
                  color="#666" 
                />
              </TouchableOpacity>

              {/* Advanced Settings */}
              {showAdvanced && (
                <View style={styles.advancedSettings}>
                  {/* Auto Route */}
                  <View style={styles.switchContainer}>
                    <View>
                      <Text style={styles.label}>Auto Route</Text>
                      <Text style={styles.description}>
                        Automatically select the most appropriate model based on your prompt
                      </Text>
                    </View>
                    <Switch
                      value={openRouterSettings.autoRoute}
                      onValueChange={(value) => updateOpenRouterSettings({ autoRoute: value })}
                      trackColor={{ false: '#767577', true: '#FF9ECD' }}
                      thumbColor="#f4f3f4"
                    />
                  </View>

                  {/* Use Backup Models */}
                  <View style={styles.switchContainer}>
                    <View>
                      <Text style={styles.label}>Use Backup Models</Text>
                      <Text style={styles.description}>
                        Automatically switch to backup models when the primary model is unavailable
                      </Text>
                    </View>
                    <Switch
                      value={openRouterSettings.useBackupModels}
                      onValueChange={(value) => updateOpenRouterSettings({ useBackupModels: value })}
                      trackColor={{ false: '#767577', true: '#FF9ECD' }}
                      thumbColor="#f4f3f4"
                      disabled={openRouterSettings.autoRoute}
                    />
                  </View>
                  {/* Data Collection Switch */}
                  <View style={styles.switchContainer}>
                    <View>
                      <Text style={styles.label}>Allow Data Collection</Text>
                      <Text style={styles.description}>
                        Allow OpenRouter to collect anonymized data for service improvement
                      </Text>
                    </View>
                    <Switch
                      value={openRouterSettings.dataCollection}
                      onValueChange={(value) => updateOpenRouterSettings({ dataCollection: value })}
                      trackColor={{ false: '#767577', true: '#FF9ECD' }}
                      thumbColor="#f4f3f4"
                    />
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  providerSelection: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  providerButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  providerButtonSelected: {
    backgroundColor: '#FF9ECD',
    borderColor: '#FF9ECD',
  },
  providerButtonText: {
    fontSize: 16,
    color: '#666',
  },
  providerButtonTextSelected: {
    color: '#fff',
  },
  providerSettings: {
    marginTop: 10,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#666',
  },
  apiKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  apiKeyInput: {
    flex: 1,
    marginRight: 8,
  },
  showButton: {
    padding: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#FF9ECD',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  disabledButton: {
    backgroundColor: '#ddd',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  modelSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  refreshButton: {
    padding: 8,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  advancedToggleText: {
    color: '#666',
    fontSize: 15,
  },
  advancedSettings: {
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 20,
  },
  description: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  strategyContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  strategyButton: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  strategyButtonSelected: {
    backgroundColor: '#FF9ECD',
    borderColor: '#FF9ECD',
  },
  strategyButtonText: {
    fontSize: 14,
    color: '#666',
  },
  strategyButtonTextSelected: {
    color: '#fff',
  },
});

export default ApiProviderSettings;