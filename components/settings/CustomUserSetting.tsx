import React, { useState } from 'react';
import { View, Alert, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Character, UserCustomSetting } from '@/shared/types';
import SettingToggle from './SettingToggle';
import SettingTextInput from './SettingTextInput';
import SettingOptionButtons from './SettingOptionButtons';
import SettingButton from './SettingButton';
import SettingSection from './SettingSection';

interface CustomUserSettingProps {
  character: Character;
  updateCharacter: (character: Character) => Promise<void>;
}

const CustomUserSetting: React.FC<CustomUserSettingProps> = React.memo(({ 
  character, 
  updateCharacter 
}) => {
  const [isEnabled, setIsEnabled] = useState(character?.hasCustomUserSetting || false);
  const [isGlobal, setIsGlobal] = useState(character?.customUserSetting?.global || false);
  const [customSetting, setCustomSetting] = useState<UserCustomSetting>(
    character?.customUserSetting || {
      comment: '自设',
      content: '',
      disable: false,
      position: 4,
      constant: true,
      key: [],
      order: 1,
      depth: 1,
      vectorized: false,
      global: false
    }
  );

  const handleCustomSettingToggle = async () => {
    // optimistic update
    setIsEnabled(prev => !prev);

    try {
      const updatedCharacter = {
        ...character,
        hasCustomUserSetting: !isEnabled
      };

      if (!isEnabled && !character.customUserSetting) {
        updatedCharacter.customUserSetting = customSetting;
      }

      await updateCharacter(updatedCharacter);

      try {
        const characterKey = `character_${character.id}`;
        await AsyncStorage.setItem(characterKey, JSON.stringify(updatedCharacter));
        console.log('Custom user setting toggle persisted to AsyncStorage');
      } catch (storageError) {
        if (storageError instanceof Error && storageError.message.includes('Row too big')) {
          console.warn('Row too big error encountered while toggling, using alternative storage approach');
          const hasCustomSettingKey = `character_${character.id}_has_custom`;
          await AsyncStorage.setItem(hasCustomSettingKey, !isEnabled ? 'true' : 'false');
        } else {
          throw storageError;
        }
      }
    } catch (error) {
      console.error('Error toggling custom setting:', error);
      // rollback
      setIsEnabled(prev => !prev);
      Alert.alert('错误', '无法更新自设设置');
    }
  };

  const handleGlobalToggle = () => {
    const newGlobal = !isGlobal;
    setIsGlobal(newGlobal);
    setCustomSetting({
      ...customSetting,
      global: newGlobal
    });
  };

  const saveCustomSetting = async () => {
    try {
      if (!customSetting.content.trim()) {
        Alert.alert('错误', '自设内容不能为空');
        return;
      }
      
      const updatedCharacter = {
        ...character,
        hasCustomUserSetting: true,
        customUserSetting: {
          ...customSetting,
          global: isGlobal
        }
      };
      
      await updateCharacter(updatedCharacter);
      
      try {
        if (isGlobal) {
          // Save global setting logic here
        }
        
        const characterKey = `character_${character.id}`;
        await AsyncStorage.setItem(characterKey, JSON.stringify(updatedCharacter));
      } catch (storageError) {
        console.error('Failed to save custom setting to AsyncStorage:', storageError);
      }
      
      Alert.alert('成功', '自设已保存');
    } catch (error) {
      console.error('Error saving custom setting:', error);
      Alert.alert('错误', '无法保存自设');
    }
  };

  if (!isEnabled) {
    return (
      <SettingToggle
        label="自设功能"
        value={isEnabled}
        onValueChange={handleCustomSettingToggle}
      />
    );
  }

  const positionOptions = [
    { value: 0, label: '0' },
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' }
  ];

  const depthOptions = [
    { value: 0, label: '0' },
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' }
  ];

  return (
    <SettingSection>
      <SettingToggle
        label="自设功能"
        value={isEnabled}
        onValueChange={handleCustomSettingToggle}
      />
      
      <SettingToggle
        label="全局应用"
        value={isGlobal}
        onValueChange={handleGlobalToggle}
      />
      
      <SettingTextInput
        label="自设标题"
        value={customSetting.comment}
        onChangeText={(text) => setCustomSetting({ ...customSetting, comment: text })}
        placeholder="自设标题，默认为'自设'"
      />
      
      <SettingTextInput
        label="自设内容"
        value={customSetting.content}
        onChangeText={(text) => setCustomSetting({ ...customSetting, content: text })}
        placeholder="输入您对自己的描述和设定"
        multiline
        height={100}
      />
      
      <SettingOptionButtons
        label="插入位置"
        options={positionOptions}
        selectedValue={customSetting.position}
        onValueChange={(value) => setCustomSetting({ ...customSetting, position: value as 0 | 1 | 2 | 3 | 4 })}
        description="推荐选择 4，代表在对话内按深度动态插入"
      />
      
      <SettingOptionButtons
        label="插入深度"
        options={depthOptions}
        selectedValue={customSetting.depth}
        onValueChange={(value) => setCustomSetting({ ...customSetting, depth: value })}
        description="0: 在最新消息后，1: 在上一条用户消息前，2+: 在更早消息前"
      />
      
      <SettingButton
        label="保存自设"
        onPress={saveCustomSetting}
        buttonText="保存自设"
      />
      
      <View style={{ padding: 8 }}>
        <Text style={{ color: '#ccc', fontSize: 12 }}>
          自设是您对自己的描述，会作为D类条目插入对话中。全局应用时，所有角色都将接收到您的自设。
        </Text>
      </View>
    </SettingSection>
  );
});

export default CustomUserSetting;
