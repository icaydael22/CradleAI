import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { EventRegister } from 'react-native-event-listeners';
import { Character } from '@/shared/types';
import SettingSection from './SettingSection';
import SettingToggle from './SettingToggle';
import SettingButton from './SettingButton';

interface VisualSettingsProps {
  character: Character;
  updateCharacter: (character: Character) => Promise<void>;
}

const VisualSettings: React.FC<VisualSettingsProps> = React.memo(({
  character,
  updateCharacter
}) => {
  const [isDynamicPortraitEnabled, setIsDynamicPortraitEnabled] = useState(
    character?.dynamicPortraitEnabled === true
  );
  const [isAutoExtraBgEnabled, setIsAutoExtraBgEnabled] = useState(
    character?.enableAutoExtraBackground === true
  );
  const [isAutoImageEnabled, setIsAutoImageEnabled] = useState(
    character?.autoImageEnabled === true
  );
  const [isCustomImageEnabled, setIsCustomImageEnabled] = useState(
    character?.customImageEnabled === true
  );
  const [isParagraphModeEnabled, setIsParagraphModeEnabled] = useState(
    character?.paragraphModeEnabled === true
  );

  useEffect(() => {
    setIsDynamicPortraitEnabled(character?.dynamicPortraitEnabled === true);
    setIsAutoExtraBgEnabled(character?.enableAutoExtraBackground === true);
    setIsAutoImageEnabled(character?.autoImageEnabled === true);
    setIsCustomImageEnabled(character?.customImageEnabled === true);
    setIsParagraphModeEnabled(character?.paragraphModeEnabled === true);
  }, [character]);

  const handleDynamicPortraitToggle = async () => {
    if (character) {
      const updatedCharacter = {
        ...character,
        dynamicPortraitEnabled: !isDynamicPortraitEnabled
      };
      
      // If enabling but no video selected, open selection flow (can't optimistic-enable without asset)
      if (!isDynamicPortraitEnabled && !character.dynamicPortraitVideo) {
        handleSelectDynamicPortrait();
        return;
      }

      // Optimistic UI update
      setIsDynamicPortraitEnabled(prev => !prev);

      try {
        await updateCharacter(updatedCharacter);
      } catch (e) {
        console.error('Failed to persist dynamic portrait toggle:', e);
        // rollback
        setIsDynamicPortraitEnabled(prev => !prev);
        // notify user
      }
    }
  };

  const handleSelectDynamicPortrait = async () => {
    if (!character) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled === false) {
        const videoUri = result.assets[0].uri;
        
        const updatedCharacter = {
          ...character,
          dynamicPortraitVideo: videoUri,
          dynamicPortraitEnabled: true,
        };
        
        await updateCharacter(updatedCharacter);
        setIsDynamicPortraitEnabled(true);
        Alert.alert('成功', '动态立绘视频已设置');
      }
    } catch (error) {
      console.error("Dynamic portrait selection error:", error);
      Alert.alert('错误', '无法选择动态立绘视频');
    }
  };

  const handleBackgroundChange = async () => {
    if (!character) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const updatedCharacter = {
          ...character,
          chatBackground: result.assets[0].uri,
        };
        
        await updateCharacter(updatedCharacter);
        Alert.alert('成功', '聊天背景已更新');
      }
    } catch (error) {
      console.error("Background update error:", error);
      Alert.alert('错误', '无法更新背景图片');
    }
  };

  const handleAutoExtraBgToggle = async () => {
    if (character) {
      const updatedCharacter = {
        ...character,
        enableAutoExtraBackground: !isAutoExtraBgEnabled
      };
      // optimistic update
      setIsAutoExtraBgEnabled(prev => !prev);
      try {
        await updateCharacter(updatedCharacter);
      } catch (e) {
        console.error('Failed to persist auto extra bg toggle:', e);
        setIsAutoExtraBgEnabled(prev => !prev);
      }
    }
  };

  const handleAutoImageToggle = async () => {
    if (character) {
      const updatedCharacter = {
        ...character,
        autoImageEnabled: !isAutoImageEnabled
      };
      setIsAutoImageEnabled(prev => !prev);
      try {
        await updateCharacter(updatedCharacter);
      } catch (e) {
        console.error('Failed to persist auto image toggle:', e);
        setIsAutoImageEnabled(prev => !prev);
      }
    }
  };

  const handleCustomImageToggle = async () => {
    if (character) {
      const updatedCharacter = {
        ...character,
        customImageEnabled: !isCustomImageEnabled
      };
      setIsCustomImageEnabled(prev => !prev);
      try {
        await updateCharacter(updatedCharacter);
      } catch (e) {
        console.error('Failed to persist custom image toggle:', e);
        setIsCustomImageEnabled(prev => !prev);
      }
    }
  };

  const handleParagraphModeToggle = async () => {
    if (character) {
      const updatedCharacter = {
        ...character,
        paragraphModeEnabled: !isParagraphModeEnabled
      };
      setIsParagraphModeEnabled(prev => !prev);
      try {
        await updateCharacter(updatedCharacter);
        // Emit event to notify other components about the change
        EventRegister.emit('paragraphModeToggled', !isParagraphModeEnabled);
        EventRegister.emit('paragraphModeChanged', !isParagraphModeEnabled);
      } catch (e) {
        console.error('Failed to persist paragraph mode toggle:', e);
        setIsParagraphModeEnabled(prev => !prev);
      }
    }
  };

  return (
    <SettingSection title="视觉设置">
      <SettingToggle
        label="动态立绘"
        value={isDynamicPortraitEnabled}
        onValueChange={handleDynamicPortraitToggle}
      />

      <SettingToggle
        label="自动生成背景"
        value={isAutoExtraBgEnabled}
        onValueChange={handleAutoExtraBgToggle}
      />

      <SettingToggle
        label="自动生成图片"
        value={isAutoImageEnabled}
        onValueChange={handleAutoImageToggle}
      />

      <SettingToggle
        label="自定义生成图片"
        value={isCustomImageEnabled}
        onValueChange={handleCustomImageToggle}
      />

      <SettingToggle
        label="消息分段显示"
        value={isParagraphModeEnabled}
        onValueChange={handleParagraphModeToggle}
        description="将多段落消息分割为多个独立的消息气泡显示，类似手机短聊样式"
      />

      <SettingButton
        label="更换聊天背景"
        onPress={handleBackgroundChange}
        icon="image"
        buttonText="选择聊天背景"
      />
      
      {isDynamicPortraitEnabled && (
        <SettingButton
          label=""
          onPress={handleSelectDynamicPortrait}
          icon="videocam"
          buttonText={character?.dynamicPortraitVideo ? '更换动态立绘' : '选择动态立绘'}
        />
      )}
    </SettingSection>
  );
});

export default VisualSettings;
