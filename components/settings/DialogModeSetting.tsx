import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { DialogMode } from '@/constants/DialogModeContext';
import SettingSection from './SettingSection';
import { theme } from '@/constants/theme';

interface DialogModeSettingProps {
  mode: DialogMode;
  onModeChange: (mode: DialogMode) => void;
}

const DialogModeSetting: React.FC<DialogModeSettingProps> = React.memo(({
  mode,
  onModeChange
}) => {
  const modeOptions = [
    {
      value: 'normal' as DialogMode,
      icon: 'chat' as keyof typeof MaterialIcons.glyphMap,
      label: '聊天模式'
    },
    // {
    //   value: 'background-focus' as DialogMode,
    //   icon: 'image' as keyof typeof MaterialIcons.glyphMap,
    //   label: '背景强调'
    // },
    {
      value: 'visual-novel' as DialogMode,
      icon: 'menu-book' as keyof typeof MaterialIcons.glyphMap,
      label: '视觉小说'
    }
  ];

  return (
    <SettingSection title="对话模式">
      {modeOptions.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.modeButton,
            mode === option.value && styles.modeButtonSelected
          ]}
          onPress={() => {
            console.log('[DialogModeSetting] Clicking mode:', option.value);
            onModeChange(option.value);
          }}
        >
          <MaterialIcons 
            name={option.icon} 
            size={24} 
            color={mode === option.value ? "rgb(255, 224, 195)" : "#aaa"} 
          />
          <Text style={[
            styles.modeButtonText,
            mode === option.value && styles.modeButtonTextSelected
          ]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.settingDescription}>
        更改聊天的显示方式。
      </Text>
    </SettingSection>
  );
});

const styles = StyleSheet.create({
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  modeButtonSelected: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 1,
  },
  modeButtonText: {
    fontSize: 16,
    color: '#ddd',
    marginLeft: 10,
  },
  modeButtonTextSelected: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '600',
  },
  settingDescription: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
});

export default DialogModeSetting;
