import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { useUser } from '@/constants/UserContext';

export interface RelationshipTestOptions {
  strengthModifier: number;
  accelerateInteractions: boolean;
  showDetailedLogs: boolean;
}

interface Props {
  characters: Character[];
  onRunTest: (options: RelationshipTestOptions) => void;
  onResetRelationships: () => void;
  isRunningTest: boolean;
}

const RelationshipTestControls: React.FC<Props> = ({
  characters,
  onRunTest,
  onResetRelationships,
  isRunningTest
}) => {
  const { user } = useUser();
  
  // Test options state
  const [options, setOptions] = useState<RelationshipTestOptions>({
    strengthModifier: 5,
    accelerateInteractions: true,
    showDetailedLogs: true
  });
  
  // Check API configuration
  const hasApiKey = Boolean(user?.settings?.chat?.characterApiKey);
  const isOpenRouterEnabled = user?.settings?.chat?.apiProvider === 'openrouter' && 
                             user?.settings?.chat?.openrouter?.enabled;
                             
  // Count characters with relationship system enabled
  const relationshipEnabledCount = characters.filter(c => c.relationshipEnabled).length;
  
  // Determine if we can run tests
  const canRunTest = relationshipEnabledCount >= 2 && hasApiKey;
  
  // Run the test with current options
  const handleRunTest = () => {
    if (!canRunTest || isRunningTest) return;
    onRunTest(options);
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>关系测试控制</Text>
        
        {/* API Provider Badge */}
        <View style={[
          styles.apiBadge,
          isOpenRouterEnabled ? styles.openRouterBadge : styles.geminiBadge
        ]}>
          <Text style={styles.apiBadgeText}>
            {isOpenRouterEnabled ? 'OpenRouter' : 'Gemini'}
          </Text>
        </View>
      </View>
      
      {/* Options */}
      <View style={styles.optionsContainer}>
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>关系强度修改器:</Text>
          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={20}
              step={1}
              value={options.strengthModifier}
              onValueChange={(value) => setOptions({...options, strengthModifier: value})}
              minimumTrackTintColor="#FF9ECD"
              maximumTrackTintColor="#888"
              thumbTintColor="#FF9ECD"
              disabled={isRunningTest}
            />
            <Text style={styles.sliderValue}>{options.strengthModifier}</Text>
          </View>
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>加速互动计数:</Text>
          <Switch
            trackColor={{ false: "#767577", true: "#FF9ECD" }}
            thumbColor={options.accelerateInteractions ? "#fff" : "#f4f3f4"}
            value={options.accelerateInteractions}
            onValueChange={(value) => setOptions({...options, accelerateInteractions: value})}
            disabled={isRunningTest}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>详细日志:</Text>
          <Switch
            trackColor={{ false: "#767577", true: "#FF9ECD" }}
            thumbColor={options.showDetailedLogs ? "#fff" : "#f4f3f4"}
            value={options.showDetailedLogs}
            onValueChange={(value) => setOptions({...options, showDetailedLogs: value})}
            disabled={isRunningTest}
          />
        </View>
      </View>
      
      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.testButton,
            isRunningTest || !canRunTest ? styles.disabledButton : null
          ]}
          onPress={handleRunTest}
          disabled={isRunningTest || !canRunTest}
        >
          {isRunningTest ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="flash-outline" size={16} color="#FFFFFF" />
              <Text style={styles.buttonText}>运行测试</Text>
            </>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.resetButton, isRunningTest ? styles.disabledButton : null]}
          onPress={onResetRelationships}
          disabled={isRunningTest}
        >
          <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>重置关系</Text>
        </TouchableOpacity>
      </View>
      
      {/* Status Messages */}
      {relationshipEnabledCount < 2 && (
        <Text style={styles.warningText}>
          至少需要两个启用关系系统的角色才能测试
        </Text>
      )}
      
      {!hasApiKey && (
        <Text style={styles.warningText}>
          测试需要有效的API密钥，请在设置中配置
        </Text>
      )}
      
      {/* API Information */}
      <View style={styles.apiInfoContainer}>
        <Text style={styles.apiInfoText}>
          {hasApiKey ? 
            `使用${isOpenRouterEnabled ? 'OpenRouter' : 'Gemini'} API进行测试 (${relationshipEnabledCount}个角色可用)` : 
            '未配置API，请完成设置以启用测试'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderRadius: 8,
    padding: 16,
    margin: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  apiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  openRouterBadge: {
    backgroundColor: '#8E44AD', // Purple for OpenRouter
  },
  geminiBadge: {
    backgroundColor: '#3498DB', // Blue for Gemini
  },
  apiBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  optionsContainer: {
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  optionLabel: {
    color: '#ddd',
    fontSize: 14,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 25,
    textAlign: 'center',
    color: '#fff',
    marginLeft: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  testButton: {
    backgroundColor: '#FF9ECD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    flex: 1,
    marginRight: 8,
  },
  resetButton: {
    backgroundColor: '#FF3B30',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  warningText: {
    color: '#FF9500',
    fontSize: 12,
    marginTop: 8,
  },
  apiInfoContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
  },
  apiInfoText: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default RelationshipTestControls;
