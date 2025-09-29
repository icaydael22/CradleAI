import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import { Character } from '@/shared/types';
import { memoryService } from '@/services/memory-service';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { getApiSettings } from '@/utils/settings-helper';
import SettingSection from './SettingSection';
import SettingToggle from './SettingToggle';
import SettingSlider from './SettingSlider';
import SettingButton from './SettingButton';

interface NotificationSettingsProps {
  character: Character;
  updateCharacter: (character: Character) => Promise<void>;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = React.memo(({
  character,
  updateCharacter
}) => {
  const [isMemorySummaryEnabled, setIsMemorySummaryEnabled] = useState(false);
  const [summaryThreshold, setSummaryThreshold] = useState(12000);
  const [summaryLength, setSummaryLength] = useState(1000);
  const [isAutoMessageEnabled, setIsAutoMessageEnabled] = useState(character?.autoMessage === true);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(character?.notificationEnabled === true);
  const [autoMessageInterval, setAutoMessageInterval] = useState<number>(character?.autoMessageInterval || 5);
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    if (character?.id) {
      const loadMemorySettings = async () => {
        try {
          const settings = await memoryService.loadSettings(character.id);
          if (settings) {
            setIsMemorySummaryEnabled(settings.enabled);
            setSummaryThreshold(settings.summaryThreshold);
            setSummaryLength(settings.summaryLength);
          }
        } catch (error) {
          console.error('Error loading memory settings:', error);
        }
      };
      
      loadMemorySettings();
    }
  }, [character?.id]);

  useEffect(() => {
    setIsAutoMessageEnabled(character?.autoMessage === true);
    setIsNotificationEnabled(character?.notificationEnabled === true);
    setAutoMessageInterval(character?.autoMessageInterval || 5);
  }, [character]);

  const handleMemorySummaryToggle = async () => {
    if (character) {
      try {
        // optimistic update
        setIsMemorySummaryEnabled(prev => !prev);

        await memoryService.saveSettings(character.id, {
          enabled: !isMemorySummaryEnabled,
          summaryThreshold,
          summaryLength,
          lastSummarizedAt: 0
        });
      } catch (error) {
        console.error('Error saving memory settings:', error);
        // rollback
        setIsMemorySummaryEnabled(prev => !prev);
        Alert.alert('错误', '无法保存记忆设置');
      }
    }
  };

  const handleAutoMessageToggle = async () => {
    if (character) {
      try {
        const updatedCharacter = { ...character, autoMessage: !isAutoMessageEnabled };

        // optimistic UI
        setIsAutoMessageEnabled(prev => !prev);
        await updateCharacter(updatedCharacter);

        console.log(`Auto messages ${!isAutoMessageEnabled ? 'enabled' : 'disabled'} for ${character.name}`);
      } catch (error) {
        // rollback
        setIsAutoMessageEnabled(prev => !prev);
        console.error('Failed to update auto message setting:', error);
        Alert.alert('Error', 'Failed to update auto message settings');
      }
    }
  };

  const handleAutoMessageIntervalChange = async (value: number) => {
    if (character) {
      setAutoMessageInterval(value);
      const updatedCharacter = {
        ...character,
        autoMessageInterval: value
      };
      await updateCharacter(updatedCharacter);
    }
  };

  const handleNotificationToggle = async () => {
    if (character) {
      const updatedCharacter = { ...character, notificationEnabled: !isNotificationEnabled };

      // optimistic
      setIsNotificationEnabled(prev => !prev);
      try {
        await updateCharacter(updatedCharacter);

        if (isNotificationEnabled) {
          AsyncStorage.setItem('unreadMessagesCount', '0').catch(err => 
            console.error('Failed to reset unread messages count:', err)
          );
          EventRegister.emit('unreadMessagesUpdated', 0);
        }
      } catch (e) {
        console.error('Failed to persist notification toggle:', e);
        setIsNotificationEnabled(prev => !prev);
      }
    }
  };

  const handleSummarizeMemoryNow = async () => {
    if (!character) return;
    setIsSummarizing(true);
    try {
      const apiSettingsObj = getApiSettings();
      const apiKey = apiSettingsObj.apiKey || '';
      const apiSettings = {
        apiProvider: apiSettingsObj.apiProvider as 'gemini' | 'openrouter',
        ...(apiSettingsObj.openrouter ? { openrouter: apiSettingsObj.openrouter } : {})
      };
      const conversationId = character.id;
      
      const result = await NodeSTCore.prototype.summarizeMemoryNow.call(
        NodeSTCore.prototype,
        conversationId,
        character.id,
        apiKey,
        undefined,
        apiSettings
      );
      
      if (result) {
        Alert.alert('成功', '记忆总结已完成');
      } else {
        Alert.alert('失败', '记忆总结失败');
      }
    } catch (e) {
      Alert.alert('错误', e instanceof Error ? e.message : '记忆总结失败');
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <SettingSection title="记忆与通知">
      <SettingToggle
        label="记忆总结"
        value={isMemorySummaryEnabled}
        onValueChange={handleMemorySummaryToggle}
      />

      <SettingButton
        label=""
        onPress={handleSummarizeMemoryNow}
        buttonText={isSummarizing ? '总结中...' : '立即总结'}
      />

      <SettingToggle
        label="主动消息"
        value={isAutoMessageEnabled}
        onValueChange={handleAutoMessageToggle}
      />

      {isAutoMessageEnabled && (
        <SettingSlider
          label="主动消息触发时间"
          value={autoMessageInterval}
          minimumValue={1}
          maximumValue={30}
          step={1}
          onValueChange={setAutoMessageInterval}
          onSlidingComplete={handleAutoMessageIntervalChange}
          unit="分钟"
          minLabel="1分钟"
          maxLabel="30分钟"
        />
      )}

      <SettingToggle
        label="消息提醒"
        value={isNotificationEnabled}
        onValueChange={handleNotificationToggle}
      />
    </SettingSection>
  );
});

export default NotificationSettings;
