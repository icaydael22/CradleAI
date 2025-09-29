import React, { useState } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { Character } from '@/shared/types';
import Mem0Service from '@/src/memory/services/Mem0Service';
import SettingSection from './SettingSection';
import SettingTextInput from './SettingTextInput';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';

interface BasicSettingsProps {
  character: Character;
  updateCharacter: (character: Character) => Promise<void>;
}

const BasicSettings: React.FC<BasicSettingsProps> = React.memo(({
  character,
  updateCharacter
}) => {
  const [customUserName, setCustomUserName] = useState(character?.customUserName || '');

  const saveCustomUserName = async () => {
    if (character) {
      const updatedCharacter = {
        ...character,
        customUserName: customUserName.trim()
      };
      await updateCharacter(updatedCharacter);
      
      try {
        const mem0Service = Mem0Service.getInstance();
        mem0Service.setCharacterNames(
          character.id,
          customUserName.trim(),
          character.name
        );
        Alert.alert('成功', '角色对你的称呼已更新');
      } catch (error) {
        console.error('Failed to update memory service with custom names:', error);
      }

      // 额外：立即替换当前会话开场白中的 {{user}} 宏并刷新聊天页面
      try {
        const trimmed = (customUserName || '').trim();
        if (trimmed && character.id) {
          const changed = await StorageAdapter.replaceUserMacroInFirstMessage(character.id, trimmed);
          if (changed) {
            DeviceEventEmitter.emit('chatHistoryChanged', { conversationId: character.id });
          }
        }
      } catch (e) {
        console.error('Failed to replace {{user}} in first message:', e);
      }
    }
  };

  return (
    <SettingSection title="基本设置">
      <SettingTextInput
        label="角色对我的称呼"
        value={customUserName}
        onChangeText={setCustomUserName}
        placeholder=""
        showSaveButton
        onSave={saveCustomUserName}
      />
    </SettingSection>
  );
});

export default BasicSettings;
